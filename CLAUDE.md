# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # postinstall runs `quasar prepare`
npm run dev                 # web dev server (quasar dev)
npm run dev:desktop         # Electron dev with devtools
npm run build               # SPA build -> dist/spa
npm run build:desktop       # Electron build, all targets
npm run lint                # eslint over src* (src and src-electron)
npm run format              # prettier --write
```

There is no test suite (`npm test` is a no-op). A local Typesense for manual testing lives in `typesense-test-server/docker-compose.yml`.

For the web build, a server must be started with `--enable-cors`. Docker builds accept `PUBLIC_PATH` (must start with `/`), which `quasar.config.ts` reads for `publicPath`.

## Architecture

Quasar (Vue 3 + Vite, TypeScript) app that ships as both a static SPA and an Electron desktop app from one codebase.

- **`src/shared/api.ts`** — the `Api` class wraps the `typesense` client plus a raw axios instance (used for endpoints the client lib lacks). It is shared code: imported by the renderer, and also by the Electron main process.
- **Electron IPC bridge** — `src-electron/electron-main.ts` registers an `ipcMain.handle` for every method on `Api.prototype`, and `electron-preload.ts` exposes them on `window.electron` via a hard-coded `apiMethods` list. When adding a method to `Api`, add its name to that list too, or the desktop build won't expose it. Running API calls in the main process is what avoids CORS and the browser timeouts on large import/export. `importFile` and `rejectTLS` are Electron-only handlers.
- **`src/stores/node.ts`** — the single Pinia store: login state (persisted in LocalStorage, with login history acting as server bookmarks), cached server data (collections, aliases, keys, synonyms, etc.), and the `Api` instance. It probes optional endpoints after login and records availability in `data.features`, so pages and the nav menu adapt to the server version and API key scope. Gate new server-version-dependent UI on these flags.
- **Pages and routing** — `src/pages/*` are routed in `src/router/routes.ts` under `MainLayout`; collection-scoped pages use `collection/:name/<section>`. `src/components/NavMenu.vue` is the sidebar.
- **Boot files** (`src/boot`, order set in `quasar.config.ts`): `instantsearch` registers vue-instantsearch, `darkmode`, and `checkAutoLoginConfig` fetches `config.json` at startup (skipped on Electron) to auto-login and seed history. The Docker image serves a mounted `/srv/config.json` for this; see `config.json.autologin` for the shape.
- **Search UI** — `src/components/search/*` uses `typesense-instantsearch-adapter` (browser-only, so not available through the Electron IPC path) with the Monaco-based `MonacoEditor.vue` for the JSON search view.

## PIA login and the gateway

`Login.vue` signs users in through PIA (`src/shared/pia.ts`): employee ID + password, or the official Google Identity Services button (script tag in `index.html`). Access needs `is_ops_team`; `is_staff` gets the admin Typesense key, everyone else the read-only key (`store.isReadOnly`). The PIA JWT is sent as `Authorization: Bearer`, and the dashboard sends the placeholder key `pia-gateway`. The real Typesense key is injected by an nginx gateway in front of `/v1/`. That gateway is not in this repo. Until it ships, the legacy host + API key form stays on the "API key" tab (`ENABLE_API_KEY_LOGIN=false` at build time removes it).

PIA is called through the same host in web builds (`/pia/` in nginx, and the dev-server proxy), because PIA's CORS preflight sends two `Access-Control-Allow-Origin` values and browsers reject that; Electron calls `https://pia.printo.in/api/v1` directly.

Build-time env (see `quasar.config.ts`): `PIA_API_URL`, `TYPESENSE_API_URL`, `GOOGLE_CLIENT_ID` (defaults to the Printo client; empty hides the Google button; never add a client secret, this flow doesn't use one), `ENABLE_API_KEY_LOGIN`. Production serves from `/dashboard` (`PUBLIC_PATH`); the old `/typesense-dashboard/` URL redirects there in nginx.

## Conventions

Prettier config in `.prettierrc.json` (single quotes, semicolons, print width 100). Not yet implemented upstream: create snapshot, delete by query, scoped search key generation.
