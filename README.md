# Hangar

Desktop app that installs agentic Claude skills straight from a GitHub repository and gives each one its own window instead of a bare terminal.

Anyone can install any repository by URL. Hangar does not curate or review skills; it shows what a skill asks for (secrets, network, files) before anything runs, keeps each skill's dependencies isolated, and hands out scoped credentials instead of your raw keys. You decide what to trust.

## Status

Early development. Working today:

- Onboarding: Claude via your Pro/Max subscription (one-click through Claude Code) or an API key, GitHub via CLI login / token, one-time disclaimer
- Library of installed skills with per-skill usage
- Install by URL: shallow clone, manifest detection (`plugin.json` → `SKILL.md` → `package.json` / Python project), consent screen, isolated dependencies

Planned next: scoped tokens (token proxy), running skills through the Claude Agent SDK, generated UI from tool schemas, store (GitHub search), usage tracking, updates.

## Stack

- [Electrobun](https://electrobun.dev) 2 with a Bun main process and a native webview
- TypeScript everywhere, React for the UI
- Local JSON storage, secrets in the system keychain, no backend

## Development

Requires macOS (for now), [Bun](https://bun.sh) and Claude Code CLI for subscription auth.

```sh
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
cd app
hutch install
hutch run dev
```

See [`app/README.md`](app/README.md) for the code layout.

## License

MIT
