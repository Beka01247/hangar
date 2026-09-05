import { useEffect, useState } from "react";
import { Button, Panel } from "../components/ui";
import { api, errorMessage } from "../rpc";

export function SkillLog({ skillId }: { skillId: string }) {
	const [lines, setLines] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const load = () => api.getSkillLog({ skillId, tailLines: 300 }).then(setLines).catch((e) => setError(errorMessage(e)));
	useEffect(() => {
		void load();
	}, [skillId]);
	return (
		<Panel className="pad stack gap-2 grow" style={{ minHeight: 0 }}>
			<div className="row between"><h2>Raw log</h2><Button variant="ghost" size="sm" onClick={load}>Refresh</Button></div>
			<span className="small muted">Every message the skill process produced, as Hangar received it. This is the only place to see exactly what it did.</span>
			{error && <span className="error small">{error}</span>}
			<pre className="grow" style={{ minHeight: 0 }}>{lines === null ? "Loading…" : lines.length === 0 ? "Log is empty." : lines.join("\n")}</pre>
		</Panel>
	);
}
