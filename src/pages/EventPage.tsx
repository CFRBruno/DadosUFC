import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import EventForecast from '../components/EventForecast';
import FavButton from '../components/FavButton';
import { ResultBoutRow, SegGroups, UpcomingBoutRow } from '../components/events';
import { eventScore } from '../lib/hits';
import { ErrorBox, LiveDot, Loading } from '../components/ui';
import { currentBout, pairKey, useLive } from '../lib/live';
import { useEvents, useFighters } from '../lib/data';
import { fmtDate } from '../lib/format';

export default function EventPage() {
  const { id } = useParams();
  const { data, error } = useEvents();
  const fighters = useFighters().data;
  const [tab, setTab] = useState<'previsoes' | 'card'>('previsoes');
  const liveSnap = useLive();
  const liveEvents = liveSnap.liveEvents;
  const [params] = useSearchParams();
  const goCurrent = params.get('ir') === 'atual';
  const scrolled = useRef(false);
  useEffect(() => { if (goCurrent) setTab('card'); }, [goCurrent]);
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
  // vindo da área "ao vivo": rola até a luta atual (rolando agora ou a próxima depois da última concluída)
  useEffect(() => {
    if (!goCurrent || scrolled.current || !data || !id) return;
    const ev0 = [...data.upcoming, ...data.past].find((e) => e.id === id);
    if (!ev0?.bouts.length || !liveSnap.fetchedAt) return;
    const cur = currentBout(liveSnap, id, ev0.bouts).current;
    if (!cur) { scrolled.current = true; return; }
    let tries = 0;
    const key = pairKey(cur.a.name, cur.b.name);
    const t = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-bout="${CSS.escape(key)}"]`);
      if (el) {
        clearInterval(t);
        scrolled.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash-current');
        setTimeout(() => el.classList.remove('flash-current'), 3500);
      } else if (++tries > 20) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [goCurrent, data, id, liveSnap]);
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!data) return <Loading />;
  const ev = [...data.upcoming, ...data.past].find((e) => e.id === id);
  if (!ev) return <div className="container empty">Evento não encontrado (só exibimos eventos a partir de 2016).</div>;
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">{fmtDate(ev.date, true)}</span>
        {liveEvents.has(ev.id.replace(/^espn-/, '')) && <div style={{ marginTop: 6 }}><LiveDot label="Evento ao vivo" /></div>}
        <h1 style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>{ev.name} <FavButton kind="events" id={ev.id} name={ev.name} className="big" /></h1>
        <p>{ev.location}{ev.source === 'manual' ? ' · card cadastrado manualmente' : ''}</p>
      </div>
      {ev.upcoming && ev.bouts.length > 0 && (
        <div className="filters" style={{ justifyContent: 'center' }}>
          <div className="seg" role="tablist" aria-label="Visualização">
            <button className={tab === 'previsoes' ? 'on' : ''} onClick={() => setTab('previsoes')}>Previsões</button>
            <button className={tab === 'card' ? 'on' : ''} onClick={() => setTab('card')}>Card</button>
          </div>
        </div>
      )}
      {ev.upcoming && tab === 'previsoes' && ev.bouts.length > 0 ? (
        <EventForecast ev={ev} byId={byId} />
      ) : (
        <div className="panel">
          <div className="panel-title left">{ev.upcoming ? 'Card' : 'Resultados'}</div>
          {!ev.upcoming && (() => {
            const sc = eventScore(ev);
            return sc.n ? (
              <p className="note" style={{ marginBottom: 12 }}>
                Antes do evento, o modelo previa o vencedor em {sc.hits} de {sc.n} lutas ({Math.round((sc.hits / sc.n) * 100)}%). <Link to="/modelo" style={{ color: 'var(--brand)' }}>Placar do ano →</Link>
              </p>
            ) : null;
          })()}
          {ev.upcoming
            ? <SegGroups items={ev.bouts} seg={(b) => b.seg} render={(b, i) => <UpcomingBoutRow key={i} b={b} byId={byId} />} />
            : <SegGroups items={ev.fights} seg={(f) => f.seg} render={(f) => <ResultBoutRow key={f.id} f={f} />} />}
          {ev.upcoming && ev.bouts.length === 0 && <p className="note">Card ainda não divulgado.</p>}
        </div>
      )}
    </div>
  );
}
