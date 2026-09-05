import { useEffect, useState, type FormEvent } from "react";
import type { GitHubLoginProgress, OnboardingState, SetupTokenProgress } from "../../shared/types";
import { api, errorMessage, onClaudeLoginProgress, onGitHubLoginProgress } from "../rpc";

interface Props {
	state: OnboardingState;
	onChange: () => Promise<void>;
}

export function Onboarding({ state, onChange }: Props) {
	const canFinish = state.claudeConnected && state.github !== null && state.disclaimerAccepted;
	const [finishError, setFinishError] = useState<string | null>(null);

	async function finish() {
		try {
			await api.completeOnboarding();
			await onChange();
		} catch (e) {
			setFinishError(errorMessage(e));
		}
	}

	return (
		<div className="page">
			<h1>Set up Hangar</h1>
			<p className="muted">Connect your accounts once. Every installed skill will use them through Hangar.</p>

			<ClaudeStep state={state} onChange={onChange} />
			<GitHubStep state={state} onChange={onChange} />
			<DisclaimerStep accepted={state.disclaimerAccepted} onChange={onChange} />

			{finishError && <p className="error">{finishError}</p>}
			<button disabled={!canFinish} onClick={finish}>
				{canFinish ? "Open library" : "Complete all steps to continue"}
			</button>
		</div>
	);
}

