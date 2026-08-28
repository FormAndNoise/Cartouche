# REQUIREMENTS.md — Tarot Socket Board: Functional Requirements & Acceptance Criteria

_Derived from BUILD_PLAN.md (component inventory), the annotated REQUIREMENTS.md (user decisions),
and ARCHITECTURE.md (technical contract). This document is the single testable spec for the
current build pass. Where BUILD_PLAN.md flagged an open question or contradiction, it is resolved
below; unresolved items are marked **ASSUMPTION** with the lowest-risk default chosen._

---

## 0. How to read this document

- Every component in BUILD_PLAN.md §3 (Component Inventory) has at least one **user story** with
 **Given/When/Then** acceptance criteria.
- Story IDs: `US-B##` (backend), `US-F##` (frontend), `US-D##` (data), `US-I##` (infra).
- Each AC line is individually testable and numbered `AC-<story>.<n>`.
- `[ASSUMPTION]` marks a default chosen in the absence of a stakeholder decision; `[DECIDED]`
 marks an already-answered open question from the annotated REQUIREMENTS.md.

---

## 1. Scope Boundaries

### 1.1 IN SCOPE for this build pass

- Single-user, local-only, offline-capable desktop app (Windows + Linux) built on Tauri 2 +
 React/TypeScript/Vite + SQLite.
- Fixed-count socket grid created at project creation time (no add/remove-socket UI).
- Drag-and-drop and native file-picker ingestion of images and documents into sockets.
- Multi-work sockets with winner selection that **hides** non-selected works from the default view.
- Fixed-schema metadata editor (schema defined in §5.1 below).
- CSV bulk import (create/update sockets) with a post-import summary report.
- Text extraction and inline display for .txt, .md, .pdf, .docx, .csv, .json.
- Per-socket lock toggle blocking destructive operations, enforced transactionally and across
 bulk operations (CSV re-import, project-level clear/delete).
- Local SQLite persistence in a portable `.tarot/` project folder; auto-commit, no manual save.
- Project export/import (zip bundle) and a missing-asset repair/diagnostic scan.
- Background job infrastructure for thumbnails, CSV import, and text extraction.
- Accessibility: ARIA labeling and full keyboard grid navigation.
- Automated tests: Rust unit/integration tests (backend), Vitest/RTL (frontend), one
 cross-stack integration suite.

### 1.2 OUT OF SCOPE / DEFERRED

- **ComfyUI integration** — explicitly scrapped by stakeholder decision (BUILD_PLAN.md §5, Q-9).
 No code, no API surface, no placeholder UI.
- **LLM/MCP tool surface** — explicitly scrapped by stakeholder decision (Q-10). No code.
- **Add/remove sockets after project creation** — socket count is fixed at creation (Q-1); no
 UI or backend command for this. T-22 in BUILD_PLAN.md is **removed from scope**, not merely
 demoted (see §6.7).
- Multi-user accounts, authentication, roles/permissions, or any login flow.
- Real-time collaboration or concurrent multi-user editing.
- Cloud sync, hosted/server-side storage, mobile or web client builds.
- In-app image editing or generation (the app organizes/displays works; it does not create them).
- Version history / undo-redo across sessions (the lock toggle is the only protection mechanism).
- OCR or document parsing beyond straightforward text extraction of the whitelisted formats.
- A dedicated modal/lightbox comparison view — **decided against** (Q-11); comparison is via
 thumbnails inside the socket card only.
- Grid row-density options beyond 1–4 columns — **decided down** from the original 1–5 proposal
 (Q-2).
- Payment, licensing, or multi-project marketplace features.

---

## 2. Backend (Rust / Tauri) — User Stories & Acceptance Criteria

### US-B01: Tauri shell and IPC bridge
As a desktop app user, I want the application to open as a native window with working file
dialogs and drag-and-drop, so that I can interact with my project without a browser or server.

- AC-B01.1: GIVEN the packaged app binary WHEN launched on Windows or Linux THEN a native window
 opens within 3 seconds showing the project selector/creator screen.
