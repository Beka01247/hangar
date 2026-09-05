import { useState } from "react";
import type { LibrarySkill, UpdateCheck } from "../../shared/types";
import { api, errorMessage } from "../rpc";

export function SkillUpdate({ item, onUpdated }: { item: LibrarySkill; onUpdated: () => void }) {
	const [check, setCheck] = useState<UpdateCheck | null>(null);
	const [busy, setBusy] = useState<"check" | "apply" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);

	async function run(action: "check" | "apply") {
		setBusy(action);
		setError(null);
		try {
			if (action === "check") setCheck(await api.checkSkillUpdate({ skillId: item.skill.id }));
			else {
				const result = await api.applySkillUpdate({ skillId: item.skill.id });
				setDone(`Updated to ${result.commitHash.slice(0, 7)}`);
				setCheck(null);
				onUpdated();
			}
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(null);
		}
	}

	return (
		<section>
			<h2>Version</h2>
			<p className="muted">
				Installed commit {item.installed.commitHash.slice(0, 7)} · installed {new Date(item.installed.installedAt).toLocaleDateString()}
				{item.skill.lastChecked && ` · last checked ${new Date(item.skill.lastChecked).toLocaleString()}`}
			</p>
			<div className="row">
				<button onClick={() => run("check")} disabled={busy !== null}>
					{busy === "check" ? "Checking…" : "Check for updates"}
				</button>
				{check && !check.upToDate && (
					<button onClick={() => run("apply")} disabled={busy !== null}>
						{busy === "apply" ? "Updating…" : check.manifestChanged ? "Accept new permissions and update" : "Update"}
					</button>
				)}
			</div>
			{error && <p className="error">{error}</p>}
			{done && <p>{done}</p>}
			{check?.upToDate && <p className="muted">Up to date.</p>}
			{check && !check.upToDate && (
				<div style={{ marginTop: 8 }}>
					<p>
						{check.commitsBehind} new commit{check.commitsBehind === 1 ? "" : "s"}
						{check.latestDate && `, latest ${new Date(check.latestDate).toLocaleDateString()}`} ({check.latestSha.slice(0, 7)}).
					</p>
					{check.manifestChanged ? (
						<div>
							<p className="error">The manifest changed — review what the new version asks for before updating:</p>
							<p>
								{check.newPermissions.length === 0 ? (
									<span className="muted">no secrets, network or file access detected</span>
								) : (
									check.newPermissions.map((p) => (
										<code key={`${p.type}:${p.scope}`} style={{ marginRight: 8 }}>
											{p.type}: {p.scope}
										</code>
									))
								)}
							</p>
						</div>
					) : (
						<p className="muted">Manifest unchanged — permissions stay as they are.</p>
					)}
					<details>
						<summary className="muted">Changed files ({check.changedFiles.length})</summary>
						<pre style={{ fontSize: 11 }}>{check.changedFiles.join("\n")}</pre>
					</details>
					<p className="muted">Your local files inside the skill folder are kept (stashed and re-applied).</p>
				</div>
			)}
		</section>
	);
}
