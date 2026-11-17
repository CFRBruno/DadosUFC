import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFighters, useRecentEvents } from '../lib/data';
import { fmtDate } from '../lib/format';
import { DIVISION_BY_KEY } from '../shared/divisions';
import type { EventInfo, UpcomingBout } from '../shared/types';
import { compareUrl } from './events';

/** Cinturão de campeão (fundo das disputas de título): placa central dourada e placas laterais. */
function Belt() {
  return (
    <svg className="belt" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6d77a" /><stop offset=".5" stopColor="#c8962b" /><stop offset="1" stopColor="#7a5514" /></linearGradient>
      </defs>
      <rect x="0" y="26" width="400" height="48" fill="#17100c" /><rect x="0" y="30" width="400" height="4" fill="#3b2a18" /><rect x="0" y="66" width="400" height="4" fill="#3b2a18" />
      {[40, 110, 290, 360].map((x) => <g key={x}><rect x={x - 24} y="22" width="48" height="56" rx="8" fill="url(#gold)" /><rect x={x - 18} y="29" width="36" height="42" rx="5" fill="none" stroke="#5a3c0c" strokeWidth="2" /></g>)}
      <path d="M200 2 L246 22 L246 78 L200 98 L154 78 L154 22 Z" fill="url(#gold)" stroke="#5a3c0c" strokeWidth="3" />
      <path d="M200 14 L234 29 L234 71 L200 86 L166 71 L166 29 Z" fill="none" stroke="#5a3c0c" strokeWidth="2.5" />
      <circle cx="200" cy="50" r="17" fill="#8a1d22" stroke="#5a3c0c" strokeWidth="2.5" /><path d="M192 50 L200 40 L208 50 L200 60Z" fill="#f6d77a" />
    </svg>
  );
}

/** Principais lutas: main event(s) e disputas de cinturão + as de maior soma de Elo, até 5. */
function pickBouts(ev: EventInfo, elo: (id: string | null) => number): { b: UpcomingBout; main: boolean }[] {
  const all = ev.bouts.filter((b) => b.a.name && b.b.name);
  const main = all.filter((b) => b.order === 0 || b.title);
  const rest = all.filter((b) => !main.includes(b)).sort((x, y) => elo(y.a.id) + elo(y.b.id) - (elo(x.a.id) + elo(x.b.id)));
  const picked = [...main, ...rest].slice(0, 5);
  // mantém main/títulos no topo e ordena o resto pela soma de Elo
  return picked.map((b) => ({ b, main: main.includes(b) })).sort((x, y) => Number(y.main) - Number(x.main) || elo(y.b.a.id) + elo(y.b.b.id) - (elo(x.b.a.id) + elo(x.b.b.id)));
}

const last = (n: string) => { const p = n.split(' '); return p.length > 1 ? p[p.length - 1] : n; };

export default function HeroEvents() {
  const events = useRecentEvents().data;
  const fighters = useFighters().data;
  const cards = useMemo(() => {
    if (!events || !fighters) return [];
    const byId = new Map(fighters.map((f) => [f.id, f]));
    const elo = (id: string | null) => (id ? byId.get(id)?.elo ?? 1500 : 1500);
    return events.upcoming.filter((e) => e.bouts.length).slice(0, 3).map((e) => ({ e, bouts: pickBouts(e, elo) }));
  }, [events, fighters]);

  if (!cards.length) return <div className="hero-events" aria-hidden="true" />;
  return (
    <div className="hero-events">
      {cards.map(({ e, bouts }, i) => (
        <div key={e.id} className="he-card" style={{ ['--i' as string]: i }} data-depth={String(8 + i * 5)}>
          <Link to={`/evento/${e.id}`} className="he-head">
            <span className="he-when">{i === 0 ? 'PRÓXIMO · ' : ''}{fmtDate(e.date)}</span>
            <b>{e.name}</b>
          </Link>
          <div className="he-rows">
            {bouts.map(({ b, main }) => (
              <Link key={`${b.a.name}-${b.b.name}`} to={b.a.slug && b.b.slug ? compareUrl(b) : `/evento/${e.id}`} className={`he-row ${b.title ? 'title' : ''} ${main ? 'main' : ''}`}>
                {b.title && <Belt />}
                <span className="he-names"><i className="a">{last(b.a.name)}</i><em>×</em><i className="b">{last(b.b.name)}</i></span>
                <span className="he-tag">{b.title ? 'CINTURÃO' : main ? 'LUTA PRINCIPAL' : DIVISION_BY_KEY[b.division]?.short}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
