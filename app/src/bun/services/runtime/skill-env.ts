import type { SkillEnvVar } from "../../../shared/types";
import { deleteSecret, getSecret, hasSecret, setSecret, type SecretName } from "../../secrets/keychain";
import { skillsStore } from "../../store/skills";

function secretName(skillId: string, name: string): SecretName {
	return `skill:${skillId}:${name}` as SecretName;
}

export async function listSkillEnv(skillId: string): Promise<SkillEnvVar[]> {
	const registry = await skillsStore.read();
	const skill = registry.skills[skillId];
	if (!skill) throw new Error("Skill is not installed");
	const names = new Set<string>(skill.envVars ?? []);
	const requiredBy = new Map<string, string[]>();
	for (const server of skill.mcpServers ?? []) {
		for (const [key, value] of Object.entries(server.env)) {
			const ref = value.match(/^\$\{?([A-Z][A-Z0-9_]+)\}?$/)?.[1] ?? (value === "" ? key : null);
			if (!ref) continue;
			names.add(ref);
			requiredBy.set(ref, [...(requiredBy.get(ref) ?? []), server.name]);
		}
	}
	return Promise.all(
		[...names].sort().map(async (name) => ({ name, set: await hasSecret(secretName(skillId, name)), requiredBy: requiredBy.get(name) ?? [] })),
	);
}

export async function setSkillEnv(skillId: string, name: string, value: string | null): Promise<void> {
	if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("Variable names must look like MY_API_KEY");
	if (value === null || value === "") await deleteSecret(secretName(skillId, name));
	else await setSecret(secretName(skillId, name), value);
	await skillsStore.update((r) => {
		const skill = r.skills[skillId];
		if (skill && !(skill.envVars ?? []).includes(name)) skill.envVars = [...(skill.envVars ?? []), name];
	});
}

export async function resolveSkillEnv(skillId: string): Promise<Record<string, string>> {
	const vars = await listSkillEnv(skillId);
	const resolved: Record<string, string> = {};
	for (const v of vars) {
		if (!v.set) continue;
		const value = await getSecret(secretName(skillId, v.name));
		if (value !== null) resolved[v.name] = value;
	}
	return resolved;
}

export async function deleteSkillEnv(skillId: string): Promise<void> {
	const registry = await skillsStore.read();
	for (const name of registry.skills[skillId]?.envVars ?? []) await deleteSecret(secretName(skillId, name)).catch(() => {});
}
