import { existsSync } from "node:fs";
import type { Permission, UpdateCheck } from "../../../shared/types";
import { getSecret } from "../../secrets/keychain";
import { skillsStore } from "../../store/skills";
import { issueToken, scopesFromPermissions, tokenForSkill } from "../../store/tokens";
import { githubHeaders } from "../github";
import { stopSkill } from "../runtime/manager";
import { analyzePermissions } from "./analyzer";
import { headCommit, runGit } from "./git";
import { discardInspection, inspectRepo } from "./installer";
import { parseManifest } from "./manifest-parser";
import { parseRepoUrl } from "./repo-url";

const MANIFEST_FILE_RE = /(^|\/)(SKILL\.md|plugin\.json|CLAUDE\.md|mcp\.json|\.mcp\.json|package\.json|requirements\.txt|pyproject\.toml)$|^\.claude\/(commands|skills)\//;

export async function checkSkillUpdate(skillId: string): Promise<UpdateCheck> {
	const registry = await skillsStore.read();
	const skill = registry.skills[skillId];
	const installed = registry.installed[skillId];
	if (!skill || !installed) throw new Error("Skill is not installed");
	const repo = parseRepoUrl(skill.repoUrl);
	const token = await getSecret("github-token");
	const headers = token ? githubHeaders(token) : { Accept: "application/vnd.github+json", "User-Agent": "hangar-desktop" };

	const repoInfo = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, { headers });
	if (!repoInfo.ok) throw new Error(`GitHub returned HTTP ${repoInfo.status}`);
	const branch = repo.ref ?? ((await repoInfo.json()) as { default_branch: string }).default_branch;
	const compare = await fetch(
		`https://api.github.com/repos/${repo.owner}/${repo.name}/compare/${installed.commitHash}...${encodeURIComponent(branch)}`,
		{ headers },
	);
	if (!compare.ok) throw new Error(`Could not compare commits (HTTP ${compare.status})`);
	const diff = (await compare.json()) as {
		ahead_by: number;
		commits: { sha: string; commit: { committer: { date: string } } }[];
		files?: { filename: string }[];
	};
	const latest = diff.commits.at(-1);
	const subdirPrefix = repo.subdir ? `${repo.subdir}/` : "";
	const changedFiles = (diff.files ?? []).map((f) => f.filename).filter((f) => !subdirPrefix || f.startsWith(subdirPrefix));
	const manifestChanged = changedFiles.some((f) => MANIFEST_FILE_RE.test(f.slice(subdirPrefix.length)));

	await skillsStore.update((r) => {
		const s = r.skills[skillId];
		if (s) s.lastChecked = new Date().toISOString();
		const i = r.installed[skillId];
		if (i) i.updateAvailable = diff.ahead_by > 0 && latest ? { sha: latest.sha, manifestChanged } : null;
	});

	let newPermissions: Permission[] = [];
	if (manifestChanged) {
		const inspection = await inspectRepo(skill.repoUrl);
		newPermissions = inspection.permissions;
		discardInspection(inspection.inspectionId);
	}

	return {
		skillId,
		upToDate: diff.ahead_by === 0,
		commitsBehind: diff.ahead_by,
		latestSha: latest?.sha ?? installed.commitHash,
		latestDate: latest?.commit.committer.date ?? null,
		manifestChanged,
		changedFiles: changedFiles.slice(0, 50),
		newPermissions,
	};
}

async function pullInPlace(localPath: string, repoRoot: string): Promise<string> {
	const status = await runGit(["-C", repoRoot, "status", "--porcelain"]);
	const dirty = status.stdout.trim().length > 0;
	if (dirty) await runGit(["-C", repoRoot, "stash", "push", "--include-untracked", "-m", "hangar-update"], true);
	try {
		await runGit(["-C", repoRoot, "fetch", "--depth", "1", "origin"], true);
		await runGit(["-C", repoRoot, "reset", "--hard", "FETCH_HEAD"], true);
	} finally {
		if (dirty) {
			const pop = await runGit(["-C", repoRoot, "stash", "pop"]);
			if (pop.code !== 0) throw new Error(`Updated, but your local changes conflict with the new version. Resolve them in ${repoRoot} (git stash list).`);
		}
	}
	if (!existsSync(localPath)) throw new Error("The skill folder disappeared after update");
	return headCommit(repoRoot);
}

export async function applySkillUpdate(skillId: string): Promise<{ commitHash: string; permissions: Permission[] }> {
	const registry = await skillsStore.read();
	const skill = registry.skills[skillId];
	const installed = registry.installed[skillId];
	if (!skill || !installed) throw new Error("Skill is not installed");
	stopSkill(skillId);

	const repo = parseRepoUrl(skill.repoUrl);
	const repoRoot = repo.subdir ? installed.localPath.slice(0, installed.localPath.length - repo.subdir.length - 1) : installed.localPath;
	const commitHash = await pullInPlace(installed.localPath, repoRoot);
	const manifest = await parseManifest(installed.localPath);
	const permissions = analyzePermissions(manifest);

	const existing = await tokenForSkill(skillId);
	const scopes = new Set([...(existing?.allowedScopes ?? []), ...scopesFromPermissions(permissions)]);
	await issueToken(skillId, [...scopes]);

	await skillsStore.update((r) => {
		const i = r.installed[skillId];
		if (i) {
			i.commitHash = commitHash;
			i.updateAvailable = null;
			i.status = manifest.mcpServers.length > 0 || manifest.commands.length > 0 ? "ready" : "no-ui";
		}
		const s = r.skills[skillId];
		if (s) {
			s.commands = manifest.commands;
			s.mcpServers = manifest.mcpServers;
			s.envVars = permissions.filter((p) => p.type === "env").map((p) => p.scope);
			s.manifestType = manifest.format;
			s.lastChecked = new Date().toISOString();
		}
	});
	return { commitHash, permissions };
}
