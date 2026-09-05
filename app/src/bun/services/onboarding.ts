import type { AppState, ClaudeAuthMode, GitHubAccount, OnboardingState } from "../../shared/types";
import { deleteSecret, getSecret, hasSecret, setSecret } from "../secrets/keychain";
import { DATA_DIR } from "../store/json-store";
import { settingsStore } from "../store/settings";
import { validateClaudeKey } from "./anthropic";
import { getCliVersion, validateSubscriptionAuth } from "./claude-cli";
import { fetchGitHubAccount } from "./github";
import { isGitHubDeviceFlowAvailable } from "./github-oauth";

async function resolveClaudeAuthMode(): Promise<ClaudeAuthMode | null> {
	const settings = await settingsStore.read();
	switch (settings.claudeAuthMode) {
		case "api-key":
			return (await hasSecret("claude-api-key")) ? "api-key" : null;
		case "oauth-token":
			return (await hasSecret("claude-oauth-token")) ? "oauth-token" : null;
		case "cli-login":
			return "cli-login";
		default:
			return null;
	}
}

export async function getOnboardingState(): Promise<OnboardingState> {
	const [settings, claudeAuthMode, claudeCliVersion] = await Promise.all([
		settingsStore.read(),
		resolveClaudeAuthMode(),
		getCliVersion(),
	]);
	return {
		githubOneClickAvailable: isGitHubDeviceFlowAvailable(),
		claudeConnected: claudeAuthMode !== null,
		claudeAuthMode,
		claudeCliVersion,
		github: settings.github,
		disclaimerAccepted: settings.disclaimerAcceptedAt !== null,
		completed: settings.onboardingCompletedAt !== null,
	};
}

export async function getAppState(): Promise<AppState> {
	return { platform: process.platform, dataDir: DATA_DIR, onboarding: await getOnboardingState() };
}

export async function connectClaude(apiKey: string): Promise<void> {
	const key = apiKey.trim();
	await validateClaudeKey(key);
	await setSecret("claude-api-key", key);
	await settingsStore.update((s) => ({ ...s, claudeAuthMode: "api-key" }));
}

export async function connectClaudeSubscription(token: string | null): Promise<void> {
	const cleaned = token?.trim() || null;
	if (cleaned) {
		await validateSubscriptionAuth({ kind: "oauth-token", token: cleaned });
		await setSecret("claude-oauth-token", cleaned);
		await settingsStore.update((s) => ({ ...s, claudeAuthMode: "oauth-token" }));
	} else {
		await validateSubscriptionAuth({ kind: "cli-login" });
		await settingsStore.update((s) => ({ ...s, claudeAuthMode: "cli-login" }));
	}
}

export async function getClaudeCredentials(): Promise<
	{ mode: "api-key"; apiKey: string } | { mode: "oauth-token"; token: string } | { mode: "cli-login" } | null
> {
	const mode = await resolveClaudeAuthMode();
	if (mode === "api-key") return { mode, apiKey: (await getSecret("claude-api-key")) ?? "" };
	if (mode === "oauth-token") return { mode, token: (await getSecret("claude-oauth-token")) ?? "" };
	if (mode === "cli-login") return { mode };
	return null;
}

export async function disconnectClaude(): Promise<void> {
	await Promise.all([deleteSecret("claude-api-key"), deleteSecret("claude-oauth-token")]);
	await settingsStore.update((s) => ({ ...s, claudeAuthMode: null, onboardingCompletedAt: null }));
}

export async function connectGitHub(token: string): Promise<GitHubAccount> {
	const cleaned = token.trim();
	const account = await fetchGitHubAccount(cleaned);
	await setSecret("github-token", cleaned);
	await settingsStore.update((s) => ({ ...s, github: account }));
	return account;
}

export async function disconnectGitHub(): Promise<void> {
	await deleteSecret("github-token");
	await settingsStore.update((s) => ({ ...s, github: null, onboardingCompletedAt: null }));
}

export async function acceptDisclaimer(): Promise<void> {
	await settingsStore.update((s) => ({ ...s, disclaimerAcceptedAt: s.disclaimerAcceptedAt ?? new Date().toISOString() }));
}

export async function completeOnboarding(): Promise<void> {
	const state = await getOnboardingState();
	if (!state.claudeConnected || !state.github || !state.disclaimerAccepted) {
		throw new Error("Connect Claude, connect GitHub and accept the disclaimer first");
	}
	await settingsStore.update((s) => ({ ...s, onboardingCompletedAt: new Date().toISOString() }));
}
