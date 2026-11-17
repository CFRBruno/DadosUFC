import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CountUp, ErrorBox, Loading } from '../components/ui';
import { useJson } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { DIVISION_BY_KEY, MAIN_DIVISIONS } from '../shared/divisions';
import type { InfographicsData, UpsetFight } from '../shared/types';

/** Dispara uma vez quando o elemento aparece na tela (para animar ao rolar). */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.18 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export default function Infograficos() {
  const info = useJson<InfographicsData>('infographics.json');
  const ups = useJson<UpsetFight[]>('upsets.json');
  if (info.error || ups.error) return <div className="container"><ErrorBox message={info.error ?? ups.error ?? ''} /></div>;
  if (!info.data || !ups.data) return <Loading />;
  return (
    <div className="ig-page">
      <header className="ig-hero">
        <div className="container">
          <span className="eyebrow">Infográficos</span>
          <h1>O UFC em três lições.</h1>
          <p>Os mesmos dados do site, vistos de outro jeito: como as lutas terminam, quem vence quem e se dá para confiar nas previsões. Passe o mouse, arraste e clique.</p>
          <div className="ig-chips">
            <a href="#numeros">1 · O UFC em números</a>
            <a href="#estilos">2 · Estilos que pulsam</a>
            <a href="#modelo">3 · O modelo é honesto?</a>
          </div>
        </div>
      </header>
      <Numbers data={info.data} />
      <StyleMatrix data={info.data} />
      <HonestyBoard rows={ups.data} />
    </div>
  );
}

/* ============================ 1 · O UFC em números (claro, executivo) ============================ */

const METHOD_COL = { ko: '#ef4444', sub: '#8b5cf6', dec: '#14b8a6', oth: '#94a3b8' } as const;
const METHOD_LABEL = { ko: 'Nocaute', sub: 'Finalização', dec: 'Decisão', oth: 'Outros' } as const;

function Spark({ values, color, years, fmt }: { values: number[]; color: string; years: number[]; fmt: (n: number) => string }) {
  const [ref, seen] = useInView<SVGSVGElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = 240, H = 62, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / Math.max(1e-9, max - min)) * (H - 2 * pad);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1)} ${H} L${x(0)} ${H} Z`;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(values.length - 1, Math.round(((e.clientX - r.left) / r.width) * (values.length - 1)))));
  };
  return (
    <div className="ig-spark">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerLeave={() => setHover(null)} className={seen ? 'in' : ''}>
        <path d={area} fill={color} opacity=".12" className="sp-area" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="sp-line" />
        {hover != null && <><line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke={color} strokeDasharray="3 3" opacity=".6" /><circle cx={x(hover)} cy={y(values[hover])} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" /></>}
      </svg>
      <div className="sp-tip">{hover != null ? <><b>{years[hover]}</b> · {fmt(values[hover])}</> : <span>passe o mouse</span>}</div>
    </div>
  );
}

function Numbers({ data }: { data: InfographicsData }) {
  const years = data.years.filter((y) => y.y >= 2000);
  const last = years[years.length - 1], prev = years[years.length - 2];
  const fin = (y: (typeof years)[number]) => (y.ko + y.sub) / y.n;
  const decR = (y: (typeof years)[number]) => y.dec / y.n;
  const kpis = [
    { label: 'Finalizações', sub: 'nocaute + finalização', v: fin(last), d: fin(last) - fin(prev), series: years.map(fin), color: '#22c55e', f: (n: number) => fmtPct(n), delta: (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pp`, up: 'good' },
    { label: 'Decisões', sub: 'lutas que foram aos juízes', v: decR(last), d: decR(last) - decR(prev), series: years.map(decR), color: '#f59e0b', f: (n: number) => fmtPct(n), delta: (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)} pp`, up: 'flat' },
    { label: 'Duração média', sub: 'minutos por luta', v: last.min, d: last.min - prev.min, series: years.map((y) => y.min), color: '#3b82f6', f: (n: number) => `${n.toFixed(1).replace('.', ',')} min`, delta: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')} min`, up: 'flat' },
    { label: 'Lutas no ano', sub: 'com vencedor', v: last.n, d: last.n - prev.n, series: years.map((y) => y.n), color: '#ef4444', f: (n: number) => String(Math.round(n)), delta: (d: number) => `${d >= 0 ? '+' : ''}${d}`, up: 'flat' },
  ];
  return (
    <section id="numeros" className="ig-light">
      <div className="container">
        <div className="ig-badge">Inteligência do octógono</div>
        <h2>Decisões em um único olhar.</h2>
        <p className="ig-lead">O ritmo do UFC ano a ano: quanto das lutas acaba antes do fim, quanto vai aos juízes e quanto tempo elas duram. {last.y === new Date().getUTCFullYear() ? `${last.y} é um ano em andamento.` : ''}</p>
        <div className="ig-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="ig-kpi" style={{ ['--c' as string]: k.color }}>
              <div className="kpi-top"><span>{k.label}</span><em className={k.d === 0 ? 'flat' : k.d > 0 ? 'up' : 'down'}>{k.d >= 0 ? '▲' : '▼'} {k.delta(k.d)}</em></div>
              <b><CountUp value={k.v} ms={1400} fromZero format={k.f} /></b>
              <small>{k.sub} · {last.y} vs {prev.y}</small>
              <Spark values={k.series} years={years.map((y) => y.y)} color={k.color} fmt={k.f} />
            </div>
          ))}
        </div>
        <MethodStack years={data.years} />
        <DivisionBars data={data} />
      </div>
    </section>
  );
}

