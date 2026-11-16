import { useEffect, useRef } from 'react';

/**
 * Rede de "sinapses" que reage ao mouse + paralaxe leve.
 * - pontos à deriva ligados por linhas finas quando próximos;
 * - o cursor se liga aos pontos ao redor, e pulsos de luz viajam pelas linhas;
 * - elementos com data-depth dentro da seção se deslocam em profundidades diferentes.
 * Com "reduzir movimento" desenha apenas um quadro estático.
 */
interface Node { x: number; y: number; vx: number; vy: number; r: number }
interface Pulse { path: { x: number; y: number }[]; seg: number; t: number }

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
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 1 + Math.random() * 1.3,
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
      const path = [from, nodes[firstIdx]];
      let cur = firstIdx;
      for (let h = 0; h < 3; h++) {
        const nb = neighbors(cur).filter((j) => !path.includes(nodes[j]));
        if (!nb.length) break;
        cur = nb[Math.floor(Math.random() * nb.length)];
        path.push(nodes[cur]);
      }
      if (pulses.length < 9) pulses.push({ path: path.map((p) => ({ x: p.x, y: p.y })), seg: 0, t: 0 });
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
      // pontos (os ligados ao cursor brilham)
      for (const n of nodes) {
        const d = mouse.on ? Math.hypot(mouse.x - n.x, mouse.y - n.y) : 1e9;
        const glow = d < CURSOR ? 1 - d / CURSOR : 0;
        ctx.fillStyle = glow > 0 ? `rgba(255, ${110 + 90 * glow}, ${110 + 90 * glow}, ${0.5 + glow * 0.5})` : 'rgba(190, 80, 86, 0.55)';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + glow * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      // pulsos viajando (sinapses)
      for (let p = pulses.length - 1; p >= 0; p--) {
        const u = pulses[p];
        u.t += 0.035 * dt;
        if (u.t >= 1) { u.t = 0; u.seg++; }
        if (u.seg >= u.path.length - 1) { pulses.splice(p, 1); continue; }
        const a = u.path[u.seg], b = u.path[u.seg + 1];
        const x = a.x + (b.x - a.x) * u.t, y = a.y + (b.y - a.y) * u.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, 'rgba(255, 235, 235, 0.95)'); g.addColorStop(0.25, 'rgba(255, 70, 78, 0.65)'); g.addColorStop(1, 'rgba(237, 28, 36, 0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
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
