import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFighters, useRecentEvents } from '../lib/data';
import { useFavorites } from '../lib/favorites';
import FavButton from './FavButton';
import { fmtDate } from '../lib/format';
import { DIVISION_BY_KEY } from '../shared/divisions';
import type { EventInfo, UpcomingBout } from '../shared/types';
import { compareUrl } from './events';
import { FighterFlag } from './ui';

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
function pickBouts(ev: EventInfo, elo: (id: string | null) => number, favIds: Set<string>): { b: UpcomingBout; main: boolean; fav: boolean }[] {
  const all = ev.bouts.filter((b) => b.a.name && b.b.name);
  const main = all.filter((b) => b.order === 0 || b.title);
  const rest = all.filter((b) => !main.includes(b)).sort((x, y) => elo(y.a.id) + elo(y.b.id) - (elo(x.a.id) + elo(x.b.id)));
  const isFav = (b: UpcomingBout) => (!!b.a.id && favIds.has(b.a.id)) || (!!b.b.id && favIds.has(b.b.id));
  // lutas de lutadores favoritos entram logo depois das principais, mesmo com Elo menor
  const picked = [...main, ...rest.filter(isFav), ...rest.filter((b) => !isFav(b))].slice(0, 5);
  return picked.map((b) => ({ b, main: main.includes(b), fav: isFav(b) })).sort((x, y) => Number(y.main) - Number(x.main) || Number(y.fav) - Number(x.fav) || elo(y.b.a.id) + elo(y.b.b.id) - (elo(x.b.a.id) + elo(x.b.b.id)));
}

/** Dias até o evento pela data local (as fontes só trazem a data, sem horário). */
function countdown(date: string | null): { text: string; tone: 'far' | 'near' | 'tomorrow' | 'today' } | null {
  if (!date) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((Date.parse(date) - today) / 864e5);
  if (d < 0) return null;
  if (d === 0) return { text: 'É HOJE! 🔥🔥🔥', tone: 'today' };
  if (d === 1) return { text: 'É AMANHÃ!', tone: 'tomorrow' };
  if (d <= 3) return { text: `Faltam ${d === 2 ? 'dois' : 'três'} dias!`, tone: 'near' };
  return { text: `Faltam ${d} dias`, tone: 'far' };
}

const last = (n: string) => { const p = n.split(' '); return p.length > 1 ? p[p.length - 1] : n; };

export default function HeroEvents() {
  const events = useRecentEvents().data;
  const fighters = useFighters().data;
  const fav = useFavorites();
  const cards = useMemo(() => {
    if (!events || !fighters) return [];
    const byId = new Map(fighters.map((f) => [f.id, f]));
    const elo = (id: string | null) => (id ? byId.get(id)?.elo ?? 1500 : 1500);
    const favIds = new Set(fav.fighters);
    return events.upcoming.filter((e) => e.bouts.length).slice(0, 3).map((e) => {
      const favFighters = [...new Set(e.bouts.flatMap((b) => [b.a, b.b]).filter((x) => x.id && favIds.has(x.id)).map((x) => x.name))];
      return { e, bouts: pickBouts(e, elo, favIds), favFighters, favEvent: fav.events.includes(e.id) };
    });
  }, [events, fighters, fav]);

  if (!cards.length) return <div className="hero-events" aria-hidden="true" />;
  return (
    <div className="hero-events">
      {cards.map(({ e, bouts, favFighters, favEvent }, i) => (
        <div key={e.id} className={`he-card ${favEvent || favFighters.length ? 'gold' : ''}`} style={{ ['--i' as string]: i }} data-depth={String(8 + i * 5)}>
          <Link to={`/evento/${e.id}`} className="he-head">
            <span className="he-titles">
              <span className="he-when">{i === 0 ? 'PRÓXIMO · ' : ''}{fmtDate(e.date)}</span>
              <b>{e.name}</b>
            </span>
            <FavButton kind="events" id={e.id} name={e.name} className="he-star" />
            {(() => { const c = countdown(e.date); return c ? <span className={`he-count ${c.tone}`}>{c.text}</span> : null; })()}
          </Link>
          {(favEvent || favFighters.length > 0) && (
            <div className="he-glory"><span>★</span>{favEvent && favFighters.length === 0 ? 'Evento favorito' : favFighters.length ? `${favFighters.slice(0, 2).map((n) => n.split(' ').slice(-1)[0]).join(' e ')}${favFighters.length > 2 ? ` +${favFighters.length - 2}` : ''} ${favFighters.length > 1 ? 'lutam' : 'luta'} aqui` : ''}<span>★</span></div>
          )}
          <div className="he-rows">
            {bouts.map(({ b, main, fav: bf }, r) => (
              <Link key={`${b.a.name}-${b.b.name}`} style={{ ['--r' as string]: r }} to={b.a.slug && b.b.slug ? compareUrl(b) : `/evento/${e.id}`} className={`he-row ${b.title ? 'title' : ''} ${main ? 'main' : ''} ${bf ? 'fav' : ''}`}>
                {b.title && <Belt />}
                <span className="he-names">{bf && <b className="he-s">★</b>}<i className="a"><FighterFlag id={b.a.id} slug={b.a.slug} />{last(b.a.name)}</i><em>×</em><i className="b"><FighterFlag id={b.b.id} slug={b.b.slug} />{last(b.b.name)}</i></span>
                <span className="he-tag">{b.title ? 'CINTURÃO' : main ? 'LUTA PRINCIPAL' : DIVISION_BY_KEY[b.division]?.short}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
