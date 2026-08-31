//! Walks `RevSpec::All` on the repo at `$T4_BENCH_REPO` and prints rows + elapsed.
//! `T4_BENCH_REPO=path cargo run -p git-core --release --example walk_bench`

use std::sync::atomic::AtomicBool;
use std::time::Instant;

use git_core::log::{walk, LogFilter, RevSpec};
use git_core::RepoHandle;

fn main() {
    let path = std::env::var("T4_BENCH_REPO").expect("set T4_BENCH_REPO to a repository path");
    let t0 = Instant::now();
    let handle = RepoHandle::open(&path).expect("open repo");
    let repo = handle.open_private().expect("open private handle");
    let opened = t0.elapsed();

    let t1 = Instant::now();
    let mut rows = 0usize;
    let mut chunks = 0usize;
    let mut max_lane = 0u16;
    let cancel = AtomicBool::new(false);
    let n = walk(
        &repo,
        &RevSpec::All,
        &LogFilter::default(),
        &cancel,
        |chunk| {
            chunks += 1;
            rows += chunk.len();
            max_lane = chunk.iter().map(|r| r.max_lane).fold(max_lane, u16::max);
            true
        },
    )
    .expect("walk");
    let walked = t1.elapsed();

    println!("repo:     {}", handle.path.display());
    println!("open:     {opened:?}");
    println!("rows:     {n} ({rows} via {chunks} chunks)");
    println!("max lane: {max_lane}");
    println!("walk:     {walked:?}");
}
