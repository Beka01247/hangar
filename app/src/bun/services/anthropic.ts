const API_BASE = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

export class ClaudeAuthError extends Error {}

export async function validateClaudeKey(apiKey: string): Promise<void> {
	const key = apiKey.trim();
	if (!key.startsWith("sk-ant-")) {
		throw new ClaudeAuthError("This does not look like an Anthropic API key (expected sk-ant-…)");
	}
	let response: Response;
	try {
		response = await fetch(`${API_BASE}/v1/models?limit=1`, {
			headers: { "x-api-key": key, "anthropic-version": API_VERSION },
		});
	} catch (error) {
		throw new ClaudeAuthError(`Could not reach api.anthropic.com: ${(error as Error).message}`);
	}
	if (response.status === 401 || response.status === 403) {
		throw new ClaudeAuthError("Anthropic rejected this key");
	}
	if (!response.ok) {
		throw new ClaudeAuthError(`Anthropic returned HTTP ${response.status}`);
	}
}
