import type { LibrarySkill } from "../../shared/types";
import { settingsStore } from "../store/settings";
import { skillsStore } from "../store/skills";
import { daysAgo, startOfMonth, usageStore } from "../store/usage";
import { buildUsageReport } from "./usage-report";

export async function listLibrary(): Promise<LibrarySkill[]> {
	const [registry, log, settings, report] = await Promise.all([
		skillsStore.read(),
		usageStore.read(),
		settingsStore.read(),
		buildUsageReport(),
	]);
	const anomalies = new Set(report.rows.filter((r) => r.anomaly).map((r) => r.skillId));
	const monthStart = startOfMonth().getTime();
	const weekStart = daysAgo(7).getTime();
	const ownLogin = settings.github?.login.toLowerCase() ?? null;

	return Object.values(registry.installed)
		.map((installed) => {
			const skill = registry.skills[installed.skillId];
			if (!skill) return null;
			const usage = log.usage.filter((u) => u.skillId === skill.id && Date.parse(u.timestamp) >= monthStart);
			const runs = log.runs.filter((r) => r.skillId === skill.id);
			const lastRun = runs.reduce<string | null>(
				(latest, r) => (latest === null || r.startedAt > latest ? r.startedAt : latest),
				null,
			);
			return {
				skill,
				installed,
				official: ownLogin !== null && skill.repoOwner.toLowerCase() === ownLogin,
				monthSpendUsd: usage.reduce((sum, u) => sum + u.costUsd, 0),
				monthTokens: usage.reduce((sum, u) => sum + u.tokens, 0),
				runsLast7Days: runs.filter((r) => Date.parse(r.startedAt) >= weekStart).length,
				lastRunAt: lastRun,
				anomaly: anomalies.has(skill.id),
			} satisfies LibrarySkill;
		})
		.filter((item): item is LibrarySkill => item !== null)
		.sort((a, b) => b.installed.installedAt.localeCompare(a.installed.installedAt));
}
