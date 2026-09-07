use serde::{Deserialize, Serialize};

/// Commit metadata for one log row. Times are unix seconds (UTC).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Full 40-hex oid.
    pub oid: String,
    /// First 7 hex chars.
    pub short: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub committer_time: i64,
    pub parents: Vec<String>,
    pub is_merge: bool,
}

impl CommitInfo {
    pub fn from_commit(c: &git2::Commit<'_>) -> CommitInfo {
        let oid = c.id().to_string();
        let short = oid[..7].to_string();
        let author = c.author();
        let parents: Vec<String> = c.parent_ids().map(|p| p.to_string()).collect();
        CommitInfo {
            short,
            oid,
            summary: String::from_utf8_lossy(c.summary_bytes().unwrap_or_default()).into_owned(),
            author_name: String::from_utf8_lossy(author.name_bytes()).into_owned(),
            author_email: String::from_utf8_lossy(author.email_bytes()).into_owned(),
            author_time: author.when().seconds(),
            committer_time: c.time().seconds(),
            is_merge: parents.len() > 1,
            parents,
        }
    }
}

/// Geometry of one line segment within a row. See [`GraphRow`] for the
/// coordinate system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LineKind {
    /// Leaves the node (row center, x = `lane`) and exits the bottom edge at `to`.
    /// `from` == the row's `lane`. Used for every parent link, including the
    /// first parent continuing straight down (`to` == `lane`).
    Branch,
    /// Enters at the top edge at `from` and ends at the node (row center).
    /// `to` == the row's `lane`. Used for every child line converging on this
    /// commit, including the node's own column arriving from above (`from` == `lane`).
    Merge,
    /// Pass-through: enters the top edge at `from`, exits the bottom edge at
    /// `to`, never touches the node. `from` != `to` when columns to the left
    /// were freed (shift left, gitk-style) or inserted (shift right) in this row.
    Straight,
}

/// One drawn segment. Colors index the 8-entry lane palette.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphLine {
    /// Column index at the top edge of the row (layout of the row above).
    pub from: u16,
    /// Column index at the bottom edge of the row (layout of the row below).
    pub to: u16,
    pub color: u8,
    pub kind: LineKind,
}

/// One log row. The node sits at the vertical center of the row at column
/// `lane`; every line spans the full row height between column `from` (top
/// edge) and `to` (bottom edge), see [`LineKind`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    pub commit: CommitInfo,
    pub lane: u16,
    pub color: u8,
    pub lines: Vec<GraphLine>,
    /// Highest column index touched by this row (node or any line end).
    pub max_lane: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Head,
    Local,
    Remote,
    Tag,
    Stash,
}

/// A ref chip attached to a row at page time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    /// Short name (`main`, `origin/main`, `v1.0`, `stash@{0}`, `HEAD`).
    pub name: String,
    pub kind: RefKind,
    /// `true` for the checked-out local branch.
    pub is_current: bool,
    /// For a local label: the remote whose tracking branch sits at the same
    /// commit (synced chip, e.g. `main · origin`); that remote's own label is
    /// then suppressed.
    pub remote: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRow {
    pub row: GraphRow,
    pub labels: Vec<RefLabel>,
}

/// Which commits to walk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "refs", rename_all = "camelCase")]
pub enum RevSpec {
    /// HEAD + all local branches, remote branches and tags.
    All,
    /// HEAD only.
    Head,
    /// Explicit full ref names (`refs/heads/main`).
    Refs(Vec<String>),
}

/// Log filter. Only `text` is implemented (case-insensitive substring match
/// on summary / author name / author email); `author` and `path` are accepted
/// but currently ignored. When any filter is active the graph is not laid out
/// (rows get `lane` 0 and no lines) since filtered rows have no contiguous topology.
/// `working_tree` seeds the layout with a column expecting HEAD so the
/// working-tree pseudo-row connects to it (the graph re-lays out when it flips).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFilter {
    pub text: Option<String>,
    pub author: Option<String>,
    pub path: Option<String>,
    #[serde(default)]
    pub working_tree: bool,
}

impl LogFilter {
    /// `true` when a filter that actually restricts output is set.
    pub fn is_active(&self) -> bool {
        self.text.as_deref().is_some_and(|t| !t.trim().is_empty())
    }
}
