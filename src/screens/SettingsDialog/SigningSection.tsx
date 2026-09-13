// Settings ▸ Signing: the git config keys that decide whether commits and tags are signed. Writes
// go to the global config (`~/.gitconfig`) like the tool sections, so a key the open repository sets
// itself would win over what is saved here — those say so. The select and the checkboxes save as
// they change; the two text fields on Enter or once left.
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as ipc from "../../api/ipc";
import { toAppError } from "../../api/ipc";
import type { SigningConfig, SigningKey } from "../../api/types";
import { Button } from "../../components/ui/Button/Button";
import { Checkbox } from "../../components/ui/Checkbox/Checkbox";
import { Field, Options } from "../../components/ui/Dialog/Dialog";
import { Input, Select } from "../../components/ui/Input/Input";
import { useRepoStore } from "../../store/repoStore";
import { toastError } from "../../store/toastStore";
import s from "./SettingsDialog.module.css";

const FORMATS = [
  ["openpgp", "OpenPGP (gpg)"],
  ["ssh", "SSH"],
  ["x509", "X.509 (gpgsm)"],
] as const;

/** The program key a format signs with; x509 has none among the keys this section owns. */
const PROGRAM: Record<string, SigningKey | null> = { openpgp: "gpg.program", ssh: "gpg.ssh.program", x509: null };

export function SigningSection() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const [cfg, setCfg] = useState<SigningConfig | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await ipc.getSigning(repoId).catch(() => null);
    if (next) setCfg(next);
  }, [repoId]);
  useEffect(() => void load(), [load]);

  const value = (key: SigningKey) => cfg?.[key].value ?? "";
  const on = (key: SigningKey) => /^(true|yes|on|1)$/i.test(value(key));
  // Only worth saying with a repository open — without one nothing is `local`.
  const localHint = (key: SigningKey) => (cfg?.[key].local ? "Also set in this repository, which wins over this." : undefined);

  // Git's default when `gpg.format` is unset, so the select shows what is actually in force.
  const format = value("gpg.format") || "openpgp";
  const programKey = PROGRAM[format] ?? null;

  // The text fields are typed freely; the store is only re-read after a save.
  const [signingKey, setSigningKey] = useState("");
  const [program, setProgram] = useState("");
  useEffect(() => setSigningKey(cfg?.["user.signingkey"].value ?? ""), [cfg]);
  useEffect(() => setProgram((programKey && cfg?.[programKey].value) || ""), [cfg, programKey]);

  async function save(key: SigningKey, next: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await ipc.setSigning(key, next);
      await load();
    } catch (e) {
      toastError(toAppError(e), `Couldn't save ${key}`);
    }
    setBusy(false);
  }

  /** An emptied field clears the key rather than writing an empty value; an unchanged one writes nothing. */
  function saveText(key: SigningKey, text: string) {
    const next = text.trim();
    if (next !== value(key)) void save(key, next || null);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>, key: SigningKey, text: string) {
    if (e.key !== "Enter") return;
    // The dialog has no submit action of its own: Enter saves this field and nothing else.
    e.preventDefault();
    saveText(key, text);
  }

  async function locate() {
    if (!programKey) return;
    const file = await openFile({ multiple: false, directory: false, title: "Locate the signing program" }).catch(() => null);
    if (!file) return;
    setProgram(file);
    await save(programKey, file);
  }

  return (
    <section className={s.section}>
      <h3 className={s.head}>Signing</h3>
      <Field label="Format" help={localHint("gpg.format") ?? "What signs a commit or tag. Saved in the global git config."}>
        <Select aria-label="Signing format" value={format} onChange={(e) => void save("gpg.format", e.target.value)} disabled={busy}>
          {FORMATS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Signing key" help={localHint("user.signingkey") ?? "user.signingkey — a gpg key id, or the path to an SSH public key. Empty to clear."}>
        <Input
          aria-label="Signing key"
          value={signingKey}
          onChange={(e) => setSigningKey(e.target.value)}
          onBlur={() => saveText("user.signingkey", signingKey)}
          onKeyDown={(e) => onKeyDown(e, "user.signingkey", signingKey)}
          placeholder="Not set"
          disabled={busy}
          spellCheck={false}
        />
      </Field>
      {programKey && (
        <Field label="Program" help={localHint(programKey) ?? `${programKey} — leave empty to use the one on PATH.`}>
          <div className={s.row}>
            <Input
              aria-label="Signing program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              onBlur={() => saveText(programKey, program)}
              onKeyDown={(e) => onKeyDown(e, programKey, program)}
              placeholder="Not set"
              disabled={busy}
              spellCheck={false}
            />
            <Button aria-label="Locate the signing program" icon={<FolderSearch size={14} aria-hidden />} disabled={busy} onClick={() => void locate()}>
              Locate…
            </Button>
          </div>
        </Field>
      )}
      <Options>
        <Checkbox checked={on("commit.gpgsign")} disabled={busy} onChange={(v) => void save("commit.gpgsign", String(v))} title={localHint("commit.gpgsign")}>
          Sign commits
        </Checkbox>
        <Checkbox checked={on("tag.gpgsign")} disabled={busy} onChange={(v) => void save("tag.gpgsign", String(v))} title={localHint("tag.gpgsign")}>
          Sign annotated tags
        </Checkbox>
      </Options>
    </section>
  );
}
