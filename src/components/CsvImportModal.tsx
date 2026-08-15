/**
 * CSV import modal dialog (US-F08).
 *
 * Provides file selection, CSV preview, mode choice (append vs update),
 * progress tracking, and import summary report with warnings.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { readBlobText } from "../api/blobUtil";
import type { CsvPreview, JobStatus } from "../api/types";
import { errorMessage } from "../state/helpers";
import { useBoard } from "../state/context";
import { Modal } from "./Modal";

export function CsvImportModal({ onClose }: { onClose: () => void }) {
  const board = useBoard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mode, setMode] = useState<"append" | "update">("append");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !board.project) return;
    setError(null);
    setFileName(file.name);
    try {
      const text = await readBlobText(file);
      setCsvText(text);
      const prev = await board.client.previewCsv({
        project_path: board.project.path,
        csv_text: text,
      });
      setPreview(prev);
    } catch (err2) {
      setError(errorMessage(err2));
      setCsvText(null);
      setPreview(null);
    }
  };

  const startImport = async () => {
    if (!csvText || !board.project) return;
    setError(null);
    setBusy(true);
    try {
      const res = await board.client.importCsv({
        project_path: board.project.path,
        csv_text: csvText,
        mode,
      });
      setJobId(res.job_id);
      pollJob(res.job_id);
    } catch (err2) {
      setError(errorMessage(err2));
      setBusy(false);
    }
  };

  const pollJob = (id: string) => {
    const interval = setInterval(async () => {
      if (!board.project) {
        clearInterval(interval);
        return;
      }
      try {
        const st = await board.client.getJob({
          project_path: board.project.path,
          job_id: id,
        });
        setJobStatus(st);
        if (st.state === "done" || st.state === "failed") {
          clearInterval(interval);
          setBusy(false);
          await board.syncProject();
        }
      } catch {
        clearInterval(interval);
        setBusy(false);
      }
    }, 100);
  };

  return (
    <Modal title="Import Sockets from CSV" onClose={onClose} wide>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}

      {!jobId && (
        <>
          <label className="field">
            <span>Select CSV file</span>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv"
              onChange={handleFileChange}
              aria-label="Choose CSV file"
            />
          </label>

          {preview && (
            <>
              <p data-testid="csv-preview-count">
                CSV preview for <strong>{fileName}</strong> (
                {preview.rows_total} data rows):
              </p>

              <table className="csv-preview-table" aria-label="CSV Preview">
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="radio-row">
                <span>Import mode:</span>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="append"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                  />
                  Append to empty sockets
                </label>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="update"
                    checked={mode === "update"}
                    onChange={() => setMode("update")}
                  />
                  Update existing positions (0..N)
                </label>
              </div>

              <div className="modal-actions">
                <button onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={startImport}
                  disabled={busy}
                >
                  {busy ? "Importing…" : `Import ${preview.rows_total} rows`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {jobId && jobStatus && (
        <div className="import-progress-view">
          <p>
            {jobStatus.state === "done"
              ? "Import complete!"
              : jobStatus.state === "failed"
                ? "Import failed."
                : "Importing sockets from CSV…"}
          </p>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${jobStatus.progress}%` }}
              role="progressbar"
              aria-valuenow={jobStatus.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {jobStatus.result && (
            <div className="import-summary" style={{ marginTop: 12 }}>
              <div>Processed: {jobStatus.result.rows_processed}</div>
              <div>Skipped: {jobStatus.result.rows_skipped}</div>
              <div>Total: {jobStatus.result.rows_total}</div>
            </div>
          )}

          {jobStatus.warnings.length > 0 && (
            <>
              <h4>Warnings ({jobStatus.warnings.length}):</h4>
              <ul className="import-warnings">
                {jobStatus.warnings.map((w, idx) => (
                  <li key={idx}>
                    Row {w.row}: [{w.code}] {w.reason}
                  </li>
                ))}
              </ul>
            </>
          )}

          {jobStatus.state === "done" && (
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
