// 差玉解析：ピクセル解析エンジン＋ランク定義（純粋関数）
//
// 移植元: pachinko-rank-analyzer の App.jsx。
// RANKS / getRank / runAnalysis は移植元のロジック・数式・閾値を一切変更せず移植している。
// （logic.js とは無関係の独立した解析データ。rotRows は迂回しない。）
//
// 出玉推移グラフのスクリーンショットをピクセル解析し、各台の差玉を推定する。

// ── ランク定義（21段階・移植元の min 値と rank 名は変更禁止） ──
export const RANKS = [
  { rank: "SS",  min: 25000 },
  { rank: "S+",  min: 22500 },
  { rank: "S",   min: 20000 },
  { rank: "A+",  min: 17500 },
  { rank: "A",   min: 15000 },
  { rank: "A-",  min: 12500 },
  { rank: "B++", min: 10000 },
  { rank: "B+",  min: 7500 },
  { rank: "B",   min: 5000 },
  { rank: "C+",  min: 2500 },
  { rank: "C",   min: 0 },
  { rank: "C-",  min: -2500 },
  { rank: "D",   min: -5000 },
  { rank: "D-",  min: -7500 },
  { rank: "E++", min: -10000 },
  { rank: "E+",  min: -12500 },
  { rank: "E",   min: -15000 },
  { rank: "E-",  min: -17500 },
  { rank: "F",   min: -20000 },
  { rank: "F-",  min: -22500 },
  { rank: "G",   min: -Infinity },
];

// 差玉値からランク定義を引く（移植元と同一ロジック）。
export const getRank = (v) => RANKS.find((r) => v >= r.min) || RANKS[RANKS.length - 1];

// ランク名 → アプリのパレット（CSS変数）へのトーン割り当て。
// 移植元の固定HEX色は使わず、アプリのダークテーマ変数に寄せる。
// S/SS系=red、A系=orange、B系=yellow、C系=green、D系=blue、E系=sub灰、F/G=purple。
const RANK_GROUP_TONE = {
  red:    { color: "var(--red)",    bg: "color-mix(in srgb, var(--red) 14%, transparent)" },
  orange: { color: "var(--orange)", bg: "color-mix(in srgb, var(--orange) 14%, transparent)" },
  yellow: { color: "var(--yellow)", bg: "color-mix(in srgb, var(--yellow) 14%, transparent)" },
  green:  { color: "var(--green)",  bg: "color-mix(in srgb, var(--green) 14%, transparent)" },
  blue:   { color: "var(--blue)",   bg: "color-mix(in srgb, var(--blue) 14%, transparent)" },
  sub:    { color: "var(--sub)",    bg: "color-mix(in srgb, var(--sub) 16%, transparent)" },
  purple: { color: "var(--purple)", bg: "color-mix(in srgb, var(--purple) 14%, transparent)" },
};

function rankGroup(rank) {
  const head = String(rank || "").charAt(0);
  if (head === "S") return "red";
  if (head === "A") return "orange";
  if (head === "B") return "yellow";
  if (head === "C") return "green";
  if (head === "D") return "blue";
  if (head === "E") return "sub";
  return "purple"; // F / G
}

// ランク名から { color, bg } を返す（UI 表示用）。
export function getRankTone(rank) {
  return RANK_GROUP_TONE[rankGroup(rank)] || RANK_GROUP_TONE.sub;
}

