import { useEffect, useState, type FormEvent } from "react";
import type { InstallProgress, RepoInspection } from "../../shared/types";
import { api, errorMessage, onInstallProgress } from "../rpc";

interface Props {
	onDone: () => void;
	onCancel: () => void;
}

type Stage =
	| { name: "input" }
	| { name: "inspecting"; url: string }
	| { name: "consent"; inspection: RepoInspection }
	| { name: "installing"; inspection: RepoInspection; progress: InstallProgress | null; log: string[] }
	| { name: "done"; inspection: RepoInspection };

export function Install({ onDone, onCancel }: Props) {
	const [url, setUrl] = useState("");
	const [stage, setStage] = useState<Stage>({ name: "input" });
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		return onInstallProgress((p) => {
			setStage((current) => {
				if (current.name !== "installing" || current.inspection.inspectionId !== p.inspectionId) return current;
				const log = p.line ? [...current.log, p.line].slice(-200) : current.log;
				return { ...current, progress: p, log };
			});
		});
	}, []);

	async function inspect(e: FormEvent) {
		e.preventDefault();
		setError(null);
		setStage({ name: "inspecting", url });
		try {
			const inspection = await api.inspectRepo({ url });
			setStage({ name: "consent", inspection });
		} catch (err) {
			setError(errorMessage(err));
			setStage({ name: "input" });
		}
	}

	async function install(inspection: RepoInspection) {
		setError(null);
		setStage({ name: "installing", inspection, progress: null, log: [] });
		try {
			await api.installSkill({ inspectionId: inspection.inspectionId });
			setStage({ name: "done", inspection });
		} catch (err) {
			setError(errorMessage(err));
			setStage({ name: "consent", inspection });
		}
	}

	function cancel() {
		if (stage.name === "consent") void api.discardInspection({ inspectionId: stage.inspection.inspectionId });
		onCancel();
	}

	return (
		<div className="page">
			<button onClick={cancel}>← Library</button>
			<h1>Install a skill</h1>

			{(stage.name === "input" || stage.name === "inspecting") && (
				<form onSubmit={inspect}>
					<p className="muted">Paste a link to a GitHub repository. Hangar reads it, shows what it asks for, and installs nothing until you confirm.</p>
					<input
						placeholder="https://github.com/owner/repo"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={stage.name === "inspecting"}
						autoFocus
					/>
					{error && <p className="error">{error}</p>}
					<button type="submit" disabled={stage.name === "inspecting" || !url.trim()}>
						{stage.name === "inspecting" ? "Reading repository…" : "Inspect"}
					</button>
				</form>
			)}

			{stage.name === "consent" && (
				<Consent inspection={stage.inspection} error={error} onInstall={() => install(stage.inspection)} onCancel={cancel} />
			)}

			{stage.name === "installing" && (
				<section>
					<h2>Installing {stage.inspection.name}</h2>
					<p className="muted">{stage.progress?.message ?? "Starting…"}</p>
					{stage.log.length > 0 && (
						<pre style={{ maxHeight: 240, overflow: "auto", fontSize: 12, background: "#f5f5f5", padding: 8 }}>{stage.log.join("\n")}</pre>
					)}
				</section>
			)}

			{stage.name === "done" && (
				<section>
					<h2>{stage.inspection.name} is installed</h2>
					<p className="muted">It is now in your library. Running it arrives in the next milestone.</p>
					<button onClick={onDone}>Open library</button>
				</section>
			)}
		</div>
	);
}

function Consent({ inspection, error, onInstall, onCancel }: { inspection: RepoInspection; error: string | null; onInstall: () => void; onCancel: () => void }) {
	const { meta } = inspection;
	const commitDate = meta.latestCommitDate ? new Date(meta.latestCommitDate).toLocaleDateString() : "unknown";
	const byType = (type: string) => inspection.permissions.filter((p) => p.type === type);

	return (
		<div>
			<section>
				<h2>{inspection.name}</h2>
				<p>{inspection.description || <span className="muted">No description</span>}</p>
				<p className="muted">
					{inspection.repoUrl} · {meta.stars.toLocaleString()} stars · last commit {commitDate} · by {meta.ownerLogin} ({meta.ownerType})
					{meta.license && ` · ${meta.license}`}
					{meta.isPrivate && " · private"}
				</p>
				<p className="muted">
					Format: {inspection.manifestType} · entry: {inspection.entryPoint}
					{inspection.dependencies.node && " · Node dependencies"}
					{inspection.dependencies.python && " · Python dependencies"}
				</p>
				{inspection.alreadyInstalled && <p className="error">Already installed — installing again will replace the current copy.</p>}
			</section>

			<section>
				<h2>What it asks for</h2>
				<p className="muted">Read from the manifest, README and dependencies. Hangar does not verify the code itself.</p>
				<PermissionList title="Secrets and environment variables" items={[...byType("env"), ...byType("claude"), ...byType("github")].map((p) => p.scope)} empty="none found" />
				<PermissionList title="Network" items={byType("network").map((p) => p.scope)} empty="no network use detected" />
				<PermissionList title="Files" items={byType("filesystem").map((p) => p.scope)} empty="no file writes detected" />
				{inspection.mcpServers.length > 0 && (
					<PermissionList title="MCP servers" items={inspection.mcpServers.map((s) => `${s.name} (${s.type}) ${s.target}`)} empty="" />
				)}
			</section>

			{error && <p className="error">{error}</p>}
			<div className="row">
				<button onClick={onInstall}>Install at my own risk</button>
				{inspection.readmeUrl && (
					<button onClick={() => api.openExternal({ url: inspection.readmeUrl! })}>Read the original on GitHub</button>
				)}
				<button onClick={onCancel}>Cancel</button>
			</div>
		</div>
	);
}

function PermissionList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
	return (
		<div style={{ marginBottom: 8 }}>
			<strong>{title}:</strong>{" "}
			{items.length === 0 ? <span className="muted">{empty}</span> : items.map((item) => <code key={item} style={{ marginRight: 8 }}>{item}</code>)}
		</div>
	);
}
