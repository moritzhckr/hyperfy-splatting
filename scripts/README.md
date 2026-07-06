# scripts/

Build and utility scripts for Hyperfy. All are invoked via `npm run <command>` — run them from the repo root, not directly.

## Build scripts

| Script | npm command | Output |
|---|---|---|
| `build.mjs` | `npm run dev` / `npm run build` | Full stack: client → `build/public/`, server → `build/index.js`. Use this for normal development and production. |
| `build-static.mjs` | `npm run static:build` | Self-contained offline client → `build/static/`. No server required. Deployed to GitHub Pages. Set `PUBLIC_WS_URL` env var to bake in a default server. |
| `build-client.mjs` | `npm run client:dev/build` | Embeddable client → `build/world-client.js`. Externalizes `three`, `react`, and `ses` — intended for embedding a world into a host page that already provides those deps. |
| `build-viewer.mjs` | `npm run viewer:dev/build` | Standalone 3D viewer → `build/viewer/`. Minimal build from `src/core/createViewerWorld.js` with `three` external. |
| `build-node-client.mjs` | `npm run node-client:dev/build` | Headless Node.js client → `build/world-node-client.js`. Runs without a browser or renderer — for bots, agents, or server-side simulation. |

## Utility scripts

| Script | npm command | What it does |
|---|---|---|
| `backup-world.mjs` | `npm run world:backup` | Creates a `.tar.gz` snapshot of the world folder in `world/backups/`. Keeps the 7 most recent backups. Respects the `WORLD` env var. |
