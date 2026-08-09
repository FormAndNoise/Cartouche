/**
 * Guided CSV import flow (US-F08).
 *
 * Steps: pick file -> preview table (header + first rows, before any
 * mutation, AC-F08.1) -> choose append/update mode and confirm ->
 * progress bar driven by get_job polling (AC-F08.2) -> summary report
 * with processed/skipped rows and per-row warnings (AC-F08.3).
 */
import { useEffect, useRef, useState } from 'react';
import type { CsvPreview, JobStatus } from '../api/types';
import { errorMessage, useBoard } from '../state/store';
import { Modal } from './Modal';

type Phase = 'pick' | 'preview' | 'running' | 'done' | 'failed';

export function CsvImportModal({ onClose }: { onClose: () => void }) {
  const board = useBoard();
  const project = board.project;
  const [phase, setPhase] = useState<Phase>('pick');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mode, setMode] = useState<'append' | 'update'>('append');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  if (!project) return null;

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const text = await f.text();
      const p = await board.client.previewCsv({ project_path: project.path, csv_text: text });
      setCsvText(text);
      setFileName(f.name);
      setPreview(p);
      setPhase('preview');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const startImport = async () => {
    setError(null);
    setPhase('running');
    try {
      const { job_id } = await board.client.importCsv({ project_path: project.path, csv_text: csvText, mode });
      const poll = async () => {
        try {
          const status = await board.client.getJob({ project_path: project.path, job_id });
          setJob(status);
          if (status.state === 'done' || status.state === 'failed') {
            setPhase(status.state === 'done' ? 'done' : 'failed');
            await board.syncProject(); // reflect imported sockets in the grid
          } else {
            pollRef.current = setTimeout(poll, 250);
          }
        } catch (e) {
          setError(errorMessage(e));
          setPhase('failed');
        }
      };
      await poll();
    } catch (e) {
      setError(errorMessage(e));
      setPhase('failed');
    }
  };

  return (
    <Modal title="Import sockets from CSV" onClose={onClose} wide>
      {phase === 'pick' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
            The CSV must have a header row. Recognized columns:{' '}
            <code>title</code> (required), <code>notes</code>, <code>status</code>,{' '}
            <code>medium</code>, <code>tags</code>, <code>due_date</code>.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose CSV file"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
        </>
      )}

      {phase === 'preview' && preview && (
        <>
          <p style={{ fontSize: '0.85rem' }}>
            <strong>{fileName}</strong> — {preview.rows_total} data row{preview.rows_total === 1 ? '' : 's'}.
            No changes have been made yet.
          </p>
          <table className="csv-preview-table" aria-label="CSV preview">
            <thead>
              <tr>
                {preview.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i}>
                  {preview.headers.map((_, j) => (
                    <td key={j}>{r[j] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="radio-row" role="radiogroup" aria-label="Import mode">
            <label>
              <input
                type="radio"
                name="csv-mode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
              />
              Append (fill empty sockets)
            </label>
            <label>
              <input
                type="radio"
                name="csv-mode"
                checked={mode === 'update'}
                onChange={() => setMode('update')}
              />
              Update (row N → socket N)
            </label>
          </div>
          <div className="modal-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={startImport}>
              Import {preview.rows_total} rows
            </button>
          </div>
        </>
      )}

      {phase === 'running' && (
        <>
          <p style={{ fontSize: '0.9rem' }}>Importing… {job?.progress ?? 0}%</p>
          <div className="progress-track" role="progressbar" aria-valuenow={job?.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${job?.progress ?? 0}%` }} />
          </div>
        </>
      )}

      {phase === 'done' && job?.result && (
        <div className="import-summary">
          <p>
            <strong>Import complete.</strong>
          </p>
          <span>Rows total: {job.result.rows_total}</span>
          <span>Processed: {job.result.rows_processed}</span>
          <span>Skipped: {job.result.rows_skipped}</span>
          {job.warnings.length > 0 && (
            <ul className="import-warnings" aria-label="Row warnings">
              {job.warnings.map((w, i) => (
                <li key={i}>
                  Row {w.row}: {w.reason} [{w.code}]
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <>
          <div className="error-box" role="alert">
            {error ?? 'Import failed.'}
          </div>
          {job && job.warnings.length > 0 && (
            <ul className="import-warnings">
              {job.warnings.map((w, i) => (
                <li key={i}>
                  Row {w.row}: {w.reason} [{w.code}]
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button onClick={onClose}>Close</button>
          </div>
        </>
      )}

      {error && phase !== 'failed' && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
