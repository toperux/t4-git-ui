// One Settings section per external tool kind (Diff tool / Merge tool), GitExtensions' Git Config
// page: a template picker, the executable's path with Locate… / Suggest, and the command line the
// template derives — editable. Nothing is saved until Apply (or Enter in Path / Command).
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as ipc from "../../api/ipc";
import { toAppError } from "../../api/ipc";
import type { Tool, ToolKind } from "../../api/types";
import { Button } from "../../components/ui/Button/Button";
import { Field } from "../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../components/ui/Input/Input";
import { validateRefName } from "../../lib/branchName";
import { command, CUSTOM, IS_MAC, IS_WINDOWS, TEMPLATES, templateArgs, TOOLS } from "../../lib/externalTools";
import { useSettingsStore } from "../../store/settingsStore";
import { toastError, useToastStore } from "../../store/toastStore";
import s from "./SettingsDialog.module.css";

/** Select value → the fields, as the stored tool leaves them: a known name is its template, any other name is Custom. */
function seed(tool: Tool | null) {
  if (!tool) return { pick: "", name: "", path: "", cmd: "" };
  const template = TOOLS.find((t) => t.id === tool.name);
  return { pick: template ? template.id : CUSTOM, name: tool.name, path: tool.path, cmd: tool.cmd };
}

