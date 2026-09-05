import type { Permission } from "../../../shared/types";
import type { ParsedManifest } from "./manifest-parser";

const ENV_RE = /\b([A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIALS|DSN|URL))\b/g;
const NETWORK_TOOLS = ["WebFetch", "WebSearch", "Bash", "curl", "fetch"];
const FS_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"];
const NETWORK_DEPS = ["axios", "node-fetch", "got", "undici", "requests", "httpx", "aiohttp", "openai", "anthropic", "@anthropic-ai/sdk", "playwright", "puppeteer"];

export function analyzePermissions(manifest: ParsedManifest): Permission[] {
	const permissions = new Map<string, Permission>();
	const add = (type: Permission["type"], scope: string) => {
		const key = `${type}:${scope}`;
		if (!permissions.has(key)) permissions.set(key, { type, scope, granted: true });
	};

	const allText = Object.values(manifest.rawFiles).join("\n");
	for (const match of allText.matchAll(ENV_RE)) {
		const name = match[1]!;
		if (name === "ANTHROPIC_API_KEY" || name === "CLAUDE_CODE_OAUTH_TOKEN") add("claude", name);
		else if (name.startsWith("GITHUB_") || name.startsWith("GH_")) add("github", name);
		else add("env", name);
	}

	for (const server of manifest.mcpServers) {
		if (server.url) add("network", new URL(server.url).host);
		for (const [key, value] of Object.entries(server.env)) {
			const ref = value.match(/\$\{?([A-Z][A-Z0-9_]+)\}?/)?.[1] ?? key;
			add("env", ref);
		}
	}

	for (const tool of manifest.allowedTools) {
		if (NETWORK_TOOLS.includes(tool)) add("network", `tool: ${tool}`);
		if (FS_TOOLS.includes(tool)) add("filesystem", `tool: ${tool}`);
	}

	const pkg = manifest.rawFiles["package.json"];
	const reqs = `${manifest.rawFiles["requirements.txt"] ?? ""}\n${manifest.rawFiles["pyproject.toml"] ?? ""}`;
	for (const dep of NETWORK_DEPS) {
		if (pkg?.includes(`"${dep}"`) || new RegExp(`^${dep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "mi").test(reqs)) add("network", `dependency: ${dep}`);
	}
	if (/\b(fs\.(write|append|rm|unlink)|open\([^)]*['"][wa]|shutil\.|os\.remove)/.test(allText)) add("filesystem", "writes files (seen in sources)");

	return [...permissions.values()];
}
