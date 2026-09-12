//! Incremental gitk-style lane layout.
//!
//! Commits are pushed in walk order (children before parents). The layout keeps
//! one `Column` per line that is still "open" — each column is waiting for a
//! specific commit (`expecting`) to arrive. The column list entering a row is
//! the *top* layout (indices used for `GraphLine::from`); the list after the
//! row is processed is the *bottom* layout (indices used for `GraphLine::to`).
//! The node's own x is `lane`, which is stable in both layouts because every
//! removal/insertion made by a row happens at or to the right of `lane`.
//!
//! Per commit:
//! 1. Find columns expecting it. None → new column appended (new color).
//!    `lane` = first match; further matches emit `Merge` lines and are removed.
//! 2. First parent: if another open column already expects it, emit a `Branch`
//!    line to that column and drop this lane (eager dedupe keeps the graph
//!    narrow); else this column now expects it.
//! 3. Other parents: existing column expecting it → `Branch` line to it; else
//!    a new column (new color) is inserted right after `lane`.
//! 4. No parents → column removed.
//! 5. Every untouched column emits a `Straight` line (`from` may differ from
//!    `to` when columns left of it were removed).
//!
//! `open` seeds a column before the first commit is pushed, so a row above the
//! walk (the working-tree pseudo-row) can join the lineage it expects.

use git2::Oid;

use super::types::{GraphLine, LineKind};

pub const LANE_COLORS: u32 = 8;

#[derive(Debug, Clone)]
struct Column {
    expecting: Oid,
    color: u8,
}

/// Result of placing one commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Placement {
    pub lane: u16,
    pub color: u8,
    pub lines: Vec<GraphLine>,
    pub max_lane: u16,
}

#[derive(Debug, Default)]
pub struct LaneLayout {
    columns: Vec<Column>,
    next_color: u32,
}

/// Where an outgoing (parent) line ends in the bottom layout.
enum Target {
    /// Index in the top layout of a surviving column.
    Top(usize),
    /// Index into this row's list of newly inserted columns.
    Inserted(usize),
}

fn lane_u16(i: usize) -> u16 {
    u16::try_from(i).unwrap_or(u16::MAX)
}

impl LaneLayout {
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of currently open columns (width of the bottom layout).
    pub fn width(&self) -> usize {
        self.columns.len()
    }

    fn alloc_color(&mut self) -> u8 {
        let c = (self.next_color % LANE_COLORS) as u8;
        self.next_color = self.next_color.wrapping_add(1);
        c
    }

    fn find_expecting(&self, oid: Oid, removed: &[bool]) -> Option<usize> {
        self.columns
            .iter()
            .enumerate()
            .find(|(i, c)| !removed[*i] && c.expecting == oid)
            .map(|(i, _)| i)
    }

    /// Opens a column expecting `oid` before any commit is pushed: the working-tree
    /// pseudo-row's link to HEAD (it takes color 0, so HEAD's lineage sits in lane 0).
    pub fn open(&mut self, oid: Oid) {
        let color = self.alloc_color();
        self.columns.push(Column {
            expecting: oid,
            color,
        });
    }

