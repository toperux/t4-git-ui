// Low-fi alternate: "Warm graphite" — warm neutrals, amber accent, IBM Plex.
export default () => ({
  width: 640,
  bg: '#faf7f2',
  links: ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap">'],
  extraCss: `
    .b { font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; color: #2a2622; font-size: 13px; line-height: 18px; }
    .b .mono { font-family: "IBM Plex Mono", Menlo, monospace; font-size: 12px; }
    .b .bar { height: 36px; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: #f3eee6; border-bottom: 1px solid #e3dccf; font-weight: 500; }
    .b .side { width: 150px; background: #f3eee6; border-right: 1px solid #e3dccf; padding: 8px 0; }
    .b .side div { height: 24px; padding: 0 12px; display: flex; align-items: center; }
    .b .side .cur { background: #eadfc9; font-weight: 600; }
    .b .r { height: 26px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid #f0eae0; }
    .b .r.sel { background: #fbe9c8; }
    .b .dot { width: 8px; height: 8px; border-radius: 50%; background: #b8862b; }
    .b .chip { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #eadfc9; color: #6b4d12; }
    .b .cta { background: #b8862b; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: 500; }
  `,
  body: `<div class="canvas-root b" style="width: 640px; display: flex; flex-direction: column; gap: 12px; padding: 16px;">
    <div style="display: flex; align-items: baseline; gap: 10px;"><span style="font-size: 16px; font-weight: 600;">Direction B · Warm graphite</span><span style="color: #7a7066; font-size: 12px;">IBM Plex Sans/Mono · warm paper neutrals · amber accent</span></div>
    <div style="background: #fffdf9; border: 1px solid #e3dccf; border-radius: 8px; overflow: hidden;">
      <div class="bar"><span>Fetch</span><span>Pull</span><span>Push</span><span style="flex: 1;"></span><span class="cta">Commit 4</span></div>
      <div style="display: flex; height: 200px;">
        <div class="side"><div style="font-size: 11px; color: #7a7066; text-transform: uppercase; letter-spacing: .06em;">Local</div><div class="cur">main</div><div>feature/lane-graph</div><div>hotfix</div><div style="font-size: 11px; color: #7a7066; text-transform: uppercase; letter-spacing: .06em; margin-top: 6px;">Remotes</div><div>origin</div></div>
        <div style="flex: 1;">
          <div class="r"><span class="dot" style="background: transparent; border: 1px dashed #b8862b;"></span><span style="font-style: italic; color: #7a7066;">Working tree · 4 changes</span></div>
          <div class="r sel"><span class="dot"></span><span style="flex: 1;">Dedupe lanes when parent already expected</span><span class="chip">main</span><span class="mono" style="color: #7a7066;">a1b2c3d</span></div>
          <div class="r"><span class="dot" style="background: #4f7d5a;"></span><span style="flex: 1;">Merge branch feature/lane-graph</span><span class="mono" style="color: #7a7066;">9f8e7d6</span></div>
          <div class="r"><span class="dot" style="background: #4f7d5a;"></span><span style="flex: 1;">Emit MergeInto lines</span><span class="chip">feature/lane-graph</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Cache log pages</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Initial workspace</span><span class="chip" style="background: #f5e4e0; color: #8a3b2c;">v0.1.0</span></div>
        </div>
      </div>
    </div>
    <div style="font-size: 12px; color: #5c554d; line-height: 17px;"><b>Why:</b> warmer, less “IDE”; paper-like surfaces are easy on the eyes for long sessions. <b>Tradeoff:</b> amber accent collides with the “modified” status color; graph palette needs re-tuning against warm backgrounds.</div>
  </div>`,
});
