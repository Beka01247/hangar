import type { StoreResult, StoreSort } from "../../shared/types";
import { getSecret } from "../secrets/keychain";
import { skillsStore } from "../store/skills";
import { GitHubAuthError, githubHeaders } from "./github";
import { skillIdFor } from "./install/repo-url";

const API = "https://api.github.com";
const TOPICS = ["claude-skill", "agent-skill", "claude-plugin", "agent-plugin", "claude-code", "mcp-server"];
const MANIFEST_RE = /(^|\/)(SKILL\.md|plugin\.json)$/;
const MAX_DEPTH = 3;
const MAX_CANDIDATES = 40;

interface CodeHit {
	path: string;
	repository: { full_name: string };
}

async function githubJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
	const response = await fetch(url, { headers });
	if (response.status === 403 || response.status === 429) throw new GitHubAuthError("GitHub search rate limit reached — try again in a minute");
	if (response.status === 401) throw new GitHubAuthError("GitHub search needs a connected GitHub account");
	if (response.status === 404 || response.status === 409) return null;
	if (!response.ok) throw new GitHubAuthError(`GitHub returned HTTP ${response.status}`);
	return (await response.json()) as T;
}

async function topicCandidates(query: string, headers: Record<string, string>): Promise<Map<string, any>> {
	const found = new Map<string, any>();
	await Promise.all(
		TOPICS.map(async (topic) => {
			const q = query.trim() ? `${query.trim()} topic:${topic}` : `topic:${topic}`;
			const params = new URLSearchParams({ q, sort: "stars", order: "desc", per_page: "20" });
			const result = await githubJson<{ items: any[] }>(`${API}/search/repositories?${params}`, headers);
			for (const repo of result?.items ?? []) if (!found.has(repo.full_name)) found.set(repo.full_name, repo);
		}),
	);
	return found;
}

async function codeCandidates(query: string, headers: Record<string, string>): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	await Promise.all(
		["SKILL.md", "plugin.json"].map(async (file) => {
			const term = query.trim() || file.split(".")[0]!;
			const params = new URLSearchParams({ q: `${term} filename:${file}`, per_page: "50" });
			const result = await githubJson<{ items: CodeHit[] }>(`${API}/search/code?${params}`, headers);
			for (const hit of result?.items ?? []) {
				if (!MANIFEST_RE.test(hit.path) || hit.path.split("/").length > MAX_DEPTH + 1) continue;
				const known = found.get(hit.repository.full_name);
				if (known === undefined || hit.path.length < known.length) found.set(hit.repository.full_name, hit.path);
			}
		}),
	);
	return found;
}

interface TreeEntry {
	path: string;
	type: string;
	sha: string;
}

async function listTree(repo: any, ref: string, headers: Record<string, string>): Promise<TreeEntry[]> {
	const tree = await githubJson<{ tree: TreeEntry[] }>(`${API}/repos/${repo.full_name}/git/trees/${encodeURIComponent(ref)}`, headers);
	return tree?.tree ?? [];
}

async function manifestInTree(repo: any, headers: Record<string, string>): Promise<string | null> {
	const root = await listTree(repo, repo.default_branch, headers);
	const rootFile = (name: string) => root.find((e) => e.type === "blob" && e.path === name);
	if (rootFile("SKILL.md")) return "SKILL.md";
	if (rootFile("plugin.json")) return "plugin.json";
	const claudeDir = root.find((e) => e.type === "tree" && e.path === ".claude");
	if (claudeDir) {
		const inside = await listTree(repo, claudeDir.sha, headers);
		if (inside.some((e) => e.type === "blob" && e.path === "plugin.json")) return ".claude-plugin/plugin.json";
		if (inside.some((e) => e.type === "tree" && (e.path === "commands" || e.path === "skills"))) return ".claude/commands";
	}
	const pluginDir = root.find((e) => e.type === "tree" && e.path === ".claude-plugin");
	if (pluginDir) {
		const inside = await listTree(repo, pluginDir.sha, headers);
		if (inside.some((e) => e.path === "plugin.json")) return ".claude-plugin/plugin.json";
	}
	const skillsDir = root.find((e) => e.type === "tree" && e.path === "skills");
	if (skillsDir) {
		const inside = await listTree(repo, skillsDir.sha, headers);
		const first = inside.find((e) => e.type === "tree");
		if (first) {
			const files = await listTree(repo, first.sha, headers);
			if (files.some((e) => e.path === "SKILL.md")) return `skills/${first.path}/SKILL.md`;
		}
	}
	return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]!);
			}
		}),
	);
	return results;
}

async function fetchRepos(fullNames: string[], headers: Record<string, string>): Promise<any[]> {
	const items: any[] = [];
	for (let i = 0; i < fullNames.length; i += 30) {
		const q = fullNames.slice(i, i + 30).map((n) => `repo:${n}`).join(" ");
		const result = await githubJson<{ items: any[] }>(`${API}/search/repositories?${new URLSearchParams({ q, per_page: "30" })}`, headers);
		items.push(...(result?.items ?? []));
	}
	return items;
}

export async function searchStore(query: string, sort: StoreSort): Promise<StoreResult[]> {
	const token = await getSecret("github-token");
	if (!token) throw new GitHubAuthError("Connect GitHub to search the store");
	const headers = githubHeaders(token);

	const [byTopic, byCode] = await Promise.all([topicCandidates(query, headers), codeCandidates(query, headers)]);
	const missingMeta = [...byCode.keys()].filter((name) => !byTopic.has(name));
	for (const repo of await fetchRepos(missingMeta, headers)) byTopic.set(repo.full_name, repo);

	const candidates = [...byTopic.values()].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)).slice(0, MAX_CANDIDATES);
	const verified = await mapLimit(candidates, 6, async (repo) => {
		try {
			const manifestPath = byCode.get(repo.full_name) ?? (await manifestInTree(repo, headers));
			return manifestPath ? { repo, manifestPath } : null;
		} catch (error) {
			console.warn(`hangar: store check failed for ${repo.full_name}: ${(error as Error).message}`);
			return null;
		}
	});
	const registry = await skillsStore.read();
	const results = verified.filter((v): v is { repo: any; manifestPath: string } => v !== null);
	if (sort === "updated") results.sort((a, b) => String(b.repo.pushed_at).localeCompare(String(a.repo.pushed_at)));

	return results.map(({ repo, manifestPath }) => {
		const subdir = MANIFEST_RE.test(manifestPath) && manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/")) : null;
		const owner = repo.owner?.login ?? "";
		return {
			fullName: repo.full_name,
			htmlUrl: repo.html_url,
			installUrl: subdir ? `${repo.html_url}/tree/${repo.default_branch}/${subdir}` : repo.html_url,
			manifestPath,
			description: repo.description ?? "",
			stars: repo.stargazers_count ?? 0,
			pushedAt: repo.pushed_at,
			topics: repo.topics ?? [],
			ownerLogin: owner,
			language: repo.language ?? null,
			installed: skillIdFor({ owner, name: repo.name, ref: null, subdir, httpsUrl: "", htmlUrl: "" }) in registry.installed,
		};
	});
}
