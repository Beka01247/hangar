import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { query, type CanUseTool, type Options, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { InstalledSkill, Skill, SkillEvent, SkillEventEnvelope, SkillSessionState, SkillStatus } from "../../../shared/types";
import { usageStore } from "../../store/usage";
import { findClaudeBinary } from "../claude-cli";
import { buildRuntimeEnv, LOGS_DIR, prepareWorkspace } from "./environment";
import { resolveServers, toAgentSdkConfig } from "./mcp";

const NETWORK_TOOLS = new Set(["WebFetch", "WebSearch"]);
const NETWORK_COMMAND_RE = /\b(curl|wget|ssh|scp|nc|ncat|pip3? install|npm (install|i|ci)|bun (install|add)|git (clone|fetch|pull|push))\b/;
const GITHUB_COMMAND_RE = /\b(gh |api\.github\.com|github\.com)/;

type Listener = (envelope: SkillEventEnvelope) => void;

class PushQueue<T> implements AsyncIterable<T> {
	private items: T[] = [];
	private waiters: ((value: IteratorResult<T>) => void)[] = [];
	private closed = false;

	push(item: T): void {
		const waiter = this.waiters.shift();
		if (waiter) waiter({ value: item, done: false });
		else this.items.push(item);
	}

	close(): void {
		this.closed = true;
		for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as never, done: true });
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: () => {
				const item = this.items.shift();
				if (item !== undefined) return Promise.resolve({ value: item, done: false });
				if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
				return new Promise((resolve) => this.waiters.push(resolve));
			},
		};
	}
}

export class SkillSession {
	status: SkillStatus = "stopped";
	readonly events: SkillEventEnvelope[] = [];
	readonly workspace: string;
	private seq = 0;
	private readonly input = new PushQueue<SDKUserMessage>();
	private readonly abort = new AbortController();
	private q: Query | null = null;
	private lastCostUsd = 0;
	private lastTokens = 0;
	private turnStartedAt: string | null = null;
	private readonly logPath: string;

	constructor(
		readonly skill: Skill,
		readonly installed: InstalledSkill,
		private readonly listener: Listener,
	) {
		this.workspace = prepareWorkspace(skill, installed);
		this.logPath = join(LOGS_DIR, `${skill.id}.jsonl`);
	}

	state(): SkillSessionState {
		return { skillId: this.skill.id, status: this.status, events: this.events, workspace: this.workspace };
	}

	async start(): Promise<void> {
		this.setStatus("starting");
		const runtime = await buildRuntimeEnv(this.skill.id);
		const claude = findClaudeBinary();
		if (!claude) throw new Error("Claude Code CLI not found");

		const canUseTool: CanUseTool = async (toolName, input) => {
			const command = typeof input["command"] === "string" ? input["command"] : "";
			if (!runtime.scopes.has("network") && (NETWORK_TOOLS.has(toolName) || (toolName === "Bash" && NETWORK_COMMAND_RE.test(command)))) {
				return this.deny(toolName, "Network access is turned off for this skill in Hangar");
			}
			if (!runtime.scopes.has("github") && toolName === "Bash" && GITHUB_COMMAND_RE.test(command)) {
				return this.deny(toolName, "GitHub access is turned off for this skill in Hangar");
			}
			return { behavior: "allow", updatedInput: input };
		};

		const servers = await resolveServers(this.skill, this.installed, this.workspace);
		const options: Options = {
			cwd: this.workspace,
			env: runtime.env,
			mcpServers: toAgentSdkConfig(servers, runtime.env),
			pathToClaudeCodeExecutable: claude,
			abortController: this.abort,
			permissionMode: "default",
			canUseTool,
			settingSources: ["project"],
			skills: "all",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append:
					this.skill.manifestType === "claude-project"
						? `You are running inside Hangar as the installed project "${this.skill.name}" (${this.skill.repoUrl}). Follow its CLAUDE.md and slash commands.`
						: `You are running inside Hangar as the installed skill "${this.skill.name}" (${this.skill.repoUrl}). Use that skill for every request. The working directory is a scratch workspace owned by Hangar; keep files you produce there.`,
			},
			stderr: (line) => this.journal({ type: "stderr", line }),
		};

