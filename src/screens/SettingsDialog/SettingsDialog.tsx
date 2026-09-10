// App preferences, reachable from both screens (toolbar gear / start screen gear).
// Theme and the whitespace default apply as they change; the two text fields apply on Enter (the git
// path on Apply / Locate… too, since trying it starts a process); the two tool sections have an
// Apply of their own. The footer only closes.
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderSearch } from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toAppError } from "../../api/ipc";
import { Button } from "../../components/ui/Button/Button";
import { Checkbox } from "../../components/ui/Checkbox/Checkbox";
import { Dialog, Field, Options } from "../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../components/ui/Input/Input";
import { Progress } from "../../components/ui/Progress/Progress";
import { APP_NAME } from "../../lib/app";
import { getThemePref, setTheme, type ThemePref } from "../../theme/theme";
import { MAX_CONTEXT, useSettingsStore } from "../../store/settingsStore";
import { toastError } from "../../store/toastStore";
import { useUpdateStore } from "../../store/updateStore";
import pkg from "../../../package.json";
import s from "./SettingsDialog.module.css";
import { ToolSection } from "./ToolSection";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const diffContext = useSettingsStore((st) => st.diffContext);
  const ignoreWhitespace = useSettingsStore((st) => st.ignoreWhitespace);
  const gitPath = useSettingsStore((st) => st.gitPath);
  const gitVersion = useSettingsStore((st) => st.gitVersion);
  const gitError = useSettingsStore((st) => st.gitError);
  const autoUpdateCheck = useSettingsStore((st) => st.autoUpdateCheck);
  const { setDiffContext, setIgnoreWhitespace, setAutoUpdateCheck, setGitPath, clearGitError } = useSettingsStore.getState();
  // Field by field, not `useUpdateStore()`: the whole-store subscription re-rendered the dialog on
  // every `set` the store makes, and a download makes one per chunk.
  const info = useUpdateStore((st) => st.info);
  const checked = useUpdateStore((st) => st.checked);
  const checking = useUpdateStore((st) => st.checking);
  const installing = useUpdateStore((st) => st.installing);
  const progress = useUpdateStore((st) => st.progress);
  const updateError = useUpdateStore((st) => st.error);
  const { check, install } = useUpdateStore.getState();

  // The path is edited freely and only tried on Apply / Enter — trying it runs `git --version`.
  const [path, setPath] = useState(gitPath);
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  // The number is a string while it is typed: an emptied field is not "0", and applying every keystroke
  // would persist and reload the diff for each one. Re-synced when the store moves (a clamp, another dialog).
  const [context, setContext] = useState(String(diffContext));
  useEffect(() => {
    setContext(String(diffContext));
  }, [diffContext]);

  function applyContext() {
    const n = Number.parseInt(context, 10);
    // Empty or unparsable: nothing to apply, so the field goes back to what is stored.
    if (Number.isFinite(n)) setDiffContext(n);
    else setContext(String(diffContext));
  }

  async function apply() {
    if (busy) return;
    setBusy(true);
    // Explorer's "Copy as path" wraps the path in quotes; git is not what `"C:\…\git.exe"` names.
    await setGitPath(path.trim().replace(/^"(.*)"$/, "$1"));
    setBusy(false);
  }

  function onPathKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // The dialog has no submit action of its own: Enter applies here and nowhere else.
    e.preventDefault();
    void apply();
  }

  // Same picker as the "Locate git…" button on the git-missing screen; a pick is applied at once.
  async function locate() {
    const file = await openFile({ multiple: false, directory: false, title: "Locate the git executable" }).catch(() => null);
    if (!file || busy) return;
    setPath(file);
    setBusy(true);
    await setGitPath(file);
    setBusy(false);
  }

  function openReleasePage(url: string) {
    void openUrl(url).catch((e: unknown) => toastError(toAppError(e), "Couldn't open the release page"));
  }

  /** Install it, or — on a .deb / .rpm, where the package manager owns the files — hand it to the browser. */
  function getUpdate() {
    if (!info) return;
    if (info.installable) void install();
    else openReleasePage(info.releaseUrl);
  }

  // The one line that answers "am I current?" — so it names this build whenever nothing else is going
  // on. Before any check has come back it says only which build this is: "up to date" is a claim about
  // GitHub, and with the launch check off nothing has asked yet.
  const updateStatus = installing
    ? progress === null
      ? "Downloading…"
      : `Downloading… ${progress}%`
    : checking
      ? "Checking…"
      : (updateError ??
        (info
          ? `Version ${info.version} is available`
          : checked
            ? `${APP_NAME} ${pkg.version} is up to date`
            : `${APP_NAME} ${pkg.version}`));

  function pickTheme(v: string) {
    const next = v as ThemePref;
    setPref(next);
    setTheme(next);
  }

  return (
    <Dialog
      title="Settings"
      wide
      busy={installing}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={installing} onClick={onClose}>
          Close
        </Button>
      }
    >
      <section className={s.section}>
        <h3 className={s.head}>Git executable</h3>
        <Field label="Path" invalid={!!gitError} help={gitError ?? gitVersion ?? "Leave empty to use the git found on PATH."}>
          <div className={s.row}>
            <Input
              aria-label="Git executable"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                // The message describes the path that was probed, not the one being typed.
                if (gitError) clearGitError();
              }}
              onKeyDown={onPathKeyDown}
              placeholder="git (from PATH)"
              disabled={busy}
              spellCheck={false}
            />
            <Button icon={<FolderSearch size={14} aria-hidden />} disabled={busy} onClick={() => void locate()}>
              Locate…
            </Button>
            <Button disabled={busy} onClick={() => void apply()}>
              Apply
            </Button>
          </div>
        </Field>
      </section>

      <section className={s.section}>
        <h3 className={s.head}>Theme</h3>
        <Field label="Appearance">
          <Select aria-label="Theme" value={pref} onChange={(e) => pickTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">Follow system</option>
          </Select>
        </Field>
      </section>

      <section className={s.section}>
        <h3 className={s.head}>Diff</h3>
        <Field label="Context lines" help={`Lines of unchanged context around each hunk (0–${MAX_CONTEXT}).`}>
          <Input
            className={s.number}
            aria-label="Context lines"
            type="number"
            min={0}
            max={MAX_CONTEXT}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onBlur={applyContext}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyContext();
            }}
          />
        </Field>
        <Options>
          <Checkbox checked={ignoreWhitespace} onChange={setIgnoreWhitespace}>
            Ignore whitespace by default
          </Checkbox>
        </Options>
      </section>

      <ToolSection kind="diff" />
      <ToolSection kind="merge" />

      <section className={s.section}>
        <h3 className={s.head}>Updates</h3>
        <Options>
          <Checkbox checked={autoUpdateCheck} onChange={setAutoUpdateCheck} disabled={installing}>
            Check for updates on launch
          </Checkbox>
        </Options>
        {/* Check now works whatever the toggle says: the setting is about launch, not about asking. */}
        <Field label="Version" invalid={!!updateError} help={updateStatus}>
          <div className={s.buttons}>
            <Button disabled={checking || installing} onClick={() => void check()}>
              Check now
            </Button>
            {/* Nobody should have to accept a version sight unseen: on every install kind but .deb /
                .rpm the button below installs it, so this is the only way to the release notes. */}
            {info && (
              <Button variant="ghost" disabled={installing} onClick={() => openReleasePage(info.releaseUrl)}>
                What's new
              </Button>
            )}
            {/* Always rendered, so the section keeps its shape whether or not a check found anything.
                Disabled it still labels itself, and "Up to date" is only true once a check came back —
                after one that failed it would be the wrong answer, stated confidently. */}
            <Button variant="primary" disabled={!info || installing} onClick={getUpdate}>
              {info
                ? info.installable
                  ? `Update to ${info.version}…`
                  : "Download…"
                : checked
                  ? "Up to date"
                  : "Update"}
            </Button>
          </div>
        </Field>
        {installing && <Progress thin label="Downloading update" value={progress ?? undefined} />}
      </section>
    </Dialog>
  );
}
