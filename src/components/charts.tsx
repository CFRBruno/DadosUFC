import { useMemo, useRef, useState } from 'react';
import type { FightEntry, MethodBreakdown } from '../shared/types';
import { fmtDate, fmtPct } from '../lib/format';
import { Icon } from './ui';
import { BODY_BODY, BODY_HEAD, BODY_LEG, BODY_NEUTRAL } from './bodyShape';

// ---------------------------------------------------------------------------
// Barra de comparação A × B (estilo "cartel" da referência)
// ---------------------------------------------------------------------------
export function CmpBar({
  label, a, b, fmt, higherIsBetter = true, hint,
}: {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  fmt: (n: number) => string;
  higherIsBetter?: boolean | null;
  hint?: string;
}) {
  const va = a ?? null;
  const vb = b ?? null;
  const total = Math.abs(va ?? 0) + Math.abs(vb ?? 0);
  const share = total > 0 ? Math.abs(va ?? 0) / total : 0.5;
  let lead: 'a' | 'b' | null = null;
  if (va != null && vb != null && va !== vb && higherIsBetter != null) {
    lead = (va > vb) === higherIsBetter ? 'a' : 'b';
  }
  const arrow = (side: 'a' | 'b') =>
    lead == null ? null : <Icon name={lead === side ? 'up' : 'down'} className="arrow" />;
  return (
    <div className="cmp-row">
      <div className="cmp-head">
        <span className={`v ${lead === 'a' ? 'lead' : lead ? 'trail' : ''}`}>
          {arrow('a')}
          {va == null ? '—' : fmt(va)}
        </span>
        <span className="lbl" title={hint}>{label}</span>
        <span className={`v right ${lead === 'b' ? 'lead' : lead ? 'trail' : ''}`}>
          {vb == null ? '—' : fmt(vb)}
          {arrow('b')}
        </span>
      </div>
      <div className="cmp-bar" aria-hidden="true">
        <i className={lead === 'b' ? 'dim' : ''} style={{ width: `${share * 100}%` }} />
        <i className={lead === 'a' ? 'dim' : ''} style={{ width: `${(1 - share) * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Silhueta com distribuição de golpes (cabeça / corpo / pernas)
// ---------------------------------------------------------------------------
export function BodyMap({
  head, body, leg, color, title,
}: { head: number; body: number; leg: number; color: string; title?: string }) {
  const t = head + body + leg;
  const s = t ? { head: head / t, body: body / t, leg: leg / t } : { head: 0, body: 0, leg: 0 };
  const max = Math.max(s.head, s.body, s.leg) || 1;
  // intensidade em 5 níveis, relativa à região mais atingida
  const LEVELS = [0.18, 0.32, 0.5, 0.72, 1];
  const level = (v: number) => (t ? Math.max(0, Math.ceil((v / max) * 5) - 1) : 0);
  const op = (v: number) => LEVELS[level(v)];
  const region = (pts: string[], v: number) =>
    pts.map((p, i) => <polygon key={i} points={p} style={{ fill: color, fillOpacity: op(v) }} />);
  return (
    <div className="body-map">
      <svg viewBox="0 0 100 200" role="img" aria-label={`${title ?? 'Distribuição de golpes'}: cabeça ${fmtPct(s.head)}, corpo ${fmtPct(s.body)}, pernas ${fmtPct(s.leg)}`}>
        {BODY_NEUTRAL.map((p, i) => <polygon key={i} points={p} fill="#1c1c20" />)}
        {region(BODY_HEAD, s.head)}
        {region(BODY_BODY, s.body)}
        {region(BODY_LEG, s.leg)}
      </svg>
      <div>
        <ul>
          <li><i style={{ background: color, opacity: op(s.head) }} /><b>{fmtPct(s.head)}</b> cabeça</li>
          <li><i style={{ background: color, opacity: op(s.body) }} /><b>{fmtPct(s.body)}</b> corpo</li>
          <li><i style={{ background: color, opacity: op(s.leg) }} /><b>{fmtPct(s.leg)}</b> pernas</li>
        </ul>
        <div className="intensity" aria-hidden="true">
          <span>Intensidade</span>
          {LEVELS.map((o) => <i key={o} style={{ background: color, opacity: o }} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontais simples (posição dos golpes etc.)
// ---------------------------------------------------------------------------
export function SimpleBars({ rows, color }: { rows: { label: string; value: number }[]; color: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div className="pos-bars">
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span>{r.label}</span>
          <div className="bar"><i style={{ width: `${(r.value / total) * 100}%`, background: color }} /></div>
          <b>{fmtPct(r.value / total)}</b>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Métodos de vitória / derrota (barra empilhada + rounds)
// ---------------------------------------------------------------------------
const METHOD_COLORS = { KO: 'var(--ko)', SUB: 'var(--sub)', DEC: 'var(--dec)', OTHER: '#6b7280' } as const;
const METHOD_NAMES = { KO: 'KO/TKO', SUB: 'Finalização', DEC: 'Decisão', OTHER: 'Outros' } as const;

export function MethodLegend() {
  return (
    <div className="legend">
      {(['KO', 'SUB', 'DEC'] as const).map((k) => (
        <span key={k}><i style={{ background: METHOD_COLORS[k] }} />{METHOD_NAMES[k]}</span>
      ))}
    </div>
  );
}

export function MethodBlock({ title, mb }: { title: string; mb: MethodBreakdown }) {
  const keys = (['KO', 'SUB', 'DEC', 'OTHER'] as const).filter((k) => mb[k].n > 0);
  const total = keys.reduce((s, k) => s + mb[k].n, 0);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span className="note">{total} no UFC</span>
      </div>
      {total === 0 ? (
        <div className="note">Nenhuma.</div>
      ) : (
        <>
          <div className="stack-bar" role="img" aria-label={keys.map((k) => `${METHOD_NAMES[k]}: ${mb[k].n}`).join(', ')}>
            {keys.map((k) => (
              <i key={k} style={{ width: `${(mb[k].n / total) * 100}%`, background: METHOD_COLORS[k] }} title={`${METHOD_NAMES[k]}: ${mb[k].n}`}>
                {mb[k].n / total >= 0.12 ? mb[k].n : ''}
              </i>
            ))}
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="mini-table">
              <thead>
                <tr><th>Método</th><th>Total</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>R5</th></tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: METHOD_COLORS[k], marginRight: 8 }} />{METHOD_NAMES[k]}</td>
                    <td><b>{mb[k].n}</b> <span className="muted">({fmtPct(mb[k].n / total)})</span></td>
                    {mb[k].byRound.map((n, i) => <td key={i} className={n ? '' : 'muted'}>{k === 'DEC' ? (n ? n : '—') : n}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evolução do Elo (linha com crosshair + tooltip)
// ---------------------------------------------------------------------------
export function EloChart({ history, fights }: { history: [string, number][]; fights: FightEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, pl = 44, pr = 14, pt = 14, pb = 26;
  const byDate = useMemo(() => {
    const asc = [...fights].reverse();
    return asc;
  }, [fights]);
  if (history.length < 2) return <div className="note">Poucas lutas para mostrar a evolução.</div>;
  const ys = history.map((h) => h[1]);
  const min = Math.floor((Math.min(...ys, 1500) - 20) / 50) * 50;
  const max = Math.ceil((Math.max(...ys, 1500) + 20) / 50) * 50;
  const t0 = Date.parse(history[0][0]);
  const t1 = Date.parse(history[history.length - 1][0]);
  const x = (d: string) => pl + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const path = history.map((h, i) => `${i ? 'L' : 'M'}${x(h[0]).toFixed(1)},${y(h[1]).toFixed(1)}`).join('');
  const ticks: number[] = [];
  const step = max - min > 400 ? 100 : 50;
  for (let v = min; v <= max; v += step) ticks.push(v);
  const years: number[] = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) years.push(yr);
  const yearStep = Math.ceil(years.length / 8);

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    history.forEach((h, i) => {
      const d = Math.abs(x(h[0]) - px);
      if (d < bd) { bd = d; best = i; }
    });
    setHover(best);
  };
  const hf = hover != null ? byDate[hover] : null;
  const hp = hover != null ? history[hover] : null;
  return (
    <div className="chart-wrap" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Evolução do rating Elo">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={v === 1500 ? '#3a3a3a' : '#1f1f1f'} strokeDasharray={v === 1500 ? '4 4' : undefined} />
            <text x={pl - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7c7c82">{v}</text>
          </g>
        ))}
        {years.filter((_, i) => i % yearStep === 0).map((yr) => {
          const xx = x(`${yr}-01-01`);
          return <text key={yr} x={xx} y={H - 6} textAnchor="middle" fontSize="11" fill="#7c7c82">{yr}</text>;
        })}
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
        {history.map((h, i) => {
          const f = byDate[i];
          const c = f?.result === 'W' ? 'var(--win)' : f?.result === 'L' ? 'var(--loss)' : '#a1a1aa';
          return <circle key={i} cx={x(h[0])} cy={y(h[1])} r={hover === i ? 5.5 : 3.5} fill={c} stroke="var(--surface)" strokeWidth="2" />;
        })}
        {hp && <line x1={x(hp[0])} x2={x(hp[0])} y1={pt} y2={H - pb} stroke="#555" strokeDasharray="3 3" />}
        <rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} fill="transparent" />
      </svg>
      {hp && hf && (
        <div className="chart-tip" style={{ left: `clamp(0px, calc(${(x(hp[0]) / W) * 100}% - 80px), calc(100% - 170px))`, top: 0 }}>
          <div className="note">{fmtDate(hp[0])}</div>
          <b className="tabular">Elo {hp[1]}</b>
          <div style={{ marginTop: 4 }}>
            {hf.result === 'W' ? 'Venceu' : hf.result === 'L' ? 'Perdeu para' : hf.result === 'D' ? 'Empatou com' : 'Sem resultado vs.'} {hf.result === 'W' ? hf.opponent.name : hf.result === 'L' ? hf.opponent.name : hf.opponent.name}
          </div>
        </div>
      )}
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i style={{ background: 'var(--win)', borderRadius: '50%' }} />Vitória</span>
        <span><i style={{ background: 'var(--loss)', borderRadius: '50%' }} />Derrota</span>
        <span className="note">Linha tracejada = 1500 (rating inicial)</span>
      </div>
    </div>
  );
}
