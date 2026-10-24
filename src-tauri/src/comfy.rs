use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::db::{open, read_socket};
use crate::error::AppError;
use crate::models::{Socket, SocketId};
use crate::work::attach_work_data_service;

pub const DEFAULT_COMFY_HOST: &str = "http://127.0.0.1:8188";

pub const DEFAULT_SAMPLERS: &[&str] = &[
    "euler",
    "euler_ancestral",
    "dpmpp_2m",
    "dpmpp_2m_sde",
    "dpmpp_sde",
    "uni_pc",
    "heun",
    "ddim",
    "lcm",
];

pub const DEFAULT_SCHEDULERS: &[&str] = &[
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "simple",
    "ddim_uniform",
    "beta",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ComfyWorkMetadata {
    pub source: String,
    pub positive_prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub model: Option<String>,
    pub sampler_name: Option<String>,
    pub scheduler: Option<String>,
    pub steps: Option<u32>,
    pub cfg: Option<f64>,
    pub seed: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub prompt_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DetectedWorkflowNodes {
    pub has_active_workflow: bool,
    pub pos_prompt_node: Option<String>,
    pub neg_prompt_node: Option<String>,
    pub ksampler_nodes: Vec<String>,
    pub save_image_nodes: Vec<String>,
    pub checkpoint_node: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyServerInfo {
    pub host: String,
    pub online: bool,
    pub models: Vec<String>,
    pub samplers: Vec<String>,
    pub schedulers: Vec<String>,
    pub active_workflow: DetectedWorkflowNodes,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyGenerateRequest {
    pub host: Option<String>,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model: String,
    pub sampler_name: String,
    pub scheduler: String,
    pub steps: u32,
    pub cfg: f64,
    pub width: u32,
    pub height: u32,
    pub batch_size: u32,
    pub seed: Option<u64>,
    /// "builtin" or "active_workflow"
    pub workflow_mode: Option<String>,
    /// Sync prompt back to socket.notes
    pub sync_prompt_to_notes: Option<bool>,
    /// Auto-select first generated work as winner if socket has no winner
    pub auto_select_winner: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyQueueResponse {
    pub prompt_id: String,
    pub socket_id: String,
    pub seed_used: u64,
    pub effective_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyPollResponse {
    pub prompt_id: String,
    /// "running" | "done" | "failed"
    pub status: String,
    pub works_added: usize,
    pub socket: Option<Socket>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyHistoryItem {
    pub prompt_id: String,
    pub filename: String,
    pub subfolder: String,
    pub folder_type: String,
    pub preview_url: String,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub model: String,
    pub sampler_name: String,
    pub scheduler: String,
    pub steps: u32,
    pub cfg: f64,
    pub seed: u64,
    pub width: u32,
    pub height: u32,
}

// ============================================================================
// 1. PNG tEXt / iTXt Chunk Parser & Builder for ComfyUI Metadata
// ============================================================================

const PNG_SIG: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

/// Compute standard CRC-32 (IEEE 802.3) for PNG chunks.
fn crc32(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in bytes {
        crc ^= b as u32;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

/// Embed a `tEXt` chunk (`keyword\0text`) right before the `IEND` chunk of a PNG.
pub fn embed_png_text_chunk(png_bytes: &[u8], keyword: &str, text: &str) -> Vec<u8> {
    if png_bytes.len() < 8 || &png_bytes[0..8] != PNG_SIG {
        return png_bytes.to_vec();
    }

    let mut chunk_data = Vec::with_capacity(keyword.len() + 1 + text.len());
    chunk_data.extend_from_slice(keyword.as_bytes());
    chunk_data.push(0);
    chunk_data.extend_from_slice(text.as_bytes());

    let mut full_chunk = Vec::with_capacity(12 + chunk_data.len());
    full_chunk.extend_from_slice(&(chunk_data.len() as u32).to_be_bytes());
    full_chunk.extend_from_slice(b"tEXt");
    full_chunk.extend_from_slice(&chunk_data);
    let crc = crc32(&full_chunk[4..]);
    full_chunk.extend_from_slice(&crc.to_be_bytes());

    // Find IEND chunk offset to insert before it
    let mut pos = 8usize;
    let mut iend_offset = None;
    while pos + 8 <= png_bytes.len() {
        let len = u32::from_be_bytes([
            png_bytes[pos],
            png_bytes[pos + 1],
            png_bytes[pos + 2],
            png_bytes[pos + 3],
        ]) as usize;
        let ctype = &png_bytes[pos + 4..pos + 8];
        if ctype == b"IEND" {
            iend_offset = Some(pos);
            break;
        }
        let next = pos.saturating_add(12).saturating_add(len);
        if next <= pos || next > png_bytes.len() {
            break;
        }
        pos = next;
    }

    match iend_offset {
        Some(offset) => {
            let mut out = Vec::with_capacity(png_bytes.len() + full_chunk.len());
            out.extend_from_slice(&png_bytes[..offset]);
            out.extend_from_slice(&full_chunk);
            out.extend_from_slice(&png_bytes[offset..]);
            out
        }
        None => png_bytes.to_vec(),
    }
}

/// Extract ComfyUI generation metadata from PNG `tEXt` or `iTXt` chunks.
pub fn extract_comfy_metadata_from_png(data: &[u8]) -> Option<ComfyWorkMetadata> {
    if data.len() < 8 || &data[0..8] != PNG_SIG {
        return None;
    }

    let mut pos = 8usize;
    let mut prompt_json_str: Option<String> = None;
    let mut parameters_str: Option<String> = None;

    while pos + 8 <= data.len() {
        let len =
            u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        let chunk_type = &data[pos + 4..pos + 8];
        let data_start = pos + 8;
        let data_end = data_start.saturating_add(len);
        if data_end > data.len() {
            break;
        }
        let chunk_data = &data[data_start..data_end];

        if chunk_type == b"tEXt" {
            if let Some(null_idx) = chunk_data.iter().position(|&b| b == 0) {
                let key = String::from_utf8_lossy(&chunk_data[..null_idx]);
                let val = String::from_utf8_lossy(&chunk_data[null_idx + 1..]).to_string();
                if key == "prompt" {
                    prompt_json_str = Some(val);
                } else if key == "parameters" || key == "Description" {
                    parameters_str = Some(val);
                }
            }
        } else if chunk_type == b"iTXt" {
            // iTXt format: keyword\0 + compression_flag(1) + compression_method(1) + lang\0 + translated_key\0 + text
            if let Some(null_idx) = chunk_data.iter().position(|&b| b == 0) {
                let key = String::from_utf8_lossy(&chunk_data[..null_idx]);
                let rest = &chunk_data[null_idx + 1..];
                if rest.len() >= 2 && rest[0] == 0 {
                    // Uncompressed iTXt
                    let after_comp = &rest[2..];
                    if let Some(lang_null) = after_comp.iter().position(|&b| b == 0) {
                        let after_lang = &after_comp[lang_null + 1..];
                        if let Some(trans_null) = after_lang.iter().position(|&b| b == 0) {
                            let val =
                                String::from_utf8_lossy(&after_lang[trans_null + 1..]).to_string();
                            if key == "prompt" {
                                prompt_json_str = Some(val);
                            } else if key == "parameters" || key == "Description" {
                                parameters_str = Some(val);
                            }
                        }
                    }
                }
            }
        } else if chunk_type == b"IEND" {
            break;
        }

        pos = data_end.saturating_add(4); // skip 4-byte CRC
    }

    if let Some(prompt_str) = prompt_json_str {
        if let Ok(val) = serde_json::from_str::<Value>(&prompt_str) {
            if let Some(meta) = extract_metadata_from_prompt_graph(&val) {
                return Some(meta);
            }
        }
    }

    if let Some(params_text) = parameters_str {
        let trimmed = params_text.trim();
        if !trimmed.is_empty() {
            return Some(ComfyWorkMetadata {
                source: "comfyui".to_string(),
                positive_prompt: Some(trimmed.to_string()),
                ..Default::default()
            });
        }
    }

    None
}

fn resolve_node_text(workflow: &Value, node_ref: &Value) -> Option<String> {
    // In ComfyUI API graphs, a linked input is `["node_id", output_slot_idx]`
    let target_id = if let Some(arr) = node_ref.as_array() {
        arr.first()?
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| arr.first().and_then(|v| v.as_i64()).map(|n| n.to_string()))?
    } else if let Some(s) = node_ref.as_str() {
        s.to_string()
    } else {
        return None;
    };

    let node = workflow.get(&target_id)?;
    let inputs = node.get("inputs")?;
    if let Some(text) = inputs.get("text").and_then(|v| v.as_str()) {
        return Some(text.trim().to_string());
    }
    if let Some(text) = inputs.get("text_g").and_then(|v| v.as_str()) {
        return Some(text.trim().to_string());
    }
    if let Some(text) = inputs.get("prompt").and_then(|v| v.as_str()) {
        return Some(text.trim().to_string());
    }
    None
}

/// Extract structured generation parameters from a ComfyUI API prompt graph JSON object.
pub fn extract_metadata_from_prompt_graph(workflow: &Value) -> Option<ComfyWorkMetadata> {
    let obj = workflow.as_object()?;
    if obj.is_empty() {
        return None;
    }

    let mut meta = ComfyWorkMetadata {
        source: "comfyui".to_string(),
        ..Default::default()
    };

    // 1. Inspect KSampler / Sampler nodes and trace linked positive/negative prompts
    for (_node_id, node) in obj {
        let class_type = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let Some(inputs) = node.get("inputs").and_then(|v| v.as_object()) else {
            continue;
        };

        if class_type.contains("KSampler") || class_type == "SamplerCustom" {
            if meta.seed.is_none() {
                meta.seed = inputs
                    .get("seed")
                    .or_else(|| inputs.get("noise_seed"))
                    .and_then(|v| v.as_u64());
            }
            if meta.steps.is_none() {
                meta.steps = inputs
                    .get("steps")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
            }
            if meta.cfg.is_none() {
                meta.cfg = inputs.get("cfg").and_then(|v| v.as_f64());
            }
            if meta.sampler_name.is_none() {
                meta.sampler_name = inputs
                    .get("sampler_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            if meta.scheduler.is_none() {
                meta.scheduler = inputs
                    .get("scheduler")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            if meta.positive_prompt.is_none() {
                if let Some(pos_ref) = inputs.get("positive") {
                    meta.positive_prompt = resolve_node_text(workflow, pos_ref);
                }
            }
            if meta.negative_prompt.is_none() {
                if let Some(neg_ref) = inputs.get("negative") {
                    meta.negative_prompt = resolve_node_text(workflow, neg_ref);
                }
            }
        }

        // Model / Checkpoint loaders
        if meta.model.is_none() {
            if let Some(ckpt) = inputs
                .get("ckpt_name")
                .or_else(|| inputs.get("unet_name"))
                .or_else(|| inputs.get("model_name"))
                .and_then(|v| v.as_str())
            {
                meta.model = Some(ckpt.to_string());
            }
        }

        // Latent dimensions
        if class_type.contains("EmptyLatent") || class_type.contains("EmptySD3Latent") {
            if meta.width.is_none() {
                meta.width = inputs
                    .get("width")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
            }
            if meta.height.is_none() {
                meta.height = inputs
                    .get("height")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
            }
        }
    }

    // 2. Fallback heuristic if positive/negative prompts weren't directly linked on KSampler
    if meta.positive_prompt.is_none() {
        let detected = detect_workflow_nodes(workflow);
        if let Some(pos_id) = detected.pos_prompt_node {
            meta.positive_prompt = workflow
                .get(&pos_id)
                .and_then(|n| n.get("inputs"))
                .and_then(|i| i.get("text"))
                .and_then(|t| t.as_str())
                .map(|s| s.trim().to_string());
        }
        if meta.negative_prompt.is_none() {
            if let Some(neg_id) = detected.neg_prompt_node {
                meta.negative_prompt = workflow
                    .get(&neg_id)
                    .and_then(|n| n.get("inputs"))
                    .and_then(|i| i.get("text"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.trim().to_string());
            }
        }
    }

    if meta.positive_prompt.is_some()
        || meta.model.is_some()
        || meta.sampler_name.is_some()
        || meta.seed.is_some()
    {
        Some(meta)
    } else {
        None
    }
}

/// Inspect a ComfyUI API workflow JSON object and detect target node IDs for injection.
pub fn detect_workflow_nodes(workflow: &Value) -> DetectedWorkflowNodes {
    let mut out = DetectedWorkflowNodes::default();
    let Some(obj) = workflow.as_object() else {
        return out;
    };
    if obj.is_empty() {
        return out;
    }
    out.has_active_workflow = true;

    // First try tracing directly from KSampler positive/negative links
    let mut keys: Vec<&String> = obj.keys().collect();
    keys.sort();

    for node_id in &keys {
        let node = &obj[*node_id];
        let class_type = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let Some(inputs) = node.get("inputs").and_then(|v| v.as_object()) else {
            continue;
        };

        if class_type.contains("KSampler") || inputs.contains_key("seed") {
            out.ksampler_nodes.push((*node_id).clone());
            if out.pos_prompt_node.is_none() {
                if let Some(pos_arr) = inputs.get("positive").and_then(|v| v.as_array()) {
                    if let Some(id_str) = pos_arr.first().and_then(|v| v.as_str()) {
                        if obj
                            .get(id_str)
                            .and_then(|n| n.get("inputs"))
                            .and_then(|i| i.get("text"))
                            .is_some()
                        {
                            out.pos_prompt_node = Some(id_str.to_string());
                        }
                    }
                }
            }
            if out.neg_prompt_node.is_none() {
                if let Some(neg_arr) = inputs.get("negative").and_then(|v| v.as_array()) {
                    if let Some(id_str) = neg_arr.first().and_then(|v| v.as_str()) {
                        if obj
                            .get(id_str)
                            .and_then(|n| n.get("inputs"))
                            .and_then(|i| i.get("text"))
                            .is_some()
                        {
                            out.neg_prompt_node = Some(id_str.to_string());
                        }
                    }
                }
            }
        }

        if class_type == "SaveImage" && inputs.contains_key("filename_prefix") {
            out.save_image_nodes.push((*node_id).clone());
        }

        if out.checkpoint_node.is_none()
            && (inputs.contains_key("ckpt_name") || inputs.contains_key("unet_name"))
        {
            out.checkpoint_node = Some((*node_id).clone());
        }
    }

    // Fallback CLIPTextEncode heuristic (matching queue_comfy_cartouche.py)
    if out.pos_prompt_node.is_none() {
        let neg_keywords = [
            "blur",
            "ugly",
            "grid",
            "watermark",
            "bad",
            "extra text",
            "deformed",
        ];
        for node_id in &keys {
            let node = &obj[*node_id];
            if node.get("class_type").and_then(|v| v.as_str()) == Some("CLIPTextEncode") {
                let text = node
                    .get("inputs")
                    .and_then(|i| i.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let title = node
                    .get("_meta")
                    .and_then(|m| m.get("title"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                let is_neg = title.contains("negative")
                    || neg_keywords.iter().any(|k| text.to_lowercase().contains(k));
                if is_neg {
                    if out.neg_prompt_node.is_none() {
                        out.neg_prompt_node = Some((*node_id).clone());
                    }
                } else if out.pos_prompt_node.is_none() {
                    out.pos_prompt_node = Some((*node_id).clone());
                }
            }
        }
    }

    out
}

// ============================================================================
// 2. Lightweight Pure-Rust HTTP Client for Local ComfyUI Server
// ============================================================================

fn parse_http_url(base_url: &str, path_and_query: &str) -> Result<(String, u16, String), AppError> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let without_scheme = trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .unwrap_or(trimmed);

    let (host_port, base_path) = match without_scheme.find('/') {
        Some(idx) => (&without_scheme[..idx], &without_scheme[idx..]),
        None => (without_scheme, ""),
    };

    let (host, port) = match host_port.rfind(':') {
        Some(idx) => {
            let h = &host_port[..idx];
            let p = host_port[idx + 1..].parse::<u16>().unwrap_or(8188);
            (h.to_string(), p)
        }
        None => (host_port.to_string(), 8188),
    };

    let full_path = if path_and_query.starts_with('/') {
        format!("{}{}", base_path, path_and_query)
    } else {
        format!("{}/{}", base_path, path_and_query)
    };

    Ok((host, port, full_path))
}

fn decode_chunked_body(raw: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos < raw.len() {
        let Some(rel_end) = raw[pos..].windows(2).position(|w| w == b"\r\n") else {
            break;
        };
        let size_line = String::from_utf8_lossy(&raw[pos..pos + rel_end]);
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let Ok(chunk_size) = usize::from_str_radix(size_hex, 16) else {
            break;
        };
        pos += rel_end + 2;
        if chunk_size == 0 {
            break;
        }
        let end = (pos + chunk_size).min(raw.len());
        out.extend_from_slice(&raw[pos..end]);
        pos = end + 2; // skip trailing \r\n
    }
    out
}

fn http_request_raw(
    base_url: &str,
    method: &str,
    path_and_query: &str,
    body: Option<&[u8]>,
    timeout_ms: u64,
) -> Result<(u16, Vec<u8>), AppError> {
    let (host, port, full_path) = parse_http_url(base_url, path_and_query)?;
    let addr_str = format!("{}:{}", host, port);
    let addrs: Vec<SocketAddr> = addr_str
        .to_socket_addrs()
        .map_err(|e| AppError::Internal(format!("Cannot resolve ComfyUI host {addr_str}: {e}")))?
        .collect();
    let addr = addrs
        .first()
        .ok_or_else(|| AppError::Internal(format!("No address found for {addr_str}")))?;

    let timeout = Duration::from_millis(timeout_ms);
    let mut stream = TcpStream::connect_timeout(addr, timeout)
        .map_err(|e| AppError::Internal(format!("ComfyUI connection failed ({addr_str}): {e}")))?;
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let body_bytes = body.unwrap_or(&[]);
    let req_head = if method == "POST" {
        format!(
            "POST {} HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            full_path,
            host,
            port,
            body_bytes.len()
        )
    } else {
        format!(
            "{} {} HTTP/1.1\r\nHost: {}:{}\r\nAccept: */*\r\nConnection: close\r\n\r\n",
            method, full_path, host, port
        )
    };

    stream
        .write_all(req_head.as_bytes())
        .map_err(|e| AppError::Internal(format!("HTTP write error: {e}")))?;
    if !body_bytes.is_empty() {
        stream
            .write_all(body_bytes)
            .map_err(|e| AppError::Internal(format!("HTTP body write error: {e}")))?;
    }
    let _ = stream.flush();

    let mut resp_bytes = Vec::new();
    stream
        .read_to_end(&mut resp_bytes)
        .map_err(|e| AppError::Internal(format!("HTTP read error: {e}")))?;

    let Some(header_end) = resp_bytes.windows(4).position(|w| w == b"\r\n\r\n") else {
        return Err(AppError::Internal(
            "Invalid HTTP response from ComfyUI".to_string(),
        ));
    };

    let header_str = String::from_utf8_lossy(&resp_bytes[..header_end]);
    let status_line = header_str.lines().next().unwrap_or("");
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(500);

    let is_chunked = header_str
        .lines()
        .any(|l| l.to_lowercase().contains("transfer-encoding: chunked"));

    let raw_body = &resp_bytes[header_end + 4..];
    let decoded_body = if is_chunked {
        decode_chunked_body(raw_body)
    } else {
        raw_body.to_vec()
    };

    Ok((status_code, decoded_body))
}

fn http_get_json(base_url: &str, path: &str, timeout_ms: u64) -> Result<Value, AppError> {
    let (status, bytes) = http_request_raw(base_url, "GET", path, None, timeout_ms)?;
    if status >= 400 {
        return Err(AppError::Internal(format!(
            "ComfyUI GET {} returned HTTP {}",
            path, status
        )));
    }
    serde_json::from_slice::<Value>(&bytes)
        .map_err(|e| AppError::Internal(format!("Invalid JSON from ComfyUI {}: {}", path, e)))
}

fn http_post_json(
    base_url: &str,
    path: &str,
    payload: &Value,
    timeout_ms: u64,
) -> Result<Value, AppError> {
    let body = serde_json::to_vec(payload)
        .map_err(|e| AppError::Internal(format!("JSON serialize error: {e}")))?;
    let (status, bytes) = http_request_raw(base_url, "POST", path, Some(&body), timeout_ms)?;
    if status >= 400 {
        let err_text = String::from_utf8_lossy(&bytes);
        return Err(AppError::Internal(format!(
            "ComfyUI POST {} returned HTTP {}: {}",
            path, status, err_text
        )));
    }
    serde_json::from_slice::<Value>(&bytes)
        .map_err(|e| AppError::Internal(format!("Invalid JSON from ComfyUI POST {}: {}", path, e)))
}

// ============================================================================
// 3. Workflow Builder & Active Graph Injector
// ============================================================================

fn clean_filename_slug(input: &str) -> String {
    let mut slug = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
        } else if (ch == ' ' || ch == '-' || ch == '_') && !slug.ends_with('_') {
            slug.push('_');
        }
    }
    let trimmed = slug.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "Card".to_string()
    } else {
        trimmed
    }
}

/// Construct a standard ComfyUI API graph or inject overrides into an active workflow graph.
pub fn build_or_inject_workflow(
    base_workflow: Option<&Value>,
    req: &ComfyGenerateRequest,
    seed: u64,
    filename_prefix: &str,
) -> Value {
    let neg_prompt = req.negative_prompt.as_deref().unwrap_or(
        "blurry, low quality, watermark, signature, ugly, deformed, text overlay, border",
    );
    let batch_size = req.batch_size.clamp(1, 8);
    let steps = req.steps.clamp(1, 150);
    let width = req.width.clamp(256, 2048);
    let height = req.height.clamp(256, 2048);

    // If user requested "active_workflow" and a base workflow exists with a detected positive prompt node
    if req.workflow_mode.as_deref() == Some("active_workflow") {
        if let Some(base) = base_workflow {
            let detected = detect_workflow_nodes(base);
            if detected.has_active_workflow && detected.pos_prompt_node.is_some() {
                let mut wf = base.clone();
                if let Some(obj) = wf.as_object_mut() {
                    if let Some(pos_id) = &detected.pos_prompt_node {
                        if let Some(inputs) = obj
                            .get_mut(pos_id)
                            .and_then(|n| n.get_mut("inputs"))
                            .and_then(|i| i.as_object_mut())
                        {
                            inputs.insert("text".to_string(), json!(req.prompt));
                        }
                    }
                    if let Some(neg_id) = &detected.neg_prompt_node {
                        if req.negative_prompt.is_some() {
                            if let Some(inputs) = obj
                                .get_mut(neg_id)
                                .and_then(|n| n.get_mut("inputs"))
                                .and_then(|i| i.as_object_mut())
                            {
                                inputs.insert("text".to_string(), json!(neg_prompt));
                            }
                        }
                    }
                    if let Some(ckpt_id) = &detected.checkpoint_node {
                        if !req.model.trim().is_empty() {
                            if let Some(inputs) = obj
                                .get_mut(ckpt_id)
                                .and_then(|n| n.get_mut("inputs"))
                                .and_then(|i| i.as_object_mut())
                            {
                                if inputs.contains_key("ckpt_name") {
                                    inputs.insert("ckpt_name".to_string(), json!(req.model));
                                } else if inputs.contains_key("unet_name") {
                                    inputs.insert("unet_name".to_string(), json!(req.model));
                                }
                            }
                        }
                    }
                    for ks_id in &detected.ksampler_nodes {
                        if let Some(inputs) = obj
                            .get_mut(ks_id)
                            .and_then(|n| n.get_mut("inputs"))
                            .and_then(|i| i.as_object_mut())
                        {
                            if inputs.contains_key("seed") {
                                inputs.insert("seed".to_string(), json!(seed));
                            }
                            if inputs.contains_key("noise_seed") {
                                inputs.insert("noise_seed".to_string(), json!(seed));
                            }
                            if inputs.contains_key("steps") {
                                inputs.insert("steps".to_string(), json!(steps));
                            }
                            if inputs.contains_key("cfg") {
                                inputs.insert("cfg".to_string(), json!(req.cfg));
                            }
                            if inputs.contains_key("sampler_name") && !req.sampler_name.is_empty() {
                                inputs.insert("sampler_name".to_string(), json!(req.sampler_name));
                            }
                            if inputs.contains_key("scheduler") && !req.scheduler.is_empty() {
                                inputs.insert("scheduler".to_string(), json!(req.scheduler));
                            }
                        }
                    }
                    for save_id in &detected.save_image_nodes {
                        if let Some(inputs) = obj
                            .get_mut(save_id)
                            .and_then(|n| n.get_mut("inputs"))
                            .and_then(|i| i.as_object_mut())
                        {
                            inputs.insert("filename_prefix".to_string(), json!(filename_prefix));
                        }
                    }
                    // Update batch_size on EmptyLatentImage if present
                    for (_id, node) in obj.iter_mut() {
                        let ctype = node
                            .get("class_type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if ctype.contains("EmptyLatent") || ctype.contains("EmptySD3Latent") {
                            if let Some(inputs) =
                                node.get_mut("inputs").and_then(|i| i.as_object_mut())
                            {
                                inputs.insert("batch_size".to_string(), json!(batch_size));
                            }
                        }
                    }
                }
                return wf;
            }
        }
    }

    let lower_model = req.model.to_lowercase();
    let is_flux_unet = lower_model.contains("flux")
        || lower_model.contains("devfp8")
        || lower_model.contains("pulsarmalegaynsfwbase");

    if is_flux_unet {
        return json!({
            "1": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": req.model,
                    "weight_dtype": "fp8_e4m3fn"
                }
            },
            "8": {
                "class_type": "DualCLIPLoader",
                "inputs": {
                    "clip_name1": "clip_l.safetensors",
                    "clip_name2": "t5xxl_fp8_e4m3fn.safetensors",
                    "type": "flux"
                }
            },
            "9": {
                "class_type": "VAELoader",
                "inputs": {
                    "vae_name": "ae.safetensors"
                }
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "_meta": { "title": "Positive Prompt" },
                "inputs": {
                    "text": req.prompt,
                    "clip": ["8", 0]
                }
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "_meta": { "title": "Negative Prompt" },
                "inputs": {
                    "text": neg_prompt,
                    "clip": ["8", 0]
                }
            },
            "4": {
                "class_type": "EmptySD3LatentImage",
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": batch_size
                }
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": req.cfg,
                    "sampler_name": req.sampler_name,
                    "scheduler": req.scheduler,
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0]
                }
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["5", 0],
                    "vae": ["9", 0]
                }
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": filename_prefix,
                    "images": ["6", 0]
                }
            }
        });
    }

    // Standard Built-In ComfyUI txt2img Graph
    json!({
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": req.model
            }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "Positive Prompt" },
            "inputs": {
                "text": req.prompt,
                "clip": ["1", 1]
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "Negative Prompt" },
            "inputs": {
                "text": neg_prompt,
                "clip": ["1", 1]
            }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch_size
            }
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": req.cfg,
                "sampler_name": req.sampler_name,
                "scheduler": req.scheduler,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["5", 0],
                "vae": ["1", 2]
            }
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": filename_prefix,
                "images": ["6", 0]
            }
        }
    })
}

