import { useEffect, useState } from "react";
import type { UsageReport } from "../../shared/types";
import { Panel, money } from "../components/ui";
import { api, errorMessage, onLibraryChanged } from "../rpc";

export function Usage() {
	const [report, setReport] = useState<UsageReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = () => api.getUsageReport().then(setReport).catch((e) => setError(errorMessage(e)));
		void load();
		return onLibraryChanged(() => void load());
	}, []);

	const days = dailySeries(report);
	const max = Math.max(...days.map((d) => d.usd), 0.01);
	const anomalies = report?.rows.filter((r) => r.anomaly) ?? [];
	const cols = "1.6fr 1fr 1fr 1fr 1.2fr";

	return (
		<main className="main">
			<div className="row between" style={{ alignItems: "flex-end" }}>
				<div className="stack gap-1">
					<h1>Usage</h1>
					<span className="muted">Estimates — on a subscription nothing is billed per token. Sudden jumps are flagged because they can mean a skill does more than it used to.</span>
				</div>
				<span className="chip">{new Date().toLocaleString([], { month: "long" })}</span>
			</div>
			{error && <span className="error">{error}</span>}
			<div className="scroll stack gap-3" style={{ paddingBottom: 24 }}>
				<div className="row gap-3" style={{ alignItems: "stretch" }}>
					<Panel className="pad grow stack gap-3">
						<div className="row between" style={{ alignItems: "baseline" }}>
							<span className="big">{money(report?.totalMonthUsd ?? 0)}</span>
							<span className="small muted">{report ? `${report.rows.reduce((s, r) => s + r.monthTokens, 0).toLocaleString()} tokens · ${report.rows.reduce((s, r) => s + r.monthRuns, 0)} runs · daily` : ""}</span>
						</div>
						<div className="bars">
							{days.map((d) => (
								<span key={d.day} className={d.hot ? "hot" : ""} style={{ height: `${Math.max(3, (d.usd / max) * 100)}%` }} title={`${d.day}: ${money(d.usd)}`} />
							))}
						</div>
					</Panel>
					<Panel red className="pad stack between" style={{ width: 300, flexShrink: 0 }}>
						<span className="small" style={{ fontWeight: 600, color: "var(--red-tint)" }}>{anomalies.length ? "Unusual spend" : "All quiet"}</span>
						<span style={{ fontSize: 15, lineHeight: 1.5 }}>
							{anomalies.length
								? `${anomalies[0]!.name} spent ${money(anomalies[0]!.spend24hUsd)} in the last 24h${anomalies[0]!.baselineDailyUsd > 0 ? ` — ${Math.round(anomalies[0]!.spend24hUsd / anomalies[0]!.baselineDailyUsd)}× its usual day` : ""}.`
								: "No skill is spending more than it usually does."}
						</span>
					</Panel>
				</div>
				<Panel className="stack gap-1" style={{ padding: 12 }}>
					<div className="table-row head label" style={{ gridTemplateColumns: cols }}><span>Skill</span><span>Runs</span><span>Tokens</span><span>Cost</span><span>Last 24h</span></div>
					{report?.rows.map((row) => (
						<div key={row.skillId} className={`table-row ${row.anomaly ? "flag" : ""}`} style={{ gridTemplateColumns: cols }}>
							<span style={{ fontWeight: 500 }}>{row.name}{row.anomaly && <span className="badge badge-red" style={{ marginLeft: 8 }}>unusual</span>}</span>
							<span>{row.monthRuns}</span>
							<span>{row.monthTokens.toLocaleString()}</span>
							<span style={{ fontWeight: 600 }}>{money(row.monthSpendUsd)}</span>
							<span className="muted">{money(row.spend24hUsd)}{row.baselineDailyUsd > 0 && ` · usual ${money(row.baselineDailyUsd)}`}</span>
						</div>
					))}
					{report && report.rows.length === 0 && <span className="muted" style={{ padding: 16 }}>No skills installed.</span>}
				</Panel>
				<Panel className="stack gap-1" style={{ padding: 12 }}>
					<div className="table-row head label" style={{ gridTemplateColumns: "1.2fr 1.4fr 1.4fr 1fr 0.8fr" }}><span>When</span><span>Skill</span><span>Action</span><span>Tokens</span><span>Cost</span></div>
					{report?.recent.map((u, i) => (
						<div key={i} className="table-row small" style={{ gridTemplateColumns: "1.2fr 1.4fr 1.4fr 1fr 0.8fr", padding: "10px 16px" }}>
							<span className="muted">{new Date(u.timestamp).toLocaleString()}</span><span>{u.skillName}</span><span className="muted">{u.action ?? ""}</span><span>{u.tokens.toLocaleString()}</span><span>{money(u.costUsd)}</span>
						</div>
					))}
					{report && report.recent.length === 0 && <span className="muted" style={{ padding: 16 }}>No usage recorded yet.</span>}
				</Panel>
			</div>
		</main>
	);
}

function dailySeries(report: UsageReport | null): { day: string; usd: number; hot: boolean }[] {
	const days = (report?.daily ?? []).map((d) => ({ day: d.day, usd: d.usd, hot: false }));
	const top = days.reduce<{ day: string; usd: number; hot: boolean } | null>((a, b) => (a === null || b.usd > a.usd ? b : a), null);
	if (top && top.usd > 0) top.hot = true;
	return days;
}
