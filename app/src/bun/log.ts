import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA_DIR } from "./store/json-store";

function findProjectRoot(): string | null {
	let dir = dirname(process.argv[1] ?? process.execPath);
	for (let i = 0; i < 8; i++) {
		if (existsSync(join(dir, "electrobun.config.ts"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

const projectRoot = findProjectRoot();
export const LOG_FILES = [join(DATA_DIR, "hangar.log"), ...(projectRoot ? [join(projectRoot, "hangar-dev.log")] : [])];

function format(args: unknown[]): string {
	return args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" ");
}

export function installFileLogging(): void {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
	} catch {}
	const original = { log: console.log, error: console.error, warn: console.warn };
	const write = (level: string, args: unknown[]) => {
		const line = `${new Date().toISOString()} [${level}] ${format(args)}\n`;
		for (const file of LOG_FILES) {
			try {
				appendFileSync(file, line);
			} catch {}
		}
	};
	console.log = (...args) => {
		original.log(...args);
		write("info", args);
	};
	console.warn = (...args) => {
		original.warn(...args);
		write("warn", args);
	};
	console.error = (...args) => {
		original.error(...args);
		write("error", args);
	};
	process.on("uncaughtException", (e) => write("error", ["uncaughtException", e]));
	process.on("unhandledRejection", (e) => write("error", ["unhandledRejection", e]));
}
