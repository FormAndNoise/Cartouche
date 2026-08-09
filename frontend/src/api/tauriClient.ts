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
import type { BackendClient } from './client';
import {
  ApiError,
  type CreateProjectRequest,
  type CsvPreview,
  type DroppedFilesResult,
  type JobStatus,
  type Project,
  type RepairScanResult,
  type Socket,
  type UpdateSocketRequest,
} from './types';

interface TauriInvoke {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

function getInvoke(): TauriInvoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke['invoke'] } };
  const invoke = w.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? { invoke } : null;
}

export function isTauriAvailable(): boolean {
  return getInvoke() !== null;
}

export class TauriBackendClient implements BackendClient {
  private invoke(): TauriInvoke {
    const t = getInvoke();
    if (!t) {
      throw new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'Tauri bridge unavailable — run inside the desktop app.',
        details: null,
      });
    }
    return t;
  }

  private async call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await this.invoke().invoke<T>(cmd, args);
    } catch (e) {
      throw normalizeError(e);
    }
  }

  createProject(req: CreateProjectRequest) {
    return this.call<Project>('create_project', { ...req });
  }
  getProject(projectPath: string) {
    return this.call<Project>('get_project', { project_path: projectPath });
  }
  updateProject(req: { project_path: string; name?: string; grid_columns?: number }) {
    return this.call<Project>('update_project', { ...req });
  }
  updateSocket(req: { project_path: string; socket_id: string } & UpdateSocketRequest) {
    return this.call<Socket>('update_socket', { ...req });
  }
  setSocketLock(req: { project_path: string; socket_id: string; locked: boolean }) {
    return this.call<Socket>('set_socket_lock', { ...req });
  }
  reorderSockets(req: { project_path: string; ordered_socket_ids: string[] }) {
    return this.call<Project>('reorder_sockets', { ...req });
  }
  selectWinner(req: { project_path: string; socket_id: string; work_id: string | null }) {
    return this.call<Socket>('select_winner', { ...req });
  }
  attachWork(req: { project_path: string; socket_id: string; source_path: string }) {
    return this.call<Socket>('attach_work', { ...req });
  }
  importDroppedFiles(req: { project_path: string; socket_id: string; paths: string[] }) {
    return this.call<DroppedFilesResult>('import_dropped_files', { ...req });
  }
  removeWork(req: { project_path: string; socket_id: string; work_id: string; force?: boolean }) {
    return this.call<Socket>('remove_work', { ...req });
  }
  previewCsv(req: { project_path: string; csv_text: string }) {
    return this.call<CsvPreview>('preview_csv', { ...req });
  }
  importCsv(req: { project_path: string; csv_text: string; mode: 'append' | 'update' }) {
    return this.call<{ job_id: string; rows_total: number }>('import_csv', { ...req });
  }
  getJob(req: { project_path: string; job_id: string }) {
    return this.call<JobStatus>('get_job', { ...req });
  }
  refreshExtractedText(req: { project_path: string; socket_id: string; work_id: string }) {
    return this.call<Socket>('extract_text', { ...req });
  }
  exportProject(req: { project_path: string; destination_path: string }) {
    return this.call<{ path: string; manifest_sha256: string }>('export_project', { ...req });
  }
  repairScan(req: { project_path: string }) {
    return this.call<RepairScanResult>('repair_scan', { ...req });
  }
}

/** Normalize any thrown value into the structured ApiError envelope. */
export function normalizeError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    // Tauri rejects with the envelope directly, or wrapped as {error: {...}}.
    const inner = (o.error ?? o) as Record<string, unknown>;
    if (typeof inner.code === 'string' && typeof inner.message === 'string') {
      return new ApiError({
        code: inner.code,
        message: inner.message,
        details: (inner.details as Record<string, unknown> | null) ?? null,
      });
    }
    if (typeof o.message === 'string') {
      return new ApiError({ code: 'INTERNAL_ERROR', message: o.message, details: null });
    }
  }
  return new ApiError({ code: 'INTERNAL_ERROR', message: String(e), details: null });
}
