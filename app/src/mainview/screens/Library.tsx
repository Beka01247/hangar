import { useEffect, useState } from "react";
import type { AppState, LibrarySkill, UsageReport } from "../../shared/types";
import { Button, Icon, Panel, Tile, money, tileTone } from "../components/ui";
import { api, errorMessage, onLibraryChanged, onSkillEvent } from "../rpc";

interface Props {
	state: AppState;
	onOpenSkill: (item: LibrarySkill) => void;
	onInstall: () => void;
	onAccountsChanged: () => Promise<void>;
}

export function Library({ onOpenSkill, onInstall }: Props) {
	const [items, setItems] = useState<LibrarySkill[] | null>(null);
	const [report, setReport] = useState<UsageReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [live, setLive] = useState<Record<string, string>>({});

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const [list, usage] = await Promise.all([api.listLibrary(), api.getUsageReport()]);
				if (cancelled) return;
				setItems(list);
				setReport(usage);
			} catch (e) {
				if (!cancelled) setError(errorMessage(e));
			}
		};
		void load();
		const offLib = onLibraryChanged(() => void load());
		const offEvents = onSkillEvent((e) => {
			if (e.event.kind === "status") setLive((l) => ({ ...l, [e.skillId]: e.event.kind === "status" ? e.event.status : l[e.skillId] ?? "" }));
		});
		return () => {
			cancelled = true;
			offLib();
			offEvents();
		};
	}, []);

	const visible = items?.filter((i) => !query.trim() || `${i.skill.name} ${i.skill.repoOwner}/${i.skill.repoName}`.toLowerCase().includes(query.toLowerCase())) ?? null;
	const running = items?.filter((i) => live[i.skill.id] === "running" || live[i.skill.id] === "idle").length ?? 0;
	const total = report?.totalMonthUsd ?? 0;
	const anomalies = report?.rows.filter((r) => r.anomaly) ?? [];

	return (
		<main className="main">
			<div className="row between">
				<div className="stack gap-1">
					<h1>Library</h1>
					<span className="muted">
						{items ? `${items.length} skill${items.length === 1 ? "" : "s"} · ${money(total)} this month${running ? ` · ${running} running` : ""}` : "Loading…"}
					</span>
				</div>
				<div className="row gap-2">
					<div className="row gap-2" style={{ height: 38, padding: "0 14px", borderRadius: 19, background: "var(--glass-2)", border: "1px solid var(--line-2)", width: 240 }}>
						<Icon name="search" size={14} stroke="var(--fg-55)" />
						<input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ height: "auto", padding: 0, background: "none", border: 0, fontSize: 13.5 }} />
					</div>
					<Button variant="primary" onClick={onInstall}>Install</Button>
				</div>
			</div>

			{error && <span className="error">{error}</span>}
			<div className="scroll stack gap-4" style={{ paddingBottom: 24 }}>
				{visible && visible.length === 0 && (
					<Panel className="pad stack gap-2" style={{ alignItems: "flex-start" }}>
						<span style={{ fontSize: 17, fontWeight: 600 }}>{items?.length ? "Nothing matches" : "Nothing installed yet"}</span>
						<span className="muted">Paste a GitHub link or browse the store — every skill opens here as its own app.</span>
						{!items?.length && <Button variant="primary" onClick={onInstall}>Install a skill</Button>}
					</Panel>
				)}
				{visible && visible.length > 0 && (
					<div className="grid-3">
						{visible.map((item) => (
							<SkillCard key={item.skill.id} item={item} status={live[item.skill.id]} onOpen={() => onOpenSkill(item)} />
						))}
					</div>
				)}
				<div className="row gap-3" style={{ alignItems: "stretch" }}>
					<Panel className="pad grow stack gap-3">
						<div className="row between"><h2>Recent</h2><span className="tiny dim">what your skills did lately</span></div>
						<div className="stack gap-2">
							{report?.recent.slice(0, 6).map((u, i) => (
								<div key={i} className="row between small">
									<span className="row gap-2"><span className="dot" />{u.skillName} · <span className="muted">{u.action ?? "turn"}</span></span>
									<span className="dim">{new Date(u.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {money(u.costUsd)}</span>
								</div>
							))}
							{report && report.recent.length === 0 && <span className="muted small">Nothing yet — open a skill and give it a task.</span>}
						</div>
					</Panel>
					<Panel red className="pad stack between" style={{ width: 300, flexShrink: 0 }}>
						<span className="small" style={{ fontWeight: 600, color: "var(--red-tint)" }}>Spend this month</span>
						<span className="huge">{money(total)}</span>
						<span className="small" style={{ color: "var(--fg-70)" }}>
							{anomalies.length === 0
								? "Estimate — on a subscription nothing is billed per token. No skill is spending unusually."
								: `${anomalies.map((a) => a.name).join(", ")} spent far more than usual in the last 24h.`}
						</span>
					</Panel>
				</div>
			</div>
		</main>
	);
}

function SkillCard({ item, status, onOpen }: { item: LibrarySkill; status?: string; onOpen: () => void }) {
	const tone = item.skill.manifestType === "claude-project" ? "red" : tileTone(item.skill.id);
	const badge = item.installed.updateAvailable ? "update available" : item.anomaly ? "unusual spend" : item.official ? "yours" : "unofficial · community";
	return (
		<Panel className="card" style={{ padding: 22 }}>
			<div onClick={onOpen} className="stack gap-3">
				<div className="row between" style={{ alignItems: "flex-start" }}>
					<Tile tone={tone} />
					<span className={`dot ${status === "running" ? "red" : status === "idle" ? "on" : ""}`} />
				</div>
				<div className="stack gap-1">
					<span style={{ fontSize: 17, fontWeight: 600 }}>{item.skill.name}</span>
					<span className="small muted">
						{item.skill.repoOwner}/{item.skill.repoName}
						{item.skill.commands?.length ? ` · ${item.skill.commands.length} commands` : ""}
						{item.skill.mcpServers?.length ? ` · ${item.skill.mcpServers.length} MCP` : ""}
					</span>
				</div>
				<div className="row between" style={{ alignItems: "flex-end" }}>
					<div className="stack">
						<span style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>{money(item.monthSpendUsd)}</span>
						<span className="tiny muted">{item.runsLast7Days} runs / week</span>
					</div>
					<span className={`badge ${item.installed.updateAvailable || item.anomaly ? "badge-red" : ""}`}>{badge}</span>
				</div>
			</div>
		</Panel>
	);
}
