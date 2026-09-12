//! External diff / merge tools: the git-config entries GitExtensions writes
//! (`diff.guitool`, `difftool.<name>.path` / `.cmd`, and the `merge` pair),
//! finding a tool's executable, and spawning one on the sides of a diff.
//!
//! On Windows the command line is split here, not by a shell: whitespace
//! separates arguments, double quotes group them, and `$LOCAL` / `$REMOTE` /
//! `$BASE` / `$MERGED` are substituted with the files this module wrote — so a
//! `.cmd` with `&&` or a redirect in it only runs under git's sh. On unix the
//! command goes to `sh -c` with those four in the environment instead, which is
//! how `git difftool` / `git mergetool` run it, so an entry with a redirect or
//! `$(…)` in it works verbatim. `git difftool` keeps working on the same
//! entries either way, because that is the shape git itself stores.

use std::path::{Path, PathBuf};
use std::process::Command;

use git2::{Config, ErrorCode, Oid, Repository, Tree};
use serde::{Deserialize, Serialize};

use crate::conflict;
use crate::diff::DiffTarget;
use crate::repo::repo_relative;
use crate::{map_git2, GitError};

/// Which pair of config entries a tool belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolKind {
    Diff,
    Merge,
}

impl ToolKind {
    /// Config section holding the per-tool entries (`difftool.<name>.path`).
    fn section(self) -> &'static str {
        match self {
            ToolKind::Diff => "difftool",
            ToolKind::Merge => "mergetool",
        }
    }

    /// Config section holding the selectors (`diff.tool` / `diff.guitool`).
    fn selector(self) -> &'static str {
        match self {
            ToolKind::Diff => "diff",
            ToolKind::Merge => "merge",
        }
    }
}

/// One configured tool: git's own name for it plus its two entries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub name: String,
    pub path: String,
    pub cmd: String,
}

/// The effective config (system + global + XDG + none of a repository's), for reads.
pub fn default_config() -> Result<Config, GitError> {
    Config::open_default()
        .and_then(|mut c| c.snapshot())
        .map_err(map_git2)
}

/// The file writes go to: "the global/XDG configuration file according to
/// git's rules" — `~/.gitconfig` unless the user created the XDG file, and
/// created on the first set. Never a multi-level `set_str`: libgit2 would pick
/// the highest level present, which may be neither.
pub fn global_config() -> Result<Config, GitError> {
    Config::open_default()
        .and_then(|mut c| c.open_global())
        .map_err(map_git2)
}

/// The configured tool of `kind`, `None` when no name is selected. `guitool`
/// wins — GitExtensions sets it for the GUI pick, `tool` is the CLI's.
pub fn get_tool(cfg: &Config, kind: ToolKind) -> Option<Tool> {
    let get = |key: &str| -> Option<String> {
        cfg.get_string(key)
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(|v| v.trim().to_string())
    };
    let sel = kind.selector();
    let name = get(&format!("{sel}.guitool")).or_else(|| get(&format!("{sel}.tool")))?;
    let sec = kind.section();
    let path = get(&format!("{sec}.{name}.path")).unwrap_or_default();
    let cmd = get(&format!("{sec}.{name}.cmd")).unwrap_or_default();
    Some(Tool { name, path, cmd })
}

/// Writes both selectors and the tool's own entries; `None` clears the two
/// selectors and leaves the tool's entries where they are (so re-picking it
/// brings its command back, exactly as GitExtensions leaves them).
pub fn set_tool(cfg: &mut Config, kind: ToolKind, tool: Option<&Tool>) -> Result<(), GitError> {
    let sel = kind.selector();
    match tool {
        Some(t) => {
            let sec = kind.section();
            for (key, value) in [
                (format!("{sel}.tool"), &t.name),
                (format!("{sel}.guitool"), &t.name),
                (format!("{sec}.{}.path", t.name), &t.path),
                (format!("{sec}.{}.cmd", t.name), &t.cmd),
            ] {
                cfg.set_str(&key, value).map_err(map_git2)?;
            }
        }
        None => {
            remove(cfg, &format!("{sel}.tool"))?;
            remove(cfg, &format!("{sel}.guitool"))?;
        }
    }
    Ok(())
}

