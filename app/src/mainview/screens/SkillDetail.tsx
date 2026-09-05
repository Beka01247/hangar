import { useEffect, useState } from "react";
import type { LibrarySkill, UsageRecord } from "../../shared/types";
import { api, errorMessage } from "../rpc";

interface Props {
	item: LibrarySkill;
	onBack: () => void;
}

export function SkillDetail({ item, onBack }: Props) {
	const [usage, setUsage] = useState<UsageRecord[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmRemove, setConfirmRemove] = useState(false);

	useEffect(() => {
		api.getSkillUsage({ skillId: item.skill.id }).then(setUsage).catch((e) => setError(errorMessage(e)));
	}, [item.skill.id]);

	return (
		<div className="page">
			<div className="row">
				<button onClick={onBack}>← Library</button>
				<button onClick={() => (confirmRemove ? void api.uninstallSkill({ skillId: item.skill.id }).then(onBack) : setConfirmRemove(true))}>
					{confirmRemove ? "Click again to delete the folder" : "Uninstall"}
				</button>
			</div>
			<h1>{item.skill.name}</h1>
			<p className="muted">
				{item.skill.repoUrl} · {item.skill.manifestType}
				{!item.official && " · unofficial · community"}
			</p>
			<p>
				${item.monthSpendUsd.toFixed(2)} / {item.monthTokens.toLocaleString()} tokens this month · {item.runsLast7Days} runs
				in the last 7 days
			</p>

			<section>
				<h2>No custom interface yet</h2>
				<p className="muted">
					The skill is installed at {item.installed.localPath}. Running it and building its UI arrive in later milestones.
				</p>
			</section>

			<section>
				<h2>Usage log</h2>
				{error && <p className="error">{error}</p>}
				{usage && usage.length === 0 && <p className="muted">No usage recorded.</p>}
				{usage && usage.length > 0 && (
					<table>
						<thead>
							<tr>
								<th>Time</th>
								<th>Action</th>
								<th>Tokens</th>
								<th>Cost</th>
							</tr>
						</thead>
						<tbody>
							{usage.map((u, i) => (
								<tr key={i}>
									<td>{new Date(u.timestamp).toLocaleString()}</td>
									<td>{u.action ?? "—"}</td>
									<td>{u.tokens.toLocaleString()}</td>
									<td>${u.costUsd.toFixed(2)}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}
