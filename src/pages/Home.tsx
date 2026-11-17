import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import HeroFX from '../components/HeroFX';
import HeroIdols from '../components/HeroIdols';
import { Avatar, CountUp, Loading } from '../components/ui';
import { useRecentEvents, useFighters, useMeta, useOfficialBoard } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { divisionName, recordStr } from '../lib/format';
import type { FighterSummary, OfficialBoard } from '../shared/types';

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
      <div><b><span className={`num ${run(kF)}`}><CountUp value={fighters} fromZero accelerate ms={2800} format={(n) => Math.round(n).toLocaleString('pt-BR')} onProgress={setKF} /></span></b><span>Lutadores</span></div>
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
          <HeroIdols />
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
