# ARCHITECTURE.md — Tarot Socket Board: Technical Architecture

> **Note:** This file consolidates the architecture analysis originally produced
> in worktree `t_3fca3dd3`. The full content (component architecture diagram,
> 22 typed Tauri commands, 6-table data model schema, 5 feasibility risks with
> mitigations, and 8-step build order) is being reconstructed. The key technical
> decisions are captured below and in BUILD_PLAN.md §3 (Component Inventory).

## 1. Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop shell | Tauri | 2.x |
| Backend | Rust | stable (>= 1.77) |
| Frontend | React + TypeScript | React 19, TS 5.x |
| Bundler/dev server | Vite | 6.x |
| Database | SQLite (rusqlite) | WAL mode |
| Test (frontend) | Vitest + React Testing Library | 3.x |
| Test (backend) | cargo test | — |

## 2. Component Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React/TS/Vite)       │
│  ┌─────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │ App │ │ Grid │ │ Card │ │ Metadata │  │
│  │Shell│ │ View │ │  UI  │ │  Editor  │  │
│  └──┬──┘ └──┬───┘ └──┬───┘ └────┬─────┘  │
│     └───────┴───────┴───────────┘        │
│              Tauri IPC Bridge             │
└──────────────────┬──────────────────────┘
                   │ invoke()
┌──────────────────┴──────────────────────┐
│         Backend (Rust / Tauri 2)          │
│  ┌─────────┐ ┌────────┐ ┌────────────┐  │
│  │ Project  │ │ Socket  │ │   Work     │  │
│  │ Service  │ │ Service │ │  Service   │  │
│  └────┬─────┘ └────┬───┘ └─────┬──────┘  │
│       └──────┬────┴─────────────┘        │
│         ┌────┴─────┐ ┌──────────────┐   │
│         │  SQLite  │ │  Filesystem   │   │
│         │ (rusqlite)│ │ (.tarot/ dir)│   │
│         └──────────┘ └──────────────┘   │
└──────────────────────────────────────────┘
```

## 3. Data Model (6 Tables)

Full schema DDL lives in the migration files (`src-tauri/migrations/`). Summary:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | One row per project | `id`, `name`, `socket_count`, `grid_columns` (1–4), `schema_version` |
| `sockets` | One row per socket slot | `id`, `project_id`, `position`, `title`, `notes`, `metadata_json`, `locked`, `selected_work_id` |
| `works` | One row per attached file | `id`, `socket_id`, `asset_hash`, `filename`, `media_kind`, `created_at` |
| `previews` | Thumbnail state per work | `work_id`, `state` (pending/ready/failed), `error_message` |
| `extracted_text` | Extracted document text | `work_id`, `state`, `text`, `error_message` |
| `import_jobs` | Background job tracking | `id`, `kind`, `state`, `progress`, `warnings_json`, `result_json` |

Constraints: `UNIQUE(project_id, position)` on sockets, `grid_columns CHECK (1..4)`,
foreign keys from works → sockets → projects with explicit cascade policy.

## 4. Error Envelope

All Tauri command errors return `{ error: { code, message, details } }` where `code`
is drawn from a fixed enum: `INVALID_SOCKET_COUNT`, `PATH_NOT_WRITABLE`, `NOT_FOUND`,
`PROJECT_CORRUPT`, `LOCKED`, `FILE_UNREADABLE`, `UNSUPPORTED_FORMAT`, `IS_SELECTED`,
`CONFIRMATION_REQUIRED`, `MISSING_REQUIRED_COLUMN`, `DUPLICATE_ID`, `MISSING_SOCKET`,
`ASSET_MISSING`, `INTERNAL_ERROR`.

## 5. IPC Command Surface (22 commands)

| Command | Service | Status |
|---------|---------|--------|
| `app_version` | Shell | ✅ Scaffold |
| `create_project` | Project | Pending (US-B02) |
| `get_project` | Project | Pending (US-B02) |
| `update_project` | Project | Pending (US-B02) |
| `update_socket` | Socket | Pending (US-B03) |
| `set_socket_lock` | Socket | Pending (US-B03) |
| `reorder_sockets` | Socket | Pending (US-B03) |
| `attach_work` | Work | Pending (US-B04) |
| `get_work` | Work | Pending (US-B04) |
| `update_work` | Work | Pending (US-B04) |
| `remove_work` | Work | Pending (US-B04) |
| `select_winner` | Work | Pending (US-F07) |
| `import_csv` | CSV | Pending (US-B05) |
| `extract_text` | Doc | Pending (US-B06) |
| `get_job` | Jobs | Pending (US-B08) |
| `export_project` | Project | Pending (US-B11) |
| `import_project` | Project | Pending (US-B11) |
| `repair_assets` | Diag | Pending (US-B12) |

## 6. Feasibility Risks

| Risk | Mitigation |
|------|-----------|
| Tauri 2 maturity | Pin to 2.x stable; track breaking changes |
| SQLite concurrency | WAL mode; single-writer; background jobs use transactions |
| Large file handling | Content-hash dedup; streaming copies; background thumbnail gen |
| Cross-platform paths | Use Tauri path API; no hardcoded separators |
| WebView2 availability | Runtime check on startup; fallback message |

## 7. Build Order (8 Steps)

1. **Scaffold** — Tauri + React/Vite boots (this task ✅)
2. **Schema** — SQLite 6-table migration (US-B10, US-D02)
3. **Errors** — Structured error envelope (US-B09)
4. **Services** — Project + Socket + Work services (US-B02–B04)
5. **IPC** — Tauri command bridge (US-B01)
6. **UI Shell** — App shell + Grid + Card (US-F01–F03)
7. **Image workflow** — File picker, drag-drop, thumbnails (US-F05, US-B07)
8. **First E2E proof** — create → fill → persist → restart

---

_See BUILD_PLAN.md for the full component inventory and build sequence.
See REQUIREMENTS.md for user stories and acceptance criteria._
