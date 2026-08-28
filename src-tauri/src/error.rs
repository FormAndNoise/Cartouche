use serde::Serialize;
use thiserror::Error;

/// Structured error envelope returned to the frontend via Tauri IPC.
///
/// Every command error is serialized as `{code, message, details}` (US-B09).
/// The `code` string is drawn from a fixed enum so the UI can match on it
/// without parsing free-form text.
#[derive(Debug, Error)]
pub enum AppError {
 #[error("socket_count must be positive")]
 InvalidSocketCount,
 #[error("grid_columns must be between 1 and 4")]
 InvalidGridColumns,
 #[error("path is not writable: {0}")]
 PathNotWritable(String),
 #[error("project not found")]
 NotFound,
 #[error("project is corrupt: {0}")]
 ProjectCorrupt(String),
 #[error("socket is locked")]
 Locked,
 #[error("socket not found")]
 SocketNotFound,
 #[error("file is unreadable: {0}")]
 FileUnreadable(String),
 #[error("unsupported format")]
 UnsupportedFormat,
 #[error("work is the selected winner; use force to remove")]
 IsSelected,
 #[error("confirmation required")]
 ConfirmationRequired,
 #[error("missing required column: {0}")]
 MissingRequiredColumn(String),
 #[error("duplicate socket ID")]
 DuplicateId,
 #[error("missing socket in reorder list")]
 MissingSocket,
 #[error("asset file is missing: {0}")]
 AssetMissing(String),
 #[error("validation error: {0}")]
 ValidationError(String),
 #[error("database error: {0}")]
 Database(#[from] rusqlite::Error),
 #[error("filesystem error: {0}")]
 Io(#[from] std::io::Error),
 #[error("internal error: {0}")]
 Internal(String),
}

impl AppError {
 pub(crate) fn code(&self) -> &'static str {
 match self {
 AppError::InvalidSocketCount => "INVALID_SOCKET_COUNT",
 AppError::InvalidGridColumns => "INVALID_GRID_COLUMNS",
 AppError::PathNotWritable(_) => "PATH_NOT_WRITABLE",
 AppError::NotFound => "NOT_FOUND",
 AppError::ProjectCorrupt(_) => "PROJECT_CORRUPT",
 AppError::Locked => "LOCKED",
 AppError::SocketNotFound => "SOCKET_NOT_FOUND",
 AppError::FileUnreadable(_) => "FILE_UNREADABLE",
 AppError::UnsupportedFormat => "UNSUPPORTED_FORMAT",
 AppError::IsSelected => "IS_SELECTED",
 AppError::ConfirmationRequired => "CONFIRMATION_REQUIRED",
 AppError::MissingRequiredColumn(_) => "MISSING_REQUIRED_COLUMN",
 AppError::DuplicateId => "DUPLICATE_ID",
 AppError::MissingSocket => "MISSING_SOCKET",
 AppError::AssetMissing(_) => "ASSET_MISSING",
 AppError::ValidationError(_) => "VALIDATION_ERROR",
 AppError::Database(_) => "DATABASE_ERROR",
 AppError::Io(_) => "IO_ERROR",
 AppError::Internal(_) => "INTERNAL_ERROR",
 }
 }
}

/// Serialize so Tauri can send the structured envelope to the frontend.
impl Serialize for AppError {
 fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
 where
 S: serde::Serializer,
 {
 use serde::ser::SerializeStruct;
 let mut state = serializer.serialize_struct("AppError", 3)?;
 state.serialize_field("code", self.code())?;
 state.serialize_field("message", &self.to_string())?;
 state.serialize_field("details", &Option::<()>::None)?;
 state.end()
 }
}