- AC-B01.2: GIVEN the app is open WHEN the user invokes the native file-open dialog from any
 UI action THEN the OS-native picker appears and returns a real filesystem path to the frontend.
- AC-B01.3: GIVEN the app is open WHEN a file is dragged from the OS over the window THEN the
 Tauri drag-and-drop event fires and is receivable by the frontend before drop.

### US-B02: Project service
As an artist, I want to create and load a project with a fixed number of sockets, so that I have
one visual slot per deliverable from the start.

- AC-B02.1: GIVEN valid `{name, socket_count, project_path}` WHEN `create_project` is invoked
 THEN a `.tarot/` directory is created at `project_path`, a SQLite DB is initialized with
 `socket_count` sockets in position order, and the response returns the project plus all sockets.
- AC-B02.2: GIVEN `socket_count <= 0` or `project_path` unwritable WHEN `create_project` is
 invoked THEN it returns `INVALID_SOCKET_COUNT` or `PATH_NOT_WRITABLE` respectively, and no
 partial directory/DB is left on disk.
- AC-B02.3: GIVEN an existing `.tarot/` project WHEN `get_project` is invoked THEN it returns the
 project summary and ordered sockets, or `NOT_FOUND`/`PROJECT_CORRUPT` if the bundle is missing
 or unreadable.
- AC-B02.4: GIVEN an open project WHEN `update_project` changes `name` or `grid_columns` THEN the
 change persists immediately (auto-commit) and is present after app restart.

### US-B03: Socket service (fixed-count CRUD, lock, reorder)
As an artist, I want each socket to support editing, locking, and reordering without changing the
total socket count, so that I can organize my board safely.

- AC-B03.1: GIVEN an unlocked socket WHEN `update_socket` sets `title`, `notes`, or `metadata`
 THEN the change is persisted and returned in the response.
- AC-B03.2: GIVEN a locked socket WHEN `update_socket` targets a field forbidden by lock policy
 (per §6.3 decision) THEN the command returns `LOCKED` and no field changes.
- AC-B03.3: GIVEN any socket WHEN `set_socket_lock({locked: true})` is invoked THEN subsequent
 `archive_socket` and `remove_work` calls against that socket return `LOCKED` until unlocked.
- AC-B03.4: GIVEN a set of socket IDs covering the full current project WHEN `reorder_sockets` is
 invoked THEN sockets are re-positioned atomically; a partial or duplicate ID list returns
 `DUPLICATE_ID` or `MISSING_SOCKET` with no partial reorder applied.
- AC-B03.5 [ASSUMPTION]: There is **no** `create_socket` or `archive_socket`(as socket-count
 reduction) command exposed to the UI in this build pass, since socket count is fixed (Q-1).
 `archive_socket` remains available only as the mechanism CSV/administrative cleanup could use
 internally; it is not wired to any user-facing "delete socket" action.

### US-B04: Work service (attach/update/remove, dedup)
As an artist, I want to attach one or more candidate files to a socket and have exact duplicates
detected, so that my project storage stays clean and each attach is reliable.

- AC-B04.1: GIVEN an unlocked socket and a readable source file WHEN `attach_work` is invoked
 THEN the file is copied into `assets/<sha256>.<ext>`, a `works` row is created referencing it,
 and the response includes the work plus its preview job state (`pending`).
- AC-B04.2: GIVEN a source file whose SHA-256 already exists as an asset in the project WHEN
 `attach_work` is invoked THEN the existing asset file is reused (no duplicate copy) and a new
 `works` row still records the attach event for that socket.
- AC-B04.3: GIVEN an unreadable or unsupported file WHEN `attach_work` is invoked THEN it returns
 `FILE_UNREADABLE` or `UNSUPPORTED_FORMAT` and no `works` row is created.
- AC-B04.4: GIVEN a locked socket WHEN `attach_work` or `remove_work` is invoked THEN it returns
 `LOCKED` and no mutation occurs.
