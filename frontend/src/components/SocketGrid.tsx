/**
 * Socket grid (US-F02) with header controls.
 *
 * - Renders all sockets in position order in a CSS grid of 1–4 columns
 *   (AC-F02.1), scrolling vertically (AC-F02.2).
 * - Column density control re-flows immediately (AC-F02.3) and persists
 *   via update_project.
 * - Full keyboard traversal (US-F10): arrow keys move focus following the
 *   current column layout; Enter/Space opens the detail panel; Escape in
 *   the panel returns focus to the originating card.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Project } from '../api/types';
import { useBoard } from '../state/store';
import { CsvImportModal } from './CsvImportModal';
import { SocketCard } from './SocketCard';
import { SocketDetailPanel } from './SocketDetailPanel';

export function SocketGrid({ project }: { project: Project }) {
  const board = useBoard();
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const lastFocused = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const sorted = [...project.sockets].sort((a, b) => a.position - b.position);
  const cols = Math.min(4, Math.max(1, project.grid_columns));

  const focusCard = useCallback((socketId: string) => {
    const el = cardRefs.current.get(socketId);
    if (el) {
      el.focus();
      lastFocused.current = socketId;
    }
  }, []);

  const openSocket = useCallback(
    (socketId: string) => {
      lastFocused.current = socketId;
      board.setSelectedSocket(socketId);
    },
    [board],
  );

  const closePanel = useCallback(() => {
    board.setSelectedSocket(null);
    if (lastFocused.current) focusCard(lastFocused.current);
  }, [board, focusCard]);

  /** Map arrow keys onto grid geometry (AC-F10.1). */
  const onGridKeyDown = (e: KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const activeId = active?.getAttribute('data-testid')?.replace('socket-card-', '') ?? null;
    if (!activeId) return;
    const idx = sorted.findIndex((s) => s.id === activeId);
    if (idx < 0) return;

    let next = -1;
    switch (e.key) {
      case 'ArrowRight':
        next = idx + 1;
        break;
      case 'ArrowLeft':
        next = idx - 1;
        break;
      case 'ArrowDown':
        next = idx + cols;
        break;
      case 'ArrowUp':
        next = idx - cols;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = sorted.length - 1;
        break;
      default:
        return;
    }
    if (next >= 0 && next < sorted.length) {
      e.preventDefault();
      focusCard(sorted[next].id);
      setAnnounce(`Socket ${sorted[next].position + 1} of ${sorted.length}`);
    }
  };

  // Keep focus visible when density changes (AC-F02.3).
  useEffect(() => {
    if (lastFocused.current) {
      // no-op refocus: layout changed but DOM node persists
    }
  }, [cols]);

  const selected = board.selectedSocketId
    ? sorted.find((s) => s.id === board.selectedSocketId) ?? null
    : null;

  return (
    <>
      <header className="board-header">
        <h1>
          {project.name}
          <span className="path">{project.path}</span>
        </h1>
        <div className="density-control" role="group" aria-label="Grid column density">
          Columns:
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              aria-pressed={cols === n}
              aria-label={`${n} column${n === 1 ? '' : 's'}`}
              onClick={() => board.setGridColumns(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <button onClick={() => board.setCsvImportOpen(true)}>Import CSV…</button>
        <button onClick={board.closeProject}>Close project</button>
      </header>

      <div className="board-main">
        <div className="grid-scroll">
          <div
            ref={gridRef}
            className="socket-grid"
            role="grid"
            aria-label={`Sockets for ${project.name}`}
            aria-rowcount={Math.ceil(sorted.length / cols)}
            style={{ ['--cols' as string]: cols }}
            onKeyDown={onGridKeyDown}
          >
            {sorted.map((s) => (
              <SocketCard
                key={s.id}
                socket={s}
                onOpen={openSocket}
                ref={(el) => {
                  if (el) cardRefs.current.set(s.id, el);
                  else cardRefs.current.delete(s.id);
                }}
              />
            ))}
          </div>
          <div className="visually-hidden" role="status" aria-live="polite">
            {announce}
          </div>
        </div>

        {selected && <SocketDetailPanel socket={selected} onClose={closePanel} />}
      </div>

      {board.csvImportOpen && <CsvImportModal onClose={() => board.setCsvImportOpen(false)} />}
    </>
  );
}
