//! Unmerged index entries: the three sides of a conflict, and opening them in
//! an external three-way merge editor.
//!
//! Resolution itself is the editor's job — this crate only shows the conflict
//! (`diff::file_diff`), hands the sides to a merge tool, and stages the file
//! once the user has resolved it.

use std::path::{Path, PathBuf};
use std::process::Command;

use git2::{Oid, Repository};

use crate::tools::Tool;
use crate::{map_git2, GitError};

/// Blob ids of one unmerged path. Any side can be missing: a modify/delete
/// conflict has no `ours` or no `theirs`, an add/add has no `ancestor`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConflictStages {
    pub ancestor: Option<Oid>,
    pub ours: Option<Oid>,
    pub theirs: Option<Oid>,
}

/// The stages of `path`, or `None` when it is not unmerged.
pub fn stages(repo: &Repository, path: &str) -> Result<Option<ConflictStages>, GitError> {
    let mut index = repo.index().map_err(map_git2)?;
    // The CLI wrote this index a moment ago (merge, rebase, `apply --cached`),
    // and libgit2 hands back the copy it last read.
    index.read(false).map_err(map_git2)?;
    if !index.has_conflicts() {
        return Ok(None);
    }
    for c in index.conflicts().map_err(map_git2)? {
        let c = c.map_err(map_git2)?;
        let named = c.our.as_ref().or(c.their.as_ref()).or(c.ancestor.as_ref());
        let Some(named) = named else { continue };
        if named.path == path.as_bytes() {
            return Ok(Some(ConflictStages {
                ancestor: c.ancestor.map(|e| e.id),
                ours: c.our.map(|e| e.id),
                theirs: c.their.map(|e| e.id),
            }));
        }
    }
    Ok(None)
}

/// Merge editors we know how to drive, most-preferred first. All of them are
/// VS Code and its forks, which share `--merge <ours> <theirs> <base> <result>`.
///
/// On Windows the launcher on `PATH` is the `.cmd` shim; naming it explicitly
/// is what makes the spawn find it (`CreateProcess` does not consult `PATHEXT`).
const EDITORS: &[&str] = &[
    #[cfg(windows)]
    "code.cmd",
    #[cfg(windows)]
    "codium.cmd",
    #[cfg(windows)]
    "code-insiders.cmd",
    "code",
    "codium",
    "code-insiders",
];

/// Where [`open_merge_editor`] writes the three sides of a conflict.
fn merge_temp_dir() -> PathBuf {
    crate::tools::temp_dir_named("t4-git-ui-merge")
}

/// Removes every side [`open_merge_editor`] and [`crate::tools::open_diff_tool`]
/// have ever written. Meant for app start: nothing of ours can still be open in
/// an editor then, and the OS is not going to clean the temp dir for us.
pub fn clean_merge_temp() -> std::io::Result<()> {
    remove_temp(merge_temp_dir())?;
    remove_temp(crate::tools::diff_temp_dir())
}

fn remove_temp(dir: PathBuf) -> std::io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        r => r,
    }
}

pub(crate) fn stage_file(
    repo: &Repository,
    dir: &Path,
    path: &str,
    side: &str,
    id: Option<Oid>,
) -> Result<PathBuf, GitError> {
    let name = Path::new(path).file_name().unwrap_or_default();
    let name = Path::new(name);
    let stem = name.file_stem().unwrap_or_default().to_string_lossy();
    let ext = name.extension().map(|e| e.to_string_lossy().into_owned());
    // The extension is kept last so the editor still knows the language.
    let file = match &ext {
        Some(ext) => dir.join(format!("{stem}.{side}.{ext}")),
        None => dir.join(format!("{stem}.{side}")),
    };
    let content = match id {
        Some(id) => repo.find_blob(id).map_err(map_git2)?.content().to_vec(),
        // A side that does not exist is an empty file: that is what the merge
        // editor shows for "deleted here".
        None => Vec::new(),
    };
    std::fs::write(&file, content)?;
    Ok(file)
}

/// Opens `path`'s conflict in `tool` — VS Code's three-way merge editor when
/// none is configured: its three sides are written beside each other in a temp
/// directory and the file in the working tree is the merge result the tool
/// writes back to.
///
/// Returns the launcher that was used. `Refused` when the path is not unmerged,
/// `Config` when no launcher is on `PATH` — nothing is installed on anyone's
/// behalf.
pub fn open_merge_editor(
    repo: &Repository,
    path: &str,
    tool: Option<&Tool>,
) -> Result<String, GitError> {
    let Some(stages) = stages(repo, path)? else {
        return Err(GitError::Refused(format!("{path} is not conflicted")));
    };
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Refused("bare repository".into()))?;
    let merged = workdir.join(path);

    // One directory per path so a second file's sides cannot overwrite the first's.
    let dir = merge_temp_dir().join(format!("{:x}", oid_key(&stages)));
    std::fs::create_dir_all(&dir)?;
    let ours = stage_file(repo, &dir, path, "LOCAL", stages.ours)?;
    let theirs = stage_file(repo, &dir, path, "REMOTE", stages.theirs)?;
    let base = stage_file(repo, &dir, path, "BASE", stages.ancestor)?;

    if let Some(tool) = tool {
        return crate::tools::spawn_tool(
            &tool.cmd,
            &[
                ("LOCAL", &ours),
                ("REMOTE", &theirs),
                ("BASE", &base),
                ("MERGED", &merged),
            ],
        );
    }

    let mut last: Option<std::io::Error> = None;
    for exe in EDITORS {
        let mut cmd = Command::new(exe);
        cmd.arg("--merge")
            .arg(&ours)
            .arg(&theirs)
            .arg(&base)
            .arg(&merged);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            // Not waited for here: the editor outlives this call, and the
            // watcher picks up the resolved file whenever it is saved.
            Ok(child) => {
                crate::tools::detach(child);
                return Ok((*exe).to_string());
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => last = Some(e),
            Err(e) => return Err(e.into()),
        }
    }
    debug_assert!(last.is_some());
    Err(GitError::Config(
        "No merge editor found: put VS Code's `code` (or VSCodium's `codium`) on PATH — \
         in VS Code that is the “Shell Command: Install 'code' command in PATH” action"
            .into(),
    ))
}

/// A stable per-conflict directory name: the sides that exist, hashed together.
fn oid_key(stages: &ConflictStages) -> u64 {
    let mut key = 0u64;
    for id in [stages.ancestor, stages.ours, stages.theirs]
        .into_iter()
        .flatten()
    {
        for b in id.as_bytes() {
            key = key.wrapping_mul(31).wrapping_add(u64::from(*b));
        }
    }
    key
}