- AC-B04.5: GIVEN a work that is the socket's current `selected_work_id` WHEN `remove_work` is
 invoked without `force: true` THEN it returns `IS_SELECTED`/`CONFIRMATION_REQUIRED` rather than
 silently removing the winner.

### US-B05: CSV import service
As an artist, I want to bulk-populate socket titles/metadata from a CSV file, so that I don't have
to hand-enter dozens of sockets.

- AC-B05.1: GIVEN a well-formed CSV with a header row matching expected field names WHEN
 `import_csv` is invoked with `mode: "append"` or `"update"` THEN a background job is created,
 each data row updates/creates the corresponding socket by row order, and the response returns
 `{job_id, rows_total}` immediately (non-blocking).
- AC-B05.2: GIVEN a CSV missing a required column WHEN `import_csv` is invoked THEN it returns
 `MISSING_REQUIRED_COLUMN` before any row is processed.
- AC-B05.3: GIVEN a row that fails validation (e.g. bad metadata value) WHEN the import job runs
 THEN that row is skipped, recorded in the job's `warnings_json`, and processing continues with
 the remaining rows (no full-job abort on a single bad row).
- AC-B05.4: GIVEN a CSV import targeting a locked socket WHEN the import job reaches that row
 THEN the row is skipped with a `LOCKED` warning and the socket is left unmodified.
- AC-B05.5: GIVEN an import job has finished WHEN `get_job` is polled THEN it returns
 `{state: "done", progress: 100, warnings[], result}` summarizing rows processed vs. skipped.

### US-B06: Document text extraction
As an artist, I want text automatically pulled out of documents I attach, so that I can read
reference content without leaving the app.

- AC-B06.1: GIVEN a work with `media_kind` in {txt, md, csv, json, pdf, docx} WHEN
 `extract_text` is invoked (or auto-triggered on attach) THEN a background job extracts the text
 and stores it in `extracted_text` with `state: "ready"`.
- AC-B06.2: GIVEN a work whose format is not in the whitelist WHEN `extract_text` is invoked
 THEN it returns `UNSUPPORTED_FORMAT` and the work still displays as an attachment without
 inline text (per Q-6, whitelist = pdf, txt, docx, md; csv/json included as they double as
 import format and are trivially parseable as text `[ASSUMPTION]`).
- AC-B06.3: GIVEN extraction throws (corrupt file, password-protected PDF, etc.) WHEN the job
 runs THEN `extracted_text.state` becomes `"failed"` with an error message, and the UI shows a
 failure indicator rather than blocking the socket.

### US-B07: Thumbnail/preview service
As an artist, I want image thumbnails generated automatically, so that socket cards load fast and
show a visual preview without opening the original file.

- AC-B07.1: GIVEN an attached image work WHEN the preview job runs THEN a `.webp` thumbnail is
 written to `previews/<work-id>.webp`, and `previews.state` transitions `pending` → `ready`.
- AC-B07.2: GIVEN thumbnail generation fails (corrupt image) WHEN the job runs THEN
 `previews.state` becomes `failed` with `error_message` set, and the UI falls back to a generic
 file-type icon.
- AC-B07.3: GIVEN a non-image work (pdf/docx/etc.) WHEN attached THEN no thumbnail job is queued;
 the UI shows a document-type icon instead.

### US-B08: Background job infrastructure
As a developer/user, I want long-running operations (import, extraction, previews) to run without
freezing the UI, so that the app stays responsive on large projects.

- AC-B08.1: GIVEN any of CSV import, text extraction, or thumbnail generation is triggered WHEN
 the operation starts THEN it runs on a background worker and the UI thread/IPC call returns
 immediately with a job ID.
- AC-B08.2: GIVEN a running job WHEN `get_job` is polled THEN it reflects live `progress` (0–100)
 and any `warnings` accumulated so far.
- AC-B08.3: GIVEN multiple jobs are queued concurrently WHEN they execute THEN jobs do not
 corrupt each other's DB writes (each job's SQLite writes are transactional).

### US-B09: Structured error envelope
As a frontend developer, I want every backend error in a consistent shape, so that the UI can
render meaningful messages without special-casing each command.

