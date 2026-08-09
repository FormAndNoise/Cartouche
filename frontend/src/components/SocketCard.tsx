/**
 * Socket card (US-F03). Shows title, lock state, filled/empty status, and
 * the winning work's thumbnail (or a document icon / empty placeholder).
 * When a winner is selected, only that work's thumbnail shows — non-selected
 * candidates are hidden from the grid per the "hide non-selected" decision
 * (AC-F07.1 / §6.4); they remain reachable in the detail panel.
 *
 * Cards are drag-and-drop targets (US-F05) with a visible drop state and a
 * loading state while attach + preview jobs resolve (AC-F05.2).
 */
import { forwardRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Socket, Work } from '../api/types';
import { useBoard, type AttachableFile } from '../state/store';

function docGlyph(kind: Work['media_kind']): string {
  switch (kind) {
    case 'pdf':
      return '📄';
    case 'docx':
      return '📝';
    case 'text':
      return '📃';
    default:
      return '🗎';
  }
}

interface SocketCardProps {
  socket: Socket;
  onOpen: (socketId: string) => void;
}

export const SocketCard = forwardRef<HTMLDivElement, SocketCardProps>(function SocketCard(
  { socket, onOpen },
  ref,
) {
  const board = useBoard();
  const [dragOver, setDragOver] = useState(false);
  const isAttaching = board.attachingSockets.has(socket.id);

  const winner = socket.selected_work_id
    ? socket.works.find((w) => w.id === socket.selected_work_id) ?? null
    : null;
  const isEmpty = socket.works.length === 0;
  // Winner thumbnail if chosen; otherwise, when no winner, show nothing on
  // the card beyond status (candidates only appear in the detail panel).

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (socket.locked) {
      board.pushToast('error', `[LOCKED] Socket "${socket.title || socket.position}" is locked — unlock it to attach files.`);
      return;
    }
    const files = Array.from(e.dataTransfer.files).map(
      (f): AttachableFile => ({ name: f.name, blob: f }),
    );
    if (files.length > 0) {
      await board.attachFiles(socket.id, files);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(socket.id);
    }
  };

  const statusClass = socket.metadata.status ? `status-${socket.metadata.status}` : '';

  return (
    <div
      ref={ref}
      className={[
        'socket-card',
        isEmpty ? 'empty' : '',
        socket.locked ? 'locked' : '',
        dragOver ? 'drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="gridcell"
      tabIndex={0}
      aria-label={`Socket ${socket.position + 1}: ${socket.title || 'untitled'}${socket.locked ? ', locked' : ''}${isEmpty ? ', empty' : `, ${socket.works.length} work${socket.works.length === 1 ? '' : 's'}`}`}
      data-testid={`socket-card-${socket.id}`}
      onClick={() => onOpen(socket.id)}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="card-top">
        <span className="pos">{String(socket.position + 1).padStart(2, '0')}</span>
        <span className={`title ${socket.title ? '' : 'untitled'}`}>
          {socket.title || 'Untitled socket'}
        </span>
        {socket.locked && (
          <span className="lock-icon" aria-label="Locked" title="Locked — destructive edits are disabled">
            🔒
          </span>
        )}
      </div>

      <div className="thumb">
        {isAttaching ? (
          <span className="pending" data-testid={`attaching-${socket.id}`}>
            <span className="spinner" aria-hidden="true" /> Attaching…
          </span>
        ) : isEmpty ? (
          <span className="empty-label">Empty socket — drop a file or browse</span>
        ) : winner ? (
          winner.preview_state === 'ready' && winner.preview_uri ? (
            <img src={winner.preview_uri} alt={winner.title} />
          ) : winner.preview_state === 'pending' ? (
            <span className="pending">
              <span className="spinner" aria-hidden="true" /> Generating preview…
            </span>
          ) : winner.media_kind === 'image' ? (
            <span className="doc-icon" aria-label="Image unavailable">🖼️</span>
          ) : (
            <span className="doc-icon" aria-label={`${winner.media_kind} document`}>
              {docGlyph(winner.media_kind)}
            </span>
          )
        ) : (
          // Works attached but no winner yet.
          <span className="empty-label">
            {socket.works.length} candidate{socket.works.length === 1 ? '' : 's'} — pick a winner
          </span>
        )}
      </div>

      <div className="card-badges">
        {socket.metadata.status && socket.metadata.status !== 'not_started' && (
          <span className={`badge ${statusClass}`}>{socket.metadata.status.replace('_', ' ')}</span>
        )}
        {winner && <span className="badge winner">✓ winner</span>}
        {socket.works.length > 0 && <span className="badge count">{socket.works.length} work{socket.works.length === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
});
