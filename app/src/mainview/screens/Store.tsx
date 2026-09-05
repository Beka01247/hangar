import { useEffect, useState, type FormEvent } from "react";
import type { StoreResult, StoreSort } from "../../shared/types";
import { Button, Icon, Panel, Segment, Tile, tileTone } from "../components/ui";
import { api, errorMessage } from "../rpc";

export function Store({ onInstall }: { onInstall: (url: string) => void }) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<StoreSort>("stars");
	const [results, setResults] = useState<StoreResult[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function search(q = query, s = sort) {
		if (/github\.com\//.test(q)) return onInstall(q.trim());
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
		<main className="main">
			<div className="row between">
				<div className="stack gap-1">
					<h1>Store</h1>
					<span className="muted">Open repositories Hangar can run. Stars and dates come from GitHub; Hangar ranks nothing itself.</span>
				</div>
				<Segment
					value={sort}
					options={[{ value: "stars", label: "Most stars" }, { value: "updated", label: "Updated" }, { value: "best-match", label: "Match" }]}
					onChange={(s) => { setSort(s); void search(query, s); }}
				/>
			</div>
			<form className="pill-input" onSubmit={submit}>
				<Icon name="search" size={18} stroke="var(--fg-55)" />
				<input placeholder="Search skills — or paste a GitHub URL" value={query} onChange={(e) => setQuery(e.target.value)} />
				<Button variant="ghost" size="sm" type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</Button>
			</form>
			{error && <span className="error">{error}</span>}
			<div className="scroll" style={{ paddingBottom: 24 }}>
				{busy && results === null && <span className="muted">Searching GitHub…</span>}
				{results && results.length === 0 && !busy && <span className="muted">Nothing found.</span>}
				{results && results.length > 0 && (
					<div className="grid-3">
						{results.map((r) => (
							<Panel key={r.fullName} className="card" style={{ padding: 20, gap: 14 }}>
								<div onClick={() => !r.installed && onInstall(r.installUrl)} className="stack gap-3">
									<div className="row gap-2">
										<Tile tone={tileTone(r.fullName)} size={44} />
										<div className="stack" style={{ minWidth: 0 }}>
											<span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fullName.split("/")[1]}</span>
											<span className="tiny muted">{r.ownerLogin} · ★ {r.stars.toLocaleString()} · {r.manifestPath}</span>
										</div>
									</div>
									<span className="small" style={{ color: "var(--fg-70)", minHeight: 58, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
										{r.description || "No description"}
									</span>
									<div className="row between">
										<span className="chip" style={{ opacity: r.installed ? 0.5 : 1 }}>{r.installed ? "Installed" : "Install"}</span>
										<button className="tiny muted" onClick={(e) => { e.stopPropagation(); void api.openExternal({ url: r.htmlUrl }); }}>GitHub ↗</button>
									</div>
								</div>
							</Panel>
						))}
					</div>
				)}
			</div>
		</main>
	);
}
