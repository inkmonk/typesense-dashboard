# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # postinstall runs `quasar prepare`
npm ci --prefix src-electron --ignore-scripts   # also needed: type-check and build read src-electron
npm run dev                 # web dev server (quasar dev)
npm run dev:desktop         # Electron dev with devtools
npm run build               # SPA build -> dist/spa
npm run build:desktop       # Electron build, all targets
npm run lint                # eslint over src* (src and src-electron)
npm run format              # prettier --write
npx vue-tsc --noEmit        # type-check
node --test gateway/auth-service.test.js   # the only tests: the gateway auth service
./deploy.sh                 # on the server only, see "Production" below
```

There is no app test suite (`npm test` is a no-op). A local Typesense for manual testing lives in `typesense-test-server/docker-compose.yml`.

Needs Node 20+ (Quasar app-vite 3). The default `node` on the dev Mac is v16, so `nvm use 22` first. The production server's system Node is 18 (too old for the build): install Node 22 with nvm for the `ubuntu` user, `deploy.sh` picks it up (see `deploy/README.md`).

`npm run dev` proxies `/v1` (Typesense) and `/pia` (PIA) to the live hosts (see `devServer.proxy` in `quasar.config.ts`), so local sign-in and API calls are same-origin and avoid CORS. Docker builds accept `PUBLIC_PATH` (must start with `/`), which `quasar.config.ts` reads for `publicPath`.

Imports use the `@/` alias (`@/stores/node`), not `src/...`. Environment variables follow Quasar 3: the config file reads `import.meta.env.X`, and values the client needs are passed through `build.defineEnv` (read as `import.meta.env.X`); Quasar's own are `import.meta.env.QUASAR_*` (e.g. `QUASAR_VUE_ROUTER_MODE`). `process.env` no longer reaches client code. Custom variable typings live in the root `env.d.ts`.

## Architecture

Quasar (Vue 3 + Vite, TypeScript) app that ships as both a static SPA and an Electron desktop app from one codebase.

- **`src/shared/api.ts`** — the `Api` class wraps the `typesense` client plus a raw axios instance (used for endpoints the client lib lacks). It is shared code: imported by the renderer, and also by the Electron main process.
- **Electron IPC bridge** — `src-electron/electron-main.ts` registers an `ipcMain.handle` for every method on `Api.prototype`, and `electron-preload.ts` exposes them on `window.electron` via a hard-coded `apiMethods` list. When adding a method to `Api`, add its name to that list too, or the desktop build won't expose it. Running API calls in the main process is what avoids CORS and the browser timeouts on large import/export. `importFile` and `rejectTLS` are Electron-only handlers.
- **`src/stores/node.ts`** — the single Pinia store: login state (persisted in LocalStorage, with login history acting as server bookmarks), cached server data (collections, aliases, keys, synonyms, etc.), and the `Api` instance. It probes optional endpoints after login and records availability in `data.features`, so pages and the nav menu adapt to the server version and API key scope. Gate new server-version-dependent UI on these flags.
- **Pages and routing** — `src/pages/*` are routed in `src/router/routes.ts` under `MainLayout`; collection-scoped pages use `collection/:name/<section>`. `src/components/NavMenu.vue` is the sidebar. Web builds use history routing (clean URLs, `/dashboard/collections`); Electron (`file://`) and the Docker image (Caddy has no SPA fallback) stay on hash (`VUE_ROUTER_MODE`, read in `quasar.config.ts`, set in the `Dockerfile`). Old `/#/...` bookmarks are rewritten on load in `src/router/index.ts`. The router guard restores a saved session before the first navigation (no login-page flash) and redirects read-only users away from `/apikeys` and `/collection/:name/document`.
- **Boot files** (`src/boot`, order set in `quasar.config.ts`): `instantsearch` registers vue-instantsearch, `darkmode`, and `checkAutoLoginConfig` fetches `config.json` from the app base path at startup (skipped on Electron) to auto-login and seed history. The Docker image serves a mounted `/srv/config.json` for this; see `config.json.autologin` for the shape.
- **Newer upstream features** (merged from upstream v2.5.0): Typesense v30 synonym and curation sets, cluster/health status, snapshots, stemming dictionaries, connection timeout, SAME-host and base64 `config.json` (`entrypoint.sh`), project-info panel (`ui.hideProjectInfo` in `config.json`). On connect the store probes extra endpoints (`/stemming/dictionaries`, `/synonym_sets`, `/curation_sets`) and records the result in `data.features`; a read-only key that cannot list them just disables those pages.
- **Search UI** — `src/components/search/*` uses `typesense-instantsearch-adapter` (browser-only, so not available through the Electron IPC path) with the Monaco-based `MonacoEditor.vue` for the JSON search view. The InstantSearch client is built in `SearchInstantSearch.vue` from the saved login, so in PIA mode it must be given the Bearer token itself and told to send the key as a header (`sendApiKeyAsQueryParam: false`, otherwise it goes in the URL and the gateway cannot replace it).

## PIA login and the gateway

**Sign-in.** `Login.vue` signs users in through PIA (`src/shared/pia.ts`, API at `https://pia.printo.in/api/v1`): employee ID + password, or the official Google Identity Services button (script tag in `index.html`). The PIA JWT is kept in LocalStorage (`typesense-pia-session`), sent as `Authorization: Bearer`, re-verified and refreshed in `store.refreshPiaSession` on every connect. The dashboard sends the placeholder key `pia-gateway`; the real Typesense key is added by nginx.

**Roles** (from PIA `token-verify`): `is_ops_team` is required to get in; `is_staff` gets the admin Typesense key, other ops users the read-only key. `store.canWrite` is false only for PIA users who are not staff (API-key and desktop sign-ins count as able to write: the dashboard cannot see what a pasted key allows). Read-only users do not see the API Keys / Add Document pages, add/edit forms, Edit/Delete buttons, schema editor or the Operations card; Typesense still enforces the read-only key, the hiding only removes controls that cannot work.

**Gateway** (`gateway/`, live on typesense.printo.in): `auth-service.js` (dependency-free Node, `127.0.0.1:9177`, systemd unit `typesense-auth`) is called by nginx `auth_request` for every `/v1/` request that carries a token; it checks the token with PIA (cached 60s) and answers 200 + `X-Role: admin|readonly`, 401, 403, or 503 (PIA down, fails closed). The two Typesense keys live only in `/etc/nginx/conf.d/typesense-keys.conf` on the server (root-only, never in git). Port 9100 is taken by Prometheus node_exporter, hence 9177. `gateway/README.md` has the rollout and rollback steps.

**LEGACY path, still open.** Web builds hide the "API key" tab by default, but the nginx `LEGACY` block is still there: requests with no `Authorization` header skip the gateway and keep using the `x-typesense-api-key` they send (scripts, anyone holding a Typesense key). Web builds also forget saved API-key logins at startup (`dropSavedApiKeyLogin` in `stores/node.ts`, shows "Please sign in with your Printo account"). So hiding the tab is cosmetic; anyone with a key still bypasses PIA. Closing it = delete the `LEGACY` blocks in the nginx file, then rotate the old admin key (`gateway/README.md` step 7).

**PIA is called through the same host** in web builds (`/pia/` in nginx, and the dev-server proxy), because PIA's CORS preflight sends two `Access-Control-Allow-Origin` values and browsers reject that. Electron calls PIA directly.

Build-time env (see `printoEnv` in `quasar.config.ts`; `.env.deploy` on the server can set them): `PIA_API_URL`, `TYPESENSE_API_URL`, `GOOGLE_CLIENT_ID` (defaults to the Printo client; empty hides the Google button; never add a client secret, this flow doesn't use one), `ENABLE_API_KEY_LOGIN` (the "API key" tab: off by default for web builds, on for Electron and the Docker image, which connect to any server; `ENABLE_API_KEY_LOGIN=true` in `.env.deploy` brings it back for one deploy). Production serves from `/dashboard` (`PUBLIC_PATH`); the old `/typesense-dashboard/` URL redirects there in nginx.

## Production (typesense.printo.in)

- **Server:** one Ubuntu EC2 box, user `ubuntu`, repo checkout at `~/typesense-dashboard` (remote `inkmonk/typesense-dashboard`, branch `main`). nginx serves the built site from `dist/spa` at `/dashboard/`, proxies `/v1/` to Typesense (`127.0.0.1:8108`; Typesense listens on all interfaces, but the AWS firewall blocks 8108 from outside, checked once) and `/pia/` to PIA. The live site file is `/etc/nginx/sites-enabled/typesense.printo.in`; its source is `gateway/nginx/typesense.printo.in.conf` (`deploy/nginx/...` is the dashboard-paths-only version without the gateway). Never leave `*.backup` files in `sites-enabled`: nginx loads them too.
- **Deploy:** `cd ~/typesense-dashboard && git pull --ff-only origin main && ./deploy.sh`. It refuses a dirty tree or a branch other than `main`, builds into `dist/spa-build` (Quasar empties its output folder, and `dist/spa` is live), swaps it into `dist/spa` keeping `dist/spa.prev`, and checks that the public URL serves the new entry script. `./deploy.sh rollback` swaps the previous build back. Optional per-server build options go in the git-ignored `.env.deploy` (copy `.env.deploy.example`); don't edit tracked files on the server.
- **Don't name a file `.env`:** Quasar loads it into the public bundle.

## Working here

- **This is a fork** (`inkmonk/typesense-dashboard` of `bfritscher/typesense-dashboard`). `gh pr create` defaults to the upstream author's repo: always pass `--repo inkmonk/typesense-dashboard --base main --head <branch>`.
- Branch from `main`, one PR per change; merge only when the user says so. Don't delete branches without asking.
- Upstream was merged at v2.5.0 (branch `sync/upstream-2.5.0`). To sync again: `git fetch https://github.com/bfritscher/typesense-dashboard.git main`, merge on a branch, and re-check our own layer: `src/shared/pia.ts`, the PIA parts of `stores/node.ts` (`piaSession`, `canWrite`, `refreshPiaSession`, `piaLogin`, `signOut`), `Login.vue`, `MainLayout.vue`, the router guard, `SearchInstantSearch.vue`, the `canWrite` hiding on pages (new upstream pages with write forms need it too) and `printoEnv` in `quasar.config.ts`.

## Knowledge graph

`graphify-out/` holds a knowledge graph of this repo (code via AST, plus the docs and screenshots): `GRAPH_REPORT.md` (most-connected nodes, communities, suggested questions), `graph.json` and an interactive `graph.html`. It is git-ignored and regenerable, so never commit it.

- Before reading many files, query it: `graphify query "what calls refreshPiaSession"`, `graphify explain "Api"`, `graphify path "Login.vue" "Api"`.
- It goes stale as the code changes. Rebuild with `/graphify` (full) or `/graphify --update` (changed files only) after larger changes, and do not trust it over the code if they disagree.
- The last health check reported dangling edges (probably imports of external packages, not confirmed), so treat edge counts as approximate.

## Not done yet

Close the LEGACY path and rotate the old admin key (above); check the read-only view with a real non-staff ops account.

## Conventions

Prettier config in `.prettierrc.json` (single quotes, semicolons, print width 100). Not yet implemented upstream: delete by query, scoped search key generation.