		this.q = query({ prompt: this.input, options });
		void this.consume();
		this.setStatus("idle");
	}

	send(text: string): void {
		if (!this.q || this.status === "stopped") throw new Error("Skill is not running");
		this.turnStartedAt = new Date().toISOString();
		this.emit({ kind: "user", text });
		this.setStatus("running");
		this.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
	}

	stop(): void {
		this.input.close();
		this.abort.abort();
		this.q?.close();
		this.q = null;
		this.setStatus("stopped");
	}

	private async consume(): Promise<void> {
		try {
			for await (const message of this.q as Query) {
				this.journal(message);
				await this.handle(message);
			}
			if (this.status !== "stopped") this.setStatus("stopped", "Claude Code exited");
		} catch (error) {
			if (this.abort.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			this.emit({ kind: "error", message });
			this.setStatus("error", message);
		}
	}

	private async handle(message: SDKMessage): Promise<void> {
		switch (message.type) {
			case "assistant":
				for (const block of message.message.content) {
					if (block.type === "text" && block.text.trim()) this.emit({ kind: "assistant_text", text: block.text });
					if (block.type === "tool_use") this.emit({ kind: "tool_use", id: block.id, name: block.name, input: block.input });
				}
				break;
			case "user": {
				const content = message.message.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (block.type === "tool_result") {
							const text =
								typeof block.content === "string"
									? block.content
									: (block.content ?? []).map((c) => ("text" in c ? c.text : `[${c.type}]`)).join("\n");
							this.emit({ kind: "tool_result", toolUseId: block.tool_use_id, content: text.slice(0, 4000), isError: Boolean(block.is_error) });
						}
					}
				}
				break;
			}
			case "result": {
				const totalTokens = Object.values(message.modelUsage).reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
				const turnCostUsd = Math.max(0, message.total_cost_usd - this.lastCostUsd);
				const turnTokens = Math.max(0, totalTokens - this.lastTokens);
				this.lastCostUsd = message.total_cost_usd;
				this.lastTokens = totalTokens;
				await this.recordTurn(turnCostUsd, turnTokens);
				this.emit({
					kind: "result",
					text: message.subtype === "success" ? message.result : message.errors.join("; ") || message.subtype,
					isError: message.is_error,
					turnCostUsd,
					turnTokens,
				});
				this.setStatus("idle");
				break;
			}
			default:
				break;
		}
	}

	private async recordTurn(costUsd: number, tokens: number): Promise<void> {
		const startedAt = this.turnStartedAt ?? new Date().toISOString();
		const endedAt = new Date().toISOString();
		await usageStore.update((log) => {
			log.runs.push({ skillId: this.skill.id, startedAt, endedAt });
			if (tokens > 0) log.usage.push({ skillId: this.skill.id, tokens, costUsd, timestamp: endedAt, action: "turn" });
		});
	}

	private deny(tool: string, reason: string): { behavior: "deny"; message: string } {
		this.emit({ kind: "denied", tool, reason });
		return { behavior: "deny", message: reason };
	}

	private setStatus(status: SkillStatus, message?: string): void {
		this.status = status;
		this.emit({ kind: "status", status, message });
	}

	private emit(event: SkillEvent): void {
		const envelope: SkillEventEnvelope = { skillId: this.skill.id, seq: ++this.seq, at: new Date().toISOString(), event };
		this.events.push(envelope);
		if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
		this.listener(envelope);
	}

	private journal(entry: unknown): void {
		try {
			appendFileSync(this.logPath, `${JSON.stringify({ at: new Date().toISOString(), ...(entry as object) })}\n`);
		} catch {}
	}
}
