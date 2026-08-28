use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::db::open;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingAsset {
 pub work_id: String,
 pub asset_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairScanResult {
 pub missing_assets: Vec<MissingAsset>,
 pub orphans: Vec<String>,
}

pub fn repair_scan_service(root: &Path) -> Result<RepairScanResult, AppError> {
 let conn = open(root)?;

 let mut missing_assets = Vec::new();
 let mut known_assets = HashSet::new();

 let mut stmt = conn.prepare("SELECT id, asset_path FROM works")?;
 let work_rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;

 for row in work_rows {
 let (work_id, asset_path) = row?;
 let abs_path = root.join(".tarot").join(&asset_path);
 if !abs_path.exists() {
 missing_assets.push(MissingAsset {
 work_id: work_id.to_string(),
 asset_path: asset_path.clone(),
 });
 }
 known_assets.insert(asset_path);
 }

 let mut orphans = Vec::new();
 let assets_dir = root.join(".tarot/assets");
 if assets_dir.is_dir() {
 if let Ok(entries) = fs::read_dir(&assets_dir) {
 for entry in entries.flatten() {
 let path = entry.path();
 if path.is_file() {
 let file_name = entry.file_name().to_string_lossy().to_string();
 let rel_path = format!("assets/{}", file_name);
 if !known_assets.contains(&rel_path) {
 orphans.push(rel_path);
 }
 }
 }
 }
 }

 orphans.sort();

 Ok(RepairScanResult {
 missing_assets,
 orphans,
 })
}

#[tauri::command]
pub fn repair_scan(project_path: String) -> Result<RepairScanResult, AppError> {
 repair_scan_service(Path::new(&project_path))
}
