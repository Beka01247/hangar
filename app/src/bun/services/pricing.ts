// USD per million tokens; approximate, updated by hand.
const PRICES: { match: RegExp; input: number; output: number }[] = [
	{ match: /opus/i, input: 15, output: 75 },
	{ match: /sonnet/i, input: 3, output: 15 },
	{ match: /haiku/i, input: 0.8, output: 4 },
];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
	const price = PRICES.find((p) => p.match.test(model)) ?? PRICES[1]!;
	return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
