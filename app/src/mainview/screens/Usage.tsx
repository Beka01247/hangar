import { useEffect, useState } from "react";
import type { UsageReport } from "../../shared/types";
import { api, errorMessage, onLibraryChanged } from "../rpc";

export function Usage() {
	const [report, setReport] = useState<UsageReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = () => api.getUsageReport().then(setReport).catch((e) => setError(errorMessage(e)));
		void load();
		return onLibraryChanged(() => void load());
	}, []);

	return (
		<div className="page">
			<h1>Usage</h1>
			<p className="muted">Tokens and estimated cost per skill this month. A skill that suddenly spends far more than its usual daily amount is flagged.</p>
			{error && <p className="error">{error}</p>}
			{report && (
				<>
					<p>
						<strong>${report.totalMonthUsd.toFixed(2)}</strong> this month across {report.rows.length} skills
					</p>
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr style={{ textAlign: "left" }}>
								<th>Skill</th>
								<th>Runs</th>
								<th>Tokens</th>
								<th>Cost</th>
								<th>Last 24h</th>
							</tr>
						</thead>
						<tbody>
							{report.rows.map((row) => (
								<tr key={row.skillId} style={row.anomaly ? { background: "#fff3cd" } : undefined}>
									<td>
										{row.name}
										{row.anomaly && <span className="badge error" style={{ marginLeft: 6 }}>unusual spend</span>}
									</td>
									<td>{row.monthRuns}</td>
									<td>{row.monthTokens.toLocaleString()}</td>
									<td>${row.monthSpendUsd.toFixed(2)}</td>
									<td>
										${row.spend24hUsd.toFixed(2)}
										{row.baselineDailyUsd > 0 && <span className="muted"> (usual ${row.baselineDailyUsd.toFixed(2)}/day)</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<h2 style={{ marginTop: 24 }}>Recent</h2>
					{report.recent.length === 0 && <p className="muted">No usage recorded yet.</p>}
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<tbody>
							{report.recent.map((u, i) => (
								<tr key={i}>
									<td className="muted">{new Date(u.timestamp).toLocaleString()}</td>
									<td>{u.skillName}</td>
									<td>{u.action ?? ""}</td>
									<td>{u.tokens.toLocaleString()} tokens</td>
									<td>${u.costUsd.toFixed(3)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</div>
	);
}
