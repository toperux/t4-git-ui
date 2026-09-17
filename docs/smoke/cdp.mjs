// Minimal CDP driver for the smoke walks — see docs/smoke/smoke-cdp.md.
//   node cdp.mjs --inner 1280x800 --wait 400 --eval "expr" --eval @file.js
//                --drag "Resize sidebar" 60 0 --key Alt+2 --type "status" --reload
// Steps run in argv order. --inner resizes the real window (Browser.setWindowBounds) and
// converges on an exact CSS viewport, because setWindowBounds counts the frame and we don't.
// Deliberately NOT Playwright: page.setViewportSize installs a device-metrics override that
// pins the viewport and leaves the window unable to reflow.
import { readFileSync } from "node:fs";

const HOST = "127.0.0.1:9222";
let nextId = 1;
const pending = new Map();
let ws, sessionId, targetId;

const send = (method, params = {}, useSession = true) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const msg = { id, method, params };
    if (useSession && sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function setInner(w, h) {
  const { windowId } = await send("Browser.getWindowForTarget", { targetId }, false);
  // Two passes: the first learns the frame's contribution, the second lands on it.
  for (let pass = 0; pass < 3; pass++) {
    const got = await evaluate("[innerWidth, innerHeight]");
    if (got[0] === w && got[1] === h) return got;
    const { bounds } = await send("Browser.getWindowBounds", { windowId }, false);
    await send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + (w - got[0]), height: bounds.height + (h - got[1]) } }, false);
    await sleep(250);
  }
  return await evaluate("[innerWidth, innerHeight]");
}

/** A real mouse drag on a separator: the library listens to pointer events, not to its own API. */
async function drag(label, dx, dy) {
  const rect = await evaluate(
    `(()=>{const e=document.querySelector('[role=separator][aria-label="${label}"]');if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];})()`,
  );
  if (!rect) throw new Error(`no separator "${label}"`);
  const [x, y] = rect;
  const at = (type, px, py, buttons) => send("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", buttons, clickCount: 1 });
  await at("mouseMoved", x, y, 0);
  await at("mousePressed", x, y, 1);
  // Several moves: one jump can be read as a stray event rather than a drag.
  for (let i = 1; i <= 4; i++) {
    await at("mouseMoved", x + (dx * i) / 4, y + (dy * i) / 4, 1);
    await sleep(40);
  }
  await at("mouseReleased", x + dx, y + dy, 0);
  await sleep(250);
  return { dragged: label, to: [x + dx, y + dy] };
}

const KEYS = {
  Backquote: { code: "Backquote", key: "`", keyCode: 192 },
  Enter: { code: "Enter", key: "Enter", keyCode: 13 },
  Escape: { code: "Escape", key: "Escape", keyCode: 27 },
  Tab: { code: "Tab", key: "Tab", keyCode: 9 },
  1: { code: "Digit1", key: "1", keyCode: 49 },
  2: { code: "Digit2", key: "2", keyCode: 50 },
  R: { code: "KeyR", key: "R", keyCode: 82 },
  F5: { code: "F5", key: "F5", keyCode: 116 },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp", keyCode: 38 },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", keyCode: 39 },
  Comma: { code: "Comma", key: ",", keyCode: 188 },
};

/** Key chords by name: "Alt+2", "Ctrl+Shift+Backquote", "Enter". */
async function key(chord) {
  const parts = chord.split("+");
  const name = parts.pop();
  const mod = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Ctrl") ? 2 : 0) | (parts.includes("Shift") ? 8 : 0);
  const k = KEYS[name] ?? { code: `Key${name.toUpperCase()}`, key: name.toLowerCase(), keyCode: name.toUpperCase().charCodeAt(0) };
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", { type, modifiers: mod, code: k.code, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode });
  }
  await sleep(400);
  return { key: chord };
}


/** Element centre plus its box, by CSS selector. */
async function boxOf(sel) {
  const r = await evaluate(
    "(()=>{const e=document.querySelector(" + JSON.stringify(sel) + ");if(!e)return null;const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2,b.x,b.y,b.width,b.height];})()",
  );
  if (!r) throw new Error("no element " + sel);
  return r;
}