// ============================================================================
// 4. Service Functions & Tauri IPC Commands
// ============================================================================

fn extract_string_list_from_object_info(
    info: &Value,
    node_name: &str,
    input_name: &str,
) -> Vec<String> {
    let mut out = Vec::new();
    let Some(arr) = info
        .get(node_name)
        .and_then(|n| n.get("input"))
        .and_then(|i| i.get("required"))
        .and_then(|r| r.get(input_name))
        .and_then(|f| f.as_array())
        .and_then(|a| a.first())
        .and_then(|list| list.as_array())
    else {
        return out;
    };

    for item in arr {
        if let Some(s) = item.as_str() {
            if !out.contains(&s.to_string()) {
                out.push(s.to_string());
            }
        }
    }
    out
}

fn get_latest_history_workflow(host: &str) -> Option<Value> {
    let history = http_get_json(host, "/history?max_items=5", 2500).ok()?;
    let obj = history.as_object()?;
    let last_key = obj.keys().last()?;
    let entry = obj.get(last_key)?;
    entry
        .get("prompt")
        .and_then(|p| p.as_array())
        .and_then(|arr| arr.get(2))
        .cloned()
}

fn is_valid_diffusion_model_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    let valid_ext = lower.ends_with(".safetensors")
        || lower.ends_with(".ckpt")
        || lower.ends_with(".gguf")
        || lower.ends_with(".pt")
        || lower.ends_with(".pth");
    if !valid_ext {
        return false;
    }
    if lower.contains("_lora") || lower.contains("sdpose") || lower.contains("ip-adapter") {
        return false;
    }
    true
}

