import type { Permission, ScopedToken, TokenScope } from "../../shared/types";
import { JsonStore } from "./json-store";

export interface TokenRegistry {
	tokens: Record<string, ScopedToken>;
}

export const tokensStore = new JsonStore<TokenRegistry>("tokens.json", () => ({ tokens: {} }));

export function scopesFromPermissions(permissions: Permission[]): TokenScope[] {
	const scopes = new Set<TokenScope>();
	for (const p of permissions) {
		if (p.type === "claude") scopes.add("claude");
		if (p.type === "github") scopes.add("github");
		if (p.type === "network") scopes.add("network");
	}
	scopes.add("claude");
	return [...scopes];
}

function randomToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return `hangar_${Buffer.from(bytes).toString("base64url")}`;
}

export async function issueToken(skillId: string, scopes: TokenScope[]): Promise<ScopedToken> {
	const token: ScopedToken = {
		skillId,
		token: randomToken(),
		allowedScopes: scopes,
		issuedAt: new Date().toISOString(),
		revokedAt: null,
	};
	await tokensStore.update((registry) => {
		for (const [key, existing] of Object.entries(registry.tokens)) if (existing.skillId === skillId) delete registry.tokens[key];
		registry.tokens[token.token] = token;
	});
	return token;
}

export async function revokeTokens(skillId: string): Promise<void> {
	await tokensStore.update((registry) => {
		for (const [key, existing] of Object.entries(registry.tokens)) if (existing.skillId === skillId) delete registry.tokens[key];
	});
}

export async function tokenForSkill(skillId: string): Promise<ScopedToken | null> {
	const registry = await tokensStore.read();
	return Object.values(registry.tokens).find((t) => t.skillId === skillId && t.revokedAt === null) ?? null;
}

export async function setScope(skillId: string, scope: TokenScope, granted: boolean): Promise<ScopedToken | null> {
	let updated: ScopedToken | null = null;
	await tokensStore.update((registry) => {
		for (const token of Object.values(registry.tokens)) {
			if (token.skillId !== skillId) continue;
			const scopes = new Set(token.allowedScopes);
			if (granted) scopes.add(scope);
			else scopes.delete(scope);
			token.allowedScopes = [...scopes];
			updated = token;
		}
	});
	return updated;
}

export async function resolveToken(bearer: string): Promise<ScopedToken | null> {
	const registry = await tokensStore.read();
	const token = registry.tokens[bearer];
	return token && token.revokedAt === null ? token : null;
}
