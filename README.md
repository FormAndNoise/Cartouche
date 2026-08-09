# Tarot Socket Board

A local-first, single-user desktop application for visual artists managing
large multi-deliverable creative projects (e.g. a 70+ card tarot deck). Built
with **Tauri 2 (Rust) + React/TypeScript/Vite + SQLite**.

The app provides a grid of ordered "sockets" — one per deliverable — into which
the artist drops candidate images/documents, compares them, picks a winner,
and tracks overall project progress at a glance. Data lives in a portable
`.tarot/` project folder. No server, no cloud, no multi-user support.

## Project structure

```
.
├── src/                  # React/TypeScript frontend (Vite)
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Vite entry point
│   ├── lib/api.ts         # Tauri IPC re-exports
│   └── __tests__/         # Vitest + Testing Library
├── src-tauri/             # Rust/Tauri backend
│   ├── src/
│   │   ├── lib.rs          # Tauri builder + IPC commands
│   │   └── main.rs         # Binary entry (re-exports lib::run)
│   ├── Cargo.toml
│   ├── tauri.conf.json     # Tauri config (window, bundle, dev server)
│   └── capabilities/       # Tauri 2 permission capabilities
├── package.json           # Frontend deps + scripts
├── Makefile               # install / build / test / lint / dev
├── BUILD_PLAN.md          # Component inventory + build sequence
├── REQUIREMENTS.md        # User stories + acceptance criteria
└── ARCHITECTURE.md        # Technical architecture + data model
```

## Prerequisites

Install these once before first run:

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 20 | <https://nodejs.org> |
| pnpm | >= 9 | `npm install -g pnpm` |
| Rust | stable | <https://rustup.rs> |
| Tauri CLI | 2.x | `cargo install tauri-cli --version "^2" --locked` |
| MSVC Build Tools | 2019+ | Windows only (for Rust/Tauri) |

## How to run

```bash
# 1. Copy environment file (no real secrets needed)
cp .env.example .env

# 2. Install dependencies
make install        # or: pnpm install && cd src-tauri && cargo fetch

# 3. Run tests (CI-friendly, non-interactive)
make test           # frontend (Vitest) + backend (cargo test)

# 4. Build
make build          # frontend (tsc + vite build) + backend (cargo build --release)

# 5. Lint
make lint           # eslint + cargo clippy

# 6. Dev mode (hot reload)
make dev            # frontend only (Vite)
make dev-tauri      # full desktop app (Tauri + Vite)
```

For an all-in-one CI check: `make check` runs install + lint + test + build.

## Smoke test

The scaffold includes a minimal smoke test proving the app entry point loads:

- **Frontend** (`src/__tests__/App.test.tsx`): renders `<App/>`, asserts the
  header appears, and verifies the Tauri IPC `app_version` command resolves
  (mocked in test). Also tests the graceful fallback when no backend is present.
- **Backend** (`src-tauri/src/lib.rs`): `cargo test` runs a unit test asserting
  the `app_version` command returns the crate version string.

Both run non-interactively and exit with status 0 on success.

## Status

This is the **scaffold phase** — the project builds, tests pass, and the IPC
bridge is wired, but feature work (socket grid, file workflow, CSV import,
etc.) has not started. See [BUILD_PLAN.md](BUILD_PLAN.md) for the full build
sequence and [REQUIREMENTS.md](REQUIREMENTS.md) for acceptance criteria.
