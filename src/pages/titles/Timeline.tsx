import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '../../styles/timeline.css';
import { ErrorBox, Loading } from '../../components/ui';
import { useJson } from '../../lib/data';
import { REC_DEFS, buildStory, sur, type Reign, type Snap } from '../../lib/titleStory';
import type { TitleDivision, TitleHistory } from '../../shared/titleTypes';

const ORDER = ['FLW', 'BW', 'FW', 'LW', 'WW', 'MW', 'LHW', 'HW', 'WSW', 'WFLW', 'WBW', 'WFW', 'BMF'] as const;
const SHORT: Record<string, string> = {
  FLW: 'Mosca', BW: 'Galo', FW: 'Pena', LW: 'Leve', WW: 'Meio-Médio', MW: 'Médio', LHW: 'Meio-Pesado', HW: 'Pesado',
  WSW: 'Palha (F)', WFLW: 'Mosca (F)', WBW: 'Galo (F)', WFW: 'Pena (F)', BMF: 'BMF',
};
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fdate = (d: string) => `${+d.slice(8, 10)} ${MES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const yr = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12 + (+d.slice(8, 10) - 1) / 365;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const today = new Date().toISOString().slice(0, 10);
const fmtRec = (k: string, v: number) => (k === 'sub' || k === 'ko' ? mmss(v) : v.toLocaleString('pt-BR'));

export default function Timeline() {
  const { data, error } = useJson<TitleHistory>('title-history.json');
  const [params, setParams] = useSearchParams();
  const sel = params.get('peso');
  const storyRef = useRef<HTMLDivElement>(null);
  const stories = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(ORDER.filter((k) => data.divisions[k]).map((k) => [k, buildStory(data.divisions[k], today)]));
  }, [data]);

  const pick = (k: string) => {
    const p = new URLSearchParams(params);
    p.set('peso', k);
    setParams(p, { replace: true });
    setTimeout(() => storyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  if (error) return <ErrorBox message={error} />;
  if (!data || !stories) return <Loading />;
  return (
    <div className="tl-a2">
      <Overview stories={stories} onPick={pick} sel={sel} />
      <div ref={storyRef} style={{ scrollMarginTop: 64 }}>
        {sel && stories[sel] ? (
          <Story key={sel} k={sel} div={data.divisions[sel]} snaps={stories[sel].snaps} photos={data.photos} />
        ) : (
          <div className="tl-pickhint">Escolha um peso acima para abrir a história do cinturão.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- visão geral
function Overview({ stories, onPick, sel }: { stories: Record<string, { reigns: Reign[] }>; onPick: (k: string) => void; sel: string | null }) {
  const [inView, setInView] = useState(false);
  const [hover, setHover] = useState<{ k: string; r: Reign } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const t = setTimeout(() => setInView(true), 120);
    let raf = 0;
    const loop = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.18;
      pos.current.y += (target.current.y - pos.current.y) * 0.18;
      if (tip.current) tip.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);
  const Y0 = 1997, Y1 = 2027.2;
  const pct = (d: string) => ((Math.min(Y1, yr(d)) - Y0) / (Y1 - Y0)) * 100;
  return (
    <section className="tl-ov">
      <div className="tl-k">Linha do tempo dos cinturões · 1997 → hoje</div>
      <h2 className="tl-ovh">Quem reinou em <em>cada peso</em></h2>
      <p className="tl-ovs">Cada faixa é um reinado; o número, as defesas. Passe o mouse para ver; clique para abrir a história.</p>
      <div className="tl-scroll">
        <div
          className={`tl-lanes ${inView ? 'in' : ''}`}
          ref={wrap}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const box = wrap.current!.getBoundingClientRect();
            target.current = { x: Math.min(e.clientX - box.left + 18, box.width - 300), y: e.clientY - box.top + 18 };
            if (!hover) pos.current = { ...target.current };
          }}
        >
          {ORDER.filter((k) => stories[k]).map((k, i) => (
            <div key={k} className={`tl-lane ${hover && hover.k !== k ? 'dim' : ''} ${sel === k ? 'sel' : ''}`} onClick={() => onPick(k)}>
              <button className="tl-lname" onClick={() => onPick(k)}>{SHORT[k]}</button>
              <div className="tl-ltrack">
                {stories[k].reigns.map((r, j) => (
                  <div
                    key={j}
                    className={`tl-seg ${j % 2 ? 'alt' : ''} ${hover?.r === r ? 'on' : ''}`}
                    style={{ left: `${pct(r.start)}%`, width: `${Math.max(0.35, pct(r.end) - pct(r.start))}%`, transitionDelay: `${i * 60 + j * 25}ms` }}
                    onPointerEnter={() => setHover({ k, r })}
                  >
                    <span>{sur(r.name)}{r.def ? <b> {r.def}</b> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="tl-axis">
            {[2000, 2005, 2010, 2015, 2020, 2025].map((y) => <span key={y} style={{ left: `${((y - Y0) / (Y1 - Y0)) * 100}%` }}>{y}</span>)}
          </div>
          <div className={`tl-tip ${hover ? 'show' : ''}`} ref={tip}>
            {hover && (
              <>
                <div className="tl-k">{SHORT[hover.k]} · {hover.r.start.slice(0, 4)} → {hover.r.ongoing ? 'hoje' : hover.r.end.slice(0, 4)}</div>
                <div className="tl-tipn">{hover.r.name}</div>
                <div className="tl-tips">
                  {hover.r.def} defesa{hover.r.def === 1 ? '' : 's'} · {hover.r.days.toLocaleString('pt-BR')} dias
                  {hover.r.ongoing ? ' · atual' : hover.r.endKind === 'vacated' ? ' · deixou vago' : ' · perdeu o cinturão'}
                </div>
                <Pips n={hover.r.def} />
                <div className="tl-tiph">Clique para abrir a história →</div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Pips({ n }: { n: number }) {
  const total = Math.max(5, n + 1);
  return <div className="tl-pips">{Array.from({ length: total }, (_, i) => <i key={i} className={i < n ? 'on' : ''} style={{ transitionDelay: `${i * 50}ms` }} />)}</div>;
}

// ---------------------------------------------------------------- modo história
function useCount(value: number, dur = 850) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(start + (value - start) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, dur]);
  return v;
}

function Story({ k, div, snaps, photos }: { k: string; div: TitleDivision; snaps: Snap[]; photos: Record<string, string> }) {
  const outer = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = outer.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
      setI(Math.min(snaps.length - 1, Math.floor(p * snaps.length)));
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, [snaps.length]);
  const goTo = (j: number) => {
    const el = outer.current!;
    const total = el.offsetHeight - innerHeight;
    scrollTo({ top: el.getBoundingClientRect().top + scrollY + ((j + 0.5) / snaps.length) * total, behavior: 'smooth' });
  };
  const pending = useRef<number | null>(null);
  const iRef = useRef(0);
  iRef.current = i;
  useEffect(() => { if (pending.current === i) pending.current = null; }, [i]);
  const step = (d: number) => {
    const base = pending.current ?? iRef.current;
    const t = Math.min(snaps.length - 1, Math.max(0, base + d));
    if (t === base) return;
    pending.current = t;
    goTo(t);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (/^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable)) return;
      const r = outer.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > innerHeight * 0.6) return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps.length]);
  const s = snaps[i];
  const def = useCount(s.def);
  const days = useCount(s.reignDays);
  const photo = s.champ ? photos[s.champ] ?? null : null;

  return (
    <section className="tl-story" ref={outer} style={{ height: `${snaps.length * 60 + 100}vh` }} data-kind={s.kind}>
      <div className="tl-stage">
        <div className="tl-year" aria-hidden="true">{s.date.slice(0, 4)}</div>
        <div className="tl-sthead">
          <h2 className="tl-sttitle">{div.name}</h2>
          <div className="tl-nav">
            <button onClick={() => step(-1)} disabled={i === 0} aria-label="Capítulo anterior">‹</button>
            <div className="tl-k">Capítulo {i + 1} de {snaps.length}</div>
            <button onClick={() => step(1)} disabled={i === snaps.length - 1} aria-label="Próximo capítulo">›</button>
          </div>
        </div>
        <Track snaps={snaps} cur={i} onPick={goTo} />
        <div className="tl-grid">
          <div className="tl-col-a">
            <div className="tl-k">{s.kicker}{s.broken.length ? ' · novo recorde' : ''}</div>
            <Headline key={i} html={s.headline} />
            <p className="tl-subl">{subline(s)}</p>
            {s.fight?.interimReason && (
              <div className="tl-reason" key={`r${i}`}>
                <b>Por que um interino?</b> {s.fight.interimReason.text}
                {s.fight.interimReason.source === 'dados' && <span className="tl-src"> (pelos dados)</span>}
              </div>
            )}
            <Score s={s} key={`s${i}`} />
          </div>
          <div className="tl-col-b">
            <div className="tl-photobox">
              <Photo src={photo} />
              <div className={`tl-stamp ${s.kind === 'vacancy' && !s.champ ? 'show' : ''}`}>{s.note?.interimOnly ? 'INTERINO VAGO' : 'VAGO'}</div>
            </div>
            <div className="tl-ccard">
              <div className="tl-lbl">{s.champ ? (div.women ? 'Campeã' : 'Campeão') : 'Cinturão vago'}</div>
              <div className="tl-cname">
                {s.champ ? <FighterLink name={s.champ} snaps={snaps} /> : s.prevChamp ? `antes: ${s.prevChamp}` : '—'}
              </div>
              <div className="tl-nums">
                <div><div className="tl-big">{def}</div><div className="tl-lbl">defesas</div></div>
                <div><div className="tl-big">{days.toLocaleString('pt-BR')}</div><div className="tl-lbl">dias de reinado</div></div>
              </div>
              <Pips n={s.def} />
              {s.interimChamp && <div className="tl-chip">{div.women ? 'Interina' : 'Interino'}: {s.interimChamp}</div>}
            </div>
          </div>
          <div className="tl-col-c">
            <div className="tl-rtitle">Recordes {k === 'BMF' ? 'do BMF' : `do ${div.name.toLowerCase().replace('peso ', 'peso-')}`}</div>
            <ul className="tl-recs">
              {REC_DEFS.map((d) => {
                const r = s.rec[d.k];
                const isNew = s.broken.includes(d.k);
                const chase = d.k === 'reign' && r && s.champ && r.who !== s.champ && s.reignDays > r.value * 0.6
                  ? `${s.champ} está a ${(r.value - s.reignDays).toLocaleString('pt-BR')} dias` : '';
                return (
                  <li key={d.k} className={isNew ? 'isnew' : ''}>
                    <div className="tl-rk">{d.label}{isNew && <span className="tl-new">novo</span>}</div>
                    {r ? (
                      <>
                        <div className="tl-rv"><b>{fmtRec(d.k, r.value)}{d.unit ?? ''}</b> <span>{r.who}</span></div>
                        {r.prev.length > 0 && <div className="tl-old">{r.prev.map((p, j) => <s key={j}>{p.who} · {fmtRec(d.k, p.value)}{d.unit ?? ''}</s>)}</div>}
                        {chase && <div className="tl-chase">{chase}</div>}
                      </>
                    ) : <div className="tl-rv"><b>—</b></div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="tl-hint">← → setas do teclado, ou role · passe o mouse no trilho · clique numa luta para pular</div>
      </div>
    </section>
  );
}

function subline(s: Snap): string {
  if (s.kind === 'upcoming') return `Próxima luta valendo o cinturão · ${s.upcoming!.event}`;
  if (s.note) return `${s.note.dateLabel ?? fdate(s.date)} · ${s.note.reason}`;
  const c = s.fight!;
  const m = c.result === 'NC' ? 'Sem resultado' : c.result === 'D' ? 'Empate' : c.method === 'KO' ? 'Nocaute' : c.method === 'SUB' ? 'Finalização' : c.method === 'DEC' ? `Decisão ${c.decision === 'S' ? 'dividida' : c.decision === 'M' ? 'majoritária' : 'unânime'}` : c.method === 'DQ' ? 'Desclassificação' : 'Outro';
  return `${m}${c.detail ? ` (${c.detail})` : ''} · R${c.round} ${c.time} · ${c.event} · ${fdate(c.date)}`;
}

function FighterLink({ name, snaps }: { name: string; snaps: Snap[] }) {
  const ref = snaps.find((x) => x.fight && (x.fight.a.name === name || x.fight.b.name === name))?.fight;
  const slug = ref ? (ref.a.name === name ? ref.a.slug : ref.b.slug) : null;
  return slug ? <Link to={`/lutador/${slug}`}>{name}</Link> : <>{name}</>;
}

function Headline({ html }: { html: string }) {
  const parts: { t: string; em: boolean }[] = [];
  html.replace(/<em>(.*?)<\/em>|([^\s<]+)/g, (_m, em, w) => { parts.push({ t: em ?? w, em: !!em }); return ''; });
  return (
    <h3 className="tl-headl">
      {parts.map((p, j) => (
        <span key={j} className={`w ${p.em ? 'em' : ''}`} style={{ ['--i' as string]: j }}><span>{p.t}</span>{' '}</span>
      ))}
    </h3>
  );
}

function Photo({ src }: { src: string | null }) {
  const [shown, setShown] = useState(src);
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (src === shown) return;
    setSwap(true);
    const t = setTimeout(() => { setShown(src); setSwap(false); }, 260);
    return () => clearTimeout(t);
  }, [src, shown]);
  return <div className={`tl-photo ${swap ? 'swap' : ''} ${shown ? '' : 'empty'}`} style={shown ? { backgroundImage: `url("${shown}")` } : undefined} />;
}

function Score({ s }: { s: Snap }) {
  const c = s.fight;
  if (!c || !c.sa || !c.sb) {
    return <div className="tl-score"><div className="tl-scempty">{s.kind === 'fight' ? 'Sem estatísticas detalhadas desta luta.' : s.kind === 'upcoming' ? 'Luta ainda não aconteceu.' : 'Sem luta neste capítulo.'}</div></div>;
  }
  const A = c.sa, B = c.sb;
  const rows: [string, number, number, (v: number) => string][] = [
    ['Golpes significativos', A.sig, B.sig, String], ['Knockdowns', A.kd, B.kd, String], ['Quedas', A.td, B.td, String],
    ['Controle', A.ctrl, B.ctrl, mmss], ['Finalizações tentadas', A.sub, B.sub, String],
  ];
  return (
    <div className="tl-score in">
      <div className="tl-schead">
        <span className="a">{c.a.slug ? <Link to={`/lutador/${c.a.slug}`}>{c.a.name}</Link> : c.a.name}</span>
        <span className="tl-lbl">Scorecard</span>
        <span className="b">{c.b.slug ? <Link to={`/lutador/${c.b.slug}`}>{c.b.name}</Link> : c.b.name}</span>
      </div>
      {rows.map(([lab, a, b, f], j) => {
        const t = a + b || 1;
        return (
          <div className="tl-scrow" key={lab}>
            <span className="sv a">{f(a)}</span>
            <div>
              <div className="tl-scl">{lab}</div>
              <div className="tl-scbar"><i className="ba" style={{ ['--w' as string]: `${(a / t) * 100}%`, transitionDelay: `${j * 70}ms` }} /><i className="bb" style={{ ['--w' as string]: `${(b / t) * 100}%`, transitionDelay: `${j * 70}ms` }} /></div>
            </div>
            <span className="sv b">{f(b)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- trilho
function Track({ snaps, cur, onPick }: { snaps: Snap[]; cur: number; onPick: (i: number) => void }) {
  const [hov, setHov] = useState<{ i: number; x: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 1300, X0 = 30, X1 = 1270, MAINY = 74, INTY = 42;
  const real = snaps.filter((s) => s.kind !== 'upcoming');
  const T0 = Math.floor(yr(real[0]?.date ?? '2000-01-01')), T1 = Math.max(yr(today), yr(real[real.length - 1]?.date ?? today)) + 0.3;
  const X = (d: string) => X0 + ((yr(d) - T0) / (T1 - T0)) * (X1 - X0);
  const PLEN = X1 - X0;
  const curX = X(snaps[cur].date);
  const focusName = hov != null ? nameOf(snaps[hov.i]) : null;

  // ramos interinos: da conquista até a unificação/vacância
  const branches: { x1: number; x2: number }[] = [];
  snaps.forEach((s, i) => {
    if (!(s.fight?.interim && s.fight.result === 'W' && s.kicker === 'CINTURÃO INTERINO')) return;
    const w = s.fight.a.name;
    const end = snaps.slice(i + 1).find((n) => (n.fight && !n.fight.interim && (n.fight.a.name === w || n.fight.b.name === w)) || (n.note && (n.note.promote === w || n.note.alsoInterim || n.note.interimOnly)));
    branches.push({ x1: X(s.date), x2: end ? X(end.date) : X1 });
  });
  const vacs: { x1: number; x2: number }[] = [];
  snaps.forEach((s, i) => {
    if (s.kind !== 'vacancy' || s.champ) return;
    const next = snaps.slice(i + 1).find((n) => n.champ);
    vacs.push({ x1: X(s.date), x2: next ? X(next.date) : X1 });
  });
  // rótulos de campeões (duas linhas para evitar sobreposição)
  const labels: { x: number; row: number; t: string }[] = [];
  const lastEnd = [-1e9, -1e9, -1e9];
  snaps.forEach((s, i) => {
    const prev = snaps[i - 1];
    if (!s.champ || (prev && prev.champ === s.champ)) return;
    const t = s.champ;
    const x = X(s.date);
    const w = t.length * 6.6 + 12;
    const row = x > lastEnd[0] ? 0 : x > lastEnd[1] ? 1 : x > lastEnd[2] ? 2 : -1;
    if (row < 0) return;
    lastEnd[row] = x + w;
    labels.push({ x, row, t });
  });
  const years: number[] = [];
  for (let y = Math.ceil(T0 / 4) * 4; y <= T1; y += 4) years.push(y);

  return (
    <div className="tl-trackwrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} 138`} className={`tl-track ${focusName ? 'focus' : ''}`} onPointerLeave={() => setHov(null)}>
        {years.map((y) => <text key={y} x={X(`${y}-01-01`)} y={12} className="ty" textAnchor="middle">{y}</text>)}
        <line x1={X0} x2={X1} y1={MAINY} y2={MAINY} className="rail" />
        {vacs.map((v, j) => <line key={j} x1={v.x1} x2={v.x2} y1={MAINY} y2={MAINY} className="vacant" />)}
        <line x1={X0} x2={X1} y1={MAINY} y2={MAINY} className="prog" strokeDasharray={PLEN} style={{ strokeDashoffset: PLEN - (curX - X0) }} />
        {branches.map((b, j) => (
          <path key={j} className="branch" d={`M${b.x1 - 26},${MAINY} C${b.x1 - 10},${MAINY} ${b.x1 - 14},${INTY} ${b.x1},${INTY} L${b.x2 - 14},${INTY} C${b.x2 - 4},${INTY} ${b.x2 - 6},${MAINY} ${b.x2},${MAINY}`} />
        ))}
        {snaps.map((s, j) => {
          if (s.kind === 'upcoming') return null;
          const x = X(s.date);
          const cls = `st ${j <= cur ? 'past' : ''} ${j === cur ? 'now' : ''} ${focusName && nameOf(s) === focusName ? 'hl' : ''}`;
          const ev = { onPointerEnter: () => setHov({ i: j, x }), onClick: () => onPick(j) };
          if (s.note) {
            return <path key={j} className={`${cls} vac`} d={`M${x},${MAINY - 7} L${x + 7},${MAINY} L${x},${MAINY + 7} L${x - 7},${MAINY} Z`} {...ev} />;
          }
          const y = s.fight?.interim ? INTY : MAINY;
          return <circle key={j} cx={x} cy={y} r={s.fight?.interim ? 5 : 6.5} className={`${cls} ${s.fight?.interim ? 'int' : ''}`} {...ev} />;
        })}
        {labels.map((l, j) => <text key={j} x={l.x} y={106 + l.row * 14} className="tlab">{l.t}</text>)}
        <line x1={0} x2={0} y1={24} y2={96} className="cursor" style={{ transform: `translateX(${curX}px)` }} />
      </svg>
      {hov && (
        <div className="tl-ttip" style={{ left: `${(hov.x / W) * 100}%` }}>
          <b>{tipTitle(snaps[hov.i])}</b>
          <span>{snaps[hov.i].dateLabel ?? fdate(snaps[hov.i].date)}{snaps[hov.i].fight ? ` · ${snaps[hov.i].fight!.event}` : ''}</span>
        </div>
      )}
    </div>
  );
}

const nameOf = (s: Snap) => (s.fight ? s.fight.a.name : s.note?.who ?? '');
function tipTitle(s: Snap) {
  if (s.note) return s.note.kind === 'promotion' ? `${s.note.who}: primeiro cinturão da categoria` : s.note.kind === 'note' ? 'Reviravolta' : `Cinturão vago · ${s.note.who}`;
  const c = s.fight!;
  return c.result === 'W' ? `${c.a.name} vence ${c.b.name}${c.interim ? ' (interino)' : ''}` : `${c.a.name} × ${c.b.name} · ${c.result === 'D' ? 'empate' : 'sem resultado'}`;
}
