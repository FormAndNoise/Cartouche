import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  composeSocketComfyPrompt,
  parseWorkComfyMetadata,
  type Socket,
} from "../api/types";
import { createProjectViaUi } from "./harness";

describe("ComfyUI bidirectional integration & generation", () => {
  it("composes prompts from card description, tenant symbolism, and project style wrapper", () => {
    const socket: Socket = {
      id: "s_1",
      position: 0,
      title: "The Star",
      notes: "A radiant eight-pointed star above a tranquil pool",
      locked: false,
      selected_work_id: null,
      works: [],
      metadata: {
        status: "in_progress",
        medium: "Etching",
        tags: "major",
        due_date: null,
        symbolism: {
          composition_brief: "Eight-pointed celestial star",
          visual_motifs: "Flowing water urns",
          color_palette: "Indigo, Silver, Gold",
        },
      },
    };

    const prompt = composeSocketComfyPrompt(socket, {
      style_prefix: "Woodblock tarot illustration",
      style_suffix: "fine linework, high contrast",
      include_symbolism: true,
    });

    expect(prompt).toContain("Woodblock tarot illustration");
    expect(prompt).toContain(
      "A radiant eight-pointed star above a tranquil pool",
    );
    expect(prompt).toContain("Eight-pointed celestial star");
    expect(prompt).toContain("Palette: Indigo, Silver, Gold");
    expect(prompt).toContain("fine linework, high contrast");
  });

  it("generates single or multiple images from within Cartouche with model & KSampler dropdowns", async () => {
    const { getByTestId, getByLabelText, client } = await createProjectViaUi(
      "Comfy Deck",
      3,
    );
    const user = userEvent.setup();

    // Open Socket #1 detail panel
    await user.click(getByTestId("socket-card-s_1"));
    expect(getByTestId("comfy-generator-section")).toBeInTheDocument();

    // Enter a card description (Socket.notes) which serves as the ComfyUI prompt
    const notesArea = getByLabelText("Notes for socket 1");
    await user.clear(notesArea);
    await user.type(
      notesArea,
      "A lone hermit holding a glowing lantern on a mountain peak",
    );
    await user.tab(); // Commit debounced field on blur

    // Select Model, KSampler, Scheduler, and Images to Generate (2 images)
    await user.selectOptions(
      getByLabelText("ComfyUI Model"),
      "flux1-dev-fp8.safetensors",
    );
    await user.selectOptions(getByLabelText("KSampler"), "dpmpp_2m");
    await user.selectOptions(getByLabelText("Scheduler"), "karras");
    await user.selectOptions(getByLabelText("Images to Generate"), "2");

    // Click Generate
    await user.click(getByTestId("comfy-generate-single-btn"));

    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      expect(p.sockets[0].works).toHaveLength(2);
      const meta = parseWorkComfyMetadata(p.sockets[0].works[0]);
      expect(meta?.positive_prompt).toContain(
        "A lone hermit holding a glowing lantern on a mountain peak",
      );
      expect(meta?.model).toBe("flux1-dev-fp8.safetensors");
      expect(meta?.sampler_name).toBe("dpmpp_2m");
      expect(meta?.scheduler).toBe("karras");
    });
  });

  it("sends an image from ComfyUI history to a card position and populates the card description from the ComfyUI prompt", async () => {
    const { getByTestId, client } = await createProjectViaUi(
      "Comfy Import Deck",
      3,
    );
    const user = userEvent.setup();

    // Open ComfyUI Studio modal from header
    await user.click(getByTestId("open-comfy-studio-btn"));
    expect(getByTestId("comfy-studio-modal")).toBeInTheDocument();

    // Switch to "Send from ComfyUI to Card" tab
    await user.click(getByTestId("comfy-tab-history"));
    await waitFor(() =>
      expect(getByTestId("comfy-history-panel")).toBeInTheDocument(),
    );

    // Send the first ComfyUI history item to Socket #1
    const sendButton = await waitFor(() =>
      getByTestId("comfy-send-to-socket-0"),
    );
    await user.click(sendButton);

    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      const sock = p.sockets[0];
      expect(sock.works).toHaveLength(1);
      // Card description (notes) was populated from the ComfyUI image's prompt
      expect(sock.notes).toContain(
        "A young traveler stepping toward a sunlit cliff edge",
      );
      const meta = parseWorkComfyMetadata(sock.works[0]);
      expect(meta?.positive_prompt).toContain(
        "A young traveler stepping toward a sunlit cliff edge",
      );
    });
  });

  it("supports Generate All Unlocked Cards in batch mode while skipping locked cards", async () => {
    const { getByTestId, getByRole, client } = await createProjectViaUi(
      "Batch Comfy Deck",
      3,
    );
    const user = userEvent.setup();

    // Lock socket #2 (s_2) via UI so BoardProvider state reflects it
    await user.click(getByTestId("socket-card-s_2"));
    await user.click(getByRole("button", { name: /^Lock$/i }));

    // Open ComfyUI Studio modal and click Generate All
    await user.click(getByTestId("open-comfy-studio-btn"));
    await user.click(getByTestId("comfy-start-batch-btn"));

    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      expect(p.sockets[0].works.length).toBeGreaterThanOrEqual(1);
      expect(p.sockets[1].works).toHaveLength(0); // Locked socket untouched
      expect(p.sockets[2].works.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders embedded interactive workflow canvas and sets active workflow as deck default", async () => {
    const { getByTestId, client } = await createProjectViaUi(
      "Canvas Comfy Deck",
      3,
    );
    const user = userEvent.setup();

    // Open ComfyUI Studio modal
    await user.click(getByTestId("open-comfy-studio-btn"));
    expect(getByTestId("comfy-studio-modal")).toBeInTheDocument();

    // Click "Workflow Canvas" tab
    await user.click(getByTestId("comfy-tab-canvas"));
    await waitFor(() =>
      expect(getByTestId("comfy-canvas-panel")).toBeInTheDocument(),
    );

    // Verify toolbar controls: reload button and external browser link
    expect(getByTestId("comfy-canvas-reload-btn")).toBeInTheDocument();
    const externalLink = getByTestId("comfy-canvas-open-external-btn");
    expect(externalLink).toHaveAttribute("href", "http://127.0.0.1:8188");
    expect(externalLink).toHaveAttribute("target", "_blank");

    // Click "Use Active Workflow as Deck Default" button
    const useWorkflowBtn = getByTestId("use-canvas-workflow-btn");
    await user.click(useWorkflowBtn);

    // Verify project metadata persisted workflow_mode: "active_workflow"
    await waitFor(async () => {
      const p = await client.getProject("/tmp/p");
      expect(p.metadata?.comfy_config?.workflow_mode).toBe("active_workflow");
    });
  });
});
