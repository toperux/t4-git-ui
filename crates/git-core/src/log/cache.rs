use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use super::types::{GraphRow, RefLabel};

/// Process-global generation counter so a close + reopen of the same repo can
/// never hand out a generation number an older walk is still using.
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Rows of the most recent walk. `generation` is bumped whenever a new walk
/// starts; a walk whose generation no longer matches abandons itself, and the
/// `cancel` flag it was given is raised so it stops promptly.
#[derive(Debug, Default)]
pub struct LogCache {
    pub generation: u64,
    pub rows: Vec<GraphRow>,
    pub complete: bool,
    pub error: Option<String>,
    /// Cancellation flag of the walk that owns `generation`.
    pub cancel: Arc<AtomicBool>,
    /// Ref labels per commit oid, as of the last time the caller refreshed them.
    pub labels: Arc<HashMap<String, Vec<RefLabel>>>,
}

impl LogCache {
    /// Cancels the previous walk, resets for a new one and returns the new generation.
    pub fn begin(&mut self) -> u64 {
        self.cancel.store(true, Ordering::Relaxed);
        self.cancel = Arc::new(AtomicBool::new(false));
        self.generation = NEXT.fetch_add(1, Ordering::Relaxed);
        self.rows.clear();
        self.complete = false;
        self.error = None;
        self.generation
    }

    /// Row index of commit `oid` among the rows walked so far.
    pub fn find(&self, oid: &str) -> Option<usize> {
        self.rows.iter().position(|r| r.commit.oid == oid)
    }

    /// Returns `(rows[offset..offset+limit], total, complete)`.
    pub fn page(&self, offset: usize, limit: usize) -> (Vec<GraphRow>, usize, bool) {
        let total = self.rows.len();
        let start = offset.min(total);
        let end = start.saturating_add(limit).min(total);
        (self.rows[start..end].to_vec(), total, self.complete)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::log::types::CommitInfo;

    fn row(n: usize) -> GraphRow {
        GraphRow {
            commit: CommitInfo {
                oid: format!("{n:040x}"),
                short: format!("{n:07x}"),
                summary: String::new(),
                author_name: String::new(),
                author_email: String::new(),
                author_time: 0,
                committer_time: 0,
                parents: vec![],
                is_merge: false,
            },
            lane: 0,
            color: 0,
            lines: vec![],
            max_lane: 0,
        }
    }

    #[test]
    fn page_clamps() {
        let mut c = LogCache::default();
        let g1 = c.begin();
        assert!(g1 >= 1);
        c.rows.extend((0..5).map(row));
        let (rows, total, complete) = c.page(3, 10);
        assert_eq!((rows.len(), total, complete), (2, 5, false));
        let (rows, ..) = c.page(10, 10);
        assert!(rows.is_empty());
        let (rows, ..) = c.page(0, 2);
        assert_eq!(rows[1].commit.short, "0000001");
        assert_eq!(c.find(&format!("{:040x}", 3)), Some(3));
        assert_eq!(c.find("nope"), None);
        let g2 = c.begin();
        assert!(g2 > g1);
        assert!(c.rows.is_empty());
    }

    #[test]
    fn begin_cancels_previous_and_generations_are_global() {
        let mut a = LogCache::default();
        let old = Arc::clone(&a.cancel);
        let ga = a.begin();
        assert!(old.load(Ordering::Relaxed));
        let first = Arc::clone(&a.cancel);
        assert!(!first.load(Ordering::Relaxed));
        a.begin();
        assert!(first.load(Ordering::Relaxed));
        assert!(!a.cancel.load(Ordering::Relaxed));

        // A fresh cache (close + reopen) never reuses a generation.
        let mut b = LogCache::default();
        assert!(b.begin() > ga);
    }
}
