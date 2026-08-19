# Cartouche

A local-first desktop application for visual artists managing large multi-deliverable creative series (such as tarot decks, TCGs, and print suites). Built with **Tauri 2 (Rust) + React 19 / TypeScript / Vite + SQLite**.

The app provides a grid of ordered deliverable "sockets" into which the artist drops candidate artwork variations, compares them side-by-side, picks a winner, and tracks overall project progress at a glance. Data lives in a portable `.tarot/` project directory containing an embedded SQLite database and content-addressed asset store.

## Project Structure

```
.
├── src/                  # React 19 / TypeScript frontend (Vite)
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Vite entry point
│   ├── components/        # UI components (SocketGrid, SocketCard, DetailPanel, CsvImportModal, etc.)
│   ├── state/             # BoardProvider and context state store
│   ├── api/               # BackendClient interface, TauriBackendClient & MockBackendClient
│   └── __tests__/         # Vitest + React Testing Library suites
├── src-tauri/             # Rust / Tauri 2 native core
│   ├── src/
│   │   ├── lib.rs          # Tauri builder + IPC commands
│   │   ├── main.rs         # Binary entry
│   │   ├── error.rs        # Structured ApiError envelope
│   │   ├── schema.rs       # SQLite schema & migrations
│   │   ├── project.rs      # Project lifecycle service
│   │   ├── socket.rs       # Socket CRUD & lock invariants
│   │   ├── work.rs         # Work attachment & thumbnail generation
│   │   ├── csv.rs          # CSV streaming importer & parser
│   │   ├── extract.rs      # Document text extraction
│   │   ├── export.rs       # Zip project export & import
│   │   └── repair.rs       # Missing & orphaned asset repair scan
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

Install these prerequisites:

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 20 | <https://nodejs.org> |
| pnpm | >= 9 | `npm install -g pnpm` |
| Rust | stable | <https://rustup.rs> |
| Tauri CLI | 2.x | `cargo install tauri-cli --version "^2" --locked` |
| MSVC Build Tools | 2019+ | Windows only (for Rust/Tauri) |

## How to Run

### Direct CLI (Cross-Platform)

```bash
# 1. Install dependencies
pnpm install
cd src-tauri && cargo fetch && cd ..

# 2. Development mode
pnpm dev             # Vite dev server only (runs against MockBackendClient in browser)
pnpm dev:tauri       # Full desktop app with hot-reload (Tauri + Vite)

# 3. Testing
pnpm test            # Frontend tests (Vitest + React Testing Library)
cd src-tauri && cargo test && cd ..  # Backend tests (47 unit + integration tests)

# 4. Code Quality
pnpm lint            # ESLint
pnpm format:check    # Prettier formatting check
cd src-tauri && cargo clippy --all-targets -- -D warnings && cd ..

# 5. Build
pnpm build                            # Frontend bundle (tsc + Vite)
cd src-tauri && cargo build --release # Backend binary
pnpm tauri build                      # Packaged desktop application installer
```

### Make (Unix / Git Bash / MSYS2)

```bash
make install         # Frontend + backend crate installation
make dev             # Browser dev mode with MockBackendClient
make dev-tauri       # Full desktop app with hot-reload
make test            # Run both frontend and backend test suites
make test-frontend   # Vitest unit tests
make test-backend    # Cargo test suite
make lint            # ESLint + Clippy
make format          # Prettier + cargo fmt
make build           # Frontend build + Cargo release build
make check           # Full CI check (install + lint + format-check + test + build)
```

## Status & Test Coverage

- **Frontend**: 33 unit and component tests passing via Vitest (`src/__tests__/`).
- **Backend**: 47 integration and unit tests passing via Cargo (`src-tauri/src/lib.rs`).
- **Architecture**: M1–M6 core features implemented (Project/Socket services, Work attachment, Content-addressed storage, WebP preview generation, CSV batch ingestion, Text extraction, and Structured error envelopes).