pub fn comfy_get_server_info_service(host: Option<&str>) -> ComfyServerInfo {
    let host_url = host
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COMFY_HOST)
        .to_string();

    let default_samplers: Vec<String> = DEFAULT_SAMPLERS.iter().map(|s| s.to_string()).collect();
    let default_schedulers: Vec<String> =
        DEFAULT_SCHEDULERS.iter().map(|s| s.to_string()).collect();

    let mut models = Vec::new();

    // Query lightweight per-node object_info endpoints instead of the 5MB root /object_info
    match http_get_json(&host_url, "/object_info/CheckpointLoaderSimple", 3000) {
        Ok(ckpt_info) => {
            for m in extract_string_list_from_object_info(
                &ckpt_info,
                "CheckpointLoaderSimple",
                "ckpt_name",
            ) {
                if is_valid_diffusion_model_name(&m) && !models.contains(&m) {
                    models.push(m);
                }
            }
            if let Ok(unet_info) = http_get_json(&host_url, "/object_info/UNETLoader", 2000) {
                for unet_model in
                    extract_string_list_from_object_info(&unet_info, "UNETLoader", "unet_name")
                {
                    if is_valid_diffusion_model_name(&unet_model) && !models.contains(&unet_model) {
                        models.push(unet_model);
                    }
                }
            }

            let mut samplers = Vec::new();
            let mut schedulers = Vec::new();
            if let Ok(ks_info) = http_get_json(&host_url, "/object_info/KSampler", 2000) {
                samplers = extract_string_list_from_object_info(&ks_info, "KSampler", "sampler_name");
                schedulers = extract_string_list_from_object_info(&ks_info, "KSampler", "scheduler");
            }

            if samplers.is_empty() {
                samplers = default_samplers;
            }
            if schedulers.is_empty() {
                schedulers = default_schedulers;
            }

            let active_workflow = get_latest_history_workflow(&host_url)
                .map(|wf| detect_workflow_nodes(&wf))
                .unwrap_or_default();

            ComfyServerInfo {
                host: host_url,
                online: true,
                models,
                samplers,
                schedulers,
                active_workflow,
                error: None,
            }
        }
        Err(e) => ComfyServerInfo {
            host: host_url,
            online: false,
            models: vec![],
            samplers: default_samplers,
            schedulers: default_schedulers,
            active_workflow: DetectedWorkflowNodes::default(),
            error: Some(e.to_string()),
        },
    }
}

