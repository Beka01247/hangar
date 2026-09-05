import type { RunRecord, UsageRecord } from "../../shared/types";
import { JsonStore } from "./json-store";

export interface UsageLog {
	usage: UsageRecord[];
	runs: RunRecord[];
}

export const usageStore = new JsonStore<UsageLog>("usage.json", () => ({
	usage: [],
	runs: [],
}));

export function startOfMonth(now = new Date()): Date {
	return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function daysAgo(days: number, now = new Date()): Date {
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
