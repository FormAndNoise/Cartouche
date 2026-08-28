/**
 * Typed wrappers over the Tauri IPC command surface (US-B01, US-B02, US-B03).
 *
 * Re-exports domain types and functions from `src/api/` for backwards compatibility,
 * while maintaining low-level typed wrappers over `@tauri-apps/api/core`.
 */

import { invoke } from "@tauri-apps/api/core";

export { invoke };

export type {
 Socket,
 Project,
 SocketMetadata,
 Work,
 MediaKind,
 SocketStatus,
 ApiErrorEnvelope,
 CreateProjectRequest,
 UpdateSocketRequest,
} from "../api/types";
export { ApiError } from "../api/types";

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

import { ApiError, type Project, type Socket } from "../api/types";

/**
 * Normalize any rejection from `invoke` into an `ApiError`.
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

// --- Project commands ---

export function createProject(req: {
 name: string;
 socketCount: number;
 projectPath: string;
}): Promise<Project> {
 return call<Project>("create_project", { ...req });
}

export function getProject(projectPath: string): Promise<Project> {
 return call<Project>("get_project", { projectPath });
}

export function updateProject(req: {
 projectPath: string;
 name?: string;
 gridColumns?: number;
}): Promise<Project> {
 return call<Project>("update_project", { ...req });
}

// --- Socket commands ---

export function updateSocket(req: {
 projectPath: string;
 socketId: number | string;
 title?: string;
 notes?: string;
 metadata?: Record<string, unknown>;
}): Promise<Socket> {
 return call<Socket>("update_socket", { ...req });
}

export function setSocketLock(req: {
 projectPath: string;
 socketId: number | string;
 locked: boolean;
}): Promise<Socket> {
 return call<Socket>("set_socket_lock", { ...req });
}

export function reorderSockets(req: {
 projectPath: string;
 orderedSocketIds: (number | string)[];
}): Promise<Project> {
 return call<Project>("reorder_sockets", { ...req });
}

export function archiveSocket(req: {
 projectPath: string;
 socketId: number | string;
}): Promise<void> {
 return call<void>("archive_socket", { ...req });
}

export function selectWinner(req: {
 projectPath: string;
 socketId: number | string;
 workId: number | string | null;
}): Promise<Socket> {
 return call<Socket>("select_winner", { ...req });
}