function useSubmit(action: (value: string) => Promise<void>, onChange: () => Promise<void>) {
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

const SETUP_TOKEN_COMMAND = "claude setup-token";
const INSTALL_CLI_COMMAND = "npm install -g @anthropic-ai/claude-code";

type ClaudeMode = "subscription" | "api-key";

function ClaudeStep({ state, onChange }: { state: OnboardingState; onChange: () => Promise<void> }) {
	const [mode, setMode] = useState<ClaudeMode>("subscription");

	if (state.claudeConnected) {
		const label =
			state.claudeAuthMode === "api-key"
				? "API key"
				: state.claudeAuthMode === "oauth-token"
					? "Claude subscription (setup-token)"
					: "Claude subscription (Claude Code login)";
		return (
			<section>
				<h2>1. Claude</h2>
				<div className="row">
					<span>Connected via {label}</span>
					<button onClick={() => api.disconnectClaude().then(onChange)}>Disconnect</button>
				</div>
			</section>
		);
	}

	return (
		<section>
			<h2>1. Claude</h2>
			<div className="row" style={{ marginBottom: 12 }}>
				<label>
					<input type="radio" checked={mode === "subscription"} onChange={() => setMode("subscription")} /> Claude
					subscription (Pro / Max)
				</label>
				<label>
					<input type="radio" checked={mode === "api-key"} onChange={() => setMode("api-key")} /> API key
				</label>
			</div>
			{mode === "subscription" ? <SubscriptionForm state={state} onChange={onChange} /> : <ApiKeyForm onChange={onChange} />}
		</section>
	);
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="row">
			<code>{command}</code>
			<button
				type="button"
				onClick={() => api.copyToClipboard({ text: command }).then(() => setCopied(true))}
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}

function SubscriptionForm({ state, onChange }: { state: OnboardingState; onChange: () => Promise<void> }) {
	const [progress, setProgress] = useState<SetupTokenProgress | null>(null);
	const [code, setCode] = useState("");
	const [manual, setManual] = useState(false);
	const manualForm = useSubmit((token) => api.connectClaudeSubscription({ token }).then(() => undefined), onChange);

	useEffect(() => {
		return onClaudeLoginProgress((p) => {
			setProgress(p);
			if (p.phase === "connected") void onChange();
		});
	}, [onChange]);

	async function start() {
		setCode("");
		setProgress({ phase: "started" });
		try {
			await api.startClaudeLogin();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	async function useCliLogin() {
		setProgress({ phase: "verifying" });
		try {
			await api.connectClaudeSubscription({ token: null });
			setProgress({ phase: "connected" });
			await onChange();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	if (!state.claudeCliVersion) {
		return (
			<div>
				<p className="muted">Subscription mode runs skills through the Claude Code CLI, which is not installed yet.</p>
				<CommandLine command={INSTALL_CLI_COMMAND} />
				<button type="button" onClick={onChange} style={{ marginTop: 8 }}>
					I installed it, check again
				</button>
			</div>
		);
	}

	const busy = progress !== null && !["error", "cancelled", "connected"].includes(progress.phase);

	return (
		<div>
			<p className="muted">Usage counts against your Pro / Max limits. Claude Code {state.claudeCliVersion} found.</p>
			<div className="row">
				<button type="button" disabled={busy} onClick={start}>
					{busy ? "Waiting for Claude…" : "Log in with Claude"}
				</button>
				<button type="button" disabled={busy} onClick={useCliLogin}>
					Use existing Claude Code login
				</button>
				{busy && (
					<button type="button" onClick={() => api.cancelClaudeLogin()}>
						Cancel
					</button>
				)}
			</div>

			{progress && <LoginStatus progress={progress} />}

			{progress?.phase === "needs-code" && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void api.submitClaudeLoginCode({ code });
					}}
					style={{ marginTop: 8 }}
				>
					<input placeholder="Paste the code shown in the browser" value={code} onChange={(e) => setCode(e.target.value)} />
					<button type="submit" disabled={!code.trim()}>
						Submit code
					</button>
				</form>
			)}

			<p className="muted" style={{ marginTop: 12 }}>
				<button type="button" onClick={() => setManual((m) => !m)}>
					{manual ? "Hide" : "Paste a token manually"}
				</button>
			</p>
			{manual && (
				<form onSubmit={manualForm.submit}>
					<p className="muted">Run this in Terminal and paste the token it prints:</p>
					<CommandLine command={SETUP_TOKEN_COMMAND} />
					<input
						type="password"
						placeholder="sk-ant-oat01-…"
						value={manualForm.value}
						onChange={(e) => manualForm.setValue(e.target.value)}
						autoComplete="off"
					/>
					{manualForm.error && <p className="error">{manualForm.error}</p>}
					<button type="submit" disabled={manualForm.busy}>
						{manualForm.busy ? "Checking with Claude…" : "Connect with token"}
					</button>
				</form>
			)}
		</div>
	);
}

function LoginStatus({ progress }: { progress: SetupTokenProgress }) {
	switch (progress.phase) {
		case "started":
			return <p className="muted">Starting Claude Code…</p>;
		case "browser":
			return (
				<p className="muted">
					Approve access in the browser window that just opened.{" "}
					{progress.url && (
						<button type="button" onClick={() => api.openExternal({ url: progress.url! })}>
							Open it again
						</button>
					)}
				</p>
			);
		case "needs-code":
			return <p className="muted">The browser showed a code instead of returning here — paste it below.</p>;
		case "token-received":
		case "verifying":
			return <p className="muted">Token received, checking it with Claude…</p>;
		case "connected":
			return <p>Connected.</p>;
		case "error":
			return <p className="error">{progress.message}</p>;
		case "cancelled":
			return <p className="muted">Cancelled.</p>;
	}
}

function ApiKeyForm({ onChange }: { onChange: () => Promise<void> }) {
	const form = useSubmit((apiKey) => api.connectClaude({ apiKey }).then(() => undefined), onChange);
	return (
		<form onSubmit={form.submit}>
			<p className="muted">Pay-as-you-go via the Claude Platform. The key is stored in the system keychain and never leaves this machine.</p>
			<input
				type="password"
				placeholder="sk-ant-…"
				value={form.value}
				onChange={(e) => form.setValue(e.target.value)}
				autoComplete="off"
			/>
			{form.error && <p className="error">{form.error}</p>}
			<button type="submit" disabled={form.busy}>
				{form.busy ? "Checking…" : "Connect with API key"}
			</button>
		</form>
	);
}

function GitHubStep({ state, onChange }: { state: OnboardingState; onChange: () => Promise<void> }) {
	const account = state.github;
	const form = useSubmit((token) => api.connectGitHub({ token }).then(() => undefined), onChange);
	const [progress, setProgress] = useState<GitHubLoginProgress | null>(null);
	const [manual, setManual] = useState(!state.githubOneClickAvailable);

	useEffect(() => {
		return onGitHubLoginProgress((p) => {
			setProgress(p);
			if (p.phase === "connected") void onChange();
		});
	}, [onChange]);

	async function start() {
		setProgress({ phase: "started" });
		try {
			await api.startGitHubLogin();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	async function useCli() {
		setProgress({ phase: "verifying" });
		try {
			await api.connectGitHubCli();
			setProgress({ phase: "connected" });
			await onChange();
		} catch (e) {
			setProgress({ phase: "error", message: errorMessage(e) });
		}
	}

	if (account) {
		return (
			<section>
				<h2>2. GitHub</h2>
				<div className="row">
					<img src={account.avatarUrl} alt="" width={24} height={24} />
					<span>@{account.login}</span>
					{account.scopes.length > 0 && <span className="muted">scopes: {account.scopes.join(", ")}</span>}
					<button onClick={() => api.disconnectGitHub().then(onChange)}>Disconnect</button>
				</div>
			</section>
		);
	}

	const busy = progress !== null && !["error", "cancelled", "connected"].includes(progress.phase);

	return (
		<section>
			<h2>2. GitHub</h2>
			<p className="muted">Needed to read repositories and track updates.</p>
			<div className="row">
				{state.githubOneClickAvailable && (
					<button type="button" disabled={busy} onClick={start}>
						{busy ? "Waiting for GitHub…" : "Log in with GitHub"}
					</button>
				)}
				<button type="button" disabled={busy} onClick={useCli}>
					Use GitHub CLI login
				</button>
				{busy && progress?.phase === "code" && (
					<button type="button" onClick={() => api.cancelGitHubLogin()}>
						Cancel
					</button>
				)}
			</div>
			{progress && <GitHubLoginStatus progress={progress} />}

			<p className="muted" style={{ marginTop: 12 }}>
				<button type="button" onClick={() => setManual((m) => !m)}>
					{manual ? "Hide" : "Use a personal access token"}
				</button>
			</p>
			{manual && (
				<form onSubmit={form.submit}>
					<input
						type="password"
						placeholder="ghp_… or github_pat_…"
						value={form.value}
						onChange={(e) => form.setValue(e.target.value)}
						autoComplete="off"
					/>
					{form.error && <p className="error">{form.error}</p>}
					<div className="row">
						<button type="submit" disabled={form.busy}>
							{form.busy ? "Checking…" : "Connect with token"}
						</button>
						<button type="button" onClick={() => api.openExternal({ url: "https://github.com/settings/tokens" })}>
							Create a token
						</button>
					</div>
				</form>
			)}
		</section>
	);
}

function GitHubLoginStatus({ progress }: { progress: GitHubLoginProgress }) {
	switch (progress.phase) {
		case "started":
			return <p className="muted">Requesting a login code…</p>;
		case "code":
			return (
				<p>
					Enter this code on the GitHub page that just opened (already copied to your clipboard):{" "}
					<code style={{ fontSize: 18 }}>{progress.userCode}</code>{" "}
					{progress.url && (
						<button type="button" onClick={() => api.openExternal({ url: progress.url! })}>
							Open page again
						</button>
					)}
				</p>
			);
		case "verifying":
			return <p className="muted">Checking with GitHub…</p>;
		case "connected":
			return <p>Connected.</p>;
		case "error":
			return <p className="error">{progress.message}</p>;
		case "cancelled":
			return <p className="muted">Cancelled.</p>;
	}
}

function DisclaimerStep({ accepted, onChange }: { accepted: boolean; onChange: () => Promise<void> }) {
	return (
		<section>
			<h2>3. On your own risk</h2>
			<p>
				Hangar installs code from open repositories. We do not review it. Install only what you trust.
			</p>
			{accepted ? (
				<span>Accepted</span>
			) : (
				<button onClick={() => api.acceptDisclaimer().then(onChange)}>I understand</button>
			)}
		</section>
	);
}
