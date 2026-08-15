/**
 * In-memory mock implementation of the BackendClient contract.
 *
 * Used by component tests and when the app runs outside the Tauri shell
 * (plain `vite dev`), so the entire UI is exercisable without a live
 * backend. Implements the documented rules:
 *
 *  - Structured error envelopes {code, message, details} (US-B09).
 *  - Lock policy: locked sockets reject content edits, attach/remove work,
 *    winner changes, and reordering with LOCKED (docs/api.md, AC-B03/B04).
 *  - remove_work on the selected winner requires force (IS_SELECTED,
 *    AC-B04.5).
 *  - CSV import runs as a polled background job with per-row warnings
 *    (US-B05); locked rows are skipped with a LOCKED warning (AC-B05.4).
 *  - Preview/extraction lifecycles transition pending -> ready/failed
 *    asynchronously (US-B06, US-B07).
 */
import type { BackendClient } from "./client";
import { readBlobBytes, readBlobText } from "./blobUtil";
import {
  ApiError,
  emptyMetadata,
  type CsvPreview,
  type DroppedFilesResult,
  type JobStatus,
  type MediaKind,
  type Project,
  type RepairScanResult,
  type Socket,
  type SocketMetadata,
  type Work,
} from "./types";

function err(
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
): ApiError {
  return new ApiError({ code, message, details });
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ext(path: string): string {
  const clean = path.split("?")[0];
  const i = clean.lastIndexOf(".");
  return i >= 0 ? clean.slice(i + 1).toLowerCase() : "";
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
]);
const TEXT_EXTRACT_EXTS = new Set(["txt", "md", "csv", "json"]);

export function mediaKindForPath(path: string): MediaKind {
  const e = ext(path);
  if (IMAGE_EXTS.has(e)) return "image";
  if (e === "pdf") return "pdf";
  if (e === "docx") return "docx";
  if (TEXT_EXTRACT_EXTS.has(e)) return "text";
  return "other";
}

/** Minimal CSV parser for mock client preview & import. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    let h = 0;
    for (let i = 0; i < bytes.length; i++) h = (h * 31 + bytes[i]) | 0;
    return "fallback-" + (h >>> 0).toString(16);
  }
}

interface WorkState extends Work {
  source_blob: Blob | null;
}

interface SocketState extends Omit<Socket, "works"> {
  works: WorkState[];
}

interface ProjectState {
  name: string;
  path: string;
  grid_columns: number;
  sockets: SocketState[];
}

interface JobState {
  status: JobStatus;
  timer: ReturnType<typeof setInterval> | null;
}

export interface MockClientOptions {
  /** Simulated IPC latency in ms (default 60). Set 0 for fast tests. */
  latency?: number;
  /** Simulated background-job tick interval in ms (default 80). */
  jobTickMs?: number;
}

const STATUS_VALUES = new Set([
  "not_started",
  "in_progress",
  "needs_review",
  "done",
]);

export class MockBackendClient implements BackendClient {
  private projects = new Map<string, ProjectState>();
  private jobs = new Map<string, JobState>();
  private idCounter = 0;
  private readonly latency: number;
  private readonly jobTickMs: number;

  constructor(opts: MockClientOptions = {}) {
    this.latency = opts.latency ?? 60;
    this.jobTickMs = opts.jobTickMs ?? 80;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }

