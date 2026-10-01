// The perf-synth repo: node perf-repo.mjs <dir> [--commits 100000] [--branches 330] [--files 100000]
// A linear `main` fed through git fast-import: commit 1 adds every file (N in all, 2000 of them as sibling folders
// under wide/), each later commit appends a line to one file, +60 s apart, the last a day before now. Locals main,
// at-main-1, maint (commit 10) and b<k> at spread-out depths, each mirrored under refs/remotes/origin/ as its upstream.
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    commits: { type: "string", default: "100000" },
    branches: { type: "string", default: "330" },
    files: { type: "string", default: "100000" },
  },
});
const dir = positionals[0];
const C = Number(values.commits);
const B = Number(values.branches);
const N = Number(values.files);
if (!dir || !(C >= 10) || !(B >= 1) || !(N >= 1)) {
  console.error("usage: node perf-repo.mjs <dir> [--commits >=10] [--branches >=1] [--files >=1]");
  process.exit(1);
}
if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
  console.error(`${dir} exists and is not empty`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
git("init", "-q");

const wide = Math.min(2000, N);
const paths = [];
for (let n = 0; n < N - wide; n++) paths.push(`src/d${Math.floor(n / 100)}/f${n % 100}.txt`);
for (let k = 0; k < wide; k++) paths.push(`wide/s${k}/f.txt`);

const fi = spawn("git", ["-C", dir, "fast-import", "--quiet"], { stdio: ["pipe", "inherit", "inherit"] });
const exited = once(fi, "exit");
let buf = "";
const put = async (s) => {
  buf += s;
  if (buf.length < 1 << 20) return;
  const full = !fi.stdin.write(buf);
  buf = "";
  if (full) await once(fi.stdin, "drain");
};
const blob = (p, s) => `M 100644 inline ${p}\ndata ${s.length}\n${s}\n`;

const start = Math.floor(Date.now() / 1000) - C * 60 - 86400;
const content = new Map();
for (let k = 1; k <= C; k++) {
  const who = `Perf Fixture <perf@example.invalid> ${start + k * 60} +0000`;
  const msg = `commit ${k}\n`;
  await put(`commit refs/heads/main\nmark :${k}\nauthor ${who}\ncommitter ${who}\ndata ${msg.length}\n${msg}`);
  if (k === 1) {
    for (const p of paths) await put(blob(p, `${p}\n`));
  } else {
    const p = paths[(k - 2) % N];
    const s = (content.get(p) ?? `${p}\n`) + `commit ${k}\n`;
    content.set(p, s);
    await put(blob(p, s));
  }
  await put("\n");
}

const locals = [["main", C], ["at-main-1", C - 1]];
for (let k = 0; k < B; k++) locals.push(k ? [`b${k}`, Math.max(1, Math.floor((C * (k + 1)) / (B + 1)))] : ["maint", 10]);
for (const [name, mark] of locals) {
  await put(`reset refs/heads/${name}\nfrom :${mark}\n\nreset refs/remotes/origin/${name}\nfrom :${mark}\n\n`);
}
fi.stdin.end(buf);
const [code] = await exited;
if (code !== 0) process.exit(code ?? 1);

let config = `[commit]\n\tgpgsign = false\n[remote "origin"]\n\turl = c:/nonexistent\n`;
config += `\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
for (const [name] of locals) config += `[branch "${name}"]\n\tremote = origin\n\tmerge = refs/heads/${name}\n`;
fs.appendFileSync(path.join(dir, ".git", "config"), config);
git("symbolic-ref", "HEAD", "refs/heads/main");
git("reset", "-q", "--hard");

const lines = (s) => s.split("\n").filter(Boolean).length;
console.log("commits:", git("rev-list", "--count", "main").trim());
console.log("refs:   ", lines(git("for-each-ref")));
console.log("files:  ", lines(git("ls-files")));
console.log("last:   ", git("log", "-1", "--format=%ci").trim());
