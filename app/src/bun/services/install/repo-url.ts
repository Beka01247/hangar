export interface RepoRef {
	owner: string;
	name: string;
	ref: string | null;
	subdir: string | null;
	httpsUrl: string;
	htmlUrl: string;
}

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

export function parseRepoUrl(input: string): RepoRef {
	const raw = input.trim();
	if (!raw) throw new Error("Paste a GitHub repository URL");

	let owner: string | undefined;
	let name: string | undefined;
	let ref: string | null = null;
	let subdir: string | null = null;

	const ssh = raw.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
	const shorthand = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
	if (ssh) {
		[, owner, name] = ssh;
	} else if (shorthand) {
		[, owner, name] = shorthand;
	} else {
		let url: URL;
		try {
			url = new URL(raw.includes("://") ? raw : `https://${raw}`);
		} catch {
			throw new Error("This does not look like a GitHub repository URL");
		}
		if (!url.hostname.includes(".")) throw new Error("This does not look like a GitHub repository URL");
		if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
			throw new Error("Only github.com repositories are supported for now");
		}
		const parts = url.pathname.split("/").filter(Boolean);
		if (parts.length < 2) throw new Error("URL must point to a repository: github.com/owner/repo");
		owner = parts[0];
		name = parts[1]!.replace(/\.git$/, "");
		if (parts[2] === "tree" && parts[3]) {
			ref = parts[3];
			subdir = parts.length > 4 ? parts.slice(4).join("/") : null;
		}
	}

	if (!owner || !name || !NAME_RE.test(owner) || !NAME_RE.test(name)) {
		throw new Error("Could not read owner/repository from this URL");
	}
	return {
		owner,
		name,
		ref,
		subdir,
		httpsUrl: `https://github.com/${owner}/${name}.git`,
		htmlUrl: `https://github.com/${owner}/${name}`,
	};
}

export function skillIdFor(repo: RepoRef): string {
	const base = `${repo.owner}-${repo.name}${repo.subdir ? `-${repo.subdir.replace(/[^A-Za-z0-9]+/g, "-")}` : ""}`;
	return base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
