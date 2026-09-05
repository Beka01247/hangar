import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillEventEnvelope, SkillStatus } from "../../shared/types";
import { Panel } from "../components/ui";
import { api, errorMessage, onSkillEvent } from "../rpc";

export function SkillRunner({ item, onStatus }: { item: LibrarySkill; onStatus?: (status: SkillStatus) => void }) {
	const skillId = item.skill.id;
	const [status, setStatus] = useState<SkillStatus>("stopped");
	const [events, setEvents] = useState<SkillEventEnvelope[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [text, setText] = useState("");
	const bottom = useRef<HTMLDivElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const commands = item.skill.commands ?? [];

	useEffect(() => {
		let cancelled = false;
		const off = onSkillEvent((e) => {
			if (e.skillId !== skillId) return;
			setEvents((list) => [...list, e].slice(-500));
			if (e.event.kind === "status") {
				setStatus(e.event.status);
				onStatus?.(e.event.status);
			}
		});
		api.startSkill({ skillId })
			.then((state) => {
				if (cancelled) return;
				setStatus(state.status);
				onStatus?.(state.status);
				setEvents(state.events);
			})
			.catch((e) => !cancelled && setError(errorMessage(e)));
		return () => {
			cancelled = true;
			off();
			void api.stopSkill({ skillId });
		};
	}, [skillId]);

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
	}, [events.length]);

	const canSend = status === "idle" || status === "running";

	async function send(message: string) {
		if (!message.trim()) return;
		try {
			await api.sendToSkill({ skillId, text: message.trim() });
			setText("");
		} catch (err) {
			setError(errorMessage(err));
		}
	}

	function runCommand(name: string, hint: string | null) {
		if (hint) {
			setText(`/${name} `);
			input.current?.focus();
		} else void send(`/${name}`);
	}

	const turns = groupTurns(events);

	return (
		<Panel className="stack grow" style={{ minHeight: 0, padding: "30px 34px 26px", gap: 22 }}>
			<div className="scroll grow timeline" style={{ paddingRight: 6 }}>
				{turns.length === 0 && (
					<div className="stack gap-1">
						<span className="label">{status === "starting" ? "Starting" : status === "stopped" || status === "error" ? "Stopped" : "Ready"}</span>
						<span className="muted" style={{ fontSize: 18 }}>{status === "starting" ? "Warming up Claude Code…" : commands.length ? "Pick a command below or type a message." : "Type what the skill should do."}</span>
					</div>
				)}
				{turns.map((turn, i) => (
					<Turn key={turn.key} turn={turn} last={i === turns.length - 1} status={status} />
				))}
				<div ref={bottom} />
			</div>
			{error && <span className="error small">{error}</span>}
			{commands.length > 0 && (
				<div className="row gap-2 wrap">
					{commands.slice(0, 10).map((c) => (
						<button key={c.name} className="chip" title={c.description} disabled={!canSend} onClick={() => runCommand(c.name, c.argumentHint)}>
							/{c.name}{c.argumentHint && <span className="dim">{c.argumentHint}</span>}
						</button>
					))}
					{commands.length > 10 && <span className="chip dim" style={{ background: "none" }}>+{commands.length - 10}</span>}
				</div>
			)}
			<form className="composer" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(text); }}>
				<input ref={input} placeholder={status === "running" ? "Working — you can queue the next message" : "Type a message or /command"} value={text} onChange={(e) => setText(e.target.value)} disabled={!canSend} />
				<button type="submit" disabled={!canSend || !text.trim()}>Send →</button>
			</form>
		</Panel>
	);
}

interface TurnGroup {
	key: number;
	user: string | null;
	at: string;
	tools: SkillEventEnvelope[];
	texts: { text: string; seq: number }[];
	result: Extract<SkillEventEnvelope["event"], { kind: "result" }> | null;
	errors: string[];
}

function groupTurns(events: SkillEventEnvelope[]): TurnGroup[] {
	const turns: TurnGroup[] = [];
	let current: TurnGroup | null = null;
	for (const e of events) {
		const ev = e.event;
		if (ev.kind === "user") {
			current = { key: e.seq, user: ev.text, at: e.at, tools: [], texts: [], result: null, errors: [] };
			turns.push(current);
			continue;
		}
		if (ev.kind === "status") continue;
		if (!current) {
			current = { key: e.seq, user: null, at: e.at, tools: [], texts: [], result: null, errors: [] };
			turns.push(current);
		}
		if (ev.kind === "assistant_text") current.texts.push({ text: ev.text, seq: e.seq });
		else if (ev.kind === "result") current.result = ev;
		else if (ev.kind === "error") current.errors.push(ev.message);
		else current.tools.push(e);
	}
	return turns;
}

