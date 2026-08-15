# AGENTS.md — Cartouche

Local-first desktop app for visual artists managing multi-deliverable card and tarot series. Built with **Tauri 2 (Rust) + React 19/TypeScript/Vite + SQLite**.

**Brand Identity**:
- Name: **Cartouche** (Repo: `cartouche`)
- Accent: Slate-Blue (`#3F6E8C` / Dark: `#6FA0BE`)
- Job Line: *"Local workspace to stage, audition, and lock artwork into ordered deliverable grids."*
- Symbol: 24×24u, 1.75u stroke, 3×2 card slot grid with 1 solid locked state pip.
- Suite Model: Loose Endorsed Family (Form & Noise Atelier). Standard canvas: Accent + Ink (#141414) + Ground (Paper #F6F1EA / Void #0B0B0B). Space Grotesk / Inter / IBM Plex Mono.

## Getting Started

```bash
make install   # pnpm install + cargo fetch
make dev-tauri # full desktop app (Tauri + Vite, hot reload)
make test      # frontend (Vitest) + backend (cargo test)
make check     # install + lint + test + build (CI-equivalent)
```

Prerequisites: Node.js >= 20, pnpm >= 9, Rust stable, Tauri CLI 2.x (`cargo install tauri-cli --version "^2" --locked`).

## Repository Layout

This is a **git worktree monorepo**. The primary development worktree is `.worktrees/t_99bad544_new/`. Other worktrees (t_315405f4, t_c9549242, t_99bad544) contain earlier-stage or parallel versions of backend and frontend code. Documents like BUILD_PLAN.md, REQUIREMENTS.md, and ARCHITECTURE.md in those worktrees may be more complete than the ones in the main tree — the BUILD_PLAN.md in the root consolidates key decisions across all worktrees.

```
.worktrees/t_99bad544_new/
├── src/                  # React/TypeScript frontend (Vite)
│   ├── App.tsx           # Root component
│   ├── main.tsx          # Vite entry point
│   ├── lib/api.ts        # Tauri IPC re-exports
│   ├── components/       # (empty — scaffolded, not yet built)
│   └── __tests__/        # Vitest + React Testing Library
├── src-tauri/            # Rust/Tauri backend
│   ├── src/
│   │   ├── lib.rs        # Tauri builder + IPC commands
│   │   └── main.rs       # Binary entry (re-exports lib::run)
│   ├── migrations/       # (empty — schema not yet added)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── Makefile              # install/build/test/lint/dev
├── package.json
├── BUILD_PLAN.md         # Component inventory + milestone sequence
├── REQUIREMENTS.md       # User stories + acceptance criteria
└── ARCHITECTURE.md       # Technical architecture + data model
```

**Other worktrees with significant code:**

- `t_315405f4/` — Pure Rust backend library (no Tauri shell). Contains the core project/socket service implementation (`create_project`, `get_project`, `update_project`, `update_socket`), the `thiserror`-based error enum, inline SQLite schema creation, and integration tests. This is the reference backend implementation that needs to be ported into the Tauri shell.
- `t_c9549242/` — Full frontend prototype with all UI components (SocketGrid, SocketCard, SocketDetailPanel, ProjectSelector, CsvImportModal, Modal, Toasts), state management (`state/store.tsx`), the `BackendClient` interface contract, `MockBackendClient` and `TauriBackendClient` implementations, and comprehensive component tests.

## Architecture

```
Frontend (React/TS/Vite) → BackendClient interface → Tauri IPC invoke() → Rust services → SQLite + filesystem
```

The `BackendClient` interface (defined in `t_c9549242/frontend/src/api/client.ts`) is the contract between UI and backend. Two implementations exist:
- **`TauriBackendClient`** — thin adapter over `invoke()` for the real Rust backend
- **`MockBackendClient`** — in-memory, contract-faithful implementation for tests and standalone Vite dev

The `MockBackendClient` implements the full contract including lock policy, background job simulation (CSV import, preview generation, text extraction), and structured error envelopes. It is detailed enough to exercise the entire UI without a live backend.

## Key Commands

| Command | Description |
|---------|-------------|
| `make install` | Install frontend (pnpm) + fetch backend crates |
| `make dev` | Vite dev server only (frontend, no Tauri) |
| `make dev-tauri` | Full Tauri desktop app with hot reload |
| `make test` | Run frontend tests (Vitest) + backend tests (cargo test) |
| `make test-frontend` | `pnpm test` (Vitest run) |
| `make test-backend` | `cd src-tauri && cargo test` |
| `make lint` | ESLint + cargo clippy |
| `make format` | Prettier + cargo fmt |
| `make build` | `pnpm build` + `cargo build --release` |
| `make clean` | Remove dist, node_modules/.vite, cargo clean |
| `make check` | Full CI: install + lint + test + build |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:ui` | Vitest UI |

## Code Conventions

- **TypeScript**: strict mode, `noUnusedLocals`/`noUnusedParameters` on, unused vars prefixed with `_`. ES2022 target. JSX: `react-jsx`.
- **Prettier**: 80-char width, double quotes, semicolons, trailing commas.
- **ESLint**: flat config (`eslint.config.js`), typescript-eslint, react-hooks and react-refresh plugins.
- **Rust**: edition 2021, MSRV 1.77. `#[deny(warnings)]` via clippy. Release builds use LTO + strip + `opt-level = "s"`. Pretty assertions for tests.
- **Imports**: Frontend components import the backend client from `src/api/client.ts` (the `BackendClient` interface). Types live in `src/api/types.ts`. Never import `@tauri-apps/api` directly in components — go through the client module.
- **State**: React context (`BoardProvider` / `useBoard`) holds the open project, client reference, selection, and toasts. All mutations go through the `BackendClient` contract, never direct state edits for backend-owned data.
- **Error handling**: All backend errors return `{ code: string, message: string, details: object|null }`. Frontend wraps them in `ApiError`. Error codes are a fixed enum: `INVALID_SOCKET_COUNT`, `PATH_NOT_WRITABLE`, `NOT_FOUND`, `PROJECT_CORRUPT`, `LOCKED`, `SOCKET_NOT_FOUND`, `FILE_UNREADABLE`, `UNSUPPORTED_FORMAT`, `IS_SELECTED`, `VALIDATION_ERROR`, `MISSING_REQUIRED_COLUMN`, `DUPLICATE_ID`, `MISSING_SOCKET`, `INTERNAL_ERROR`.

## Data Model

6 SQLite tables: `projects`, `sockets`, `works`, `previews`, `extracted_text`, `import_jobs`. WAL mode, auto-commit on every mutation. Data lives in a portable `.tarot/` project folder: `project.sqlite`, `assets/<sha256>.<ext>`, `previews/<work-id>.webp`, `manifest.json`.

Fixed metadata schema on sockets: `status` (not_started/in_progress/needs_review/done), `medium` (string), `tags` (string), `due_date` (RFC 3339 or null).

## Testing

- **Frontend**: Vitest + jsdom + React Testing Library + user-event. `@testing-library/jest-dom` matchers auto-loaded via `src/__tests__/setup.ts`. Tests use `MockBackendClient` with `latency: 0` and `jobTickMs: 5` for fast execution. The test harness in `t_c9549242/frontend/src/test/harness.tsx` provides `renderApp()` and `createProjectViaUi()` helpers.
- **Backend (t_99bad544_new)**: Single unit test for `app_version` command. Cargo test runs from `src-tauri/`.
- **Backend (t_315405f4)**: Integration tests using `tempfile::tempdir()` for isolated project directories. Tests cover create, load, lock, update, and error paths.

## Current Status

The scaffold phase (M1, T-01) is complete in `t_99bad544_new`: Tauri shell boots, React app renders, IPC bridge is wired (`app_version` command). No feature work has started. The schema migration directory and components directory are empty.

The next tickets to implement are:
- **T-02**: SQLite schema & migrations (6 tables)
- **T-03**: Rust structured error envelope

Refer to `BUILD_PLAN.md` for the full 30-ticket dependency graph and milestone sequencing.

## Gotchas

- **pnpm, not npm**: The project uses pnpm with a workspace config. `npm install` will fail — use `pnpm install`.
- **Worktrees**: Documents and code are scattered across multiple git worktrees. If you're looking for a specific component implementation, check `t_315405f4/` (backend) and `t_c9549242/` (frontend) first — they contain the most complete reference code.
- **Vite dev server port**: Fixed at `1420` with `strictPort: true`. The Tauri dev command starts Vite before launching the webview.
- **Tauri CSP**: Set to `null` in tauri.conf.json — the app is local-only so no Content Security Policy restrictions.
- **Socket count is fixed at creation**: Per user decision (Q-1), there is no add/remove socket UI. The socket count is immutable after `create_project`.
- **Winner selection hides non-winners**: When a work is selected as winner, non-selected works are hidden from the grid card (not deleted — they remain visible in the detail panel). Compare implementation in `t_c9549242/frontend/src/components/SocketCard.tsx`.
- **Grid columns capped at 4**: Per user decision (Q-2), not 5 as originally proposed.
- **No dedicated comparison view**: Per user decision (Q-11), comparison is via thumbnails inside the socket card/detail panel only.
- **ComfyUI and LLM/MCP are scrapped**: Explicitly removed from scope. No placeholder code, no API surface.
- **The `t_315405f4` backend is a pure library** — it's not wired into Tauri. It has no `tauri` dependency, uses `rusqlite` directly. When porting to the Tauri shell, the service functions become `#[tauri::command]` handlers.
- **The `api.md` files** at the repo root and in `t_315405f4/docs/` document the backend contract. They describe the IPC command surface, not an HTTP API.