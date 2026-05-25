# AGENTS.md — vSphere Nexus

## Project Summary

Full-stack vSphere management platform. React 19 + Vite frontend, Express 5 + WebSocket backend, communicating with VMware vCenter/ESXi via SOAP API. No database — state is held in-memory sessions and a JSON file (`data/jobs.json`) with AES-256-GCM encrypted payloads.

## Commands

```bash
npm install            # install dependencies
npm run dev            # start both client + server (concurrently)
npm run dev:client     # Vite dev server on port 5174
npm run dev:server     # Express on port 4173 (uses --watch-path for reload)
npm run build          # Vite production build → dist/
npm start              # production: NODE_ENV=production node server/index.js
```

There are **no tests, no linter, no typecheck** configured in this repo.

## Architecture

- **`src/`** — React SPA (Vite entry: `src/main.jsx`)
  - `src/features/` — page-level components: `auth/`, `dashboard/`, `deployment/`, `inventory/`, `jobs/`, `settings/`
  - `src/components/` — shared UI and `console/` (WebMKS)
  - `src/store/` — Zustand stores: `useAuthStore.js`, `useAppStore.js`
  - `src/lib/utils.js` — `cn()` utility (clsx + tailwind-merge)
- **`server/`** — Express backend (entry: `server/index.js`)
  - All API routes are defined inline in `server/index.js` (no route files)
  - `server/services/vmService.js` — vSphere SOAP interaction, inventory discovery
  - `server/services/vimClient.js` — low-level VI API client
  - `server/ovftool.js` — ovftool binary resolution and CLI wrapper
  - `server/jobs.js` — job queue with persistent JSON storage and encryption
  - `server/routes/`, `server/controllers/`, `server/core/` — **empty directories**
- **`public/wmks.min.js`** — VMware WebMKS console library (loaded via `<script>`)
- **`bin/{darwin,linux,win32}/`** — platform-specific ovftool binaries (gitignored except `.gitkeep`)

## Key Dev Details

- **ESM only** — `"type": "module"` in package.json. All server files use `import`.
- **Express 5** — not Express 4. API differences may apply.
- **Vite proxy** — in dev, `/api` requests are proxied from port 5174 → 4173 via `vite.config.js`.
- **WebSocket console proxy** — `server/index.js` handles raw TLS WebSocket tunneling to ESXi hosts for VM console access (not a standard Express route; uses `server.on('upgrade')`).
- **Auth** — always required. Users authenticate with vSphere (vCenter/ESXi) credentials; no built-in platform auth.
- **Tailwind with CSS variables** — shadcn/ui-style theming using HSL CSS variables in `src/index.css`. Dark mode via `class` strategy.
- **No test framework** — no test runner or test files exist.
- **No formatter/linter config** — no ESLint, Prettier, or similar. Follow `.editorconfig`: 2-space indent, LF, no trailing whitespace.
- **ovftool setup** — run `./setup-ovftool.sh <installer-path>` to install ovftool into `bin/<platform>/`. The binary is auto-detected at startup.
- **`data/` directory** — created at runtime for `jobs.json` and `.payload-key`. Gitignored.
- **Environment** — copy `.env.example` to `.env`. Key vars: `PORT` (default 4173), `NODE_ENV`, `CORS_ORIGIN`, `OVFTOOL_PATH`.
- **Node >= 20.0.0 required**.
