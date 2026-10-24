"""
ComfyUI ↔ Cartouche Collaboration Custom Nodes
Form & Noise — Local-first tarot & card series workspace bridge.

Provides two nodes inside ComfyUI:
1. CartoucheReadSocketPrompt:
   Reads a card position's description (notes), title, symbolism matrix,
   and project style wrapper from a Cartouche (.tarot) project folder
   and outputs (positive_prompt, negative_prompt, card_title, recommended_seed).

2. CartoucheSendToSocket (Output Node):
   Sends one or multiple generated images directly from ComfyUI into a target
   card position (Socket) in a Cartouche project, embeds PNG prompt/workflow
   chunks, records KSampler/Model provenance metadata, and sets the ComfyUI
   prompt as the card's description (Socket.notes) in Cartouche.
"""

from __future__ import annotations

import datetime
import hashlib
import io
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _resolve_sqlite_path(project_path: str) -> Tuple[Path, Path]:
    """Return (project_root, sqlite_file_path) given a project directory or .tarot path."""
    raw = Path(project_path.strip().strip('"').strip("'")).expanduser().resolve()
    if raw.name == "project.sqlite":
        tarot_dir = raw.parent
        root_dir = tarot_dir.parent
        return root_dir, raw
    if raw.name == ".tarot":
        return raw.parent, raw / "project.sqlite"
    return raw, raw / ".tarot" / "project.sqlite"


