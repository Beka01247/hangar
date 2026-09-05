import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export class ClaudeCliError extends Error {}

const EXTRA_BIN_DIRS = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	join(homedir(), ".bun", "bin"),
	join(homedir(), ".npm-global", "bin"),
	join(homedir(), ".local", "bin"),
	join(homedir(), ".claude", "local"),
	join(homedir(), ".volta", "bin"),
];

export function cliEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
	delete env["ANTHROPIC_API_KEY"];
	delete env["ANTHROPIC_AUTH_TOKEN"];
	delete env["CLAUDE_CODE_OAUTH_TOKEN"];
	env["PATH"] = [...EXTRA_BIN_DIRS, env["PATH"] ?? "/usr/bin:/bin"].join(":");
	for (const [k, v] of Object.entries(overrides)) if (v !== undefined) env[k] = v;
	return env;
}

export function findClaudeBinary(): string | null {
	for (const dir of [...EXTRA_BIN_DIRS, ...(process.env["PATH"] ?? "").split(":")]) {
		const candidate = join(dir, "claude");
		if (dir && existsSync(candidate)) return candidate;
	}
	return null;
}

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

async function runClaude(args: string[], env: Record<string, string>, timeoutMs: number): Promise<RunResult> {
	const bin = findClaudeBinary();
	if (!bin) throw new ClaudeCliError("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code");
	const proc = Bun.spawn([bin, ...args], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: homedir() });
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	try {
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { code, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

export async function getCliVersion(): Promise<string | null> {
	try {
		const result = await runClaude(["--version"], cliEnv(), 15_000);
		return result.code === 0 ? result.stdout.trim() : null;
	} catch {
		return null;
	}
}

export type SubscriptionAuth = { kind: "oauth-token"; token: string } | { kind: "cli-login" };

export async function validateSubscriptionAuth(auth: SubscriptionAuth): Promise<void> {
	const env = cliEnv(auth.kind === "oauth-token" ? { CLAUDE_CODE_OAUTH_TOKEN: auth.token } : {});
	const result = await runClaude(["-p", "Reply with the single word OK.", "--output-format", "json", "--max-turns", "1"], env, 90_000);
	const output = `${result.stdout}\n${result.stderr}`.trim();
	const parsed = parseResultJson(result.stdout);
	const failed = result.code !== 0 || parsed?.is_error === true || (parsed !== null && !parsed.result);
	if (!failed) return;
	console.error(`hangar: claude -p check failed (auth: ${auth.kind})`, { code: result.code, stdout: result.stdout, stderr: result.stderr });
	const detail =
		parsed?.result ||
		(Array.isArray(parsed?.errors) ? parsed.errors.map(String).join("; ") : null) ||
		summarizeFailure(result.stderr.trim() || output) ||
		`claude exited with code ${result.code}`;
	throw new ClaudeCliError(detail);
}

interface ResultJson {
	is_error?: boolean;
	result?: string;
	errors?: unknown[];
}

function parseResultJson(stdout: string): ResultJson | null {
	const line = stdout
		.split("\n")
		.reverse()
		.find((l) => l.trim().startsWith("{"));
	if (!line) return null;
	try {
		return JSON.parse(line) as ResultJson;
	} catch {
		return null;
	}
}

function summarizeFailure(output: string): string | null {
	const lower = output.toLowerCase();
	if (lower.includes("not logged in") || lower.includes("please run /login") || lower.includes("invalid api key") || lower.includes("authentication")) {
		return "Claude Code is not authenticated. Run `claude setup-token` and paste the token, or log in with `claude` first.";
	}
	if (lower.includes("rate limit") || lower.includes("usage limit")) {
		return "Subscription usage limit reached right now; the token itself looks valid.";
	}
	const firstLine = output.split("\n").find((l) => l.trim());
	return firstLine ? firstLine.slice(0, 300) : null;
}
