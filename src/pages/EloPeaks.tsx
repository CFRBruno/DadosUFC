import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FavButton from '../components/FavButton';
import RankTabs from '../components/RankTabs';
import { ErrorBox, Loading } from '../components/ui';
import { useJson } from '../lib/data';
import { fmtDate } from '../lib/format';
import { DIVISION_BY_KEY, MAIN_DIVISIONS, type DivisionKey } from '../shared/divisions';
import type { EloPeakRow } from '../shared/types';

export default function EloPeaks() {
  const rows = useJson<EloPeakRow[]>('elo-peaks.json');
  const [params, setParams] = useSearchParams();
  const scope = params.get('escopo') === 'cat' ? 'cat' : 'abs';
  const cat = (params.get('cat') as DivisionKey) || 'LW';
  const gender = params.get('genero') ?? '';
  const minFights = Number(params.get('min') ?? 5);
  const since = Number(params.get('desde') ?? 0); // última luta a partir de
  const onlyActive = params.get('ativos') === '1';
  const [limit, setLimit] = useState(50);

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
    setLimit(50);
  };

  const list = useMemo(() => {
    if (!rows.data) return [];
    return rows.data
      .filter((r) => r.f >= minFights && r.y1 >= since && (!onlyActive || r.a))
      .filter((r) => (scope === 'cat' ? r.v === cat : !gender || (gender === 'f') === !!DIVISION_BY_KEY[r.v]?.women))
      .sort((a, b) => b.p - a.p || b.f - a.f);
  }, [rows.data, minFights, since, onlyActive, scope, cat, gender]);

  const ranks = useMemo(() => {
    const r: number[] = [];
    list.forEach((x, i) => r.push(i > 0 && x.p === list[i - 1].p ? r[i - 1] : i + 1));
    return r;
  }, [list]);
  const top = list[0]?.p ?? 1500;
  const low = Math.min(1500, ...list.slice(0, 200).map((x) => x.p));
  const where = scope === 'cat' ? DIVISION_BY_KEY[cat]?.name : gender === 'f' ? 'Feminino — todas as categorias' : gender === 'm' ? 'Masculino — todas as categorias' : 'Peso absoluto — todas as categorias';

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Ranking</span>
        <h1 style={{ marginTop: 8 }}>Elo histórico</h1>
        <p>O maior rating Elo que cada lutador já alcançou no UFC, desde 1993. {where}.</p>
      </div>

      <div className="filters" style={{ marginBottom: 10 }}><RankTabs /></div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Escopo">
          <button className={scope === 'cat' ? 'on' : ''} onClick={() => set({ escopo: 'cat' })}>Por categoria</button>
          <button className={scope === 'abs' ? 'on' : ''} onClick={() => set({ escopo: null })}>Peso absoluto</button>
        </div>
        {scope === 'cat' ? (
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
        <select className="select" value={minFights} onChange={(e) => set({ min: e.target.value === '5' ? null : e.target.value })} aria-label="Mínimo de lutas">
          {[1, 3, 5, 10, 15].map((n) => <option key={n} value={n}>Mín. {n} luta{n > 1 ? 's' : ''} no UFC</option>)}
        </select>
        <select className="select" value={since} onChange={(e) => set({ desde: e.target.value === '0' ? null : e.target.value })} aria-label="Era">
          <option value="0">Todas as eras</option>
          <option value="2010">Lutou desde 2010</option>
          <option value="2016">Lutou desde 2016</option>
          <option value="2024">Lutou desde 2024</option>
        </select>
        <label className="chip" style={{ height: 42, padding: '0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => set({ ativos: e.target.checked ? '1' : null })} /> Só ativos em 2026
        </label>
      </div>

      {rows.error ? <ErrorBox message={rows.error} /> : !rows.data ? <Loading /> : (
        <>
          <p className="note" style={{ marginBottom: 12 }}>{list.length.toLocaleString('pt-BR')} lutadores</p>
          <ol className="rank-list">
            {list.slice(0, limit).map((x, i) => {
              const inner = (
                <>
                  <span className={`rank-pos ${ranks[i] <= 3 ? `top${ranks[i]}` : ''}`}>{ranks[i]}</span>
                  <div className="rank-name">
                    <div className="nm">{x.n} <FavButton kind="fighters" id={x.i} name={x.n} className="sm" />{x.a && <span className="chip chip-up" style={{ marginLeft: 8 }}>ativo</span>}</div>
                    <div className="sub">{DIVISION_BY_KEY[x.v]?.short} · {x.y0 === x.y1 ? x.y0 : `${x.y0}–${x.y1}`} · {x.f} lutas · pico em {fmtDate(x.pd)} · atual {x.c}</div>
                  </div>
                  <div className="rank-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, ((x.p - low) / Math.max(1, top - low)) * 100)}%` }} /></div>
                  <b className="rank-val">{x.p}</b>
                </>
              );
              return <li key={`${x.n}-${x.y0}-${i}`}>{x.s ? <Link to={`/lutador/${x.s}`} className="rank-row elo-row">{inner}</Link> : <div className="rank-row elo-row">{inner}</div>}</li>;
            })}
          </ol>
          {list.length > limit && <div style={{ textAlign: 'center', marginTop: 20 }}><button className="btn btn-outline" onClick={() => setLimit((l) => l + 50)}>Mostrar mais</button></div>}
          {list.length === 0 && <div className="empty">Ninguém com esse filtro.</div>}
          <p className="note" style={{ marginTop: 14 }}>
            O Elo é calculado por mim a partir dos resultados no UFC (todos começam em 1500; vitórias contra adversários fortes e por finalização valem mais) e mede só o desempenho dentro do UFC. Por padrão só entram lutadores com 5 ou mais lutas, porque poucos resultados inflam o pico. Comparar eras tem limite: o nível de cada época e a população de lutadores mudam. Lutadores sem link não têm página no site (lutaram antes de 2016).
          </p>
        </>
      )}
    </div>
  );
}
