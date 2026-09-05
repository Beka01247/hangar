export type ManifestType = "plugin.json" | "SKILL.md" | "fallback";

export type PermissionType = "network" | "filesystem" | "env" | "github" | "claude";

export interface Permission {
	type: PermissionType;
	scope: string;
	granted: boolean;
}

export interface Manifest {
	format: ManifestType;
	entryPoint: string;
	requestedPermissions: Permission[];
}

export interface Skill {
	id: string;
	repoUrl: string;
	repoOwner: string;
	repoName: string;
	name: string;
	description: string;
	manifestType: ManifestType;
	lastChecked: string | null;
}

export type InstalledSkillStatus = "ready" | "installing" | "error" | "no-ui";

export interface InstalledSkill {
	skillId: string;
	installedAt: string;
	localPath: string;
	commitHash: string;
	status: InstalledSkillStatus;
}

export interface UsageRecord {
	skillId: string;
	tokens: number;
	costUsd: number;
	timestamp: string;
	action?: string;
}

export interface RunRecord {
	skillId: string;
	startedAt: string;
	endedAt: string | null;
}

export interface GitHubAccount {
	login: string;
	name: string | null;
	avatarUrl: string;
	scopes: string[];
}

export type ClaudeAuthMode = "api-key" | "oauth-token" | "cli-login";

export interface Settings {
	claudeAuthMode: ClaudeAuthMode | null;
	disclaimerAcceptedAt: string | null;
	github: GitHubAccount | null;
	onboardingCompletedAt: string | null;
}

export interface OnboardingState {
	githubOneClickAvailable: boolean;
	claudeConnected: boolean;
	claudeAuthMode: ClaudeAuthMode | null;
	claudeCliVersion: string | null;
	github: GitHubAccount | null;
	disclaimerAccepted: boolean;
	completed: boolean;
}

export interface AppState {
	platform: string;
	dataDir: string;
	onboarding: OnboardingState;
}

export interface LibrarySkill {
	skill: Skill;
	installed: InstalledSkill;
	official: boolean;
	monthSpendUsd: number;
	monthTokens: number;
	runsLast7Days: number;
	lastRunAt: string | null;
}

export type SetupTokenPhase =
	| "started"
	| "browser"
	| "needs-code"
	| "token-received"
	| "verifying"
	| "connected"
	| "error"
	| "cancelled";

export interface SetupTokenProgress {
	phase: SetupTokenPhase;
	url?: string;
	message?: string;
}

export type GitHubLoginPhase = "started" | "code" | "verifying" | "connected" | "error" | "cancelled";

export interface GitHubLoginProgress {
	phase: GitHubLoginPhase;
	userCode?: string;
	url?: string;
	message?: string;
}

export interface RepoInspection {
	inspectionId: string;
	repoUrl: string;
	htmlUrl: string;
	readmeUrl: string | null;
	skillId: string;
	alreadyInstalled: boolean;
	name: string;
	description: string;
	manifestType: ManifestType;
	entryPoint: string;
	permissions: Permission[];
	mcpServers: { name: string; type: string; target: string }[];
	dependencies: { node: boolean; python: boolean };
	meta: {
		stars: number;
		ownerLogin: string;
		ownerType: string;
		license: string | null;
		isPrivate: boolean;
		latestCommitDate: string | null;
		latestCommitSha: string | null;
		pushedAt: string;
	};
}

export type InstallPhase = "preparing" | "dependencies" | "registering" | "done" | "error";

export interface InstallProgress {
	inspectionId: string;
	phase: InstallPhase;
	message?: string;
	line?: string;
}
