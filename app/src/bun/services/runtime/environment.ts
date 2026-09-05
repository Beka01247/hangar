import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";
import type { InstalledSkill, Skill, TokenScope } from "../../../shared/types";
import { DATA_DIR } from "../../store/json-store";
import { tokenForSkill } from "../../store/tokens";
import { cliEnv } from "../claude-cli";
import { getClaudeCredentials } from "../onboarding";
import { proxyUrl } from "../proxy";
import { resolveSkillEnv } from "./skill-env";

export const WORKSPACES_DIR = join(DATA_DIR, "workspaces");
export const LOGS_DIR = join(DATA_DIR, "logs");

export function prepareWorkspace(skill: Skill, installed: InstalledSkill): string {
	mkdirSync(LOGS_DIR, { recursive: true });
	if (skill.manifestType === "claude-project") return installed.localPath;
	const workspace = join(WORKSPACES_DIR, skill.id);
	const skillsDir = join(workspace, ".claude", "skills");
	mkdirSync(skillsDir, { recursive: true });
	mkdirSync(LOGS_DIR, { recursive: true });
	if (skill.manifestType === "SKILL.md") {
		const link = join(skillsDir, basename(installed.localPath));
		if (!existsSync(link)) symlinkSync(installed.localPath, link, "dir");
	}
	return workspace;
}

export interface RuntimeEnv {
	env: Record<string, string>;
	scopes: Set<TokenScope>;
	claudeMode: "api-key" | "oauth-token" | "cli-login";
}

export async function buildRuntimeEnv(skillId: string): Promise<RuntimeEnv> {
	const [credentials, token] = await Promise.all([getClaudeCredentials(), tokenForSkill(skillId)]);
	if (!credentials) throw new Error("Claude is not connected in Hangar");
	if (!token) throw new Error("This skill has no scoped token — reinstall it");
	const scopes = new Set(token.allowedScopes);
	if (!scopes.has("claude")) throw new Error("Claude access is turned off for this skill");

	const proxy = proxyUrl();
	const secrets = await resolveSkillEnv(skillId);
	const env = cliEnv({
		...secrets,
		HANGAR_SKILL_ID: skillId,
		HANGAR_SKILL_TOKEN: token.token,
		HANGAR_PROXY_URL: proxy,
		CLAUDE_AGENT_SDK_CLIENT_APP: "hangar/0.1.0",
		GITHUB_TOKEN: scopes.has("github") ? token.token : undefined,
		GH_TOKEN: scopes.has("github") ? token.token : undefined,
		GITHUB_API_URL: scopes.has("github") ? `${proxy}/github` : undefined,
	});
	delete env["GITHUB_TOKEN"];
	delete env["GH_TOKEN"];
	if (scopes.has("github")) {
		env["GITHUB_TOKEN"] = token.token;
		env["GH_TOKEN"] = token.token;
	}

	switch (credentials.mode) {
		case "api-key":
			env["ANTHROPIC_API_KEY"] = token.token;
			env["ANTHROPIC_BASE_URL"] = `${proxy}/anthropic`;
			break;
		case "oauth-token":
			env["CLAUDE_CODE_OAUTH_TOKEN"] = credentials.token;
			break;
		case "cli-login":
			break;
	}
	return { env, scopes, claudeMode: credentials.mode };
}