- AC-B09.1: GIVEN any Tauri command fails for any reason WHEN the error is returned to the
 frontend THEN it matches `{error: {code, message, details}}` with `code` drawn from the fixed
 set documented in ARCHITECTURE.md §4.
- AC-B09.2: GIVEN an unexpected/unhandled Rust panic path is reachable WHEN it occurs THEN it is
 caught and converted to a structured `INTERNAL_ERROR` envelope rather than crashing the app or
 leaking a raw Rust panic message to the UI.

### US-B10: SQLite schema & migrations
As a developer, I want a versioned schema with up/down migrations, so that the app can evolve the
DB shape safely across releases without corrupting existing projects.

- AC-B10.1: GIVEN a freshly created project WHEN the DB is initialized THEN all 6 tables
 (`projects, sockets, works, previews, extracted_text, import_jobs`) exist matching
 ARCHITECTURE.md §5, and `projects.schema_version` is set to the current version.
- AC-B10.2: GIVEN a project created under an older schema version WHEN opened by a newer app
 build THEN pending migrations run automatically and idempotently before any other command
 executes against that project.
- AC-B10.3: GIVEN a migration fails partway WHEN the app attempts to open the project THEN the DB
 is left in its pre-migration state (transactional migration) and the app surfaces
 `PROJECT_CORRUPT` rather than a half-migrated schema.

### US-B11: Project export/import
As an artist, I want to export my project as a single portable bundle, so that I can back it up
or move it to another machine.

- AC-B11.1: GIVEN an open project WHEN `export_project({destination_path, include_assets: true})`
 is invoked THEN a zip of the `.tarot/` bundle (DB + assets + previews + manifest) is written to
 `destination_path` and the response includes `{path, manifest_sha256}`.
- AC-B11.2: GIVEN a previously exported zip WHEN re-imported THEN the manifest is validated
 against `manifest_sha256`; a mismatch or missing manifest returns an import error rather than
 loading a possibly-corrupt project.

### US-B12: Missing-asset repair
As an artist, I want the app to detect and report broken file references, so that I know when
project assets have gone missing outside the app (e.g. manual folder edits).

- AC-B12.1: GIVEN a project where a `works` row references an asset file that no longer exists on
 disk WHEN the repair scan runs THEN that work is reported as `ASSET_MISSING` in the scan output
 without deleting the DB row automatically.
- AC-B12.2: GIVEN an asset file exists on disk with no referencing `works` row (orphan) WHEN the
 repair scan runs THEN it is listed as an orphan candidate for cleanup, and cleanup only occurs
 on explicit user confirmation (never automatic deletion).

---

## 3. Frontend (React / TypeScript / Vite) — User Stories & Acceptance Criteria

### US-F01: App shell & routing
As an artist, I want a project selector/creator and a main grid view, so that I can get from app
launch to working on my board in as few steps as possible.

- AC-F01.1: GIVEN the app has no project open WHEN it launches THEN the project
 selector/creator screen is shown with options to create a new project or open an existing one.
- AC-F01.2: GIVEN a project is opened or created WHEN the operation succeeds THEN the app
 navigates to the grid view showing that project's sockets.
- AC-F01.3: GIVEN `create_project` or `get_project` fails WHEN the error returns THEN the
 selector screen shows the structured error message (from US-B09) instead of navigating.

### US-F02: Socket grid component
As an artist, I want to see all my sockets in a scrollable grid with adjustable density, so that I
can gauge overall project progress at a glance.

- AC-F02.1: GIVEN a project with N sockets WHEN the grid view renders THEN all N sockets appear
 in position order, laid out in the user-selected column count (1–4, per Q-2/§6.2 decision).
- AC-F02.2: GIVEN more sockets than fit in the viewport WHEN the user scrolls vertically THEN
 additional sockets below the fold become visible; the grid does not paginate.
- AC-F02.3: GIVEN the user changes the column-density control WHEN a new value (1–4) is selected
 THEN the grid re-flows immediately without losing scroll position beyond what re-flow requires.
