use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use zip::write::FileOptions;
use zip::ZipWriter;

use crate::db::{db_path, open, read_project};
use crate::error::AppError;
use crate::models::Project;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProjectResult {
 pub path: String,
 pub manifest_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
 version: i64,
 created_at: String,
 project_name: String,
 metadata_json: String,
 files: BTreeMap<String, String>,
}

fn sha256_bytes(bytes: &[u8]) -> String {
 let mut hasher = Sha256::new();
 hasher.update(bytes);
 format!("{:x}", hasher.finalize())
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
 let data = fs::read(path).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
 Ok(sha256_bytes(&data))
}

pub fn export_project_service(
 root: &Path,
 destination_path: &str,
) -> Result<ExportProjectResult, AppError> {
 let sqlite_file = db_path(root);
 if !sqlite_file.exists() {
 return Err(AppError::NotFound);
 }

 if destination_path.trim().is_empty() {
 return Err(AppError::PathNotWritable(
 "Destination path is empty".to_string(),
 ));
 }

 let conn = open(root)?;
 let project = read_project(&conn, root)?;

 let normalized_dest = if destination_path.to_lowercase().ends_with(".crtch") {
 destination_path.to_string()
 } else if destination_path.to_lowercase().ends_with(".zip") {
 format!("{}.crtch", &destination_path[..destination_path.len() - 4])
 } else {
 format!("{}.crtch", destination_path)
 };

 let tarot_dir = root.join(".tarot");
 let dest_file =
 File::create(&normalized_dest).map_err(|e| AppError::PathNotWritable(e.to_string()))?;
 let mut zip = ZipWriter::new(dest_file);
 let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

 let mut manifest_files = BTreeMap::new();
 let mut files_to_write = Vec::new();

 // Walk .tarot directory
 fn collect_files(
 base: &Path,
 current: &Path,
 list: &mut Vec<(String, std::path::PathBuf)>,
 ) -> std::io::Result<()> {
 if current.is_dir() {
 for entry in fs::read_dir(current)? {
 let entry = entry?;
 let path = entry.path();
 if path.is_dir() {
 collect_files(base, &path, list)?;
 } else if path.is_file() {
 let rel = path.strip_prefix(base).map_err(std::io::Error::other)?;
 let rel_str = rel.to_string_lossy().replace('\\', "/");
 list.push((rel_str, path));
 }
 }
 }
 Ok(())
 }

 collect_files(&tarot_dir, &tarot_dir, &mut files_to_write)?;

 for (rel_path, abs_path) in &files_to_write {
 let hash = sha256_file(abs_path)?;
 manifest_files.insert(rel_path.clone(), hash);

 let data = fs::read(abs_path).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
 zip.start_file(format!(".tarot/{}", rel_path), options)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 zip.write_all(&data)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 }

 let created_at = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
 Ok(d) => format!("{}", d.as_secs()),
 Err(_) => "0".to_string(),
 };

 let rights_manifest_doc = generate_rights_manifest_doc(&project);
 zip.start_file(".tarot/RIGHTS_MANIFEST.md", options)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 zip.write_all(rights_manifest_doc.as_bytes())
 .map_err(|e| AppError::Internal(e.to_string()))?;

 // Collect full project provenance ledger for export
 let mut all_provenance = Vec::new();
 for s in &project.sockets {
 let smeta: serde_json::Value = serde_json::from_str(&s.metadata_json).unwrap_or_default();
 if let Some(ledger) = smeta.get("provenance_ledger").and_then(|v| v.as_array()) {
 for entry in ledger {
 let mut e_obj = entry.clone();
 if let Some(obj) = e_obj.as_object_mut() {
 obj.insert("socket_position".to_string(), serde_json::json!(s.position));
 obj.insert("socket_title".to_string(), serde_json::json!(s.title));
 }
 all_provenance.push(e_obj);
 }
 }
 }

 let prov_json =
 serde_json::to_string_pretty(&all_provenance).unwrap_or_else(|_| "[]".to_string());
 zip.start_file(".tarot/PROVENANCE_LEDGER.json", options)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 zip.write_all(prov_json.as_bytes())
 .map_err(|e| AppError::Internal(e.to_string()))?;

 // Export planning matrix & symbolism scratchpad if present
 let meta: serde_json::Value = serde_json::from_str(&project.metadata_json).unwrap_or_default();
 let mut planning_doc = serde_json::json!({
 "project_name": project.name,
 "exported_at": created_at,
 "deck_matrix": meta.get("planning_matrix").cloned().unwrap_or(serde_json::json!({})),
 });
 let mut tenant_symbolism = Vec::new();
 for s in &project.sockets {
 let smeta: serde_json::Value = serde_json::from_str(&s.metadata_json).unwrap_or_default();
 if let Some(sym) = smeta.get("symbolism") {
 tenant_symbolism.push(serde_json::json!({
 "position": s.position,
 "title": s.title,
 "symbolism": sym,
 }));
 }
 }
 planning_doc["tenant_symbolism"] = serde_json::Value::Array(tenant_symbolism);
 let plan_json =
 serde_json::to_string_pretty(&planning_doc).unwrap_or_else(|_| "{}".to_string());
 zip.start_file(".tarot/PLANNING_SCRATCHPAD.json", options)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 zip.write_all(plan_json.as_bytes())
 .map_err(|e| AppError::Internal(e.to_string()))?;

 let manifest = Manifest {
 version: 1,
 created_at,
 project_name: project.name,
 metadata_json: project.metadata_json,
 files: manifest_files,
 };

 let manifest_json =
 serde_json::to_string_pretty(&manifest).map_err(|e| AppError::Internal(e.to_string()))?;
 let manifest_sha256 = sha256_bytes(manifest_json.as_bytes());

 zip.start_file(".tarot/manifest.json", options)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 zip.write_all(manifest_json.as_bytes())
 .map_err(|e| AppError::Internal(e.to_string()))?;

 zip.finish()
 .map_err(|e| AppError::Internal(e.to_string()))?;

 Ok(ExportProjectResult {
 path: normalized_dest,
 manifest_sha256,
 })
}

