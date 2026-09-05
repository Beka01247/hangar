import { join } from "node:path";
import type { SkillEventEnvelope, SkillSessionState } from "../../../shared/types";
import { skillsStore } from "../../store/skills";
import { LOGS_DIR } from "./environment";
import { closeSkillServers } from "./mcp";
import { SkillSession } from "./session";

const sessions = new Map<string, SkillSession>();

export async function startSkill(skillId: string, listener: (e: SkillEventEnvelope) => void): Promise<SkillSessionState> {
	const existing = sessions.get(skillId);
	if (existing && existing.status !== "stopped" && existing.status !== "error") return existing.state();

	const registry = await skillsStore.read();
	const skill = registry.skills[skillId];
	const installed = registry.installed[skillId];
	if (!skill || !installed) throw new Error("Skill is not installed");

	const session = new SkillSession(skill, installed, listener);
	sessions.set(skillId, session);
	try {
		await session.start();
	} catch (error) {
		session.stop();
		throw error;
	}
	return session.state();
}

export function stopSkill(skillId: string): void {
	sessions.get(skillId)?.stop();
	sessions.delete(skillId);
	void closeSkillServers(skillId);
}

export function stopAllSkills(): void {
	for (const id of [...sessions.keys()]) stopSkill(id);
}

export function sendToSkill(skillId: string, text: string): void {
	const session = sessions.get(skillId);
	if (!session) throw new Error("Skill is not running — open it again");
	session.send(text);
}

export async function readSkillLog(skillId: string, tailLines = 200): Promise<string[]> {
	const file = Bun.file(join(LOGS_DIR, `${skillId}.jsonl`));
	if (!(await file.exists())) return [];
	const lines = (await file.text()).split("\n").filter(Boolean);
	return lines.slice(-tailLines);
}
