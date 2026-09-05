import type { SkillAccess, TokenScope } from "../../shared/types";
import { settingsStore } from "../store/settings";
import { setScope, tokenForSkill } from "../store/tokens";
import { proxyUrl } from "./proxy";

const ALL_SCOPES: TokenScope[] = ["claude", "github", "network"];

export async function getSkillAccess(skillId: string): Promise<SkillAccess> {
	const [token, settings] = await Promise.all([tokenForSkill(skillId), settingsStore.read()]);
	const scopes = Object.fromEntries(ALL_SCOPES.map((s) => [s, token?.allowedScopes.includes(s) ?? false])) as Record<TokenScope, boolean>;
	return {
		skillId,
		scopes,
		proxyUrl: proxyUrl(),
		tokenPreview: token ? `${token.token.slice(0, 12)}…` : "no token",
		claudeDirectApiAvailable: settings.claudeAuthMode === "api-key",
	};
}

export async function updateSkillAccess(skillId: string, scope: TokenScope, granted: boolean): Promise<SkillAccess> {
	await setScope(skillId, scope, granted);
	return getSkillAccess(skillId);
}
