import { useEffect, useState, type FormEvent } from "react";
import type { StoreResult, StoreSort } from "../../shared/types";
import { api, errorMessage } from "../rpc";

interface Props {
	onInstall: (url: string) => void;
}

export function Store({ onInstall }: Props) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<StoreSort>("stars");
	const [results, setResults] = useState<StoreResult[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function search(q = query, s = sort) {
		setBusy(true);
		setError(null);
		try {
			setResults(await api.searchStore({ query: q, sort: s }));
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void search("", "stars");
	}, []);

	function submit(e: FormEvent) {
		e.preventDefault();
		void search();
	}

	return (
		<div className="page">
			<h1>Store</h1>
			<p className="muted">
				Plain GitHub search limited to repositories Hangar can actually run — ones with a SKILL.md, plugin.json or Claude Code commands. Stars and
				dates come from GitHub; Hangar ranks nothing itself.
			</p>
			<form onSubmit={submit} className="row">
				<input placeholder="Search skills or repositories" value={query} onChange={(e) => setQuery(e.target.value)} />
				<select
					value={sort}
					onChange={(e) => {
						const next = e.target.value as StoreSort;
						setSort(next);
						void search(query, next);
					}}
				>
					<option value="stars">Most stars</option>
					<option value="updated">Recently updated</option>
					<option value="best-match">Best match</option>
				</select>
				<button type="submit" disabled={busy}>
					{busy ? "Searching…" : "Search"}
				</button>
			</form>
			{error && <p className="error">{error}</p>}
			{results && results.length === 0 && <p className="muted">Nothing found.</p>}
			<div className="grid" style={{ marginTop: 12 }}>
				{results?.map((r) => (
					<div key={r.fullName} className="card" onClick={() => !r.installed && onInstall(r.installUrl)}>
						<h3 style={{ margin: "0 0 4px" }}>{r.fullName}</h3>
						<div className="muted" style={{ minHeight: 36 }}>
							{r.description || "No description"}
						</div>
						<div className="muted" style={{ fontSize: 12, margin: "6px 0" }}>
							★ {r.stars.toLocaleString()} · updated {new Date(r.pushedAt).toLocaleDateString()}
							{r.language && ` · ${r.language}`} · {r.manifestPath}
						</div>
						<div className="row">
							<button disabled={r.installed}>{r.installed ? "Installed" : "Install"}</button>
							<button
								onClick={(e) => {
									e.stopPropagation();
									void api.openExternal({ url: r.htmlUrl });
								}}
							>
								GitHub
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