def _extract_metadata_from_prompt_graph(
    prompt_graph: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Extract positive_prompt, negative_prompt, model, sampler, scheduler, steps, cfg, seed from ComfyUI prompt graph."""
    meta: Dict[str, Any] = {"source": "comfyui"}
    if not isinstance(prompt_graph, dict):
        return meta

    positive_texts: List[str] = []
    negative_texts: List[str] = []
    pos_node_ids: List[str] = []
    neg_node_ids: List[str] = []

    for _node_id, node in prompt_graph.items():
        if not isinstance(node, dict):
            continue
        class_type = str(node.get("class_type", ""))
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            continue

        if class_type in (
            "CheckpointLoaderSimple",
            "CheckpointLoader",
            "UNETLoader",
            "DiffusionModelLoader",
        ):
            ckpt = inputs.get("ckpt_name") or inputs.get("unet_name")
            if isinstance(ckpt, str) and ckpt and "model" not in meta:
                meta["model"] = ckpt

        if class_type in ("KSampler", "KSamplerAdvanced", "SamplerCustom"):
            if "sampler_name" in inputs and isinstance(inputs["sampler_name"], str):
                meta["sampler_name"] = inputs["sampler_name"]
            if "scheduler" in inputs and isinstance(inputs["scheduler"], str):
                meta["scheduler"] = inputs["scheduler"]
            if "steps" in inputs and isinstance(inputs["steps"], (int, float)):
                meta["steps"] = int(inputs["steps"])
            if "cfg" in inputs and isinstance(inputs["cfg"], (int, float)):
                meta["cfg"] = float(inputs["cfg"])
            seed_val = inputs.get("seed") if "seed" in inputs else inputs.get("noise_seed")
            if isinstance(seed_val, (int, float)):
                meta["seed"] = int(seed_val)

            pos_ref = inputs.get("positive")
            if isinstance(pos_ref, list) and len(pos_ref) >= 1:
                pos_node_ids.append(str(pos_ref[0]))
            neg_ref = inputs.get("negative")
            if isinstance(neg_ref, list) and len(neg_ref) >= 1:
                neg_node_ids.append(str(neg_ref[0]))

        if class_type in ("EmptyLatentImage", "EmptySD3LatentImage"):
            if isinstance(inputs.get("width"), (int, float)):
                meta["width"] = int(inputs["width"])
            if isinstance(inputs.get("height"), (int, float)):
                meta["height"] = int(inputs["height"])

    for pid in pos_node_ids:
        pnode = prompt_graph.get(pid)
        if isinstance(pnode, dict):
            txt = pnode.get("inputs", {}).get("text")
            if isinstance(txt, str) and txt.strip():
                positive_texts.append(txt.strip())

    for nid in neg_node_ids:
        nnode = prompt_graph.get(nid)
        if isinstance(nnode, dict):
            txt = nnode.get("inputs", {}).get("text")
            if isinstance(txt, str) and txt.strip():
                negative_texts.append(txt.strip())

    if not positive_texts:
        for _node_id, node in prompt_graph.items():
            if not isinstance(node, dict):
                continue
            if "CLIPTextEncode" in str(node.get("class_type", "")):
                txt = node.get("inputs", {}).get("text")
                if isinstance(txt, str) and txt.strip():
                    lower = txt.lower()
                    if "watermark" in lower or "blurry" in lower or "ugly" in lower:
                        negative_texts.append(txt.strip())
                    else:
                        positive_texts.append(txt.strip())

    if positive_texts:
        meta["positive_prompt"] = positive_texts[0]
    if negative_texts:
        meta["negative_prompt"] = negative_texts[0]

    return meta


class CartoucheReadSocketPrompt:
    """
    Reads a card's description (notes), title, symbolism matrix, and deck style wrapper
    from a Cartouche project so ComfyUI can generate directly from Cartouche card data.
    """

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "project_path": (
                    "STRING",
                    {
                        "default": "C:/Users/Aarik/Projects/my-deck",
                        "multiline": False,
                    },
                ),
                "socket_position": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 250,
                        "step": 1,
                    },
                ),
                "include_symbolism": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "fallback_prompt": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT")
    RETURN_NAMES = (
        "positive_prompt",
        "negative_prompt",
        "card_title",
        "recommended_seed",
    )
    FUNCTION = "read_socket"
    CATEGORY = "Cartouche"

    def read_socket(
        self,
        project_path: str,
        socket_position: int,
        include_symbolism: bool = True,
        fallback_prompt: str = "",
    ) -> Tuple[str, str, str, int]:
        _root, db_path = _resolve_sqlite_path(project_path)
        pos_zero_based = max(0, int(socket_position) - 1)
        default_seed = 424242 + pos_zero_based * 17
        default_neg = (
            "blurry, low quality, watermark, signature, ugly, deformed, extra text, border"
        )

        if not db_path.exists():
            prompt_out = fallback_prompt.strip() or f"Tarot card #{socket_position}"
            return (prompt_out, default_neg, f"Card #{socket_position}", default_seed)

        conn = sqlite3.connect(str(db_path))
        try:
            cur = conn.cursor()
            cur.execute("SELECT metadata_json FROM projects WHERE id = 1")
            proj_row = cur.fetchone()
            proj_meta = json.loads(proj_row[0]) if proj_row and proj_row[0] else {}
            comfy_cfg = proj_meta.get("comfy_config") or {}

            cur.execute(
                "SELECT title, notes, metadata_json FROM sockets WHERE position = ?",
                (pos_zero_based,),
            )
            sock_row = cur.fetchone()
            if not sock_row:
                prompt_out = fallback_prompt.strip() or f"Tarot card #{socket_position}"
                return (prompt_out, default_neg, f"Card #{socket_position}", default_seed)

            title, notes, sock_meta_raw = sock_row
            title = (title or "").strip()
            notes = (notes or "").strip()
            sock_meta = json.loads(sock_meta_raw) if sock_meta_raw else {}

            parts: List[str] = []
            style_prefix = (comfy_cfg.get("style_prefix") or "").strip()
            style_suffix = (comfy_cfg.get("style_suffix") or "").strip()
            if style_prefix:
                parts.append(style_prefix)

            base_desc = notes or title or fallback_prompt.strip() or f"Card #{socket_position}"
            parts.append(base_desc)

            if include_symbolism and isinstance(sock_meta.get("symbolism"), dict):
                sym = sock_meta["symbolism"]
                sym_parts = [
                    (sym.get("composition_brief") or "").strip(),
                    (sym.get("visual_motifs") or "").strip(),
                ]
                palette = (sym.get("color_palette") or "").strip()
                if palette:
                    sym_parts.append(f"Palette: {palette}")
                sym_filtered = [p for p in sym_parts if p]
                if sym_filtered:
                    parts.append(". ".join(sym_filtered))

            if style_suffix:
                parts.append(style_suffix)

            positive_prompt = ", ".join(parts)
            negative_prompt = (comfy_cfg.get("negative_prompt") or default_neg).strip()
            base_seed = int(comfy_cfg.get("fixed_seed") or 424242)
            recommended_seed = base_seed + pos_zero_based * 17

            return (
                positive_prompt,
                negative_prompt,
                title or f"Socket #{socket_position}",
                recommended_seed,
            )
        finally:
            conn.close()


class CartoucheSendToSocket:
    """
    Sends one or multiple generated images from ComfyUI directly to a card position
    (Socket) in a Cartouche project (.tarot/project.sqlite) and stores the prompt
    as the card's description (Socket.notes).
    """

    def __init__(self) -> None:
        pass

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "images": ("IMAGE",),
                "project_path": (
                    "STRING",
                    {
                        "default": "C:/Users/Aarik/Projects/my-deck",
                        "multiline": False,
                    },
                ),
                "socket_position": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 250,
                        "step": 1,
                    },
                ),
                "update_card_description": ("BOOLEAN", {"default": True}),
                "auto_select_winner": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "prompt_description": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                    },
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status_message",)
    FUNCTION = "send_to_socket"
    OUTPUT_NODE = True
    CATEGORY = "Cartouche"

    def send_to_socket(
        self,
        images: Any,
        project_path: str,
        socket_position: int,
        update_card_description: bool = True,
        auto_select_winner: bool = True,
        prompt_description: str = "",
        prompt: Optional[Dict[str, Any]] = None,
        extra_pnginfo: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        root_dir, db_path = _resolve_sqlite_path(project_path)
        if not db_path.exists():
            msg = f"[Cartouche] Project database not found at {db_path}"
            return {"ui": {"text": [msg]}, "result": (msg,)}

        import numpy as np
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo

        pos_zero_based = max(0, int(socket_position) - 1)
        extracted_meta = _extract_metadata_from_prompt_graph(prompt)

        effective_prompt = (
            prompt_description.strip()
            or extracted_meta.get("positive_prompt")
            or ""
        )
        if effective_prompt:
            extracted_meta["positive_prompt"] = effective_prompt

        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            cur = conn.cursor()
            cur.execute(
                "SELECT id, title, notes, metadata_json, locked, selected_work_id "
                "FROM sockets WHERE position = ?",
                (pos_zero_based,),
            )
            sock_row = cur.fetchone()
            if not sock_row:
                msg = f"[Cartouche] Socket position #{socket_position} does not exist in project."
                return {"ui": {"text": [msg]}, "result": (msg,)}

            socket_id, sock_title, sock_notes, sock_meta_raw, locked, selected_work_id = sock_row
            if locked:
                msg = f"[Cartouche] Socket #{socket_position} ({sock_title or 'Untitled'}) is LOCKED. Unlock in Cartouche first."
                return {"ui": {"text": [msg]}, "result": (msg,)}

            assets_dir = root_dir / ".tarot" / "assets"
            previews_dir = root_dir / ".tarot" / "previews"
            assets_dir.mkdir(parents=True, exist_ok=True)
            previews_dir.mkdir(parents=True, exist_ok=True)

            added_work_ids: List[int] = []
            last_sha256 = ""
            last_byte_size = 0
            last_filename = ""

            for idx, image_tensor in enumerate(images):
                # Convert ComfyUI [H, W, C] float32 tensor (0..1) to uint8 PIL Image
                arr = 255.0 * image_tensor.cpu().numpy()
                pil_img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
                width, height = pil_img.size

                png_info = PngInfo()
                if prompt is not None:
                    png_info.add_text("prompt", json.dumps(prompt))
                if isinstance(extra_pnginfo, dict):
                    for k, v in extra_pnginfo.items():
                        png_info.add_text(str(k), json.dumps(v))

                buf = io.BytesIO()
                pil_img.save(buf, format="PNG", pnginfo=png_info, compress_level=4)
                png_bytes = buf.getvalue()

                sha256 = hashlib.sha256(png_bytes).hexdigest()
                asset_filename = f"{sha256}.png"
                asset_abs_path = assets_dir / asset_filename
                asset_rel_path = f"assets/{asset_filename}"

                if not asset_abs_path.exists():
                    asset_abs_path.write_bytes(png_bytes)

                work_meta = dict(extracted_meta)
                work_meta["width"] = width
                work_meta["height"] = height
                if prompt is not None:
                    work_meta["raw_prompt_json"] = json.dumps(prompt)

                ts_short = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
                display_title = f"ComfyUI_Card{socket_position:02d}_{ts_short}_{idx + 1}.png"
                byte_size = len(png_bytes)

                cur.execute(
                    "INSERT INTO works (socket_id, title, asset_hash, asset_path, media_kind, mime_type, byte_size, metadata_json) "
                    "VALUES (?, ?, ?, ?, 'image', 'image/png', ?, ?)",
                    (
                        socket_id,
                        display_title,
                        sha256,
                        asset_rel_path,
                        byte_size,
                        json.dumps(work_meta),
                    ),
                )
                work_id = int(cur.lastrowid)
                added_work_ids.append(work_id)
                last_sha256 = sha256
                last_byte_size = byte_size
                last_filename = display_title

                # Generate 400x400 thumbnail preview matching src-tauri/src/work.rs
                thumb = pil_img.copy()
                thumb.thumbnail((400, 400))
                preview_abs_path = previews_dir / f"{work_id}.png"
                thumb.save(preview_abs_path, format="PNG")

                cur.execute(
                    "INSERT INTO previews (work_id, state, path) VALUES (?, 'ready', ?)",
                    (work_id, str(preview_abs_path)),
                )
                cur.execute(
                    "INSERT INTO extracted_text (work_id, state) VALUES (?, 'unsupported')",
                    (work_id,),
                )

            # Update card description (socket.notes) if requested or if currently empty
            if effective_prompt and (
                update_card_description or not (sock_notes or "").strip()
            ):
                cur.execute(
                    "UPDATE sockets SET notes = ? WHERE id = ?",
                    (effective_prompt, socket_id),
                )

            # Auto-select winner if socket has no winner yet
            if auto_select_winner and selected_work_id is None and added_work_ids:
                cur.execute(
                    "UPDATE sockets SET selected_work_id = ? WHERE id = ?",
                    (added_work_ids[0], socket_id),
                )

            # Append provenance ledger record
            try:
                sock_meta = json.loads(sock_meta_raw) if sock_meta_raw else {}
            except Exception:
                sock_meta = {}
            ledger = sock_meta.get("provenance_ledger")
            if not isinstance(ledger, list):
                ledger = []

            now_iso = (
                datetime.datetime.now(datetime.timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z")
            )
            ledger.append(
                {
                    "id": f"prov-{len(ledger) + 1}",
                    "timestamp": now_iso,
                    "event": "COMFYUI_NODE_PUSHED",
                    "work_id": str(added_work_ids[-1]) if added_work_ids else None,
                    "asset_filename": last_filename,
                    "sha256_hash": last_sha256,
                    "byte_size": last_byte_size,
                    "notes": (
                        f"Pushed {len(added_work_ids)} image(s) from ComfyUI node "
                        f"(Model: {extracted_meta.get('model', 'unknown')}, "
                        f"Sampler: {extracted_meta.get('sampler_name', 'default')})"
                    ),
                }
            )
            sock_meta["provenance_ledger"] = ledger
            cur.execute(
                "UPDATE sockets SET metadata_json = ? WHERE id = ?",
                (json.dumps(sock_meta), socket_id),
            )

            conn.commit()
            msg = (
                f"[Cartouche] Sent {len(added_work_ids)} image(s) to Socket #{socket_position} "
                f"({sock_title or 'Untitled'}) and synced prompt description."
            )
            return {"ui": {"text": [msg]}, "result": (msg,)}
        finally:
            conn.close()


NODE_CLASS_MAPPINGS = {
    "CartoucheReadSocketPrompt": CartoucheReadSocketPrompt,
    "CartoucheSendToSocket": CartoucheSendToSocket,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CartoucheReadSocketPrompt": "Cartouche: Read Card Prompt & Metadata",
    "CartoucheSendToSocket": "Cartouche: Send Image & Prompt to Card Socket",
}
