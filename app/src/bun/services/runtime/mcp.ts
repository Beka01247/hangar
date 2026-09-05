import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { InstalledSkill, Skill, SkillMcpServer, SkillTool, SkillToolResult } from "../../../shared/types";
import { skillsStore } from "../../store/skills";
import { cliEnv } from "../claude-cli";
import { resolveSkillEnv } from "./skill-env";

const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env["HOME"]}/.bun/bin`, `${process.env["HOME"]}/.local/bin`];

function expand(value: string, vars: Record<string, string>): string {
	return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g, (whole, a: string | undefined, b: string | undefined) => vars[a ?? b ?? ""] ?? whole);
}

export interface ResolvedServer {
	name: string;
	type: "stdio" | "http";
	command?: string;
	args: string[];
	url?: string;
	env: Record<string, string>;
	cwd: string;
}

export async function resolveServers(skill: Skill, installed: InstalledSkill, workspace: string): Promise<ResolvedServer[]> {
	const secrets = await resolveSkillEnv(skill.id);
	const vars: Record<string, string> = { ...secrets, PLUGIN_ROOT: installed.localPath, PLUGIN_DATA: workspace, CLAUDE_PLUGIN_ROOT: installed.localPath };
	return (skill.mcpServers ?? []).map((server: SkillMcpServer) => {
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(server.env)) env[k] = expand(v, vars);
		for (const [k, v] of Object.entries(secrets)) if (!(k in env)) env[k] = v;
		const isHttp = Boolean(server.url);
		return {
			name: server.name,
			type: isHttp ? "http" : "stdio",
			command: server.command ? expand(server.command, vars) : undefined,
			args: server.args.map((a) => expand(a, vars)),
			url: server.url ? expand(server.url, vars) : undefined,
			env,
			cwd: server.cwd ? expand(server.cwd, vars) : installed.localPath,
		};
	});
}

export function toAgentSdkConfig(servers: ResolvedServer[], baseEnv: Record<string, string>): Record<string, McpServerConfig> {
	const out: Record<string, McpServerConfig> = {};
	for (const s of servers) {
		if (s.type === "http" && s.url) out[s.name] = { type: "http", url: s.url };
		else if (s.command) out[s.name] = { type: "stdio", command: s.command, args: s.args, env: { ...baseEnv, ...s.env, PATH: `${EXTRA_PATH.join(":")}:${baseEnv["PATH"] ?? ""}` } };
	}
	return out;
}

class ServerConnection {
	client: Client | null = null;

	constructor(readonly server: ResolvedServer) {}

	async connect(): Promise<Client> {
		if (this.client) return this.client;
		const client = new Client({ name: "hangar", version: "0.1.0" });
		if (this.server.type === "http" && this.server.url) {
			await client.connect(new StreamableHTTPClientTransport(new URL(this.server.url)));
		} else if (this.server.command) {
			const base = cliEnv();
			await client.connect(
				new StdioClientTransport({
					command: this.server.command,
					args: this.server.args,
					cwd: this.server.cwd,
					env: { ...base, ...this.server.env, PATH: `${EXTRA_PATH.join(":")}:${base["PATH"] ?? ""}` },
					stderr: "pipe",
				}),
			);
		} else {
			throw new Error(`MCP server ${this.server.name} has neither a command nor a url`);
		}
		this.client = client;
		return client;
	}

	async close(): Promise<void> {
		await this.client?.close().catch(() => {});
		this.client = null;
	}
}

const connections = new Map<string, Map<string, ServerConnection>>();

async function connectionsFor(skillId: string): Promise<Map<string, ServerConnection>> {
	const existing = connections.get(skillId);
	if (existing) return existing;
	const registry = await skillsStore.read();
	const skill = registry.skills[skillId];
	const installed = registry.installed[skillId];
	if (!skill || !installed) throw new Error("Skill is not installed");
	const { prepareWorkspace } = await import("./environment");
	const servers = await resolveServers(skill, installed, prepareWorkspace(skill, installed));
	const map = new Map(servers.map((s) => [s.name, new ServerConnection(s)]));
	connections.set(skillId, map);
	return map;
}

export async function listSkillTools(skillId: string): Promise<SkillTool[]> {
	const tools: SkillTool[] = [];
	for (const [name, connection] of await connectionsFor(skillId)) {
		try {
			const client = await connection.connect();
			const result = await client.listTools();
			for (const tool of result.tools) {
				tools.push({ server: name, name: tool.name, description: tool.description ?? "", inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {} });
			}
		} catch (error) {
			tools.push({ server: name, name: "__error__", description: `Could not start ${name}: ${(error as Error).message}`, inputSchema: {} });
			await connection.close();
		}
	}
	return tools;
}

export async function callSkillTool(skillId: string, server: string, tool: string, args: Record<string, unknown>): Promise<SkillToolResult> {
	const connection = (await connectionsFor(skillId)).get(server);
	if (!connection) throw new Error(`Unknown MCP server ${server}`);
	const client = await connection.connect();
	const result = await client.callTool({ name: tool, arguments: args });
	const content = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
	const text = content.map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`)).join("\n");
	return { text: text || JSON.stringify(result.structuredContent ?? result, null, 2), isError: Boolean(result.isError), raw: result };
}

export async function closeSkillServers(skillId: string): Promise<void> {
	const map = connections.get(skillId);
	if (!map) return;
	connections.delete(skillId);
	await Promise.all([...map.values()].map((c) => c.close()));
}
