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

## Data

Settings, skill registry and usage log are JSON files under the app data dir (`Utils.paths.userData`, shown at the bottom of the Library screen). API keys live in the macOS Keychain under `dev.hangar.app.*`.