pub fn generate_rights_manifest_doc(project: &Project) -> String {
 let meta: serde_json::Value = serde_json::from_str(&project.metadata_json).unwrap_or_default();
 let author = meta
 .get("author")
 .and_then(|v| v.as_str())
 .unwrap_or("Unspecified");
 let studio = meta
 .get("studio")
 .and_then(|v| v.as_str())
 .unwrap_or("Unspecified");
 let copyright = meta
 .get("copyright")
 .and_then(|v| v.as_str())
 .unwrap_or("All Rights Reserved");
 let license = meta
 .get("license")
 .and_then(|v| v.as_str())
 .unwrap_or("All Rights Reserved");
 let edition = meta
 .get("edition")
 .and_then(|v| v.as_str())
 .unwrap_or("1st Edition");
 let trademark = meta
 .get("trademark")
 .and_then(|v| v.as_str())
 .unwrap_or("None");
 let ai_policy = meta
 .get("ai_policy")
 .and_then(|v| v.as_str())
 .unwrap_or("Unspecified");

 let mut doc = format!(
 "# Rights & Deliverables Manifest — {}\n\n\
 - **Edition / Version**: {}\n\
 - **Lead Author / Artist**: {}\n\
 - **Studio / Publisher**: {}\n\
 - **Copyright Notice**: {}\n\
 - **Deck Default License**: {}\n\
 - **AI Training / Scraping Policy**: {}\n\
 - **Trademark**: {}\n\n\
 ## Deliverable Card Inventory & Rights Table\n\n\
 | Position | Title | Status | Medium | Assigned Artist | Effective License | Winner Chosen |\n\
 | :---: | :--- | :---: | :--- | :--- | :--- | :---: |\n",
 project.name, edition, author, studio, copyright, license, ai_policy, trademark
 );

 for s in &project.sockets {
 let smeta: serde_json::Value = serde_json::from_str(&s.metadata_json).unwrap_or_default();
 let s_author = smeta
 .get("author_override")
 .and_then(|v| v.as_str())
 .filter(|v| !v.trim().is_empty())
 .unwrap_or(author);
 let s_license = smeta
 .get("license_override")
 .and_then(|v| v.as_str())
 .filter(|v| !v.trim().is_empty())
 .unwrap_or(license);
 let s_status = smeta
 .get("status")
 .and_then(|v| v.as_str())
 .unwrap_or("not_started");
 let s_medium = smeta.get("medium").and_then(|v| v.as_str()).unwrap_or("—");
 let has_winner = if s.selected_work_id.is_some() {
 "Yes"
 } else {
 "No"
 };

 doc.push_str(&format!(
 "| {} | {} | {} | {} | {} | {} | {} |\n",
 s.position, s.title, s_status, s_medium, s_author, s_license, has_winner
 ));
 }

 doc.push_str("\n## Conceptual Planning & Symbolism Matrix\n\n\
 *The following semantic definitions, motifs, and composition briefs document the creative foundation and authorial intent for each deliverable tenant.*\n\n\
 | Position | Card Title | Core Meaning | Visual Motifs & Imagery | Palette |\n\
 | :---: | :--- | :--- | :--- | :--- |\n");

 for s in &project.sockets {
 let smeta: serde_json::Value = serde_json::from_str(&s.metadata_json).unwrap_or_default();
 let sym = smeta.get("symbolism");
 let meaning = sym
 .and_then(|v| v.get("core_meaning"))
 .and_then(|v| v.as_str())
 .unwrap_or("—");
 let motifs = sym
 .and_then(|v| v.get("visual_motifs"))
 .and_then(|v| v.as_str())
 .unwrap_or("—");
 let palette = sym
 .and_then(|v| v.get("color_palette"))
 .and_then(|v| v.as_str())
 .unwrap_or("—");

 doc.push_str(&format!(
 "| {} | {} | {} | {} | {} |\n",
 s.position,
 s.title,
 meaning.replace('|', "/"),
 motifs.replace('|', "/"),
 palette.replace('|', "/")
 ));
 }

 doc.push_str("\n## Forensic Chain of Custody & Cryptographic Hashes\n\n\
 *The following immutable SHA-256 hashes document the cryptographic fingerprint of deliverable assets and external editing sessions for copyright and legal provenance defense.*\n\n\
 | Position | Card Title | Asset File | SHA-256 Fingerprint | Size |\n\
 | :---: | :--- | :--- | :--- | :---: |\n");

 for s in &project.sockets {
 for w in &s.works {
 doc.push_str(&format!(
 "| {} | {} | {} | `{}` | {} KB |\n",
 s.position,
 s.title,
 w.title,
 w.sha256,
 (w.byte_size as f64 / 1024.0).round()
 ));
 }
 }

 doc
}

