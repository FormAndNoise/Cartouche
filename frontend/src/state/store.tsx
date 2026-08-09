/**
 * Board state: a single React context holding the open project, the active
 * backend client, selection, and toasts. All mutations go through the
 * BackendClient contract (never direct state edits for backend-owned data),
 * and every failure is surfaced as a structured toast (US-B09 / US-F01.3).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BackendClient } from '../api/client';
import { getMockClient } from '../api/index';
import {
  ApiError,
  type CreateProjectRequest,
  type Project,
  type Socket,
  type SocketMetadata,
} from '../api/types';

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}

export interface AttachableFile {
  name: string;
  blob: Blob;
}

interface BoardStore {
  client: BackendClient;
  project: Project | null;
  busy: boolean;
  selectorError: ApiError | null;
  selectedSocketId: string | null;
  attachingSockets: ReadonlySet<string>;
  toasts: Toast[];
  csvImportOpen: boolean;

  createProject(req: CreateProjectRequest): Promise<boolean>;
  openProject(path: string): Promise<boolean>;
  closeProject(): void;
  syncProject(): Promise<void>;
  setGridColumns(n: number): Promise<void>;

  setSelectedSocket(id: string | null): void;
  updateSocketFields(
    socketId: string,
    fields: { title?: string; notes?: string; metadata?: SocketMetadata },
  ): Promise<boolean>;
  setSocketLock(socketId: string, locked: boolean): Promise<boolean>;
  selectWinner(socketId: string, workId: string | null): Promise<boolean>;
  removeWork(socketId: string, workId: string, force?: boolean): Promise<boolean>;
  attachFiles(socketId: string, files: AttachableFile[]): Promise<boolean>;

  pushToast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;

  setCsvImportOpen(open: boolean): void;
}

const Ctx = createContext<BoardStore | null>(null);

const RECENT_KEY = 'tarot.recentProjects';

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecent(paths: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(paths.slice(0, 8)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function rememberRecent(path: string): void {
  const list = readRecent().filter((p) => p !== path);
  list.unshift(path);
  writeRecent(list);
}

export function getRecentProjects(): string[] {
  return readRecent();
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return `[${e.code}] ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

let toastCounter = 0;

export function BoardProvider({ client, children }: { client: BackendClient; children: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectorError, setSelectorError] = useState<ApiError | null>(null);
  const [selectedSocketId, setSelectedSocketId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<ReadonlySet<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;
  const previewPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    toastCounter += 1;
    const id = toastCounter;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const applySocket = useCallback((updated: Socket) => {
    setProject((p) =>
      p ? { ...p, sockets: p.sockets.map((s) => (s.id === updated.id ? updated : s)) } : p,
    );
  }, []);

  const syncProject = useCallback(async () => {
    const p = projectRef.current;
    if (!p) return;
    try {
      const fresh = await client.getProject(p.path);
      setProject(fresh);
    } catch {
      /* keep stale view; sync is best-effort */
    }
  }, [client]);

  /** Poll a few times so async preview/extraction jobs become visible (US-B07). */
  const startPreviewPolling = useCallback(() => {
    if (previewPollRef.current) clearTimeout(previewPollRef.current);
    let ticks = 0;
    const tick = async () => {
      ticks += 1;
      await syncProject();
      const p = projectRef.current;
      const anyPending = p?.sockets.some((s) =>
        s.works.some((w) => w.preview_state === 'pending' || w.extracted_text_state === 'pending'),
      );
      if (anyPending && ticks < 15) {
        previewPollRef.current = setTimeout(tick, 400);
      } else {
        previewPollRef.current = null;
      }
    };
    previewPollRef.current = setTimeout(tick, 300);
  }, [syncProject]);

  const createProject = useCallback(
    async (req: CreateProjectRequest) => {
      setBusy(true);
      setSelectorError(null);
      try {
        const p = await client.createProject(req);
        rememberRecent(p.path);
        setProject(p);
        setSelectedSocketId(null);
        return true;
      } catch (e) {
        setSelectorError(e instanceof ApiError ? e : new ApiError({ code: 'INTERNAL_ERROR', message: errorMessage(e), details: null }));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  const openProject = useCallback(
    async (path: string) => {
      setBusy(true);
      setSelectorError(null);
      try {
        const p = await client.getProject(path);
        rememberRecent(p.path);
        setProject(p);
        setSelectedSocketId(null);
        return true;
      } catch (e) {
        setSelectorError(e instanceof ApiError ? e : new ApiError({ code: 'INTERNAL_ERROR', message: errorMessage(e), details: null }));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  const closeProject = useCallback(() => {
    setProject(null);
    setSelectedSocketId(null);
  }, []);

  const setGridColumns = useCallback(
    async (n: number) => {
      const p = projectRef.current;
      if (!p) return;
      // Optimistic re-flow (AC-F02.3), then persist.
      setProject({ ...p, grid_columns: n });
      try {
        await client.updateProject({ project_path: p.path, grid_columns: n });
      } catch (e) {
        pushToast('error', errorMessage(e));
        setProject(projectRef.current ? { ...projectRef.current, grid_columns: p.grid_columns } : null);
      }
    },
    [client, pushToast],
  );

  const updateSocketFields = useCallback(
    async (socketId: string, fields: { title?: string; notes?: string; metadata?: SocketMetadata }) => {
      const p = projectRef.current;
      if (!p) return false;
      try {
        const updated = await client.updateSocket({ project_path: p.path, socket_id: socketId, ...fields });
        applySocket(updated);
        return true;
      } catch (e) {
        pushToast('error', errorMessage(e));
        return false;
      }
    },
    [client, applySocket, pushToast],
  );

  const setSocketLock = useCallback(
    async (socketId: string, locked: boolean) => {
      const p = projectRef.current;
      if (!p) return false;
      try {
        const updated = await client.setSocketLock({ project_path: p.path, socket_id: socketId, locked });
        applySocket(updated);
        return true;
      } catch (e) {
        pushToast('error', errorMessage(e));
        return false;
      }
    },
    [client, applySocket, pushToast],
  );

  const selectWinner = useCallback(
    async (socketId: string, workId: string | null) => {
      const p = projectRef.current;
      if (!p) return false;
      try {
        const updated = await client.selectWinner({ project_path: p.path, socket_id: socketId, work_id: workId });
        applySocket(updated);
        return true;
      } catch (e) {
        pushToast('error', errorMessage(e));
        return false;
      }
    },
    [client, applySocket, pushToast],
  );

  const removeWork = useCallback(
    async (socketId: string, workId: string, force = false) => {
      const p = projectRef.current;
      if (!p) return false;
      try {
        const updated = await client.removeWork({ project_path: p.path, socket_id: socketId, work_id: workId, force });
        applySocket(updated);
        return true;
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'IS_SELECTED')) pushToast('error', errorMessage(e));
        throw e;
      }
    },
    [client, applySocket, pushToast],
  );

  const attachFiles = useCallback(
    async (socketId: string, files: AttachableFile[]) => {
      const p = projectRef.current;
      if (!p || files.length === 0) return false;
      setAttaching((s) => new Set(s).add(socketId));
      try {
        const mock = getMockClient();
        const paths: string[] = [];
        for (const f of files) {
          // In mock/browser mode the "path" is an object URL registered with
          // the mock client, mirroring the real attach-by-path contract.
          const url = URL.createObjectURL(f.blob);
          mock?.registerLocalFile(url, f.blob);
          paths.push(url);
        }
        const result = await client.importDroppedFiles({ project_path: p.path, socket_id: socketId, paths });
        await syncProject();
        for (const r of result.rejected) {
          pushToast('error', `[${r.code}] ${r.path}: ${r.reason}`);
        }
        if (result.accepted.length > 0) {
          startPreviewPolling();
        }
        return result.accepted.length > 0;
      } catch (e) {
        pushToast('error', errorMessage(e));
        return false;
      } finally {
        setAttaching((s) => {
          const next = new Set(s);
          next.delete(socketId);
          return next;
        });
      }
    },
    [client, syncProject, pushToast, startPreviewPolling],
  );

  const setSelectedSocket = useCallback((id: string | null) => setSelectedSocketId(id), []);

  const value = useMemo<BoardStore>(
    () => ({
      client,
      project,
      busy,
      selectorError,
      selectedSocketId,
      attachingSockets: attaching,
      toasts,
      csvImportOpen,
      createProject,
      openProject,
      closeProject,
      syncProject,
      setGridColumns,
      setSelectedSocket,
      updateSocketFields,
      setSocketLock,
      selectWinner,
      removeWork,
      attachFiles,
      pushToast,
      dismissToast,
      setCsvImportOpen,
    }),
    [
      client,
      project,
      busy,
      selectorError,
      selectedSocketId,
      attaching,
      toasts,
      csvImportOpen,
      createProject,
      openProject,
      closeProject,
      syncProject,
      setGridColumns,
      setSelectedSocket,
      updateSocketFields,
      setSocketLock,
      selectWinner,
      removeWork,
      attachFiles,
      pushToast,
      dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoard(): BoardStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBoard must be used inside BoardProvider');
  return v;
}
