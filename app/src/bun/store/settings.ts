import type { Settings } from "../../shared/types";
import { JsonStore } from "./json-store";

export const settingsStore = new JsonStore<Settings>("settings.json", () => ({
	claudeAuthMode: null,
	disclaimerAcceptedAt: null,
	github: null,
	onboardingCompletedAt: null,
}));
