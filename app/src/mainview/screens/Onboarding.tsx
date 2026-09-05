import { useEffect, useState, type FormEvent } from "react";
import type { GitHubLoginProgress, OnboardingState, SetupTokenProgress } from "../../shared/types";
import { Button, Icon, Panel } from "../components/ui";
import { api, errorMessage, onClaudeLoginProgress, onGitHubLoginProgress } from "../rpc";

interface Props {
	state: OnboardingState;
	onChange: () => Promise<void>;
}

const INSTALL_CLI = "npm install -g @anthropic-ai/claude-code";
const SETUP_TOKEN = "claude setup-token";

export function Onboarding({ state, onChange }: Props) {
	const ready = state.claudeConnected && state.github !== null && state.disclaimerAccepted;
	const [error, setError] = useState<string | null>(null);

	async function finish() {
		try {
			await api.completeOnboarding();
			await onChange();
		} catch (e) {
			setError(errorMessage(e));
		}
	}

	const next = !state.claudeConnected ? "Connect Claude to continue" : !state.github ? "Connect GitHub to continue" : !state.disclaimerAccepted ? "Accept to continue" : "Open library";

	return (
		<div className="onboarding">
			<Panel className="onboarding-card">
				<div className="stack gap-2">
					<span className="mark" style={{ width: 44, height: 44, borderRadius: 13 }}><Icon name="mark" size={22} stroke="#fff" /></span>
					<span className="big">Connect once.</span>
					<span className="muted">Every skill you install runs through these accounts — behind its own token, never with your keys.</span>
				</div>
				<ClaudeStep state={state} onChange={onChange} />
				<GitHubStep state={state} onChange={onChange} />
				<Disclaimer accepted={state.disclaimerAccepted} onChange={onChange} />
				{error && <span className="error small">{error}</span>}
				<Button variant={ready ? "primary" : "default"} disabled={!ready} onClick={finish} style={{ height: 46, borderRadius: 23 }}>
					{next}
				</Button>
			</Panel>
		</div>
	);
}

function Check({ done }: { done: boolean }) {
	return <span className={`check ${done ? "done" : ""}`}>{done && <Icon name="check" size={14} stroke="#000" />}</span>;
}

function useSubmit(action: (value: string) => Promise<unknown>, onChange: () => Promise<void>) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!value.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await action(value);
			setValue("");
			await onChange();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	}
	return { value, setValue, busy, error, submit };
}

