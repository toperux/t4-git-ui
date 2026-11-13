// Minimal CDP driver for the smoke walks — see docs/smoke/smoke-cdp.md.
//   node cdp.mjs --inner 1280x800 --wait 400 --eval "expr" --eval @file.js
//                --drag "Resize sidebar" 60 0 --key Alt+2 --type "status" --reload
//                --tag "[role=menuitem]" "^Blame$" --click "[data-w]" --shot <scratch>/shot.png
// Steps run in argv order. --inner resizes the real window (Browser.setWindowBounds) and
// converges on an exact CSS viewport, because setWindowBounds counts the frame and we don't.
// Deliberately NOT Playwright: page.setViewportSize installs a device-metrics override that
// pins the viewport and leaves the window unable to reflow.
import { readFileSync, writeFileSync } from "node:fs";

// CDP_HOST reaches an app elsewhere, e.g. inside Windows Sandbox behind a port proxy.
const HOST = process.env.CDP_HOST ?? "127.0.0.1:9222";
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
  Enter: { code: "Enter", key: "Enter", keyCode: 13, text: "\r" },
  Escape: { code: "Escape", key: "Escape", keyCode: 27 },
  Tab: { code: "Tab", key: "Tab", keyCode: 9 },
  Space: { code: "Space", key: " ", keyCode: 32, text: " " },
  Backspace: { code: "Backspace", key: "Backspace", keyCode: 8 },
  1: { code: "Digit1", key: "1", keyCode: 49 },
  2: { code: "Digit2", key: "2", keyCode: 50 },
  R: { code: "KeyR", key: "R", keyCode: 82 },
  F5: { code: "F5", key: "F5", keyCode: 116 },
  F10: { code: "F10", key: "F10", keyCode: 121 },
  Home: { code: "Home", key: "Home", keyCode: 36 },
  End: { code: "End", key: "End", keyCode: 35 },
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
  // A key with `text` sends it on keyDown, as a real one does: Chromium activates a focused button on
  // Enter from that char event, not from the bare keyDown.
  for (const type of ["keyDown", "keyUp"]) {
    const text = type === "keyDown" && k.text && !(mod & 3) ? { text: k.text } : {};
    await send("Input.dispatchKeyEvent", { type, modifiers: mod, code: k.code, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, ...text });
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
// CDP_TITLE picks one window of several by a piece of its title (`T4 Git UI - <repo>`).
const [page] = (await (await fetch(`http://${HOST}/json/list`)).json()).filter(
  (t) => t.type === "page" && (!process.env.CDP_TITLE || t.title.includes(process.env.CDP_TITLE)) && (!process.env.CDP_EXACT || t.title === process.env.CDP_EXACT),
);
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
  } else if (a === "--dragtest") {
    // --dragtest "label" "d1,d2,d3": drag along the separator's axis, report centre moves and aria-valuenow.
    const label = args[++i], ds = args[++i].split(",").map(Number);
    const rd = () => evaluate(`(()=>{const e=document.querySelector('[role=separator][aria-label="${label}"]');const r=e.getBoundingClientRect();return [e.getAttribute('aria-orientation'),r.x+r.width/2,r.y+r.height/2,e.getAttribute('aria-valuenow')];})()`);
    const out = [];
    for (const d of ds) {
      const [o, x0, y0, v0] = await rd();
      const vert = o === "vertical";
      await drag(label, vert ? d : 0, vert ? 0 : d);
      const [, x1, y1, v1] = await rd();
      const moved = vert ? x1 - x0 : y1 - y0;
      out.push({ d, moved: +moved.toFixed(2), off: +(moved - d).toFixed(2), v: [v0, v1] });
    }
    console.log(JSON.stringify({ t: await evaluate("document.title"), label, out }));
  } else if (a === "--wheel") {
    // --wheel "sel" dy times: real wheel events over the element's centre.
    const [x, y] = await boxOf(args[++i]);
    const dy = Number(args[++i]), times = Number(args[++i]);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    for (let w = 0; w < times; w++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy, button: "none", buttons: 0 }); await sleep(30); }
    await sleep(400);
    console.log(JSON.stringify({ wheel: [dy, times], active: await evaluate("(()=>{const e=document.activeElement;return e?(e.getAttribute('aria-label')||e.tagName+'.'+String(e.className).slice(0,20)):null})()") }));
  } else if (a === "--edgegrab") {
    // --edgegrab "label" d: presses 1 px inside each edge of the separator's box and 2 px outside each
    // edge (across its axis), drags by d along it, reports the centre's move; then the hover cursor.
    const label = args[++i], d = Number(args[++i]);
    const box = () => evaluate(`(()=>{const e=document.querySelector('[role=separator][aria-label="${label}"]');const r=e.getBoundingClientRect();return [e.getAttribute('aria-orientation'),r.left,r.top,r.right,r.bottom,e.getAttribute('aria-valuenow')];})()`);
    const mv = (type, x, y, buttons) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount: 1 });
    const out = [];
    const [o0, l0, t0, r0, b0] = await box();
    const vert = o0 === "vertical";
    out.push({ box: [+(r0 - l0).toFixed(2), +(b0 - t0).toFixed(2)], orient: o0 });
    for (const [name, off] of [["in-near", 1], ["in-far", -1], ["out-near", -2], ["out-far", 2]]) {
      const [, l, t, r, b, v0] = await box();
      // near edge = left/top, far edge = right/bottom; off >0 inside from near, <0 inside from far (in), out: -2 before near, +2 after far
      let p;
      if (name === "in-near") p = (vert ? l : t) + 1;
      else if (name === "in-far") p = (vert ? r : b) - 1;
      else if (name === "out-near") p = (vert ? l : t) - 2;
      else p = (vert ? r : b) + 2;
      const c = vert ? (t + b) / 2 : (l + r) / 2;
      const x = vert ? p : c, y = vert ? c : p;
      const hit = await evaluate(`(()=>{const e=document.elementFromPoint(${x},${y});return e?(e.getAttribute('aria-label')||e.tagName+'.'+String(e.className).slice(0,30)):null})()`);
      const before = vert ? (l + r) / 2 : (t + b) / 2;
      await mv("mouseMoved", x, y, 0);
      await mv("mousePressed", x, y, 1);
      for (let s = 1; s <= 4; s++) { await mv("mouseMoved", vert ? x + (d * s) / 4 : x, vert ? y : y + (d * s) / 4, 1); await sleep(40); }
      await mv("mouseReleased", vert ? x + d : x, vert ? y : y + d, 0);
      await sleep(250);
      const [, l2, t2, r2, b2, v1] = await box();
      const after = vert ? (l2 + r2) / 2 : (t2 + b2) / 2;
      out.push({ press: name, at: +p.toFixed(2), hit, moved: +(after - before).toFixed(2), v: [v0, v1] });
      // put it back
      if (Math.abs(after - before) > 0.5) await drag(label, vert ? before - after : 0, vert ? 0 : before - after);
    }
    const [, l, t, r, b] = await box();
    const cx = (l + r) / 2, cy = (t + b) / 2;
    await mv("mouseMoved", cx, cy, 0); await sleep(300);
    const on = await evaluate(`(()=>{const e=document.elementFromPoint(${cx},${cy});return [e&&(e.getAttribute('aria-label')||e.tagName),e&&getComputedStyle(e).cursor,getComputedStyle(document.body).cursor]})()`);
    const fx = vert ? cx + 120 : cx, fy = vert ? cy : cy - 120;
    await mv("mouseMoved", fx, fy, 0); await sleep(300);
    const off = await evaluate(`(()=>{const e=document.elementFromPoint(${fx},${fy});return [e&&(e.getAttribute('aria-label')||e.tagName),e&&getComputedStyle(e).cursor,getComputedStyle(document.body).cursor]})()`);
    console.log(JSON.stringify({ t: await evaluate("document.title"), label, d, out, hoverOn: on, hoverOff: off }));
  } else if (a === "--fling") {
    // --fling "sel" yDistance speed "key|-" "clickSel|-" delayMs: a touch scroll gesture with the fling
    // allowed, over one connection; optionally a key or a click `delayMs` after the gesture resolves.
    const sel = args[++i], yd = Number(args[++i]), speed = Number(args[++i]), k = args[++i], cs = args[++i], dl = Number(args[++i]);
    // An earlier --fling's listeners come off first: the page outlives this process, and each set left behind
    // would record every event once more.
    const installed = await evaluate(`(()=>{window.__fl?.off?.();const s=document.querySelector(${JSON.stringify(sel)});if(!s)return 0;const L=(n)=>(e)=>window.__fl.ev.push([n,Math.round(performance.now()-window.__fl.t0),n==='scroll'?Math.round(e.target.scrollTop):0]);const h=['touchstart','touchend','touchcancel'].map((n)=>[n,L(n)]);const sc=L('scroll');for(const [n,f] of h)addEventListener(n,f,{capture:true,passive:true});s.addEventListener('scroll',sc,{passive:true});window.__fl={t0:performance.now(),ev:[],off(){for(const [n,f] of h)removeEventListener(n,f,{capture:true});s.removeEventListener('scroll',sc);}};return 1})()`);
    // Before touch emulation goes on: a step that stops here must not leave it on.
    if (!installed) throw new Error("no element " + sel);
    console.log(JSON.stringify({ touchEmu: await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }) }));
    const [x, y] = await boxOf(sel);
    const g = process.env.FLING_RAW
      ? (async () => {
          // Raw touch: start, quick moves, end — the browser's own fling decides what follows.
          const pt = (py) => [{ x, y: py, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
          await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(y) });
          const n = 8;
          // Lift right after the last move: a pause before touchEnd reads as a resting finger, no fling.
          for (let s = 1; s <= n; s++) { await sleep(Math.round((Math.abs(yd) / speed) * 1000 / n)); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y + (yd * s) / n) }); }
          await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          return { raw: true };
        })()
      : send("Input.synthesizeScrollGesture", { x, y, yDistance: yd, speed, preventFling: false, gestureSourceType: process.env.FLING_SRC || "touch" });
    let gr;
    try { gr = await g; } catch (e) { gr = { error: e.message }; }
    const resolvedAt = await evaluate("Math.round(performance.now()-window.__fl.t0)");
    if (k !== "-" || cs !== "-") {
      await sleep(dl);
      if (k !== "-") await key(k);
      if (cs !== "-") await evaluate(`(()=>{window.__fl.ev.push(['click',Math.round(performance.now()-window.__fl.t0),0]);document.querySelector(${JSON.stringify(cs)}).click();return 1})()`);
    }
    await sleep(2500);
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    const ev = await evaluate("window.__fl.ev");
    const end = ev.filter((e) => e[0] === "touchend").map((e) => e[1]).pop();
    const scrolls = ev.filter((e) => e[0] === "scroll");
    // No touchend seen (a touchcancel, or a gesture source that sends no touch events): nothing was measured
    // after the lift, and `afterEnd` and `msAfterEnd` say so with null, not with 0.
    const after = end === undefined ? [] : scrolls.filter((e) => e[1] > end);
    console.log(JSON.stringify({ t: await evaluate("document.title"), gesture: gr, resolvedAt, touchstart: ev.find((e) => e[0] === "touchstart")?.[1], touchend: end, scrolls: scrolls.length, firstScroll: scrolls[0], lastScroll: scrolls.at(-1), maxScroll: Math.max(0, ...scrolls.map((e) => e[2])), atTouchend: scrolls.filter((e) => e[1] <= end).at(-1), keyOrClickAt: resolvedAt + dl, afterEnd: end === undefined ? null : after.length, lastAfterEnd: after.at(-1), msAfterEnd: end === undefined ? null : after.length ? after.at(-1)[1] - end : 0, other: ev.filter((e) => !["scroll"].includes(e[0])) }));
  } else if (a === "--sclick") {
    // Shift+click, real input.
    const [x, y] = await boxOf(args[++i]);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0, modifiers: 8 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers: 8 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, modifiers: 8 });
    await sleep(350);
    console.log(JSON.stringify({ sclick: [x, y] }));
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
  } else if (a === "--shot") {
    const f = args[++i];
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(f, Buffer.from(data, "base64"));
    console.log(JSON.stringify({ shot: f }));
  } else if (a === "--tag") {
    // --tag "css" "text regex": marks the first match whose text matches as [data-w], clearing old tags.
    const sel = args[++i], re = args[++i];
    console.log(JSON.stringify({ tag: await evaluate(`(()=>{document.querySelectorAll("[data-w]").forEach(e=>e.removeAttribute("data-w"));const r=new RegExp(${JSON.stringify(re)});const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>r.test(e.textContent));if(!e)return null;e.setAttribute("data-w","1");return e.textContent.slice(0,80);})()`) }));
  } else if (a === "--eval") {
    let expr = args[++i];
    if (expr.startsWith("@")) expr = readFileSync(expr.slice(1), "utf8");
    console.log(JSON.stringify(await evaluate(expr), null, 1));
  } else {
    throw new Error(`unknown arg ${a}`);
  }
}
ws.close();