fn generate_default_seed(position: i64) -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(424242);
    (nanos % 900_000_000_000) + 100_000 + (position.unsigned_abs() * 17)
}

pub fn comfy_queue_socket_service(
    root: &Path,
    socket_id: i64,
    req: ComfyGenerateRequest,
) -> Result<ComfyQueueResponse, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    if socket.locked {
        return Err(AppError::Locked);
    }

    let effective_prompt = req.prompt.trim().to_string();
    if effective_prompt.is_empty() {
        return Err(AppError::ValidationError(
            "Prompt cannot be empty for ComfyUI generation".to_string(),
        ));
    }

    // Optionally sync the prompt back to socket.notes (bidirectional sync)
    if req.sync_prompt_to_notes.unwrap_or(true) && socket.notes.trim() != effective_prompt {
        conn.execute(
            "UPDATE sockets SET notes = ?1 WHERE id = ?2",
            params![effective_prompt, socket_id],
        )?;
    }

    let host_url = req
        .host
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COMFY_HOST);

    let seed = req
        .seed
        .unwrap_or_else(|| generate_default_seed(socket.position));

    let project_name: String = conn
        .query_row("SELECT name FROM projects WHERE id = 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "Cartouche".to_string());

    let prefix = format!(
        "{}/{:02}_{}",
        clean_filename_slug(&project_name),
        socket.position + 1,
        clean_filename_slug(if socket.title.trim().is_empty() {
            "Socket"
        } else {
            &socket.title
        })
    );

    let base_wf = if req.workflow_mode.as_deref() == Some("active_workflow") {
        get_latest_history_workflow(host_url)
    } else {
        None
    };

    let mut resolved_req = req.clone();
    let srv_info = comfy_get_server_info_service(Some(host_url));
    if srv_info.online && !srv_info.models.is_empty() && !srv_info.models.contains(&resolved_req.model) {
        let req_stem = resolved_req
            .model
            .rsplit(&['/', '\\'][..])
            .next()
            .unwrap_or(&resolved_req.model)
            .split('.')
            .next()
            .unwrap_or("")
            .to_lowercase();
        if let Some(matched) = srv_info
            .models
            .iter()
            .find(|m| !req_stem.is_empty() && m.to_lowercase().contains(&req_stem))
        {
            resolved_req.model = matched.clone();
        } else if let Some(sdxl) = srv_info.models.iter().find(|m| m.contains("sd_xl_base")) {
            resolved_req.model = sdxl.clone();
        } else {
            resolved_req.model = srv_info.models[0].clone();
        }
    }
    let wf_graph = build_or_inject_workflow(base_wf.as_ref(), &resolved_req, seed, &prefix);
    let payload = json!({ "prompt": wf_graph });
    let resp = http_post_json(host_url, "/prompt", &payload, 5000)?;
    let prompt_id = resp
        .get("prompt_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Internal("ComfyUI did not return a prompt_id".to_string()))?
        .to_string();

    Ok(ComfyQueueResponse {
        prompt_id,
        socket_id: socket_id.to_string(),
        seed_used: seed,
        effective_prompt,
    })
}

fn percent_encode_query_val(input: &str) -> String {
    let mut out = String::new();
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub fn comfy_poll_and_ingest_service(
    root: &Path,
    socket_id: i64,
    prompt_id: &str,
    host: Option<&str>,
    auto_select_winner: bool,
) -> Result<ComfyPollResponse, AppError> {
    let host_url = host
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COMFY_HOST);

    let history_path = format!("/history/{}", prompt_id);
    let history_json = http_get_json(host_url, &history_path, 4000)?;
    let Some(entry) = history_json.get(prompt_id) else {
        return Ok(ComfyPollResponse {
            prompt_id: prompt_id.to_string(),
            status: "running".to_string(),
            works_added: 0,
            socket: None,
            message: None,
        });
    };

    // Check if ComfyUI reported an execution error
    if let Some(status_obj) = entry.get("status") {
        let status_str = status_obj
            .get("status_str")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if status_str == "error" {
            return Ok(ComfyPollResponse {
                prompt_id: prompt_id.to_string(),
                status: "failed".to_string(),
                works_added: 0,
                socket: None,
                message: Some("ComfyUI reported a workflow execution error.".to_string()),
            });
        }
    }

    let Some(outputs) = entry.get("outputs").and_then(|v| v.as_object()) else {
        return Ok(ComfyPollResponse {
            prompt_id: prompt_id.to_string(),
            status: "running".to_string(),
            works_added: 0,
            socket: None,
            message: None,
        });
    };

    let mut image_refs: Vec<(String, String, String)> = Vec::new();
    for (_node_id, node_out) in outputs {
        if let Some(images) = node_out.get("images").and_then(|v| v.as_array()) {
            for img in images {
                let filename = img
                    .get("filename")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let subfolder = img
                    .get("subfolder")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let folder_type = img
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("output")
                    .to_string();
                if !filename.is_empty() {
                    image_refs.push((filename, subfolder, folder_type));
                }
            }
        }
    }

    if image_refs.is_empty() {
        return Ok(ComfyPollResponse {
            prompt_id: prompt_id.to_string(),
            status: "running".to_string(),
            works_added: 0,
            socket: None,
            message: None,
        });
    }

    let mut works_added = 0usize;
    let mut latest_socket: Option<Socket> = None;

    for (filename, subfolder, folder_type) in image_refs {
        let view_path = format!(
            "/view?filename={}&subfolder={}&type={}",
            percent_encode_query_val(&filename),
            percent_encode_query_val(&subfolder),
            percent_encode_query_val(&folder_type)
        );
        let (status, img_bytes) = http_request_raw(host_url, "GET", &view_path, None, 8000)?;
        if status < 400 && !img_bytes.is_empty() {
            let updated_socket = attach_work_data_service(root, socket_id, &filename, &img_bytes)?;
            works_added += 1;
            latest_socket = Some(updated_socket);
        }
    }

    if auto_select_winner {
        if let Some(ref s) = latest_socket {
            if s.selected_work_id.is_none() {
                if let Some(first_work) = s.works.last() {
                    let conn = open(root)?;
                    conn.execute(
                        "UPDATE sockets SET selected_work_id = ?1 WHERE id = ?2",
                        params![first_work.id, socket_id],
                    )?;
                    latest_socket = Some(read_socket(&conn, socket_id)?);
                }
            }
        }
    }

    Ok(ComfyPollResponse {
        prompt_id: prompt_id.to_string(),
        status: "done".to_string(),
        works_added,
        socket: latest_socket,
        message: Some(format!(
            "Imported {} generated image(s) from ComfyUI",
            works_added
        )),
    })
}

pub fn comfy_list_history_service(
    host: Option<&str>,
    limit: usize,
) -> Result<Vec<ComfyHistoryItem>, AppError> {
    let host_url = host
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COMFY_HOST);

    let max_items = limit.clamp(1, 50);
    let path = format!("/history?max_items={}", max_items);
    let history_json = http_get_json(host_url, &path, 4000)?;
    let Some(obj) = history_json.as_object() else {
        return Ok(vec![]);
    };

    let mut items = Vec::new();
    for (prompt_id, entry) in obj.iter().rev() {
        let prompt_graph = entry
            .get("prompt")
            .and_then(|p| p.as_array())
            .and_then(|a| a.get(2));
        let parsed_meta = prompt_graph
            .and_then(extract_metadata_from_prompt_graph)
            .unwrap_or_default();

        if let Some(outputs) = entry.get("outputs").and_then(|v| v.as_object()) {
            for (_node_id, node_out) in outputs {
                if let Some(images) = node_out.get("images").and_then(|v| v.as_array()) {
                    for img in images {
                        let filename = img
                            .get("filename")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if filename.is_empty() {
                            continue;
                        }
                        let subfolder = img
                            .get("subfolder")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let folder_type = img
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("output")
                            .to_string();
                        if folder_type == "temp" {
                            continue;
                        }
                        let preview_url = format!(
                            "{}/view?filename={}&subfolder={}&type={}",
                            host_url.trim_end_matches('/'),
                            percent_encode_query_val(&filename),
                            percent_encode_query_val(&subfolder),
                            percent_encode_query_val(&folder_type)
                        );
                        items.push(ComfyHistoryItem {
                            prompt_id: prompt_id.clone(),
                            filename,
                            subfolder,
                            folder_type,
                            preview_url,
                            positive_prompt: parsed_meta
                                .positive_prompt
                                .clone()
                                .unwrap_or_default(),
                            negative_prompt: parsed_meta
                                .negative_prompt
                                .clone()
                                .unwrap_or_default(),
                            model: parsed_meta.model.clone().unwrap_or_default(),
                            sampler_name: parsed_meta
                                .sampler_name
                                .clone()
                                .unwrap_or_else(|| "euler".to_string()),
                            scheduler: parsed_meta
                                .scheduler
                                .clone()
                                .unwrap_or_else(|| "normal".to_string()),
                            steps: parsed_meta.steps.unwrap_or(20),
                            cfg: parsed_meta.cfg.unwrap_or(7.0),
                            seed: parsed_meta.seed.unwrap_or(0),
                            width: parsed_meta.width.unwrap_or(768),
                            height: parsed_meta.height.unwrap_or(1344),
                        });
                        if items.len() >= max_items {
                            return Ok(items);
                        }
                    }
                }
            }
        }
    }

    Ok(items)
}