// ============ ピクセル解析（OCRなし・生スロットを返す） ============
// 移植元 runAnalysis をロジック・数式・閾値そのまま移植。logs はそのまま返す。
export function runAnalysis(data, w, h) {
  const logs = [];
  const log = (m) => logs.push(m);
  log(`画像: ${w}x${h}`);
  const rowBright = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0; const base = y * w * 4;
    for (let x = 0; x < w; x++) { const i = base + x * 4; sum += (data[i]+data[i+1]+data[i+2])/3; }
    rowBright[y] = sum / w;
  }
  let inDark = false, dS = 0;
  const rawD = [];
  for (let y = 0; y < h; y++) {
    if (rowBright[y] < 80 && !inDark) { dS = y; inDark = true; }
    if ((rowBright[y] >= 80 || y === h-1) && inDark) { rawD.push([dS, y-1]); inDark = false; }
  }
  const merged = [];
  for (const [s,e] of rawD) {
    if (e-s < 15) continue;
    if (merged.length && s - merged[merged.length-1][1] < 25) merged[merged.length-1][1] = e;
    else merged.push([s, e]);
  }
  const graphRows = merged.filter(([s,e]) => e-s >= 60);
  log(`${graphRows.length}行 (${graphRows.length*2}台)`);
  if (!graphRows.length) return { results: [], logs, error: "グラフ行なし" };

  const midX = (w/2)|0;
  const [r0s, r0e] = graphRows[0];
  const bH = r0e - r0s + 1;
  const bB = new Float32Array(bH);
  for (let ly = 0; ly < bH; ly++) {
    let s = 0, c = 0;
    for (let x = 10; x < midX-5; x++) { const i = ((r0s+ly)*w+x)*4; s += (data[i]+data[i+1]+data[i+2])/3; c++; }
    bB[ly] = s / c;
  }
  const gls = [];
  for (let y = 3; y < bH-3; y++) {
    const nb = (bB[y-2]+bB[y-1])/2;
    if (bB[y] > Math.max(nb,25)*1.2 && bB[y] > 33) gls.push({y, b:bB[y]});
  }
  const mG = [];
  for (const g of gls) { if (mG.length && g.y-mG[mG.length-1].y<5) { if(g.b>mG[mG.length-1].b)mG[mG.length-1]=g; } else mG.push(g); }
  let zeroY, gridSp;
  if (mG.length >= 3) {
    const bs = mG.map(g=>g.b).sort((a,b)=>a-b);
    const medB = bs[(bs.length/2)|0];
    const maxI = mG.reduce((mi,g,i,a)=>(g.b>a[mi].b?i:mi),0);
    zeroY = mG[maxI].b > medB*2 ? mG[maxI].y : (() => { const sp=mG.slice(1).map((g,i)=>g.y-mG[i].y).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; return mG[0].y+3*gridSp; })();
    const nS = mG.filter(g=>g.b<medB*2).map(g=>g.y);
    if (nS.length>=2) { const sp=nS.slice(1).map((y,i)=>y-nS[i]).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; }
    else if (!gridSp) { const sp=mG.slice(1).map((g,i)=>g.y-mG[i].y).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; }
  } else { zeroY=bH*0.54; gridSp=bH/6.5; }
  log(`zero=${zeroY|0} grid=${gridSp?.toFixed(1)}px`);

  const fm = Math.max(3, (w*0.015)|0);
  const results = [];
  for (let ri = 0; ri < graphRows.length; ri++) {
    for (let col = 0; col < 2; col++) {
      const [yS, yE] = graphRows[ri];
      const gH = yE-yS+1;
      const safeH = Math.min((gH*0.82)|0, gH-12);
      const xS = col===0 ? 5+fm : midX+2+fm;
      const xE = col===0 ? midX-2-fm : w-5-fm;
      const gW = xE-xS;
      const leftCut = (gW*0.08)|0;
      let maxYX=-1;
      const yByX = new Map();
      for (let ly=0; ly<safeH; ly++) {
        for (let lx=leftCut; lx<gW; lx++) {
          const i=((yS+ly)*w+(xS+lx))*4;
          const r=data[i],g=data[i+1],b=data[i+2];
          if (r>150&&g>150&&b<130&&(r+g)>b*3&&r>b+25) {
            if(!yByX.has(lx))yByX.set(lx,[]);
            yByX.get(lx).push(ly);
            if(lx>maxYX)maxYX=lx;
          }
        }
      }
      const totalPx=Array.from(yByX.values()).reduce((s,a)=>s+a.length,0);
      if (totalPx<5||maxYX<0) { results.push({val:0, px:0}); continue; }
      const endYs=[];
      for(let ex=Math.max(maxYX-6,0);ex<=maxYX;ex++) if(yByX.has(ex))endYs.push(...yByX.get(ex));
      endYs.sort((a,b)=>a-b);
      const epY=endYs[(endYs.length/2)|0];
      let sag=((zeroY-epY)/gridSp)*10000;
      sag=Math.round(sag/500)*500;
      results.push({val:sag, px:totalPx});
    }
  }
  log(`${results.length}台解析完了`);
  return { results, logs };
}
