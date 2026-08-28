/**
 * Tauri IPC adapter for the BackendClient contract.
 *
 * In the packaged desktop app this is the active client; it forwards every
 * call to the Rust command surface documented in docs/api.md. Outside the
 * Tauri shell (plain `vite dev`, tests) `window.__TAURI_INTERNALS__` is
 * absent and the app falls back to MockBackendClient (see src/api/index.ts).
 *
 * Error mapping: Tauri commands reject with the envelope
 * {code, message, details} (US-B09). Anything else is normalized to
 * INTERNAL_ERROR so the UI never sees an unstructured failure.
 */
import type { BackendClient } from "./client";
import {
 ApiError,
 emptyMetadata,
 emptyProjectMetadata,
 type CreateProjectRequest,
 type CsvPreview,
 type DroppedFilesResult,
 type JobStatus,
 type OpenExternalEditorResult,
 type Project,
 type ProjectMetadata,
 type RepairScanResult,
 type Socket,
 type SocketMetadata,
 type SyncExternalEditsResult,
 type UpdateSocketRequest,
 type Work,
} from "./types";

interface TauriInvoke {
 invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

function getInvoke(): TauriInvoke | null {
 const w = window as unknown as {
 __TAURI_INTERNALS__?: { invoke?: TauriInvoke["invoke"] };
 };
 const invoke = w.__TAURI_INTERNALS__?.invoke;
 return typeof invoke === "function" ? { invoke } : null;
}

export function isTauriAvailable(): boolean {
 return getInvoke() !== null;
}

interface RawWork {
 id: string | number;
 socket_id: string | number;
 title: string;
 media_kind: Work["media_kind"];
 mime_type: string | null;
 byte_size: number;
 sha256: string;
 preview_uri: string | null;
 preview_state: Work["preview_state"];
 extracted_text_state: Work["extracted_text_state"];
 extracted_text?: string;
 metadata_json: string;
}

interface RawSocket {
 id: string | number;
 position: number;
 title: string;
 notes: string;
 metadata_json?: string;
 metadata?: SocketMetadata;
 locked: boolean;
 selected_work_id: string | number | null;
 works?: RawWork[];
}

interface RawProject {
 name: string;
 path: string;
 grid_columns: number;
 metadata_json?: string;
 metadata?: ProjectMetadata;
 sockets: RawSocket[];
}

function toAssetUrl(filePath: string): string {
 if (
 filePath.startsWith("http://") ||
 filePath.startsWith("https://") ||
 filePath.startsWith("blob:") ||
 filePath.startsWith("data:")
 ) {
 return filePath;
 }
 try {
 const w =
 typeof window !== "undefined"
 ? (window as unknown as {
 __TAURI_INTERNALS__?: {
 convertFileSrc?: (path: string, protocol?: string) => string;
 };
 })
 : undefined;
 if (typeof w?.__TAURI_INTERNALS__?.convertFileSrc === "function") {
 return w.__TAURI_INTERNALS__.convertFileSrc(filePath, "asset");
 }
 } catch {
 /* fallback below */
 }
 const normalized = filePath.replace(/\\/g, "/");
 return `http://asset.localhost/${encodeURIComponent(normalized)}`;
}

function normalizeWork(raw: RawWork): Work {
 let previewUri = raw.preview_uri ?? null;
 if (previewUri) {
 previewUri = toAssetUrl(previewUri);
 }
 return {
 ...raw,
 id: String(raw.id),
 socket_id: String(raw.socket_id),
 preview_uri: previewUri,
 metadata_json: raw.metadata_json ?? "{}",
 };
}

function normalizeSocket(raw: RawSocket): Socket {
 let metadata: SocketMetadata = emptyMetadata();
 if (raw.metadata) {
 metadata = { ...emptyMetadata(), ...raw.metadata };
 } else if (raw.metadata_json) {
 try {
 metadata = { ...emptyMetadata(), ...JSON.parse(raw.metadata_json) };
 } catch {
 metadata = emptyMetadata();
 }
 }

 return {
 id: String(raw.id),
 position: raw.position,
 title: raw.title ?? "",
 notes: raw.notes ?? "",
 locked: Boolean(raw.locked),
 metadata,
 selected_work_id:
 raw.selected_work_id !== null && raw.selected_work_id !== undefined
 ? String(raw.selected_work_id)
 : null,
 works: raw.works ? raw.works.map(normalizeWork) : [],
 };
}

function normalizeProject(raw: RawProject): Project {
 let metadata: ProjectMetadata = emptyProjectMetadata();
 if (raw.metadata) {
 metadata = { ...emptyProjectMetadata(), ...raw.metadata };
 } else if (raw.metadata_json) {
 try {
 metadata = {
 ...emptyProjectMetadata(),
 ...JSON.parse(raw.metadata_json),
 };
 } catch {
 metadata = emptyProjectMetadata();
 }
 }

 return {
 name: raw.name,
 path: raw.path,
 grid_columns: raw.grid_columns,
 metadata,
 sockets: raw.sockets ? raw.sockets.map(normalizeSocket) : [],
 };
}

export class TauriBackendClient implements BackendClient {
 private invoke(): TauriInvoke {
 const t = getInvoke();
 if (!t) {
 throw new ApiError({
 code: "INTERNAL_ERROR",
 message: "Tauri bridge unavailable — run inside the desktop app.",
 details: null,
 });
 }
 return t;
 }