function Turn({ turn, last, status }: { turn: TurnGroup; last: boolean; status: SkillStatus }) {
	const time = new Date(turn.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	const working = last && status === "running" && !turn.result;
	return (
		<div className="stack gap-3 rise">
			{turn.user !== null && (
				<div className="stack gap-1">
					<span className="label">You · {time}</span>
					<span className="turn-cmd">{turn.user}</span>
				</div>
			)}
			{turn.tools.length > 0 && (
				<div className="stack gap-2">
					{turn.tools.map((e) => <ToolLine key={e.seq} envelope={e} />)}
				</div>
			)}
			{(turn.texts.length > 0 || working) && (
				<div className="stack gap-1">
					<span className="label">Assistant{turn.texts.length === 0 && working ? "" : ` · ${time}`}</span>
					{turn.texts.map((t, i) => (
						<Typed key={t.seq} text={t.text} animate={last && i === turn.texts.length - 1} showCaret={working && i === turn.texts.length - 1} />
					))}
					{working && turn.texts.length === 0 && (
						<span className="turn-text muted">thinking<span className="pulse">.</span><span className="pulse pulse-2">.</span><span className="pulse pulse-3">.</span></span>
					)}
				</div>
			)}
			{turn.errors.map((m, i) => <span key={i} className="error small">{m}</span>)}
			{turn.result && (
				<span className={`tiny ${turn.result.isError ? "red" : "dim"}`}>
					{turn.result.isError ? turn.result.text : `${turn.result.turnTokens.toLocaleString()} tokens · $${turn.result.turnCostUsd.toFixed(3)}`}
				</span>
			)}
		</div>
	);
}

function Typed({ text, animate, showCaret }: { text: string; animate: boolean; showCaret: boolean }) {
	const [shown, setShown] = useState(animate ? 0 : text.length);
	useEffect(() => {
		if (!animate) return setShown(text.length);
		let i = 0;
		const step = () => {
			i = Math.min(text.length, i + Math.max(1, Math.round(text.length / 120)));
			setShown(i);
			if (i < text.length) timer = window.setTimeout(step, 14);
		};
		let timer = window.setTimeout(step, 14);
		return () => window.clearTimeout(timer);
	}, [text, animate]);
	return (
		<span className="turn-text">
			{text.slice(0, shown)}
			{(shown < text.length || showCaret) && <span className="caret" />}
		</span>
	);
}

function ToolLine({ envelope }: { envelope: SkillEventEnvelope }) {
	const ev = envelope.event;
	if (ev.kind === "tool_use") {
		const input = ev.input as Record<string, unknown>;
		const summary = typeof input?.["command"] === "string" ? input["command"] : typeof input?.["file_path"] === "string" ? input["file_path"] : typeof input?.["pattern"] === "string" ? input["pattern"] : typeof input?.["url"] === "string" ? input["url"] : typeof input?.["skill"] === "string" ? input["skill"] : JSON.stringify(input);
		return (
			<div className="tool-line">
				<span>{ev.name.replace(/^mcp__/, "")}</span>
				<details><summary>{String(summary).slice(0, 160)}</summary><pre style={{ marginTop: 6 }}>{JSON.stringify(ev.input, null, 2)}</pre></details>
			</div>
		);
	}
	if (ev.kind === "tool_result") {
		if (!ev.isError && ev.content.length < 120) return null;
		return (
			<div className={`tool-line ${ev.isError ? "blocked" : ""}`}>
				<span>{ev.isError ? "Error" : "Result"}</span>
				<details><summary>{ev.content.split("\n")[0]?.slice(0, 160)}</summary><pre style={{ marginTop: 6 }}>{ev.content}</pre></details>
			</div>
		);
	}
	if (ev.kind === "denied") {
		return <div className="tool-line blocked"><span>Blocked</span><span>{ev.tool} — {ev.reason}</span></div>;
	}
	return null;
}
