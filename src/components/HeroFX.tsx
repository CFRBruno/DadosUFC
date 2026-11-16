import { useEffect, useRef } from 'react';

/**
 * Rede de "sinapses" que reage ao mouse + paralaxe leve.
 * - pontos à deriva ligados por linhas finas quando próximos;
 * - o cursor se liga aos pontos ao redor, e pulsos de luz viajam pelas linhas;
 * - elementos com data-depth dentro da seção se deslocam em profundidades diferentes.
 * Com "reduzir movimento" desenha apenas um quadro estático.
 */
interface Node { x: number; y: number; vx: number; vy: number; r: number; flash: number }
/** Faísca elétrica: um traço curto e fino que corre pela rede, acendendo as linhas por onde passa. */
interface Pulse { path: { x: number; y: number; n?: number }[]; seg: number; d: number; left: number[] }

export default function HeroFX({ hostRef }: { hostRef: React.RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const cv = canvas.current;
    if (!host || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let W = 0, H = 0, dpr = 1;
    let nodes: Node[] = [];
    const pulses: Pulse[] = [];
    const mouse = { x: 0, y: 0, on: false, ox: 0, oy: 0 }; // ox/oy: -1..1 (paralaxe alvo)
    const par = { x: 0, y: 0 };
    let raf = 0, last = performance.now(), visible = true, lastSpawn = 0, lastAmbient = 0;

    const resize = () => {
      const r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(28, Math.min(80, Math.round((W * H) / 11000)));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 1 + Math.random() * 1.3, flash: 0,
      }));
    };

    const LINK = 120, CURSOR = 190;
    const neighbors = (i: number) => {
      const a = nodes[i];
      const out: number[] = [];
      nodes.forEach((b, j) => { if (j !== i && Math.hypot(a.x - b.x, a.y - b.y) < LINK) out.push(j); });
      return out;
    };
    const spawn = (from: { x: number; y: number }, firstIdx: number) => {
      const path: { x: number; y: number; n?: number }[] = [from, { x: nodes[firstIdx].x, y: nodes[firstIdx].y, n: firstIdx }];
      let cur = firstIdx;
      const seen = new Set([firstIdx]);
      for (let h = 0; h < 4; h++) {
        const nb = neighbors(cur).filter((j) => !seen.has(j));
        if (!nb.length) break;
        cur = nb[Math.floor(Math.random() * nb.length)];
        seen.add(cur);
        path.push({ x: nodes[cur].x, y: nodes[cur].y, n: cur });
      }
      if (pulses.length < 8) pulses.push({ path, seg: 0, d: 0, left: [] });
    };

    const frame = (now: number) => {
      const dt = Math.min(48, now - last) / 16.67;
      last = now;
      ctx.clearRect(0, 0, W, H);

      // paralaxe suavizada
      par.x += (mouse.ox - par.x) * 0.07 * dt;
      par.y += (mouse.oy - par.y) * 0.07 * dt;
      host.querySelectorAll<HTMLElement | SVGElement>('[data-depth]').forEach((el) => {
        const d = Number(el.getAttribute('data-depth')) || 0;
        el.style.transform = `translate(${(-par.x * d).toFixed(2)}px, ${(-par.y * d).toFixed(2)}px)`;
      });
      const offX = -par.x * 10, offY = -par.y * 10;

      // pontos
      for (const n of nodes) {
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10;
        if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10;
        if (mouse.on) {
          const d = Math.hypot(mouse.x - n.x, mouse.y - n.y);
          if (d < 150 && d > 1) { const k = 0.010 * (1 - d / 150) * dt; n.x += (mouse.x - n.x) * k; n.y += (mouse.y - n.y) * k; }
        }
      }
      ctx.save();
      ctx.translate(offX, offY);

      // ligações entre pontos
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(214, 70, 76, ${(1 - d / LINK) * 0.2})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      // cursor ↔ pontos
      const linked: number[] = [];
      if (mouse.on) {
        nodes.forEach((n, i) => {
          const d = Math.hypot(mouse.x - n.x, mouse.y - n.y);
          if (d < CURSOR) {
            linked.push(i);
            const a = 1 - d / CURSOR;
            ctx.strokeStyle = `rgba(255, 70, 78, ${a * 0.75})`;
            ctx.lineWidth = 0.6 + a * 1.1;
            ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(n.x, n.y); ctx.stroke();
          }
        });
        ctx.lineWidth = 1;
      }
      // pontos (os ligados ao cursor ficam mais claros; ao receber a faísca, piscam)
      for (const n of nodes) {
        const d = mouse.on ? Math.hypot(mouse.x - n.x, mouse.y - n.y) : 1e9;
        const glow = d < CURSOR ? 1 - d / CURSOR : 0;
        n.flash = Math.max(0, n.flash - 0.035 * dt);
        const w = Math.max(glow * 0.7, n.flash);
        ctx.fillStyle = w > 0 ? `rgba(255, ${100 + 140 * w}, ${100 + 140 * w}, ${0.55 + w * 0.45})` : 'rgba(190, 80, 86, 0.55)';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + w * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      // faíscas: traço curto com cauda que se apaga; as linhas já percorridas ficam acesas e esmaecem
      ctx.lineCap = 'round';
      const TAIL = 46, SPEED = 4.2;
      for (let p = pulses.length - 1; p >= 0; p--) {
        const u = pulses[p];
        for (const q of u.path) if (q.n != null) { q.x = nodes[q.n].x; q.y = nodes[q.n].y; } // acompanha os pontos à deriva
        // linhas por onde já passou
        for (let i = 0; i < u.seg; i++) {
          const age = (now - (u.left[i] ?? now)) / 900;
          if (age >= 1) continue;
          const a = u.path[i], b = u.path[i + 1];
          ctx.strokeStyle = `rgba(255, 90, 96, ${(1 - age) * 0.55})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        if (u.seg >= u.path.length - 1) { if (now - (u.left[u.seg - 1] ?? 0) > 900) pulses.splice(p, 1); continue; }
        u.d += SPEED * dt;
        let a = u.path[u.seg], b = u.path[u.seg + 1];
        let len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        while (u.d >= len && u.seg < u.path.length - 1) {
          u.d -= len; u.left[u.seg] = now;
          if (b.n != null) nodes[b.n].flash = 1;
          u.seg++;
          if (u.seg >= u.path.length - 1) break;
          a = u.path[u.seg]; b = u.path[u.seg + 1]; len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        }
        if (u.seg >= u.path.length - 1) continue;
        // posição da cabeça e da cauda (a cauda pode estar no trecho anterior)
        const head = { x: a.x + ((b.x - a.x) * u.d) / len, y: a.y + ((b.y - a.y) * u.d) / len };
        const pts = [head];
        let remain = TAIL, sx = head.x, sy = head.y, si = u.seg, from = u.d;
        while (remain > 0 && si >= 0) {
          const pa = u.path[si], pb = u.path[si + 1];
          const sl = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
          const back = Math.min(remain, from);
          sx = pa.x + ((pb.x - pa.x) * (from - back)) / sl; sy = pa.y + ((pb.y - pa.y) * (from - back)) / sl;
          pts.push({ x: sx, y: sy });
          remain -= back;
          si--; if (si >= 0) from = Math.hypot(u.path[si + 1].x - u.path[si].x, u.path[si + 1].y - u.path[si].y);
        }
        // subdivide para a cauda ter degradê suave
        const fine: { x: number; y: number }[] = [];
        for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < 8; j++) fine.push({ x: pts[i].x + ((pts[i + 1].x - pts[i].x) * j) / 8, y: pts[i].y + ((pts[i + 1].y - pts[i].y) * j) / 8 });
        fine.push(pts[pts.length - 1]);
        pts.length = 0; pts.push(...fine);
        for (let i = 0; i < pts.length - 1; i++) {
          const k = 1 - i / (pts.length - 1);
          ctx.strokeStyle = `rgba(255, ${70 + 170 * k * k}, ${76 + 164 * k * k}, ${0.12 + 0.88 * k})`;
          ctx.lineWidth = 0.7 + 1.5 * k;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
        }
      }
      ctx.restore();

      // novos pulsos: do cursor para os pontos ao redor; e, de vez em quando, espontâneos
      if (mouse.on && linked.length && now - lastSpawn > 320) {
        lastSpawn = now;
        spawn({ x: mouse.x - offX, y: mouse.y - offY }, linked[Math.floor(Math.random() * linked.length)]);
      }
      if (now - lastAmbient > 1500) {
        lastAmbient = now;
        const i = Math.floor(Math.random() * nodes.length);
        const nb = neighbors(i);
        if (nb.length) spawn(nodes[i], nb[Math.floor(Math.random() * nb.length)]);
      }
      if (!still && visible) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true;
      mouse.ox = (mouse.x / r.width - 0.5) * 2; mouse.oy = (mouse.y / r.height - 0.5) * 2;
    };
    const onLeave = () => { mouse.on = false; mouse.ox = 0; mouse.oy = 0; };
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && !still) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    });
    const ro = new ResizeObserver(resize);

    resize();
    if (still) frame(performance.now());
    else {
      raf = requestAnimationFrame(frame);
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }
    io.observe(host); ro.observe(host);
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
    };
  }, [hostRef]);

  return <canvas ref={canvas} className="hero-fx" aria-hidden="true" />;
}
