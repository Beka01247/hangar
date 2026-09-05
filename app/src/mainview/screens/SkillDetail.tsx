import { useEffect, useState } from "react";
import type { LibrarySkill, SkillAccess, TokenScope, UsageRecord } from "../../shared/types";
import { api, errorMessage, onSkillEvent } from "../rpc";
import { SkillRunner } from "./SkillRunner";

interface Props {
	item: LibrarySkill;
	onBack: () => void;
}

export function SkillDetail({ item: initial, onBack }: Props) {
	const [item, setItem] = useState(initial);
	const [usage, setUsage] = useState<UsageRecord[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [access, setAccess] = useState<SkillAccess | null>(null);

	useEffect(() => {
		return onSkillEvent((e) => {
			if (e.skillId !== item.skill.id || e.event.kind !== "result") return;
			void api.listLibrary().then((list) => {
				const fresh = list.find((l) => l.skill.id === item.skill.id);
				if (fresh) setItem(fresh);
			});
			void api.getSkillUsage({ skillId: item.skill.id }).then(setUsage);
		});
	}, [item.skill.id]);

	useEffect(() => {
		api.getSkillAccess({ skillId: item.skill.id }).then(setAccess).catch((e) => setError(errorMessage(e)));
	}, [item.skill.id]);

	async function toggle(scope: TokenScope, granted: boolean) {
		try {
			setAccess(await api.setSkillAccess({ skillId: item.skill.id, scope, granted }));
		} catch (e) {
			setError(errorMessage(e));
		}
	}

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

			<SkillRunner item={item} />

			<section>
				<h2>Access</h2>
				<p className="muted">
					The skill never sees your keys. It gets its own token ({access?.tokenPreview}) and talks to Claude and GitHub through Hangar at{" "}
					<code>{access?.proxyUrl}</code>. Turn anything off here and the next request gets a 403.{" "}
					<button type="button" onClick={() => api.copySkillToken({ skillId: item.skill.id })}>
						Copy token
					</button>
				</p>
				{access &&
					(["claude", "github", "network"] as TokenScope[]).map((scope) => (
						<label key={scope} style={{ display: "block", marginBottom: 4 }}>
							<input type="checkbox" checked={access.scopes[scope]} onChange={(e) => toggle(scope, e.target.checked)} />{" "}
							{scope === "claude" ? "Claude" : scope === "github" ? "GitHub" : "Network"}
							{scope === "claude" && !access.claudeDirectApiAvailable && (
								<span className="muted"> — subscription mode: only through the Agent SDK inside Hangar</span>
							)}
							{scope === "network" && <span className="muted"> — advisory until the runtime enforces it</span>}
						</label>
					))}
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
