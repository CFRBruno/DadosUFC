import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventForecast from '../components/EventForecast';
import FavButton from '../components/FavButton';
import { ResultBoutRow, SegGroups, UpcomingBoutRow } from '../components/events';
import { eventScore } from '../lib/hits';
import { ErrorBox, LiveDot, Loading } from '../components/ui';
import { useLive } from '../lib/live';
import { useEvents, useFighters } from '../lib/data';
import { fmtDate } from '../lib/format';

export default function EventPage() {
  const { id } = useParams();
  const { data, error } = useEvents();
  const fighters = useFighters().data;
  const [tab, setTab] = useState<'previsoes' | 'card'>('previsoes');
  const liveEvents = useLive().liveEvents;
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
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