    pub fn push(&mut self, oid: Oid, parents: &[Oid]) -> Placement {
        let top_len = self.columns.len();
        let matches: Vec<usize> = (0..top_len)
            .filter(|&i| self.columns[i].expecting == oid)
            .collect();

        let (lane, is_new) = match matches.first() {
            Some(&l) => (l, false),
            None => {
                let color = self.alloc_color();
                self.columns.push(Column {
                    expecting: oid,
                    color,
                });
                (top_len, true)
            }
        };
        let color = self.columns[lane].color;
        let mut removed = vec![false; self.columns.len()];
        let mut lines: Vec<GraphLine> = Vec::new();

        // Incoming: this column's own line from above + extra children merging in.
        if !is_new {
            lines.push(GraphLine {
                from: lane_u16(lane),
                to: lane_u16(lane),
                color,
                kind: LineKind::Merge,
            });
        }
        for &j in matches.iter().skip(1) {
            lines.push(GraphLine {
                from: lane_u16(j),
                to: lane_u16(lane),
                color: self.columns[j].color,
                kind: LineKind::Merge,
            });
            removed[j] = true;
        }

        // Outgoing: one line per parent.
        let mut out: Vec<(Target, u8)> = Vec::new();
        let mut inserted: Vec<Column> = Vec::new();
        match parents.split_first() {
            None => removed[lane] = true,
            Some((&p0, rest)) => {
                match self.find_expecting(p0, &removed) {
                    Some(k) => {
                        out.push((Target::Top(k), self.columns[k].color));
                        removed[lane] = true;
                    }
                    None => {
                        self.columns[lane].expecting = p0;
                        out.push((Target::Top(lane), color));
                    }
                }
                for (i, &p) in rest.iter().enumerate() {
                    // A parent listed twice gets one line, not two identical ones.
                    if p == p0 || rest[..i].contains(&p) {
                        continue;
                    }
                    if let Some(k) = self.find_expecting(p, &removed) {
                        out.push((Target::Top(k), self.columns[k].color));
                    } else if let Some(n) = inserted.iter().position(|c| c.expecting == p) {
                        out.push((Target::Inserted(n), inserted[n].color));
                    } else {
                        let c = self.alloc_color();
                        inserted.push(Column {
                            expecting: p,
                            color: c,
                        });
                        out.push((Target::Inserted(inserted.len() - 1), c));
                    }
                }
            }
        }

        // Build the bottom layout and the top→bottom index map.
        let mut bottom: Vec<Column> = Vec::with_capacity(self.columns.len() + inserted.len());
        let mut top_to_bottom: Vec<Option<usize>> = vec![None; self.columns.len()];
        let mut inserted_to_bottom: Vec<usize> = vec![0; inserted.len()];
        for i in 0..self.columns.len() {
            if !removed[i] {
                top_to_bottom[i] = Some(bottom.len());
                bottom.push(self.columns[i].clone());
            }
            if i == lane {
                for (n, c) in inserted.drain(..).enumerate() {
                    inserted_to_bottom[n] = bottom.len();
                    bottom.push(c);
                }
            }
        }

        for (target, line_color) in out {
            let to = match target {
                Target::Top(k) => top_to_bottom[k],
                Target::Inserted(n) => inserted_to_bottom.get(n).copied(),
            };
            if let Some(to) = to {
                lines.push(GraphLine {
                    from: lane_u16(lane),
                    to: lane_u16(to),
                    color: line_color,
                    kind: LineKind::Branch,
                });
            }
        }

        // Pass-through columns.
        for i in 0..top_len {
            if i == lane || removed[i] {
                continue;
            }
            if let Some(to) = top_to_bottom[i] {
                lines.push(GraphLine {
                    from: lane_u16(i),
                    to: lane_u16(to),
                    color: self.columns[i].color,
                    kind: LineKind::Straight,
                });
            }
        }

        self.columns = bottom;

        let max_lane = lines
            .iter()
            .flat_map(|l| [l.from, l.to])
            .fold(lane_u16(lane), u16::max);

        Placement {
            lane: lane_u16(lane),
            color,
            lines,
            max_lane,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use LineKind::*;

    fn o(n: u8) -> Oid {
        let mut b = [0u8; 20];
        b[19] = n;
        Oid::from_bytes(&b).expect("oid")
    }

    fn line(kind: LineKind, from: u16, to: u16, color: u8) -> GraphLine {
        GraphLine {
            from,
            to,
            color,
            kind,
        }
    }

    #[test]
    fn linear() {
        let mut l = LaneLayout::new();
        let c = l.push(o(2), &[o(1)]);
        assert_eq!((c.lane, c.color, c.max_lane), (0, 0, 0));
        assert_eq!(c.lines, vec![line(Branch, 0, 0, 0)]);
        let b = l.push(o(1), &[o(0)]);
        assert_eq!(b.lane, 0);
        assert_eq!(b.lines, vec![line(Merge, 0, 0, 0), line(Branch, 0, 0, 0)]);
        let a = l.push(o(0), &[]);
        assert_eq!(a.lane, 0);
        assert_eq!(a.lines, vec![line(Merge, 0, 0, 0)]);
        assert_eq!(l.width(), 0);
    }

    #[test]
    fn fork_and_merge() {
        // M(3) -> B(1), C(2); B -> A(0); C -> A(0)
        let mut l = LaneLayout::new();
        let m = l.push(o(3), &[o(1), o(2)]);
        assert_eq!((m.lane, m.color, m.max_lane), (0, 0, 1));
        assert_eq!(m.lines, vec![line(Branch, 0, 0, 0), line(Branch, 0, 1, 1)]);

        let c = l.push(o(2), &[o(0)]);
        assert_eq!((c.lane, c.color), (1, 1));
        assert_eq!(
            c.lines,
            vec![
                line(Merge, 1, 1, 1),
                line(Branch, 1, 1, 1),
                line(Straight, 0, 0, 0)
            ]
        );

        // B's first parent A is already expected by column 1 → dedupe: B's lane
        // ends here, column 1 shifts left to 0.
        let b = l.push(o(1), &[o(0)]);
        assert_eq!((b.lane, b.color, b.max_lane), (0, 0, 1));
        assert_eq!(
            b.lines,
            vec![
                line(Merge, 0, 0, 0),
                line(Branch, 0, 0, 1),
                line(Straight, 1, 0, 1)
            ]
        );
        assert_eq!(l.width(), 1);

        let a = l.push(o(0), &[]);
        assert_eq!((a.lane, a.color), (0, 1));
        assert_eq!(a.lines, vec![line(Merge, 0, 0, 1)]);
        assert_eq!(l.width(), 0);
    }

    #[test]
    fn a_repeated_parent_draws_one_line() {
        // A merge of a commit with itself: git allows it, the graph must not
        // stack two identical lines on the same lane.
        let mut l = LaneLayout::new();
        let m = l.push(o(1), &[o(0), o(0)]);
        assert_eq!((m.lane, m.color, m.max_lane), (0, 0, 0));
        assert_eq!(m.lines, vec![line(Branch, 0, 0, 0)]);
        assert_eq!(l.width(), 1);
    }

    #[test]
    fn octopus() {
        // M(4) -> 1, 2, 3; each -> 0
        let mut l = LaneLayout::new();
        let m = l.push(o(4), &[o(1), o(2), o(3)]);
        assert_eq!((m.lane, m.max_lane), (0, 2));
        assert_eq!(
            m.lines,
            vec![
                line(Branch, 0, 0, 0),
                line(Branch, 0, 1, 1),
                line(Branch, 0, 2, 2)
            ]
        );
        assert_eq!(l.width(), 3);

        let c3 = l.push(o(3), &[o(0)]);
        assert_eq!((c3.lane, c3.color), (2, 2));
        assert_eq!(
            c3.lines,
            vec![
                line(Merge, 2, 2, 2),
                line(Branch, 2, 2, 2),
                line(Straight, 0, 0, 0),
                line(Straight, 1, 1, 1),
            ]
        );

        let c2 = l.push(o(2), &[o(0)]);
        assert_eq!((c2.lane, c2.color), (1, 1));
        assert_eq!(
            c2.lines,
            vec![
                line(Merge, 1, 1, 1),
                line(Branch, 1, 1, 2),
                line(Straight, 0, 0, 0),
                line(Straight, 2, 1, 2),
            ]
        );
        assert_eq!(l.width(), 2);

        let c1 = l.push(o(1), &[o(0)]);
        assert_eq!((c1.lane, c1.color), (0, 0));
        assert_eq!(
            c1.lines,
            vec![
                line(Merge, 0, 0, 0),
                line(Branch, 0, 0, 2),
                line(Straight, 1, 0, 2),
            ]
        );
        assert_eq!(l.width(), 1);

        let c0 = l.push(o(0), &[]);
        assert_eq!((c0.lane, c0.color), (0, 2));
        assert_eq!(l.width(), 0);
    }

    #[test]
    fn two_orphan_roots_interleaved() {
        // D(3) -> C(2) ; B(1) -> A(0); walk order D, B, C, A
        let mut l = LaneLayout::new();
        let d = l.push(o(3), &[o(2)]);
        assert_eq!((d.lane, d.color), (0, 0));
        let b = l.push(o(1), &[o(0)]);
        assert_eq!((b.lane, b.color, b.max_lane), (1, 1, 1));
        assert_eq!(
            b.lines,
            vec![line(Branch, 1, 1, 1), line(Straight, 0, 0, 0)]
        );
        // C is a root: its column closes and B's column shifts left.
        let c = l.push(o(2), &[]);
        assert_eq!((c.lane, c.color), (0, 0));
        assert_eq!(c.lines, vec![line(Merge, 0, 0, 0), line(Straight, 1, 0, 1)]);
        assert_eq!(l.width(), 1);
        let a = l.push(o(0), &[]);
        assert_eq!((a.lane, a.color), (0, 1));
        assert_eq!(a.lines, vec![line(Merge, 0, 0, 1)]);
        assert_eq!(l.width(), 0);
    }

    #[test]
    fn two_orphan_roots_sequential() {
        let mut l = LaneLayout::new();
        l.push(o(1), &[o(0)]);
        l.push(o(0), &[]);
        assert_eq!(l.width(), 0);
        let d = l.push(o(3), &[o(2)]);
        assert_eq!((d.lane, d.color), (0, 1));
        let c = l.push(o(2), &[]);
        assert_eq!((c.lane, c.color), (0, 1));
    }

    #[test]
    fn dedupe_two_tips_sharing_first_parent() {
        let mut l = LaneLayout::new();
        let t1 = l.push(o(2), &[o(0)]);
        assert_eq!((t1.lane, t1.color), (0, 0));
        let t2 = l.push(o(1), &[o(0)]);
        assert_eq!((t2.lane, t2.color, t2.max_lane), (1, 1, 1));
        assert_eq!(
            t2.lines,
            vec![line(Branch, 1, 0, 0), line(Straight, 0, 0, 0)]
        );
        assert_eq!(l.width(), 1);
        let p = l.push(o(0), &[]);
        assert_eq!((p.lane, p.color), (0, 0));
        assert_eq!(p.lines, vec![line(Merge, 0, 0, 0)]);
    }

    #[test]
    fn insertion_shifts_right_hand_column() {
        // Top: [1, 2]. Commit 1 → parents (3, 4): 4 is inserted right after
        // lane 0, so the column expecting 2 shifts from index 1 to 2.
        let mut l = LaneLayout::new();
        l.push(o(9), &[o(1), o(2)]);
        let c = l.push(o(1), &[o(3), o(4)]);
        assert_eq!((c.lane, c.max_lane), (0, 2));
        assert_eq!(
            c.lines,
            vec![
                line(Merge, 0, 0, 0),
                line(Branch, 0, 0, 0),
                line(Branch, 0, 1, 2),
                line(Straight, 1, 2, 1),
            ]
        );
        assert_eq!(l.width(), 3);
    }

    #[test]
    fn second_parent_reuses_existing_column() {
        // Top: [1, 2]. Commit 1 → parents (3, 2): column 1 already expects 2.
        let mut l = LaneLayout::new();
        l.push(o(9), &[o(1), o(2)]);
        let c = l.push(o(1), &[o(3), o(2)]);
        assert_eq!(
            c.lines,
            vec![
                line(Merge, 0, 0, 0),
                line(Branch, 0, 0, 0),
                line(Branch, 0, 1, 1),
                line(Straight, 1, 1, 1),
            ]
        );
        assert_eq!(l.width(), 2);
    }

    #[test]
    fn max_lane_counts_merge_from_beyond_bottom_width() {
        // Top: [5, 1]. Root commit 1 closes column 1 → bottom width 1, but the
        // Merge line still comes in at column 1.
        let mut l = LaneLayout::new();
        l.push(o(9), &[o(5)]);
        l.push(o(8), &[o(1)]);
        let c = l.push(o(1), &[]);
        assert_eq!(c.lines, vec![line(Merge, 1, 1, 1), line(Straight, 0, 0, 0)]);
        assert_eq!(l.width(), 1);
        assert_eq!(c.max_lane, 1);
    }

    #[test]
    fn seeded_column_keeps_lane_zero_for_the_expected_commit() {
        // HEAD(1) is expected before the walk starts; C(2) is walked first and
        // is pushed aside into lane 1, leaving a pass-through above HEAD.
        let mut l = LaneLayout::new();
        l.open(o(1));
        let c = l.push(o(2), &[o(3)]);
        assert_eq!((c.lane, c.color), (1, 1));
        assert_eq!(
            c.lines,
            vec![line(Branch, 1, 1, 1), line(Straight, 0, 0, 0)]
        );

        // HEAD arrives in the seeded column; its first parent is already
        // expected by C's column, so the seeded lane ends here.
        let h = l.push(o(1), &[o(3)]);
        assert_eq!((h.lane, h.color), (0, 0));
        assert_eq!(
            h.lines,
            vec![
                line(Merge, 0, 0, 0),
                line(Branch, 0, 0, 1),
                line(Straight, 1, 0, 1),
            ]
        );
        assert_eq!(l.width(), 1);
    }

    #[test]
    fn seeded_column_absorbs_a_child_of_the_expected_commit() {
        // A commit whose first parent is HEAD dedupes into the seeded column.
        let mut l = LaneLayout::new();
        l.open(o(1));
        let c = l.push(o(2), &[o(1)]);
        assert_eq!((c.lane, c.color), (1, 1));
        assert_eq!(
            c.lines,
            vec![line(Branch, 1, 0, 0), line(Straight, 0, 0, 0)]
        );
        assert_eq!(l.width(), 1);
    }

    #[test]
    fn colors_wrap_at_eight() {
        let mut l = LaneLayout::new();
        for n in 0..10u8 {
            let p = l.push(o(100 + n), &[]);
            assert_eq!(p.color, n % 8);
        }
    }
}
