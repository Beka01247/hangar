export type ManifestType = "plugin.json" | "SKILL.md" | "claude-project" | "fallback";

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

export interface SkillCommand {
	name: string;
	description: string;
	argumentHint: string | null;
}

export interface Skill {
	id: string;
	commands?: SkillCommand[];
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
	updateAvailable?: { sha: string; manifestChanged: boolean } | null;
}

export interface UpdateCheck {
	skillId: string;
	upToDate: boolean;
	commitsBehind: number;
	latestSha: string;
	latestDate: string | null;
	manifestChanged: boolean;
	changedFiles: string[];
	newPermissions: Permission[];
}

export type TokenScope = "claude" | "github" | "network";

export interface ScopedToken {
	skillId: string;
	token: string;
	allowedScopes: TokenScope[];
	issuedAt: string;
	revokedAt: string | null;
}

export interface SkillAccess {
	skillId: string;
	scopes: Record<TokenScope, boolean>;
	proxyUrl: string;
	tokenPreview: string;
	claudeDirectApiAvailable: boolean;
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
	anomaly: boolean;
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
	commands: SkillCommand[];
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

export type SkillStatus = "stopped" | "starting" | "idle" | "running" | "error";

export type SkillEvent =
	| { kind: "status"; status: SkillStatus; message?: string }
	| { kind: "user"; text: string }
	| { kind: "assistant_text"; text: string }
	| { kind: "tool_use"; id: string; name: string; input: unknown }
	| { kind: "tool_result"; toolUseId: string; content: string; isError: boolean }
	| { kind: "result"; text: string; isError: boolean; turnCostUsd: number; turnTokens: number }
	| { kind: "denied"; tool: string; reason: string }
	| { kind: "error"; message: string };

export interface SkillEventEnvelope {
	skillId: string;
	seq: number;
	at: string;
	event: SkillEvent;
}

export interface SkillSessionState {
	skillId: string;
	status: SkillStatus;
	events: SkillEventEnvelope[];
	workspace: string;
}

export type StoreSort = "best-match" | "stars" | "updated";

export interface StoreResult {
	fullName: string;
	htmlUrl: string;
	installUrl: string;
	manifestPath: string;
	description: string;
	stars: number;
	pushedAt: string;
	topics: string[];
	ownerLogin: string;
	language: string | null;
	installed: boolean;
}

export interface UsageSkillRow {
	skillId: string;
	name: string;
	monthSpendUsd: number;
	monthTokens: number;
	monthRuns: number;
	spend24hUsd: number;
	baselineDailyUsd: number;
	anomaly: boolean;
}

export interface UsageReport {
	totalMonthUsd: number;
	rows: UsageSkillRow[];
	recent: (UsageRecord & { skillName: string })[];
}
