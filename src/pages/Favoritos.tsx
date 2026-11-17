import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import FavButton from '../components/FavButton';
import { FighterCard } from '../components/fighters';
import { ErrorBox, Loading } from '../components/ui';
import { useEvents, useFighters } from '../lib/data';
import { useFavorites } from '../lib/favorites';
import { fmtDate } from '../lib/format';

/** Tudo o que o usuário favoritou, neste aparelho. */
export default function Favoritos() {
  const fav = useFavorites();
  const { data: fighters, error } = useFighters();
  const events = useEvents().data;
  const list = useMemo(() => (fighters ?? []).filter((f) => fav.fighters.includes(f.id)), [fighters, fav.fighters]);
  const evs = useMemo(() => [...(events?.upcoming ?? []), ...(events?.past ?? [])].filter((e) => fav.events.includes(e.id)).sort((a, b) => (b.date ?? '9999').localeCompare(a.date ?? '9999')), [events, fav.events]);
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!fighters) return <Loading />;
  const empty = list.length === 0 && evs.length === 0;
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Só seus</span>
        <h1 style={{ marginTop: 8 }}>Favoritos <span className="gold-star">★</span></h1>
        <p>Os lutadores e eventos que você marcou com a estrela. Ficam guardados só neste aparelho. Quando um deles aparece nos próximos eventos da tela inicial, ganha destaque dourado.</p>
      </div>
      {empty && <div className="empty">Nada por aqui ainda. Toque na estrela de um lutador (na lista ou no perfil) ou de um evento para guardá-lo.<p style={{ marginTop: 12 }}><Link to="/lutadores" className="btn btn-outline">Ver lutadores</Link></p></div>}
      {evs.length > 0 && (
        <>
          <div className="section-title"><h2>Eventos</h2></div>
          <div className="fav-events">
            {evs.map((e) => (
              <Link key={e.id} to={`/evento/${e.id}`} className="fav-event">
                <span className="d">{fmtDate(e.date)}</span><b>{e.name}</b><span className="n">{e.upcoming ? 'Em breve' : 'Realizado'}</span>
                <FavButton kind="events" id={e.id} name={e.name} />
              </Link>
            ))}
          </div>
        </>
      )}
      {list.length > 0 && (
        <>
          <div className="section-title"><h2>Lutadores</h2></div>
          <div className="grid-3">{list.map((f) => <FighterCard key={f.id} f={f} />)}</div>
        </>
      )}
    </div>
  );
}