function MethodStack({ years }: { years: InfographicsData['years'] }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [sel, setSel] = useState(years.length - 1);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => setSel((s) => { if (s >= years.length - 1) { setPlay(false); return s; } return s + 1; }), 380);
    return () => clearInterval(t);
  }, [play, years.length]);
  const y = years[sel];
  const tot = y.n || 1;
  return (
    <div className="ig-card ig-stack" ref={ref}>
      <div className="card-head">
        <div><h3>Como as lutas terminam</h3><p>Participação de cada método, de 1993 até hoje.</p></div>
        <button className="ig-btn" onClick={() => { if (!play && sel >= years.length - 1) setSel(0); setPlay((p) => !p); }}>{play ? '❚❚ Pausar' : '▶ Reproduzir'}</button>
      </div>
      <div className="stack-body">
        <div className="stack-cols" role="img" aria-label="Métodos de vitória por ano" onPointerLeave={() => undefined}>
          {years.map((r, i) => {
            const t = r.n || 1;
            return (
              <button key={r.y} className={`col ${i === sel ? 'on' : ''} ${seen ? 'in' : ''}`} style={{ ['--i' as string]: i }} onPointerEnter={() => { setPlay(false); setSel(i); }} onClick={() => { setPlay(false); setSel(i); }} aria-label={`${r.y}`}>
                {(['ko', 'sub', 'dec', 'oth'] as const).map((m) => <i key={m} style={{ height: `${(r[m] / t) * 100}%`, background: METHOD_COL[m] }} />)}
              </button>
            );
          })}
        </div>
        <div className="stack-axis"><span>{years[0].y}</span><span>{years[Math.floor(years.length / 2)].y}</span><span>{years[years.length - 1].y}</span></div>
        <div className="stack-info">
          <div className="yr"><CountUp value={y.y} ms={350} format={(n) => String(Math.round(n))} /></div>
          <div className="yr-sub">{y.n} lutas · {(y.min).toFixed(1).replace('.', ',')} min em média</div>
          {(['ko', 'sub', 'dec', 'oth'] as const).map((m) => (
            <div className="mrow" key={m}>
              <span><i style={{ background: METHOD_COL[m] }} />{METHOD_LABEL[m]}</span>
              <div className="mbar"><i style={{ width: `${(y[m] / tot) * 100}%`, background: METHOD_COL[m] }} /></div>
              <b>{fmtPct(y[m] / tot)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DivisionBars({ data }: { data: InfographicsData }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [hov, setHov] = useState<string | null>(null);
  const rows = data.divisions.filter((d) => DIVISION_BY_KEY[d.key] && d.n >= 40).map((d) => ({ ...d, fin: (d.ko + d.sub) / d.n })).sort((a, b) => b.fin - a.fin);
  const top = rows[0]?.fin ?? 1;
  return (
    <div className="ig-card ig-divs" ref={ref}>
      <div className="card-head"><div><h3>Onde as lutas acabam antes</h3><p>Participação de nocautes e finalizações por categoria, desde 2016.</p></div></div>
      <div className="div-list">
        {rows.map((r, i) => (
          <div key={r.key} className={`drow ${hov === r.key ? 'on' : ''}`} onPointerEnter={() => setHov(r.key)} onPointerLeave={() => setHov(null)}>
            <span className="dn">{DIVISION_BY_KEY[r.key].name}</span>
            <div className="dbar"><i className={seen ? 'in' : ''} style={{ width: `${(r.fin / top) * 100}%`, transitionDelay: `${i * 70}ms` }}>
              <u style={{ width: `${(r.ko / (r.ko + r.sub || 1)) * 100}%`, background: METHOD_COL.ko }} /><u style={{ flex: 1, background: METHOD_COL.sub }} />
            </i></div>
            <b>{fmtPct(r.fin)}</b>
            <small>{r.n} lutas · {fmtPct(r.ko / r.n)} KO · {fmtPct(r.sub / r.n)} finalização</small>
          </div>
        ))}
      </div>
      <p className="div-note"><i style={{ background: METHOD_COL.ko }} /> nocautes <i style={{ background: METHOD_COL.sub }} /> finalizações</p>
    </div>
  );
}

/* ============================ 2 · Matriz de estilos (escuro, cores vivas) ============================ */

const SHORT: Record<string, string> = { Trocador: 'Trocador', Wrestler: 'Wrestler', 'Especialista em jiu-jitsu': 'Jiu-jitsu', Grappler: 'Grappler', 'Lutador completo': 'Completo' };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function heat(t: number): string { // 0 = azul, 0.5 = amarelo, 1 = vermelho (como um mapa de calor)
  const stops = [[10, 132, 255], [0, 200, 255], [255, 196, 0], [255, 120, 0], [255, 31, 0]];
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  return `rgb(${stops[i].map((c, k) => Math.round(lerp(c, stops[i + 1][k], f))).join(',')})`;
}

function StyleMatrix({ data }: { data: InfographicsData }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [metric, setMetric] = useState<'win' | 'fin' | 'n'>('win');
  const [div, setDiv] = useState('ALL');
  const [hov, setHov] = useState<[string, string] | null>(null);
  const m = data.matrix[div] ?? {};
  const S = data.styles;
  const val = (r: string, c: string): number | null => {
    const x = m[r]?.[c]; if (!x || x.n < 8) return null;
    if (metric === 'win') return x.w / x.n;
    if (metric === 'fin') return x.w ? (x.ko + x.sub) / x.w : null;
    return Math.log10(x.n + 1) / Math.log10(4000);
  };
  const norm = (v: number) => (metric === 'win' ? 0.5 + (v - 0.5) * 2.4 : metric === 'fin' ? (v - 0.2) / 0.6 : v);
  const fmtV = (v: number) => (metric === 'n' ? '' : fmtPct(v));
  const best = useMemo(() => {
    let b: [string, string, number] | null = null;
    for (const r of S) for (const c of S) { if (r === c) continue; const v = val(r, c); if (v != null && (b == null || v > b[2]) && metric !== 'n') b = [r, c, v]; }
    return b;
  }, [S, m, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = hov ? m[hov[0]]?.[hov[1]] : null;
  const divs = MAIN_DIVISIONS.filter((d) => data.matrix[d.key]);
  return (
    <section id="estilos" className="ig-heat" ref={ref}>
      <div className="container ig-heat-grid">
        <div>
          <span className="ig-tag">BI &amp; ESTILOS</span>
          <h2>Estilos que <span className="grad">pulsam</span> em cores.</h2>
          <p className="ig-lead">Quem leva a melhor quando um estilo encontra outro? Cada célula mostra como o estilo da <b>linha</b> se sai contra o da <b>coluna</b>: do frio (perde mais) ao quente (vence mais).</p>
          <div className="ig-ctrl">
            <div className="seg" role="group" aria-label="Métrica">
              {([['win', 'Vitórias'], ['fin', 'Finalizações'], ['n', 'Nº de lutas']] as const).map(([k, l]) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{l}</button>)}
            </div>
            <select className="select" value={div} onChange={(e) => setDiv(e.target.value)} aria-label="Categoria">
              <option value="ALL">Todas as categorias</option>
              {divs.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </select>
          </div>
          <div className="heat-legend"><i /><span>{metric === 'win' ? 'perde mais → vence mais' : metric === 'fin' ? 'mais decisões → mais finalizações' : 'poucas lutas → muitas lutas'}</span></div>
          <div className="heat-read" aria-live="polite">
            {h && hov ? (
              <>
                <b>{SHORT[hov[0]]} × {SHORT[hov[1]]}</b>
                {hov[0] === hov[1] ? <p>Duelo de espelho: {h.n / 2 | 0} lutas entre dois do mesmo estilo (metade vence, por definição).</p> : <>
                  <p><strong>{fmtPct(h.w / h.n)}</strong> de vitórias em {h.n.toLocaleString('pt-BR')} lutas. Quando {SHORT[hov[0]]} vence, é por <span className="k">nocaute {fmtPct(h.ko / Math.max(1, h.w))}</span>, <span className="s">finalização {fmtPct(h.sub / Math.max(1, h.w))}</span> ou <span className="d">decisão {fmtPct(h.dec / Math.max(1, h.w))}</span>.</p>
                </>}
              </>
            ) : best ? <p>Destaque: <b>{SHORT[best[0]]}</b> contra <b>{SHORT[best[1]]}</b> ({fmtPct(best[2])}). Passe o mouse numa célula para ver os detalhes.</p> : <p>Passe o mouse numa célula.</p>}
          </div>
        </div>
        <div className="heat-panel">
          <div className="heat-hd"><span>Matriz de estilos</span><span className="hint">{div === 'ALL' ? 'todas as categorias' : DIVISION_BY_KEY[div as keyof typeof DIVISION_BY_KEY]?.name} · desde 2016</span></div>
          <div className="heat-table" style={{ ['--n' as string]: S.length }}>
            <div className="rowline hdr"><div />{S.map((c) => <div key={c} className="ch">{SHORT[c]}</div>)}</div>
            {S.map((r, ri) => (
              <div key={r} className="rowline">
                <div className="rh">{SHORT[r]}</div>
                {S.map((c, ci) => {
                  const v = val(r, c);
                  const t = v == null ? null : norm(v);
                  const d = (ri * S.length + ci) * 28;
                  return (
                    <button key={c} className={`hc ${seen ? 'in' : ''} ${hov?.[0] === r && hov?.[1] === c ? 'on' : ''} ${best && best[0] === r && best[1] === c ? 'best' : ''}`}
                      style={{ background: t == null ? '#1b2230' : heat(t), transitionDelay: `${d}ms`, animationDelay: `${d}ms` }}
                      onPointerEnter={() => setHov([r, c])} onFocus={() => setHov([r, c])} onPointerLeave={() => setHov(null)} aria-label={`${SHORT[r]} contra ${SHORT[c]}`}>
                      {v == null ? '—' : metric === 'n' ? (m[r][c].n >= 1000 ? `${(m[r][c].n / 1000).toFixed(1).replace('.', ',')}k` : m[r][c].n) : fmtV(v)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="heat-bar"><span>0%</span><i /><span>100%</span></div>
        </div>
      </div>
      <div className="container"><p className="ig-foot">O estilo de cada lutador é o classificado hoje pela carreira dele no UFC (por isso lutadores com o estilo muito marcante tendem a vencer pelos seus próprios métodos). Lutas desde 2016 entre dois lutadores com estilo definido; células com menos de 8 lutas aparecem vazias.</p></div>
    </section>
  );
}

/* ============================ 3 · O modelo é honesto? (quadro-negro) ============================ */

interface Bin { lo: number; n: number; wins: number; avg: number }
function calibrate(rows: UpsetFight[], from: string, onlyMk: boolean): { bins: Bin[]; total: number; hit: number; conf: number } {
  const bins: Bin[] = Array.from({ length: 10 }, (_, i) => ({ lo: 0.5 + i * 0.05, n: 0, wins: 0, avg: 0 }));
  let total = 0, hit = 0, conf = 0;
  for (const r of rows) {
    if (r.d < from || (onlyMk && !r.mk)) continue;
    const fp = Math.max(r.p, 1 - r.p), won = (r.p >= 0.5) === (r.w === 0);
    const b = bins[Math.min(9, Math.floor((fp - 0.5) / 0.05))];
    b.n++; b.avg += fp; if (won) b.wins++;
    total++; if (won) hit++; conf += fp;
  }
  bins.forEach((b) => { if (b.n) b.avg /= b.n; });
  return { bins, total, hit, conf: total ? conf / total : 0 };
}

function HonestyBoard({ rows }: { rows: UpsetFight[] }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [mode, setMode] = useState<'tudo' | 'mercado'>('tudo');
  const [sel, setSel] = useState<number | null>(null);
  const from = mode === 'tudo' ? '2015-01-01' : '2021-01-01';
  const cal = useMemo(() => calibrate(rows, from, mode === 'mercado'), [rows, from, mode]);
  const bins = cal.bins.filter((b) => b.n >= 8);
  const W = 520, H = 400, L = 56, B = 48, T = 22, R = 18;
  const X = (p: number) => L + ((p - 0.5) / 0.5) * (W - L - R);
  const Y = (p: number) => H - B - ((p - 0.3) / 0.7) * (H - B - T);
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const cur = sel != null ? cal.bins[sel] : null;
  const zebras = useMemo(() => {
    if (sel == null) return [];
    const lo = cal.bins[sel].lo, hi = lo + 0.05;
    return rows.filter((r) => r.d >= from && (mode !== 'mercado' || r.mk) && Math.max(r.p, 1 - r.p) >= lo && Math.max(r.p, 1 - r.p) < hi + (sel === 9 ? 0.01 : 0) && (r.p >= 0.5) !== (r.w === 0))
      .sort((a, b) => Math.max(b.p, 1 - b.p) - Math.max(a.p, 1 - a.p)).slice(0, 3);
  }, [sel, rows, from, mode, cal]);
  const path = bins.map((b, i) => `${i ? 'L' : 'M'}${X(b.avg).toFixed(1)} ${Y(b.wins / b.n).toFixed(1)}`).join(' ');
  const gap = bins.length ? bins.reduce((s, b) => s + Math.abs(b.wins / b.n - b.avg) * b.n, 0) / bins.reduce((s, b) => s + b.n, 0) : 0;
  return (
    <section id="modelo" className="ig-board" ref={ref}>
      <div className="container">
        <div className="board">
          <div className="board-tabs"><i /><i /><i /><span className="eraser" /></div>
          <h2>Aula · Sobre favoritos e zebras</h2>
          <div className="board-sub">Estatística aplicada · professor Dados · turma {from.slice(0, 4)}–2026</div>
          <div className="board-grid">
            <div className="board-fig">
              <svg viewBox={`0 0 ${W} ${H}`} className={seen ? 'in' : ''} role="img" aria-label="Gráfico de calibração: chance prevista contra o que de fato aconteceu">
                <defs><filter id="chalk"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" /></filter></defs>
                <g filter="url(#chalk)" className="chalk">
                  {[0.4, 0.6, 0.8, 1].map((g) => <line key={g} x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} className="grid" />)}
                  <line x1={L} y1={H - B} x2={W - R} y2={H - B} className="axis" /><line x1={L} y1={T} x2={L} y2={H - B} className="axis" />
                  <line x1={X(0.5)} y1={Y(0.5)} x2={X(1)} y2={Y(1)} className="ideal" pathLength={1} />
                  <path d={path} className="curve" pathLength={1} fill="none" />
                  {bins.map((b) => {
                    const idx = cal.bins.indexOf(b);
                    const r = 6 + Math.sqrt(b.n / maxN) * 15;
                    return (
                      <g key={b.lo} className={`dot ${sel === idx ? 'on' : ''}`} onPointerEnter={() => setSel(idx)} onClick={() => setSel(idx)}>
                        <circle cx={X(b.avg)} cy={Y(b.wins / b.n)} r={r + 8} fill="transparent" />
                        <circle cx={X(b.avg)} cy={Y(b.wins / b.n)} r={r} />
                      </g>
                    );
                  })}
                  {cur && cur.n >= 8 && <g><line x1={X(cur.avg)} x2={X(cur.avg)} y1={Y(cur.avg)} y2={Y(cur.wins / cur.n)} className="gapline" /><text x={X(cur.avg) + 12} y={Y(cur.wins / cur.n) - 12} className="note">{Math.round((cur.wins / cur.n) * 100)}% de verdade</text></g>}
                </g>
                <g className="chalk">{[0.4, 0.6, 0.8, 1].map((g) => <text key={g} x={L - 10} y={Y(g) + 4} className="tick" textAnchor="end">{Math.round(g * 100)}%</text>)}{[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((g) => <text key={g} x={X(g)} y={H - B + 22} className="tick" textAnchor="middle">{Math.round(g * 100)}%</text>)}</g>
                <text x={(L + W - R) / 2} y={H - 6} className="lab" textAnchor="middle">o que o modelo previu (favorito)</text>
                <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} className="lab" textAnchor="middle">quanto o favorito venceu</text>
              </svg>
            </div>
            <div className="board-text">
              <p>Um modelo honesto é como um relógio que acerta o fuso: quando diz <i>70%</i>, o favorito vence cerca de <mark>70 em cada 100</mark> lutas. {cal.total.toLocaleString('pt-BR')} lutas depois, o favorito venceu <mark>{fmtPct(cal.hit / Math.max(1, cal.total), 1)}</mark> delas, com confiança média de {fmtPct(cal.conf, 1)}.</p>
              <div className="formula">calibração = vitórias ÷ previsões</div>
              <p>Quanto mais perto da <i>linha tracejada</i>, mais honesto. O erro médio aqui é de <mark>{(gap * 100).toFixed(1).replace('.', ',')} pontos</mark> {gap < 0.03 ? '— uma excelente aula de humildade estatística.' : '.'} Cada <b>bola</b> é uma faixa de confiança; quanto maior, mais lutas.</p>
              <div className="board-ctrl">
                <button className={mode === 'tudo' ? 'on' : ''} onClick={() => { setMode('tudo'); setSel(null); }}>desde 2015 · só estatísticas</button>
                <button className={mode === 'mercado' ? 'on' : ''} onClick={() => { setMode('mercado'); setSel(null); }}>desde 2021 · com mercado</button>
              </div>
              <div className="board-detail" aria-live="polite">
                {cur && cur.n >= 8 ? (
                  <>
                    <p><b>{Math.round(cur.lo * 100)}–{Math.round(cur.lo * 100) + 5}%</b>: {cur.n} lutas, favorito venceu <mark>{fmtPct(cur.wins / cur.n)}</mark> (previsto {fmtPct(cur.avg)}). {cur.n - cur.wins} zebras.</p>
                    {zebras.map((z) => {
                      const fav = z.p >= 0.5 ? z.a : z.b, dog = z.p >= 0.5 ? z.b : z.a;
                      return <div className="zebra" key={z.i}>{z.t ? '🏆 ' : ''}<b>{dog[0]}</b> derrubou <b>{fav[0]}</b> <span>({fmtPct(Math.max(z.p, 1 - z.p))} para o favorito · {fmtDate(z.d)})</span></div>;
                    })}
                  </>
                ) : <p className="hint">TOQUE NUMA BOLA PARA VER AS ZEBRAS DAQUELA FAIXA</p>}
              </div>
              <p className="board-foot">Veja a lista completa em <Link to="/ranking/zebras">zebras e favoritos</Link> e como o modelo funciona em <Link to="/modelo">modelo</Link>.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
