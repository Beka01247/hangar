import { useEffect, useState } from "react";
import type { LibrarySkill, SkillAccess, TokenScope, UpdateCheck } from "../../shared/types";
import { Button, Icon, Panel, Tile, Toggle, money, tileTone } from "../components/ui";
import { api, errorMessage, onSkillEvent } from "../rpc";
import { SkillEnv } from "./SkillEnv";
import { SkillLog } from "./SkillLog";
import { SkillRunner } from "./SkillRunner";
import { SkillTools } from "./SkillTools";

type Tab = "run" | "tools" | "access" | "log";

export function SkillDetail({ item: initial, onBack }: { item: LibrarySkill; onBack: () => void }) {
	const [item, setItem] = useState(initial);
	const [tab, setTab] = useState<Tab>("run");
	const [status, setStatus] = useState("stopped");
	const [access, setAccess] = useState<SkillAccess | null>(null);
	const [check, setCheck] = useState<UpdateCheck | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const id = item.skill.id;
	const hasTools = (item.skill.mcpServers?.length ?? 0) > 0;

	const refreshItem = () => api.listLibrary().then((list) => { const fresh = list.find((l) => l.skill.id === id); if (fresh) setItem(fresh); });

	useEffect(() => {
		api.getSkillAccess({ skillId: id }).then(setAccess).catch((e) => setError(errorMessage(e)));
		return onSkillEvent((e) => {
			if (e.skillId !== id) return;
			if (e.event.kind === "status") setStatus(e.event.status);
			if (e.event.kind === "result") void refreshItem();
		});
	}, [id]);

	async function toggle(scope: TokenScope, granted: boolean) {
		try {
			setAccess(await api.setSkillAccess({ skillId: id, scope, granted }));
		} catch (e) {
			setError(errorMessage(e));
		}
	}
	async function checkUpdate() {
		setBusy("check");
		setError(null);
		try {
			setCheck(await api.checkSkillUpdate({ skillId: id }));
			await refreshItem();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(null);
		}
	}
	async function applyUpdate() {
		setBusy("update");
		setError(null);
		try {
			await api.applySkillUpdate({ skillId: id });
			setCheck(null);
			await refreshItem();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(null);
		}
	}

	const tabs: { id: Tab; label: string }[] = [{ id: "run", label: "Run" }, ...(hasTools ? [{ id: "tools" as Tab, label: "Tools" }] : []), { id: "access", label: "Access" }, { id: "log", label: "Log" }];
	const updateAvailable = item.installed.updateAvailable;

	return (
		<main className="main" style={{ gap: 18, paddingTop: 22 }}>
			<div className="row gap-3">
				<Button variant="ghost" size="sm" onClick={onBack}><Icon name="back" size={14} /> Library</Button>
				<Tile tone={item.skill.manifestType === "claude-project" ? "red" : tileTone(id)} size={56} />
				<div className="stack gap-1 grow" style={{ minWidth: 0 }}>
					<span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.7 }}>{item.skill.name}</span>
					<span className="small muted">
						{item.skill.repoOwner}/{item.skill.repoName} · {item.official ? "yours" : "unofficial · community"} ·{" "}
						<span className={status === "running" ? "red" : status === "idle" ? "green" : ""}>{status}</span>
					</span>
				</div>
				<div className="segment">
					{tabs.map((t) => (
						<button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
					))}
				</div>
				{updateAvailable ? <Button onClick={check ? applyUpdate : checkUpdate} disabled={busy !== null}>{busy ? "…" : check ? (check.manifestChanged ? "Accept and update" : "Update") : "Update"}</Button> : null}
			</div>
			{error && <span className="error small">{error}</span>}

			<div className="row gap-3 grow" style={{ alignItems: "stretch", minHeight: 0 }}>
				<div className="grow stack" style={{ minWidth: 0 }}>
					{tab === "run" && <SkillRunner item={item} onStatus={setStatus} />}
					{tab === "tools" && <SkillTools item={item} />}
					{tab === "access" && (
						<Panel className="pad scroll stack gap-4">
							<div className="stack gap-2">
								<h2>Access</h2>
								<span className="small muted">The skill never sees your keys. It gets its own token{access && ` (${access.tokenPreview})`} and reaches Claude and GitHub through Hangar at <code>{access?.proxyUrl}</code>. Turn anything off and the next request is refused.</span>
								{access && (["claude", "github", "network"] as TokenScope[]).map((s) => (
									<div key={s} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
										<span>{s === "claude" ? "Claude" : s === "github" ? "GitHub" : "Network"}{s === "claude" && !access.claudeDirectApiAvailable && <span className="tiny muted"> · subscription: through the Agent SDK only</span>}</span>
										<Toggle on={access.scopes[s]} onChange={(v) => toggle(s, v)} />
									</div>
								))}
								<Button variant="ghost" size="sm" onClick={() => api.copySkillToken({ skillId: id })} style={{ alignSelf: "flex-start" }}><Icon name="copy" size={13} /> Copy token</Button>
							</div>
							<SkillEnv item={item} />
							<div className="stack gap-2">
								<h2>Version</h2>
								<span className="small muted">Installed commit {item.installed.commitHash.slice(0, 7)} · {new Date(item.installed.installedAt).toLocaleDateString()}{item.skill.lastChecked && ` · checked ${new Date(item.skill.lastChecked).toLocaleString()}`}</span>
								<div className="row gap-2">
									<Button size="sm" onClick={checkUpdate} disabled={busy !== null}>{busy === "check" ? "Checking…" : "Check for updates"}</Button>
									{check && !check.upToDate && <Button size="sm" variant="primary" onClick={applyUpdate} disabled={busy !== null}>{busy === "update" ? "Updating…" : check.manifestChanged ? "Accept new permissions and update" : "Update"}</Button>}
								</div>
								{check?.upToDate && <span className="small muted">Up to date.</span>}
								{check && !check.upToDate && <UpdateSummary check={check} />}
							</div>
							<div className="stack gap-2">
								<h2>Remove</h2>
								<Button size="sm" variant="ghost" onClick={() => (confirmRemove ? void api.uninstallSkill({ skillId: id }).then(onBack) : setConfirmRemove(true))} style={{ alignSelf: "flex-start", color: "var(--red-soft)" }}>
									{confirmRemove ? "Click again to delete the folder" : "Uninstall"}
								</Button>
							</div>
						</Panel>
					)}
					{tab === "log" && <SkillLog skillId={id} />}
				</div>

				<div className="stack gap-3" style={{ width: 300, flexShrink: 0 }}>
					<Panel className="pad stack gap-3">
						<h2>Access</h2>
						{access && (["claude", "network", "github"] as TokenScope[]).map((s) => (
							<div key={s} className="row between"><span>{s === "claude" ? "Claude" : s === "github" ? "GitHub" : "Network"}</span><Toggle on={access.scopes[s]} onChange={(v) => toggle(s, v)} /></div>
						))}
					</Panel>
					{(updateAvailable || (check && !check.upToDate)) && (
						<Panel red className="pad stack gap-2">
							<span className="small" style={{ fontWeight: 600, color: "var(--red-tint)" }}>Update available</span>
							{check && !check.upToDate ? <UpdateSummary check={check} /> : <span className="small" style={{ color: "var(--fg-70)" }}>{updateAvailable?.manifestChanged ? "The manifest changed — review before updating." : "Newer commits on GitHub."}</span>}
							<button className="small" style={{ fontWeight: 600, textAlign: "left" }} onClick={check ? applyUpdate : checkUpdate} disabled={busy !== null}>{check ? (check.manifestChanged ? "Accept and update →" : "Update →") : "Review changes →"}</button>
						</Panel>
					)}
					<Panel className="pad stack gap-1">
						<h2>This month</h2>
						<span className="big">{money(item.monthSpendUsd)}</span>
						<span className="small muted">{item.monthTokens.toLocaleString()} tokens · {item.runsLast7Days} runs this week</span>
					</Panel>
				</div>
			</div>
		</main>
	);
}

function UpdateSummary({ check }: { check: UpdateCheck }) {
	return (
		<div className="stack gap-1 small" style={{ color: "var(--fg-70)", lineHeight: 1.45 }}>
			<span>{check.commitsBehind} new commit{check.commitsBehind === 1 ? "" : "s"}{check.latestDate && `, latest ${new Date(check.latestDate).toLocaleDateString()}`} ({check.latestSha.slice(0, 7)}).</span>
			{check.manifestChanged ? (
				<span>The manifest changed — it now asks for: {check.newPermissions.length ? check.newPermissions.map((p) => <code key={`${p.type}:${p.scope}`} style={{ marginRight: 6 }}>{p.type}: {p.scope}</code>) : "nothing detected"}</span>
			) : (
				<span>Manifest unchanged — permissions stay as they are.</span>
			)}
			<span className="dim">Your local files inside the skill folder are kept.</span>
		</div>
	);
}
