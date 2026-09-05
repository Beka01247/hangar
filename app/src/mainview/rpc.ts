import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/rpc-schema";
import type { GitHubLoginProgress, InstallProgress, SetupTokenProgress, SkillEventEnvelope } from "../shared/types";

type Listener<T> = (payload: T) => void;
const libraryListeners = new Set<Listener<void>>();
const loginListeners = new Set<Listener<SetupTokenProgress>>();
const githubListeners = new Set<Listener<GitHubLoginProgress>>();
const installListeners = new Set<Listener<InstallProgress>>();
const skillListeners = new Set<Listener<SkillEventEnvelope>>();

export const rpc = Electroview.defineRPC<AppRPC>({
	maxRequestTime: 15 * 60_000,
	handlers: {
		requests: {},
		messages: {
			libraryChanged: () => libraryListeners.forEach((l) => l()),
			claudeLoginProgress: (progress) => loginListeners.forEach((l) => l(progress)),
			githubLoginProgress: (progress) => githubListeners.forEach((l) => l(progress)),
			installProgress: (progress) => installListeners.forEach((l) => l(progress)),
			skillEvent: (envelope) => skillListeners.forEach((l) => l(envelope)),
		},
	},
});

new Electroview({ rpc });

export const api = rpc.request;

export function onLibraryChanged(listener: Listener<void>): () => void {
	libraryListeners.add(listener);
	return () => libraryListeners.delete(listener);
}

export function onClaudeLoginProgress(listener: Listener<SetupTokenProgress>): () => void {
	loginListeners.add(listener);
	return () => loginListeners.delete(listener);
}

export function onGitHubLoginProgress(listener: Listener<GitHubLoginProgress>): () => void {
	githubListeners.add(listener);
	return () => githubListeners.delete(listener);
}

export function onInstallProgress(listener: Listener<InstallProgress>): () => void {
	installListeners.add(listener);
	return () => installListeners.delete(listener);
}

export function onSkillEvent(listener: Listener<SkillEventEnvelope>): () => void {
	skillListeners.add(listener);
	return () => skillListeners.delete(listener);
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
