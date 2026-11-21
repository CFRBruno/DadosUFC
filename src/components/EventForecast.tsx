import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyze, shortName, type Analysis } from '../lib/compare';
import { loadJson, useModel } from '../lib/data';
import { divisionName, fmtPct } from '../lib/format';
import type { EventInfo, FighterDetail, FighterSummary, UpcomingBout } from '../shared/types';
import ConfidenceBadge from './ConfidenceBadge';
import { SegGroups, compareUrl } from './events';
import { Avatar, FighterFlag, LiveStrip, Loading, ProspectTag } from './ui';
import { liveOf, pairKey, useLive } from '../lib/live';

const M_PT = { KO: 'KO/TKO', SUB: 'finalização', DEC: 'decisão' } as const;

interface Row { b: UpcomingBout; A: FighterDetail | null; B: FighterDetail | null; an: Analysis | null }

/** Previsão de cada luta do card (estatísticas, mercado e combinada), calculada no navegador. */
export default function EventForecast({ ev, byId }: { ev: EventInfo; byId: Map<string, FighterSummary> }) {
  const model = useModel().data;
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!model) return;
    let alive = true;
    const get = (slug: string | null) => (slug ? loadJson<FighterDetail>(`fighters/${slug}.json`).catch(() => null) : Promise.resolve(null));
    Promise.all(ev.bouts.map(async (b) => {
      const [A, B] = await Promise.all([get(b.a.slug), get(b.b.slug)]);
      const when = b.date ?? ev.date ?? new Date().toISOString().slice(0, 10);
      const an = A && B ? analyze(A, B, model, { rounds: b.rounds, division: b.division, date: when, market: b.mk ?? null }) : null;
      return { b, A, B, an } as Row;
    })).then((r) => alive && setRows(r));
    return () => { alive = false; };
  }, [ev, model]);

  const liveSnap = useLive();
  if (!rows) return <Loading label="Calculando as previsões do card…" />;
  return (
    <div className="forecast">
      <SegGroups items={rows} seg={(r) => r.b.seg} render={({ b, an }, i) => {
        const fa = b.a.id ? byId.get(b.a.id) : undefined, fb = b.b.id ? byId.get(b.b.id) : undefined;
        const label = b.order === 0 ? 'Luta principal' : b.title ? 'Cinturão' : null;
        return (
          <div className="fc-card" key={i} data-bout={pairKey(b.a.name, b.b.name)}>
            <LiveStrip live={liveOf(liveSnap, b.eventId, b.a.name, b.b.name)} />
            <div className="bout-meta">
              <span>{label && <span style={{ color: 'var(--brand)' }}>{label} · </span>}{divisionName(b.division, true)} · {b.rounds} rounds</span>
            </div>
            <div className="fc-main">
              <div className="fc-side"><Avatar name={b.a.name} id={b.a.id} size="sm" side="a" /><div><b><FighterFlag id={b.a.id} slug={b.a.slug} />{b.a.name}<ProspectTag id={b.a.id} /></b><small>{fa ? `${fa.record.w}-${fa.record.l}-${fa.record.d}` : 'Estreia'}</small></div></div>
              <div className="fc-pct">
                {an ? (
                  <>
                    <div className="fc-nums"><b className="fa">{fmtPct(an.pA)}</b><i>×</i><b className="fb">{fmtPct(1 - an.pA)}</b></div>
                    <div className="read-bar"><i style={{ width: `${an.pA * 100}%` }} /></div>
                  </>
                ) : <small>sem dados suficientes</small>}
              </div>
              <div className="fc-side right"><Avatar name={b.b.name} id={b.b.id} size="sm" side="b" /><div><b><FighterFlag id={b.b.id} slug={b.b.slug} />{b.b.name}<ProspectTag id={b.b.id} /></b><small>{fb ? `${fb.record.w}-${fb.record.l}-${fb.record.d}` : 'Estreia'}</small></div></div>
            </div>
            {an && (
              <div className="fc-foot">
                <span className="fc-conf"><ConfidenceBadge c={an.confidence} /></span>
                <span><em>Mais provável:</em> <b className={an.mostLikely.side === 'A' ? 'fa' : 'fb'}>{shortName(an.mostLikely.side === 'A' ? b.a.name : b.b.name)} por {M_PT[an.mostLikely.method]}</b> ({fmtPct(an.mostLikely.p)})</span>
                {an.usesMarket && an.pMarket != null ? (
                  <span className="fc-reads">
                    <em>Estatísticas</em> {fmtPct(Math.max(an.pStats, 1 - an.pStats))} {an.pStats >= 0.5 ? shortName(b.a.name) : shortName(b.b.name)}
                    {' · '}<em>Mercado</em> {fmtPct(Math.max(an.pMarket, 1 - an.pMarket))} {an.pMarket >= 0.5 ? shortName(b.a.name) : shortName(b.b.name)}
                  </span>
                ) : <span className="fc-reads"><em>Só estatísticas</em> (sem linha de mercado ainda)</span>}
                {b.a.slug && b.b.slug && <Link to={compareUrl(b)} className="btn btn-primary btn-sm analyze-btn">Analisar</Link>}
              </div>
            )}
          </div>
        );
      }} />
    </div>
  );
}
