//! The global config round trip. libgit2's search paths are process-wide, so
//! this test lives in its own test binary: cargo runs each binary as its own
//! process, one after another, and no other test can read the temp global
//! file while it is half written (a parallel `git init` once did, in the lib's
//! test run). The user's own `~/.gitconfig` is never read or written.

use git2::ConfigLevel;
use git_core::config::{set_global, set_local, signing, unset_global, SIGNING_KEYS};
use git_core::test_util::TempRepo;

#[test]
fn global_round_trip_and_signing_entries() {
    let home = tempfile::tempdir().expect("tempdir");
    const LEVELS: [ConfigLevel; 4] = [
        ConfigLevel::ProgramData,
        ConfigLevel::System,
        ConfigLevel::Global,
        ConfigLevel::XDG,
    ];
    // Restores the paths on the way out, a failed assertion included.
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            for level in LEVELS {
                let _ = unsafe { git2::opts::reset_search_path(level) };
            }
        }
    }
    let _reset = Reset;
    for level in LEVELS {
        // Safe here: this binary's only test, so nothing else reads or writes them.
        unsafe { git2::opts::set_search_path(level, home.path()) }.expect("search path");
    }

    set_global("user.signingkey", "ABCD1234").unwrap();
    set_global("commit.gpgsign", "true").unwrap();
    let global = signing(None).expect("signing");
    assert_eq!(global["user.signingkey"].value.as_deref(), Some("ABCD1234"));
    assert!(!global["user.signingkey"].local);
    assert_eq!(global["gpg.format"].value, None);
    assert_eq!(global.len(), SIGNING_KEYS.len());

    // A repository's own entry wins over the global one, and says so.
    let t = TempRepo::new();
    set_local(&t.repo, "commit.gpgsign", "false").unwrap();
    let repo = signing(Some(&t.repo)).expect("signing");
    assert_eq!(repo["commit.gpgsign"].value.as_deref(), Some("false"));
    assert!(repo["commit.gpgsign"].local);
    assert_eq!(repo["user.signingkey"].value.as_deref(), Some("ABCD1234"));
    assert!(!repo["user.signingkey"].local);

    unset_global("user.signingkey").unwrap();
    // Removing a key that was never set is not an error.
    unset_global("gpg.ssh.program").unwrap();
    assert_eq!(
        signing(None).expect("signing")["user.signingkey"].value,
        None
    );
}
