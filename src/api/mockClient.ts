/**
 * In-memory mock implementation of the BackendClient contract.
 *
 * Used by component tests and when the app runs outside the Tauri shell
 * (plain `vite dev`), so the entire UI is exercisable without a live
 * backend. Implements the documented rules:
 *
 * - Structured error envelopes {code, message, details} (US-B09).
 * - Lock policy: locked sockets reject content edits, attach/remove work,
 * winner changes, and reordering with LOCKED (docs/api.md, AC-B03/B04).
 * - remove_work on the selected winner requires force (IS_SELECTED,
 * AC-B04.5).
 * - CSV import runs as a polled background job with per-row warnings
 * (US-B05); locked rows are skipped with a LOCKED warning (AC-B05.4).
 * - Preview/extraction lifecycles transition pending -> ready/failed
 * asynchronously (US-B06, US-B07).
 * - ComfyUI collaboration bridge: model/sampler discovery, single & batch
 * prompt queueing, PNG tEXt metadata ingestion, and history import.
 */
import type { BackendClient } from "./client";
import { readBlobBytes, readBlobText } from "./blobUtil";
import {
  ApiError,
  emptyMetadata,
  type ComfyGenerateRequest,
  type ComfyHistoryItem,
  type ComfyPollResponse,
  type ComfyQueueResponse,
  type ComfyServerInfo,
  type ComfyWorkMetadata,
  type CsvPreview,
  type DroppedFilesResult,
  type JobStatus,
  type MediaKind,
  type OpenExternalEditorResult,
  type Project,
  type ProjectMetadata,
  type RepairScanResult,
  type Socket,
  type SocketMetadata,
  type SyncExternalEditsResult,
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

/** Parse PNG tEXt chunks in Uint8Array for ComfyUI prompt metadata. */
function extractPngComfyMetadataFromBytes(
  bytes: Uint8Array,
): ComfyWorkMetadata | null {
  if (bytes.length < 8) return null;
  // Check PNG signature
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len =
      ((bytes[pos] << 24) |
        (bytes[pos + 1] << 16) |
        (bytes[pos + 2] << 8) |
        bytes[pos + 3]) >>>
      0;
    const type = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > bytes.length) break;

    if (type === "tEXt") {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const nullIdx = chunk.indexOf(0);
      if (nullIdx > 0) {
        const key = decoder.decode(chunk.subarray(0, nullIdx));
        const val = decoder.decode(chunk.subarray(nullIdx + 1));
        if (key === "prompt") {
          try {
            const wf = JSON.parse(val) as Record<
              string,
              { class_type?: string; inputs?: Record<string, unknown> }
            >;
            const meta: ComfyWorkMetadata = { source: "comfyui" };
            for (const node of Object.values(wf)) {
              const inputs = node.inputs || {};
              if (
                node.class_type === "CLIPTextEncode" &&
                typeof inputs.text === "string"
              ) {
                const text = inputs.text.trim();
                if (!meta.positive_prompt) {
                  meta.positive_prompt = text;
                } else if (!meta.negative_prompt) {
                  meta.negative_prompt = text;
                }
              }
              if (
                typeof inputs.ckpt_name === "string" ||
                typeof inputs.unet_name === "string"
              ) {
                meta.model = String(inputs.ckpt_name || inputs.unet_name);
              }
              if (node.class_type?.includes("KSampler")) {
                if (typeof inputs.sampler_name === "string")
                  meta.sampler_name = inputs.sampler_name;
                if (typeof inputs.scheduler === "string")
                  meta.scheduler = inputs.scheduler;
                if (typeof inputs.steps === "number") meta.steps = inputs.steps;
                if (typeof inputs.cfg === "number") meta.cfg = inputs.cfg;
                if (typeof inputs.seed === "number") meta.seed = inputs.seed;
              }
            }
            if (meta.positive_prompt || meta.model || meta.sampler_name) {
              return meta;
            }
          } catch {
            /* ignore */
          }
        } else if (key === "parameters" && val.trim()) {
          return {
            source: "comfyui",
            positive_prompt: val.trim(),
          };
        }
      }
    } else if (type === "IEND") {
      break;
    }
    pos = dataEnd + 4;
  }
  return null;
}

function makeSvgPreviewDataUri(title: string, seed: number): string {
  const hue = seed % 360;
  const safeLabel = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="672" viewBox="0 0 384 672"><rect width="384" height="672" fill="hsl(${hue}, 28%, 16%)"/><rect x="18" y="18" width="348" height="636" rx="12" fill="none" stroke="#d4a553" stroke-width="3"/><circle cx="192" cy="280" r="88" fill="hsl(${(hue + 45) % 360}, 45%, 38%)" opacity="0.85"/><text x="192" y="540" text-anchor="middle" fill="#f6f1ea" font-family="sans-serif" font-size="18">${safeLabel}</text><text x="192" y="575" text-anchor="middle" fill="#a8b5c2" font-family="monospace" font-size="13">Seed ${seed}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
  metadata?: ProjectMetadata;
  sockets: SocketState[];
}

interface JobState {
  status: JobStatus;
  timer: ReturnType<typeof setInterval> | null;
}

