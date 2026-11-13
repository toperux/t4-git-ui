// Per-frame recorder for virtualized lists. window.__rec.start() / window.__rec.stop() -> summary.
// A list = a scroller with descendants positioned by inline translateY or a leading inline top. Per frame, per list:
// blank = no row intersects the viewport although content exists; gap = >1px uncovered between rows in
// the viewport, or above the first / below the last row when more content lies that way; overlap = >1px.
(() => {
  const lists = () => {
    const out = new Map();
    for (const r of document.querySelectorAll('[style*="translateY"], [style^="top:"]')) {
      let s = r.parentElement;
      while (s && s !== document.body) {
        const oy = getComputedStyle(s).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && s.clientHeight > 0) break;
        s = s.parentElement;
      }
      if (!s || s === document.body || r.closest('[role=dialog]') && !s.closest('[role=dialog]')) continue;
      if (!out.has(s)) out.set(s, []);
      out.get(s).push(r);
    }
    return out;
  };
  const name = (s) => s.getAttribute('aria-label') || (s.className && String(s.className).split(' ')[0]) || s.tagName;
  const frame = (st) => {
    for (const [s, rows] of lists()) {
      const sr = s.getBoundingClientRect();
      const H = s.clientHeight;
      const k = name(s);
      const L = (st.lists[k] ??= { frames: 0, blank: 0, gap: 0, overlap: 0, jumps: 0, minRows: 1e9, lastTop: null, ex: [] });
      L.frames++;
      const iv = rows
        .map((r) => { const b = r.getBoundingClientRect(); return [b.top - sr.top, b.bottom - sr.top, r.textContent.slice(0, 40)]; })
        .filter(([t, b]) => b > 0.5 && t < H - 0.5 && b - t > 0)
        .sort((a, b) => a[0] - b[0]);
      L.minRows = Math.min(L.minRows, iv.length);
      if (L.lastTop !== null && s.scrollTop !== L.lastTop) L.jumps++;
      L.lastTop = s.scrollTop;
      const note = (kind, d) => { L[kind]++; if (L.ex.length < 8) L.ex.push(`${Math.round(performance.now() - st.t0)}ms ${kind} ${d} st=${s.scrollTop} sh=${s.scrollHeight}`); };
      if (s.scrollHeight > 4 && iv.length === 0) { note('blank', 'rows=0'); continue; }
      if (iv.length === 0) continue;
      // Sticky/static headers inside the scroller aren't rows: once scrolled, tolerate a top band up to
      // start()'s topPad for this list.
      if (s.scrollTop > 0 && iv[0][0] > 1 && iv[0][0] > (st.topPad[k] ?? 0) + 1) note('gap', `top ${iv[0][0].toFixed(1)}`);
      for (let i = 1; i < iv.length; i++) {
        const d = iv[i][0] - iv[i - 1][1];
        if (d > 1) note('gap', `${d.toFixed(1)} before "${iv[i][2]}"`);
        else if (d < -1) note('overlap', `${(-d).toFixed(1)} at "${iv[i][2]}"`);
      }
      const last = iv[iv.length - 1][1];
      if (last < H - 1 && s.scrollTop + H < s.scrollHeight - 1) note('gap', `bottom band ${(H - last).toFixed(1)}`);
    }
  };
  // A recorder installed or started before this one stops here: its frame loop would run until a reload.
  if (window.__rec?.st) window.__rec.st.run = false;
  window.__rec = {
    start(topPad = {}) {
      if (this.st) this.st.run = false;
      const st = (this.st = { t0: performance.now(), n: 0, lists: {}, run: true, topPad });
      const loop = () => { if (!st.run) return; st.n++; try { frame(st); } catch (e) { st.err = String(e); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      return JSON.stringify({ t: document.title, started: true });
    },
    stop() {
      const st = this.st; if (!st) return 'not started';
      st.run = false;
      const lists = Object.fromEntries(Object.entries(st.lists).map(([k, v]) => [k, { frames: v.frames, blank: v.blank, gap: v.gap, overlap: v.overlap, jumps: v.jumps, minRows: v.minRows, ex: v.ex }]));
      return JSON.stringify({ t: document.title, frames: st.n, ms: Math.round(performance.now() - st.t0), err: st.err, lists, hook: window.__ch });
    },
  };
  return JSON.stringify({ t: document.title, rec: 'installed' });
})()
