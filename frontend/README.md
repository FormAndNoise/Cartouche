# Tarot Socket Board — Frontend

React + TypeScript + Vite client for the Tarot Socket Board (see
`REQUIREMENTS.md` at the repo root for the full spec).

## How to run

```bash
cd frontend
npm install
npm run dev        # dev server (http://localhost:5173), runs on the mock backend
npm test           # vitest + React Testing Library (31 tests)
npm run build      # typecheck + production bundle
```

Inside the Tauri shell the app automatically uses the real Rust backend
(`TauriBackendClient`, contract in `docs/api.md`). In a plain browser it
falls back to a contract-faithful in-memory mock (`MockBackendClient`) so
every screen is exercisable without a server. `?mock=1` forces the mock
even inside Tauri. A "Load demo project" button appears in mock mode.

## Architecture

```
src/
  api/
    types.ts        domain model + ApiError envelope (US-B09)
    client.ts       BackendClient interface — the ONLY seam UI code talks through
    mockClient.ts   in-memory implementation (tests + browser mode)
    tauriClient.ts  Tauri IPC adapter (packaged app)
    blobUtil.ts     jsdom-safe Blob/File reading
    index.ts        runtime client factory
  state/store.tsx   BoardProvider: project state, mutations, toasts
  components/       ProjectSelector, SocketGrid, SocketCard,
                    SocketDetailPanel, CsvImportModal, Modal, Toasts
  test/             vitest setup + component tests
```

All mutations go through `BackendClient`; the store never edits
backend-owned state directly, and every rejection surfaces as a
structured toast carrying the `[CODE] message` envelope.

## Requirements traceability

| Story | Implementation | Evidence |
|---|---|---|
| US-F01 app shell & routing | `ProjectSelector`, `App` | app.test.tsx "project selector & app shell" |
| US-F02 grid 1–4 cols, scroll | `SocketGrid` | app.test.tsx "socket grid" |
| US-F03 card states | `SocketCard` | app.test.tsx "socket card states" |
| US-F04 fixed metadata editor | `SocketDetailPanel` (status select, medium, tags, due_date) | app.test.tsx "metadata editor" |
| US-F05 file picker & DnD | `SocketCard` drop target + panel Browse | real-run verified; locked-drop toasts LOCKED (AC-F05.4) |
| US-F06 in-panel comparison | works list in `SocketDetailPanel` | winner badge distinguishes candidates (AC-F06.3) |
| US-F07 winner & lock UI | `SocketDetailPanel` + store | app.test.tsx "winner & lock UI"; grid hides non-selected (AC-F07.1) |
| US-F08 CSV import wizard | `CsvImportModal` | app.test.tsx "CSV import UI" (preview→progress→summary) |
| US-F09 extracted text | `ExtractedTextSection` | collapsible, collapsed by default |
| US-F10 keyboard nav & ARIA | `SocketGrid` arrow-key routing, roles/labels | app.test.tsx "keyboard navigation" |
| US-B09 error envelope | `ApiError`, `normalizeError`, toasts | mockClient.test.ts "errors carry the structured envelope shape" |
| Mock contract fidelity | `MockBackendClient` | mockClient.test.ts (lock policy, IS_SELECTED, CSV jobs, LOCKED rows) |

### Assumptions carried forward (REQUIREMENTS.md §6.3/§6.4)
- Metadata schema = `status` (enum), `medium`, `tags`, `due_date` — flagged
  `[ASSUMPTION]`, needs stakeholder confirmation.
- "Hide non-selected" = winner-only thumbnail on the grid card; all
  candidates remain visible in the detail panel.

## Notes for the scaffold/Tauri task

This package is intentionally standalone (its own `package.json`/lockfile)
so it builds green independently of the Tauri scaffold. When the scaffold
task lands, it can either adopt `frontend/` as the Vite app root
(`frontendDist` in tauri.conf.json) or merge these sources into its own
layout — the `src/api` seam is the integration point for the Rust commands.
