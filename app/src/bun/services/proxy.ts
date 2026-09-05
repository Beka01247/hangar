import type { ScopedToken, TokenScope } from "../../shared/types";
import { getSecret } from "../secrets/keychain";
import { settingsStore } from "../store/settings";
import { resolveToken } from "../store/tokens";
import { usageStore } from "../store/usage";
import { estimateCostUsd } from "./pricing";

const UPSTREAMS: Record<string, { base: string; scope: TokenScope }> = {
	github: { base: "https://api.github.com", scope: "github" },
	anthropic: { base: "https://api.anthropic.com", scope: "claude" },
};

const HOP_HEADERS = ["host", "connection", "content-length", "authorization", "x-api-key", "x-hangar-token"];

let server: ReturnType<typeof Bun.serve> | null = null;

export function proxyUrl(): string {
	if (!server) throw new Error("Token proxy is not running");
	return `http://127.0.0.1:${server.port}`;
}

export function startProxy(): string {
	if (server) return proxyUrl();
	server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		idleTimeout: 255,
		fetch: handle,
	});
	console.log(`hangar: token proxy listening on ${proxyUrl()}`);
	return proxyUrl();
}

function deny(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "hangar_proxy", message } }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function bearerFrom(request: Request): string | null {
	const auth = request.headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
	return request.headers.get("x-api-key") ?? request.headers.get("x-hangar-token");
}

async function upstreamAuth(name: string): Promise<Record<string, string>> {
	if (name === "github") {
		const token = await getSecret("github-token");
		if (!token) throw new Error("GitHub is not connected in Hangar");
		return { Authorization: `Bearer ${token}` };
	}
	const settings = await settingsStore.read();
	if (settings.claudeAuthMode !== "api-key") {
		throw new Error("Direct Claude API access needs an API key in Hangar; subscription mode only runs skills through the Agent SDK");
	}
	const key = await getSecret("claude-api-key");
	if (!key) throw new Error("Claude API key is missing from the keychain");
	return { "x-api-key": key };
}

async function handle(request: Request): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/health") return new Response("ok");

	const [, upstreamName, ...rest] = url.pathname.split("/");
	const upstream = upstreamName ? UPSTREAMS[upstreamName] : undefined;
	if (!upstream) return deny(404, "Unknown upstream; use /github/... or /anthropic/...");

	const bearer = bearerFrom(request);
	const token = bearer ? await resolveToken(bearer) : null;
	if (!token) return deny(401, "Missing or revoked Hangar skill token");
	if (!token.allowedScopes.includes(upstream.scope)) {
		return deny(403, `Access to ${upstreamName} was not granted to this skill (revoke/grant it in Hangar)`);
	}

	let auth: Record<string, string>;
	try {
		auth = await upstreamAuth(upstreamName!);
	} catch (error) {
		return deny(502, (error as Error).message);
	}

	const headers = new Headers();
	request.headers.forEach((value, key) => {
		if (!HOP_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
	});
	for (const [k, v] of Object.entries(auth)) headers.set(k, v);
	if (upstreamName === "anthropic" && !headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
	if (upstreamName === "github" && !headers.has("user-agent")) headers.set("user-agent", "hangar-desktop");

	const target = `${upstream.base}/${rest.join("/")}${url.search}`;
	const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
	let response: Response;
	try {
		response = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
	} catch (error) {
		return deny(502, `Upstream request failed: ${(error as Error).message}`);
	}

	if (upstreamName === "anthropic") return recordAnthropicUsage(token, response, rest.join("/"));
	return passthrough(response);
}

function passthrough(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.delete("content-encoding");
	headers.delete("content-length");
	return new Response(response.body, { status: response.status, headers });
}

async function recordAnthropicUsage(token: ScopedToken, response: Response, path: string): Promise<Response> {
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.ok || !contentType.includes("application/json")) return passthrough(response);
	const text = await response.text();
	try {
		const json = JSON.parse(text) as { model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
		const input = json.usage?.input_tokens ?? 0;
		const output = json.usage?.output_tokens ?? 0;
		if (input + output > 0) {
			await usageStore.update((log) => {
				log.usage.push({
					skillId: token.skillId,
					tokens: input + output,
					costUsd: estimateCostUsd(json.model ?? "", input, output),
					timestamp: new Date().toISOString(),
					action: `${json.model ?? "claude"} via ${path}`,
				});
			});
		}
	} catch {}
	const headers = new Headers(response.headers);
	headers.delete("content-encoding");
	headers.delete("content-length");
	return new Response(text, { status: response.status, headers });
}
