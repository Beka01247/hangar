import type { RPCSchema } from "electrobun/view";
import type {
	AppState,
	GitHubAccount,
	GitHubLoginProgress,
	InstallProgress,
	LibrarySkill,
	Permission,
	RepoInspection,
	SetupTokenProgress,
	SkillAccess,
	SkillEventEnvelope,
	SkillSessionState,
	StoreResult,
	StoreSort,
	TokenScope,
	UpdateCheck,
	UsageRecord,
	UsageReport,
} from "./types";

export type AppRPC = {
	bun: RPCSchema<{
		requests: {
			getAppState: { params: void; response: AppState };
			connectClaude: { params: { apiKey: string }; response: { ok: true } };
			connectClaudeSubscription: { params: { token: string | null }; response: { ok: true } };
			startClaudeLogin: { params: void; response: { ok: true } };
			submitClaudeLoginCode: { params: { code: string }; response: { ok: true } };
			cancelClaudeLogin: { params: void; response: { ok: true } };
			copyToClipboard: { params: { text: string }; response: { ok: true } };
			disconnectClaude: { params: void; response: { ok: true } };
			connectGitHub: { params: { token: string }; response: GitHubAccount };
			connectGitHubCli: { params: void; response: GitHubAccount };
			startGitHubLogin: { params: void; response: { ok: true } };
			cancelGitHubLogin: { params: void; response: { ok: true } };
			disconnectGitHub: { params: void; response: { ok: true } };
			acceptDisclaimer: { params: void; response: { ok: true } };
			completeOnboarding: { params: void; response: { ok: true } };
			listLibrary: { params: void; response: LibrarySkill[] };
			inspectRepo: { params: { url: string }; response: RepoInspection };
			installSkill: { params: { inspectionId: string }; response: { ok: true } };
			discardInspection: { params: { inspectionId: string }; response: { ok: true } };
			uninstallSkill: { params: { skillId: string }; response: { ok: true } };
			checkSkillUpdate: { params: { skillId: string }; response: UpdateCheck };
			applySkillUpdate: { params: { skillId: string }; response: { commitHash: string; permissions: Permission[] } };
			getSkillAccess: { params: { skillId: string }; response: SkillAccess };
			copySkillToken: { params: { skillId: string }; response: { ok: boolean } };
			setSkillAccess: { params: { skillId: string; scope: TokenScope; granted: boolean }; response: SkillAccess };
			getSkillUsage: { params: { skillId: string }; response: UsageRecord[] };
			startSkill: { params: { skillId: string }; response: SkillSessionState };
			stopSkill: { params: { skillId: string }; response: { ok: true } };
			sendToSkill: { params: { skillId: string; text: string }; response: { ok: true } };
			getSkillLog: { params: { skillId: string; tailLines?: number }; response: string[] };
			searchStore: { params: { query: string; sort: StoreSort }; response: StoreResult[] };
			getUsageReport: { params: void; response: UsageReport };
			openExternal: { params: { url: string }; response: { ok: boolean } };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			libraryChanged: void;
			claudeLoginProgress: SetupTokenProgress;
			githubLoginProgress: GitHubLoginProgress;
			installProgress: InstallProgress;
			skillEvent: SkillEventEnvelope;
		};
	}>;
};
