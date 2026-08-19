# BUILD_PLAN.md — Tarot Socket Board: Project Inventory & Ground Truth

_Generated: 2026-08-09 from workspace `H:\tarot\.worktrees\t_564f93c7`_

---

## 1. Project Summary

The **Tarot Socket Board** is a local-first, single-user Windows/Linux desktop application built with **Tauri 2 (Rust) + React/TypeScript/Vite + SQLite**. It helps a visual artist manage a large multi-deliverable creative project (e.g. a 70+ card tarot deck) through a grid of ordered "sockets." Each socket represents one deliverable slot and can hold multiple candidate works (images/documents), metadata, notes, and a lock. The artist drags files in, compares candidates, picks a winner, and sees overall project progress at a glance. Data lives in a portable `.tarot/` project folder containing a SQLite database, managed asset files, and generated thumbnails. There is no server, no cloud, and no multi-user support.

---

## 2. Source Documents Inventory

| # | File Path | Purpose | Key Contributions |
|---|-----------|---------|-------------------|
| 1 | `IDEA.md` (repo root: `H:\tarot\IDEA.md`) | Original project idea / pitch | Problem statement: artists need a visual socket grid for managing large deliverable sets. Defines core features (drag-and-drop, file picker, CSV import, document reading, lock protection) and dream features (ComfyUI integration, LLM/MCP tools). Context: author is creating a 70+ card tarot deck. |
| 2 | `REQUIREMENTS.md` (`H:\tarot\.worktrees\t_4e9d0c8b\REQUIREMENTS.md`) | Formal requirements & acceptance criteria | 8 user stories (US-1 through US-8), 19 functional requirements (FR-1 through FR-19) prioritized as MUST/SHOULD/COULD, 6 non-functional requirements, out-of-scope declarations, and 12 open questions with recommended defaults. |
| 3 | `REQUIREMENTS.md` (annotated) (`H:\tarot\.worktrees\t_1b0190fd\REQUIREMENTS.md`) | Same as #2 with requester's answers to open questions | User decisions appended to each question (see §6 below). This is the authoritative version of requirements. |
| 4 | `ARCHITECTURE.md` (`H:\tarot\.worktrees\t_3fca3dd3\ARCHITECTURE.md`) | Technical architecture & feasibility analysis | Component architecture (UI → Tauri bridge → Rust services → SQLite + filesystem), recommended stack, full API/command surface (22 typed Tauri commands), complete data model (6 tables), 5 feasibility risks with mitigations, and 8-step suggested build order. |
| 5 | `BUILD-PLAN.md` (`H:\tarot\.worktrees\t_054f16da\BUILD-PLAN.md`) | Consolidated phased build plan | Executive summary, 8 milestones (M1–M8), 30 discrete tickets (T-01 through T-30), dependency graph, first-slice definition (14 tickets), 5 contradiction resolutions, 6 blocking questions, and full requirements-to-ticket traceability matrix. |

---

## 3. Component Inventory

### Backend (Rust / Tauri)
- **Tauri 2 shell** — Desktop window management, native file dialogs, drag-and-drop, IPC command bridge
- **Project service** — `create_project`, `get_project`, `update_project`; manages `.tarot/` directory lifecycle
- **Socket service** — CRUD for sockets: create, update, archive, lock/unlock, reorder; lock enforcement invariants
- **Work service** — `attach_work` (copy file + create DB row), `get_work`, `update_work`, `remove_work`; file-hash (SHA-256) deduplication
- **CSV import service** — Streaming CSV parser with header detection, column mapping, row-level validation, append/update modes, lock-aware
- **Document text extraction** — Trait-based extractors for .txt, .md, .csv, .json, .pdf, .docx
- **Thumbnail/preview service** — Background `.webp` thumbnail generation from images; state machine (pending → ready/failed)
- **Background job infrastructure** — Generic job runner with queue, progress callbacks, warning collection, cancel support
- **Structured error envelope** — `{code, message, details}` via `thiserror`; maps to all error codes in ARCHITECTURE.md §4
- **SQLite schema & migrations** — 6 tables: projects, sockets, works, previews, extracted_text, import_jobs; rusqlite with up/down migrations
- **Project export/import** — Zip `.tarot/` bundle for portability; re-import validates manifest
- **Missing-asset repair** — Diagnostic scan for orphaned files and dangling DB references

