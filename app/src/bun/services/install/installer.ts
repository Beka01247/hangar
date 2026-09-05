import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { InstallProgress, RepoInspection, Skill } from "../../../shared/types";
import { getSecret } from "../../secrets/keychain";
import { DATA_DIR } from "../../store/json-store";
import { skillsStore } from "../../store/skills";
import { issueToken, revokeTokens, scopesFromPermissions } from "../../store/tokens";
import { fetchRepoMeta } from "../github";
import { stopSkill } from "../runtime/manager";
import { deleteSkillEnv } from "../runtime/skill-env";
import { analyzePermissions } from "./analyzer";
import { headCommit, shallowClone } from "./git";
import { parseManifest, type ParsedManifest } from "./manifest-parser";
import { parseRepoUrl, skillIdFor, type RepoRef } from "./repo-url";

export const SKILLS_DIR = join(DATA_DIR, "skills");
const TMP_DIR = join(DATA_DIR, "tmp");

interface PendingInspection {
	result: RepoInspection;
	repo: RepoRef;
	manifest: ParsedManifest;
	clonePath: string;
	skillRoot: string;
	commitHash: string;
}

const pending = new Map<string, PendingInspection>();

export async function inspectRepo(url: string): Promise<RepoInspection> {
	const repo = parseRepoUrl(url);
	const token = await getSecret("github-token");
	const meta = await fetchRepoMeta(repo.owner, repo.name, repo.ref, token);

	mkdirSync(TMP_DIR, { recursive: true });
	const inspectionId = crypto.randomUUID();
	const clonePath = join(TMP_DIR, inspectionId);
	await shallowClone(repo, clonePath, meta.isPrivate ? token : null);
	const skillRoot = repo.subdir ? join(clonePath, repo.subdir) : clonePath;
	if (!existsSync(skillRoot)) {
		rmSync(clonePath, { recursive: true, force: true });
		throw new Error(`Folder ${repo.subdir} does not exist in this repository`);
	}

	let manifest: ParsedManifest;
	try {
		manifest = await parseManifest(skillRoot);
	} catch (error) {
		rmSync(clonePath, { recursive: true, force: true });
		throw error;
	}
	const commitHash = await headCommit(clonePath);
	const skillId = skillIdFor(repo);
	const registry = await skillsStore.read();

	const readmeRel = manifest.readmePath ? manifest.readmePath.slice(skillRoot.length + 1) : manifest.format === "SKILL.md" ? manifest.entryPoint : null;
	const branch = repo.ref ?? meta.defaultBranch;
	const isProject = manifest.format === "claude-project";
	const result: RepoInspection = {
		inspectionId,
		repoUrl: repo.htmlUrl,
		htmlUrl: repo.htmlUrl,
		readmeUrl: readmeRel ? `${repo.htmlUrl}/blob/${branch}/${repo.subdir ? `${repo.subdir}/` : ""}${readmeRel}` : null,
		skillId,
		alreadyInstalled: skillId in registry.installed,
		name: isProject ? repo.name : manifest.name,
		description: isProject ? meta.description || manifest.description : manifest.description || meta.description || "",
		manifestType: manifest.format,
		entryPoint: manifest.entryPoint,
		commands: manifest.commands,
		permissions: analyzePermissions(manifest),
		mcpServers: manifest.mcpServers.map((s) => ({ name: s.name, type: s.type, target: s.url ?? s.command ?? "" })),
		dependencies: manifest.dependencies,
		meta: {
			stars: meta.stars,
			ownerLogin: meta.ownerLogin,
			ownerType: meta.ownerType,
			license: meta.license,
			isPrivate: meta.isPrivate,
			latestCommitDate: meta.latestCommitDate,
			latestCommitSha: meta.latestCommitSha,
			pushedAt: meta.pushedAt,
		},
	};
	pending.set(inspectionId, { result, repo, manifest, clonePath, skillRoot, commitHash });
	return result;
}

export function discardInspection(inspectionId: string): void {
	const item = pending.get(inspectionId);
	if (!item) return;
	pending.delete(inspectionId);
	rmSync(item.clonePath, { recursive: true, force: true });
}

type Progress = (p: InstallProgress) => void;

