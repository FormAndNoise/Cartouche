<div align="center">

<img src="brand/cartouche_social_preview.png" alt="Cartouche Social Preview Banner" width="100%" />

# Cartouche

### *Local workspace to stage, audition, and lock artwork into ordered deliverable grids.*

[![Form & Noise Atelier](https://img.shields.io/badge/Form%20%26%20Noise-Atelier-D45500?style=flat-square)](https://github.com/FormAndNoise)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.x-3F6E8C?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-2021%20Edition-black?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)

</div>

---

## Overview

**Cartouche** is a local-first desktop application engineered for visual artists, art directors, and printmakers managing multi-deliverable series—including **tarot decks, trading card games (TCGs), oracle cards, storyboard frames, and limited print suites**.

Managing large-scale card projects usually deteriorates into chaotic directory trees, fragmented spreadsheets, and lost artwork versions. Cartouche introduces a disciplined, tactile workspace: you define your target grid of deliverable sockets, audition multiple candidate artwork pieces per card, and lock winning illustrations into place.

<div align="center">
  <img src="brand/cartouche_lockup_dark.png" alt="Cartouche Lockup Banner" width="80%" />
</div>

---

## Key Features

- 🗃️ **Fixed-Socket Grid Canvas**: Establish immutable deliverable slots (e.g., 78 tarot cards, 64-card expansion sets) upon project creation. Filter by socket status, completion percentage, and tags.
- 🎭 **Variation Auditioning**: Drop multiple artwork candidates, sketches, and color variants into a single socket. Compare variations side-by-side inside the inspection panel.
- 🔒 **Locking Policy**: Select a winning artwork variation to lock the socket. Non-winning variations remain archived and retrievable in the socket detail panel.
- 📋 **Batch CSV Import**: Ingest complete deck lists, card titles, arcana classifications, and descriptive metadata in a single automated pass with background job tracking.
- ⚡ **Local-First & Portable**: Every project is encapsulated in a self-contained `.tarot/` folder containing an embedded WAL-mode SQLite database (`project.sqlite`), content-addressed assets (`assets/<sha256>.<ext>`), and optimized WebP previews.
- 🔌 **Zero Cloud Dependency**: Runs 100% offline on your machine with strict local filesystem persistence and no external telemetry or cloud locks.

---

## Architecture & Data Flow

Cartouche is built on a clean separation between the user interface and native system services via a unified `BackendClient` contract:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend (Vite)                        │
│             Space Grotesk (Display) • Inter (UI) • IBM Plex            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ BackendClient Interface Contract
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────┐                   ┌────────────────────────┐
│     TauriBackendClient    │ (Production)      │    MockBackendClient   │ (Tests / Dev)
│  tauri::invoke() IPC      │                   │  In-Memory Fast State  │
└─────────────┬─────────────┘                   └────────────────────────┘
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Rust Native Core (Tauri 2)                       │
│      Project Manager • Socket Service • Asset Ingester • Image Sizer   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Portable .tarot Project Store                      │
│   ├── project.sqlite (6 Tables, WAL mode, Foreign Keys)                │
│   ├── assets/ (<sha256>.<ext> Content-Addressed Store)                 │
│   ├── previews/ (<work-id>.webp Cached Previews)                       │
│   └── manifest.json                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- **Node.js**: `>= 20.x` (<https://nodejs.org>)
- **pnpm**: `>= 9.x` (`npm install -g pnpm`)
- **Rust**: Stable toolchain (`1.77+`, <https://rustup.rs>)
- **Tauri CLI 2.x**: `cargo install tauri-cli --version "^2" --locked`
- **C++ Build Tools**: MSVC Build Tools 2019+ (Windows) or GCC / build-essential (Linux)

### Repository Structure

Cartouche uses a git worktree monorepo layout. The primary development tree containing the full frontend, backend, configuration, and test suites is located in `.worktrees/t_99bad544_new/`.

```bash
# Clone the repository and enter the primary worktree
git clone https://github.com/FormAndNoise/cartouche.git
cd cartouche/.worktrees/t_99bad544_new
```

### Installation & Development (Direct CLI)

These commands work directly across all shells (PowerShell, Command Prompt, bash, zsh):

```bash
# 1. Install dependencies
pnpm install
cd src-tauri && cargo fetch && cd ..

# 2. Run development mode
pnpm dev             # Vite dev server (runs against MockBackendClient in browser)
pnpm dev:tauri       # Full desktop application with hot-reload (Tauri + Vite)
```

### Testing & Quality Assurance (Direct CLI)

```bash
# Frontend test suite (Vitest + React Testing Library)
pnpm test

# Backend test suite (Cargo integration and unit tests)
cd src-tauri && cargo test && cd ..

# Lint and format checks
pnpm lint
pnpm format:check
cd src-tauri && cargo clippy --all-targets -- -D warnings && cd ..

# Production builds
pnpm build                               # Frontend bundle
cd src-tauri && cargo build --release    # Native release binary
pnpm tauri build                         # Packaged desktop installer/app
```

### Convenience Makefile (Unix / Git Bash / MSYS2)

A `Makefile` is available at both repository root and inside the worktree:

```bash
make install         # Install frontend (pnpm) + fetch backend crates
make dev             # Vite dev server only (frontend + mock backend)
make dev-tauri       # Full Tauri desktop app with hot reload
make test            # Run all frontend and backend tests
make test-frontend   # Vitest run
make test-backend    # Cargo test run
make lint            # ESLint + cargo clippy
make format          # Prettier + cargo fmt
make build           # Frontend build + cargo release build
make check           # Full CI check (install + lint + format-check + test + build)
```

---

## Data Model

The project database enforces 6 normalized SQLite tables:

| Table | Purpose |
|---|---|
| `projects` | Root project record, socket count, deliverable dimensions, and created timestamps. |
| `sockets` | Individual deliverable slots, ordered indices (`0..N-1`), statuses, medium, and due dates. |
| `works` | Auditioned artwork pieces attached to a socket, file paths, checksums, and winner flags. |
| `previews` | Generated WebP thumbnail references and dimensions. |
| `extracted_text` | OCR / extracted metadata and prompt notes associated with works. |
| `import_jobs` | Progress, error envelopes, and status logs for batch CSV imports. |

---

## Brand Standards

Cartouche is an endorsed tool in the **Form & Noise Atelier** portfolio suite.

- **Accent**: Slate-Blue (`#3F6E8C` / Dark: `#6FA0BE`)
- **House Metal**: `#D45500`
- **Ground**: Paper (`#F6F1EA`) and Void (`#0B0B0B`)
- **Typography**: Space Grotesk (Display), Inter (Interface), IBM Plex Mono (Code)
- **Symbol**: 24×24u, 1.75u stroke, $3\times 2$ card grid with 1 solid locked state pip.

See [`brand/BRAND.md`](brand/BRAND.md) for full identity tokens, vector exports, and usage guidelines.

---

## Atelier Family

Cartouche operates alongside the Form & Noise portfolio tools:

- 🗃️ **Cartouche** — Local workspace to stage, audition, and lock artwork into ordered deliverable grids.
- 📐 **Pantograph** — Raster in, clean vectors out. Batch line tracing with zero external dependencies.
- 🧭 **Gimbal** — Navigate latent space with precision flight instruments, not lottery prompts.
- 📖 **Colophon** — Manuscript in, typeset book out. Automated literary editing, art direction, and layout composition.
- 🪡 **Quire** — Imposes multi-page PDFs into duplexed, sequence-ordered signatures for physical bookbinding.
- ⚓ **Dredge** — Extracts raw elementary video and audio streams from unfinalized MP4/MOV recordings.

---

## License

MIT License. Copyright &copy; 2026 Form & Noise Atelier.
