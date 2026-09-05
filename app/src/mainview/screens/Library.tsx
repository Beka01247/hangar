import { useEffect, useState } from "react";
import type { AppState, LibrarySkill } from "../../shared/types";
import { api, errorMessage, onLibraryChanged } from "../rpc";

interface Props {
	state: AppState;
	onOpenSkill: (item: LibrarySkill) => void;
	onInstall: () => void;
	onAccountsChanged: () => Promise<void>;
}

export function Library({ state, onOpenSkill, onInstall, onAccountsChanged }: Props) {
	const [items, setItems] = useState<LibrarySkill[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const list = await api.listLibrary();
				if (!cancelled) setItems(list);
			} catch (e) {
				if (!cancelled) setError(errorMessage(e));
			}
		}
		void load();
		const unsubscribe = onLibraryChanged(() => void load());
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	return (
		<div className="page">
			<div className="row" style={{ justifyContent: "space-between" }}>
				<h1>Library</h1>
				<span className="muted">
					@{state.onboarding.github?.login}{" "}
					<button onClick={() => api.disconnectGitHub().then(onAccountsChanged)}>Sign out</button>
				</span>
			</div>
			<p className="muted">Skills you installed. Each opens as its own app.</p>

			{error && <p className="error">{error}</p>}
			{items === null && !error && <p className="muted">Loading…</p>}
			{items && items.length === 0 && <p className="muted">Nothing installed yet.</p>}

			<div className="grid">
				{items?.map((item) => (
					<SkillCard key={item.skill.id} item={item} onOpen={() => onOpenSkill(item)} />
				))}
				<div className="card" onClick={onInstall}>
					+ Install skill
				</div>
			</div>
			<p className="muted" style={{ marginTop: 24, fontSize: 12 }}>
				Data: {state.dataDir}
			</p>
		</div>
	);
}

function SkillCard({ item, onOpen }: { item: LibrarySkill; onOpen: () => void }) {
	return (
		<div className="card" onClick={onOpen}>
			<h3 style={{ margin: "0 0 4px" }}>{item.skill.name}</h3>
			<div className="muted">
				{item.skill.repoOwner}/{item.skill.repoName}
			</div>
			{!item.official && <span className="badge">unofficial · community</span>}
			{item.anomaly && <span className="badge error" style={{ marginLeft: 4 }}>unusual spend</span>}
			{item.installed.updateAvailable && <span className="badge" style={{ marginLeft: 4 }}>update available</span>}
			<div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
				<span>{item.runsLast7Days} runs / week</span>
				<span>${item.monthSpendUsd.toFixed(2)} this month</span>
			</div>
			<div className="muted" style={{ fontSize: 12 }}>
				status: {item.installed.status}
			</div>
		</div>
	);
}
