/**
 * App shell (US-F01): routes between the project selector screen and the
 * board grid based on whether a project is open.
 */
import { ProjectSelector } from './ProjectSelector';
import { SocketGrid } from './SocketGrid';
import { ToastRegion } from './Toasts';
import { useBoard } from '../state/store';

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
