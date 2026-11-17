import { Link } from 'react-router-dom';
import { divisionName, fmtWeight } from '../lib/format';
import type { DivisionKey } from '../shared/divisions';
import type { BoardEntry, OfficialBoard } from '../shared/types';
import { Avatar } from './ui';

type Row = BoardEntry & { division?: DivisionKey | null };

function RankRow({ e, champ, withDivision }: { e: Row; champ: boolean; withDivision?: boolean }) {
  const inner = (
    <>
      <span className={`rk-pos ${champ ? 'champ' : ''}`}>{champ ? 'C' : e.pos}</span>
      <Avatar name={e.name} id={e.id} size="sm" />
      <span className="rk-name">
        {e.name}
        <small>{withDivision && e.division ? `${divisionName(e.division)} · ` : ''}{fmtWeight(e.lbs)}</small>
      </span>
    </>
  );
  return e.slug ? <Link to={`/lutador/${e.slug}`} className="rk-row">{inner}</Link> : <div className="rk-row">{inner}</div>;
}

/** Cartão de uma categoria: campeão + `top` primeiros (todos com a mesma altura de linha). */
export function DivisionCard({ d, top, link = true }: { d: OfficialBoard['divisions'][number]; top: number; link?: boolean }) {
  return (
    <div className="rk-card">
      <div className="rk-head">
        <b>{divisionName(d.key)}</b>
        {link && <Link to={`/lutadores?cat=${d.key}&ordem=oficial`}>Top 15 →</Link>}
      </div>
      <div className="rk-rows">{d.entries.filter((e) => e.pos <= top).map((e) => <RankRow key={e.pos} e={e} champ={e.pos === 0} />)}</div>
    </div>
  );
}

/** Pound-for-pound (sem campeão; mostra a categoria de cada lutador). */
export function P4PCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rk-card">
      <div className="rk-head"><b>{title}</b></div>
      <div className="rk-rows">{rows.map((e) => <RankRow key={e.pos} e={e} champ={false} withDivision />)}</div>
    </div>
  );
}
