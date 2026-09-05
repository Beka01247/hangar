import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillEventEnvelope, SkillStatus } from "../../shared/types";
import { api, errorMessage, onSkillEvent } from "../rpc";

export function SkillRunner({ item }: { item: LibrarySkill }) {
	const skillId = item.skill.id;
	const [status, setStatus] = useState<SkillStatus>("stopped");
	const [events, setEvents] = useState<SkillEventEnvelope[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [text, setText] = useState("");
	const [log, setLog] = useState<string[] | null>(null);
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		const unsubscribe = onSkillEvent((e) => {
			if (e.skillId !== skillId) return;
			setEvents((list) => [...list, e].slice(-500));
			if (e.event.kind === "status") setStatus(e.event.status);
		});
		api.startSkill({ skillId })
			.then((state) => {
				if (cancelled) return;
				setStatus(state.status);
				setEvents(state.events);
			})
			.catch((e) => !cancelled && setError(errorMessage(e)));
		return () => {
			cancelled = true;
			unsubscribe();
			void api.stopSkill({ skillId });
		};
	}, [skillId]);

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: "end" });
	}, [events.length]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!text.trim()) return;
		try {
			await api.sendToSkill({ skillId, text: text.trim() });
			setText("");
		} catch (err) {
			setError(errorMessage(err));
		}
	}

	async function toggleLog() {
		if (log) return setLog(null);
		setLog(await api.getSkillLog({ skillId, tailLines: 200 }));
	}

	return (
		<section>
			<div className="row" style={{ justifyContent: "space-between" }}>
				<h2 style={{ margin: 0 }}>Run</h2>
				<span className="muted">
					status: {status}{" "}
					<button type="button" onClick={toggleLog}>
						{log ? "Hide log" : "Show log"}
					</button>
				</span>
			</div>
			<p className="muted">No custom interface for this skill yet — this is the default conversation view. Every tool call is shown as it happens.</p>
			{error && <p className="error">{error}</p>}

			<div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
				{events.length === 0 && <span className="muted">Send a task to start.</span>}
				{events.map((e) => (
					<EventRow key={e.seq} envelope={e} />
				))}
				<div ref={bottom} />
			</div>

			<form onSubmit={submit} className="row">
				<input
					placeholder={status === "running" ? "Working… you can queue the next message" : "What should the skill do?"}
					value={text}
					onChange={(e) => setText(e.target.value)}
					disabled={status === "stopped" || status === "starting" || status === "error"}
				/>
				<button type="submit" disabled={!text.trim() || status === "stopped" || status === "error"}>
					Send
				</button>
			</form>

			{log && (
				<pre style={{ maxHeight: 300, overflow: "auto", fontSize: 11, background: "#f5f5f5", padding: 8, marginTop: 8 }}>
					{log.length === 0 ? "Log is empty." : log.join("\n")}
				</pre>
			)}
		</section>
	);
}

function EventRow({ envelope }: { envelope: SkillEventEnvelope }) {
	const { event } = envelope;
	const time = new Date(envelope.at).toLocaleTimeString();
	switch (event.kind) {
		case "status":
			return (
				<div className="muted" style={{ fontSize: 12 }}>
					{time} · {event.status}
					{event.message && ` — ${event.message}`}
				</div>
			);
		case "user":
			return (
				<div style={{ margin: "6px 0" }}>
					<strong>You:</strong> {event.text}
				</div>
			);
		case "assistant_text":
			return (
				<div style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
					<strong>Skill:</strong> {event.text}
				</div>
			);
		case "tool_use":
			return (
				<details style={{ margin: "4px 0", fontSize: 12 }}>
					<summary>
						▶ {event.name} <span className="muted">{time}</span>
					</summary>
					<pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(event.input, null, 2)}</pre>
				</details>
			);
		case "tool_result":
			return (
				<details style={{ margin: "4px 0", fontSize: 12 }}>
					<summary className={event.isError ? "error" : "muted"}>◀ result{event.isError && " (error)"}</summary>
					<pre style={{ whiteSpace: "pre-wrap" }}>{event.content}</pre>
				</details>
			);
		case "result":
			return (
				<div className={event.isError ? "error" : "muted"} style={{ fontSize: 12 }}>
					{time} · turn finished · {event.turnTokens.toLocaleString()} tokens · ${event.turnCostUsd.toFixed(3)}
					{event.isError && ` — ${event.text}`}
				</div>
			);
		case "denied":
			return (
				<div className="error" style={{ fontSize: 12 }}>
					Blocked {event.tool}: {event.reason}
				</div>
			);
		case "error":
			return <div className="error">{event.message}</div>;
	}
}
