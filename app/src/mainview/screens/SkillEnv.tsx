import { useEffect, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillEnvVar } from "../../shared/types";
import { Button } from "../components/ui";
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
		<div className="stack gap-2">
			<h2>Environment</h2>
			<span className="small muted">Secrets this skill needs. Kept in the keychain, passed only to this skill's processes. Restart the skill after changing them.</span>
			{error && <span className="error small">{error}</span>}
			{vars?.map((v) => (
				<div key={v.name} className="row gap-2 small" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
					<code>{v.name}</code>
					<span className={v.set ? "green" : "dim"}>{v.set ? "set" : "not set"}</span>
					{v.requiredBy.length > 0 && <span className="dim">used by {v.requiredBy.join(", ")}</span>}
					<span className="grow" />
					<Button variant="ghost" size="sm" onClick={() => { setEditing(v.name); setValue(""); }}>{v.set ? "Change" : "Set"}</Button>
					{v.set && <Button variant="ghost" size="sm" onClick={() => api.setSkillEnv({ skillId: item.skill.id, name: v.name, value: null }).then(load)}>Clear</Button>}
				</div>
			))}
			<form onSubmit={save} className="row gap-2">
				{editing ? <code style={{ minWidth: 160 }}>{editing}</code> : <input placeholder="NEW_VARIABLE" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: 200 }} />}
				<input type="password" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
				<Button size="sm" type="submit">Save</Button>
				{editing && <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>}
			</form>
		</div>
	);
}
