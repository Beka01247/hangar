import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ManifestType, SkillCommand } from "../../../shared/types";

export class ManifestError extends Error {}

export type EntryKind = "plugin" | "skill" | "claude-project" | "node" | "python";

export interface ParsedManifest {
	format: ManifestType;
	name: string;
	description: string;
	entryKind: EntryKind;
	entryPoint: string;
	skillMdPaths: string[];
	commands: SkillCommand[];
	mcpServers: McpServer[];
	allowedTools: string[];
	dependencies: { node: boolean; python: boolean };
	readmePath: string | null;
	rawFiles: Record<string, string>;
}

export interface McpServer {
	name: string;
	type: string;
	command?: string;
	url?: string;
	env: Record<string, string>;
}

async function readText(path: string): Promise<string | null> {
	const file = Bun.file(path);
	return (await file.exists()) ? file.text() : null;
}

async function readJson<T>(path: string): Promise<T | null> {
	const text = await readText(path);
	if (text === null) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new ManifestError(`${path.split("/").pop()} is not valid JSON`);
	}
}

export function parseFrontmatter(markdown: string): { fields: Record<string, string>; body: string } {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { fields: {}, body: markdown };
	const fields: Record<string, string> = {};
	for (const line of match[1]!.split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (kv) fields[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, "");
	}
	return { fields, body: match[2] ?? "" };
}

function findReadme(root: string): string | null {
	for (const name of readdirSync(root)) {
		if (/^readme(\.md|\.markdown|\.txt)?$/i.test(name)) return join(root, name);
	}
	return null;
}

function findSkillMds(root: string, depth = 3): string[] {
	const found: string[] = [];
	const walk = (dir: string, level: number) => {
		for (const name of readdirSync(dir)) {
			if (name.startsWith(".") || name === "node_modules") continue;
			const full = join(dir, name);
			if (name === "SKILL.md") found.push(full);
			else if (level < depth && statSync(full).isDirectory()) walk(full, level + 1);
		}
	};
	walk(root, 0);
	return found;
}

function readCommands(root: string, rawFiles: Record<string, string>): SkillCommand[] {
	const dir = join(root, ".claude", "commands");
	if (!existsSync(dir)) return [];
	const commands: SkillCommand[] = [];
	const walk = (current: string, prefix: string) => {
		for (const name of readdirSync(current).sort()) {
			const full = join(current, name);
			if (statSync(full).isDirectory()) {
				walk(full, `${prefix}${name}:`);
				continue;
			}
			if (!name.endsWith(".md")) continue;
			const text = readFileSync(full, "utf8");
			rawFiles[full.slice(root.length + 1)] = text;
			const { fields, body } = parseFrontmatter(text);
			commands.push({
				name: `${prefix}${name.slice(0, -3)}`,
				description: fields["description"] ?? body.trim().split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim().slice(0, 160) ?? "",
				argumentHint: fields["argument-hint"] ?? null,
			});
		}
	};
	walk(dir, "");
	return commands;
}

async function readMcpServers(root: string): Promise<McpServer[]> {
	const servers: McpServer[] = [];
	for (const file of ["mcp.json", ".mcp.json"]) {
		const json = await readJson<{ mcpServers?: Record<string, any> }>(join(root, file));
		for (const [name, cfg] of Object.entries(json?.mcpServers ?? {})) {
			servers.push({
				name,
				type: cfg.type ?? (cfg.url ? "streamable-http" : "stdio"),
				command: cfg.command,
				url: cfg.url,
				env: cfg.env ?? {},
			});
		}
	}
	return servers;
}