interface ComfyQueuedJob {
  prompt_id: string;
  project_path: string;
  socket_id: string;
  request: ComfyGenerateRequest;
  seed_used: number;
  completed: boolean;
}

export interface MockClientOptions {
  /** Simulated IPC latency in ms (default 60). Set 0 for fast tests. */
  latency?: number;
  /** Simulated background-job tick interval in ms (default 80). */
  jobTickMs?: number;
}

function escapeCsvValue(v: string): string {
  if (
    v.includes(",") ||
    v.includes('"') ||
    v.includes("\n") ||
    v.includes("\r")
  ) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

const STATUS_VALUES = new Set([
  "not_started",
  "in_progress",
  "needs_review",
  "done",
]);

function parseStatusValue(input: string): SocketMetadata["status"] | null {
  const clean = input
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "");
  switch (clean) {
    case "notstarted":
    case "todo":
    case "backlog":
    case "queued":
    case "unstarted":
    case "open":
    case "draft":
    case "new":
    case "pending":
    case "0":
    case "":
      return "not_started";
    case "inprogress":
    case "wip":
    case "doing":
    case "working":
    case "started":
    case "active":
    case "development":
    case "1":
      return "in_progress";
    case "needsreview":
    case "review":
    case "inreview":
    case "underreview":
    case "feedback":
    case "qa":
    case "audit":
    case "check":
    case "testing":
    case "2":
      return "needs_review";
    case "done":
    case "complete":
    case "completed":
    case "finished":
    case "ready":
    case "shipped":
    case "final":
    case "closed":
    case "passed":
    case "3":
      return "done";
    default:
      return null;
  }
}

