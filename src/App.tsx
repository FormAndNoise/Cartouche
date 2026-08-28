import { useMemo } from "react";
import type { BackendClient } from "./api/client";
import { createBackendClient } from "./api/index";
import { ProjectSelector } from "./components/ProjectSelector";
import { SocketGrid } from "./components/SocketGrid";
import { ToastRegion } from "./components/Toasts";
import { useBoard } from "./state/context";
import { BoardProvider } from "./state/store";
import "./styles.css";

function MainView() {
 const board = useBoard();
 return (
 <main className="app" data-testid="app-root">
 {board.project ? (
 <SocketGrid project={board.project} />
 ) : (
 <ProjectSelector />
 )}
 <ToastRegion />
 </main>
 );
}

export default function App({
 client: propClient,
}: { client?: BackendClient } = {}) {
 const client = useMemo(
 () => propClient ?? createBackendClient(),
 [propClient],
 );
 return (
 <BoardProvider client={client}>
 <MainView />
 </BoardProvider>
 );
}