 private async call<T>(
 cmd: string,
 args: Record<string, unknown>,
 ): Promise<T> {
 try {
 return await this.invoke().invoke<T>(cmd, args);
 } catch (e) {
 throw normalizeError(e);
 }
 }

 async createProject(req: CreateProjectRequest): Promise<Project> {
 const raw = await this.call<RawProject>("create_project", {
 name: req.name,
 socketCount: req.socket_count,
 projectPath: req.project_path,
 });
 return normalizeProject(raw);
 }

 async getProject(projectPath: string): Promise<Project> {
 const raw = await this.call<RawProject>("get_project", { projectPath });
 return normalizeProject(raw);
 }

 async updateProject(req: {
 project_path: string;
 name?: string;
 grid_columns?: number;
 metadata?: ProjectMetadata;
 }): Promise<Project> {
 const raw = await this.call<RawProject>("update_project", {
 projectPath: req.project_path,
 name: req.name,
 gridColumns: req.grid_columns,
 metadataJson: req.metadata ? JSON.stringify(req.metadata) : undefined,
 });
 return normalizeProject(raw);
 }

 async updateSocket(
 req: { project_path: string; socket_id: string } & UpdateSocketRequest,
 ): Promise<Socket> {
 const raw = await this.call<RawSocket>("update_socket", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 title: req.title,
 notes: req.notes,
 metadataJson: req.metadata ? JSON.stringify(req.metadata) : undefined,
 });
 return normalizeSocket(raw);
 }

