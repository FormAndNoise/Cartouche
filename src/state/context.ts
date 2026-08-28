import { createContext, useContext } from "react";
import type { BackendClient } from "../api/client";
import type {
 ApiError,
 CreateProjectRequest,
 Project,
 ProjectMetadata,
 SocketMetadata,
} from "../api/types";

export interface Toast {
 id: number;
 kind: "error" | "success" | "info";
 message: string;
}

export interface AttachableFile {
 name: string;
 blob: Blob;
 path?: string;
}

export interface BoardStore {
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
 updateProjectMetadata(metadata: ProjectMetadata): Promise<boolean>;

 setSelectedSocket(id: string | null): void;
 updateSocketFields(
 socketId: string,
 fields: { title?: string; notes?: string; metadata?: SocketMetadata },
 ): Promise<boolean>;
 setSocketLock(socketId: string, locked: boolean): Promise<boolean>;
 selectWinner(socketId: string, workId: string | null): Promise<boolean>;
 removeWork(
 socketId: string,
 workId: string,
 force?: boolean,
 ): Promise<boolean>;
 moveWorkBetweenSockets(
 sourceSocketId: string,
 targetSocketId: string,
 workId: string,
 ): Promise<boolean>;
 openInExternalEditor(socketId: string, workId: string): Promise<boolean>;
 syncExternalEdits(socketId: string, workId: string): Promise<boolean>;
 attachFiles(socketId: string, files: AttachableFile[]): Promise<boolean>;

 pushToast(kind: Toast["kind"], message: string): void;
 dismissToast(id: number): void;

 setCsvImportOpen(open: boolean): void;
}

export const Ctx = createContext<BoardStore | null>(null);

export function useBoard(): BoardStore {
 const v = useContext(Ctx);
 if (!v) throw new Error("useBoard must be used inside BoardProvider");
 return v;
}