export function ToolSection({ kind }: { kind: ToolKind }) {
  const title = kind === "diff" ? "Diff tool" : "Merge tool";
  const stored = useSettingsStore((st) => st.tools[kind]);
  const setTool = useSettingsStore((st) => st.setTool);

  const [pick, setPick] = useState(() => seed(stored).pick);
  const [name, setName] = useState(() => seed(stored).name);
  const [path, setPath] = useState(() => seed(stored).path);
  const [cmd, setCmd] = useState(() => seed(stored).cmd);
  // The command follows the path until the user writes one of their own.
  const [dirty, setDirty] = useState(false);
  // Result of the last lookup: `null` = none run for this pick.
  const [found, setFound] = useState<boolean | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Two quick template switches: the slower lookup must not fill the newer one's fields.
  const lookup = useRef(0);

  // A save (here or in another dialog) is the only thing that moves the store.
  useEffect(() => {
    const next = seed(stored);
    setPick(next.pick);
    setName(next.name);
    setPath(next.path);
    setCmd(next.cmd);
    setDirty(false);
    setFound(null);
    setNameError(null);
  }, [stored]);

  const template = TOOLS.find((t) => t.id === pick);

  /** Command for `next` under the current template, unless the user has written one. */
  function derive(next: string) {
    if (template && !dirty) setCmd(next ? command(next, templateArgs(template, kind)) : "");
  }

  // `keep` is the dirty flag as the caller sees it: `choose` has just reset it, and this closure
  // would still read the old one after the await.
  async function suggest(t: NonNullable<typeof template>, keep: boolean) {
    const mine = ++lookup.current;
    const file = await ipc.findTool(t.exe, t.dirs).catch(() => null);
    if (lookup.current !== mine) return;
    setFound(!!file);
    if (!file) return;
    setPath(file);
    if (!keep) setCmd(command(file, templateArgs(t, kind)));
  }

  function choose(value: string) {
    setPick(value);
    setDirty(false);
    setFound(null);
    setCmdError(null);
    setNameError(null);
    lookup.current++;
    const t = TOOLS.find((x) => x.id === value);
    setName(t ? t.id : "");
    setPath("");
    setCmd("");
    if (t) void suggest(t, false);
  }

  async function locate() {
    const file = await openFile({ multiple: false, directory: false, title: `Locate the ${title.toLowerCase()}` }).catch(() => null);
    if (!file) return;
    setFound(null);
    setPath(file);
    derive(file);
  }

  async function apply() {
    if (busy) return;
    const trimmed = name.trim();
    if (pick !== "") {
      const bad = validateRefName(trimmed);
      if (bad) {
        setNameError(bad);
        return;
      }
      // An empty command would only fail later, at the launch.
      if (!cmd.trim()) {
        setCmdError("Enter a command");
        return;
      }
    }
    setBusy(true);
    try {
      if (pick === "") {
        await setTool(kind, null);
        useToastStore.getState().push({ kind: "info", title: `${title} cleared` });
      } else {
        const tool = { name: trimmed, path: path.trim(), cmd: cmd.trim() };
        await setTool(kind, tool);
        useToastStore.getState().push({ kind: "info", title: `${title}: ${template?.label ?? trimmed}` });
      }
    } catch (e) {
      toastError(toAppError(e), `Couldn't save the ${title.toLowerCase()}`);
    }
    setBusy(false);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // The dialog has no submit action of its own: Enter applies this section and nothing else.
    e.preventDefault();
    void apply();
  }

  const section = kind === "diff" ? "difftool" : "mergetool";
  const vars = kind === "diff" ? "$LOCAL and $REMOTE are" : "$LOCAL, $REMOTE, $BASE and $MERGED are";
  const example = IS_WINDOWS ? "C:\\Program Files\\…" : IS_MAC ? "/Applications/…" : "/usr/bin/…";
  // Windows splits the line itself; unix hands it to sh, the way git difftool runs it.
  const cmdHelp = IS_WINDOWS
    ? `${vars} filled in when it runs. Split on whitespace and double quotes — no shell.`
    : `${vars} in the environment when it runs through sh, as git difftool runs it.`;

  return (
    <section className={s.section}>
      <h3 className={s.head}>{title}</h3>
      <Field label="Tool" help={`Opens ${kind === "diff" ? "a file's two sides" : "a conflict's three sides"} in the tool you pick here.`}>
        <Select aria-label={title} value={pick} onChange={(e) => choose(e.target.value)} disabled={busy}>
          <option value="">None</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom</option>
        </Select>
      </Field>

      {pick !== "" && (
        <>
          {!template && (
            <Field label="Name" invalid={!!nameError} help={nameError ?? `git's name for the tool, as in ${section}.<name>.cmd.`}>
              <Input
                aria-label={`${title} name`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder="my-tool"
                disabled={busy}
                spellCheck={false}
              />
            </Field>
          )}
          <Field
            label="Path"
            invalid={found === false}
            help={found === false ? "Not found — Locate it" : found ? "Found on this machine." : "The tool's executable."}
          >
            <div className={s.row}>
              <Input
                aria-label={`${title} path`}
                value={path}
                onChange={(e) => {
                  setFound(null);
                  setPath(e.target.value);
                  derive(e.target.value);
                }}
                onKeyDown={onKeyDown}
                placeholder={example}
                disabled={busy}
                spellCheck={false}
              />
              <Button
                aria-label={`Locate the ${title.toLowerCase()}`}
                icon={<FolderSearch size={14} aria-hidden />}
                disabled={busy}
                onClick={() => void locate()}
              >
                Locate…
              </Button>
              {template && (
                <Button disabled={busy} onClick={() => void suggest(template, dirty)}>
                  Suggest
                </Button>
              )}
            </div>
          </Field>
          <Field label="Command" invalid={!!cmdError} help={cmdError ?? cmdHelp}>
            <Input
              className={s.mono}
              aria-label={`${title} command`}
              value={cmd}
              onChange={(e) => {
                setDirty(true);
                setCmd(e.target.value);
                if (cmdError) setCmdError(null);
              }}
              onKeyDown={onKeyDown}
              disabled={busy}
              spellCheck={false}
            />
          </Field>
        </>
      )}

      <Field
        label="Save"
        help={
          pick === ""
            ? `Clears ${kind}.tool and ${kind}.guitool in ~/.gitconfig.`
            : `Saved to ~/.gitconfig as ${kind}.guitool / ${section}.${name.trim() || "<name>"}.*`
        }
      >
        <div className={s.row}>
          {/* `.row > :first-child` takes the free space, so the button sits right. */}
          <span />
          <Button aria-label={`Apply ${title.toLowerCase()}`} disabled={busy} onClick={() => void apply()}>
            Apply
          </Button>
        </div>
      </Field>
    </section>
  );
}