- AC-F02.4: GIVEN a project with ~100 sockets (the stated ceiling, Q-12) WHEN the grid renders and
 scrolls THEN there is no visible jank on typical consumer hardware (see NFR-Perf).

### US-F03: Socket card component
As an artist, I want each card to show its title, lock state, and filled/empty status clearly, so
that I can distinguish sockets without opening each one.

- AC-F03.1: GIVEN an empty socket WHEN rendered THEN it shows a visually distinct empty-state
 placeholder (per FR-2/AC-1.2) and its editable title field, even with no title set yet.
- AC-F03.2: GIVEN a filled socket with a `selected_work_id` set WHEN rendered THEN the card shows
 that work's thumbnail (or a document icon for non-image kinds).
- AC-F03.3: GIVEN a socket's lock is toggled WHEN the card re-renders THEN a lock icon
 appears/disappears and, if locked, delete-oriented affordances (remove work, etc.) become
 disabled with a tooltip explaining why.
- AC-F03.4: GIVEN the user edits the title or notes field inline WHEN they blur the field or the
 debounce interval elapses THEN `update_socket` is called and the change is confirmed persisted
 (no explicit Save button, per NFR-2).

### US-F04: Metadata editor (fixed schema)
As an artist, I want a consistent metadata editor on every socket, so that I always know exactly
what information I can attach.

- AC-F04.1: GIVEN the fixed metadata schema defined in §5.1 WHEN a socket's detail panel opens
 THEN the editor renders exactly those fields (no add/remove-field controls), pre-filled with
 any existing values.
- AC-F04.2: GIVEN a metadata field with a constrained value set (e.g. `status`) WHEN edited THEN
 the UI offers only the valid options (dropdown/select), preventing free-text entry for that
 field.
- AC-F04.3: GIVEN a metadata field is a free-text field in the fixed schema (e.g. `tags`) WHEN
 edited THEN free text is accepted and persisted via `update_socket`.

### US-F05: File picker & drag-and-drop
As an artist, I want to drop files onto a socket or pick them via a native dialog, so that
populating sockets is fast regardless of workflow preference.

- AC-F05.1: GIVEN a socket card is visible WHEN the user drags a file over it THEN the card shows
 a drop-target visual state (e.g. highlighted border).
- AC-F05.2: GIVEN a file is dropped on an unlocked socket WHEN the drop completes THEN
 `attach_work`/`import_dropped_files` is called and the card shows a loading state until the
 work + its preview job resolve.
- AC-F05.3: GIVEN the user clicks the socket's "browse" affordance WHEN the native file dialog
 returns a path THEN the same attach flow as drag-and-drop is triggered.
- AC-F05.4: GIVEN a file is dropped on a locked socket WHEN the drop completes THEN the UI shows
 a `LOCKED` error toast and does not call attach.

### US-F06: Comparison view (in-card, no dedicated modal)
As an artist, I want to see all candidate works for a socket, so that I can compare them before
picking a winner — without a heavyweight dedicated screen.

- AC-F06.1 [DECIDED, Q-11]: GIVEN a socket with 2+ works WHEN its detail panel opens THEN all
 works are shown as thumbnails in a row/grid within that panel (no separate route/modal/lightbox
 is built in this pass).
- AC-F06.2: GIVEN a socket with only one work WHEN its detail panel opens THEN no comparison
 affordance is shown (nothing to compare).
- AC-F06.3: GIVEN a socket has both a selected winner and other candidates WHEN the detail panel
 renders THEN the winner is visually distinguished (badge) from the non-selected thumbnails
 within that same in-card list, and the grid card itself follows the hide behavior in US-F07.

### US-F07: Winner selection & lock UI
As an artist, I want to mark one work as the winner and have the rest disappear from the main
view, so that my grid reflects only finished decisions at a glance.

