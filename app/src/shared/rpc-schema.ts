import type { RPCSchema } from "electrobun/view";
import type {
	AppState,
	GitHubAccount,
	GitHubLoginProgress,
	InstallProgress,
	LibrarySkill,
	RepoInspection,
	SetupTokenProgress,
	UsageRecord,
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
			getSkillUsage: { params: { skillId: string }; response: UsageRecord[] };
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
		};
	}>;
};
