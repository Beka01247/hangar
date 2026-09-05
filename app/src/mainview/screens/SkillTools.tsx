import { useEffect, useState, type FormEvent } from "react";
import type { LibrarySkill, SkillTool, SkillToolResult } from "../../shared/types";
import { api, errorMessage } from "../rpc";

interface JsonSchema {
	type?: string | string[];
	description?: string;
	enum?: unknown[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	default?: unknown;
}

export function SkillTools({ item }: { item: LibrarySkill }) {
	const [tools, setTools] = useState<SkillTool[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const servers = item.skill.mcpServers ?? [];

	useEffect(() => {
		if (servers.length === 0) return;
		api.listSkillTools({ skillId: item.skill.id }).then(setTools).catch((e) => setError(errorMessage(e)));
	}, [item.skill.id, servers.length]);

	if (servers.length === 0) return null;

	return (
		<section>
			<h2>Tools</h2>
			<p className="muted">
				Built from the tool schemas of {servers.map((s) => s.name).join(", ")}. Each form calls the tool directly, without the model.
			</p>
			{error && <p className="error">{error}</p>}
			{tools === null && !error && <p className="muted">Starting MCP servers…</p>}
			{tools?.map((tool) =>
				tool.name === "__error__" ? (
					<p key={tool.server} className="error">
						{tool.description}
					</p>
				) : (
					<ToolForm key={`${tool.server}/${tool.name}`} skillId={item.skill.id} tool={tool} />
				),
			)}
		</section>
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
		try {
			const args: Record<string, unknown> = {};
			for (const name of Object.keys(properties)) {
				const v = coerce(name, values[name]);
				if (v !== undefined) args[name] = v;
			}
			setResult(await api.callSkillTool({ skillId, server: tool.server, tool: tool.name, args }));
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<details style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
			<summary>
				<strong>{tool.name}</strong> <span className="muted">· {tool.server}</span>
				{tool.description && <div className="muted" style={{ fontSize: 12, marginLeft: 16 }}>{tool.description}</div>}
			</summary>
			<form onSubmit={submit} style={{ marginTop: 8 }}>
				{Object.entries(properties).map(([name, prop]) => (
					<label key={name} style={{ display: "block", marginBottom: 6 }}>
						<span style={{ fontSize: 12 }}>
							{name}
							{required.has(name) && " *"}
							{prop.description && <span className="muted"> — {prop.description}</span>}
						</span>
						<Field name={name} prop={prop} value={values[name] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [name]: v }))} />
					</label>
				))}
				{Object.keys(properties).length === 0 && <p className="muted">No arguments.</p>}
				<button type="submit" disabled={busy}>
					{busy ? "Running…" : `Run ${tool.name}`}
				</button>
			</form>
			{error && <p className="error">{error}</p>}
			{result && (
				<pre className={result.isError ? "error" : undefined} style={{ maxHeight: 240, overflow: "auto", fontSize: 12, background: "#f5f5f5", padding: 8 }}>
					{result.text}
				</pre>
			)}
		</details>
	);
}

function Field({ name, prop, value, onChange }: { name: string; prop: JsonSchema; value: string; onChange: (v: string) => void }) {
	const type = fieldType(prop);
	if (prop.enum) {
		return (
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				<option value="">—</option>
				{prop.enum.map((opt) => (
					<option key={String(opt)} value={String(opt)}>
						{String(opt)}
					</option>
				))}
			</select>
		);
	}
	if (type === "boolean") {
		return (
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				<option value="">—</option>
				<option value="true">true</option>
				<option value="false">false</option>
			</select>
		);
	}
	if (type === "number" || type === "integer") {
		return <input type="number" name={name} value={value} onChange={(e) => onChange(e.target.value)} />;
	}
	if (type === "array" || type === "object") {
		return <textarea name={name} rows={3} placeholder={type === "array" ? "JSON array or comma-separated" : "JSON object"} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", font: "inherit" }} />;
	}
	return <input name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder={prop.default !== undefined ? String(prop.default) : undefined} />;
}
