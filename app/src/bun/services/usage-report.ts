import type { UsageReport, UsageSkillRow } from "../../shared/types";
import { skillsStore } from "../store/skills";
import { daysAgo, startOfMonth, usageStore } from "../store/usage";

const ANOMALY_FACTOR = 3;
const ANOMALY_MIN_USD = 0.25;

export async function buildUsageReport(): Promise<UsageReport> {
	const [registry, log] = await Promise.all([skillsStore.read(), usageStore.read()]);
	const monthStart = startOfMonth().getTime();
	const dayStart = daysAgo(1).getTime();
	const weekStart = daysAgo(8).getTime();

	const rows: UsageSkillRow[] = Object.values(registry.skills).map((skill) => {
		const records = log.usage.filter((u) => u.skillId === skill.id);
		const month = records.filter((u) => Date.parse(u.timestamp) >= monthStart);
		const last24h = records.filter((u) => Date.parse(u.timestamp) >= dayStart);
		const previousWeek = records.filter((u) => {
			const t = Date.parse(u.timestamp);
			return t >= weekStart && t < dayStart;
		});
		const spend24h = last24h.reduce((s, u) => s + u.costUsd, 0);
		const baselineDaily = previousWeek.reduce((s, u) => s + u.costUsd, 0) / 7;
		const anomaly = spend24h >= ANOMALY_MIN_USD && (baselineDaily === 0 ? month.length > last24h.length : spend24h > baselineDaily * ANOMALY_FACTOR);
		return {
			skillId: skill.id,
			name: skill.name,
			monthSpendUsd: month.reduce((s, u) => s + u.costUsd, 0),
			monthTokens: month.reduce((s, u) => s + u.tokens, 0),
			monthRuns: log.runs.filter((r) => r.skillId === skill.id && Date.parse(r.startedAt) >= monthStart).length,
			spend24hUsd: spend24h,
			baselineDailyUsd: baselineDaily,
			anomaly,
		};
	});

	const totalMonthUsd = rows.reduce((s, r) => s + r.monthSpendUsd, 0);
	const daily = Array.from({ length: 30 }, (_, i) => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - (29 - i));
		return { day: d.toISOString().slice(0, 10), usd: 0 };
	});
	for (const u of log.usage) {
		const hit = daily.find((d) => d.day === u.timestamp.slice(0, 10));
		if (hit) hit.usd += u.costUsd;
	}
	const recent = [...log.usage]
		.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
		.slice(0, 50)
		.map((u) => ({ ...u, skillName: registry.skills[u.skillId]?.name ?? u.skillId }));

	return { totalMonthUsd, daily, rows: rows.sort((a, b) => b.monthSpendUsd - a.monthSpendUsd), recent };
}