async function runLogged(cmd: string[], cwd: string, report: (line: string) => void, timeoutMs = 10 * 60_000): Promise<void> {
	const proc = Bun.spawn(cmd, {
		cwd,
		env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env["PATH"] ?? "/usr/bin:/bin"}`, CI: "1" },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const pump = async (stream: ReadableStream<Uint8Array>) => {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let rest = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			rest += decoder.decode(value, { stream: true });
			const lines = rest.split("\n");
			rest = lines.pop() ?? "";
			for (const line of lines) if (line.trim()) report(line.trim());
		}
		if (rest.trim()) report(rest.trim());
	};
	await Promise.all([pump(proc.stdout as ReadableStream<Uint8Array>), pump(proc.stderr as ReadableStream<Uint8Array>)]);
	const code = await proc.exited;
	clearTimeout(timer);
	if (code !== 0) throw new Error(`${cmd[0]} ${cmd[1] ?? ""} failed with exit code ${code}`);
}

function findBinary(names: string[]): string | null {
	const dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", join(process.env["HOME"] ?? "", ".bun", "bin"), ...(process.env["PATH"] ?? "").split(":")];
	for (const name of names) for (const dir of dirs) if (dir && existsSync(join(dir, name))) return join(dir, name);
	return null;
}

async function installDependencies(root: string, manifest: ParsedManifest, line: (l: string) => void): Promise<void> {
	if (manifest.dependencies.node) {
		const npm = findBinary(["npm"]);
		const bun = findBinary(["bun"]);
		if (npm) await runLogged([npm, "install", "--no-audit", "--no-fund", "--loglevel=error"], root, line);
		else if (bun) await runLogged([bun, "install"], root, line);
		else throw new Error("Neither npm nor bun found to install Node dependencies");
	}
	if (manifest.dependencies.python) {
		const python = findBinary(["python3"]);
		if (!python) throw new Error("python3 not found to create a virtual environment");
		const venv = join(root, ".venv");
		await runLogged([python, "-m", "venv", venv], root, line);
		const pip = join(venv, "bin", "pip");
		if (existsSync(join(root, "requirements.txt"))) await runLogged([pip, "install", "-r", "requirements.txt"], root, line);
		else if (existsSync(join(root, "pyproject.toml"))) await runLogged([pip, "install", "."], root, line);
	}
}

export async function installSkill(inspectionId: string, progress: Progress): Promise<void> {
	const item = pending.get(inspectionId);
	if (!item) throw new Error("This inspection expired — paste the URL again");
	const report = (phase: InstallProgress["phase"], message?: string, line?: string) => progress({ inspectionId, phase, message, line });

	try {
		report("preparing", "Moving files into place");
		mkdirSync(SKILLS_DIR, { recursive: true });
		const target = join(SKILLS_DIR, item.result.skillId);
		rmSync(target, { recursive: true, force: true });
		renameSync(item.clonePath, target);
		const skillRoot = item.repo.subdir ? join(target, item.repo.subdir) : target;

		report("dependencies", item.manifest.dependencies.node || item.manifest.dependencies.python ? "Installing dependencies into the skill folder" : "No dependencies to install");
		await installDependencies(skillRoot, item.manifest, (line) => report("dependencies", undefined, line));

		report("registering", "Issuing a scoped token and adding to library");
		await issueToken(item.result.skillId, scopesFromPermissions(item.result.permissions));
		const skill: Skill = {
			id: item.result.skillId,
			repoUrl: item.result.repoUrl,
			repoOwner: item.repo.owner,
			repoName: item.repo.name,
			name: item.result.name,
			description: item.result.description,
			manifestType: item.result.manifestType,
			commands: item.result.commands,
			mcpServers: item.manifest.mcpServers,
			envVars: item.result.permissions.filter((p) => p.type === "env").map((p) => p.scope),
			lastChecked: new Date().toISOString(),
		};
		await skillsStore.update((registry) => {
			registry.skills[skill.id] = skill;
			registry.installed[skill.id] = {
				skillId: skill.id,
				installedAt: new Date().toISOString(),
				localPath: skillRoot,
				commitHash: item.commitHash,
				status: item.manifest.mcpServers.length > 0 || item.manifest.commands.length > 0 ? "ready" : "no-ui",
			};
		});
		pending.delete(inspectionId);
		report("done", "Installed");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		report("error", message);
		throw error;
	}
}

export async function uninstallSkill(skillId: string): Promise<void> {
	stopSkill(skillId);
	await deleteSkillEnv(skillId);
	await revokeTokens(skillId);
	await skillsStore.update((registry) => {
		delete registry.installed[skillId];
		delete registry.skills[skillId];
	});
	rmSync(join(SKILLS_DIR, skillId), { recursive: true, force: true });
	rmSync(join(DATA_DIR, "workspaces", skillId), { recursive: true, force: true });
}