 async setSocketLock(req: {
 project_path: string;
 socket_id: string;
 locked: boolean;
 }): Promise<Socket> {
 const raw = await this.call<RawSocket>("set_socket_lock", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 locked: req.locked,
 });
 return normalizeSocket(raw);
 }

 async reorderSockets(req: {
 project_path: string;
 ordered_socket_ids: string[];
 }): Promise<Project> {
 const raw = await this.call<RawProject>("reorder_sockets", {
 projectPath: req.project_path,
 orderedSocketIds: req.ordered_socket_ids.map((id) => Number(id) || id),
 });
 return normalizeProject(raw);
 }

 async selectWinner(req: {
 project_path: string;
 socket_id: string;
 work_id: string | null;
 }): Promise<Socket> {
 const raw = await this.call<RawSocket>("select_winner", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 workId: req.work_id !== null ? Number(req.work_id) || req.work_id : null,
 });
 return normalizeSocket(raw);
 }

 async attachWork(req: {
 project_path: string;
 socket_id: string;
 source_path: string;
 }): Promise<Socket> {
 const raw = await this.call<RawSocket>("attach_work", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 sourcePath: req.source_path,
 });
 return normalizeSocket(raw);
 }

 async importDroppedFiles(req: {
 project_path: string;
 socket_id: string;
 paths: string[];
 }): Promise<DroppedFilesResult> {
 const nativePaths: string[] = [];
 const accepted: Work[] = [];
 const rejected: DroppedFilesResult["rejected"] = [];

 for (const p of req.paths) {
 if (p.startsWith("blob:") || p.startsWith("data:")) {
 try {
 const res = await fetch(p);
 const buf = await res.arrayBuffer();
 const bytes = Array.from(new Uint8Array(buf));
 const name = p.split("/").pop() || "image.png";
 const raw = await this.call<RawSocket>("attach_work_bytes", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 name,
 bytes,
 });
 const updatedSocket = normalizeSocket(raw);
 if (updatedSocket.works.length > 0) {
 accepted.push(updatedSocket.works[updatedSocket.works.length - 1]);
 }
 } catch (e) {
 rejected.push({
 path: p,
 reason: String(e),
 code: "FILE_UNREADABLE",
 });
 }
 } else {
 nativePaths.push(p);
 }
 }

 if (nativePaths.length > 0) {
 const res = await this.call<DroppedFilesResult>("import_dropped_files", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 paths: nativePaths,
 });
 accepted.push(...res.accepted.map(normalizeWork));
 rejected.push(...res.rejected);
 }

 return { accepted, rejected };
 }

 async removeWork(req: {
 project_path: string;
 socket_id: string;
 work_id: string;
 force?: boolean;
 }): Promise<Socket> {
 const raw = await this.call<RawSocket>("remove_work", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 workId: Number(req.work_id) || req.work_id,
 force: req.force,
 });
 return normalizeSocket(raw);
 }

 async moveWork(req: {
 project_path: string;
 source_socket_id: string;
 target_socket_id: string;
 work_id: string;
 }): Promise<Project> {
 const raw = await this.call<RawProject>("move_work", {
 projectPath: req.project_path,
 sourceSocketId: Number(req.source_socket_id) || req.source_socket_id,
 targetSocketId: Number(req.target_socket_id) || req.target_socket_id,
 workId: Number(req.work_id) || req.work_id,
 });
 return normalizeProject(raw);
 }

 async openInExternalEditor(req: {
 project_path: string;
 socket_id: string;
 work_id: string;
 }): Promise<OpenExternalEditorResult> {
 return this.call<OpenExternalEditorResult>("open_in_external_editor", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 workId: Number(req.work_id) || req.work_id,
 });
 }

 async syncExternalEdits(req: {
 project_path: string;
 socket_id: string;
 work_id: string;
 }): Promise<SyncExternalEditsResult> {
 const raw = await this.call<{
 modified: boolean;
 socket: RawSocket;
 old_sha256: string;
 new_sha256: string;
 message: string;
 }>("sync_external_edits", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 workId: Number(req.work_id) || req.work_id,
 });
 return {
 modified: raw.modified,
 socket: normalizeSocket(raw.socket),
 old_sha256: raw.old_sha256,
 new_sha256: raw.new_sha256,
 message: raw.message,
 };
 }

 previewCsv(req: {
 project_path: string;
 csv_text: string;
 }): Promise<CsvPreview> {
 return this.call<CsvPreview>("preview_csv", {
 projectPath: req.project_path,
 csvText: req.csv_text,
 });
 }

 importCsv(req: {
 project_path: string;
 csv_text: string;
 mode: "append" | "update";
 }): Promise<{ job_id: string; rows_total: number }> {
 return this.call<{ job_id: string; rows_total: number }>("import_csv", {
 projectPath: req.project_path,
 csvText: req.csv_text,
 mode: req.mode,
 });
 }

 getJob(req: { project_path: string; job_id: string }): Promise<JobStatus> {
 return this.call<JobStatus>("get_job", {
 projectPath: req.project_path,
 jobId: req.job_id,
 });
 }

 async refreshExtractedText(req: {
 project_path: string;
 socket_id: string;
 work_id: string;
 }): Promise<Socket> {
 const raw = await this.call<RawSocket>("extract_text", {
 projectPath: req.project_path,
 socketId: Number(req.socket_id) || req.socket_id,
 workId: Number(req.work_id) || req.work_id,
 });
 return normalizeSocket(raw);
 }

 async exportCsv(projectPath: string): Promise<string> {
 return this.call<string>("export_csv", {
 projectPath,
 });
 }

 exportProject(req: {
 project_path: string;
 destination_path: string;
 }): Promise<{ path: string; manifest_sha256: string }> {
 return this.call<{ path: string; manifest_sha256: string }>(
 "export_project",
 {
 projectPath: req.project_path,
 destinationPath: req.destination_path,
 },
 );
 }

 async importProject(req: {
 package_path: string;
 destination_path: string;
 }): Promise<Project> {
 const raw = await this.call<RawProject>("import_project", {
 packagePath: req.package_path,
 destinationPath: req.destination_path,
 });
 return normalizeProject(raw);
 }

 repairScan(req: { project_path: string }): Promise<RepairScanResult> {
 return this.call<RepairScanResult>("repair_scan", {
 projectPath: req.project_path,
 });
 }
}

/** Normalize any thrown value into the structured ApiError envelope. */
export function normalizeError(e: unknown): ApiError {
 if (e instanceof ApiError) return e;
 if (e && typeof e === "object") {
 const o = e as Record<string, unknown>;
 const inner = (o.error ?? o) as Record<string, unknown>;
 if (typeof inner.code === "string" && typeof inner.message === "string") {
 return new ApiError({
 code: inner.code,
 message: inner.message,
 details: (inner.details as Record<string, unknown> | null) ?? null,
 });
 }
 if (typeof o.message === "string") {
 return new ApiError({
 code: "INTERNAL_ERROR",
 message: o.message,
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
