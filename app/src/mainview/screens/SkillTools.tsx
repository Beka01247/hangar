import { useEffect, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillTool, SkillToolResult } from "../../shared/types";
import { Button, Panel } from "../components/ui";
import { api, errorMessage } from "../rpc";

interface JsonSchema {
	type?: string | string[];
	description?: string;
	enum?: unknown[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	default?: unknown;
}

export function SkillTools({ item }: { item: LibrarySkill }) {
	const [tools, setTools] = useState<SkillTool[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api.listSkillTools({ skillId: item.skill.id })
			.then((list) => {
				setTools(list);
				setSelected((s) => s ?? list.find((t) => t.name !== "__error__")?.name ?? null);
			})
			.catch((e) => setError(errorMessage(e)));
	}, [item.skill.id]);

	const tool = tools?.find((t) => t.name === selected) ?? null;

	return (
		<div className="row gap-3 grow" style={{ alignItems: "stretch", minHeight: 0 }}>
			<Panel className="stack gap-1 scroll" style={{ width: 260, flexShrink: 0, padding: 16 }}>
				<span className="label" style={{ padding: "4px 10px 10px" }}>{item.skill.mcpServers?.map((s) => s.name).join(", ")}{tools && ` · ${tools.filter((t) => t.name !== "__error__").length} tools`}</span>
				{tools === null && !error && <span className="small muted" style={{ padding: "0 10px" }}>Starting MCP servers<span className="pulse">…</span></span>}
				{error && <span className="error small" style={{ padding: "0 10px" }}>{error}</span>}
				{tools?.map((t) =>
					t.name === "__error__" ? (
						<span key={t.server} className="error small" style={{ padding: "6px 10px" }}>{t.description}</span>
					) : (
						<button key={`${t.server}/${t.name}`} className={`nav-item ${selected === t.name ? "active" : ""}`} style={{ fontSize: 13, ...(selected === t.name ? { background: "var(--red-glass)", color: "var(--red-soft)" } : {}) }} onClick={() => setSelected(t.name)}>
							{t.name}
						</button>
					),
				)}
			</Panel>
			<Panel className="grow scroll" style={{ padding: "30px 34px" }}>
				{tool ? <ToolForm key={`${tool.server}/${tool.name}`} skillId={item.skill.id} tool={tool} /> : <span className="muted">Pick a tool.</span>}
			</Panel>
		</div>
	);
}

function fieldType(schema: JsonSchema): string {
	const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type;
	return t ?? "string";
}

function ToolForm({ skillId, tool }: { skillId: string; tool: SkillTool }) {
	const schema = tool.inputSchema as JsonSchema;
	const properties = schema.properties ?? {};
	const required = new Set(schema.required ?? []);
	const [values, setValues] = useState<Record<string, string>>({});
	const [result, setResult] = useState<SkillToolResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [ms, setMs] = useState<number | null>(null);

	function coerce(name: string, raw: string | undefined): unknown {
		const prop = properties[name]!;
		if (raw === undefined || raw === "") return undefined;
		switch (fieldType(prop)) {
			case "number":
			case "integer":
				return Number(raw);
			case "boolean":
				return raw === "true";
			case "array":
			case "object":
				try {
					return JSON.parse(raw);
				} catch {
					return fieldType(prop) === "array" ? raw.split(",").map((s) => s.trim()) : raw;
				}
			default:
				return raw;
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		const started = Date.now();
		try {
			const args: Record<string, unknown> = {};
			for (const name of Object.keys(properties)) {
				const v = coerce(name, values[name]);
				if (v !== undefined) args[name] = v;
			}
			setResult(await api.callSkillTool({ skillId, server: tool.server, tool: tool.name, args }));
			setMs(Date.now() - started);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className="stack gap-4" onSubmit={submit}>
			<div className="stack gap-2">
				<span className="label">Tool · {tool.server}</span>
				<span className="turn-cmd">{tool.name}</span>
				{tool.description && <span className="muted" style={{ lineHeight: 1.5, maxWidth: 640 }}>{tool.description}</span>}
			</div>
			{Object.keys(properties).length > 0 ? (
				<div className="grid-2" style={{ maxWidth: 720 }}>
					{Object.entries(properties).map(([name, prop]) => (
						<label key={name} className="field">
							<span>{name}{required.has(name) && " *"}{prop.description && <span className="dim"> — {prop.description}</span>}</span>
							<Field prop={prop} value={values[name] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [name]: v }))} />
						</label>
					))}
				</div>
			) : (
				<span className="small muted">No arguments.</span>
			)}
			<div className="row gap-3">
				<Button variant="primary" type="submit" disabled={busy}>{busy ? "Running…" : "Run"}</Button>
				<span className="small muted">Calls the tool directly, without the model</span>
			</div>
			{error && <span className="error small">{error}</span>}
			{result && (
				<div className="stack gap-2">
					<span className="label">Result{ms !== null && ` · ${(ms / 1000).toFixed(1)}s`}</span>
					<pre className={result.isError ? "error" : ""} style={{ maxHeight: 320 }}>{result.text}</pre>
				</div>
			)}
		</form>
	);
}

function Field({ prop, value, onChange }: { prop: JsonSchema; value: string; onChange: (v: string) => void }) {
	const type = fieldType(prop);
	if (prop.enum || type === "boolean") {
		const options = prop.enum ?? [true, false];
		return (
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				<option value="">—</option>
				{options.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
			</select>
		);
	}
	if (type === "number" || type === "integer") return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
	if (type === "array" || type === "object") return <textarea rows={3} placeholder={type === "array" ? "JSON array or comma-separated" : "JSON object"} value={value} onChange={(e) => onChange(e.target.value)} />;
	return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={prop.default !== undefined ? String(prop.default) : undefined} />;
}
