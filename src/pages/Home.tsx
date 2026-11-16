import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import HeroFX from '../components/HeroFX';
import { Avatar, CountUp, Loading } from '../components/ui';
import { useRecentEvents, useFighters, useMeta, useOfficialBoard } from '../lib/data';
import { fmtDate, fmtPct, todayIso } from '../lib/format';
import { divisionName, recordStr } from '../lib/format';
import type { FighterSummary, OfficialBoard } from '../shared/types';

function HeroVisual({ next }: { next: { name: string; date: string | null } | null }) {
  const [k, setK] = useState(0);
  // dias até o próximo evento (as datas vêm sem horário) e nome curto ("UFC 335", "UFC Fight Night")
  const days = next?.date ? Math.round((Date.parse(next.date) - Date.parse(todayIso())) / 864e5) : null;
  const parts = (next?.name ?? '').split(':');
  const numbered = /^UFC \d+/.test(parts[0]);
  const label = (numbered ? parts[0] : (parts[1] ?? parts[0]).trim().replace(/\s+vs\.?\s+/i, ' × ')).toUpperCase();
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
          {days == null ? (
            <text x="200" y="206" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="11" letterSpacing="3">PRÓXIMO EVENTO</text>
          ) : (
            <>
              <text x="200" y="170" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="9.5" letterSpacing="3">PRÓXIMO EVENTO</text>
              {days <= 0 ? (
                <text x="200" y="208" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="30" letterSpacing="2">HOJE</text>
              ) : (
                <>
                  <text className={k > 0 && k < 1 ? 'shaking' : ''} x="200" y="206" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="40"><CountUp value={days} fromZero ms={1500} format={(n) => String(Math.round(n))} onProgress={setK} /></text>
                  <text x="200" y="224" textAnchor="middle" fill="#ed1c24" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize="10" letterSpacing="4">{days === 1 ? 'DIA' : 'DIAS'}</text>
                </>
              )}
              <text x="200" y="241" textAnchor="middle" fill="#ff6b70" fontFamily="Roboto Mono, monospace" fontWeight="700" fontSize={label.length > 18 ? 8 : 10} letterSpacing="1">{label}</text>
            </>
          )}
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
      <div><b><span className={`num ${run(kF)}`}><CountUp value={fighters} fromZero accelerate ms={2800} format={(n) => String(Math.round(n))} onProgress={setKF} /></span></b><span>Lutadores</span></div>
      <div>
        <b className="acc-num">
          <span className={`num ${run(kA)}`}><CountUp value={accuracy} fromZero accelerate ms={2800} format={(n) => fmtPct(n)} onProgress={setKA} /></span>
          <ProgressArrow k={kA} />
        </b>
        <span>Acerto em lutas marcadas</span>
      </div>
      <div><b><span className={`num ${run(kL)}`}><CountUp value={fights} fromZero accelerate ms={2800} format={(n) => Math.round(n).toLocaleString('pt-BR')} onProgress={setKL} /></span></b><span>Lutas na base</span></div>
    </div>
  );
}

const TOP_N = 5; // campeão + 5 primeiros em cada categoria (todos os cartões têm a mesma altura)

function RankCard({ d, byId }: { d: OfficialBoard['divisions'][number]; byId: Map<string, FighterSummary> }) {
  const rows = d.entries.filter((e) => e.pos <= TOP_N);
  return (
    <div className="rk-card">
      <div className="rk-head">
        <b>{divisionName(d.key)}</b>
        <Link to={`/lutadores?cat=${d.key}&ordem=oficial`}>Top 15 →</Link>
      </div>
      <div className="rk-rows">
        {rows.map((e) => {
          const f = e.id ? byId.get(e.id) : undefined;
          const inner = (
            <>
              <span className={`rk-pos ${e.pos === 0 ? 'champ' : ''}`}>{e.pos === 0 ? 'C' : e.pos}</span>
              <Avatar name={e.name} id={e.id} size="sm" />
              <span className="rk-name">{e.name}</span>
              <span className="rk-rec">{f ? recordStr(f.record) : ''}</span>
            </>
          );
          return e.slug ? <Link key={e.pos} to={`/lutador/${e.slug}`} className="rk-row">{inner}</Link> : <div key={e.pos} className="rk-row">{inner}</div>;
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const meta = useMeta().data;
  const fighters = useFighters().data;
  const events = useRecentEvents().data;
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
  const nextEvent = events?.upcoming[0];
  const lastEvent = events?.past[0];

  const board = useOfficialBoard().data;

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
              Histórico, estilo de luta, pontos fortes e fracos de todos que lutaram no UFC desde 2016 — e um comparador
              que estima quem vence e como, com base em mais de {meta ? (Math.floor(meta.fightCount / 1000) * 1000).toLocaleString('pt-BR') : '8.000'} lutas.
            </p>
            <div className="actions">
              <Link to="/comparar" className="btn btn-primary">Comparar lutadores</Link>
              <Link to="/lutadores" className="btn btn-outline">Ver lutadores</Link>
            </div>
            {meta && <HeroStats fighters={meta.fighterCount} accuracy={meta.model.accuracy} fights={meta.fightCount} />}
          </div>
          <HeroVisual next={nextEvent ? { name: nextEvent.name, date: nextEvent.date } : null} />
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

        {board && board.divisions.length > 0 && (
          <>
            <div className="section-title">
              <h2>Ranking oficial do UFC</h2>
              <span className="note">{board.released ? `divulgado em ${fmtDate(board.released)}` : ''}</span>
            </div>
            {[false, true].map((women) => {
              const divs = board.divisions.filter((d) => d.women === women);
              if (!divs.length) return null;
              return (
                <div key={String(women)} className="rk-group">
                  <div className="rk-group-title">{women ? 'Feminino' : 'Masculino'}</div>
                  <div className="rk-grid">
                    {divs.map((d) => <RankCard key={d.key} d={d} byId={byId} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