/// Removes `key`; a key that was never set is not an error.
fn remove(cfg: &mut Config, key: &str) -> Result<(), GitError> {
    match cfg.remove(key) {
        Err(e) if e.code() == ErrorCode::NotFound => Ok(()),
        r => r.map_err(map_git2),
    }
}

/// Where installed tools are looked for, most-likely first.
fn roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let mut out = Vec::new();
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(dir) = std::env::var_os(var) {
                out.push(PathBuf::from(dir));
            }
        }
        // Where the per-user installers (VS Code, VSCodium) land.
        if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
            out.push(PathBuf::from(dir).join("Programs"));
        }
        out
    }
    #[cfg(not(windows))]
    {
        ["/usr/bin", "/usr/local/bin", "/opt", "/Applications"]
            .iter()
            .map(PathBuf::from)
            .collect()
    }
}

/// Names to try for `name` on `PATH`: `CreateProcess` does not consult
/// `PATHEXT`, so the extensions are spelled out.
fn exe_names(name: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        vec![
            name.to_string(),
            format!("{name}.exe"),
            format!("{name}.cmd"),
        ]
    }
    #[cfg(not(windows))]
    {
        vec![name.to_string()]
    }
}

/// Path of the first tool executable that exists: `rels` under the install
/// roots first — the real exe beats a `PATH` shim like VS Code's `code.cmd` —
/// then `names` on `PATH`.
pub fn find_tool(names: &[String], rels: &[String]) -> Option<String> {
    find_tool_in(&roots(), names, rels)
}

/// [`find_tool`] with the install roots supplied (tests).
pub fn find_tool_in(roots: &[PathBuf], names: &[String], rels: &[String]) -> Option<String> {
    // Forward slashes, as GitExtensions writes them; the roots come from `%ProgramFiles%` with backslashes.
    let found = |file: PathBuf| file.to_string_lossy().replace('\\', "/");
    for rel in rels {
        for root in roots {
            let file = root.join(rel);
            if file.is_file() {
                return Some(found(file));
            }
        }
    }
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        for name in names {
            for candidate in exe_names(name) {
                let file = dir.join(candidate);
                if file.is_file() {
                    return Some(found(file));
                }
            }
        }
    }
    None
}

/// Splits a tool command line: whitespace separates, double quotes group,
/// `\"` is a literal quote. No shell — `&&`, pipes and redirects are plain
/// arguments here.
fn tokenize(cmd: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut started = false;
    let mut quoted = false;
    let mut chars = cmd.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' if chars.peek() == Some(&'"') => {
                chars.next();
                cur.push('"');
                started = true;
            }
            '"' => {
                quoted = !quoted;
                started = true;
            }
            c if c.is_whitespace() && !quoted => {
                if started {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            c => {
                cur.push(c);
                started = true;
            }
        }
    }
    if started {
        out.push(cur);
    }
    out
}