pub fn comfy_import_from_history_service(
    root: &Path,
    socket_id: i64,
    host: Option<&str>,
    filename: &str,
    subfolder: &str,
    folder_type: &str,
    prompt_override: Option<&str>,
    overwrite_socket_notes: bool,
) -> Result<Socket, AppError> {
    let conn = open(root)?;
    let socket = read_socket(&conn, socket_id)?;
    if socket.locked {
        return Err(AppError::Locked);
    }
    drop(conn);

    let host_url = host
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COMFY_HOST);

    let view_path = format!(
        "/view?filename={}&subfolder={}&type={}",
        percent_encode_query_val(filename),
        percent_encode_query_val(subfolder),
        percent_encode_query_val(folder_type)
    );
    let (status, img_bytes) = http_request_raw(host_url, "GET", &view_path, None, 8000)?;
    if status >= 400 || img_bytes.is_empty() {
        return Err(AppError::Internal(format!(
            "Failed to download image {} from ComfyUI (HTTP {})",
            filename, status
        )));
    }

    let updated = attach_work_data_service(root, socket_id, filename, &img_bytes)?;

    // If user requested overwriting socket description (notes) with the ComfyUI prompt
    if overwrite_socket_notes {
        let extracted_prompt = prompt_override
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                extract_comfy_metadata_from_png(&img_bytes).and_then(|m| m.positive_prompt)
            });

        if let Some(prompt_text) = extracted_prompt {
            let conn = open(root)?;
            conn.execute(
                "UPDATE sockets SET notes = ?1 WHERE id = ?2",
                params![prompt_text, socket_id],
            )?;
            return read_socket(&conn, socket_id);
        }
    }

    Ok(updated)
}

