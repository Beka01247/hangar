import { existsSync } from "node:fs";
import type { RepoRef } from "./repo-url";

export class GitError extends Error {}

function findGit(): string {
	for (const candidate of ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"]) {
		if (existsSync(candidate)) return candidate;
	}
	return "git";
}

export async function shallowClone(repo: RepoRef, dest: string, token: string | null, onLine?: (line: string) => void): Promise<void> {
	const args = ["clone", "--depth", "1", "--single-branch", "--no-tags"];
	if (repo.ref) args.push("--branch", repo.ref);
	if (token) {
		const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
		args.unshift("-c", `http.https://github.com/.extraheader=Authorization: Basic ${basic}`);
	}
	args.push(repo.httpsUrl, dest);

	const proc = Bun.spawn([findGit(), ...args], {
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/false" },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	for (const line of `${stdout}\n${stderr}`.split("\n")) if (line.trim()) onLine?.(line.trim());
	if (code !== 0) {
		const detail = stderr.replace(/Authorization: Basic \S+/g, "Authorization: [redacted]").trim().split("\n").pop() ?? "";
		throw new GitError(`git clone failed: ${detail || `exit code ${code}`}`);
	}
}

export async function headCommit(dir: string): Promise<string> {
	const proc = Bun.spawn([findGit(), "-C", dir, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
	const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (code !== 0) throw new GitError("Could not read HEAD commit");
	return stdout.trim();
}
