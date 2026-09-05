import { Utils } from "electrobun/main";
import { GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_SCOPES } from "../../shared/config";
import type { GitHubLoginProgress } from "../../shared/types";
import { GitHubAuthError } from "./github";

interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

interface TokenResponse {
	access_token?: string;
	error?: string;
	interval?: number;
}

const HEADERS = { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "hangar-desktop" };

let cancelled = false;

export function isGitHubDeviceFlowAvailable(): boolean {
	return GITHUB_OAUTH_CLIENT_ID.length > 0;
}

export function cancelGitHubDeviceFlow(): void {
	cancelled = true;
}

export async function runGitHubDeviceFlow(onProgress: (p: GitHubLoginProgress) => void): Promise<string> {
	if (!isGitHubDeviceFlowAvailable()) throw new GitHubAuthError("GitHub one-click login is not configured");
	cancelled = false;
	onProgress({ phase: "started" });

	const codeResponse = await fetch("https://github.com/login/device/code", {
		method: "POST",
		headers: HEADERS,
		body: JSON.stringify({ client_id: GITHUB_OAUTH_CLIENT_ID, scope: GITHUB_OAUTH_SCOPES }),
	});
	if (!codeResponse.ok) throw new GitHubAuthError(`GitHub returned HTTP ${codeResponse.status} for device code`);
	const code = (await codeResponse.json()) as DeviceCodeResponse;

	Utils.clipboardWriteText(code.user_code);
	Utils.openExternal(code.verification_uri);
	onProgress({ phase: "code", userCode: code.user_code, url: code.verification_uri });

	const deadline = Date.now() + code.expires_in * 1000;
	let intervalMs = Math.max(code.interval, 5) * 1000;
	while (Date.now() < deadline) {
		await Bun.sleep(intervalMs);
		if (cancelled) throw new GitHubAuthError("Login cancelled");
		const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: HEADERS,
			body: JSON.stringify({
				client_id: GITHUB_OAUTH_CLIENT_ID,
				device_code: code.device_code,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		});
		const token = (await tokenResponse.json()) as TokenResponse;
		if (token.access_token) return token.access_token;
		switch (token.error) {
			case "authorization_pending":
				continue;
			case "slow_down":
				intervalMs = ((token.interval ?? code.interval) + 5) * 1000;
				continue;
			case "expired_token":
				throw new GitHubAuthError("The code expired before it was entered. Try again.");
			case "access_denied":
				throw new GitHubAuthError("Access was denied in the browser.");
			default:
				throw new GitHubAuthError(`GitHub login failed: ${token.error ?? "unknown error"}`);
		}
	}
	throw new GitHubAuthError("The code expired before it was entered. Try again.");
}

export async function tokenFromGitHubCli(): Promise<string> {
	const candidates = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"];
	for (const bin of candidates) {
		try {
			const proc = Bun.spawn([bin, "auth", "token"], { stdout: "pipe", stderr: "pipe" });
			const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
			if (code === 0 && stdout.trim()) return stdout.trim();
			if (code !== 0) throw new GitHubAuthError("GitHub CLI is installed but not logged in. Run `gh auth login` first.");
		} catch (error) {
			if (error instanceof GitHubAuthError) throw error;
		}
	}
	throw new GitHubAuthError("GitHub CLI (gh) not found. Install it with `brew install gh` or use a token.");
}
