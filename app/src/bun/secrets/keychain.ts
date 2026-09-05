const SERVICE_PREFIX = "dev.hangar.app";
const ACCOUNT = "hangar";

export type SecretName = "claude-api-key" | "claude-oauth-token" | "github-token";

function serviceFor(name: SecretName): string {
	return `${SERVICE_PREFIX}.${name}`;
}

async function runSecurity(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["security", ...args], {
		stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

function assertMac(): void {
	if (process.platform !== "darwin") {
		throw new Error(`Secure storage is not implemented for ${process.platform} yet`);
	}
}

function quote(value: string): string {
	return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
	assertMac();
	const service = serviceFor(name);
	const script = `add-generic-password -U -a ${quote(ACCOUNT)} -s ${quote(service)} -w ${quote(value)}\n`;
	const viaStdin = await runSecurity(["-i"], script);
	if (viaStdin.code === 0 && (await getSecret(name)) === value) return;
	const viaArgs = await runSecurity(["add-generic-password", "-U", "-a", ACCOUNT, "-s", service, "-w", value]);
	if (viaArgs.code !== 0) {
		throw new Error(`Keychain write failed: ${viaArgs.stderr.trim() || viaArgs.code}`);
	}
}

export async function getSecret(name: SecretName): Promise<string | null> {
	assertMac();
	const result = await runSecurity(["find-generic-password", "-a", ACCOUNT, "-s", serviceFor(name), "-w"]);
	if (result.code === 44) return null;
	if (result.code !== 0) {
		throw new Error(`Keychain read failed: ${result.stderr.trim() || result.code}`);
	}
	return result.stdout.replace(/\n$/, "");
}

export async function deleteSecret(name: SecretName): Promise<void> {
	assertMac();
	const result = await runSecurity(["delete-generic-password", "-a", ACCOUNT, "-s", serviceFor(name)]);
	if (result.code !== 0 && result.code !== 44) {
		throw new Error(`Keychain delete failed: ${result.stderr.trim() || result.code}`);
	}
}

export async function hasSecret(name: SecretName): Promise<boolean> {
	return (await getSecret(name)) !== null;
}
