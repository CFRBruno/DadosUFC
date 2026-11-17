import { toggleFav, useFavorites, type FavKind } from '../lib/favorites';

/** Estrela de favoritar (lutador ou evento). Dentro de links, não aciona a navegação. */
export default function FavButton({ kind, id, name, className = '' }: { kind: FavKind; id: string; name: string; className?: string }) {
  const fav = useFavorites();
  const on = fav[kind].includes(id);
  return (
    <button
      type="button"
      className={`fav-btn ${on ? 'on' : ''} ${className}`}
      aria-pressed={on}
      aria-label={on ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
      title={on ? 'Remover dos favoritos' : 'Favoritar'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(kind, id); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.7l-5.8 3.1 1.1-6.5L2.6 9.7l6.5-.9z" /></svg>
    </button>
  );
}
