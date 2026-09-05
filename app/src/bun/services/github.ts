import type { GitHubAccount } from "../../shared/types";

const API_BASE = "https://api.github.com";

export class GitHubAuthError extends Error {}

export function githubHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "hangar-desktop",
	};
}

export async function fetchGitHubAccount(token: string): Promise<GitHubAccount> {
	let response: Response;
	try {
		response = await fetch(`${API_BASE}/user`, { headers: githubHeaders(token.trim()) });
	} catch (error) {
		throw new GitHubAuthError(`Could not reach api.github.com: ${(error as Error).message}`);
	}
	if (response.status === 401) throw new GitHubAuthError("GitHub rejected this token");
	if (!response.ok) throw new GitHubAuthError(`GitHub returned HTTP ${response.status}`);
	const user = (await response.json()) as { login: string; name: string | null; avatar_url: string };
	const scopes = (response.headers.get("x-oauth-scopes") ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return { login: user.login, name: user.name, avatarUrl: user.avatar_url, scopes };
}

export interface RepoMeta {
	fullName: string;
	description: string | null;
	stars: number;
	pushedAt: string;
	defaultBranch: string;
	ownerLogin: string;
	ownerType: string;
	license: string | null;
	isPrivate: boolean;
	htmlUrl: string;
	latestCommitSha: string | null;
	latestCommitDate: string | null;
}

function publicHeaders(): Record<string, string> {
	return { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "hangar-desktop" };
}

export async function fetchRepoMeta(owner: string, name: string, ref: string | null, token: string | null): Promise<RepoMeta> {
	const headers = token ? githubHeaders(token) : publicHeaders();
	const repoResponse = await fetch(`${API_BASE}/repos/${owner}/${name}`, { headers });
	if (repoResponse.status === 404) throw new GitHubAuthError("Repository not found (or private and the connected account cannot see it)");
	if (!repoResponse.ok) throw new GitHubAuthError(`GitHub returned HTTP ${repoResponse.status} for the repository`);
	const repo = (await repoResponse.json()) as any;

	let latestCommitSha: string | null = null;
	let latestCommitDate: string | null = null;
	const commitResponse = await fetch(`${API_BASE}/repos/${owner}/${name}/commits/${encodeURIComponent(ref ?? repo.default_branch)}`, { headers });
	if (commitResponse.ok) {
		const commit = (await commitResponse.json()) as any;
		latestCommitSha = commit.sha ?? null;
		latestCommitDate = commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null;
	}

	return {
		fullName: repo.full_name,
		description: repo.description ?? null,
		stars: repo.stargazers_count ?? 0,
		pushedAt: repo.pushed_at,
		defaultBranch: repo.default_branch,
		ownerLogin: repo.owner?.login ?? owner,
		ownerType: repo.owner?.type ?? "User",
		license: repo.license?.spdx_id ?? null,
		isPrivate: Boolean(repo.private),
		htmlUrl: repo.html_url,
		latestCommitSha,
		latestCommitDate,
	};
}