/// Replaces `$NAME` / `${NAME}` in one token; an unknown name is left as written.
fn substitute(token: &str, vars: &[(&str, &Path)]) -> String {
    let mut out = String::new();
    let mut rest = token;
    while let Some(at) = rest.find('$') {
        out.push_str(&rest[..at]);
        let after = &rest[at + 1..];
        let (name, used) = match after
            .strip_prefix('{')
            .and_then(|inner| inner.find('}').map(|end| (&inner[..end], end + 2)))
        {
            Some(braced) => braced,
            None => {
                let end = after
                    .find(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                    .unwrap_or(after.len());
                (&after[..end], end)
            }
        };
        match vars.iter().find(|(n, _)| *n == name) {
            Some((_, file)) => out.push_str(&file.to_string_lossy()),
            None => {
                out.push('$');
                out.push_str(&after[..used]);
            }
        }
        rest = &after[used..];
    }
    out.push_str(rest);
    out
}

/// Waits for `child` on a thread of nobody's interest: the caller does not want
/// the tool's exit status, but on unix a child nothing reaps stays a zombie
/// until the app quits.
pub(crate) fn detach(mut child: std::process::Child) {
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

/// Spawns `cmd` with `vars` filled in, without waiting for it — the tool
/// outlives this call, as the merge editor always has. Returns the program's
/// file stem, for the toast.
pub fn spawn_tool(cmd: &str, vars: &[(&str, &Path)]) -> Result<String, GitError> {
    let mut args = tokenize(cmd).into_iter().map(|t| substitute(&t, vars));
    let prog = args
        .next()
        .filter(|p| !p.is_empty())
        .ok_or_else(|| GitError::Config("tool command is empty".into()))?;
    let not_found = || {
        GitError::Config(format!(
            "{prog} not found — check the tool's path in Settings"
        ))
    };

    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new(&prog);
        command.args(args);
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
        command
    };
    #[cfg(unix)]
    let mut command = {
        // sh reports a missing program as exit 127 and nothing else, so it is
        // checked here — except when sh is the one who resolves the name.
        if !prog.starts_with('~') && !prog.contains('$') {
            let there = if prog.contains('/') {
                Path::new(&prog).is_file()
            } else {
                find_tool_in(&[], std::slice::from_ref(&prog), &[]).is_some()
            };
            if !there {
                return Err(not_found());
            }
        }
        let mut command = Command::new("sh");
        command.arg("-c").arg(cmd);
        for (name, file) in vars {
            command.env(name, file);
        }
        command
    };

    match command.spawn() {
        Ok(child) => {
            detach(child);
            Ok(Path::new(&prog)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(not_found()),
        Err(e) => Err(e.into()),
    }
}

/// A temp directory of ours. Per user on unix: `/tmp` is shared, and the first
/// user to create the directory is the only one who can write in it.
pub(crate) fn temp_dir_named(name: &str) -> PathBuf {
    #[cfg(unix)]
    // SAFETY: plain libc call, no arguments and no failure mode.
    let name = format!("{name}-{}", unsafe { libc::getuid() });
    std::env::temp_dir().join(name)
}

/// Where [`open_diff_tool`] writes the two sides.
pub fn diff_temp_dir() -> PathBuf {
    temp_dir_named("t4-git-ui-diff")
}

/// Creates `<base>/<sub>` for one set of sides. The name of `base` is
/// predictable and on unix it sits in a world-writable `/tmp`, so it is created
/// for this user only (0700) and refused when something that is not a real
/// directory — a planted symlink or file — is there already, at either level:
/// `create_dir_all` would follow the symlink and write the sides wherever it
/// points. A `base` that exists but belongs to another user is refused too.
pub(crate) fn temp_subdir(base: PathBuf, sub: &str) -> Result<PathBuf, GitError> {
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    let refused = |p: &Path, why: &str| GitError::Refused(format!("{} {why}", p.display()));
    // `symlink_metadata`, so a link to a directory is seen as the link it is.
    match std::fs::symlink_metadata(&base) {
        Ok(m) if !m.is_dir() => return Err(refused(&base, "is not a directory")),
        // Someone else got to the predictable name first; 0700 on their
        // directory says nothing about who may write in it.
        #[cfg(unix)]
        // SAFETY: plain libc call, no arguments and no failure mode.
        Ok(m) if std::os::unix::fs::MetadataExt::uid(&m) != unsafe { libc::getuid() } => {
            return Err(refused(&base, "belongs to another user"))
        }
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => builder.create(&base)?,
        Err(e) => return Err(e.into()),
    }
    let dir = base.join(sub);
    if std::fs::symlink_metadata(&dir).is_ok_and(|m| !m.is_dir()) {
        return Err(refused(&dir, "is not a directory"));
    }
    builder.recursive(true).create(&dir)?;
    Ok(dir)
}

/// Blob id of `path` in `tree`, `None` when the side does not have the file.
fn blob_in(tree: Option<&Tree<'_>>, path: &str) -> Option<Oid> {
    tree?.get_path(Path::new(path)).ok().map(|e| e.id())
}

/// Blob id of `path` in the index (stage 0).
fn blob_in_index(repo: &Repository, path: &str) -> Result<Option<Oid>, GitError> {
    let mut index = repo.index().map_err(map_git2)?;
    index.read(false).map_err(map_git2)?;
    Ok(index.get_path(Path::new(path), 0).map(|e| e.id))
}

fn tree_of<'r>(repo: &'r Repository, oid: &str) -> Result<Tree<'r>, GitError> {
    let oid = Oid::from_str(oid).map_err(map_git2)?;
    repo.find_commit(oid)
        .and_then(|c| c.tree())
        .map_err(map_git2)
}

/// HEAD's tree, `None` when HEAD is unborn.
fn head_tree(repo: &Repository) -> Option<Tree<'_>> {
    repo.head().ok().and_then(|h| h.peel_to_tree().ok())
}