function ClaudeStep({ state, onChange }: Props) {
	const [mode, setMode] = useState<"subscription" | "api-key">("subscription");
	const [progress, setProgress] = useState<SetupTokenProgress | null>(null);
	const [code, setCode] = useState("");
	const [manual, setManual] = useState(false);
	const apiKey = useSubmit((k) => api.connectClaude({ apiKey: k }), onChange);
	const token = useSubmit((t) => api.connectClaudeSubscription({ token: t }), onChange);

	useEffect(() => onClaudeLoginProgress((p) => {
		setProgress(p);
		if (p.phase === "connected") void onChange();
	}), [onChange]);

	if (state.claudeConnected) {
		const label = state.claudeAuthMode === "api-key" ? "API key" : state.claudeAuthMode === "oauth-token" ? "subscription · via setup-token" : "subscription · Claude Code login";
		return (
			<div className="step">
				<Check done />
				<div className="stack grow"><span style={{ fontWeight: 600 }}>Claude</span><span className="small muted">{label}</span></div>
				<Button variant="ghost" size="sm" onClick={() => api.disconnectClaude().then(onChange)}>Change</Button>
			</div>
		);
	}

	const busy = progress !== null && !["error", "cancelled", "connected"].includes(progress.phase);

	async function login() {
		setProgress({ phase: "started" });
		try {
			await api.startClaudeLogin();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}
	async function reuse() {
		setProgress({ phase: "verifying" });
		try {
			await api.connectClaudeSubscription({ token: null });
			setProgress({ phase: "connected" });
			await onChange();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	return (
		<div className="step" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
			<div className="row gap-3">
				<Check done={false} />
				<div className="stack grow"><span style={{ fontWeight: 600 }}>Claude</span><span className="small muted">Skills run on your account</span></div>
				<div className="segment">
					<button className={mode === "subscription" ? "active" : ""} onClick={() => setMode("subscription")}>Subscription</button>
					<button className={mode === "api-key" ? "active" : ""} onClick={() => setMode("api-key")}>API key</button>
				</div>
			</div>
			{mode === "api-key" ? (
				<form onSubmit={apiKey.submit} className="stack gap-2">
					<input type="password" placeholder="sk-ant-…" value={apiKey.value} onChange={(e) => apiKey.setValue(e.target.value)} autoComplete="off" />
					{apiKey.error && <span className="error small">{apiKey.error}</span>}
					<Button variant="white" type="submit" disabled={apiKey.busy}>{apiKey.busy ? "Checking…" : "Connect"}</Button>
				</form>
			) : !state.claudeCliVersion ? (
				<div className="stack gap-2 small">
					<span className="muted">Subscription mode runs skills through the Claude Code CLI, which is not installed yet.</span>
					<CommandLine command={INSTALL_CLI} />
					<Button size="sm" onClick={onChange}>I installed it, check again</Button>
				</div>
			) : (
				<div className="stack gap-2">
					<div className="row gap-2 wrap">
						<Button variant="white" disabled={busy} onClick={login}>{busy ? "Waiting for Claude…" : "Log in with Claude"}</Button>
						<Button variant="ghost" size="sm" disabled={busy} onClick={reuse}>Use Claude Code login</Button>
						{busy && <Button variant="ghost" size="sm" onClick={() => api.cancelClaudeLogin()}>Cancel</Button>}
						<Button variant="ghost" size="sm" onClick={() => setManual((m) => !m)}>{manual ? "Hide" : "Paste a token"}</Button>
					</div>
					{progress && <LoginStatus progress={progress} />}
					{progress?.phase === "needs-code" && (
						<form className="row gap-2" onSubmit={(e) => { e.preventDefault(); void api.submitClaudeLoginCode({ code }); }}>
							<input placeholder="Code from the browser" value={code} onChange={(e) => setCode(e.target.value)} />
							<Button type="submit" size="sm" disabled={!code.trim()}>Submit</Button>
						</form>
					)}
					{manual && (
						<form onSubmit={token.submit} className="stack gap-2 small">
							<span className="muted">Run this in Terminal and paste the token it prints:</span>
							<CommandLine command={SETUP_TOKEN} />
							<input type="password" placeholder="sk-ant-oat01-…" value={token.value} onChange={(e) => token.setValue(e.target.value)} autoComplete="off" />
							{token.error && <span className="error">{token.error}</span>}
							<Button size="sm" type="submit" disabled={token.busy}>{token.busy ? "Checking…" : "Connect with token"}</Button>
						</form>
					)}
				</div>
			)}
		</div>
	);
}

function LoginStatus({ progress }: { progress: SetupTokenProgress }) {
	const text: Record<string, string> = {
		started: "Starting Claude Code…",
		browser: "Approve access in the browser window that just opened.",
		"needs-code": "The browser showed a code — paste it below.",
		"token-received": "Token received, checking it with Claude…",
		verifying: "Checking with Claude…",
		connected: "Connected.",
		cancelled: "Cancelled.",
	};
	if (progress.phase === "error") return <span className="error small">{progress.message}</span>;
	return (
		<span className="small muted">
			{text[progress.phase]}{" "}
			{progress.phase === "browser" && progress.url && <button className="red" onClick={() => api.openExternal({ url: progress.url! })}>Open again</button>}
		</span>
	);
}

function GitHubStep({ state, onChange }: Props) {
	const account = state.github;
	const pat = useSubmit((t) => api.connectGitHub({ token: t }), onChange);
	const [progress, setProgress] = useState<GitHubLoginProgress | null>(null);
	const [manual, setManual] = useState(false);

	useEffect(() => onGitHubLoginProgress((p) => {
		setProgress(p);
		if (p.phase === "connected") void onChange();
	}), [onChange]);

	if (account) {
		return (
			<div className="step">
				<Check done />
				<div className="stack grow"><span style={{ fontWeight: 600 }}>GitHub</span><span className="small muted">@{account.login}</span></div>
				<Button variant="ghost" size="sm" onClick={() => api.disconnectGitHub().then(onChange)}>Change</Button>
			</div>
		);
	}

	const busy = progress !== null && !["error", "cancelled", "connected"].includes(progress.phase);
	async function start() {
		setProgress({ phase: "started" });
		try {
			await api.startGitHubLogin();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}
	async function cli() {
		setProgress({ phase: "verifying" });
		try {
			await api.connectGitHubCli();
			setProgress({ phase: "connected" });
			await onChange();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	return (
		<div className="step" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
			<div className="row gap-3">
				<Check done={false} />
				<div className="stack grow"><span style={{ fontWeight: 600 }}>GitHub</span><span className="small muted">Reads repositories and tracks updates</span></div>
				{state.githubOneClickAvailable ? (
					<Button variant="white" disabled={busy} onClick={start}>{busy ? "Waiting…" : "Log in"}</Button>
				) : (
					<Button variant="white" disabled={busy} onClick={cli}>Use GitHub CLI</Button>
				)}
			</div>
			{progress?.phase === "code" && (
				<span className="small">
					Enter <code style={{ fontSize: 16 }}>{progress.userCode}</code> on the GitHub page that opened (copied to your clipboard).
				</span>
			)}
			{progress?.phase === "error" && <span className="error small">{progress.message}</span>}
			{progress?.phase === "verifying" && <span className="small muted">Checking with GitHub…</span>}
			<div className="row gap-2">
				{state.githubOneClickAvailable && <Button variant="ghost" size="sm" disabled={busy} onClick={cli}>Use GitHub CLI login</Button>}
				<Button variant="ghost" size="sm" onClick={() => setManual((m) => !m)}>{manual ? "Hide" : "Use a personal access token"}</Button>
			</div>
			{manual && (
				<form onSubmit={pat.submit} className="stack gap-2">
					<input type="password" placeholder="ghp_… or github_pat_…" value={pat.value} onChange={(e) => pat.setValue(e.target.value)} autoComplete="off" />
					{pat.error && <span className="error small">{pat.error}</span>}
					<div className="row gap-2">
						<Button size="sm" type="submit" disabled={pat.busy}>{pat.busy ? "Checking…" : "Connect"}</Button>
						<Button variant="ghost" size="sm" onClick={() => api.openExternal({ url: "https://github.com/settings/tokens" })}>Create a token</Button>
					</div>
				</form>
			)}
		</div>
	);
}

function Disclaimer({ accepted, onChange }: { accepted: boolean; onChange: () => Promise<void> }) {
	return (
		<div className="stack gap-2" style={{ padding: "16px 18px", borderRadius: 16, background: "var(--red-glass)", border: "1px solid var(--red-line)" }}>
			<span style={{ fontWeight: 600, color: "var(--red-tint)" }}>Skills come from open repositories</span>
			<span className="small" style={{ color: "var(--fg-70)", lineHeight: 1.5 }}>Hangar does not review them. Install only what you trust — Hangar limits what an installed skill can reach, not what you can install.</span>
			<button className="row gap-2 small" style={{ color: "inherit" }} onClick={() => !accepted && api.acceptDisclaimer().then(onChange)}>
				<span style={{ width: 18, height: 18, borderRadius: 5, background: accepted ? "var(--red)" : "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
					{accepted && <Icon name="check" size={11} stroke="#fff" />}
				</span>
				I understand
			</button>
		</div>
	);
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="row gap-2">
			<code style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.4)" }}>{command}</code>
			<Button variant="ghost" size="sm" onClick={() => api.copyToClipboard({ text: command }).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</Button>
		</div>
	);
}