export class MockBackendClient implements BackendClient {
  private projects = new Map<string, ProjectState>();
  private jobs = new Map<string, JobState>();
  private comfyJobs = new Map<string, ComfyQueuedJob>();
  private comfyHistory: ComfyHistoryItem[] = [
    {
      prompt_id: "comfy_hist_1",
      filename: "ComfyUI_00101_The_Fool.png",
      subfolder: "Cartouche",
      folder_type: "output",
      preview_url: makeSvgPreviewDataUri("00 - The Fool", 814201),
      positive_prompt:
        "A young traveler stepping toward a sunlit cliff edge with a white dog, woodcut tarot illustration, gold leaf accents",
      negative_prompt: "blurry, watermark, text",
      model: "flux1-dev-fp8.safetensors",
      sampler_name: "euler",
      scheduler: "simple",
      steps: 24,
      cfg: 3.5,
      seed: 814201,
      width: 768,
      height: 1344,
    },
    {
      prompt_id: "comfy_hist_2",
      filename: "ComfyUI_00102_The_Magician.png",
      subfolder: "Cartouche",
      folder_type: "output",
      preview_url: makeSvgPreviewDataUri("I - The Magician", 814218),
      positive_prompt:
        "An alchemist before an altar bearing wand, cup, sword, and pentacle, infinity lemniscate overhead, linocut ink texture",
      negative_prompt: "blurry, watermark, text",
      model: "sd_xl_base_1.0.safetensors",
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      steps: 28,
      cfg: 6.5,
      seed: 814218,
      width: 768,
      height: 1344,
    },
  ];
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
      metadata: p.metadata,
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
    metadata?: ProjectMetadata;
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
      if (req.metadata !== undefined) {
        p.metadata = { ...p.metadata, ...req.metadata };
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
    explicitComfyMeta?: ComfyWorkMetadata,
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
    const filename =
      (blob as File)?.name || sourcePath.split(/[\\/]/).pop() || "Untitled";
    let kind = mediaKindForPath(filename);
    if (kind === "other" && blob?.type) {
      if (blob.type.startsWith("image/")) kind = "image";
      else if (blob.type === "application/pdf") kind = "pdf";
      else if (
        blob.type.includes("wordprocessingml") ||
        blob.type.includes("docx")
      )
        kind = "docx";
      else if (blob.type.startsWith("text/")) kind = "text";
    }

    const isImg =
      kind === "image" ||
      IMAGE_EXTS.has(ext(sourcePath)) ||
      (blob?.type ? blob.type.startsWith("image/") : false);

    if (isImg) kind = "image";

    const comfyMeta =
      explicitComfyMeta ??
      (ext(filename) === "png" ? extractPngComfyMetadataFromBytes(bytes) : null);

    if (comfyMeta?.positive_prompt && s.notes.trim() === "") {
      s.notes = comfyMeta.positive_prompt.trim();
    }

    const previewUri = isImg ? (blob ? sourcePath : sourcePath) : null;
    const work: WorkState = {
      id: this.nextId("w"),
      socket_id: s.id,
      title: filename,
      media_kind: kind,
      mime_type: blob?.type || (isImg ? "image/jpeg" : null),
      byte_size: bytes.length,
      sha256: hash,
      preview_uri: previewUri,
      preview_state: isImg ? "ready" : "failed",
      extracted_text_state: TEXT_EXTRACT_EXTS.has(ext(filename))
        ? "pending"
        : "unsupported",
      metadata_json: comfyMeta ? JSON.stringify(comfyMeta) : "{}",
      source_blob: blob,
    };
    s.works.push(work);

    if (comfyMeta) {
      const ledger = s.metadata.provenance_ledger
        ? [...s.metadata.provenance_ledger]
        : [];
      ledger.push({
        id: `prov-${ledger.length + 1}`,
        timestamp: new Date().toISOString(),
        event: "COMFYUI_IMAGE_ATTACHED",
        work_id: work.id,
        asset_filename: work.title,
        sha256_hash: work.sha256,
        byte_size: work.byte_size,
        notes: `ComfyUI metadata extracted (Model: ${comfyMeta.model || "unknown"}, Sampler: ${comfyMeta.sampler_name || "default"}, Seed: ${comfyMeta.seed ?? "n/a"})`,
      });
      s.metadata.provenance_ledger = ledger;
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

  moveWork(req: {
    project_path: string;
    source_socket_id: string;
    target_socket_id: string;
    work_id: string;
  }): Promise<Project> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const source = this.socketOrThrow(p, req.source_socket_id);
      if (source.locked)
        throw err("LOCKED", "Source socket is locked", {
          socket_id: source.id,
        });
      const target = this.socketOrThrow(p, req.target_socket_id);
      if (target.locked)
        throw err("LOCKED", "Target socket is locked", {
          socket_id: target.id,
        });

      const wIdx = source.works.findIndex((x) => x.id === req.work_id);
      if (wIdx < 0)
        throw err(
          "NOT_FOUND",
          `Work ${req.work_id} not found in source socket`,
          {
            work_id: req.work_id,
          },
        );

      const [work] = source.works.splice(wIdx, 1);
      target.works.push(work);

      if (source.selected_work_id === req.work_id) {
        source.selected_work_id = null;
      }
      if (target.selected_work_id === null) {
        target.selected_work_id = work.id;
      }

      return this.toProject(p);
    });
  }

  openInExternalEditor(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<OpenExternalEditorResult> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      const w = s.works.find((x) => x.id === req.work_id);
      if (!w)
        throw err("NOT_FOUND", `Work ${req.work_id} not found`, {
          work_id: req.work_id,
        });

      const now = new Date().toISOString();
      const ledger = s.metadata.provenance_ledger
        ? [...s.metadata.provenance_ledger]
        : [];
      ledger.push({
        id: `prov-${ledger.length + 1}`,
        timestamp: now,
        event: "EXTERNAL_EDIT_OPENED",
        work_id: w.id,
        asset_filename: w.title,
        sha256_hash: w.sha256 || "mock-hash",
        byte_size: w.byte_size,
        notes: "File opened in external image editor",
      });
      s.metadata.provenance_ledger = ledger;

      return {
        path: `/mock/path/.tarot/assets/${w.id}_${w.title}`,
        work_id: w.id,
        original_sha256: w.sha256 || "mock-hash",
        message:
          "Opened in external editor. Save your changes and click 'Sync External Edits' to commit into the .crtch bundle.",
      };
    });
  }

  syncExternalEdits(req: {
    project_path: string;
    socket_id: string;
    work_id: string;
  }): Promise<SyncExternalEditsResult> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      const w = s.works.find((x) => x.id === req.work_id);
      if (!w)
        throw err("NOT_FOUND", `Work ${req.work_id} not found`, {
          work_id: req.work_id,
        });

      const oldSha = w.sha256 || "mock-hash-v1";
      const newSha = `mock-sha256-mod-${Date.now().toString(16)}`;
      w.sha256 = newSha;
      w.byte_size = (w.byte_size || 1024) + 128;

      const now = new Date().toISOString();
      const ledger = s.metadata.provenance_ledger
        ? [...s.metadata.provenance_ledger]
        : [];
      ledger.push({
        id: `prov-${ledger.length + 1}`,
        timestamp: now,
        event: "EXTERNAL_EDIT_COMMITTED",
        work_id: w.id,
        asset_filename: w.title,
        previous_sha256: oldSha,
        sha256_hash: newSha,
        byte_size: w.byte_size,
        byte_size_delta: 128,
        notes: "External image editor modifications committed to .crtch bundle",
      });
      s.metadata.provenance_ledger = ledger;

      return {
        modified: true,
        socket: this.toSocket(s),
        old_sha256: oldSha,
        new_sha256: newSha,
        message:
          "External edits successfully synced. Cryptographic SHA-256 hash recorded in forensic ledger.",
      };
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
        let target: SocketState;
        if (req.mode === "update") {
          if (rowIndex >= p.sockets.length) {
            const newSocket: SocketState = {
              id: String(++this.idCounter),
              position: p.sockets.length,
              title: "",
              notes: "",
              locked: false,
              selected_work_id: null,
              works: [],
              metadata: {
                status: "not_started",
                medium: "",
                tags: "",
                due_date: null,
                author_override: "",
                license_override: "",
              },
            };
            p.sockets.push(newSocket);
          }
          target = p.sockets[rowIndex];
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
          if (cursor >= p.sockets.length) {
            const newSocket: SocketState = {
              id: String(++this.idCounter),
              position: p.sockets.length,
              title: "",
              notes: "",
              locked: false,
              selected_work_id: null,
              works: [],
              metadata: {
                status: "not_started",
                medium: "",
                tags: "",
                due_date: null,
                author_override: "",
                license_override: "",
              },
            };
            p.sockets.push(newSocket);
          }
          target = p.sockets[cursor];
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
          const raw = (row[statusIdx] ?? "").trim();
          if (raw !== "") {
            const canonical = parseStatusValue(raw);
            if (!canonical) {
              warnings.push({
                row: rowIndex + 1,
                reason: `Invalid status '${raw}' — row skipped`,
                code: "ROW_VALIDATION_ERROR",
              });
              return false;
            }
            meta.status = canonical;
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

  exportCsv(projectPath: string): Promise<string> {
    return this.ipc(() => {
      const p = this.getOrThrow(projectPath);
      let csv = "title,status,medium,tags,due_date,author,license,notes\n";
      for (const s of p.sockets) {
        const title = escapeCsvValue(s.title);
        const status = escapeCsvValue(s.metadata.status);
        const medium = escapeCsvValue(s.metadata.medium);
        const tags = escapeCsvValue(s.metadata.tags);
        const dueDate = escapeCsvValue(s.metadata.due_date ?? "");
        const author = escapeCsvValue(s.metadata.author_override ?? "");
        const license = escapeCsvValue(s.metadata.license_override ?? "");
        const notes = escapeCsvValue(s.notes);
        csv += `${title},${status},${medium},${tags},${dueDate},${author},${license},${notes}\n`;
      }
      return csv;
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

  importProject(req: {
    package_path: string;
    destination_path: string;
  }): Promise<Project> {
    return this.ipc(() => {
      const existing = this.projects.get(req.destination_path);
      if (existing) {
        return this.toProject(existing);
      }
      const name =
        req.package_path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.(crtch|tarot|zip)$/, "") || "Imported Deck";
      return this.createProject({
        name,
        socket_count: 12,
        project_path: req.destination_path,
      });
    });
  }

  repairScan(req: { project_path: string }): Promise<RepairScanResult> {
    return this.ipc(() => {
      this.getOrThrow(req.project_path);
      return { missing_assets: [], orphans: [] };
    });
  }

  // ComfyUI Collaboration Bridge
  private resolveComfyUrl(host: string | undefined, path: string): string {
    const cleanHost = (host || "http://127.0.0.1:8188")
      .trim()
      .replace(/\/+$/, "");
    if (
      typeof window !== "undefined" &&
      (cleanHost.includes("127.0.0.1:8188") ||
        cleanHost.includes("localhost:8188"))
    ) {
      return `/__comfy_proxy${path}`;
    }
    return `${cleanHost}${path}`;
  }

  getComfyServerInfo(host?: string): Promise<ComfyServerInfo> {
    return this.ipc(async () => {
      const cleanHost = host?.trim() || "http://127.0.0.1:8188";
      if (this.latency > 0 && typeof fetch === "function") {
        try {
          const models: string[] = [];
          let samplers = [
            "euler",
            "euler_ancestral",
            "dpmpp_2m",
            "dpmpp_2m_sde",
            "dpmpp_sde",
            "uni_pc",
            "heun",
            "ddim",
          ];
          let schedulers = [
            "normal",
            "karras",
            "exponential",
            "sgm_uniform",
            "simple",
            "beta",
          ];

          const ckptRes = await fetch(
            this.resolveComfyUrl(
              cleanHost,
              "/object_info/CheckpointLoaderSimple",
            ),
          );
          if (ckptRes.ok) {
            const ckptJson = (await ckptRes.json()) as Record<string, unknown>;
            const ckptNode = ckptJson.CheckpointLoaderSimple as
              | {
                  input?: {
                    required?: { ckpt_name?: [string[]] };
                  };
                }
              | undefined;
            const ckpts = ckptNode?.input?.required?.ckpt_name?.[0] ?? [];
            for (const c of ckpts) {
              const lower = c.toLowerCase();
              if (
                !lower.endsWith(".bin") &&
                !lower.includes("sdpose") &&
                !lower.includes("_lora")
              ) {
                models.push(c);
              }
            }
          }

          const unetRes = await fetch(
            this.resolveComfyUrl(cleanHost, "/object_info/UNETLoader"),
          );
          if (unetRes.ok) {
            const unetJson = (await unetRes.json()) as Record<string, unknown>;
            const unetNode = unetJson.UNETLoader as
              | {
                  input?: {
                    required?: { unet_name?: [string[]] };
                  };
                }
              | undefined;
            const unets = unetNode?.input?.required?.unet_name?.[0] ?? [];
            for (const u of unets) {
              const lower = u.toLowerCase();
              if (
                !lower.endsWith(".bin") &&
                !lower.includes("sdpose") &&
                !lower.includes("_lora") &&
                !models.includes(u)
              ) {
                models.push(u);
              }
            }
          }

          const ksRes = await fetch(
            this.resolveComfyUrl(cleanHost, "/object_info/KSampler"),
          );
          if (ksRes.ok) {
            const ksJson = (await ksRes.json()) as Record<string, unknown>;
            const ksNode = ksJson.KSampler as
              | {
                  input?: {
                    required?: {
                      sampler_name?: [string[]];
                      scheduler?: [string[]];
                    };
                  };
                }
              | undefined;
            if (ksNode?.input?.required?.sampler_name?.[0]?.length) {
              samplers = ksNode.input.required.sampler_name[0];
            }
            if (ksNode?.input?.required?.scheduler?.[0]?.length) {
              schedulers = ksNode.input.required.scheduler[0];
            }
          }

          if (ckptRes.ok || unetRes.ok) {
            return {
              host: cleanHost,
              online: true,
              models,
              samplers,
              schedulers,
              active_workflow: null,
              error: null,
            };
          }
        } catch {
          /* Fall back when ComfyUI is unreachable */
        }
      }

      return {
        host: cleanHost,
        online: true,
        models: [
          "sd_xl_base_1.0.safetensors",
          "flux1-dev-fp8.safetensors",
          "juggernautXL_v9.safetensors",
          "v1-5-pruned-emaonly.safetensors",
        ],
        samplers: [
          "euler",
          "euler_ancestral",
          "dpmpp_2m",
          "dpmpp_2m_sde",
          "dpmpp_sde",
          "uni_pc",
          "heun",
          "ddim",
        ],
        schedulers: [
          "normal",
          "karras",
          "exponential",
          "sgm_uniform",
          "simple",
          "beta",
        ],
        active_workflow: {
          has_active_workflow: true,
          pos_prompt_node: "2",
          neg_prompt_node: "3",
          ksampler_nodes: ["5"],
          save_image_nodes: ["7"],
          checkpoint_node: "1",
        },
        error: null,
      };
    });
  }

  queueComfySocket(req: {
    project_path: string;
    socket_id: string;
    request: ComfyGenerateRequest;
  }): Promise<ComfyQueueResponse> {
    return this.ipc(async () => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      if (s.locked) {
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      }
      const prompt = req.request.prompt.trim();
      if (!prompt) {
        throw err(
          "VALIDATION_ERROR",
          "Prompt cannot be empty for ComfyUI generation",
        );
      }

      if (req.request.sync_prompt_to_notes !== false && s.notes !== prompt) {
        s.notes = prompt;
      }

      const seedUsed =
        req.request.seed ?? Math.floor(100000 + Math.random() * 900000000);

      // In live browser mode (latency > 0), submit directly to live ComfyUI
      if (this.latency > 0 && typeof fetch === "function") {
        const info = await this.getComfyServerInfo(req.request.host);
        let selectedModel =
          req.request.model?.trim() || "sd_xl_base_1.0.safetensors";
        if (info.models.length > 0 && !info.models.includes(selectedModel)) {
          selectedModel = info.models[0];
        }

        const width = Math.max(
          256,
          Math.min(2048, Math.floor((req.request.width || 768) / 8) * 8),
        );
        const height = Math.max(
          256,
          Math.min(2048, Math.floor((req.request.height || 1344) / 8) * 8),
        );
        const batchSize = Math.max(
          1,
          Math.min(8, req.request.batch_size || 1),
        );
        const steps = Math.max(1, Math.min(150, req.request.steps || 20));
        const cfg = Math.max(0, Math.min(30, req.request.cfg ?? 7.0));
        const samplerName = req.request.sampler_name || "euler";
        const scheduler = req.request.scheduler || "normal";
        const negPrompt =
          req.request.negative_prompt ??
          "blurry, low quality, watermark, signature, ugly, deformed";
        const prefix = `${p.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "Cartouche"}/card_${String(s.position + 1).padStart(2, "0")}`;

        const lowerModel = selectedModel.toLowerCase();
        const isFluxUnet =
          lowerModel.includes("flux") || lowerModel.includes("pulsar");

        const workflow: Record<string, unknown> = isFluxUnet
          ? {
              "1": {
                class_type: "UNETLoader",
                inputs: {
                  unet_name: selectedModel,
                  weight_dtype: "fp8_e4m3fn",
                },
              },
              "10": {
                class_type: "DualCLIPLoader",
                inputs: {
                  clip_name1: "clip_l.safetensors",
                  clip_name2: "t5xxl_fp8_e4m3fn.safetensors",
                  type: "flux",
                },
              },
              "11": {
                class_type: "VAELoader",
                inputs: { vae_name: "ae.safetensors" },
              },
              "2": {
                class_type: "CLIPTextEncode",
                inputs: { text: prompt, clip: ["10", 0] },
              },
              "3": {
                class_type: "CLIPTextEncode",
                inputs: { text: negPrompt, clip: ["10", 0] },
              },
              "4": {
                class_type: "EmptySD3LatentImage",
                inputs: { width, height, batch_size: batchSize },
              },
              "5": {
                class_type: "KSampler",
                inputs: {
                  seed: seedUsed,
                  steps,
                  cfg,
                  sampler_name: samplerName,
                  scheduler,
                  denoise: 1.0,
                  model: ["1", 0],
                  positive: ["2", 0],
                  negative: ["3", 0],
                  latent_image: ["4", 0],
                },
              },
              "6": {
                class_type: "VAEDecode",
                inputs: { samples: ["5", 0], vae: ["11", 0] },
              },
              "7": {
                class_type: "SaveImage",
                inputs: { filename_prefix: prefix, images: ["6", 0] },
              },
            }
          : {
              "1": {
                class_type: "CheckpointLoaderSimple",
                inputs: { ckpt_name: selectedModel },
              },
              "2": {
                class_type: "CLIPTextEncode",
                inputs: { text: prompt, clip: ["1", 1] },
              },
              "3": {
                class_type: "CLIPTextEncode",
                inputs: { text: negPrompt, clip: ["1", 1] },
              },
              "4": {
                class_type: "EmptyLatentImage",
                inputs: { width, height, batch_size: batchSize },
              },
              "5": {
                class_type: "KSampler",
                inputs: {
                  seed: seedUsed,
                  steps,
                  cfg,
                  sampler_name: samplerName,
                  scheduler,
                  denoise: 1.0,
                  model: ["1", 0],
                  positive: ["2", 0],
                  negative: ["3", 0],
                  latent_image: ["4", 0],
                },
              },
              "6": {
                class_type: "VAEDecode",
                inputs: { samples: ["5", 0], vae: ["1", 2] },
              },
              "7": {
                class_type: "SaveImage",
                inputs: { filename_prefix: prefix, images: ["6", 0] },
              },
            };

        const postRes = await fetch(
          this.resolveComfyUrl(req.request.host, "/prompt"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: workflow,
              client_id: "cartouche-desktop",
            }),
          },
        );
        if (!postRes.ok) {
          const errText = await postRes.text();
          throw err(
            "INTERNAL_ERROR",
            `ComfyUI rejected prompt (${postRes.status}): ${errText}`,
          );
        }
        const postJson = (await postRes.json()) as { prompt_id?: string };
        const realPromptId = postJson.prompt_id || this.nextId("comfy_prompt");
        const resolvedReq = { ...req.request, model: selectedModel };

        this.comfyJobs.set(realPromptId, {
          prompt_id: realPromptId,
          project_path: req.project_path,
          socket_id: req.socket_id,
          request: resolvedReq,
          seed_used: seedUsed,
          completed: false,
        });

        return {
          prompt_id: realPromptId,
          socket_id: s.id,
          seed_used: seedUsed,
          effective_prompt: prompt,
        };
      }

      const promptId = this.nextId("comfy_prompt");
      const mockSeed =
        req.request.seed ?? 100000 + s.position * 17 + this.idCounter;

      this.comfyJobs.set(promptId, {
        prompt_id: promptId,
        project_path: req.project_path,
        socket_id: req.socket_id,
        request: req.request,
        seed_used: mockSeed,
        completed: false,
      });

      return {
        prompt_id: promptId,
        socket_id: s.id,
        seed_used: mockSeed,
        effective_prompt: prompt,
      };
    });
  }

  pollComfyPrompt(req: {
    project_path: string;
    socket_id: string;
    prompt_id: string;
    host?: string;
    auto_select_winner?: boolean;
  }): Promise<ComfyPollResponse> {
    return this.ipc(async () => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      const job = this.comfyJobs.get(req.prompt_id);
      if (!job) {
        throw err("NOT_FOUND", `ComfyUI prompt ${req.prompt_id} not found`);
      }

      // Live browser mode: poll actual ComfyUI /history/{prompt_id}
      if (this.latency > 0 && typeof fetch === "function") {
        const histRes = await fetch(
          this.resolveComfyUrl(req.host, `/history/${req.prompt_id}`),
        );
        if (!histRes.ok) {
          return {
            prompt_id: req.prompt_id,
            status: "running",
            works_added: 0,
            socket: null,
            message: "Waiting for ComfyUI execution...",
          };
        }
        const histJson = (await histRes.json()) as Record<
          string,
          {
            status?: { status_str?: string };
            outputs?: Record<
              string,
              {
                images?: Array<{
                  filename: string;
                  subfolder?: string;
                  type?: string;
                }>;
              }
            >;
          }
        >;
        const entry = histJson[req.prompt_id];
        if (!entry) {
          return {
            prompt_id: req.prompt_id,
            status: "running",
            works_added: 0,
            socket: null,
            message: "ComfyUI is generating...",
          };
        }
        if (entry.status?.status_str === "error") {
          return {
            prompt_id: req.prompt_id,
            status: "failed",
            works_added: 0,
            socket: null,
            message: "ComfyUI workflow execution failed",
          };
        }

        const images: Array<{
          filename: string;
          subfolder: string;
          type: string;
        }> = [];
        for (const nodeOut of Object.values(entry.outputs || {})) {
          for (const img of nodeOut.images || []) {
            if ((img.type || "output") !== "temp") {
              images.push({
                filename: img.filename,
                subfolder: img.subfolder || "",
                type: img.type || "output",
              });
            }
          }
        }
        if (images.length === 0) {
          return {
            prompt_id: req.prompt_id,
            status: "running",
            works_added: 0,
            socket: null,
            message: "Rendering in ComfyUI...",
          };
        }

        let added = 0;
        if (!job.completed) {
          job.completed = true;
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const itemSeed = job.seed_used + i;
            const viewPath = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
            const previewUrl = this.resolveComfyUrl(req.host, viewPath);

            const meta: ComfyWorkMetadata = {
              source: "comfyui",
              positive_prompt: job.request.prompt,
              negative_prompt: job.request.negative_prompt ?? "",
              model: job.request.model,
              sampler_name: job.request.sampler_name,
              scheduler: job.request.scheduler,
              steps: job.request.steps,
              cfg: job.request.cfg,
              seed: itemSeed,
              width: job.request.width,
              height: job.request.height,
              prompt_id: job.prompt_id,
            };

            const work: WorkState = {
              id: this.nextId("w"),
              socket_id: s.id,
              title: img.filename,
              media_kind: "image",
              mime_type: "image/png",
              byte_size: 262144,
              sha256: `comfy-${job.prompt_id}-${i}`,
              preview_uri: previewUrl,
              preview_state: "ready",
              extracted_text_state: "unsupported",
              metadata_json: JSON.stringify(meta),
              source_blob: null,
            };
            s.works.push(work);
            added++;
          }

          if (
            req.auto_select_winner &&
            s.selected_work_id === null &&
            s.works.length > 0
          ) {
            s.selected_work_id = s.works[s.works.length - 1].id;
          }
        }

        return {
          prompt_id: req.prompt_id,
          status: "done",
          works_added: added,
          socket: this.toSocket(s),
          message: `Generated ${added} image(s) from ComfyUI`,
        };
      }

      const batchSize = Math.max(1, Math.min(8, job.request.batch_size || 1));
      let added = 0;

      if (!job.completed) {
        job.completed = true;
        for (let i = 0; i < batchSize; i++) {
          const itemSeed = job.seed_used + i;
          const filename = `ComfyUI_${String(s.position + 1).padStart(2, "0")}_${i + 1}.png`;
          const previewUri = makeSvgPreviewDataUri(
            s.title || `Socket ${s.position + 1}`,
            itemSeed,
          );
          const meta: ComfyWorkMetadata = {
            source: "comfyui",
            positive_prompt: job.request.prompt,
            negative_prompt: job.request.negative_prompt ?? "",
            model: job.request.model,
            sampler_name: job.request.sampler_name,
            scheduler: job.request.scheduler,
            steps: job.request.steps,
            cfg: job.request.cfg,
            seed: itemSeed,
            width: job.request.width,
            height: job.request.height,
            prompt_id: job.prompt_id,
          };

          const work: WorkState = {
            id: this.nextId("w"),
            socket_id: s.id,
            title: filename,
            media_kind: "image",
            mime_type: "image/png",
            byte_size: 4096 + i * 128,
            sha256: `comfy-${job.prompt_id}-${i}`,
            preview_uri: previewUri,
            preview_state: "ready",
            extracted_text_state: "unsupported",
            metadata_json: JSON.stringify(meta),
            source_blob: null,
          };
          s.works.push(work);
          added++;

          // Record in mock ComfyUI history
          this.comfyHistory.unshift({
            prompt_id: job.prompt_id,
            filename,
            subfolder: p.name.replace(/\s+/g, "_"),
            folder_type: "output",
            preview_url: previewUri,
            positive_prompt: job.request.prompt,
            negative_prompt: job.request.negative_prompt ?? "",
            model: job.request.model,
            sampler_name: job.request.sampler_name,
            scheduler: job.request.scheduler,
            steps: job.request.steps,
            cfg: job.request.cfg,
            seed: itemSeed,
            width: job.request.width,
            height: job.request.height,
          });
        }

        const ledger = s.metadata.provenance_ledger
          ? [...s.metadata.provenance_ledger]
          : [];
        const latestWork = s.works[s.works.length - 1];
        if (latestWork) {
          ledger.push({
            id: `prov-${ledger.length + 1}`,
            timestamp: new Date().toISOString(),
            event: "COMFYUI_IMAGE_ATTACHED",
            work_id: latestWork.id,
            asset_filename: latestWork.title,
            sha256_hash: latestWork.sha256,
            byte_size: latestWork.byte_size,
            notes: `Generated ${added} image(s) via ComfyUI (Model: ${job.request.model}, Sampler: ${job.request.sampler_name})`,
          });
          s.metadata.provenance_ledger = ledger;
        }

        if (
          req.auto_select_winner &&
          s.selected_work_id === null &&
          s.works.length > 0
        ) {
          s.selected_work_id = s.works[s.works.length - 1].id;
        }
      }

      return {
        prompt_id: req.prompt_id,
        status: "done",
        works_added: added,
        socket: this.toSocket(s),
        message: `Imported ${added} generated image(s) from ComfyUI`,
      };
    });
  }

  listComfyHistory(req?: {
    host?: string;
    limit?: number;
  }): Promise<ComfyHistoryItem[]> {
    return this.ipc(async () => {
      const limit = req?.limit ?? 20;
      if (this.latency > 0 && typeof fetch === "function") {
        try {
          const res = await fetch(
            this.resolveComfyUrl(req?.host, `/history?max_items=${limit}`),
          );
          if (res.ok) {
            const histObj = (await res.json()) as Record<
              string,
              {
                prompt?: unknown[];
                outputs?: Record<
                  string,
                  {
                    images?: Array<{
                      filename: string;
                      subfolder?: string;
                      type?: string;
                    }>;
                  }
                >;
              }
            >;
            const items: ComfyHistoryItem[] = [];
            for (const [promptId, entry] of Object.entries(histObj)) {
              const wf =
                Array.isArray(entry.prompt) &&
                entry.prompt.length >= 3 &&
                typeof entry.prompt[2] === "object"
                  ? (entry.prompt[2] as Record<
                      string,
                      { class_type?: string; inputs?: Record<string, unknown> }
                    >)
                  : {};
              let posPrompt = "";
              let negPrompt = "";
              let model = "";
              let samplerName = "euler";
              let scheduler = "normal";
              let steps = 20;
              let cfg = 7.0;
              let seed = 0;
              let width = 768;
              let height = 1344;

              for (const node of Object.values(wf)) {
                const inputs = node?.inputs || {};
                if (
                  node?.class_type === "CLIPTextEncode" &&
                  typeof inputs.text === "string"
                ) {
                  if (!posPrompt) posPrompt = inputs.text;
                  else if (!negPrompt) negPrompt = inputs.text;
                }
                if (
                  typeof inputs.ckpt_name === "string" ||
                  typeof inputs.unet_name === "string"
                ) {
                  model = String(inputs.ckpt_name || inputs.unet_name);
                }
                if (node?.class_type?.includes("KSampler")) {
                  if (typeof inputs.sampler_name === "string")
                    samplerName = inputs.sampler_name;
                  if (typeof inputs.scheduler === "string")
                    scheduler = inputs.scheduler;
                  if (typeof inputs.steps === "number") steps = inputs.steps;
                  if (typeof inputs.cfg === "number") cfg = inputs.cfg;
                  if (typeof inputs.seed === "number") seed = inputs.seed;
                }
                if (
                  typeof inputs.width === "number" &&
                  typeof inputs.height === "number"
                ) {
                  width = inputs.width;
                  height = inputs.height;
                }
              }

              for (const nodeOut of Object.values(entry.outputs || {})) {
                for (const img of nodeOut.images || []) {
                  const ftype = img.type || "output";
                  if (ftype === "temp") continue;
                  const subfolder = img.subfolder || "";
                  const viewPath = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(ftype)}`;
                  items.push({
                    prompt_id: promptId,
                    filename: img.filename,
                    subfolder,
                    folder_type: ftype,
                    preview_url: this.resolveComfyUrl(req?.host, viewPath),
                    positive_prompt: posPrompt,
                    negative_prompt: negPrompt,
                    model,
                    sampler_name: samplerName,
                    scheduler,
                    steps,
                    cfg,
                    seed,
                    width,
                    height,
                  });
                }
              }
            }
            if (items.length > 0) {
              this.comfyHistory = items;
              return items.slice(0, limit);
            }
          }
        } catch {
          /* ignore */
        }
      }
      return this.comfyHistory.slice(0, limit);
    });
  }

  importComfyHistoryItem(req: {
    project_path: string;
    socket_id: string;
    host?: string;
    filename: string;
    subfolder: string;
    folder_type: string;
    prompt_override?: string;
    overwrite_socket_notes?: boolean;
  }): Promise<Socket> {
    return this.ipc(() => {
      const p = this.getOrThrow(req.project_path);
      const s = this.socketOrThrow(p, req.socket_id);
      if (s.locked) {
        throw err("LOCKED", "Socket is locked", { socket_id: s.id });
      }

      const histItem = this.comfyHistory.find(
        (h) => h.filename === req.filename,
      );
      const promptText =
        req.prompt_override?.trim() ||
        histItem?.positive_prompt ||
        "Imported from ComfyUI";

      const meta: ComfyWorkMetadata = {
        source: "comfyui",
        positive_prompt: promptText,
        negative_prompt: histItem?.negative_prompt ?? "",
        model: histItem?.model ?? "flux1-dev-fp8.safetensors",
        sampler_name: histItem?.sampler_name ?? "euler",
        scheduler: histItem?.scheduler ?? "normal",
        steps: histItem?.steps ?? 20,
        cfg: histItem?.cfg ?? 7.0,
        seed: histItem?.seed ?? 1001,
        width: histItem?.width ?? 768,
        height: histItem?.height ?? 1344,
        prompt_id: histItem?.prompt_id ?? "comfy_import",
      };

      const work: WorkState = {
        id: this.nextId("w"),
        socket_id: s.id,
        title: req.filename,
        media_kind: "image",
        mime_type: "image/png",
        byte_size: 8192,
        sha256: `comfy-hist-${Date.now().toString(16)}`,
        preview_uri:
          histItem?.preview_url ||
          makeSvgPreviewDataUri(req.filename, meta.seed ?? 1001),
        preview_state: "ready",
        extracted_text_state: "unsupported",
        metadata_json: JSON.stringify(meta),
        source_blob: null,
      };
      s.works.push(work);

      if (
        (req.overwrite_socket_notes !== false || s.notes.trim() === "") &&
        promptText
      ) {
        s.notes = promptText;
      }

      const ledger = s.metadata.provenance_ledger
        ? [...s.metadata.provenance_ledger]
        : [];
      ledger.push({
        id: `prov-${ledger.length + 1}`,
        timestamp: new Date().toISOString(),
        event: "COMFYUI_IMAGE_ATTACHED",
        work_id: work.id,
        asset_filename: work.title,
        sha256_hash: work.sha256,
        byte_size: work.byte_size,
        notes: `Imported from ComfyUI history (${meta.model}, Seed ${meta.seed})`,
      });
      s.metadata.provenance_ledger = ledger;

      return this.toSocket(s);
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
