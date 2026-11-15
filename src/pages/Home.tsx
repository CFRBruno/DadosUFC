import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import { FighterCard } from '../components/fighters';
import { Loading } from '../components/ui';
import { useEvents, useFighters, useMeta } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { MAIN_DIVISIONS } from '../shared/divisions';
import type { FighterSummary } from '../shared/types';

function HeroVisual({ count }: { count: number | null }) {
  const oct = (r: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 8) * (2 * i + 1);
      return `${200 + r * Math.cos(a)},${200 + r * Math.sin(a)}`;
    }).join(' ');
  const ticks = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <div className="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ed1c24" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ed1c24" stopOpacity="0" />
          </radialGradient>
          <filter id="blur"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        <circle cx="200" cy="200" r="150" fill="url(#glow)" />
        {ticks.map((a, i) => (
          <line key={i} x1={200 + 178 * Math.cos(a)} y1={200 + 178 * Math.sin(a)} x2={200 + 192 * Math.cos(a)} y2={200 + 192 * Math.sin(a)} stroke="#555" strokeWidth="3" />
        ))}
        <g className="spin-slow"><polygon points={oct(170)} fill="none" stroke="#1d2a3a" strokeWidth="1.5" /></g>
        <g className="spin-rev"><polygon points={oct(150)} fill="none" stroke="#2a2a2a" strokeWidth="1.5" transform="rotate(12 200 200)" /></g>
        <g className="spin-slow"><polygon points={oct(120)} fill="none" stroke="#5c0d10" strokeWidth="1.5" transform="rotate(-18 200 200)" /></g>
        <polygon points={oct(76)} fill="none" stroke="#ed1c24" strokeWidth="6" opacity="0.5" filter="url(#blur)" />
        <polygon points={oct(76)} fill="#050000" stroke="#ed1c24" strokeWidth="2" />
        <circle cx="128" cy="118" r="3" fill="#ed1c24" />
        <text x="200" y="196" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="26" letterSpacing="2">{count ?? '—'}</text>
        <text x="200" y="220" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="11" letterSpacing="3">LUTADORES</text>
      </svg>
    </div>
  );
}

export default function Home() {
  const meta = useMeta().data;
  const fighters = useFighters().data;
  const events = useEvents().data;
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
  const nextEvent = events?.upcoming[0];
  const lastEvent = events?.past[0];

  const topByDivision = useMemo(() => {
    if (!fighters) return [];
    const out: { name: string; f: FighterSummary }[] = [];
    for (const d of MAIN_DIVISIONS) {
      const best = fighters.filter((f) => f.division === d.key && f.record.w + f.record.l >= 3).sort((a, b) => b.elo - a.elo)[0];
      if (best) out.push({ name: d.name, f: best });
    }
    return out;
  }, [fighters]);

  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <span className="tag-box">Temporada 2026</span>
            <h1>
              Os números do UFC
              <span className="accent">Sem Achismo.</span>
            </h1>
            <p className="lead">
              Histórico, estilo de luta, pontos fortes e fracos de todos que pisaram no octógono em 2026 — e um comparador
              que estima quem vence e como, com base em mais de {meta ? (Math.floor(meta.fightCount / 1000) * 1000).toLocaleString('pt-BR') : '8.000'} lutas.
            </p>
            <div className="actions">
              <Link to="/comparar" className="btn btn-primary">Comparar lutadores</Link>
              <Link to="/lutadores" className="btn btn-outline">Ver lutadores</Link>
            </div>
            {meta && (
              <div className="hero-stats">
                <div><b>{meta.fighterCount}</b><span>Lutadores</span></div>
                <div><b>{fmtPct(meta.model.accuracy)}</b><span>Acerto do modelo</span></div>
                <div><b>{meta.fightCount.toLocaleString('pt-BR')}</b><span>Lutas na base</span></div>
              </div>
            )}
          </div>
          <HeroVisual count={meta?.fighterCount ?? null} />
        </div>
      </section>

      <div className="container">
        {!events ? (
          <Loading />
        ) : (
          <>
            <div className="section-title">
              <h2>Próximo evento</h2>
              <Link to="/eventos?ordem=recentes">Todos os eventos →</Link>
            </div>
            {nextEvent ? (
              <div className="panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <div>
                    <div className="eyebrow">{fmtDate(nextEvent.date, true)}</div>
                    <h3 style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{nextEvent.name}</h3>
                    {nextEvent.location && <div className="note">{nextEvent.location}</div>}
                  </div>
                  <Link to={`/evento/${nextEvent.id}`} className="btn btn-ghost">Card completo</Link>
                </div>
                {nextEvent.bouts.slice(0, 5).map((b, i) => (
                  <UpcomingBoutRow key={i} b={b} byId={byId} />
                ))}
              </div>
            ) : (
              <div className="panel note">Nenhum evento futuro carregado ainda.</div>
            )}

            {lastEvent && (
              <>
                <div className="section-title">
                  <h2>Último evento</h2>
                  <Link to={`/evento/${lastEvent.id}`}>Ver resultados →</Link>
                </div>
                <div className="panel">
                  <div className="eyebrow">{fmtDate(lastEvent.date, true)}</div>
                  <h3 style={{ fontSize: 22, fontWeight: 900, margin: '6px 0 16px' }}>{lastEvent.name}</h3>
                  {lastEvent.fights.slice(0, 5).map((f) => (
                    <ResultBoutRow key={f.id} f={f} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {topByDivision.length > 0 && (
          <>
            <div className="section-title">
              <h2>Melhor Elo por categoria</h2>
              <Link to="/ranking">Ranking completo →</Link>
            </div>
            <div className="grid-3">
              {topByDivision.map(({ name, f }) => (
                <div key={name}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>{name}</div>
                  <FighterCard f={f} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
