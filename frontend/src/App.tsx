/**
 * App shell (US-F01): routes between the project selector screen and the
 * board grid based on whether a project is open.
 */
import { ProjectSelector } from './components/ProjectSelector';
import { SocketGrid } from './components/SocketGrid';
import { ToastRegion } from './components/Toasts';
import { useBoard } from './state/store';

export function App() {
  const board = useBoard();
  return (
    <div className="app">
      {board.project ? (
        <SocketGrid project={board.project} />
      ) : (
        <ProjectSelector />
      )}
      <ToastRegion />
    </div>
  );
}
