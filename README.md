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
- 🔮 **Planning Scratchpad & Counterpart Matrix**: Organize cross-dimensional categories (Major/Minor arcana, Suits, Elements, Factions) in synchronized grid matrices.
- ⚡ **Local-First & Portable**: Every project is encapsulated in a self-contained `.tarot/` folder containing an embedded WAL-mode SQLite database (`project.sqlite`), content-addressed assets (`assets/<sha256>.<ext>`), and optimized WebP previews.
- 📦 **One-Click Bundling**: Export and import `.crtch` compressed deck bundles for backup and cross-machine portability.
- 🔌 **Zero Cloud Dependency**: Runs 100% offline on your machine with strict local filesystem persistence and zero external telemetry.

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

## Project Structure

```
.
├── src/                   # React 19 / TypeScript frontend (Vite)
│   ├── App.tsx             # Root application component
│   ├── main.tsx            # Vite entry point
│   ├── components/         # UI components (SocketGrid, SocketCard, DetailPanel, Nameplate, etc.)
│   ├── state/              # BoardProvider and context state store
│   ├── api/                # BackendClient interface, TauriBackendClient & MockBackendClient
│   ├── lib/                # Deck taxonomy, planning matrices, and theme engine
│   └── __tests__/          # Vitest + React Testing Library suites
├── src-tauri/              # Rust / Tauri 2 native core
│   ├── src/
│   │   ├── lib.rs           # Tauri builder + IPC commands
│   │   ├── main.rs          # Binary entry
│   │   ├── error.rs         # Structured ApiError envelope
│   │   ├── db.rs            # SQLite schema & migrations
│   │   ├── project.rs       # Project lifecycle service
│   │   ├── socket.rs        # Socket CRUD & lock invariants
│   │   ├── work.rs          # Work attachment & thumbnail generation
│   │   ├── csv_import.rs    # CSV streaming importer & parser
│   │   ├── extract.rs       # Document text extraction
│   │   ├── export.rs        # Portable .crtch zip deck bundle export & import
│   │   └── repair.rs        # Missing & orphaned asset repair scan
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri configuration (window, bundle, dev server)
│   ├── capabilities/        # Tauri 2 permission capabilities
│   └── icons/               # Multi-resolution desktop icons (ICO, ICNS, PNG)
├── brand/                  # Official Form & Noise Atelier brand guidelines & SVGs
├── package.json            # Frontend deps + build scripts
├── Makefile                # install / build / test / lint / dev
├── BUILD_PLAN.md           # Component inventory + build sequence
├── REQUIREMENTS.md         # User stories + acceptance criteria
└── ARCHITECTURE.md         # Technical architecture + data model
```

---

## Prerequisites

| Tool | Recommended Version | Download Link |
|---|---|---|
| **Node.js** | `>= 20.x` | [nodejs.org](https://nodejs.org) |
| **pnpm** (or npm) | `>= 9.x` | [pnpm.io](https://pnpm.io) |
| **Rust** | Stable (`1.77+`) | [rustup.rs](https://rustup.rs) |
| **Tauri CLI 2.x** | `^2` | `cargo install tauri-cli --version "^2" --locked` (or `npx @tauri-apps/cli`) |
| **C++ Build Tools** | MSVC 2019+ (Windows) / GCC (Linux) | Required for compiling native Rust crates |

---

## Quickstart & Commands

### 1. Install Dependencies
```bash
# Frontend
pnpm install # or: npm install

# Backend Rust crates
cd src-tauri && cargo fetch && cd ..
```

### 2. Development Mode
```bash
# Option A: Full Desktop Application with Hot-Reload (Tauri + Vite)
npm run dev:tauri  # or: make dev-tauri

# Option B: Browser-Only UI Sandbox (runs with in-memory MockBackendClient)
npm run dev        # or: make dev
```

### 3. Run Automated Tests
```bash
# Frontend test suite (Vitest + React Testing Library)
npx vitest run     # or: make test-frontend

# Backend test suite (Rust unit and integration tests)
cd src-tauri && cargo test && cd ..
```

### 4. Build Production Release Binaries & Installers
```bash
# Compile web bundle + native Rust executable + NSIS/MSI installers
npx @tauri-apps/cli build
```
The compiled output will be generated in `src-tauri/target/release/` and `src-tauri/target/release/bundle/`.

---

## Brand Standard

Cartouche is part of the **Form & Noise Atelier** portfolio of creative tools and follows the *Loose Endorsed Family* identity:
- **Symbol**: 24×24u, 1.75u stroke, true Cartouche stadium enclosure with knot seal baseline and `#D45500` House Metal locked state pip.
- **Palette**: Slate-Blue (`#3F6E8C` / `#6FA0BE`), Void Ground (`#0B0B0B`), Paper Ground (`#F6F1EA`), House Metal (`#D45500`).
- **Typography**: Space Grotesk (Display), Inter (UI), IBM Plex Mono (Data & Code).
- **Full Brand Guidelines**: See [**`brand/BRAND.md`**](brand/BRAND.md).

---

## License

MIT © [Form & Noise](https://github.com/FormAndNoise).