/** A real click. `button` "right" raises the webview's contextmenu, which is how row menus open. */
async function click(sel, button = "left") {
  const [x, y] = await boxOf(sel);
  const mask = button === "right" ? 2 : 1;
  const at = (type, buttons) => send("Input.dispatchMouseEvent", { type, x, y, button, buttons, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  await at("mousePressed", mask);
  await at("mouseReleased", 0);
  await sleep(350);
  return { click: sel, button, at: [x, y] };
}

/** Drags across an element's text left-to-right, leaving a real selection behind. */
async function seltext(sel) {
  const [, , x, y, w, h] = await boxOf(sel);
  const my = y + h / 2;
  const at = (type, px, buttons) => send("Input.dispatchMouseEvent", { type, x: px, y: my, button: "left", buttons, clickCount: 1 });
  await at("mouseMoved", x + 2, 0);
  await at("mousePressed", x + 2, 1);
  for (let i = 1; i <= 4; i++) {
    await at("mouseMoved", x + 2 + ((w - 4) * i) / 4, 1);
    await sleep(30);
  }
  await at("mouseReleased", x + w - 2, 0);
  await sleep(200);
  return { selected: await evaluate("String(window.getSelection())") };
}


/** Press at the left edge of `from`'s text, move in steps to `to`'s centre, release there. */
async function dragto(from, to) {
  const [, , fx, fy, fw, fh] = await boxOf(from);
  const [tx, ty] = await boxOf(to);
  const sx = fx + fw * 0.9, sy = fy + fh / 2;
  const at = (type, px, py, buttons) => send("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", buttons, clickCount: 1 });
  await at("mouseMoved", sx, sy, 0);
  await at("mousePressed", sx, sy, 1);
  for (let i = 1; i <= 6; i++) {
    await at("mouseMoved", sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6, 1);
    await sleep(30);
  }
  await at("mouseReleased", tx, ty, 0);
  await sleep(300);
  return { dragto: [from, to], selection: await evaluate("String(window.getSelection())") };
}

/** One press on a separator, several vertical legs (absolute dy from the press), one release. */
async function dragpath(label, legs) {
  const rect = await evaluate(
    `(()=>{const e=document.querySelector('[role=separator][aria-label="${label}"]');if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];})()`,
  );
  if (!rect) throw new Error(`no separator "${label}"`);
  const [x, y] = rect;
  const at = (type, py, buttons) => send("Input.dispatchMouseEvent", { type, x, y: py, button: "left", buttons, clickCount: 1 });
  await at("mouseMoved", y, 0);
  await at("mousePressed", y, 1);
  let cur = 0;
  for (const dy of legs) {
    for (let i = 1; i <= 4; i++) {
      await at("mouseMoved", y + cur + ((dy - cur) * i) / 4, 1);
      await sleep(40);
    }
    cur = dy;
  }
  await at("mouseReleased", y + cur, 0);
  await sleep(300);
  return { dragpath: label, legs };
}

/** A real double-click: the browser's own pair, clickCount 1 then 2. */
async function dblclick(sel) {
  const [x, y] = await boxOf(sel);
  const at = (type, clickCount, buttons) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  await at("mousePressed", 1, 1);
  await at("mouseReleased", 1, 0);
  await at("mousePressed", 2, 1);
  await at("mouseReleased", 2, 0);
  await sleep(350);
  return { dblclick: sel, selection: await evaluate("String(window.getSelection())") };
}

const version = await (await fetch(`http://${HOST}/json/version`)).json();
const [page] = (await (await fetch(`http://${HOST}/json/list`)).json()).filter((t) => t.type === "page");
targetId = page.id;

ws = new WebSocket(version.webSocketDebuggerUrl);
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));
await send("Runtime.enable");

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--inner") {
    const [w, h] = args[++i].split("x").map(Number);
    console.log(JSON.stringify({ inner: await setInner(w, h) }));
  } else if (a === "--wait") {
    await sleep(Number(args[++i]));
  } else if (a === "--drag") {
    console.log(JSON.stringify(await drag(args[++i], Number(args[++i]), Number(args[++i]))));
  } else if (a === "--click") {
    console.log(JSON.stringify(await click(args[++i])));
  } else if (a === "--clickat") {
    // A real click at an element's box offset: `sel dx dy` from its top-left corner.
    const sel = args[++i], dx = Number(args[++i]), dy = Number(args[++i]);
    const [, , bx, by] = await boxOf(sel);
    const x = bx + dx, y = by + dy;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(350);
    console.log(JSON.stringify({ clickat: sel, at: [x, y], hit: await evaluate(`document.elementFromPoint(${x},${y})?.tagName`) }));
  } else if (a === "--dragto") {
    console.log(JSON.stringify(await dragto(args[++i], args[++i])));
  } else if (a === "--dragpath") {
    console.log(JSON.stringify(await dragpath(args[++i], args[++i].split(",").map(Number))));
  } else if (a === "--dblclick") {
    console.log(JSON.stringify(await dblclick(args[++i])));
  } else if (a === "--rclick") {
    console.log(JSON.stringify(await click(args[++i], "right")));
  } else if (a === "--seltext") {
    console.log(JSON.stringify(await seltext(args[++i])));
  } else if (a === "--key") {
    console.log(JSON.stringify(await key(args[++i])));
  } else if (a === "--type") {
    // insertText, not per-key events: React reads the input's value, and this is what a paste does.
    await send("Input.insertText", { text: args[++i] });
    await sleep(300);
  } else if (a === "--reload") {
    // No persistence yet, so a reload is the clean reset back to authored defaults.
    await send("Page.enable");
    await send("Page.reload");
    await sleep(2500);
    console.log(JSON.stringify({ reloaded: true }));
  } else if (a === "--eval") {
    let expr = args[++i];
    if (expr.startsWith("@")) expr = readFileSync(expr.slice(1), "utf8");
    console.log(JSON.stringify(await evaluate(expr), null, 1));
  } else {
    throw new Error(`unknown arg ${a}`);
  }
}
ws.close();
