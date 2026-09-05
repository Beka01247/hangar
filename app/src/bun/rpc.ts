import { BrowserView, Utils } from "electrobun/main";
import type { AppRPC } from "../shared/rpc-schema";
import type { GitHubLoginProgress, InstallProgress, SetupTokenProgress, SkillEventEnvelope } from "../shared/types";
import { discardInspection, inspectRepo, installSkill, uninstallSkill } from "./services/install/installer";
import { applySkillUpdate, checkSkillUpdate } from "./services/install/updater";
import { getSkillAccess, updateSkillAccess } from "./services/access";
import { listLibrary } from "./services/library";
import {
	acceptDisclaimer,
	completeOnboarding,
	connectClaude,
	connectClaudeSubscription,
	connectGitHub,
	disconnectClaude,
	disconnectGitHub,
	getAppState,
} from "./services/onboarding";
import { cancelGitHubDeviceFlow, runGitHubDeviceFlow, tokenFromGitHubCli } from "./services/github-oauth";
import { readSkillLog, sendToSkill, startSkill, stopSkill } from "./services/runtime/manager";
import { cancelSetupToken, startSetupToken, submitSetupCode } from "./services/setup-token";
import { searchStore } from "./services/store";
import { buildUsageReport } from "./services/usage-report";
import { tokenForSkill } from "./store/tokens";
import { usageStore } from "./store/usage";

export function createAppRPC() {
	const rpc = BrowserView.defineRPC<AppRPC>({
		maxRequestTime: 15 * 60_000,
		handlers: {
			requests: {
				getAppState: () => getAppState(),
				connectClaude: async ({ apiKey }) => {
					await connectClaude(apiKey);
					return { ok: true } as const;
				},
				connectClaudeSubscription: async ({ token }) => {
					await connectClaudeSubscription(token);
					return { ok: true } as const;
				},
				startClaudeLogin: () => {
					const report = (progress: SetupTokenProgress) => rpc.send.claudeLoginProgress(progress);
					void startSetupToken(report)
						.then(async (token) => {
							report({ phase: "verifying" });
							await connectClaudeSubscription(token);
							report({ phase: "connected" });
						})
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							if (!/cancelled/i.test(message)) report({ phase: "error", message });
						});
					return { ok: true } as const;
				},
				submitClaudeLoginCode: ({ code }) => {
					submitSetupCode(code);
					return { ok: true } as const;
				},
				cancelClaudeLogin: () => {
					cancelSetupToken();
					return { ok: true } as const;
				},
				copyToClipboard: ({ text }) => {
					Utils.clipboardWriteText(text);
					return { ok: true } as const;
				},
				disconnectClaude: async () => {
					await disconnectClaude();
					return { ok: true } as const;
				},
				connectGitHub: ({ token }) => connectGitHub(token),
				connectGitHubCli: async () => connectGitHub(await tokenFromGitHubCli()),
				startGitHubLogin: () => {
					const report = (progress: GitHubLoginProgress) => rpc.send.githubLoginProgress(progress);
					void runGitHubDeviceFlow(report)
						.then(async (token) => {
							report({ phase: "verifying" });
							await connectGitHub(token);
							report({ phase: "connected" });
						})
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							report({ phase: /cancelled/i.test(message) ? "cancelled" : "error", message });
						});
					return { ok: true } as const;
				},
				cancelGitHubLogin: () => {
					cancelGitHubDeviceFlow();
					return { ok: true } as const;
				},
				disconnectGitHub: async () => {
					await disconnectGitHub();
					return { ok: true } as const;
				},
				acceptDisclaimer: async () => {
					await acceptDisclaimer();
					return { ok: true } as const;
				},
				completeOnboarding: async () => {
					await completeOnboarding();
					return { ok: true } as const;
				},
				listLibrary: () => listLibrary(),
				inspectRepo: ({ url }) => inspectRepo(url),
				installSkill: async ({ inspectionId }) => {
					await installSkill(inspectionId, (p: InstallProgress) => rpc.send.installProgress(p));
					rpc.send.libraryChanged();
					return { ok: true } as const;
				},
				discardInspection: ({ inspectionId }) => {
					discardInspection(inspectionId);
					return { ok: true } as const;
				},
				uninstallSkill: async ({ skillId }) => {
					await uninstallSkill(skillId);
					rpc.send.libraryChanged();
					return { ok: true } as const;
				},
				checkSkillUpdate: ({ skillId }) => checkSkillUpdate(skillId),
				applySkillUpdate: async ({ skillId }) => {
					const result = await applySkillUpdate(skillId);
					rpc.send.libraryChanged();
					return result;
				},
				getSkillAccess: ({ skillId }) => getSkillAccess(skillId),
				copySkillToken: async ({ skillId }) => {
					const token = await tokenForSkill(skillId);
					if (token) Utils.clipboardWriteText(token.token);
					return { ok: token !== null };
				},
				setSkillAccess: ({ skillId, scope, granted }) => updateSkillAccess(skillId, scope, granted),
				startSkill: ({ skillId }) => startSkill(skillId, (e: SkillEventEnvelope) => rpc.send.skillEvent(e)),
				stopSkill: ({ skillId }) => {
					stopSkill(skillId);
					rpc.send.libraryChanged();
					return { ok: true } as const;
				},
				sendToSkill: ({ skillId, text }) => {
					sendToSkill(skillId, text);
					return { ok: true } as const;
				},
				getSkillLog: ({ skillId, tailLines }) => readSkillLog(skillId, tailLines),
				searchStore: ({ query, sort }) => searchStore(query, sort),
				getUsageReport: () => buildUsageReport(),
				getSkillUsage: async ({ skillId }) => (await usageStore.read()).usage.filter((u) => u.skillId === skillId),
				openExternal: ({ url }) => ({ ok: Utils.openExternal(url) }),
			},
			messages: {},
		},
	});
	return rpc;
}
