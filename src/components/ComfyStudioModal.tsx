import { useEffect, useMemo, useRef, useState } from "react";
import {
  composeSocketComfyPrompt,
  DEFAULT_COMFY_CONFIG,
  type ComfyHistoryItem,
  type ComfyProjectConfig,
  type ComfyServerInfo,
  type Project,
  type Socket,
} from "../api/types";
import { useBoard } from "../state/context";
import { Modal } from "./Modal";

const CARD_ASPECT_PRESETS = [
  { label: "Tarot Standard (768×1344)", width: 768, height: 1344 },
  { label: "Tarot Wide (832×1216)", width: 832, height: 1216 },
  { label: "Poker / TCG (832×1152)", width: 832, height: 1152 },
  { label: "Square (1024×1024)", width: 1024, height: 1024 },
];

export type ComfyStudioTab = "batch" | "history" | "settings";

type BatchScope =
  | "all_unlocked"
  | "empty_only"
  | "current_filter"
  | "single_socket";

interface ComfyStudioModalProps {
  project: Project;
  filteredSockets: Socket[];
  initialTab?: ComfyStudioTab;
  initialTargetSocketId?: string | null;
  onClose: () => void;
}

export function ComfyStudioModal({
  project,
  filteredSockets,
  initialTab = "batch",
  initialTargetSocketId,
  onClose,
}: ComfyStudioModalProps) {
  const board = useBoard();
  const savedConfig: ComfyProjectConfig = {
    ...DEFAULT_COMFY_CONFIG,
    ...(project.metadata?.comfy_config ?? {}),
  };

  const [activeTab, setActiveTab] = useState<ComfyStudioTab>(initialTab);
  const [serverInfo, setServerInfo] = useState<ComfyServerInfo | null>(null);
  const [historyItems, setHistoryItems] = useState<ComfyHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Generator & Config fields
  const [host, setHost] = useState(
    savedConfig.host || DEFAULT_COMFY_CONFIG.host,
  );
  const [model, setModel] = useState(
    savedConfig.model || DEFAULT_COMFY_CONFIG.model,
  );
  const [samplerName, setSamplerName] = useState(
    savedConfig.sampler_name || DEFAULT_COMFY_CONFIG.sampler_name,
  );
  const [scheduler, setScheduler] = useState(
    savedConfig.scheduler || DEFAULT_COMFY_CONFIG.scheduler,
  );
  const [steps, setSteps] = useState(
    savedConfig.steps ?? DEFAULT_COMFY_CONFIG.steps,
  );
  const [cfg, setCfg] = useState(savedConfig.cfg ?? DEFAULT_COMFY_CONFIG.cfg);
  const [width, setWidth] = useState(
    savedConfig.width ?? DEFAULT_COMFY_CONFIG.width,
  );
  const [height, setHeight] = useState(
    savedConfig.height ?? DEFAULT_COMFY_CONFIG.height,
  );
  const [batchSize, setBatchSize] = useState(
    savedConfig.batch_size ?? DEFAULT_COMFY_CONFIG.batch_size,
  );
  const [workflowMode, setWorkflowMode] = useState<
    "builtin" | "active_workflow"
  >(savedConfig.workflow_mode ?? "builtin");
  const [stylePrefix, setStylePrefix] = useState(
    savedConfig.style_prefix ?? "",
  );
  const [styleSuffix, setStyleSuffix] = useState(
    savedConfig.style_suffix ?? "",
  );
  const [negativePrompt, setNegativePrompt] = useState(
    savedConfig.negative_prompt ?? DEFAULT_COMFY_CONFIG.negative_prompt,
  );
  const [includeSymbolism, setIncludeSymbolism] = useState(
    Boolean(savedConfig.include_symbolism),
  );
  const [autoSelectWinner, setAutoSelectWinner] = useState(
    savedConfig.auto_select_winner ?? true,
  );
  const [seedPolicy, setSeedPolicy] = useState<
    "random" | "fixed" | "deck_stride"
  >(savedConfig.seed_policy ?? "deck_stride");
  const [fixedSeed, setFixedSeed] = useState<number>(
    savedConfig.fixed_seed ?? 424242,
  );

  // Scope & Target socket state
  const unlockedSockets = useMemo(
    () =>
      [...project.sockets]
        .sort((a, b) => a.position - b.position)
        .filter((s) => !s.locked),
    [project.sockets],
  );

  const defaultSocketId =
    initialTargetSocketId ||
    board.selectedSocketId ||
    unlockedSockets[0]?.id ||
    project.sockets[0]?.id ||
    "";

  const [scope, setScope] = useState<BatchScope>("all_unlocked");
  const [targetSocketId, setTargetSocketId] = useState<string>(defaultSocketId);
  const [overwriteNotesOnImport, setOverwriteNotesOnImport] = useState(true);

  // Batch runner state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
  } | null>(null);
  const cancelBatchRef = useRef(false);

  const refreshServerAndHistory = async (targetHost = host) => {
    try {
      const info = await board.client.getComfyServerInfo(targetHost);
      setServerInfo(info);
      if (info.online && info.models.length > 0 && !info.models.includes(model)) {
        setModel(info.models[0]);
      }
    } catch {
      /* ignore */
    }
    setLoadingHistory(true);
    try {
      const hist = await board.client.listComfyHistory({
        host: targetHost,
        limit: 24,
      });
      setHistoryItems(hist);
    } catch {
      /* ignore */
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    refreshServerAndHistory(host);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentConfig: ComfyProjectConfig = useMemo(
    () => ({
      host,
      model,
      sampler_name: samplerName,
      scheduler,
      steps,
      cfg,
      width,
      height,
      batch_size: batchSize,
      workflow_mode: workflowMode,
      style_prefix: stylePrefix,
      style_suffix: styleSuffix,
      negative_prompt: negativePrompt,
      include_symbolism: includeSymbolism,
      auto_select_winner: autoSelectWinner,
      seed_policy: seedPolicy,
      fixed_seed: fixedSeed,
    }),
    [
      host,
      model,
      samplerName,
      scheduler,
      steps,
      cfg,
      width,
      height,
      batchSize,
      workflowMode,
      stylePrefix,
      styleSuffix,
      negativePrompt,
      includeSymbolism,
      autoSelectWinner,
      seedPolicy,
      fixedSeed,
    ],
  );

  const targetSocketsForBatch = useMemo(() => {
    const sorted = [...project.sockets].sort((a, b) => a.position - b.position);
    if (scope === "single_socket") {
      return sorted.filter((s) => s.id === targetSocketId && !s.locked);
    }
    if (scope === "empty_only") {
      return sorted.filter((s) => !s.locked && s.works.length === 0);
    }
    if (scope === "current_filter") {
      return filteredSockets.filter((s) => !s.locked);
    }
    return sorted.filter((s) => !s.locked);
  }, [project.sockets, filteredSockets, scope, targetSocketId]);

  const modelOptions =
    serverInfo && serverInfo.models.length > 0
      ? serverInfo.models
      : [
          model,
          "sd_xl_base_1.0.safetensors",
          "SD1.5\\v1-5-pruned-emaonly.ckpt",
        ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  const samplerOptions =
    serverInfo && serverInfo.samplers.length > 0
      ? serverInfo.samplers
      : [
          "euler",
          "euler_ancestral",
          "dpmpp_2m",
          "dpmpp_2m_sde",
          "dpmpp_sde",
          "uni_pc",
          "heun",
          "ddim",
        ];

  const schedulerOptions =
    serverInfo && serverInfo.schedulers.length > 0
      ? serverInfo.schedulers
      : ["normal", "karras", "exponential", "sgm_uniform", "simple", "beta"];

  const handleSaveProjectComfySettings = async () => {
    const ok = await board.updateProjectMetadata({
      ...(project.metadata ?? {}),
      comfy_config: currentConfig,
    });
    if (ok) {
      board.pushToast("success", "Saved ComfyUI project defaults & style wrapper");
    }
  };

  const handleRunGeneration = async () => {
    if (targetSocketsForBatch.length === 0) {
      board.pushToast(
        "error",
        "No unlocked cards with descriptions/titles match the selected scope.",
      );
      return;
    }

    // Persist current settings to project metadata
    await board.updateProjectMetadata({
      ...(project.metadata ?? {}),
      comfy_config: currentConfig,
    });

    setBatchRunning(true);
    cancelBatchRef.current = false;
    const total = targetSocketsForBatch.length;
    let completed = 0;

    for (let i = 0; i < total; i++) {
      if (cancelBatchRef.current) {
        board.pushToast(
          "info",
          `Stopped batch after ${completed} of ${total} card(s).`,
        );
        break;
      }
      const sock = targetSocketsForBatch[i];
      setBatchProgress({
        current: i + 1,
        total,
        currentTitle: sock.title || `Socket #${sock.position + 1}`,
      });

      const promptText =
        composeSocketComfyPrompt(sock, currentConfig).trim() ||
        `Card ${sock.position + 1}: ${sock.title}`;

      let seedForCard: number | undefined;
      if (seedPolicy === "fixed") {
        seedForCard = fixedSeed;
      } else if (seedPolicy === "deck_stride") {
        seedForCard = fixedSeed + sock.position * 17;
      }

      const ok = await board.generateComfyForSocket(sock.id, {
        host,
        prompt: promptText,
        negative_prompt: negativePrompt,
        model,
        sampler_name: samplerName,
        scheduler,
        steps,
        cfg,
        width,
        height,
        batch_size: batchSize,
        seed: seedForCard,
        workflow_mode: workflowMode,
        sync_prompt_to_notes: sock.notes.trim() === "",
        auto_select_winner: autoSelectWinner,
      });

      if (ok) completed++;
    }

    setBatchRunning(false);
    setBatchProgress(null);
    await refreshServerAndHistory(host);
  };

  const handleSendHistoryItemToSocket = async (item: ComfyHistoryItem) => {
    if (!targetSocketId) {
      board.pushToast("error", "Select a target card socket first.");
      return;
    }
    await board.importComfyHistoryToSocket(
      targetSocketId,
      item,
      overwriteNotesOnImport,
      host,
    );
  };

  return (
    <Modal title="⚡ ComfyUI Studio — Deck & Card Collaboration" onClose={onClose}>
      <div
        className="comfy-studio-modal"
        data-testid="comfy-studio-modal"
        style={{ minWidth: 580, maxWidth: 760 }}
      >
        {/* Top Status & Tab Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 14,
            borderBottom: "1px solid var(--border, rgba(128,128,128,0.25))",
            paddingBottom: 10,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className={activeTab === "batch" ? "primary" : ""}
              onClick={() => setActiveTab("batch")}
              data-testid="comfy-tab-batch"
            >
              ⚡ Generate Cards ({targetSocketsForBatch.length})
            </button>
            <button
              type="button"
              className={activeTab === "history" ? "primary" : ""}
              onClick={() => setActiveTab("history")}
              data-testid="comfy-tab-history"
            >
              📥 Send from ComfyUI ({historyItems.length})
            </button>
            <button
              type="button"
              className={activeTab === "settings" ? "primary" : ""}
              onClick={() => setActiveTab("settings")}
              data-testid="comfy-tab-settings"
            >
              ⚙ Style &amp; Workflow
            </button>
          </div>

          <span
            className="badge"
            style={{
              fontSize: 12,
              color: serverInfo?.online ? "var(--ok, #2e7d32)" : "var(--muted)",
            }}
          >
            {serverInfo?.online
              ? `● Connected (${serverInfo.host})`
              : "○ ComfyUI Offline"}
          </span>
        </div>

        {/* TAB 1: GENERATE ALL / SINGLE CARD */}
        {activeTab === "batch" && (
          <div data-testid="comfy-batch-panel">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <label className="field" style={{ margin: 0 }}>
                <span>Generation Scope</span>
                <select
                  aria-label="Generation Scope"
                  value={scope}
                  disabled={batchRunning}
                  onChange={(e) => setScope(e.target.value as BatchScope)}
                >
                  <option value="all_unlocked">
                    Generate All Unlocked Cards ({unlockedSockets.length})
                  </option>
                  <option value="empty_only">
                    Empty Unlocked Cards Only (
                    {unlockedSockets.filter((s) => s.works.length === 0).length}
                    )
                  </option>
                  <option value="current_filter">
                    Current Grid Filter Only (
                    {filteredSockets.filter((s) => !s.locked).length})
                  </option>
                  <option value="single_socket">
                    Single Card Position…
                  </option>
                </select>
              </label>

              {scope === "single_socket" ? (
                <label className="field" style={{ margin: 0 }}>
                  <span>Target Card Position</span>
                  <select
                    aria-label="Target Card Position"
                    value={targetSocketId}
                    disabled={batchRunning}
                    onChange={(e) => setTargetSocketId(e.target.value)}
                  >
                    {project.sockets.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.locked}>
                        #{s.position + 1} — {s.title || "Untitled"}{" "}
                        {s.locked ? "(Locked)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field" style={{ margin: 0 }}>
                  <span>Images per Card</span>
                  <select
                    aria-label="Batch Images per Card"
                    value={batchSize}
                    disabled={batchRunning}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  >
                    <option value={1}>1 Image per Card</option>
                    <option value={2}>2 Variations per Card</option>
                    <option value={4}>4 Variations per Card</option>
                    <option value={8}>8 Variations per Card</option>
                  </select>
                </label>
              )}

              <label className="field" style={{ margin: 0 }}>
                <span>Model / Checkpoint</span>
                <select
                  aria-label="Batch Model"
                  value={model}
                  disabled={batchRunning}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ margin: 0 }}>
                <span>KSampler</span>
                <select
                  aria-label="Batch KSampler"
                  value={samplerName}
                  disabled={batchRunning}
                  onChange={(e) => setSamplerName(e.target.value)}
                >
                  {samplerOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ margin: 0 }}>
                <span>Scheduler</span>
                <select
                  aria-label="Batch Scheduler"
                  value={scheduler}
                  disabled={batchRunning}
                  onChange={(e) => setScheduler(e.target.value)}
                >
                  {schedulerOptions.map((sch) => (
                    <option key={sch} value={sch}>
                      {sch}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ margin: 0 }}>
                <span>Card Aspect Ratio</span>
                <select
                  aria-label="Batch Card Aspect Ratio"
                  value={`${width}x${height}`}
                  disabled={batchRunning}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split("x").map(Number);
                    if (w && h) {
                      setWidth(w);
                      setHeight(h);
                    }
                  }}
                >
                  {CARD_ASPECT_PRESETS.map((p) => (
                    <option
                      key={`${p.width}x${p.height}`}
                      value={`${p.width}x${p.height}`}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <label className="field" style={{ margin: 0 }}>
                  <span>Steps</span>
                  <input
                    type="number"
                    min={1}
                    max={150}
                    aria-label="Batch Steps"
                    value={steps}
                    disabled={batchRunning}
                    onChange={(e) =>
                      setSteps(Math.max(1, Number(e.target.value) || 20))
                    }
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <span>CFG</span>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    max={30}
                    aria-label="Batch CFG"
                    value={cfg}
                    disabled={batchRunning}
                    onChange={(e) =>
                      setCfg(Math.max(1, Number(e.target.value) || 7.0))
                    }
                  />
                </label>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              <label
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <input
                  type="checkbox"
                  checked={includeSymbolism}
                  disabled={batchRunning}
                  onChange={(e) => setIncludeSymbolism(e.target.checked)}
                />
                <span>Include Symbolism Matrix</span>
              </label>

              <label
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <input
                  type="checkbox"
                  checked={autoSelectWinner}
                  disabled={batchRunning}
                  onChange={(e) => setAutoSelectWinner(e.target.checked)}
                />
                <span>Auto-select First Image as Winner on Empty Sockets</span>
              </label>

              <label
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <input
                  type="checkbox"
                  checked={workflowMode === "active_workflow"}
                  disabled={batchRunning}
                  onChange={(e) =>
                    setWorkflowMode(
                      e.target.checked ? "active_workflow" : "builtin",
                    )
                  }
                />
                <span>Use Active ComfyUI Workflow Template</span>
              </label>
            </div>

            {batchProgress && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "var(--surface-2, rgba(128,128,128,0.12))",
                  marginBottom: 12,
                }}
                data-testid="comfy-batch-progress"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  <strong>
                    Generating {batchProgress.current} / {batchProgress.total}:{" "}
                    {batchProgress.currentTitle}
                  </strong>
                  <span>
                    {Math.round(
                      (batchProgress.current / batchProgress.total) * 100,
                    )}
                    %
                  </span>
                </div>
                <progress
                  value={batchProgress.current}
                  max={batchProgress.total}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div className="modal-actions">
              <button type="button" onClick={onClose} disabled={batchRunning}>
                Close
              </button>
              {batchRunning ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    cancelBatchRef.current = true;
                  }}
                >
                  ⏹ Stop Batch After Current Card
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={targetSocketsForBatch.length === 0}
                  onClick={handleRunGeneration}
                  data-testid="comfy-start-batch-btn"
                >
                  {scope === "single_socket"
                    ? `⚡ Generate Single Card (${batchSize} img)`
                    : `⚡ Generate ${targetSocketsForBatch.length} Card(s) in ComfyUI`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SEND FROM COMFYUI TO CARD POSITION */}
        {activeTab === "history" && (
          <div data-testid="comfy-history-panel">
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 10,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <label className="field" style={{ flex: 1, margin: 0 }}>
                <span>Send Selected ComfyUI Image to Card Position</span>
                <select
                  aria-label="Destination Card Position"
                  value={targetSocketId}
                  onChange={(e) => setTargetSocketId(e.target.value)}
                >
                  {project.sockets.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.locked}>
                      Socket #{s.position + 1} — {s.title || "Untitled"}{" "}
                      {s.locked ? "(🔒 Locked)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  paddingBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={overwriteNotesOnImport}
                  onChange={(e) => setOverwriteNotesOnImport(e.target.checked)}
                />
                <span>Use ComfyUI Prompt as Card Description (Notes)</span>
              </label>

              <button
                type="button"
                onClick={() => refreshServerAndHistory(host)}
                disabled={loadingHistory}
              >
                🔄 Refresh ComfyUI Outputs
              </button>
            </div>

            {historyItems.length === 0 ? (
              <p className="extract-unavailable">
                No recent ComfyUI outputs found. Generate an image in ComfyUI
                (or drop any ComfyUI PNG directly onto a card in Cartouche to
                auto-extract its prompt and metadata).
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 10,
                  maxHeight: 380,
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {historyItems.map((item, idx) => (
                  <div
                    key={`${item.prompt_id}_${item.filename}_${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 6,
                      border:
                        "1px solid var(--border, rgba(128,128,128,0.25))",
                    }}
                    data-testid={`comfy-history-item-${idx}`}
                  >
                    <img
                      src={item.preview_url}
                      alt={item.filename}
                      style={{
                        width: 72,
                        height: 96,
                        objectFit: "cover",
                        borderRadius: 4,
                        background: "#1a1a1a",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          marginBottom: 4,
                        }}
                      >
                        {item.filename}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          marginBottom: 4,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                        title={item.positive_prompt}
                      >
                        <strong>Prompt:</strong>{" "}
                        {item.positive_prompt || "(No prompt text)"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {item.model || "Checkpoint"} · {item.sampler_name}/
                        {item.scheduler} · {item.steps} steps · CFG {item.cfg} ·
                        Seed {item.seed}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleSendHistoryItemToSocket(item)}
                      data-testid={`comfy-send-to-socket-${idx}`}
                    >
                      Send to Card →
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: STYLE WRAPPER & CONNECTION */}
        {activeTab === "settings" && (
          <div data-testid="comfy-settings-panel">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "end",
                marginBottom: 12,
              }}
            >
              <label className="field" style={{ margin: 0 }}>
                <span>ComfyUI Server URL</span>
                <input
                  value={host}
                  aria-label="ComfyUI Server URL"
                  placeholder="http://127.0.0.1:8188"
                  onChange={(e) => setHost(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => refreshServerAndHistory(host)}
              >
                Test Connection
              </button>
            </div>

            {serverInfo?.active_workflow.has_active_workflow && (
              <div
                style={{
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--surface-2, rgba(128,128,128,0.1))",
                  marginBottom: 12,
                }}
              >
                <strong>Active ComfyUI Workflow Detected:</strong> Prompt Node{" "}
                <code>
                  #{serverInfo.active_workflow.pos_prompt_node ?? "auto"}
                </code>{" "}
                · KSampler Node(s){" "}
                <code>
                  {serverInfo.active_workflow.ksampler_nodes.join(", ") ||
                    "none"}
                </code>{" "}
                · SaveImage Node(s){" "}
                <code>
                  {serverInfo.active_workflow.save_image_nodes.join(", ") ||
                    "none"}
                </code>
              </div>
            )}

            <label className="field">
              <span>Deck Style Prefix (prepended to every card prompt)</span>
              <input
                value={stylePrefix}
                aria-label="Deck Style Prefix"
                placeholder="e.g. woodcut tarot illustration, linocut ink texture, gold leaf accents"
                onChange={(e) => setStylePrefix(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Deck Style Suffix (appended to every card prompt)</span>
              <input
                value={styleSuffix}
                aria-label="Deck Style Suffix"
                placeholder="e.g. muted parchment ground, high contrast, archival print"
                onChange={(e) => setStyleSuffix(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Global Negative Prompt</span>
              <input
                value={negativePrompt}
                aria-label="Global Negative Prompt"
                onChange={(e) => setNegativePrompt(e.target.value)}
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <label className="field" style={{ margin: 0 }}>
                <span>Seed Policy for Batch Runs</span>
                <select
                  aria-label="Seed Policy"
                  value={seedPolicy}
                  onChange={(e) =>
                    setSeedPolicy(
                      e.target.value as "random" | "fixed" | "deck_stride",
                    )
                  }
                >
                  <option value="deck_stride">
                    Deterministic Deck Stride (Base + Card# × 17)
                  </option>
                  <option value="random">Random Seed Every Run</option>
                  <option value="fixed">Fixed Seed Across All Cards</option>
                </select>
              </label>

              <label className="field" style={{ margin: 0 }}>
                <span>Base / Fixed Seed</span>
                <input
                  type="number"
                  aria-label="Base Seed"
                  value={fixedSeed}
                  onChange={(e) =>
                    setFixedSeed(Number(e.target.value) || 424242)
                  }
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleSaveProjectComfySettings}
              >
                Save ComfyUI Defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
