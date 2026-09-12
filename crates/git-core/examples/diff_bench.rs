//! Times `changed_files(Commit HEAD)`, `file_diff` of the largest changed file
//! and `status()` on the repo at `$T4_BENCH_REPO`.
//! `T4_BENCH_REPO=path cargo run -p git-core --release --example diff_bench`

use std::time::Instant;

use git_core::diff::{changed_files, file_diff, DiffOptions, DiffTarget};
use git_core::status::status;
use git_core::RepoHandle;

fn main() {
    let path = std::env::var("T4_BENCH_REPO").expect("set T4_BENCH_REPO to a repository path");
    let handle = RepoHandle::open(&path).expect("open repo");
    let repo = handle.git2.lock();
    let head = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .expect("HEAD commit")
        .id()
        .to_string();
    let target = DiffTarget::Commit { oid: head.clone() };

    let t0 = Instant::now();
    let files = changed_files(&repo, &target).expect("changed_files");
    let listed = t0.elapsed();

    let largest = files
        .iter()
        .max_by_key(|f| f.additions + f.deletions)
        .cloned();

    println!("repo:          {}", handle.path.display());
    println!("HEAD:          {head}");
    println!("changed_files: {} files in {listed:?}", files.len());
    if let Some(f) = largest {
        let t1 = Instant::now();
        let d =
            file_diff(&repo, &target, &f.path, None, &DiffOptions::default()).expect("file_diff");
        let lines: usize = d.hunks.iter().map(|h| h.lines.len()).sum();
        println!(
            "file_diff:     {} (+{} -{}) {} hunks / {lines} lines, truncated={} in {:?}",
            f.path,
            d.additions,
            d.deletions,
            d.hunks.len(),
            d.truncated,
            t1.elapsed()
        );
    }

    let t2 = Instant::now();
    let s = status(&repo).expect("status");
    println!(
        "status:        {} entries (staged {} / unstaged {} / untracked {}) in {:?}",
        s.entries.len(),
        s.staged,
        s.unstaged,
        s.untracked,
        t2.elapsed()
    );
}
