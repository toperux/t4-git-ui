// App preferences, reachable from both screens (toolbar gear / start screen gear).
// Theme and the whitespace default apply as they change; the two text fields apply on Enter (the git
// path on Apply / Locate… too, since trying it starts a process); the two tool sections have an
// Apply of their own. The footer only closes.
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Checkbox } from "../../components/ui/Checkbox/Checkbox";
import { Dialog, Field, Options } from "../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../components/ui/Input/Input";
import { getThemePref, setTheme, type ThemePref } from "../../theme/theme";
import { MAX_CONTEXT, useSettingsStore } from "../../store/settingsStore";
import s from "./SettingsDialog.module.css";
import { ToolSection } from "./ToolSection";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const diffContext = useSettingsStore((st) => st.diffContext);
  const ignoreWhitespace = useSettingsStore((st) => st.ignoreWhitespace);
  const gitPath = useSettingsStore((st) => st.gitPath);
  const gitVersion = useSettingsStore((st) => st.gitVersion);
  const gitError = useSettingsStore((st) => st.gitError);
  const { setDiffContext, setIgnoreWhitespace, setGitPath, clearGitError } = useSettingsStore.getState();

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

  function pickTheme(v: string) {
    const next = v as ThemePref;
    setPref(next);
    setTheme(next);
  }

  return (
    <Dialog
      title="Settings"
      wide
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
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
    </Dialog>
  );
}
