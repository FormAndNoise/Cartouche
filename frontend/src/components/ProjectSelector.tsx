/**
 * Project selector/creator screen (US-F01).
 * Shown when no project is open: create a new fixed-count project or open
 * an existing one by path (or from the recent list). Structured backend
 * errors render inline instead of navigating (AC-F01.3).
 */
import { useState, type FormEvent } from 'react';
import { getMockClient, isMockMode } from '../api/index';
import { errorMessage, getRecentProjects, useBoard } from '../state/store';

const DEMO_PATH = 'C:/Users/artist/Projects/tarot-deck';

export function ProjectSelector() {
  const board = useBoard();
  const [name, setName] = useState('');
  const [count, setCount] = useState(70);
  const [path, setPath] = useState('');
  const [openPath, setOpenPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const recents = getRecentProjects();

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    const projectPath = path.trim() || `./${name.trim() || 'untitled'}.tarot`;
    const ok = await board.createProject({
      name: name.trim() || 'Untitled deck',
      socket_count: count,
      project_path: projectPath,
    });
    if (!ok) {
      // error already surfaced via board.selectorError
    }
    setBusy(false);
  };

  const onOpen = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!openPath.trim()) return;
    setBusy(true);
    await board.openProject(openPath.trim());
    setBusy(false);
  };

  const onDemo = async () => {
    setLocalError(null);
    const mock = getMockClient();
    if (!mock) {
      setLocalError('Demo project is only available in mock/browser mode.');
      return;
    }
    setBusy(true);
    try {
      await mock.seedDemoProject(DEMO_PATH);
      await board.openProject(DEMO_PATH);
    } catch (e2) {
      setLocalError(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  const shownError = board.selectorError ? `[${board.selectorError.code}] ${board.selectorError.message}` : localError;

  return (
    <div className="selector-screen">
      <div className="selector-card">
        <h1>Tarot Socket Board</h1>
        <p className="sub">
          Manage a deck of deliverables as sockets on a board — drop in candidate works, compare,
          pick a winner, lock what's final.
        </p>
        {isMockMode() && (
          <p className="mock-badge" role="note">
            Demo mode — running against the in-memory mock backend (no Tauri shell detected)
          </p>
        )}

        {shownError && (
          <div className="error-box" role="alert" data-testid="selector-error">
            {shownError}
          </div>
        )}

        <h2>Create a new project</h2>
        <form onSubmit={onCreate} onReset={undefined} noValidate aria-label="Create new project">
          <label className="field">
            <span>Project name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Tarot Deck"
              required
              data-testid="project-name-input"
            />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Number of sockets (fixed)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                aria-label="Number of sockets"
                data-testid="socket-count-input"
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </div>
          <label className="field">
            <span>Project path (optional — defaults to ./&lt;name&gt;.tarot)</span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:/Projects/my-deck"
              data-testid="project-path-input"
            />
          </label>
        </form>

        <hr />

        <h2>Open an existing project</h2>
        <form onSubmit={onOpen} aria-label="Open existing project">
          <div className="form-row">
            <input
              value={openPath}
              onChange={(e) => setOpenPath(e.target.value)}
              placeholder="Path to project folder, e.g. C:/Projects/my-deck"
              aria-label="Existing project path"
            />
            <button type="submit" disabled={busy || !openPath.trim()}>
              Open
            </button>
          </div>
        </form>

        {recents.length > 0 && (
          <>
            <h2>Recent projects</h2>
            <ul className="recent-list">
              {recents.map((p) => (
                <li key={p}>
                  <span className="path-label" title={p}>{p}</span>
                  <button
                    onClick={async () => {
                      setBusy(true);
                      await board.openProject(p);
                      setBusy(false);
                    }}
                    disabled={busy}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {isMockMode() && (
          <>
            <hr />
            <button onClick={onDemo} disabled={busy} className="primary" style={{ width: '100%' }}>
              Load demo project (12 sockets, some filled)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
