use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use zip::write::FileOptions;
use zip::ZipWriter;

use crate::db::db_path;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProjectResult {
    pub path: String,
    pub manifest_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
    version: i64,
    created_at: String,
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

    let tarot_dir = root.join(".tarot");
    let dest_file =
        File::create(destination_path).map_err(|e| AppError::PathNotWritable(e.to_string()))?;
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

    let manifest = Manifest {
        version: 1,
        created_at: "2026-08-14T00:00:00Z".to_string(),
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
        path: destination_path.to_string(),
        manifest_sha256,
    })
}

#[tauri::command]
pub fn export_project(
    project_path: String,
    destination_path: String,
) -> Result<ExportProjectResult, AppError> {
    export_project_service(Path::new(&project_path), &destination_path)
}
