# ComfyUI ↔ Cartouche Custom Nodes (`comfyui-cartouche`)

Custom node pack connecting **ComfyUI** directly to **Cartouche** (`.tarot` project bundles).

## Nodes Included

1. **`Cartouche: Read Card Prompt & Metadata` (`CartoucheReadSocketPrompt`)**
   - Reads a card position's description (`notes`), `title`, optional `symbolism` matrix, and deck style wrapper (`style_prefix`, `style_suffix`, `negative_prompt`) directly from `<project_path>/.tarot/project.sqlite`.
   - Outputs: `positive_prompt`, `negative_prompt`, `card_title`, and `recommended_seed`.

2. **`Cartouche: Send Image & Prompt to Card Socket` (`CartoucheSendToSocket`)**
   - Sends one or multiple generated images from a ComfyUI workflow directly into a card position (`1..250`) in Cartouche.
   - Automatically extracts the positive prompt, negative prompt, checkpoint/model, KSampler, scheduler, steps, CFG, and seed from ComfyUI's execution graph.
   - Writes the PNG with embedded ComfyUI `prompt` and `workflow` chunks into `.tarot/assets/`, creates the `.tarot/previews/` thumbnail, updates the card's description (`socket.notes`), and logs a `COMFYUI_NODE_PUSHED` entry in the socket's provenance ledger.

## Installation

Copy or symlink the `comfyui-cartouche` folder into your `ComfyUI/custom_nodes/` directory:

```powershell
Copy-Item -Recurse -Force .\comfyui-cartouche "$HOME\Documents\ComfyUI\custom_nodes\comfyui-cartouche"
```
