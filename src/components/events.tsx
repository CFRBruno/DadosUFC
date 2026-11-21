import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { modelFavorite, modelHit } from '../lib/hits';
import FavButton from './FavButton';
import { FighterFlag, ProspectTag } from './ui';
import type { EventFight, FighterSummary, UpcomingBout } from '../shared/types';
import { divisionName, recordStr } from '../lib/format';
import { METHOD_LABEL } from '../shared/translate';
import { Avatar, Icon } from './ui';

type Seg = 'main' | 'prelims' | 'early';
const SEG_RANK: Record<Seg, number> = { main: 0, prelims: 1, early: 2 };
export const SEG_LABEL: Record<Seg, string> = { main: 'Card principal', prelims: 'Card preliminar', early: 'Preliminares iniciais' };

/** Ordena do card principal para os preliminares (ordem original mantida dentro de cada trecho; sem trecho vai ao fim). */
export function bySegment<T>(items: T[], seg: (x: T) => Seg | undefined): T[] {
  if (!items.some((x) => seg(x))) return items;
  const rank = (x: T) => { const s = seg(x); return s ? SEG_RANK[s] : 9; };
  return items.map((x, i) => [x, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** Agrupa por trecho do card, cada um numa caixa com contorno fino e título em destaque. */
export function SegGroups<T>({ items, seg, render }: { items: T[]; seg: (x: T) => Seg | undefined; render: (x: T, i: number) => ReactNode }) {
  const sorted = bySegment(items, seg);
  const groups: { seg: Seg | undefined; items: { x: T; i: number }[] }[] = [];
  sorted.forEach((x, i) => {
    const s = seg(x);
    const last = groups[groups.length - 1];
    if (last && last.seg === s) last.items.push({ x, i });
    else groups.push({ seg: s, items: [{ x, i }] });
  });
  return (
    <div className="seg-groups">
      {groups.map((g, gi) => (
        <section key={gi} className={`seg-box${g.seg ? ' seg-' + g.seg : ''}`}>
          {g.seg && <h3 className="seg-heading"><span>{SEG_LABEL[g.seg]}</span><small>{g.items.length} {g.items.length === 1 ? 'luta' : 'lutas'}</small></h3>}
          {g.items.map(({ x, i }) => render(x, i))}
        </section>
      ))}
    </div>
  );
}

export function compareUrl(b: UpcomingBout) {
  const p = new URLSearchParams();
  if (b.a.slug) p.set('a', b.a.slug);
  if (b.b.slug) p.set('b', b.b.slug);
  p.set('r', String(b.rounds));
  if (b.division !== 'OPEN') p.set('d', b.division);
  p.set('ev', b.event);
  return `/comparar?${p}`;
}

export function UpcomingBoutRow({ b, byId }: { b: UpcomingBout; byId: Map<string, FighterSummary> }) {
  const fa = b.a.id ? byId.get(b.a.id) : undefined;
  const fb = b.b.id ? byId.get(b.b.id) : undefined;
  const label = b.order === 0 ? 'Luta principal' : b.title ? 'Cinturão' : null;
  return (
    <div className="bout-wrap">
      <div className="bout-meta">
        <span>{label && <span style={{ color: 'var(--brand)' }}>{label} · </span>}{divisionName(b.division, true)} · {b.rounds} rounds</span>
      </div>
      <div className="bout">
        <Side id={b.a.id} name={b.a.name} slug={b.a.slug} rec={fa ? recordStr(fa.record) : 'Estreia'} side="a" prospect />
        <div className="mid">
          <b className="vs">vs</b>
          {b.a.slug && b.b.slug && (
            <Link to={compareUrl(b)} className="btn btn-primary btn-sm analyze-btn">
              <Icon name="swords" className="arrow" /> Analisar
            </Link>
          )}
        </div>
        <Side id={b.b.id} name={b.b.name} slug={b.b.slug} rec={fb ? recordStr(fb.record) : 'Estreia'} side="b" right prospect />
      </div>
    </div>
  );
}

export function ResultBoutRow({ f }: { f: EventFight }) {
  const how = f.result === 'NC' ? 'Sem resultado' : f.result === 'D' ? 'Empate' : METHOD_LABEL[f.method];
  const winSlug = (f.winner === 0 ? f.a.slug : f.winner === 1 ? f.b.slug : f.a.slug) ?? f.a.slug ?? f.b.slug;
  const nav = useNavigate();
  const hit = modelHit(f), fav = modelFavorite(f);
  const url = winSlug ? `/lutador/${winSlug}/luta/${f.id}` : null;
  // a luta inteira é clicável; os nomes dos lutadores continuam levando ao perfil de cada um
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!url || (e.target as HTMLElement).closest('a')) return;
    nav(url);
  };
  return (
    <div className="bout-wrap">
      <div className="bout-meta">
        <span>{f.title && <span style={{ color: 'var(--brand)' }}>Cinturão · </span>}{divisionName(f.division)}</span>
        <span className="bout-actions">
          {hit == null && fav && (
            <span className="hit-chip na" title="Empates e lutas sem resultado não entram no placar de acertos">
              {f.result === 'D' ? 'Empate' : 'Sem resultado'} · modelo favorecia {fav.name.split(' ').slice(-1)[0]} ({Math.round(fav.p * 100)}%)
            </span>
          )}
          {hit != null && fav && (
            <span className={`hit-chip ${hit ? 'ok' : 'no'}`} title={`Antes da luta, o modelo dava ${Math.round(fav.p * 100)}% para ${fav.name}`}>
              {hit ? '✓ Modelo acertou' : '✗ Modelo errou'} · {Math.round(fav.p * 100)}%
            </span>
          )}
          {url && <Link to={url} style={{ color: 'var(--brand)' }}>Estatísticas →</Link>}
        </span>
      </div>
      <div
        className={`bout ${url ? 'clickable' : ''} ${f.winner === 0 ? 'win-a' : f.winner === 1 ? 'win-b' : f.result === 'D' ? 'draw' : ''}`}
        {...(url ? { role: 'link', tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') open(e); }, 'aria-label': `Estatísticas da luta ${f.a.name} contra ${f.b.name}` } : {})}
      >
        <Side id={f.a.id} name={f.a.name} slug={f.a.slug} rec={f.winner === 0 ? 'Venceu' : f.winner === 1 ? 'Perdeu' : ''} cls={f.winner === 0 ? 'win' : f.winner === 1 ? 'lose' : ''} side="a" />
        <div className="mid result"><b>{how}</b><span>R{f.endRound} · {f.endTime}</span>{url && <em>ver luta →</em>}</div>
        <Side id={f.b.id} name={f.b.name} slug={f.b.slug} rec={f.winner === 1 ? 'Venceu' : f.winner === 0 ? 'Perdeu' : ''} cls={f.winner === 1 ? 'win' : f.winner === 0 ? 'lose' : ''} side="b" right />
      </div>
    </div>
  );
}

function Side({ id, name, slug, rec, right, cls = '', side, prospect }: { id: string | null; name: string; slug: string | null; rec: string; right?: boolean; cls?: string; side: 'a' | 'b'; prospect?: boolean }) {
  const inner = (
    <>
      <Avatar name={name} id={id} size="sm" side={side} />
      <div style={{ minWidth: 0 }}>
        <div className="nm"><FighterFlag id={id} slug={slug} />{name}{prospect && <ProspectTag id={id} />}</div>
        <div className="rc">{rec}</div>
      </div>
      {id && <FavButton kind="fighters" id={id} name={name} className="sm" />}
    </>
  );
  return slug ? (
    <Link to={`/lutador/${slug}`} className={`side ${right ? 'right' : ''} ${cls}`}>{inner}</Link>
  ) : (
    <div className={`side ${right ? 'right' : ''} ${cls}`}>{inner}</div>
  );
}
