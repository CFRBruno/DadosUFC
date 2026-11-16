import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import { FighterCard } from '../components/fighters';
import HeroFX from '../components/HeroFX';
import { CountUp, Loading } from '../components/ui';
import { useEvents, useFighters, useMeta } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { MAIN_DIVISIONS } from '../shared/divisions';
import type { FighterSummary } from '../shared/types';

function HeroVisual({ count }: { count: number | null }) {
  const [k, setK] = useState(0);
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
        <g data-depth="10"><circle cx="200" cy="200" r="150" fill="url(#glow)" /></g>
        <g data-depth="4">{ticks.map((a, i) => (
          <line key={i} x1={200 + 178 * Math.cos(a)} y1={200 + 178 * Math.sin(a)} x2={200 + 192 * Math.cos(a)} y2={200 + 192 * Math.sin(a)} stroke="#555" strokeWidth="3" />
        ))}</g>
        <g data-depth="7"><g className="spin-slow"><polygon points={oct(170)} fill="none" stroke="#1d2a3a" strokeWidth="1.5" /></g></g>
        <g data-depth="12"><g className="spin-rev"><polygon points={oct(150)} fill="none" stroke="#2a2a2a" strokeWidth="1.5" transform="rotate(12 200 200)" /></g></g>
        <g data-depth="17"><g className="spin-slow"><polygon points={oct(120)} fill="none" stroke="#5c0d10" strokeWidth="1.5" transform="rotate(-18 200 200)" /></g></g>
        <g data-depth="24">
          <polygon points={oct(76)} fill="none" stroke="#ed1c24" strokeWidth="6" opacity="0.5" filter="url(#blur)" />
          <polygon points={oct(76)} fill="#050000" stroke="#ed1c24" strokeWidth="2" />
          <circle cx="128" cy="118" r="3" fill="#ed1c24" />
          <text className={k > 0 && k < 1 ? 'shaking' : ''} x="200" y="196" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="26" letterSpacing="2">{count == null ? '—' : <CountUp value={count} fromZero ms={1700} format={(n) => String(Math.round(n))} onProgress={setK} />}</text>
          <text x="200" y="220" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="11" letterSpacing="3">LUTADORES</text>
        </g>
      </svg>
    </div>
  );
}

/** Seta grossa que funciona como barra de progresso vertical: enche de baixo para cima com o acerto. */
function ProgressArrow({ k }: { k: number }) {
  const id = 'arrowFill';
  return (
    <span className={`acc-arrow ${k > 0 && k < 1 ? 'on' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 32">
        <defs>
          <clipPath id={id}><rect x="0" y={32 - 32 * k} width="24" height={32 * k} /></clipPath>
        </defs>
        <path className="arrow-shape back" d="M12 1 23 14h-7v17H8V14H1Z" />
        <path className="arrow-shape fill" d="M12 1 23 14h-7v17H8V14H1Z" clipPath={`url(#${id})`} />
      </svg>
    </span>
  );
}

/** Estatísticas do herói: os números sobem tremendo de leve; a seta-barra enche com o acerto e some ao chegar. */
function HeroStats({ fighters, accuracy, fights }: { fighters: number; accuracy: number; fights: number }) {
  const [kF, setKF] = useState(0), [kA, setKA] = useState(0), [kL, setKL] = useState(0);
  const run = (k: number) => (k > 0 && k < 1 ? 'shaking' : '');
  return (
    <div className="hero-stats">
      <div><b><span className={`num ${run(kF)}`}><CountUp value={fighters} fromZero ms={1700} format={(n) => String(Math.round(n))} onProgress={setKF} /></span></b><span>Lutadores</span></div>
      <div>
        <b className="acc-num">
          <span className={`num ${run(kA)}`}><CountUp value={accuracy} fromZero ms={2000} delay={150} format={(n) => fmtPct(n)} onProgress={setKA} /></span>
          <ProgressArrow k={kA} />
        </b>
        <span>Acerto em lutas marcadas</span>
      </div>
      <div><b><span className={`num ${run(kL)}`}><CountUp value={fights} fromZero ms={1900} delay={300} format={(n) => Math.round(n).toLocaleString('pt-BR')} onProgress={setKL} /></span></b><span>Lutas na base</span></div>
    </div>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
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
      <section className="hero" ref={heroRef}>
        <HeroFX hostRef={heroRef} />
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
            {meta && <HeroStats fighters={meta.fighterCount} accuracy={meta.model.accuracy} fights={meta.fightCount} />}
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
