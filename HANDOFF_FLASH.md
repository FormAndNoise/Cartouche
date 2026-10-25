# HANDOFF_FLASH.md — Cartouche ↔ ComfyUI Collaboration & Live Desktop Testing

**Target Recipient**: LLM Agent (`Gemini Flash` / `3.8 Flash`)  
**Standard**: 100% ASD-STE100 (Simplified Technical English)  
**Workspace**: `C:\Users\Aarik\cartouche`  
**Repository**: `https://github.com/formandnoise/cartouche`  

---

## 1. System State Summary

1. The repository `formandnoise/cartouche` is cloned at `C:\Users\Aarik\cartouche`.
2. Visual Studio 2022 C++ Build Tools are installed. Windows Smart App Control is off.
3. All 54 Rust backend tests (`cargo test`) and 61 frontend tests (`pnpm test`) pass.
4. The local ComfyUI server runs on `http://localhost:8188`.
5. The user's test deck is unpacked at `C:\Users\Aarik\Downloads\ballet_tarot` (from `C:\Users\Aarik\Downloads\ballet_tarot.crtch`).
6. Changes are **not yet committed or pushed** to GitHub. Do not push until live ComfyUI image generation and history import are verified on screen.

---

## 2. Completed Implementation Inventory

### 2.1 Rust Backend (`src-tauri/`)
- **[`src-tauri/migrations/001_initial_schema.sql`](file:///c:/Users/Aarik/cartouche/src-tauri/migrations/001_initial_schema.sql) & [`src-tauri/src/db.rs`](file:///c:/Users/Aarik/cartouche/src-tauri/src/db.rs)**:
  - Added `metadata_json TEXT NOT NULL DEFAULT '{}'` to the `works` table.
  - Added `normalize_project_root` and `resolve_preview_path` to resolve moved `.tarot/previews/` paths.
- **[`src-tauri/src/project.rs`](file:///c:/Users/Aarik/cartouche/src-tauri/src/project.rs) & [`src-tauri/src/export.rs`](file:///c:/Users/Aarik/cartouche/src-tauri/src/export.rs)**:
  - Updated `get_project_service` and `import_project_service` to strip quotes, skip `.sqlite-shm`/`.sqlite-wal` lock files, and automatically unpack `.crtch` archives.
- **[`src-tauri/src/comfy.rs`](file:///c:/Users/Aarik/cartouche/src-tauri/src/comfy.rs)**:
  - Implemented 5 Tauri IPC commands: `comfy_get_server_info`, `comfy_queue_socket`, `comfy_poll_and_ingest`, `comfy_list_history`, and `comfy_import_from_history`.
  - Queries fast node endpoints (`/object_info/CheckpointLoaderSimple`, `/object_info/UNETLoader`, `/object_info/KSampler`) in `<20ms` instead of the 5.1 MB `/object_info` endpoint.
  - Supports both standard SD1.5/SDXL checkpoints (`CheckpointLoaderSimple`) and Flux UNET models (`UNETLoader` + `DualCLIPLoader` + `VAELoader`).
- **[`src-tauri/src/works.rs`](file:///c:/Users/Aarik/cartouche/src-tauri/src/works.rs)**:
  - Extracts embedded ComfyUI PNG `tEXt`/`iTXt` metadata when attaching PNG files and syncs the prompt into empty `socket.notes`.

### 2.2 ComfyUI Custom Node Pack (`comfyui-cartouche/`)
- **[`comfyui-cartouche/nodes.py`](file:///c:/Users/Aarik/cartouche/comfyui-cartouche/nodes.py)**:
  - Defines `CartoucheReadSocketPrompt` and `CartoucheSendToSocket`.
  - Installed into `C:\Users\Aarik\Documents\ComfyUI\custom_nodes\comfyui-cartouche` and `C:\Users\Aarik\Documents\ComfyUI\ComfyUI\custom_nodes\comfyui-cartouche`.

### 2.3 Frontend (`src/`)
- **[`src/components/ComfyGeneratorSection.tsx`](file:///c:/Users/Aarik/cartouche/src/components/ComfyGeneratorSection.tsx)**: Single-card ComfyUI generator inside `SocketDetailPanel`.
- **[`src/components/ComfyStudioModal.tsx`](file:///c:/Users/Aarik/cartouche/src/components/ComfyStudioModal.tsx)**: 3-tab modal (**Batch Deck Generator**, **Send from ComfyUI**, **Style & Workflow**).
- **[`src/api/mockClient.ts`](file:///c:/Users/Aarik/cartouche/src/api/mockClient.ts) & [`vite.config.ts`](file:///c:/Users/Aarik/cartouche/vite.config.ts)**: Bridges browser mode (`/__comfy_proxy`) to `http://127.0.0.1:8188`.

---

## 3. Procedure: Launch and Observe the Live Desktop App

> [!IMPORTANT]
> Antigravity terminal commands run inside an isolated Windows desktop (`exebox`). If you start `cartouche.exe` directly from PowerShell, the user **cannot see the window** on their physical monitor. You **must** launch `cartouche.exe` through the Windows Task Scheduler with the `/IT` (Interactive) flag so it appears on the user's physical screen (`Winsta0\Default`).

### Step 3.1: Ensure Vite Dev Server is Running on Port 1420
Run this command in background/daemon mode if port `1420` is not listening:
```powershell
$env:Path = "C:\Users\Aarik\scoop\shims;C:\Users\Aarik\scoop\apps\git\current\cmd;C:\Users\Aarik\.cargo\bin;C:\Program Files\nodejs;" + $env:Path
pnpm dev
```

### Step 3.2: Launch Visible `cartouche.exe` with WebView2 CDP (`Port 9222`)
Run [`tools/launch_visible.bat`](file:///c:/Users/Aarik/cartouche/tools/launch_visible.bat) via `schtasks` so the window opens on the user's physical monitor with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`:
```powershell
Stop-Process -Name "cartouche" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
$batPath = "C:\Users\Aarik\cartouche\tools\launch_visible.bat"
schtasks /Create /TN "CartoucheVisibleLaunch" /TR "`"$batPath`"" /SC ONCE /ST 00:00 /IT /F
schtasks /Run /TN "CartoucheVisibleLaunch"
Start-Sleep -Seconds 3
schtasks /Delete /TN "CartoucheVisibleLaunch" /F
```

### Step 3.3: Drive the Visible Window with [`tools/ui_ctl.mjs`](file:///c:/Users/Aarik/cartouche/tools/ui_ctl.mjs)
[`tools/ui_ctl.mjs`](file:///c:/Users/Aarik/cartouche/tools/ui_ctl.mjs) connects to `127.0.0.1:9222`, draws a visible orange cursor (`#D45500`), numbered Slate-Blue element badges (`[1]`, `[2]`, ...), and a bottom-left **🤖 FLASH USABILITY AGENT** status HUD inside the user's Cartouche window.

Available commands (always prepend `$env:Path = "C:\Program Files\nodejs;" + $env:Path`):
```powershell
# 1. Scan visible elements, update HUD, and save tools/latest_screen.jpg
node tools/ui_ctl.mjs observe "Status message for the user"

# 2. Move orange cursor to element [id] and click it
node tools/ui_ctl.mjs click <id> "Clicking <element>..."

# 3. Focus input/textarea [id] and set text
node tools/ui_ctl.mjs type <id> "<text>" "Typing <text>..."

# 4. Change a <select> dropdown [id] to <value>
node tools/ui_ctl.mjs select <id> "<value>" "Selecting <value>..."

# 5. Send a keyboard key (Enter, Escape, ArrowRight, Home)
node tools/ui_ctl.mjs key "<KeyName>" "Pressing <KeyName>..."

# 6. Update only the bottom-left HUD banner text
node tools/ui_ctl.mjs hud "Message"
```
After any command, view `C:\Users\Aarik\cartouche\tools\latest_screen.jpg` with `read_file` to inspect the visual state.

---

## 4. Remaining Tasks to Execute in Order

### Task 1: Fix the 3 UI/UX Friction Points Identified in the Audit
Edit [`src/styles.css`](file:///c:/Users/Aarik/cartouche/src/styles.css) (and component styles if needed) to fix these 3 issues:
1. **Sticky Top Navigation Bar**:
   - **Problem**: Selecting a socket card scrolls the outer container down and pushes `.top-bar` (`← Back`, `⚡ ComfyUI Studio`, `Planning Scratchpad`) out of the viewport.
   - **Fix**: Make `.top-bar` sticky (`position: sticky; top: 0; z-index: 20; background: var(--bg-surface);`) so top navigation stays pinned at all times.
2. **Eliminate Horizontal Scrollbar in Modals**:
   - **Problem**: `ComfyStudioModal` exhibits a ~5–10px horizontal scrollbar at the bottom.
   - **Fix**: Add `overflow-x: hidden; box-sizing: border-box;` to `.modal` / `.modal-body` and set `min-width: 0;` on grid children inside modals.
3. **Truncate Long Model Filenames in `<select>` Dropdowns**:
   - **Problem**: Long checkpoint names (such as `pulsarMaleGayNSFWBase_01DevFp8.safetensors` or `SD1.5\ghostmix_v20Bakedvae.safetensors`) stretch grid columns.
   - **Fix**: Add `min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` to `<select>` elements in [`src/styles.css`](file:///c:/Users/Aarik/cartouche/src/styles.css) and [`src/components/ComfyGeneratorSection.tsx`](file:///c:/Users/Aarik/cartouche/src/components/ComfyGeneratorSection.tsx).

### Task 2: Live End-to-End Test of Image Generation (Cartouche → ComfyUI → Cartouche)
This test **has not been observed yet** and **must be executed live** using [`tools/ui_ctl.mjs`](file:///c:/Users/Aarik/cartouche/tools/ui_ctl.mjs) while the user watches:
1. Verify ComfyUI is listening on `localhost:8188`:
   ```powershell
   netstat -ano | Select-String ":8188\s"
   ```
2. In the visible Cartouche window, open `C:\Users\Aarik\Downloads\ballet_tarot`.
3. Click an unlocked socket card (for example, Card 02 or Card 01) to open the right-hand `SocketDetailPanel`.
4. In the **ComfyUI Generator** section of the detail panel:
   - Ensure the card has a prompt/description in the `Notes` field (or enter a ballet tarot prompt such as `"Aprima ballerina poised on a cliff edge at dawn, tarot card illustration, ornate gold frame"`).
   - Select an installed fast checkpoint in the **Model** dropdown (e.g., `sd_xl_base_1.0.safetensors` or `SD1.5\ghostmix_v20Bakedvae.safetensors`).
   - Set **Steps** to `12`–`15` and **Images to Generate** (`batch_size`) to `1` or `2` for a fast test run.
   - Click the **Generate in ComfyUI** button.
5. Poll `node tools/ui_ctl.mjs observe "Waiting for ComfyUI to finish rendering..."` every few seconds until generation finishes and the new work thumbnail appears in the socket's Works list (`works.length` increases and toast reports `"Imported N generated image(s) from ComfyUI"`).
6. Read `C:\Users\Aarik\cartouche\tools\latest_screen.jpg` to verify that the **real model-generated image** (not a placeholder SVG) is displayed in the card and detail panel.

### Task 3: Live End-to-End Test of ComfyUI History Import (ComfyUI → Cartouche)
1. Click the **`⚡ ComfyUI Studio`** button in the top toolbar.
2. Click the **`📥 Send from ComfyUI`** tab (`history` tab).
3. Verify that recent ComfyUI renders appear in the history grid with their thumbnails, model names, seeds, and prompts.
4. Select a target unlocked socket in the **Target Card Socket** dropdown.
5. Check **Sync ComfyUI prompt into card description (`notes`)**.
6. Click **`📥 Send to Socket`** on a history item.
7. Close the modal, select the target socket card, and verify:
   - The imported image appears in the socket's **Works** list.
   - The socket's **Notes / Description** field was populated from the ComfyUI positive prompt.
   - Clicking **Load Settings into Generator** on the work populates the Model, Sampler, Scheduler, Steps, CFG, and Seed controls.

### Task 4: Rebuild, Test, Commit, and Push (After User Confirmation)
Once Tasks 1–3 are verified and the user confirms:
1. Run `pnpm lint` and `pnpm test`.
2. Run `cargo test` inside `src-tauri/` (using the VS 2022 `vcvars64.bat` environment as shown in `package.json` / `tools/`).
3. Stage, commit, and push all changes to `origin/main` (`https://github.com/formandnoise/cartouche`).
