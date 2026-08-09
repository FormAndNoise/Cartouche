/**
 * Socket detail panel (opened from a grid card).
 *
 * - Inline title/notes editing with blur/debounce persistence (AC-F03.4,
 *   no Save button).
 * - Fixed-schema metadata editor: exactly the §5.1/§6.3 fields — status
 *   (select), medium (text), tags (text), due_date (date) (US-F04).
 * - All candidate works as thumbnails with winner badges (AC-F06.1/.3),
 *   winner select/clear (US-F07.2), and per-work remove with IS_SELECTED
 *   confirmation (AC-B04.5 surfaced through the client).
 * - Lock toggle with unlock confirmation (AC-F07.3).
 * - Collapsible extracted text per work (US-F09).
 */
import { useEffect, useRef, useState } from 'react';
import { STATUS_OPTIONS, type Socket, type SocketMetadata, type Work } from '../api/types';
import { useBoard, type AttachableFile } from '../state/store';
import { Modal } from './Modal';

function DebouncedField({
  value,
  onCommit,
  multiline,
  disabled,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(value), [value]);

  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (v !== value) onCommit(v);
  };

  const onChange = (v: string) => {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 600); // debounce (AC-F03.4)
  };

  const props = {
    value: draft,
    disabled,
    'aria-label': ariaLabel,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: () => commit(draft),
  };

  return multiline ? <textarea {...props} rows={3} /> : <input {...props} />;
}

function ExtractedTextSection({ work }: { work: Work }) {
  if (work.extracted_text_state === 'unsupported' || work.extracted_text_state === 'none') {
    return null; // nothing extractable for this kind
  }
  if (work.extracted_text_state === 'pending') {
    return <span className="extract-unavailable">Extracting text…</span>;
  }
  if (work.extracted_text_state === 'failed') {
    return <span className="extract-unavailable">Text unavailable for this document.</span>;
  }
  return (
    <details className="extracted">
      <summary>Extracted text</summary>
      <pre>{work.extracted_text ?? ''}</pre>
    </details>
  );
}