  private async ipc<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.latency > 0) await delay(this.latency);
    return fn();
  }

  private getOrThrow(projectPath: string): ProjectState {
    const p = this.projects.get(projectPath);
    if (!p)
      throw err("NOT_FOUND", `Project not found at ${projectPath}`, {
        project_path: projectPath,
      });
    return p;
  }

  private socketOrThrow(p: ProjectState, socketId: string): SocketState {
    const s = p.sockets.find((x) => x.id === socketId);
    if (!s)
      throw err("SOCKET_NOT_FOUND", `Socket ${socketId} not found`, {
        socket_id: socketId,
      });
    return s;
  }

  private toProject(p: ProjectState): Project {
    return {
      name: p.name,
      path: p.path,
      grid_columns: p.grid_columns,
      sockets: p.sockets.map((s) => ({
        ...s,
        works: s.works.map((w) => {
          const { source_blob: _blob, ...rest } = w;
          return rest;
        }),
      })),
    };
  }

  private toSocket(s: SocketState): Socket {
    return this.toProject({ name: "", path: "", grid_columns: 1, sockets: [s] })
      .sockets[0];
  }

  createProject(req: {
    name: string;
    socket_count: number;
    project_path: string;
  }): Promise<Project> {
    return this.ipc(() => {
      if (!req.name || req.name.trim() === "") {
        throw err("INVALID_NAME", "Project name must not be empty");
      }
      if (!Number.isInteger(req.socket_count) || req.socket_count <= 0) {
        throw err(
          "INVALID_SOCKET_COUNT",
          "socket_count must be a positive integer",
          {
            socket_count: req.socket_count,
          },
        );
      }
      if (!req.project_path || req.project_path.trim() === "") {
        throw err("PATH_NOT_WRITABLE", "project_path must not be empty");
      }
      if (this.projects.has(req.project_path)) {
        throw err(
          "PATH_NOT_WRITABLE",
          `A project already exists at ${req.project_path}`,
          {
            project_path: req.project_path,
          },
        );
      }
      const sockets: SocketState[] = [];
      for (let i = 0; i < req.socket_count; i++) {
        sockets.push({
          id: this.nextId("s"),
          position: i,
          title: "",
          notes: "",
          locked: false,
          metadata: emptyMetadata(),
          selected_work_id: null,
          works: [],
        });
      }
      const state: ProjectState = {
        name: req.name.trim(),
        path: req.project_path,
        grid_columns: 3,
        sockets,
      };
      this.projects.set(req.project_path, state);
      return this.toProject(state);
    });
  }

  getProject(projectPath: string): Promise<Project> {
    return this.ipc(() => this.toProject(this.getOrThrow(projectPath)));
  }

  updateProject(req: {
    project_path: string;
    name?: string;
    grid_columns?: number;
  }): Promise<Project> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      if (req.grid_columns !== undefined) {
        if (
          !Number.isInteger(req.grid_columns) ||
          req.grid_columns < 1 ||
          req.grid_columns > 4
        ) {
          throw err(
            "VALIDATION_ERROR",
            "grid_columns must be an integer between 1 and 4",
            {
              grid_columns: req.grid_columns,
            },
          );
        }
        p.grid_columns = req.grid_columns;
      }
      if (req.name !== undefined) {
        if (req.name.trim() === "")
          throw err("INVALID_NAME", "Project name must not be empty");
        p.name = req.name.trim();
      }
      return this.toProject(p);
    });
  }

  updateSocket(req: {
    project_path: string;
    socket_id: string;
    title?: string;
    notes?: string;
    metadata?: SocketMetadata;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      const touchesContent =
        req.title !== undefined ||
        req.notes !== undefined ||
        req.metadata !== undefined;
      if (s.locked && touchesContent) {
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      }
      if (req.title !== undefined) s.title = req.title;
      if (req.notes !== undefined) s.notes = req.notes;
      if (req.metadata !== undefined) {
        if (!STATUS_VALUES.has(req.metadata.status)) {
          throw err(
            "VALIDATION_ERROR",
            `Invalid status value: ${req.metadata.status}`,
          );
        }
        s.metadata = { ...req.metadata };
      }
      return this.toSocket(s);
    });
  }

  setSocketLock(req: {
    project_path: string;
    socket_id: string;
    locked: boolean;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      s.locked = req.locked;
      return this.toSocket(s);
    });
  }

  reorderSockets(req: {
    project_path: string;
    ordered_socket_ids: string[];
  }): Promise<Project> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const ids = req.ordered_socket_ids;
      if (new Set(ids).size !== ids.length)
        throw err("DUPLICATE_ID", "Duplicate socket ids in reorder list");
      const currentIds = new Set(p.sockets.map((s) => s.id));
      for (const id of ids) {
        if (!currentIds.has(id))
          throw err("MISSING_SOCKET", `Unknown socket id ${id}`, {
            socket_id: id,
          });
      }
      if (ids.length !== p.sockets.length) {
        throw err(
          "MISSING_SOCKET",
          "Reorder list must cover every socket in the project",
        );
      }
      const byId = new Map(p.sockets.map((s) => [s.id, s]));
      p.sockets = ids.map((id, i) => ({ ...byId.get(id)!, position: i }));
      return this.toProject(p);
    });
  }

  selectWinner(req: {
    project_path: string;
    socket_id: string;
    work_id: string | null;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      if (s.locked)
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      if (req.work_id !== null && !s.works.some((w) => w.id === req.work_id)) {
        throw err(
          "WORK_NOT_IN_SOCKET",
          `Work ${req.work_id} is not attached to socket ${s.id}`,
          {
            work_id: req.work_id,
            socket_id: s.id,
          },
        );
      }
      s.selected_work_id = req.work_id;
      return this.toSocket(s);
    });
  }

  private blobsByPath = new Map<string, Blob>();

  registerLocalFile(objectUrlOrPath: string, blob: Blob): void {
    this.blobsByPath.set(objectUrlOrPath, blob);
  }

  private async buildWork(
    s: SocketState,
    sourcePath: string,
  ): Promise<WorkState> {
    const blob = this.blobsByPath.get(sourcePath) ?? null;
    let bytes = new Uint8Array(0);
    let hash = "no-content";
    if (blob) {
      try {
        bytes = await readBlobBytes(blob);
        hash = await sha256Hex(bytes);
      } catch {
        throw err("FILE_UNREADABLE", `Cannot read file ${sourcePath}`, {
          source_path: sourcePath,
        });
      }
    }
    const kind = mediaKindForPath(sourcePath);
    const work: WorkState = {
      id: this.nextId("w"),
      socket_id: s.id,
      title: sourcePath.split(/[\\/]/).pop() ?? sourcePath,
      media_kind: kind,
      mime_type: blob?.type || null,
      byte_size: bytes.length,
      sha256: hash,
      preview_uri: null,
      preview_state: kind === "image" ? "pending" : "failed",
      extracted_text_state: TEXT_EXTRACT_EXTS.has(ext(sourcePath))
        ? "pending"
        : "unsupported",
      metadata_json: "{}",
      source_blob: blob,
    };
    s.works.push(work);

    if (kind === "image") {
      setTimeout(() => {
        work.preview_state = "ready";
        work.preview_uri = blob ? sourcePath : null;
      }, this.jobTickMs * 2);
    }
    if (work.extracted_text_state === "pending") {
      setTimeout(async () => {
        try {
          work.extracted_text = blob
            ? await readBlobText(blob)
            : "(no content available in mock mode)";
          work.extracted_text_state = "ready";
        } catch {
          work.extracted_text_state = "failed";
        }
      }, this.jobTickMs);
    }
    return work;
  }

  attachWork(req: {
    project_path: string;
    socket_id: string;
    source_path: string;
  }): Promise<Socket> {
    return this.ipc(async () => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      if (s.locked)
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      if (!req.source_path)
        throw err("FILE_UNREADABLE", "source_path is required");
      await this.buildWork(s, req.source_path);
      return this.toSocket(s);
    });
  }

  async importDroppedFiles(req: {
    project_path: string;
    socket_id: string;
    paths: string[];
  }): Promise<DroppedFilesResult> {
    const p = this.getOrThrow(req.project_path);
    const s = this.socketOrThrow(p, req.socket_id);
    if (s.locked) {
      return {
        accepted: [],
        rejected: req.paths.map((path) => ({
          path,
          reason: "Socket is locked",
          code: "LOCKED",
        })),
      };
    }
    const accepted: Work[] = [];
    const rejected: DroppedFilesResult["rejected"] = [];
    for (const path of req.paths) {
      try {
        if (this.latency > 0) await delay(this.latency);
        const w = await this.buildWork(s, path);
        const { source_blob: _blob, ...rest } = w;
        accepted.push(rest);
      } catch (e) {
        const ae = e instanceof ApiError ? e : err("INTERNAL_ERROR", String(e));
        rejected.push({ path, reason: ae.message, code: ae.code });
      }
    }
    return { accepted, rejected };
  }

  removeWork(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
    force?: boolean;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      if (s.locked)
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      const w = s.works.find((x) => x.id === req.work_id);
      if (!w)
        throw err("NOT_FOUND", `Work ${req.work_id} not found`, {
          work_id: req.work_id,
        });
      if (s.selected_work_id === w.id && !req.force) {
        throw err(
          "IS_SELECTED",
          "This work is the selected winner. Confirm removal to proceed.",
          {
            work_id: w.id,
          },
        );
      }
      s.works = s.works.filter((x) => x.id !== req.work_id);
      if (s.selected_work_id === w.id) s.selected_work_id = null;
      return this.toSocket(s);
    });
  }

  refreshExtractedText(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      const w = s.works.find((x) => x.id === req.work_id);
      if (!w)
        throw err("NOT_FOUND", `Work ${req.work_id} not found`, {
          work_id: req.work_id,
        });
      if (!TEXT_EXTRACT_EXTS.has(ext(w.title))) {
        throw err(
          "UNSUPPORTED_FORMAT",
          `No text extractor for ${w.media_kind}`,
          { work_id: w.id },
        );
      }
      w.extracted_text_state = "pending";
      setTimeout(async () => {
        try {
          w.extracted_text = w.source_blob
            ? await readBlobText(w.source_blob)
            : "(no content available in mock mode)";
          w.extracted_text_state = "ready";
        } catch {
          w.extracted_text_state = "failed";
        }
      }, this.jobTickMs);
      return this.toSocket(s);
    });
  }

  private parseImportCsv(csvText: string): {
    headers: string[];
    rows: string[][];
  } {
    const table = parseCsv(csvText);
    if (table.length === 0) throw err("CSV_PARSE_ERROR", "CSV file is empty");
    const headers = table[0].map((h) => h.trim().toLowerCase());
    if (!headers.includes("title")) {
      throw err(
        "MISSING_REQUIRED_COLUMN",
        "CSV must contain a 'title' column",
        { headers },
      );
    }
    return { headers, rows: table.slice(1) };
  }

  previewCsv(req: {
    project_path: string;
    csv_text: string;
  }): Promise<CsvPreview> {
    return this.ipc(() => {
      this.getOrThrow(req.project_path);
      const { headers, rows } = this.parseImportCsv(req.csv_text);
      return { headers, rows: rows.slice(0, 5), rows_total: rows.length };
    });
  }

  importCsv(req: {
    project_path: string;
    csv_text: string;
    mode: "append" | "update";
  }): Promise<{ job_id: string; rows_total: number }> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const { headers, rows } = this.parseImportCsv(req.csv_text);
      const jobId = this.nextId("job");

      const col = (name: string) => headers.indexOf(name);
      const titleIdx = col("title");
      const notesIdx = col("notes");
      const statusIdx = col("status");
      const mediumIdx = col("medium");
      const tagsIdx = col("tags");
      const dueIdx = col("due_date");

      const warnings: JobStatus["warnings"] = [];
      let processed = 0;
      let skipped = 0;
      let cursor = 0;

      const applyRow = (rowIndex: number, row: string[]): boolean => {
        let target: SocketState | undefined;
        if (req.mode === "update") {
          target = p.sockets[rowIndex];
          if (!target) {
            warnings.push({
              row: rowIndex + 1,
              reason: "Row exceeds socket count (socket count is fixed)",
              code: "OUT_OF_RANGE",
            });
            return false;
          }
          if (target.locked) {
            warnings.push({
              row: rowIndex + 1,
              reason: "Socket is locked",
              code: "LOCKED",
            });
            return false;
          }
        } else {
          while (
            cursor < p.sockets.length &&
            (p.sockets[cursor].title.trim() !== "" || p.sockets[cursor].locked)
          ) {
            if (p.sockets[cursor].locked) {
              warnings.push({
                row: rowIndex + 1,
                reason: "Socket is locked",
                code: "LOCKED",
              });
            }
            cursor++;
          }
          target = p.sockets[cursor];
          if (!target) {
            warnings.push({
              row: rowIndex + 1,
              reason: "No empty socket left to append into",
              code: "OUT_OF_RANGE",
            });
            return false;
          }
        }
        const title = (row[titleIdx] ?? "").trim();
        if (title === "") {
          warnings.push({
            row: rowIndex + 1,
            reason: "Empty title",
            code: "ROW_VALIDATION_ERROR",
          });
          return false;
        }
        const meta: SocketMetadata = { ...target.metadata };
        if (statusIdx >= 0) {
          const v = (row[statusIdx] ?? "").trim();
          if (v !== "") {
            if (!STATUS_VALUES.has(v)) {
              warnings.push({
                row: rowIndex + 1,
                reason: `Invalid status '${v}' — row skipped`,
                code: "ROW_VALIDATION_ERROR",
              });
              return false;
            }
            meta.status = v as SocketMetadata["status"];
          }
        }
        if (mediumIdx >= 0) meta.medium = (row[mediumIdx] ?? "").trim();
        if (tagsIdx >= 0) meta.tags = (row[tagsIdx] ?? "").trim();
        if (dueIdx >= 0) {
          const d = (row[dueIdx] ?? "").trim();
          meta.due_date = d === "" ? null : d;
        }
        target.title = title;
        if (notesIdx >= 0) target.notes = (row[notesIdx] ?? "").trim();
        target.metadata = meta;
        if (req.mode === "append") cursor++;
        return true;
      };

      const job: JobState = {
        status: { state: "running", progress: 0, warnings: [] },
        timer: null,
      };
      this.jobs.set(jobId, job);

      let i = 0;
      job.timer = setInterval(() => {
        const batch = Math.max(1, Math.ceil(rows.length / 10));
        for (let b = 0; b < batch && i < rows.length; b++, i++) {
          if (applyRow(i, rows[i])) processed++;
          else skipped++;
        }
        job.status.progress =
          rows.length === 0 ? 100 : Math.round((i / rows.length) * 100);
        job.status.warnings = [...warnings];
        if (i >= rows.length) {
          if (job.timer) clearInterval(job.timer);
          job.status.state = "done";
          job.status.progress = 100;
          job.status.result = {
            rows_total: rows.length,
            rows_processed: processed,
            rows_skipped: skipped,
          };
        }
      }, this.jobTickMs);

      return { job_id: jobId, rows_total: rows.length };
    });
  }

  getJob(req: { project_path: string; job_id: string }): Promise<JobStatus> {
    return this.ipc(() => {
      this.getOrThrow(req.project_path);
      const job = this.jobs.get(req.job_id);
      if (!job)
        throw err("NOT_FOUND", `Job ${req.job_id} not found`, {
          job_id: req.job_id,
        });
      return { ...job.status, warnings: [...job.status.warnings] };
    });
  }

  exportProject(req: {
    project_path: string;
    destination_path: string;
  }): Promise<{ path: string; manifest_sha256: string }> {
    return this.ipc(() => {
      this.getOrThrow(req.project_path);
      if (!req.destination_path)
        throw err("PATH_NOT_WRITABLE", "destination_path is required");
      return {
        path: req.destination_path,
        manifest_sha256: "mock-manifest-hash",
      };
    });
  }

  repairScan(req: { project_path: string }): Promise<RepairScanResult> {
    return this.ipc(() => {
      this.getOrThrow(req.project_path);
      return { missing_assets: [], orphans: [] };
    });
  }

  async seedDemoProject(
    path = "C:/Users/artist/Projects/tarot-deck",
  ): Promise<Project> {
    const project = await this.createProject({
      name: "Tarot Deck (demo)",
      socket_count: 12,
      project_path: path,
    });
    await this.updateSocket({
      project_path: path,
      socket_id: project.sockets[0].id,
      title: "0 — The Fool",
      notes: "Opening card. Bright palette, figure mid-step.",
      metadata: {
        status: "in_progress",
        medium: "digital painting",
        tags: "major-arcana, opener",
        due_date: null,
      },
    });
    await this.updateSocket({
      project_path: path,
      socket_id: project.sockets[1].id,
      title: "I — The Magician",
      metadata: {
        status: "needs_review",
        medium: "ink",
        tags: "major-arcana",
        due_date: "2026-09-01",
      },
    });
    const s2 = project.sockets[2];
    await this.updateSocket({
      project_path: path,
      socket_id: s2.id,
      title: "II — The High Priestess (locked)",
    });
    await this.setSocketLock({
      project_path: path,
      socket_id: s2.id,
      locked: true,
    });
    return this.getProject(path);
  }
}
