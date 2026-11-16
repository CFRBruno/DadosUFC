import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EventForecast from '../components/EventForecast';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import { eventScore } from '../lib/hits';
import { ErrorBox, Loading } from '../components/ui';
import { useEvents, useFighters } from '../lib/data';
import { fmtDate } from '../lib/format';

export default function EventPage() {
  const { id } = useParams();
  const { data, error } = useEvents();
  const fighters = useFighters().data;
  const [tab, setTab] = useState<'previsoes' | 'card'>('previsoes');
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!data) return <Loading />;
  const ev = [...data.upcoming, ...data.past].find((e) => e.id === id);
  if (!ev) return <div className="container empty">Evento não encontrado (só exibimos eventos a partir de 2026).</div>;
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">{fmtDate(ev.date, true)}</span>
        <h1 style={{ marginTop: 8 }}>{ev.name}</h1>
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
            ? ev.bouts.map((b, i) => <UpcomingBoutRow key={i} b={b} byId={byId} />)
            : ev.fights.map((f) => <ResultBoutRow key={f.id} f={f} />)}
          {ev.upcoming && ev.bouts.length === 0 && <p className="note">Card ainda não divulgado.</p>}
        </div>
      )}
    </div>
  );
}
