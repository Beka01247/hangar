import type { InstalledSkill, Skill } from "../../shared/types";
import { JsonStore } from "./json-store";

export interface SkillsRegistry {
	skills: Record<string, Skill>;
	installed: Record<string, InstalledSkill>;
}

export const skillsStore = new JsonStore<SkillsRegistry>("skills.json", () => ({
	skills: {},
	installed: {},
}));
