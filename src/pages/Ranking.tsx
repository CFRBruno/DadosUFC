import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FavButton from '../components/FavButton';
import RankTabs from '../components/RankTabs';
import { Avatar, ErrorBox, Flag, Loading } from '../components/ui';
import { useFighters, useJson } from '../lib/data';
import { RANK_BY_KEY, RANK_STATS } from '../lib/rankingStats';
import { DIVISION_BY_KEY, MAIN_DIVISIONS, type DivisionKey } from '../shared/divisions';
import type { FighterSummary, RankingRow } from '../shared/types';

const GROUPS = ['Físico e experiência', 'Cartel no UFC', 'Estatísticas no UFC'] as const;

export default function Ranking() {
  const rows = useJson<RankingRow[]>('rankings.json');
  const fighters = useFighters().data;
  const [params, setParams] = useSearchParams();
  const statKey = RANK_BY_KEY[params.get('stat') ?? ''] ? params.get('stat')! : 'elo';
  const stat = RANK_BY_KEY[statKey];
  const mode = params.get('modo') === 'cat' ? 'cat' : 'abs';
  const cat = (params.get('cat') as DivisionKey) || 'LW';
  const gender = params.get('genero') ?? '';
  const win = [3, 5, 7, 10].includes(Number(params.get('n'))) ? Number(params.get('n')) : 5; // janela da forma recente
  const isForm = statKey === 'form';
  const valueKey = isForm ? `form${win}` : statKey;
  const minFights = Number(params.get('min') ?? (isForm ? win : stat.rate ? 3 : 1));
  const dir = (params.get('ordem') as 'asc' | 'desc') || stat.dir;
  const [limit, setLimit] = useState(50);

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
    setLimit(50);
  };

  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);

  const list = useMemo(() => {
    if (!rows.data || !fighters) return [];
    const out: { f: FighterSummary; v: number; fights: number }[] = [];
    for (const r of rows.data) {
      const f = byId.get(r.id);
      const v = r.s[valueKey];
      if (!f || v == null || !Number.isFinite(v)) continue;
      const fights = r.s.fights ?? 0;
      if (fights < minFights) continue;
      if (mode === 'cat' && f.division !== cat) continue;
      if (mode === 'abs' && gender && (gender === 'f') !== f.women) continue;
      out.push({ f, v, fights });
    }
    out.sort((a, b) => (dir === 'desc' ? b.v - a.v : a.v - b.v) || b.fights - a.fights);
    return out;
  }, [rows.data, fighters, byId, valueKey, minFights, mode, cat, gender, dir]);

  // posição com empates
  const ranks = useMemo(() => {
    const r: number[] = [];
    list.forEach((x, i) => r.push(i > 0 && x.v === list[i - 1].v ? r[i - 1] : i + 1));
    return r;
  }, [list]);
  const maxAbs = Math.max(...list.map((x) => Math.abs(x.v)), 1e-9);
  const scope = mode === 'cat' ? DIVISION_BY_KEY[cat]?.name : gender === 'f' ? 'Feminino — todas as categorias' : gender === 'm' ? 'Masculino — todas as categorias' : 'Peso absoluto — todas as categorias';

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Ranking</span>
        <h1 style={{ marginTop: 8 }}>{stat.label}{isForm ? ` · últimas ${win} lutas` : ''}</h1>
        <p>{scope}. Somente lutas no UFC, entre os lutadores do site.{stat.hint ? ` ${stat.hint}.` : ''}</p>
      </div>

      <div className="filters" style={{ marginBottom: 10 }}><RankTabs /></div>
      <div className="filters">
        <select className="select" value={statKey} onChange={(e) => set({ stat: e.target.value, ordem: null, min: null })} aria-label="Estatística" style={{ minWidth: 260 }}>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {RANK_STATS.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Modo">
          <button className={mode === 'cat' ? 'on' : ''} onClick={() => set({ modo: 'cat' })}>Por categoria</button>
          <button className={mode === 'abs' ? 'on' : ''} onClick={() => set({ modo: null })}>Peso absoluto</button>
        </div>
        {mode === 'cat' ? (
          <select className="select" value={cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Categoria">
            {MAIN_DIVISIONS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
          </select>
        ) : (
          <div className="seg" role="group" aria-label="Gênero">
            {[['', 'Todos'], ['m', 'Masculino'], ['f', 'Feminino']].map(([v, l]) => (
              <button key={v} className={gender === v ? 'on' : ''} onClick={() => set({ genero: v })}>{l}</button>
            ))}
          </div>
        )}
        {isForm && (
          <div className="seg" role="group" aria-label="Quantas lutas considerar">
            {[3, 5, 7, 10].map((n) => (
              <button key={n} className={win === n ? 'on' : ''} onClick={() => set({ n: String(n), min: null })}>Últimas {n}</button>
            ))}
          </div>
        )}
        <select className="select" value={minFights} onChange={(e) => set({ min: e.target.value })} aria-label="Mínimo de lutas">
          {[...new Set([1, 3, 5, 10, ...(isForm ? [win] : [])])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>Mín. {n} luta{n > 1 ? 's' : ''} no UFC</option>)}
        </select>
        <button className="btn btn-ghost" onClick={() => set({ ordem: dir === 'desc' ? 'asc' : 'desc' })} title="Inverter a ordem">
          {dir === 'desc' ? 'Maior → menor' : 'Menor → maior'}
        </button>
      </div>

      {rows.error ? <ErrorBox message={rows.error} /> : !rows.data || !fighters ? <Loading /> : (
        <>
          <p className="note" style={{ marginBottom: 12 }}>{list.length} lutador{list.length === 1 ? '' : 'es'}</p>
          <ol className="rank-list">
            {list.slice(0, limit).map((x, i) => (
              <li key={x.f.id}>
                <Link to={`/lutador/${x.f.slug}`} className="rank-row">
                  <span className={`rank-pos ${ranks[i] <= 3 ? `top${ranks[i]}` : ''}`}>{ranks[i]}</span>
                  <Avatar name={x.f.name} id={x.f.id} size="sm" />
                  <div className="rank-name">
                    <div className="nm"><Flag src={x.f.flag} country={x.f.country} /> {x.f.name} <FavButton kind="fighters" id={x.f.id} name={x.f.name} className="sm" /></div>
                    <div className="sub">
                      {mode === 'abs' && <>{DIVISION_BY_KEY[x.f.division]?.short} · </>}
                      {x.f.record.w}-{x.f.record.l}-{x.f.record.d} no UFC
                    </div>
                  </div>
                  <div className="rank-bar" aria-hidden="true"><i style={{ width: `${(Math.abs(x.v) / maxAbs) * 100}%` }} /></div>
                  <b className="rank-val">{stat.fmt(x.v)}</b>
                </Link>
              </li>
            ))}
          </ol>
          {list.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => setLimit((l) => l + 50)}>Mostrar mais</button>
            </div>
          )}
          {list.length === 0 && <div className="empty">Ninguém com esse filtro. Tente diminuir o mínimo de lutas.</div>}
          {isForm && <p className="note" style={{ marginTop: 14 }}>Por padrão só entra quem tem pelo menos {win} lutas no UFC (para a janela escolhida). Cada luta vale o resultado menos o esperado pelo Elo; as mais recentes pesam mais. 50 é o neutro.</p>}
          {stat.rate && <p className="note" style={{ marginTop: 14 }}>Taxas por minuto e percentuais exigem amostra: por padrão, só entra quem tem pelo menos 3 lutas no UFC.</p>}
        </>
      )}
    </div>
  );
}
