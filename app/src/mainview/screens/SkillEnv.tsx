import { useEffect, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillEnvVar } from "../../shared/types";
import { api, errorMessage } from "../rpc";

export function SkillEnv({ item }: { item: LibrarySkill }) {
	const [vars, setVars] = useState<SkillEnvVar[] | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [value, setValue] = useState("");
	const [newName, setNewName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const load = () => api.listSkillEnv({ skillId: item.skill.id }).then(setVars).catch((e) => setError(errorMessage(e)));

	useEffect(() => {
		void load();
	}, [item.skill.id]);

	async function save(e: FormEvent) {
		e.preventDefault();
		const name = editing ?? newName.trim().toUpperCase();
		if (!name) return;
		try {
			await api.setSkillEnv({ skillId: item.skill.id, name, value: value || null });
			setEditing(null);
			setValue("");
			setNewName("");
			await load();
		} catch (err) {
			setError(errorMessage(err));
		}
	}

	return (
		<section>
			<h2>Environment</h2>
			<p className="muted">Secrets this skill needs. Stored in the keychain, passed only to this skill's processes. Restart the skill after changing them.</p>
			{error && <p className="error">{error}</p>}
			{vars?.map((v) => (
				<div key={v.name} className="row" style={{ marginBottom: 4 }}>
					<code>{v.name}</code>
					<span className={v.set ? undefined : "muted"}>{v.set ? "set" : "not set"}</span>
					{v.requiredBy.length > 0 && <span className="muted">used by {v.requiredBy.join(", ")}</span>}
					<button
						type="button"
						onClick={() => {
							setEditing(v.name);
							setValue("");
						}}
					>
						{v.set ? "Change" : "Set"}
					</button>
					{v.set && (
						<button type="button" onClick={() => api.setSkillEnv({ skillId: item.skill.id, name: v.name, value: null }).then(load)}>
							Clear
						</button>
					)}
				</div>
			))}
			<form onSubmit={save} className="row" style={{ marginTop: 8 }}>
				{editing ? <code>{editing}</code> : <input placeholder="NEW_VARIABLE" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: 200 }} />}
				<input type="password" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
				<button type="submit">Save</button>
				{editing && (
					<button type="button" onClick={() => setEditing(null)}>
						Cancel
					</button>
				)}
			</form>
		</section>
	);
}
