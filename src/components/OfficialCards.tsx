import { Link } from 'react-router-dom';
import { divisionName, fmtWeight } from '../lib/format';
import { divisionLbs, type DivisionKey } from '../shared/divisions';
import type { BoardEntry, OfficialBoard } from '../shared/types';
import FavButton from './FavButton';
import { Avatar } from './ui';

type Row = BoardEntry & { division?: DivisionKey | null };

function RankRow({ e, champ, withDivision }: { e: Row; champ: boolean; withDivision?: boolean }) {
  const inner = (
    <>
      <span className={`rk-pos ${champ ? 'champ' : ''}`}>{champ ? 'C' : e.pos}</span>
      <Avatar name={e.name} id={e.id} size="sm" />
      <span className="rk-name">
        {e.name}
        {withDivision && e.division && <small>{divisionName(e.division)} · {fmtWeight(divisionLbs(e.division))}</small>}
      </span>
      {e.id ? <FavButton kind="fighters" id={e.id} name={e.name} className="sm" /> : <span />}
    </>
  );
  const cls = `rk-row ${champ ? 'is-champ' : ''}`;
  return e.slug ? <Link to={`/lutador/${e.slug}`} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export interface Collapsible { open: boolean; onOpen: () => void }

/** Lista com as primeiras `top` linhas sempre visíveis; o restante abre ao clicar no cartão. */
function Rows({ rows, top, withDivision, collapsible }: { rows: Row[]; top: number; withDivision?: boolean; collapsible?: Collapsible }) {
  const isChamp = (e: Row) => e.pos === 0 && !withDivision;
  const shown = collapsible ? rows.filter((e) => e.pos <= top) : rows;
  const extra = collapsible ? rows.filter((e) => e.pos > top) : [];
  return (
    <>
      <div className="rk-rows">{shown.map((e) => <RankRow key={e.pos} e={e} champ={isChamp(e)} withDivision={withDivision} />)}</div>
      {collapsible && extra.length > 0 && (
        <>
          <div className="rk-more"><div className="rk-rows">{extra.map((e) => <RankRow key={e.pos} e={e} champ={false} withDivision={withDivision} />)}</div></div>
          <div className="rk-hint" aria-hidden="true">{collapsible.open ? '▴ clique fora para recolher' : `▾ ver até o top ${rows[rows.length - 1].pos}`}</div>
        </>
      )}
    </>
  );
}

/** Cartão de uma categoria: campeão + `top` primeiros; o peso da categoria fica ao lado do nome do peso. */
export function DivisionCard({ d, top, link = true, collapsible }: { d: OfficialBoard['divisions'][number]; top: number; link?: boolean; collapsible?: Collapsible }) {
  const open = !!collapsible?.open;
  return (
    <div className={`rk-card ${collapsible ? 'collapsible' : ''} ${open ? 'open' : ''}`} onClick={collapsible && !open ? collapsible.onOpen : undefined}>
      <div className="rk-head">
        <b>{divisionName(d.key)}<small>{fmtWeight(divisionLbs(d.key))}</small></b>
        {link && <Link to={`/lutadores?cat=${d.key}&ordem=oficial`}>Top 15 →</Link>}
      </div>
      <Rows rows={d.entries} top={top} collapsible={collapsible} />
    </div>
  );
}

/** Pound-for-pound (sem campeão; cada lutador mostra a categoria e o peso dela). */
export function P4PCard({ title, rows, top = 15, collapsible }: { title: string; rows: Row[]; top?: number; collapsible?: Collapsible }) {
  const open = !!collapsible?.open;
  return (
    <div className={`rk-card ${collapsible ? 'collapsible' : ''} ${open ? 'open' : ''}`} onClick={collapsible && !open ? collapsible.onOpen : undefined}>
      <div className="rk-head"><b>{title}</b></div>
      <Rows rows={rows} top={top} withDivision collapsible={collapsible} />
    </div>
  );
}
