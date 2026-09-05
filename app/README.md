# Hangar (app)

Electrobun 2 desktop app. Main process runs on Bun (`src/bun`), UI is React in a native webview (`src/mainview`).

## Run

```sh
export PATH="$HOME/.hutch/bin:$PATH"
cd app
hutch install
hutch run dev
```

## Layout

- `src/bun` — main process: RPC handlers, JSON stores, keychain, GitHub/Anthropic clients
- `src/mainview` — React UI: onboarding, library, skill detail
- `src/shared` — types and the RPC schema shared by both sides

## Skill formats

Install by URL supports `plugin.json` (Agent Plugins), `SKILL.md`, Claude Code projects (`CLAUDE.md` + `.claude/commands`), and plain `package.json` / Python projects. MCP servers declared in `mcp.json` / `.mcp.json` are started by Hangar: their tools become forms in the skill screen and are passed to the agent.

## Data

Settings, skill registry and usage log are JSON files under the app data dir (`Utils.paths.userData`, shown at the bottom of the Library screen). API keys live in the macOS Keychain under `dev.hangar.app.*`.
