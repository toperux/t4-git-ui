// The one file that runs Node APIs. TypeScript 7 no longer includes `@types/*` on its own, and app
// code has no business seeing `process`, so the types come in here rather than tsconfig's `types`.
/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every `@tauri-apps/plugin-dialog` call needs its ACL permission, and a missing one fails at runtime
 * only: the command rejects with "not allowed by ACL", and each call site reads that rejection as a
 * decline (`.catch(() => false)`), so the feature goes quiet — no error, no dialog, nothing done. The
 * unit tests all mock the plugin, so nothing else would notice.
 *
 * The trap this guards is that the permission is named after the *command*, not the export: `ask()` and
 * `confirm()` are wrappers that both invoke `plugin:dialog|message`, so all three want
 * `dialog:allow-message` and none of them wants `dialog:allow-ask`. Granting the name that matches the
 * export is the plausible wrong move, and it would silence every confirmation in the app.
 */
describe("the dialog capability covers every plugin-dialog call the app makes", () => {
  // Vitest runs from the repo root; `import.meta.url` here is a Vite `/@fs/` URL, not a path.
  const ROOT = process.cwd();
  /** Export → the command it invokes (`dist-js/index.js`: `ask` and `confirm` delegate to `messageCommand`). */
  const COMMAND: Record<string, string> = { ask: "message", confirm: "message", message: "message", open: "open", save: "save" };

  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return sources(p);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });

  it("grants exactly the commands the imported calls invoke", () => {
    const needed = new Set<string>();
    for (const file of sources(`${ROOT}/src`)) {
      const m = readFileSync(file, "utf8").match(/import\s*\{([^}]*)\}\s*from\s*"@tauri-apps\/plugin-dialog"/);
      if (!m) continue;
      for (const spec of m[1].split(",")) {
        // `open as openFile` is still the `open` export: the ACL knows the export, not the local name.
        const name = spec.trim().split(/\s+as\s+/)[0].trim();
        const command = COMMAND[name];
        expect(command, `unknown plugin-dialog export "${name}" in ${file} — add it to COMMAND`).toBeDefined();
        needed.add(command);
      }
    }
    expect(needed.size).toBeGreaterThan(0);

    const granted = (JSON.parse(readFileSync(`${ROOT}/src-tauri/capabilities/default.json`, "utf8")) as { permissions: string[] }).permissions
      .filter((p) => p.startsWith("dialog:allow-"))
      .map((p) => p.slice("dialog:allow-".length));

    expect([...needed].sort()).toEqual(granted.sort());
  });
});