#[tauri::command]
pub fn comfy_get_server_info(host: Option<String>) -> ComfyServerInfo {
    comfy_get_server_info_service(host.as_deref())
}

#[tauri::command]
pub fn comfy_queue_socket(
    project_path: String,
    socket_id: SocketId,
    request: ComfyGenerateRequest,
) -> Result<ComfyQueueResponse, AppError> {
    comfy_queue_socket_service(Path::new(&project_path), socket_id.0, request)
}

#[tauri::command]
pub fn comfy_poll_and_ingest(
    project_path: String,
    socket_id: SocketId,
    prompt_id: String,
    host: Option<String>,
    auto_select_winner: Option<bool>,
) -> Result<ComfyPollResponse, AppError> {
    comfy_poll_and_ingest_service(
        Path::new(&project_path),
        socket_id.0,
        &prompt_id,
        host.as_deref(),
        auto_select_winner.unwrap_or(false),
    )
}

#[tauri::command]
pub fn comfy_list_history(
    host: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ComfyHistoryItem>, AppError> {
    comfy_list_history_service(host.as_deref(), limit.unwrap_or(20))
}

#[tauri::command]
pub fn comfy_import_from_history(
    project_path: String,
    socket_id: SocketId,
    host: Option<String>,
    filename: String,
    subfolder: String,
    folder_type: String,
    prompt_override: Option<String>,
    overwrite_socket_notes: Option<bool>,
) -> Result<Socket, AppError> {
    comfy_import_from_history_service(
        Path::new(&project_path),
        socket_id.0,
        host.as_deref(),
        &filename,
        &subfolder,
        &folder_type,
        prompt_override.as_deref(),
        overwrite_socket_notes.unwrap_or(true),
    )
}
