use serde::{Deserialize, Deserializer, Serialize};
use std::path::PathBuf;

/// A single socket slot in the project grid.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Socket {
    pub id: i64,
    pub position: i64,
    pub title: String,
    pub notes: String,
    pub metadata_json: String,
    pub locked: bool,
    pub selected_work_id: Option<i64>,
}

/// A project containing its ordered sockets.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Project {
    pub name: String,
    pub path: PathBuf,
    pub grid_columns: i64,
    pub sockets: Vec<Socket>,
}

/// Flexible ID deserializer accepting either a JSON integer or numeric string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SocketId(pub i64);

impl<'de> Deserialize<'de> for SocketId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Value {
            Num(i64),
            Str(String),
        }

        match Value::deserialize(deserializer)? {
            Value::Num(n) => Ok(SocketId(n)),
            Value::Str(s) => s
                .parse::<i64>()
                .map(SocketId)
                .map_err(serde::de::Error::custom),
        }
    }
}