### Frontend (React / TypeScript / Vite)
- **App shell & routing** — Project selector/creator, grid view, socket detail panel
- **Socket grid component** — CSS grid with 1–4 column density (user-selectable), vertical scrolling, empty vs filled visual state
- **Socket card component** — Title (editable), notes (editable), metadata preview, lock icon, empty/filled indicator, thumbnail display
- **Metadata editor** — Fixed-schema key/value editor for socket metadata
- **File picker & drag-and-drop** — Native file-explorer dialog + HTML5 drag-and-drop handler; multi-file drop
- **Comparison view** — Side-by-side display of all works in a socket for candidate evaluation
- **Winner selection & lock UI** — Winner badge, lock toggle with confirmation, locked-state visual feedback
- **CSV import UI** — File picker → preview table → column mapping → confirm → progress bar → summary report
- **Extracted text display** — Collapsible section in socket detail panel showing document text
- **Accessibility & keyboard nav** — ARIA labels, full keyboard grid traversal, focus indicators

### Data (SQLite + Filesystem)
- **Project directory structure:** `<project>.tarot/` containing `project.sqlite`, `assets/<hash>.<ext>`, `previews/<work-id>.webp`, `manifest.json`
- **6 database tables:** projects, sockets, works, previews, extracted_text, import_jobs (full schema in ARCHITECTURE.md §5)
- **Persistence model:** SQLite WAL mode, auto-commit on every mutation, no manual save button
- **Asset lifecycle:** Content-hash naming (SHA-256), garbage collection of unreferenced files, missing-asset diagnostics