- AC-F07.1 [DECIDED, Q-4]: GIVEN a multi-work socket WHEN the user selects a winner via
 `select_winner` THEN the grid-level socket card shows **only** the winning work's
 thumbnail; non-selected works are hidden from the card (not deleted — still visible in the
 socket detail panel's comparison list, AC-F06.3).
- AC-F07.2: GIVEN a socket has a winner WHEN the user opens its detail panel THEN a control to
 clear/change the winner is available, unless the socket is locked.
- AC-F07.3: GIVEN a socket is locked WHEN the user attempts to toggle the lock off THEN a
 confirmation prompt is shown before unlocking (per ARCHITECTURE.md §1 lock policy).

### US-F08: CSV import UI
As an artist, I want a guided import flow with a preview and summary, so that I can trust a bulk
operation before and after it runs.

- AC-F08.1: GIVEN the user picks a CSV file WHEN it loads THEN a preview table shows the parsed
 header and first N rows before any DB mutation occurs.
- AC-F08.2: GIVEN the preview is shown WHEN the user confirms the mapping (header = field names,
 per Q-5) and mode (append/update) THEN `import_csv` is invoked and a progress bar reflects
 `get_job` polling.
- AC-F08.3: GIVEN the import job completes WHEN the UI receives the final `get_job` result THEN a
 summary report (rows processed, rows skipped with reasons) is displayed to the user.

### US-F09: Extracted text display
As an artist, I want to read a document's extracted text inside its socket, so that I don't need
an external viewer for reference material.

- AC-F09.1: GIVEN a work with `extracted_text.state == "ready"` WHEN the socket detail panel
 renders THEN a collapsible section shows the extracted text, collapsed by default.
- AC-F09.2: GIVEN `extracted_text.state == "failed"` or the format is unsupported WHEN the panel
 renders THEN the section shows a clear "text unavailable" message instead of the collapsible
 content, and the file remains available as a plain attachment.

### US-F10: Accessibility & keyboard navigation
As an artist relying on the keyboard, I want to navigate and operate the grid without a mouse, so
that the app is usable regardless of input method.

- AC-F10.1: GIVEN the grid is focused WHEN the user presses arrow keys THEN focus moves between
 socket cards following the current column layout (left/right/up/down mapped to grid position).
- AC-F10.2: GIVEN a socket card is focused WHEN the user presses Enter/Space THEN the socket
 detail panel opens; Escape closes it and returns focus to the originating card.
- AC-F10.3: GIVEN any interactive element (title field, lock toggle, metadata field, winner
 button) WHEN inspected with an accessibility tree tool THEN it has an appropriate ARIA role and
 label.

---

## 4. Data (SQLite + Filesystem) — User Stories & Acceptance Criteria

### US-D01: Portable project directory structure
As an artist, I want my whole project to live in one folder I can copy or back up, so that my
work isn't scattered across app-internal storage I can't find.

- AC-D01.1: GIVEN a new project is created WHEN `create_project`` completes THEN
 `<project>.tarot/project.sqlite`, `<project>.tarot/assets/`, `<project>.tarot/previews/`, and
 `<project>.tarot/manifest.json` all exist under the chosen `project_path`.
- AC-D01.2: GIVEN the `.tarot/` folder is copied to another machine with the same app version
 installed WHEN opened there THEN the project loads with all sockets, works, and metadata intact
 (no hardcoded absolute paths inside the DB).

### US-D02: Six-table relational schema
As a developer, I want the schema in ARCHITECTURE.md §5 exactly implemented, so that every other
component (services, jobs, UI) has a stable contract to build against.

- AC-D02.1: GIVEN the schema migration runs WHEN inspected THEN `projects`, `sockets`, `works`,
 `previews`, `extracted_text`, `import_jobs` exist with the columns, types, and constraints
 (e.g. `UNIQUE(project_id, position)`, `grid_columns CHECK (1..4)` — capped at 4 per Q-2, not 5)
 specified in ARCHITECTURE.md §5.
- AC-D02.2: GIVEN a socket is deleted at the DB layer WHEN a `works` row still references it via
 foreign key THEN the deletion is rejected or cascades per an explicit, tested policy — not
 left as an undefined foreign-key state.

### US-D03: Auto-commit persistence, no manual save
As an artist, I want every change I make saved instantly, so that I never lose work to a forgotten
save action or a crash.

- AC-D03.1: GIVEN any mutating command succeeds (title edit, lock toggle, work attach, etc.)
 WHEN the SQLite transaction commits THEN the change is durable — reopening the project after a
 forced process kill shows the change.
- AC-D03.2: GIVEN SQLite WAL mode is enabled WHEN the app is closed normally or crashes WHEN
 reopened THEN the WAL is checkpointed/recovered automatically with no manual repair step
 required from the user.

### US-D04: Asset lifecycle (content-hash storage, GC, diagnostics)
As an artist, I want attached files stored efficiently and safely, so that duplicate uploads don't
waste disk space and I can recover from accidental file loss.

- AC-D04.1: GIVEN two different works reference byte-identical files WHEN both are attached THEN
 only one physical file exists in `assets/`, named by its SHA-256 hash.
- AC-D04.2: GIVEN the user runs the missing-asset repair scan (US-B12) WHEN it completes THEN its
 output distinguishes "missing asset, DB reference exists" from "orphan asset, no DB reference"
 and takes no destructive action without explicit confirmation.

---

## 5. Non-Functional Requirements (implied by the source docs)

- **NFR-Platform** [DECIDED, Q-8]: Windows + Linux from v1 (not Windows-only as an earlier draft
 assumed). macOS is not a target and is not tested, though Tauri's portability may make it work
 incidentally.
- **NFR-Persistence**: Local-only, folder-based `.tarot/` bundle (DECIDED, Q-7); no server, no
 cloud sync, no network dependency for any in-scope feature.
- **NFR-Auth**: None. Single local user; no login, accounts, or permission model (source and
 architecture agree; not contested).
- **NFR-Offline**: The app must be fully functional with no network connection for every in-scope
 feature. (ComfyUI, the only network-touching feature, is out of scope — §1.2.)
- **NFR-Performance**: Grid rendering and scrolling must not visibly lag up to the stated ceiling
 of **~100 sockets** [DECIDED, Q-12] with multiple works each, on typical consumer hardware.
 Virtualization (BUILD_PLAN.md T-27) may be simplified or deferred given this ceiling, but a
 100-socket smoke/performance test is still required before calling this NFR met.
- **NFR-DataSafety**: Locked sockets must survive not only UI-level delete actions but also bulk
 paths (CSV re-import, any future "clear project" action) — a lock check must exist at the
 service layer, not only the UI layer, so no client can bypass it.
- **NFR-Testability**: Backend commands are unit/integration tested in Rust; frontend components
 are tested with Vitest/React Testing Library; at least one cross-stack integration test proves
 create→fill→persist→reload end to end (mirrors ARCHITECTURE.md §7's first milestone).

---

## 6. Open Questions Resolved (from BUILD_PLAN.md §5)

All items below were flagged in BUILD_PLAN.md as either already answered by the stakeholder or as
a remaining gap/contradiction. Each is resolved here so implementers are not blocked.

### 6.1 — Socket count mutability (Q-1) — DECIDED
Fixed at creation. No add/remove-socket UI or backend command. See §1.2 and AC-B03.5.

### 6.2 — Grid axis: rows vs. columns (Gap #2) — DECIDED
Adopt **columns** (horizontal grid, vertical scroll) as ARCHITECTURE.md recommends — this is the
standard desktop pattern and matches `grid_columns` already in the data model. The original
REQUIREMENTS.md "rows" language (AC-4.1) is superseded. Column count is capped at **4**, per the
user's direct answer to Q-2 ("4 should suffice"), not 5. AC-F02.1, AC-F02.3, and AC-D02.1 encode
this decision.

### 6.3 — Fixed metadata schema fields (Gap #1) — **ASSUMPTION** (no stakeholder available)
The user chose "fixed schema" but never named fields. Lowest-risk default, matching the kind of
fields a solo visual artist tracking deliverable status would need, and cheap to extend later
via a migration:

| Field | Type | Notes |
|---|---|---|
| `status` | enum: `not_started`, `in_progress`, `needs_review`, `done` | drives any future progress rollups |
| `medium` | free text | e.g. "digital painting", "ink" |
| `tags` | free text (comma-separated) | lightweight, no controlled vocabulary in v1 |
| `due_date` | optional date | purely informational, no reminders/notifications in scope |

This is `[ASSUMPTION]` — flag for stakeholder confirmation before UI copy is finalized. If the
stakeholder wants different fields, only the metadata editor's field list and the JSON shape
change; the schema itself (`metadata_json TEXT`) already supports arbitrary keys.

### 6.4 — "Hide non-selected" UI behavior (Gap #3) — **ASSUMPTION** (no stakeholder available)
Three options were identified in BUILD_PLAN.md: (a) collapsed behind an expand arrow, (b) moved to
a separate "candidates" tab, (c) visually dimmed. Lowest-risk default chosen: **hide entirely from
the grid-level card** (only the winner's thumbnail shows there), while **all works remain visible
in the socket's detail panel** comparison list (AC-F06.3, AC-F07.1). This satisfies the literal
instruction ("hide the non-selected images") at the glanceable grid level without making any work
unreachable — non-destructive and reversible, the safest interpretation given "hide" was the
user's own word choice over "delete" or "archive".

### 6.5 — No code exists yet (Gap #4) — not a decision, noted for context
Confirmed still true as of this task; not actionable here. Scaffold task (assignee: developer)
owns creating the initial repo structure.

### 6.6 — Documents scattered across worktrees (Gap #5) — not a decision, process note
This document, together with BUILD_PLAN.md, ARCHITECTURE.md, and the annotated REQUIREMENTS.md,
constitutes the full spec. Recommend the scaffold/build tasks consolidate these four files into
the main branch root so future engineers don't need to traverse worktrees.

### 6.7 — T-22 contradicts "fixed socket count" (Gap #7) — DECIDED
T-22 ("Socket add/remove after creation") is **removed from scope** for this build pass, not
merely demoted to COULD, because it directly contradicts the user's explicit "fixed" answer to
Q-1. See §1.2 and AC-B03.5. If the stakeholder later wants mutable socket counts, that is a new
feature request requiring its own requirements pass, not a resurrection of T-22 as-is.

### 6.8 — ARCHITECTURE.md build order assumes Windows-only (Gap #6) — DECIDED
Superseded by Q-8 (Windows + Linux). No architectural blocker: Tauri 2 supports both natively.
CI/build tooling (owned by the scaffold task) should build and smoke-test both targets before any
release is considered done, not just Windows.

---

## 7. Traceability Summary

Every BUILD_PLAN.md §3 component maps to at least one story above:

| Component (BUILD_PLAN.md §3) | Story |
|---|---|
| Tauri 2 shell | US-B01 |
| Project service | US-B02 |
| Socket service | US-B03 |
| Work service | US-B04 |
| CSV import service | US-B05 |
| Document text extraction | US-B06 |
| Thumbnail/preview service | US-B07 |
| Background job infrastructure | US-B08 |
| Structured error envelope | US-B09 |
| SQLite schema & migrations | US-B10, US-D02 |
| Project export/import | US-B11 |
| Missing-asset repair | US-B12, US-D04 |
| App shell & routing | US-F01 |
| Socket grid component | US-F02 |
| Socket card component | US-F03 |
| Metadata editor | US-F04 |
| File picker & drag-and-drop | US-F05 |
| Comparison view | US-F06 |
| Winner selection & lock UI | US-F07 |
| CSV import UI | US-F08 |
| Extracted text display | US-F09 |
| Accessibility & keyboard nav | US-F10 |
| Project directory structure | US-D01 |
| 6 database tables | US-D02 |
| Persistence model | US-D03 |
| Asset lifecycle | US-D04 |
| No server/cloud, no auth, platforms | NFR-Platform, NFR-Auth, NFR-Offline |
| Testing | NFR-Testability |
| ComfyUI / LLM-MCP (deferred) | §1.2 — explicitly out of scope, no stories written |
