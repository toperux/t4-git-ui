// Low-fi alternate: "High-contrast mono" — near-black/white, hard 1px lines, single red accent, Public Sans + Source Code Pro.
export default () => ({
  width: 640,
  bg: '#ffffff',
  links: ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;700&family=Source+Code+Pro&display=swap">'],
  extraCss: `
    .c { font-family: "Public Sans", "Segoe UI", system-ui, sans-serif; color: #111; font-size: 13px; line-height: 18px; }
    .c .mono { font-family: "Source Code Pro", Menlo, monospace; font-size: 12px; }
    .c .bar { height: 36px; display: flex; align-items: center; gap: 16px; padding: 0 12px; border-bottom: 1px solid #111; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: .08em; }
    .c .side { width: 150px; border-right: 1px solid #111; padding: 8px 0; }
    .c .side div { height: 24px; padding: 0 12px; display: flex; align-items: center; }
    .c .side .cur { font-weight: 700; border-left: 3px solid #e5322d; padding-left: 9px; }
    .c .r { height: 26px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid #e5e5e5; }
    .c .r.sel { background: #111; color: #fff; }
    .c .dot { width: 8px; height: 8px; border-radius: 50%; background: #111; }
    .c .r.sel .dot { background: #fff; }
    .c .chip { font-size: 11px; padding: 0 5px; border: 1px solid currentColor; border-radius: 2px; }
    .c .cta { background: #e5322d; color: #fff; padding: 4px 10px; border-radius: 2px; }
  `,
  body: `<div class="canvas-root c" style="width: 640px; display: flex; flex-direction: column; gap: 12px; padding: 16px;">
    <div style="display: flex; align-items: baseline; gap: 10px;"><span style="font-size: 16px; font-weight: 700;">Direction C · High-contrast mono</span><span style="color: #666; font-size: 12px;">Public Sans / Source Code Pro · black-on-white · one red accent</span></div>
    <div style="border: 1px solid #111; overflow: hidden;">
      <div class="bar"><span>Fetch</span><span>Pull</span><span>Push</span><span style="flex: 1;"></span><span class="cta">Commit 4</span></div>
      <div style="display: flex; height: 200px;">
        <div class="side"><div style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .1em;">Local</div><div class="cur">main</div><div>feature/lane-graph</div><div>hotfix</div><div style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .1em; margin-top: 6px;">Remotes</div><div>origin</div></div>
        <div style="flex: 1;">
          <div class="r"><span class="dot" style="background: transparent; border: 1px dashed #111;"></span><span style="font-style: italic; color: #666;">Working tree · 4 changes</span></div>
          <div class="r sel"><span class="dot"></span><span style="flex: 1;">Dedupe lanes when parent already expected</span><span class="chip">main</span><span class="mono">a1b2c3d</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Merge branch feature/lane-graph</span><span class="mono" style="color: #666;">9f8e7d6</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Emit MergeInto lines</span><span class="chip">feature/lane-graph</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Cache log pages</span></div>
          <div class="r"><span class="dot"></span><span style="flex: 1;">Initial workspace</span><span class="chip" style="color: #e5322d;">v0.1.0</span></div>
        </div>
      </div>
    </div>
    <div style="font-size: 12px; color: #444; line-height: 17px;"><b>Why:</b> maximum legibility and a distinctive, editorial look; trivially themeable (invert). <b>Tradeoff:</b> a monochrome graph loses lane identity — needs color anyway; hard lines feel heavier in a dense grid.</div>
  </div>`,
});
