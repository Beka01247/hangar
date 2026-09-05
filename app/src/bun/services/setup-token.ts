import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { SetupTokenProgress } from "../../shared/types";
import { ClaudeCliError, cliEnv, findClaudeBinary } from "./claude-cli";

type ProgressListener = (progress: SetupTokenProgress) => void;

const PTY_HELPER = [
	"import os, pty, sys, select, fcntl, termios, struct",
	"pid, fd = pty.fork()",
	"if pid == 0:",
	"    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', 60, 400, 0, 0))",
	"    os.execvp(sys.argv[1], sys.argv[1:])",
	"while True:",
	"    try:",
	"        ready, _, _ = select.select([fd, 0], [], [])",
	"    except OSError:",
	"        break",
	"    if fd in ready:",
	"        try:",
	"            data = os.read(fd, 65536)",
	"        except OSError:",
	"            break",
	"        if not data:",
	"            break",
	"        os.write(1, data)",
	"    if 0 in ready:",
	"        data = os.read(0, 65536)",
	"        if data:",
	"            os.write(fd, data)",
	"_, status = os.waitpid(pid, 0)",
	"sys.exit(os.waitstatus_to_exitcode(status))",
].join("\n");

function ptyCommand(command: string[]): string[] {
	for (const python of ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"]) {
		if (existsSync(python)) return [python, "-c", PTY_HELPER, ...command];
	}
	return command;
}

function redact(text: string): string {
	return text.replace(TOKEN_RE, "sk-ant-oat01-[redacted]");
}

const TOKEN_RE = /sk-ant-oat01-[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])/g;
const URL_RE = /https:\/\/[^\s"'<>]*oauth[^\s"'<>]*/i;
const CODE_PROMPT_RE = /paste code here/i;
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r/g;

class SetupTokenSession {
	private proc: ReturnType<typeof Bun.spawn> | null = null;
	private buffer = "";
	private reportedUrl = false;
	private reportedCodePrompt = false;
	private finished = false;
	private resolveToken!: (token: string) => void;
	private rejectToken!: (error: Error) => void;
	readonly token: Promise<string>;

	constructor(private readonly onProgress: ProgressListener) {
		this.token = new Promise<string>((resolve, reject) => {
			this.resolveToken = resolve;
			this.rejectToken = reject;
		});
	}

	start(): void {
		const bin = findClaudeBinary();
		if (!bin) throw new ClaudeCliError("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code");
		const env = cliEnv({ TERM: "xterm-256color", FORCE_COLOR: "0", NO_COLOR: "1" });
		this.proc = Bun.spawn(ptyCommand([bin, "setup-token"]), {
			env,
			cwd: homedir(),
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		this.onProgress({ phase: "started" });
		void this.pump(this.proc.stdout as ReadableStream<Uint8Array>);
		void this.pump(this.proc.stderr as ReadableStream<Uint8Array>);
		void this.proc.exited.then((code) => this.onExit(code));
	}

	private async pump(stream: ReadableStream<Uint8Array>): Promise<void> {
		const decoder = new TextDecoder();
		const reader = stream.getReader();
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			this.buffer += decoder.decode(value, { stream: true }).replace(ANSI_RE, " ");
			this.scan();
		}
	}

	private scan(): void {
		if (this.finished) return;
		const tokens = this.buffer.match(TOKEN_RE);
		if (tokens) {
			const token = tokens.reduce((best, t) => (t.length > best.length ? t : best), "");
			console.log(`hangar: setup-token produced a token (${token.length} chars, ${token.slice(0, 16)}…)`);
			this.finish(() => {
				this.onProgress({ phase: "token-received" });
				this.resolveToken(token);
			});
			return;
		}
		if (!this.reportedUrl) {
			const url = this.buffer.match(URL_RE);
			if (url) {
				this.reportedUrl = true;
				this.onProgress({ phase: "browser", url: url[0] });
			}
		}
		if (!this.reportedCodePrompt && CODE_PROMPT_RE.test(this.buffer)) {
			this.reportedCodePrompt = true;
			this.onProgress({ phase: "needs-code" });
		}
		if (this.buffer.length > 200_000) this.buffer = this.buffer.slice(-50_000);
	}

	submitCode(code: string): void {
		const stdin = this.proc?.stdin;
		if (!stdin || typeof stdin === "number") throw new ClaudeCliError("Login is not running");
		stdin.write(`${code.trim()}\n`);
		stdin.flush();
	}

	cancel(): void {
		this.finish(() => {
			this.onProgress({ phase: "cancelled" });
			this.rejectToken(new ClaudeCliError("Login cancelled"));
		});
	}

	private onExit(code: number): void {
		console.log(`hangar: setup-token exited with ${code}; output tail: ${redact(this.buffer.slice(-600))}`);
		if (this.finished) return;
		const tail = this.buffer.trim().split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300);
		this.finish(() => {
			const message = `claude setup-token exited with code ${code}${tail ? `: ${tail}` : ""}`;
			this.onProgress({ phase: "error", message });
			this.rejectToken(new ClaudeCliError(message));
		});
	}

	private finish(report: () => void): void {
		if (this.finished) return;
		this.finished = true;
		report();
		setTimeout(() => this.proc?.kill(), 500);
	}
}

let current: SetupTokenSession | null = null;

export function startSetupToken(onProgress: ProgressListener): Promise<string> {
	current?.cancel();
	const session = new SetupTokenSession(onProgress);
	current = session;
	session.start();
	return session.token.finally(() => {
		if (current === session) current = null;
	});
}

export function submitSetupCode(code: string): void {
	if (!current) throw new ClaudeCliError("Login is not running");
	current.submitCode(code);
}

export function cancelSetupToken(): void {
	current?.cancel();
	current = null;
}
