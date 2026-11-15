import { Link } from 'react-router-dom';
import { ErrorBox, Loading } from '../components/ui';
import { useEvents } from '../lib/data';
import { fmtDate } from '../lib/format';
import { shortName } from '../lib/compare';
import type { EventInfo } from '../shared/types';

function EventCard({ e }: { e: EventInfo }) {
  const main = e.upcoming ? e.bouts[0] : e.fights[0];
  return (
    <Link to={`/evento/${e.id}`} className="event-card">
      <div className="date">{fmtDate(e.date)}</div>
      <h3>{e.name}</h3>
      <div className="loc">{e.location || 'Local a definir'}</div>
      <div className="note" style={{ marginTop: 10 }}>
        {e.upcoming ? `${e.bouts.length} luta${e.bouts.length === 1 ? '' : 's'} anunciada${e.bouts.length === 1 ? '' : 's'}` : `${e.fights.length} lutas`}
        {main ? ` · ${shortName(main.a.name)} vs ${shortName(main.b.name)}` : ''}
      </div>
    </Link>
  );
}

export default function Events() {
  const { data, error } = useEvents();
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Calendário</span>
        <h1 style={{ marginTop: 8 }}>Eventos</h1>
        <p>Próximos cards (com análise de cada luta) e todos os eventos do UFC desde janeiro de 2026.</p>
      </div>
      {error ? <ErrorBox message={error} /> : !data ? <Loading /> : (
        <>
          <div className="section-title" style={{ marginTop: 8 }}><h2>Próximos</h2></div>
          {data.upcoming.length ? (
            <div className="grid-3">{data.upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
          ) : <div className="panel note">Nenhum evento futuro carregado. Eles são atualizados automaticamente a partir do UFCStats.</div>}
          <div className="section-title"><h2>Realizados em 2026</h2></div>
          <div className="grid-3">{data.past.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </>
      )}
    </div>
  );
}