/// A stable per-diff directory name: the two sides and the path, hashed.
fn dir_key(old: Option<Oid>, new: Option<Oid>, path: &str) -> u64 {
    let mut key = 0u64;
    let mut mix = |bytes: &[u8]| {
        for b in bytes {
            key = key.wrapping_mul(31).wrapping_add(u64::from(*b));
        }
    };
    for id in [old, new].into_iter().flatten() {
        mix(id.as_bytes());
    }
    mix(path.as_bytes());
    key
}

/// The right-hand side of a diff: a blob to write out (missing = an empty
/// file), or the working-tree file itself.
enum RightSide {
    Blob(Option<Oid>),
    Workdir(PathBuf),
}

/// Opens `path`'s two sides of `target` in the configured diff tool: each side
/// is written to a temp file (a side the target does not have is an empty one),
/// except the working-tree side, which is the real file — so an edit saved
/// there lands in the working tree, as `git difftool` does it.
///
/// Returns the program that was spawned, for the toast. Both names are
/// repository-relative: an absolute one would discard the working directory it
/// is joined onto, so [`repo_relative`] refuses it.
pub fn open_diff_tool(
    repo: &Repository,
    target: &DiffTarget,
    path: &str,
    old_path: Option<&str>,
    tool: &Tool,
) -> Result<String, GitError> {
    // A rename's left side is the file under its old name.
    let old_name = old_path.unwrap_or(path);
    repo_relative(path)?;
    repo_relative(old_name)?;
    let workdir = || {
        repo.workdir()
            .map(|w| w.join(path))
            .ok_or_else(|| GitError::Refused("bare repository".into()))
    };
    let (old, new): (Option<Oid>, RightSide) = match target {
        DiffTarget::Commit { oid } => {
            let commit = repo
                .find_commit(Oid::from_str(oid).map_err(map_git2)?)
                .map_err(map_git2)?;
            let parent = commit.parent(0).ok().and_then(|p| p.tree().ok());
            let tree = commit.tree().map_err(map_git2)?;
            (
                blob_in(parent.as_ref(), old_name),
                RightSide::Blob(blob_in(Some(&tree), path)),
            )
        }
        DiffTarget::CommitRange { from, to } => {
            let from = tree_of(repo, from)?;
            let to = tree_of(repo, to)?;
            (
                blob_in(Some(&from), old_name),
                RightSide::Blob(blob_in(Some(&to), path)),
            )
        }
        DiffTarget::Staged => (
            blob_in(head_tree(repo).as_ref(), old_name),
            RightSide::Blob(blob_in_index(repo, path)?),
        ),
        DiffTarget::Unstaged => (
            blob_in_index(repo, old_name)?,
            RightSide::Workdir(workdir()?),
        ),
        DiffTarget::Workdir => (
            blob_in(head_tree(repo).as_ref(), old_name),
            RightSide::Workdir(workdir()?),
        ),
    };

    // One directory per diff so a second file's sides cannot overwrite the first's.
    let right = match &new {
        RightSide::Blob(id) => *id,
        RightSide::Workdir(_) => None,
    };
    let dir = temp_subdir(diff_temp_dir(), &format!("{:x}", dir_key(old, right, path)))?;
    let local = conflict::stage_file(repo, &dir, old_name, "LOCAL", old)?;
    let remote = match new {
        RightSide::Blob(id) => conflict::stage_file(repo, &dir, path, "REMOTE", id)?,
        RightSide::Workdir(file) if file.is_file() => file,
        // Deleted in the working tree: an empty side, as for a blob that is not there.
        RightSide::Workdir(_) => conflict::stage_file(repo, &dir, path, "REMOTE", None)?,
    };
    spawn_tool(&tool.cmd, &[("LOCAL", &local), ("REMOTE", &remote)])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizer_groups_quotes_and_keeps_escaped_ones() {
        assert_eq!(
            tokenize(r#""C:/Program Files/BC/BComp.exe" -e "$LOCAL" $REMOTE"#),
            vec!["C:/Program Files/BC/BComp.exe", "-e", "$LOCAL", "$REMOTE"]
        );
        // `\"` is a literal quote, not a group boundary; runs of spaces collapse.
        assert_eq!(tokenize(r#"a  \"b\"   c"#), vec!["a", "\"b\"", "c"]);
        // An empty quoted argument survives as one.
        assert_eq!(tokenize(r#"prog "" x"#), vec!["prog", "", "x"]);
        assert!(tokenize("   ").is_empty());
    }

    #[test]
    fn substitution_fills_known_names_and_leaves_the_rest() {
        let local = Path::new("/tmp/a.LOCAL.txt");
        let merged = Path::new("/tmp/a.txt");
        let vars: &[(&str, &Path)] = &[("LOCAL", local), ("MERGED", merged)];
        assert_eq!(substitute("$LOCAL", vars), "/tmp/a.LOCAL.txt");
        // Quotes are gone by now: the token is the whole path.
        assert_eq!(substitute("--diff=$LOCAL", vars), "--diff=/tmp/a.LOCAL.txt");
        assert_eq!(substitute("${MERGED}!", vars), "/tmp/a.txt!");
        assert_eq!(substitute("$REMOTE", vars), "$REMOTE");
        assert_eq!(substitute("${NOPE}", vars), "${NOPE}");
        assert_eq!(substitute("100$", vars), "100$");
    }

    #[test]
    fn a_temp_base_that_is_not_a_directory_is_refused() {
        let tmp = tempfile::tempdir().expect("tempdir");

        // Someone got to the predictable name first with a plain file.
        let file = tmp.path().join("planted-file");
        std::fs::write(&file, "").expect("write");
        assert!(matches!(temp_subdir(file, "ab"), Err(GitError::Refused(_))));

        // The dangerous one: a symlink `create_dir_all` would have followed.
        #[cfg(unix)]
        {
            let link = tmp.path().join("planted-link");
            std::os::unix::fs::symlink(tmp.path(), &link).expect("symlink");
            assert!(matches!(temp_subdir(link, "ab"), Err(GitError::Refused(_))));
        }

        // The leaf is just as plantable as the base.
        let occupied = tmp.path().join("occupied");
        std::fs::create_dir(&occupied).expect("mkdir");
        std::fs::write(occupied.join("ab"), "").expect("write");
        assert!(matches!(
            temp_subdir(occupied, "ab"),
            Err(GitError::Refused(_))
        ));
        #[cfg(unix)]
        {
            let base = tmp.path().join("leaf-link");
            std::fs::create_dir(&base).expect("mkdir");
            std::os::unix::fs::symlink(tmp.path(), base.join("ab")).expect("symlink");
            assert!(matches!(temp_subdir(base, "ab"), Err(GitError::Refused(_))));
        }

        // A base of ours is this user's alone.
        let base = tmp.path().join("base");
        let dir = temp_subdir(base.clone(), "ab").expect("created");
        assert!(dir.is_dir());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&base).expect("base").permissions().mode();
            assert_eq!(mode & 0o777, 0o700, "{mode:o}");
        }
        // Opening the same diff again reuses the directory.
        assert_eq!(temp_subdir(base, "ab").expect("again"), dir);
    }

    #[test]
    fn an_empty_command_is_a_config_error() {
        assert!(matches!(
            spawn_tool("   ", &[]),
            Err(GitError::Config(m)) if m == "tool command is empty"
        ));
    }
}
