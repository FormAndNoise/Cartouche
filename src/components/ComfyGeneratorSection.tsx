import { useEffect, useState } from "react";
import {
  composeSocketComfyPrompt,
  DEFAULT_COMFY_CONFIG,
  type ComfyProjectConfig,
  type ComfyServerInfo,
  type ComfyWorkMetadata,
  type Socket,
} from "../api/types";
import { useBoard } from "../state/context";

const RESOLUTION_PRESETS = [
  { label: "Tarot Standard (768×1344)", width: 768, height: 1344 },
  { label: "Tarot Wide (832×1216)", width: 832, height: 1216 },
  { label: "Poker / TCG (832×1152)", width: 832, height: 1152 },
  { label: "Square (1024×1024)", width: 1024, height: 1024 },
];

export interface ComfyGeneratorSectionProps {
  socket: Socket;
  loadedWorkMeta?: ComfyWorkMetadata | null;
  onClearLoadedMeta?: () => void;
  onOpenComfyStudio?: (tab: "batch" | "history" | "settings") => void;
}

export function ComfyGeneratorSection({
  socket,
  loadedWorkMeta,
  onClearLoadedMeta,
  onOpenComfyStudio,
}: ComfyGeneratorSectionProps) {
  const board = useBoard();
  const projectConfig: ComfyProjectConfig = {
    ...DEFAULT_COMFY_CONFIG,
    ...(board.project?.metadata?.comfy_config ?? {}),
  };

  const [serverInfo, setServerInfo] = useState<ComfyServerInfo | null>(null);
  const [model, setModel] = useState(
    projectConfig.model || DEFAULT_COMFY_CONFIG.model,
  );
  const [samplerName, setSamplerName] = useState(
    projectConfig.sampler_name || DEFAULT_COMFY_CONFIG.sampler_name,
  );
  const [scheduler, setScheduler] = useState(
    projectConfig.scheduler || DEFAULT_COMFY_CONFIG.scheduler,
  );
  const [steps, setSteps] = useState(
    projectConfig.steps ?? DEFAULT_COMFY_CONFIG.steps,
  );
  const [cfg, setCfg] = useState(projectConfig.cfg ?? DEFAULT_COMFY_CONFIG.cfg);
  const [batchSize, setBatchSize] = useState(
    projectConfig.batch_size ?? DEFAULT_COMFY_CONFIG.batch_size,
  );
  const [width, setWidth] = useState(
    projectConfig.width ?? DEFAULT_COMFY_CONFIG.width,
  );
  const [height, setHeight] = useState(
    projectConfig.height ?? DEFAULT_COMFY_CONFIG.height,
  );
  const [workflowMode, setWorkflowMode] = useState<
    "builtin" | "active_workflow"
  >(projectConfig.workflow_mode ?? "builtin");
  const [seedInput, setSeedInput] = useState<string>("");
  const [includeSymbolism, setIncludeSymbolism] = useState<boolean>(
    Boolean(projectConfig.include_symbolism),
  );
  const [autoSelectWinner, setAutoSelectWinner] = useState<boolean>(
    projectConfig.auto_select_winner ?? true,
  );

  const isGenerating = board.generatingSockets.has(socket.id);

  // Discover models, samplers, schedulers from ComfyUI
  useEffect(() => {
    let active = true;
    board.client
      .getComfyServerInfo(projectConfig.host)
      .then((info) => {
        if (!active) return;
        setServerInfo(info);
        if (info.online && info.models.length > 0 && !info.models.includes(model)) {
          setModel(info.models[0]);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [board.client, projectConfig.host, model]);

  // Apply settings when user clicks "Load Settings into Generator" on a Work
  useEffect(() => {
    if (!loadedWorkMeta) return;
    if (loadedWorkMeta.model) setModel(loadedWorkMeta.model);
    if (loadedWorkMeta.sampler_name)
      setSamplerName(loadedWorkMeta.sampler_name);
    if (loadedWorkMeta.scheduler) setScheduler(loadedWorkMeta.scheduler);
    if (loadedWorkMeta.steps) setSteps(loadedWorkMeta.steps);
    if (loadedWorkMeta.cfg !== undefined && loadedWorkMeta.cfg !== null)
      setCfg(loadedWorkMeta.cfg);
    if (loadedWorkMeta.seed !== undefined && loadedWorkMeta.seed !== null)
      setSeedInput(String(loadedWorkMeta.seed));
    if (loadedWorkMeta.width) setWidth(loadedWorkMeta.width);
    if (loadedWorkMeta.height) setHeight(loadedWorkMeta.height);
    onClearLoadedMeta?.();
  }, [loadedWorkMeta, onClearLoadedMeta]);

  const effectivePrompt = composeSocketComfyPrompt(socket, {
    ...projectConfig,
    include_symbolism: includeSymbolism,
  });

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

  const handleGenerateSingleCard = async () => {
    if (socket.locked) {
      board.pushToast(
        "error",
        "[LOCKED] Socket is locked — unlock it to generate images.",
      );
      return;
    }
    if (!effectivePrompt.trim()) {
      board.pushToast(
        "error",
        "Add a card description (Notes) or title before generating in ComfyUI.",
      );
      return;
    }

    const parsedSeed =
      seedInput.trim() !== "" && !Number.isNaN(Number(seedInput))
        ? Number(seedInput)
        : undefined;

    await board.generateComfyForSocket(socket.id, {
      host: projectConfig.host,
      prompt: effectivePrompt,
      negative_prompt: projectConfig.negative_prompt,
      model,
      sampler_name: samplerName,
      scheduler,
      steps,
      cfg,
      width,
      height,
      batch_size: batchSize,
      seed: parsedSeed,
      workflow_mode: workflowMode,
      sync_prompt_to_notes: false, // Notes already holds the card description
      auto_select_winner: autoSelectWinner,
    });
  };

  const currentResKey = `${width}x${height}`;

  return (
    <section
      className="comfy-generator-section"
      data-testid="comfy-generator-section"
    >
      <div className="field-header-row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>⚡ ComfyUI Card Generator</h3>
        <span
          className="badge"
          title={serverInfo?.host ?? DEFAULT_COMFY_CONFIG.host}
          style={{
            fontSize: 11,
            color: serverInfo?.online ? "var(--ok, #2e7d32)" : "var(--muted)",
          }}
        >
          {serverInfo?.online ? "● ComfyUI Online" : "○ ComfyUI Offline"}
        </span>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          marginTop: 0,
          marginBottom: 10,
        }}
      >
        Uses this card&apos;s <strong>Notes (Description)</strong> as the
        outbound prompt, or pulls images &amp; prompts created in ComfyUI into
        this socket.
      </p>

      <div className="comfy-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>Model / Checkpoint</span>
          <select
            aria-label="ComfyUI Model"
            value={model}
            disabled={socket.locked || isGenerating}
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
          <span>Images to Generate</span>
          <select
            aria-label="Images to Generate"
            value={batchSize}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          >
            <option value={1}>1 Image (Single)</option>
            <option value={2}>2 Variations</option>
            <option value={4}>4 Variations (Batch)</option>
            <option value={8}>8 Variations (Batch)</option>
          </select>
        </label>

        <label className="field" style={{ margin: 0 }}>
          <span>KSampler</span>
          <select
            aria-label="KSampler"
            value={samplerName}
            disabled={socket.locked || isGenerating}
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
            aria-label="Scheduler"
            value={scheduler}
            disabled={socket.locked || isGenerating}
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
          <span>Steps</span>
          <input
            type="number"
            min={1}
            max={150}
            aria-label="Steps"
            value={steps}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setSteps(Math.max(1, Number(e.target.value) || 20))}
          />
        </label>

        <label className="field" style={{ margin: 0 }}>
          <span>CFG Scale</span>
          <input
            type="number"
            step="0.5"
            min={1}
            max={30}
            aria-label="CFG Scale"
            value={cfg}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setCfg(Math.max(1, Number(e.target.value) || 7.0))}
          />
        </label>

        <label className="field" style={{ margin: 0 }}>
          <span>Card Aspect Ratio</span>
          <select
            aria-label="Card Aspect Ratio"
            value={currentResKey}
            disabled={socket.locked || isGenerating}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              if (w && h) {
                setWidth(w);
                setHeight(h);
              }
            }}
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field" style={{ margin: 0 }}>
          <span>Seed (blank = random)</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label="ComfyUI Seed"
            placeholder="Random seed"
            value={seedInput}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setSeedInput(e.target.value)}
          />
        </label>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12,
          marginBottom: 10,
        }}
      >
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <input
            type="checkbox"
            checked={includeSymbolism}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setIncludeSymbolism(e.target.checked)}
          />
          <span>Include Symbolism Matrix in Prompt</span>
        </label>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <input
            type="checkbox"
            checked={autoSelectWinner}
            disabled={socket.locked || isGenerating}
            onChange={(e) => setAutoSelectWinner(e.target.checked)}
          />
          <span>Auto-select as Winner if socket empty</span>
        </label>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <input
            type="checkbox"
            checked={workflowMode === "active_workflow"}
            disabled={socket.locked || isGenerating}
            onChange={(e) =>
              setWorkflowMode(
                e.target.checked ? "active_workflow" : "builtin",
              )
            }
          />
          <span>Inject into Active ComfyUI Workflow</span>
        </label>
      </div>

      {effectivePrompt && (
        <div
          style={{
            fontSize: 11,
            padding: "6px 8px",
            borderRadius: 4,
            background: "var(--surface-2, rgba(128,128,128,0.08))",
            marginBottom: 10,
            wordBreak: "break-word",
          }}
          data-testid="comfy-effective-prompt"
        >
          <strong>Outbound Prompt:</strong> {effectivePrompt}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="primary"
          disabled={socket.locked || isGenerating}
          onClick={handleGenerateSingleCard}
          data-testid="comfy-generate-single-btn"
        >
          {isGenerating
            ? "⏳ Generating in ComfyUI…"
            : batchSize > 1
              ? `⚡ Generate ${batchSize} Images for Card`
              : "⚡ Generate Card in ComfyUI"}
        </button>

        {onOpenComfyStudio && (
          <button
            type="button"
            disabled={socket.locked}
            onClick={() => onOpenComfyStudio("history")}
            data-testid="comfy-pull-history-btn"
          >
            📥 Pull Image from ComfyUI…
          </button>
        )}
      </div>
    </section>
  );
}