pub fn import_project_service(
 package_path: &str,
 destination_path: &str,
) -> Result<Project, AppError> {
 let pkg_file = File::open(package_path).map_err(|e| AppError::FileUnreadable(e.to_string()))?;
 let mut archive =
 zip::ZipArchive::new(pkg_file).map_err(|e| AppError::ProjectCorrupt(e.to_string()))?;

 let dest = Path::new(destination_path);
 fs::create_dir_all(dest)?;

 for i in 0..archive.len() {
 let mut file = archive
 .by_index(i)
 .map_err(|e| AppError::ProjectCorrupt(e.to_string()))?;
 let outpath = match file.enclosed_name() {
 Some(path) => dest.join(path),
 None => continue,
 };

 if file.is_dir() {
 fs::create_dir_all(&outpath)?;
 } else {
 if let Some(p) = outpath.parent() {
 if !p.exists() {
 fs::create_dir_all(p)?;
 }
 }
 let mut outfile =
 File::create(&outpath).map_err(|e| AppError::PathNotWritable(e.to_string()))?;
 std::io::copy(&mut file, &mut outfile)
 .map_err(|e| AppError::Internal(e.to_string()))?;
 }
 }

 let conn = open(dest)?;
 read_project(&conn, dest)
}

#[tauri::command]
pub fn export_project(
 project_path: String,
 destination_path: String,
) -> Result<ExportProjectResult, AppError> {
 export_project_service(Path::new(&project_path), &destination_path)
}

#[tauri::command]
pub fn import_project(package_path: String, destination_path: String) -> Result<Project, AppError> {
 import_project_service(&package_path, &destination_path)
}