### Infrastructure
- **No server/cloud** — Fully local, offline-capable
- **No auth** — Single local user
- **Target platforms:** Windows + Linux (Tauri's native portability)
- **Testing:** Vitest/React Testing Library (frontend), Rust unit/integration tests (backend), integration test suite (T-28)

### AI / Optional (Deferred)
- **ComfyUI integration (COULD/scrapped)** — User decision: "this can be scrapped." Not in scope.
- **LLM/MCP tool surface (COULD/scrapped)** — User decision: "this can also be scrapped." Not in scope.

---

## 4. Dependency-Ordered Build Sequence

### Phase 1: Foundation (M1) — No dependencies
1. **T-01** — Tauri 2 + React/Vite scaffold (app boots, hot reload works)
2. **T-02** — SQLite schema & migrations (6 tables, up/down migrations)
3. **T-03** — Rust error envelope (structured `{code, message, details}`)

### Phase 2: Core Services (M1) — Depends on Phase 1
4. **T-04** — Project service (create/get/update project, `.tarot/` directory)
5. **T-05** — Socket service (CRUD, lock, reorder, archive)

### Phase 3: IPC Bridge (M1) — Depends on Phase 2
6. **T-06** — Tauri IPC: project commands
7. **T-07** — Tauri IPC: socket commands

### Phase 4: UI Shell + Grid (M2) — Depends on Phase 3
8. **T-08** — React app shell & routing
9. **T-09** — Socket grid component (1–4 columns, scrolling)
10. **T-10** — Socket card component (title/notes edit, metadata, lock icon)
11. **T-11** — Metadata editor (fixed schema)

### Phase 5: Image Workflow (M3) — Depends on Phase 4
12. **T-12** — Work service (attach/remove, file-hash dedup)
13. **T-13** — File picker & drag-and-drop
14. **T-14** — Thumbnail generation & preview service

### Phase 6: Socket Semantics (M4) — Depends on Phase 5
15. **T-15** — Comparison view (multi-work side-by-side)
16. **T-16** — Winner selection & socket lock UI
17. **T-22** — Socket add/remove after creation

### Phase 7: Bulk & Documents (M5) — Depends on Phase 2+
18. **T-21** — Background job infrastructure
19. **T-17** — CSV import service
20. **T-18** — CSV import UI
21. **T-19** — Document text extraction
22. **T-20** — Extracted text display

### Phase 8: Reliability & Polish (M6) — Depends on Phase 6+
23. **T-23** — Project export & re-import
24. **T-24** — Missing-asset repair
25. **T-25** — Crash-safe auto-save & migrations
26. **T-26** — Accessibility & keyboard nav
27. **T-27** — Performance tuning (100+ sockets)
28. **T-28** — Integration test suite

### Parallelism Opportunities
- T-01, T-02, T-03 can all start immediately
- T-04 and T-05 can run in parallel once T-02+T-03 land
- T-06 and T-07 can run in parallel once their services are ready
- T-12 (work service) can start in parallel with frontend T-08/T-09
- T-14, T-17, T-19 can run in parallel once T-21 (job infra) is ready
- T-13, T-11, T-22 can run in parallel once T-10 is stable

---

## 5. Open Questions / Missing Info

### Resolved by User (from annotated REQUIREMENTS.md in t_1b0190fd)
| # | Question | User's Answer | Impact |
|---|----------|---------------|--------|
| Q-1 | Socket count mutability | **Fixed** at creation | No add/remove UI needed; simplifies M4. FR-16 demoted. |
| Q-2 | Grid row/column cap | **4 columns** sufficient | Update grid component spec from 1–5 to 1–4. |
| Q-3 | Metadata schema | **Fixed schema** (not free-form K/V) | Need to define the exact schema fields; currently unspecified. |
| Q-4 | Winning piece semantics | **Hide non-selected images** | Not just a flag — non-winners are hidden from default view. Affects UI and data model. |
| Q-5 | CSV column mapping | Default (header = field names) is fine | No change needed. |
| Q-6 | Document format support | .pdf, .txt, .docx, .md | Aligns with architecture's v1 whitelist. |
| Q-7 | Persistence format | Folder-based `.tarot/` bundle | Confirmed. |
| Q-8 | Target OS | **Windows + Linux** | Cross-platform from v1 (not Windows-only as BUILD-PLAN.md assumed). |
| Q-9 | ComfyUI integration | **Scrapped** | Remove M7 and T-29 from plan. |
| Q-10 | LLM/MCP tool scope | **Scrapped** | Remove M8 and T-30 from plan. |
| Q-11 | Comparison UI | **Not necessary** (dedicated view) | Simplify — just show thumbnails in card, no modal/lightbox. T-15 scope reduced. |
| Q-12 | Scale ceiling | **~100 sockets max** | Virtualization (T-27) can be deferred or simplified. |

### Remaining Gaps / Contradictions
1. **Fixed metadata schema is undefined.** User chose "fixed schema" but no fields were specified. Need the exact key names (e.g. Artist, Medium, Status, Tags?) before implementing T-11.
2. **Grid interpretation mismatch.** REQUIREMENTS.md says "rows"; ARCHITECTURE.md says "columns." User answered "4" but didn't clarify axis. The architecture's column interpretation (horizontal grid, vertical scroll) is the standard desktop pattern and should be adopted.
3. **"Hide non-selected" needs UI spec.** Does hiding mean: (a) collapsed behind an expand arrow, (b) moved to a separate "candidates" tab, or (c) visually dimmed? The architecture's `selected_work_id` model supports any of these but the UI behavior needs a decision.
4. **No code exists yet.** The entire repo is greenfield — only documentation files exist across worktrees. The master branch has only IDEA.md. All planning documents live in unmerged worktree branches.
5. **Documents are scattered across 5 worktrees** and not consolidated in the main branch. A fresh engineer would need to check multiple worktree directories to find the full picture.
6. **ARCHITECTURE.md §7 build order assumes Windows-only.** User wants Windows + Linux, which may affect Tauri config and CI setup but is naturally supported by Tauri 2.
7. **T-22 (add/remove sockets) contradicts user's "fixed" answer.** The BUILD-PLAN.md promotes FR-16 to MUST and schedules T-22 in M4, but the user said socket count is fixed. T-22 should be removed or demoted to COULD.

---

## Appendix: What a Fresh Engineer Needs to Know

**To start building any component:**
1. Read ARCHITECTURE.md (§2–§5) for the component architecture, API surface, and data model.
2. Read REQUIREMENTS.md (annotated version in t_1b0190fd) for the authoritative acceptance criteria and user decisions.
3. Read BUILD-PLAN.md for ticket dependencies and milestone sequencing.
4. Start with T-01 (scaffold), T-02 (schema), or T-03 (errors) — they have no dependencies and can run in parallel.
5. The first end-to-end proof is T-01 through T-14: create project → grid renders → drag image → edit card → persist → restart.

**Key tech decisions:**
- Tauri 2 + Rust backend + React/TypeScript/Vite frontend
- SQLite with rusqlite, WAL mode, auto-commit
- Managed filesystem assets with SHA-256 content hashing
- Structured error envelope via thiserror
- Background jobs for thumbnails, CSV import, text extraction
- No ComfyUI, no MCP, no cloud, no multi-user