export function SocketDetailPanel({ socket, onClose }: { socket: Socket; onClose: () => void }) {
  const board = useBoard();
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState<SocketMetadata>(socket.metadata);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMetaDraft(socket.metadata), [socket.metadata]);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const commitMeta = async (next: SocketMetadata) => {
    setMetaDraft(next);
    await board.updateSocketFields(socket.id, { metadata: next });
  };

  const toggleLock = async () => {
    if (socket.locked) {
      setConfirmUnlock(true);
    } else {
      await board.setSocketLock(socket.id, true);
    }
  };

  const onBrowse = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    if (socket.locked) {
      board.pushToast('error', `[LOCKED] Socket is locked — unlock it to attach files.`);
      return;
    }
    const files: AttachableFile[] = Array.from(list).map((f) => ({ name: f.name, blob: f }));
    await board.attachFiles(socket.id, files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeWork = async (workId: string, force = false) => {
    try {
      await board.removeWork(socket.id, workId, force);
      setConfirmRemove(null);
    } catch {
      // IS_SELECTED without force is handled via the confirm modal before
      // this is ever called with force=true; any other error was toasted
      // by the store already.
    }
  };

  const attemptRemove = async (workId: string) => {
    if (socket.locked) {
      board.pushToast('error', '[LOCKED] Socket is locked — cannot remove works.');
      return;
    }
    if (workId === socket.selected_work_id) {
      setConfirmRemove(workId); // IS_SELECTED requires confirmation (AC-B04.5)
      return;
    }
    await removeWork(workId);
  };

  const sortedWorks = [...socket.works];

  return (
    <aside
      className="detail-panel"
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Socket ${socket.position + 1} details`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose(); // AC-F10.2: Escape closes and returns focus to the card
        }
      }}
    >
      <div className="panel-head">
        <h2>Socket {socket.position + 1}</h2>
        {socket.locked && <span className="badge" style={{ color: 'var(--lock)' }}>🔒 locked</span>}
        <span className="grow" />
        <button onClick={toggleLock} aria-pressed={socket.locked}>
          {socket.locked ? 'Unlock' : 'Lock'}
        </button>
        <button onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>

      {socket.locked && (
        <div className="locked-note" role="note">
          This socket is locked. Editing, attaching, removing works, and winner changes are
          disabled until you unlock it.
        </div>
      )}

      <section>
        <h3>Title</h3>
        <DebouncedField
          value={socket.title}
          onCommit={(v) => board.updateSocketFields(socket.id, { title: v })}
          disabled={socket.locked}
          ariaLabel={`Title for socket ${socket.position + 1}`}
          placeholder="Untitled socket"
        />
      </section>

      <section>
        <h3>Notes</h3>
        <DebouncedField
          value={socket.notes}
          onCommit={(v) => board.updateSocketFields(socket.id, { notes: v })}
          multiline
          disabled={socket.locked}
          ariaLabel={`Notes for socket ${socket.position + 1}`}
          placeholder="Notes about this deliverable…"
        />
      </section>

      <section>
        <h3>Metadata</h3>
        <label className="field">
          <span>Status</span>
          <select
            value={metaDraft.status}
            disabled={socket.locked}
            aria-label="Status"
            onChange={(e) => commitMeta({ ...metaDraft, status: e.target.value as SocketMetadata['status'] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Medium</span>
          <input
            value={metaDraft.medium}
            disabled={socket.locked}
            aria-label="Medium"
            placeholder="e.g. digital painting, ink"
            onChange={(e) => setMetaDraft({ ...metaDraft, medium: e.target.value })}
            onBlur={(e) => e.target.value !== socket.metadata.medium && commitMeta({ ...metaDraft, medium: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Tags (comma-separated)</span>
          <input
            value={metaDraft.tags}
            disabled={socket.locked}
            aria-label="Tags"
            placeholder="major-arcana, night scene"
            onChange={(e) => setMetaDraft({ ...metaDraft, tags: e.target.value })}
            onBlur={(e) => e.target.value !== socket.metadata.tags && commitMeta({ ...metaDraft, tags: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={metaDraft.due_date ?? ''}
            disabled={socket.locked}
            aria-label="Due date"
            onChange={(e) => setMetaDraft({ ...metaDraft, due_date: e.target.value || null })}
            onBlur={(e) => {
              const v = e.target.value || null;
              if (v !== socket.metadata.due_date) commitMeta({ ...metaDraft, due_date: v });
            }}
          />
        </label>
      </section>

      <section>
        <h3>Works ({socket.works.length})</h3>
        <div className="dropzone-row" style={{ marginBottom: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => onBrowse(e.target.files)}
            aria-label="Choose files to attach"
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={socket.locked}>
            Browse files…
          </button>
        </div>

        {socket.works.length === 0 ? (
          <p className="extract-unavailable">No works attached yet. Drop files on the card or browse.</p>
        ) : (
          <div className="work-list">
            {sortedWorks.map((w) => {
              const isWinner = socket.selected_work_id === w.id;
              return (
                <div key={w.id} className={`work-item ${isWinner ? 'winner' : ''}`}>
                  <div className="work-thumb">
                    {w.preview_state === 'ready' && w.preview_uri ? (
                      <img src={w.preview_uri} alt={w.title} />
                    ) : w.preview_state === 'pending' ? (
                      <span className="spinner" aria-label="Generating preview" />
                    ) : w.media_kind === 'image' ? (
                      <span aria-label="Image preview unavailable">🖼️</span>
                    ) : (
                      <span aria-label={`${w.media_kind} document`}>📄</span>
                    )}
                  </div>
                  <div className="work-info">
                    <span className="name" title={w.title}>
                      {w.title}
                      {isWinner && <span className="badge winner" style={{ marginLeft: 6 }}>✓ winner</span>}
                    </span>
                    <span className="meta-line">
                      {w.media_kind} · {(w.byte_size / 1024).toFixed(1)} KB · {w.sha256.slice(0, 12)}…
                    </span>
                    <div className="work-actions">
                      {isWinner ? (
                        <button
                          onClick={() => board.selectWinner(socket.id, null)}
                          disabled={socket.locked}
                        >
                          Clear winner
                        </button>
                      ) : (
                        <button
                          onClick={() => board.selectWinner(socket.id, w.id)}
                          disabled={socket.locked}
                        >
                          Select as winner
                        </button>
                      )}
                      <button
                        className="danger"
                        onClick={() => attemptRemove(w.id)}
                        disabled={socket.locked}
                        title={socket.locked ? 'Socket is locked — remove is disabled' : undefined}
                      >
                        Remove
                      </button>
                    </div>
                    <ExtractedTextSection work={w} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {confirmUnlock && (
        <Modal title="Unlock this socket?" onClose={() => setConfirmUnlock(false)}>
          <p>
            Unlocking removes delete protection from socket {socket.position + 1}. Works can be
            removed and fields edited again. Continue?
          </p>
          <div className="modal-actions">
            <button onClick={() => setConfirmUnlock(false)}>Keep locked</button>
            <button
              className="danger"
              onClick={async () => {
                setConfirmUnlock(false);
                await board.setSocketLock(socket.id, false);
              }}
            >
              Unlock
            </button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <Modal title="Remove the winning work?" onClose={() => setConfirmRemove(null)}>
          <p>
            This work is currently selected as the winner. Removing it will clear the winner
            selection. Continue?
          </p>
          <div className="modal-actions">
            <button onClick={() => setConfirmRemove(null)}>Cancel</button>
            <button className="danger" onClick={() => removeWork(confirmRemove, true)}>
              Remove winner
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
