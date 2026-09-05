import { useEffect, useState, type FormEvent } from "react";
import type { InstallProgress, RepoInspection } from "../../shared/types";
import { Button, Icon, Modal, Tile, tileTone } from "../components/ui";
import { api, errorMessage, onInstallProgress } from "../rpc";

interface Props {
	initialUrl?: string;
	onClose: () => void;
	onInstalled: () => void;
}

type Stage =
	| { name: "input" }
	| { name: "inspecting" }
	| { name: "consent"; inspection: RepoInspection }
	| { name: "installing"; inspection: RepoInspection; progress: InstallProgress | null; log: string[] }
	| { name: "done"; inspection: RepoInspection };

export function InstallDialog({ initialUrl, onClose, onInstalled }: Props) {
	const [url, setUrl] = useState(initialUrl ?? "");
	const [stage, setStage] = useState<Stage>({ name: "input" });
	const [error, setError] = useState<string | null>(null);

	useEffect(() => onInstallProgress((p) => {
		setStage((s) => (s.name === "installing" && s.inspection.inspectionId === p.inspectionId ? { ...s, progress: p, log: p.line ? [...s.log, p.line].slice(-200) : s.log } : s));
	}), []);

	async function inspect(target = url) {
		setError(null);
		setStage({ name: "inspecting" });
		try {
			setStage({ name: "consent", inspection: await api.inspectRepo({ url: target }) });
		} catch (e) {
			setError(errorMessage(e));
			setStage({ name: "input" });
		}
	}

	useEffect(() => {
		if (initialUrl) void inspect(initialUrl);
	}, []);

	async function install(inspection: RepoInspection) {
		setError(null);
		setStage({ name: "installing", inspection, progress: null, log: [] });
		try {
			await api.installSkill({ inspectionId: inspection.inspectionId });
			setStage({ name: "done", inspection });
		} catch (e) {
			setError(errorMessage(e));
			setStage({ name: "consent", inspection });
		}
	}

	function close() {
		if (stage.name === "consent") void api.discardInspection({ inspectionId: stage.inspection.inspectionId });
		if (stage.name !== "installing") onClose();
	}

	return (
		<Modal onClose={close}>
			{(stage.name === "input" || stage.name === "inspecting") && (
				<form className="stack gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void inspect(); }}>
					<div className="stack gap-1">
						<span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>Install a skill</span>
						<span className="small muted">Paste a GitHub link. Hangar reads it and shows what it asks for before anything runs.</span>
					</div>
					<input placeholder="https://github.com/owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} disabled={stage.name === "inspecting"} autoFocus />
					{error && <span className="error small">{error}</span>}
					<div className="row gap-2" style={{ justifyContent: "flex-end" }}>
						<Button variant="ghost" onClick={close}>Cancel</Button>
						<Button variant="primary" type="submit" disabled={stage.name === "inspecting" || !url.trim()}>{stage.name === "inspecting" ? "Reading repository…" : "Continue"}</Button>
					</div>
				</form>
			)}
			{stage.name === "consent" && <Consent inspection={stage.inspection} error={error} onInstall={() => install(stage.inspection)} onCancel={close} />}
			{stage.name === "installing" && (
				<div className="stack gap-3">
					<span style={{ fontSize: 20, fontWeight: 700 }}>Installing {stage.inspection.name}</span>
					<span className="small muted">{stage.progress?.message ?? "Starting…"}</span>
					{stage.log.length > 0 && <pre style={{ maxHeight: 220 }}>{stage.log.join("\n")}</pre>}
				</div>
			)}
			{stage.name === "done" && (
				<div className="stack gap-3">
					<span style={{ fontSize: 20, fontWeight: 700 }}>{stage.inspection.name} is installed</span>
					<span className="small muted">It is in your library now.</span>
					<div className="row" style={{ justifyContent: "flex-end" }}><Button variant="primary" onClick={onInstalled}>Open library</Button></div>
				</div>
			)}
		</Modal>
	);
}

function Consent({ inspection, error, onInstall, onCancel }: { inspection: RepoInspection; error: string | null; onInstall: () => void; onCancel: () => void }) {
	const { meta } = inspection;
	const by = (t: string) => inspection.permissions.filter((p) => p.type === t).map((p) => p.scope);
	const secrets = [...by("env"), ...by("claude"), ...by("github")];
	const format = { "plugin.json": "Agent plugin", "SKILL.md": "Skill", "claude-project": `Claude Code project${inspection.commands.length ? `, ${inspection.commands.length} commands` : ""}`, fallback: `Runs via ${inspection.entryPoint}` }[inspection.manifestType];
	return (
		<>
			<div className="row gap-3">
				<Tile tone={inspection.manifestType === "claude-project" ? "red" : tileTone(inspection.skillId)} size={52} />
				<div className="stack gap-1 grow">
					<span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>{inspection.name}</span>
					<span className="small muted">
						{meta.ownerLogin} · ★ {meta.stars.toLocaleString()} · last commit {meta.latestCommitDate ? new Date(meta.latestCommitDate).toLocaleDateString() : "unknown"}
						{meta.license && ` · ${meta.license}`} · {format}
					</span>
				</div>
			</div>
			{inspection.description && <span className="small" style={{ color: "var(--fg-70)", lineHeight: 1.5 }}>{inspection.description}</span>}
			<div className="stack gap-2" style={{ padding: "18px 20px", borderRadius: 16, background: "var(--glass)", border: "1px solid var(--line)" }}>
				<span className="label">What it asks for</span>
				<Row label="Secrets">{secrets.length ? secrets.map((s) => <code key={s} style={{ marginRight: 8 }}>{s}</code>) : <span className="muted">none found</span>}</Row>
				<Row label="Network">{by("network").length ? by("network").join(", ") : <span className="muted">no network use detected</span>}</Row>
				<Row label="Files">{by("filesystem").length ? by("filesystem").join(", ") : <span className="muted">no file writes detected</span>}</Row>
				{inspection.mcpServers.length > 0 && <Row label="MCP">{inspection.mcpServers.map((s) => `${s.name} (${s.type})`).join(", ")}</Row>}
				<Row label="Setup">
					{inspection.dependencies.node || inspection.dependencies.python
						? `${[inspection.dependencies.node && "Node", inspection.dependencies.python && "Python"].filter(Boolean).join(" and ")} dependencies go into an isolated folder`
						: "no dependencies to install"}
				</Row>
			</div>
			{inspection.alreadyInstalled && <span className="small red">Already installed — installing again replaces the current copy.</span>}
			<span className="small" style={{ color: "var(--fg-55)", lineHeight: 1.5 }}>Hangar installs code from an open repository and has not reviewed it. It runs behind its own token with the access above; you can revoke any of it later.</span>
			{error && <span className="error small">{error}</span>}
			<div className="row gap-2" style={{ justifyContent: "flex-end" }}>
				{inspection.readmeUrl && (
					<button className="small red row gap-1" style={{ marginRight: "auto" }} onClick={() => api.openExternal({ url: inspection.readmeUrl! })}>
						Read the original on GitHub <Icon name="external" size={12} />
					</button>
				)}
				<Button variant="ghost" onClick={onCancel}>Cancel</Button>
				<Button variant="primary" onClick={onInstall}>Install</Button>
			</div>
		</>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="row small" style={{ gap: 14, alignItems: "flex-start" }}>
			<span className="muted" style={{ width: 90, flexShrink: 0 }}>{label}</span>
			<span>{children}</span>
		</div>
	);
}
