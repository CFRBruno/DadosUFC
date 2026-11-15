import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FighterCard, searchFighters } from '../components/fighters';
import { ErrorBox, Loading } from '../components/ui';
import { useFighters } from '../lib/data';
import { MAIN_DIVISIONS } from '../shared/divisions';

const SORTS = {
  nome: 'Nome',
  elo: 'Rating Elo',
  vitorias: 'Vitórias no UFC',
  recente: 'Luta mais recente',
} as const;

export default function Fighters() {
  const { data, error } = useFighters();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const div = params.get('cat') ?? '';
  const gender = params.get('genero') ?? '';
  const sort = (params.get('ordem') ?? 'nome') as keyof typeof SORTS;
  const onlyUpcoming = params.get('marcada') === '1';
  const [limit, setLimit] = useState(60);

  const setMany = (changes: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
    setLimit(60);
  };
  const set = (k: string, v: string) => setMany({ [k]: v });

  const list = useMemo(() => {
    if (!data) return [];
    let l = data.filter(
      (f) =>
        (!div || f.division === div) &&
        (!gender || (gender === 'f' ? f.women : !f.women)) &&
        (!onlyUpcoming || f.upcoming),
    );
    if (q) return searchFighters(l, q);
    l = [...l];
    if (sort === 'elo') l.sort((a, b) => b.elo - a.elo);
    else if (sort === 'vitorias') l.sort((a, b) => b.record.w - a.record.w || b.elo - a.elo);
    else if (sort === 'recente') l.sort((a, b) => (b.lastFight ?? '').localeCompare(a.lastFight ?? ''));
    return l;
  }, [data, q, div, gender, sort, onlyUpcoming]);

  const divisions = MAIN_DIVISIONS.filter((d) => !gender || (gender === 'f' ? d.women : !d.women));

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Lutaram no UFC em 2026</span>
        <h1 style={{ marginTop: 8 }}>Lutadores</h1>
        <p>Todos os atletas que lutaram no UFC desde janeiro de 2026 ou que têm luta marcada. Estatísticas consideram somente a carreira dentro do UFC.</p>
      </div>
      <div className="filters">
        <input className="input search" placeholder="Buscar por nome ou apelido…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar lutador" />
        <div className="seg" role="group" aria-label="Gênero">
          {[['', 'Todos'], ['m', 'Masculino'], ['f', 'Feminino']].map(([v, l]) => (
            <button key={v} className={gender === v ? 'on' : ''} onClick={() => setMany({ genero: v, cat: '' })}>{l}</button>
          ))}
        </div>
        <select className="select" value={div} onChange={(e) => set('cat', e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {divisions.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </select>
        <select className="select" value={sort} onChange={(e) => set('ordem', e.target.value)} aria-label="Ordenar" disabled={!!q}>
          {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>Ordenar: {l}</option>)}
        </select>
        <label className="chip" style={{ height: 42, padding: '0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyUpcoming} onChange={(e) => set('marcada', e.target.checked ? '1' : '')} /> Com luta marcada
        </label>
      </div>
      {error ? <ErrorBox message={error} /> : !data ? <Loading /> : (
        <>
          <p className="note" style={{ marginBottom: 12 }}>{list.length} lutador{list.length === 1 ? '' : 'es'}</p>
          <div className="grid-3">
            {list.slice(0, limit).map((f) => <FighterCard key={f.id} f={f} />)}
          </div>
          {list.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button className="btn btn-outline" onClick={() => setLimit((l) => l + 60)}>Mostrar mais</button>
            </div>
          )}
          {list.length === 0 && <div className="empty">Nenhum lutador encontrado.</div>}
        </>
      )}
    </div>
  );
}