export async function parseManifest(root: string): Promise<ParsedManifest> {
	const rawFiles: Record<string, string> = {};
	const remember = async (rel: string) => {
		const text = await readText(join(root, rel));
		if (text !== null) rawFiles[rel] = text;
		return text;
	};

	const readmePath = findReadme(root);
	if (readmePath) await remember(readmePath.slice(root.length + 1));
	const skillMdPaths = findSkillMds(root);
	for (const p of skillMdPaths) await remember(p.slice(root.length + 1));
	const mcpServers = await readMcpServers(root);
	const commands = readCommands(root, rawFiles);
	const claudeMd = await remember("CLAUDE.md");
	await remember("mcp.json");
	await remember(".mcp.json");
	const pkg = await readJson<{ name?: string; description?: string; scripts?: Record<string, string>; main?: string; bin?: unknown }>(join(root, "package.json"));
	if (pkg) await remember("package.json");
	const hasPyproject = existsSync(join(root, "pyproject.toml"));
	const hasRequirements = existsSync(join(root, "requirements.txt"));
	const dependencies = { node: pkg !== null, python: hasPyproject || hasRequirements };

	const pluginJson =
		(await readJson<Record<string, any>>(join(root, "plugin.json"))) ??
		(await readJson<Record<string, any>>(join(root, ".claude-plugin", "plugin.json")));
	if (pluginJson) {
		await remember("plugin.json");
		await remember(".claude-plugin/plugin.json");
		if (typeof pluginJson["name"] !== "string") throw new ManifestError("plugin.json has no name");
		return {
			format: "plugin.json",
			name: pluginJson["name"],
			description: String(pluginJson["description"] ?? ""),
			entryKind: "plugin",
			entryPoint: skillMdPaths[0]?.slice(root.length + 1) ?? "plugin.json",
			skillMdPaths,
			commands,
			mcpServers,
			allowedTools: [],
			dependencies,
			readmePath,
			rawFiles,
		};
	}

	if (skillMdPaths.length > 0) {
		const primary = skillMdPaths.find((p) => p === join(root, "SKILL.md")) ?? skillMdPaths[0]!;
		const { fields, body } = parseFrontmatter(rawFiles[primary.slice(root.length + 1)] ?? "");
		const allowedTools = (fields["allowed-tools"] ?? "").split(/[,\s]+/).filter(Boolean);
		return {
			format: "SKILL.md",
			name: fields["name"] ?? root.split("/").pop() ?? "skill",
			description: fields["description"] ?? body.trim().split("\n")[0] ?? "",
			entryKind: "skill",
			entryPoint: primary.slice(root.length + 1),
			skillMdPaths,
			commands,
			mcpServers,
			allowedTools,
			dependencies,
			readmePath,
			rawFiles,
		};
	}

	if (claudeMd !== null || commands.length > 0) {
		const title = claudeMd?.match(/^#\s+(.+)$/m)?.[1] ?? rawFiles[readmePath ? readmePath.slice(root.length + 1) : ""]?.match(/^#\s+(.+)$/m)?.[1];
		return {
			format: "claude-project",
			name: (title ?? root.split("/").pop() ?? "skill").trim(),
			description: (claudeMd ?? "").split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<!--"))?.trim().slice(0, 200) ?? "",
			entryKind: "claude-project",
			entryPoint: claudeMd !== null ? "CLAUDE.md" : ".claude/commands",
			skillMdPaths,
			commands,
			mcpServers,
			allowedTools: [],
			dependencies,
			readmePath,
			rawFiles,
		};
	}

	if (pkg) {
		const start = pkg.scripts?.["start"];
		const entry = start ? `npm start (${start})` : pkg.main ? `node ${pkg.main}` : null;
		if (!entry) throw new ManifestError("package.json found but no `start` script or `main` entry — cannot tell how to run this");
		return {
			format: "fallback",
			name: pkg.name ?? root.split("/").pop() ?? "skill",
			description: pkg.description ?? "",
			entryKind: "node",
			entryPoint: entry,
			skillMdPaths: [],
			commands,
			mcpServers,
			allowedTools: [],
			dependencies,
			readmePath,
			rawFiles,
		};
	}

	if (hasPyproject || hasRequirements) {
		const pyproject = await remember("pyproject.toml");
		await remember("requirements.txt");
		const name = pyproject?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
		const scriptEntry = pyproject?.match(/\[project\.scripts\]\s*\n\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
		const mainPy = ["main.py", "app.py", "agent.py", "run.py"].find((f) => existsSync(join(root, f)));
		const entry = scriptEntry ? `${scriptEntry} (project.scripts)` : mainPy ? `python ${mainPy}` : null;
		if (!entry) throw new ManifestError("Python project found but no entry point (project.scripts, main.py, app.py, agent.py or run.py)");
		return {
			format: "fallback",
			name: name ?? root.split("/").pop() ?? "skill",
			description: pyproject?.match(/^description\s*=\s*"([^"]+)"/m)?.[1] ?? "",
			entryKind: "python",
			entryPoint: entry,
			skillMdPaths: [],
			commands,
			mcpServers,
			allowedTools: [],
			dependencies,
			readmePath,
			rawFiles,
		};
	}

	throw new ManifestError("Could not figure out how to run this repository: no plugin.json, SKILL.md, CLAUDE.md, package.json or Python project found");
}
