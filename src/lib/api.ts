/**
 * Typed wrappers over the Tauri IPC command surface (US-B01, US-B02, US-B03).
 *
 * Components import from `@/lib/api` rather than reaching into
 * `@tauri-apps/api` directly. Command names, argument mapping (camelCase
 * here, snake_case on the Rust side), and the error envelope follow
 * docs/api.md and ARCHITECTURE.md §4-5.
 */

import { invoke } from "@tauri-apps/api/core";

export { invoke };

/** Wire format of a socket row, mirroring the Rust `Socket` model. */
export interface Socket {
  id: number;
  position: number;
  title: string;
  notes: string;
  metadata_json: string;
  locked: boolean;
  selected_work_id: number | null;
}

/** Wire format of a project, mirroring the Rust `Project` model. */
export interface Project {
  name: string;
  path: string;
  grid_columns: number;
  sockets: Socket[];
}

/**
 * Error codes the backend can return (fixed enum, ARCHITECTURE.md §4).
 * The UI matches on these instead of parsing free-form messages.
 */
export type ApiErrorCode =
  | "INVALID_SOCKET_COUNT"
  | "INVALID_GRID_COLUMNS"
  | "PATH_NOT_WRITABLE"
  | "NOT_FOUND"
  | "PROJECT_CORRUPT"
  | "LOCKED"
  | "SOCKET_NOT_FOUND"
  | "FILE_UNREADABLE"
  | "UNSUPPORTED_FORMAT"
  | "IS_SELECTED"
  | "CONFIRMATION_REQUIRED"
  | "MISSING_REQUIRED_COLUMN"
  | "DUPLICATE_ID"
  | "MISSING_SOCKET"
  | "ASSET_MISSING"
  | "VALIDATION_ERROR"
  | "DATABASE_ERROR"
  | "IO_ERROR"
  | "INTERNAL_ERROR";

/** Structured error envelope returned by every command (US-B09). */
export interface ApiErrorEnvelope {
  code: ApiErrorCode | string;
  message: string;
  details: Record<string, unknown> | null;
}

/** Error thrown by every wrapper in this module. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = "ApiError";
    this.code = envelope.code;
    this.details = envelope.details;
  }
}

/**
 * Normalize any rejection from `invoke` into an `ApiError`. Tauri rejects
 * with the serialized `{code, message, details}` envelope; anything else
 * (e.g. no backend under plain Vite) maps to `INTERNAL_ERROR` so the UI
 * never sees an unstructured failure.
 */
export function normalizeApiError(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }
  if (e && typeof e === "object") {
    const outer = e as Record<string, unknown>;
    const inner = (outer.error ?? outer) as Record<string, unknown>;
    if (typeof inner.code === "string" && typeof inner.message === "string") {
      return new ApiError({
        code: inner.code,
        message: inner.message,
        details: (inner.details as Record<string, unknown> | null) ?? null,
      });
    }
    if (typeof outer.message === "string") {
      return new ApiError({
        code: "INTERNAL_ERROR",
        message: outer.message,
        details: null,
      });
    }
  }
  return new ApiError({
    code: "INTERNAL_ERROR",
    message: String(e),
    details: null,
  });
}

async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw normalizeApiError(e);
  }
}

// --- Project commands (T-06, US-B02) ---

export interface CreateProjectRequest {
  name: string;
  socketCount: number;
  projectPath: string;
}

/** Create a `.tarot` project with a fixed number of ordered sockets. */
export function createProject(req: CreateProjectRequest): Promise<Project> {
  return call<Project>("create_project", { ...req });
}

/** Load an existing project by its directory path. */
export function getProject(projectPath: string): Promise<Project> {
  return call<Project>("get_project", { projectPath });
}

export interface UpdateProjectRequest {
  projectPath: string;
  name?: string;
  gridColumns?: number;
}

/** Rename a project and/or change grid density (1-4 columns). */
export function updateProject(req: UpdateProjectRequest): Promise<Project> {
  return call<Project>("update_project", { ...req });
}

// --- Socket commands (T-07, US-B03) ---

export interface UpdateSocketRequest {
  projectPath: string;
  socketId: number;
  title?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Edit title, notes, or metadata of an unlocked socket. Locked sockets
 * reject content edits with `LOCKED`.
 */
export function updateSocket(req: UpdateSocketRequest): Promise<Socket> {
  return call<Socket>("update_socket", { ...req });
}

/** Lock or unlock a socket. */
export function setSocketLock(req: {
  projectPath: string;
  socketId: number;
  locked: boolean;
}): Promise<Socket> {
  return call<Socket>("set_socket_lock", { ...req });
}

/**
 * Reorder sockets atomically. `orderedSocketIds` must list every socket
 * in the project exactly once (`DUPLICATE_ID` / `MISSING_SOCKET` otherwise).
 */
export function reorderSockets(req: {
  projectPath: string;
  orderedSocketIds: number[];
}): Promise<Project> {
  return call<Project>("reorder_sockets", { ...req });
}

/** Archive (delete) an unlocked socket. */
export function archiveSocket(req: {
  projectPath: string;
  socketId: number;
}): Promise<void> {
  return call<void>("archive_socket", { ...req });
}

/** Select a candidate work as the winner, or pass null to clear. */
export function selectWinner(req: {
  projectPath: string;
  socketId: number;
  workId: number | null;
}): Promise<Socket> {
  return call<Socket>("select_winner", { ...req });
}
