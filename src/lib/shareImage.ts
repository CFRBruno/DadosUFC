// Imagem de compartilhamento da previsão (PNG 1080×1350), desenhada num <canvas>.
// As fotos vêm do próprio site (photoLocal): o CDN da ESPN não permite desenhá-las num canvas.

export interface ShareFighter { name: string; record: string; photo: string | null }
export interface ShareData {
  a: ShareFighter;
  b: ShareFighter;
  context: string;                 // "PESO-LEVE · 5 ROUNDS"
  pA: number;                      // combinada
  reads?: { label: string; p: number }[]; // estatísticas / mercado / combinada
  mostLikely: string;              // "Carlos Prates por KO/TKO"
  mostLikelyP: number;
  methodsA: { KO: number; SUB: number; DEC: number };
  methodsB: { KO: number; SUB: number; DEC: number };
}

const W = 1080, H = 1350;
/** Nunca mostra 0% nem 100% (nada é certo no MMA); mantém os dois lados somando 100. */
const pct = (p: number) => `${Math.min(99, Math.max(1, Math.round(p * 100)))}%`;
const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 8) * (2 * i + 1);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: (px: number) => string, start: number, min = 28): number {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxW && px > min) { px -= 2; ctx.font = font(px); }
  return px;
}

/** Corta o texto com reticências para caber em `maxW` na fonte atual do contexto. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export async function renderShareImage(d: ShareData): Promise<Blob> {
  await Promise.all([
    document.fonts.load('900 100px Inter'), document.fonts.load('800 30px Inter'), document.fonts.load('600 30px Inter'),
    document.fonts.load('700 56px Oswald'), document.fonts.load('700 28px "Roboto Mono"'),
  ]).catch(() => undefined);
  const [imgA, imgB] = await Promise.all([d.a.photo ? loadImage(d.a.photo) : null, d.b.photo ? loadImage(d.b.photo) : null]);
  const cA = css('--a', '#ef4444'), cB = css('--b', '#3b82f6'), brand = '#ed1c24';

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  // fundo
  ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 330, 40, W / 2, 330, 760);
  g.addColorStop(0, 'rgba(237,28,36,0.28)'); g.addColorStop(1, 'rgba(237,28,36,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2;
  for (const r of [420, 520, 620]) { octagon(ctx, W / 2, 350, r); ctx.stroke(); }

  // topo
  ctx.textAlign = 'left';
  ctx.font = '700 46px Oswald'; ctx.fillStyle = '#fff'; ctx.fillText('DADOS', 64, 92);
  const dw = ctx.measureText('DADOS').width;
  ctx.fillStyle = brand; ctx.fillText('UFC', 64 + dw + 4, 92);
  ctx.textAlign = 'right'; ctx.font = '600 24px Inter'; ctx.fillStyle = '#7c7c84'; ctx.fillText('dadosufc.web.app', W - 64, 90);
  ctx.textAlign = 'center'; ctx.font = '700 26px "Roboto Mono"'; ctx.fillStyle = brand;
  fit(ctx, d.context.toUpperCase(), 700, (px) => `700 ${px}px "Roboto Mono"`, 26, 16);
  ctx.fillText(ellipsize(ctx, d.context.toUpperCase(), 700), W / 2, 136);

  // lutadores
  const drawFighter = (f: ShareFighter, img: HTMLImageElement | null, cx: number, color: string) => {
    const cy = 322, r = 165;
    octagon(ctx, cx, cy, r + 10); ctx.fillStyle = color; ctx.fill();
    octagon(ctx, cx, cy, r); ctx.fillStyle = '#16161a'; ctx.fill();
    ctx.save(); octagon(ctx, cx, cy, r); ctx.clip();
    if (img) {
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2 + 12, img.width * s, img.height * s);
    } else {
      ctx.fillStyle = '#9a9aa3'; ctx.textAlign = 'center'; ctx.font = '900 110px Inter'; ctx.fillText(initials(f.name), cx, cy + 38);
    }
    ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    fit(ctx, f.name.toUpperCase(), 440, (px) => `700 ${px}px Oswald`, 56);
    ctx.fillText(ellipsize(ctx, f.name.toUpperCase(), 440), cx, 572);
    ctx.font = '700 26px "Roboto Mono"'; ctx.fillStyle = '#8a8a93'; ctx.fillText(f.record, cx, 614);
  };
  drawFighter(d.a, imgA, 270, cA);
  drawFighter(d.b, imgB, 810, cB);
  ctx.beginPath(); ctx.arc(W / 2, 322, 44, 0, Math.PI * 2); ctx.fillStyle = '#0e0e11'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#2a2a30'; ctx.stroke();
  ctx.fillStyle = brand; ctx.font = '700 38px Oswald'; ctx.textAlign = 'center'; ctx.fillText('VS', W / 2, 336);

  // porcentagens
  // as duas porcentagens usam o mesmo tamanho e deixam livre a faixa central (rótulo "chance de vitória")
  const bigW = (px: number) => { ctx.font = `900 ${px}px Inter`; return Math.max(ctx.measureText(pct(d.pA)).width, ctx.measureText(pct(1 - d.pA)).width); };
  let bigPx = 150;
  while (bigPx > 80 && bigW(bigPx) > 400) bigPx -= 6;
  ctx.font = `900 ${bigPx}px Inter`;
  ctx.textAlign = 'left'; ctx.fillStyle = cA; ctx.fillText(pct(d.pA), 64, 790);
  ctx.textAlign = 'right'; ctx.fillStyle = cB; ctx.fillText(pct(1 - d.pA), W - 64, 790);
  ctx.textAlign = 'center'; ctx.font = '700 20px "Roboto Mono"'; ctx.fillStyle = '#7c7c84'; ctx.fillText('CHANCE DE', W / 2, 752); ctx.fillText('VITÓRIA', W / 2, 778);
  const bx = 64, bw = W - 128, by = 820, bh = 24;
  ctx.fillStyle = cB; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 13); ctx.fill();
  ctx.fillStyle = cA; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(26, bw * d.pA), bh, 13); ctx.fill();

  // leituras
  let y = 880;
  if (d.reads?.length) {
    const n = d.reads.length, gap = 18, cw = (W - 128 - gap * (n - 1)) / n;
    d.reads.forEach((rd, i) => {
      const x = 64 + i * (cw + gap);
      const main = i === n - 1;
      ctx.fillStyle = '#131317'; ctx.beginPath(); ctx.roundRect(x, y, cw, 112, 18); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = main ? 'rgba(237,28,36,0.6)' : '#26262c'; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '700 20px "Roboto Mono"'; ctx.fillStyle = main ? brand : '#8a8a93';
      ctx.fillText(rd.label.toUpperCase(), x + cw / 2, y + 34);
      ctx.font = '900 40px Inter';
      const t1 = pct(rd.p), t2 = pct(1 - rd.p), sep = '×';
      const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width, ws = 44;
      const sx = x + cw / 2 - (w1 + ws + w2) / 2;
      ctx.textAlign = 'left'; ctx.fillStyle = cA; ctx.fillText(t1, sx, y + 86);
      ctx.fillStyle = '#6b6b73'; ctx.font = '600 26px Inter'; ctx.fillText(sep, sx + w1 + 14, y + 84);
      ctx.font = '900 40px Inter'; ctx.fillStyle = cB; ctx.fillText(t2, sx + w1 + ws, y + 86);
    });
    y += 112 + 28;
  } else y += 10;

  // resultado mais provável
  ctx.fillStyle = '#16090b'; ctx.beginPath(); ctx.roundRect(64, y, W - 128, 124, 20); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(237,28,36,0.45)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.font = '700 22px "Roboto Mono"'; ctx.fillStyle = brand; ctx.fillText('RESULTADO MAIS PROVÁVEL', W / 2, y + 38);
  const line = `${d.mostLikely} (${pct(d.mostLikelyP)})`;
  fit(ctx, line, W - 180, (px) => `800 ${px}px Inter`, 44, 24);
  ctx.fillStyle = '#fff'; ctx.fillText(ellipsize(ctx, line, W - 180), W / 2, y + 90);
  y += 124 + 40;

  // métodos
  const M = [['KO/TKO', 'KO'], ['FINALIZAÇÃO', 'SUB'], ['DECISÃO', 'DEC']] as const;
  const col = (x: number, name: string, color: string, m: ShareData['methodsA']) => {
    ctx.textAlign = 'left'; ctx.font = '800 24px Inter'; ctx.fillStyle = color;
    fit(ctx, `${name.toUpperCase()} VENCE POR`, 440, (px) => `800 ${px}px Inter`, 24, 16);
    ctx.fillText(ellipsize(ctx, `${name.toUpperCase()} VENCE POR`, 450), x, y);
    M.forEach(([label, k], i) => {
      const yy = y + 34 + i * 34;
      ctx.font = '600 22px Inter'; ctx.fillStyle = '#a0a0a8'; ctx.fillText(label, x, yy);
      ctx.textAlign = 'right'; ctx.font = '800 22px Inter'; ctx.fillStyle = '#fff'; ctx.fillText(pct(m[k]), x + 460, yy);
      ctx.textAlign = 'left';
    });
  };
  col(64, d.a.name.split(' ').slice(-1)[0], cA, d.methodsA);
  col(556, d.b.name.split(' ').slice(-1)[0], cB, d.methodsB);

  // rodapé
  ctx.textAlign = 'center'; ctx.font = '600 20px Inter'; ctx.fillStyle = '#5d5d65';
  ctx.fillText('Previsão estatística do DadosUFC · não é recomendação de aposta', W / 2, H - 24);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('falha ao gerar a imagem'))), 'image/png'));
}
