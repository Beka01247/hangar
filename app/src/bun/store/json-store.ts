import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Utils } from "electrobun/main";

function resolveDataDir(): string {
	try {
		return Utils.paths.userData;
	} catch {
		return join(Utils.paths.appData, "dev.hangar.app");
	}
}

export const DATA_DIR = resolveDataDir();

export class JsonStore<T> {
	private readonly path: string;
	private cache: T | null = null;
	private writing: Promise<void> = Promise.resolve();

	constructor(fileName: string, private readonly initial: () => T) {
		this.path = join(DATA_DIR, fileName);
	}

	async read(): Promise<T> {
		if (this.cache) return this.cache;
		const file = Bun.file(this.path);
		if (await file.exists()) {
			try {
				this.cache = (await file.json()) as T;
				return this.cache;
			} catch (error) {
				console.error(`hangar: corrupt store ${this.path}, resetting`, error);
			}
		}
		this.cache = this.initial();
		return this.cache;
	}

	async write(value: T): Promise<void> {
		this.cache = value;
		if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
		const tmp = `${this.path}.tmp`;
		this.writing = this.writing.then(async () => {
			await Bun.write(tmp, JSON.stringify(value, null, 2));
			renameSync(tmp, this.path);
		});
		await this.writing;
	}

	async update(mutate: (current: T) => T | void): Promise<T> {
		const current = await this.read();
		const next = mutate(current) ?? current;
		await this.write(next);
		return next;
	}
}
