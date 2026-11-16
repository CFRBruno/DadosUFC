import { useEffect, useMemo, useState } from 'react';
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
  oficial: 'Ranking oficial',
} as const;

export default function Fighters() {
  const { data, error } = useFighters();

  // clicar fora (ou abrir outro menu) fecha os menus de filtro; as seleções ficam na URL
  // ao abrir um menu, empurra-o para dentro da tela (celular: o botão fica à esquerda e o menu é mais largo que o espaço)
  useEffect(() => {
    const onToggle = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (!d.matches?.('details.country-filter') || !d.open) return;
      const menu = d.querySelector<HTMLElement>('.country-menu');
      if (!menu) return;
      menu.style.translate = '0px';
      requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        const M = 12;
        let dx = 0;
        if (r.right > window.innerWidth - M) dx = window.innerWidth - M - r.right;
        if (r.left + dx < M) dx = M - r.left;
        menu.style.translate = `${dx}px`;
      });
    };
    document.addEventListener('toggle', onToggle, true);
    return () => document.removeEventListener('toggle', onToggle, true);
  }, []);

  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>('details.country-filter[open]').forEach((d) => {
        if (!(e.target instanceof Node) || !d.contains(e.target)) d.open = false;
      });
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close(e);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, []);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const div = params.get('cat') ?? '';
  const gender = params.get('genero') ?? '';
  const sort = (params.get('ordem') ?? 'nome') as keyof typeof SORTS;
  const onlyUpcoming = params.get('marcada') === '1';
  const styles = useMemo(() => (params.get('estilo') ?? '').split('|').filter(Boolean), [params]);
  const [countryQ, setCountryQ] = useState('');
  const countries = useMemo(() => (params.get('pais') ?? '').split('|').filter(Boolean), [params]);
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

  // base sem o filtro de país: dela saem as opções do filtro e as contagens
  const base = useMemo(
    () => (data ?? []).filter((f) => (!div || f.division === div) && (!gender || (gender === 'f' ? f.women : !f.women)) && (!onlyUpcoming || f.upcoming)),
    [data, div, gender, onlyUpcoming],
  );
  const countryOptions = useMemo(() => {
    const m = new Map<string, { n: number; flag: string }>();
    for (const f of base) {
      if (!f.country) continue;
      const c = m.get(f.country) ?? { n: 0, flag: f.flag };
      c.n++;
      m.set(f.country, c);
    }
    for (const c of countries) if (!m.has(c)) m.set(c, { n: 0, flag: '' }); // mantém marcado mesmo sem lutadores
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], 'pt-BR'));
  }, [base, countries]);
  const styleOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of base) if (f.style) m.set(f.style, (m.get(f.style) ?? 0) + 1);
    for (const s of styles) if (!m.has(s)) m.set(s, 0);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base, styles]);
  const toggleStyle = (c: string) => set('estilo', (styles.includes(c) ? styles.filter((x) => x !== c) : [...styles, c]).join('|'));
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const shownCountries = countryOptions.filter(([c]) => !countryQ || norm(c).includes(norm(countryQ)));
  const toggleCountry = (c: string) => set('pais', (countries.includes(c) ? countries.filter((x) => x !== c) : [...countries, c]).join('|'));

  const list = useMemo(() => {
    if (!data) return [];
    let l = base;
    if (countries.length) l = l.filter((f) => countries.includes(f.country));
    if (styles.length) l = l.filter((f) => styles.includes(f.style));
    if (q) return searchFighters(l, q);
    l = [...l];
    if (sort === 'elo') l.sort((a, b) => b.elo - a.elo);
    else if (sort === 'vitorias') l.sort((a, b) => b.record.w - a.record.w || b.elo - a.elo);
    else if (sort === 'oficial') l.sort((a, b) => (a.official?.pos ?? 99) - (b.official?.pos ?? 99) || b.elo - a.elo);
    else if (sort === 'recente') l.sort((a, b) => (b.lastFight ?? '').localeCompare(a.lastFight ?? ''));
    return l;
  }, [data, base, countries, styles, q, sort]);

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
        <details className="country-filter">
          <summary className="select">
            {countries.length === 0 ? 'Todas as nacionalidades' : countries.length === 1 ? countries[0] : `${countries.length} nacionalidades`}
          </summary>
          <div className="country-menu">
            <input className="input country-search" placeholder="Buscar país…" value={countryQ} onChange={(e) => setCountryQ(e.target.value)} aria-label="Buscar nacionalidade" />
            {countries.length > 0 && <button className="country-clear" onClick={() => set('pais', '')}>Limpar seleção</button>}
            {shownCountries.length === 0 && <div className="note" style={{ padding: 8 }}>Nenhum país encontrado.</div>}
            {shownCountries.map(([c, o]) => (
              <label key={c}>
                <input type="checkbox" checked={countries.includes(c)} onChange={() => toggleCountry(c)} />
                {o.flag ? <img src={o.flag} alt="" loading="lazy" /> : <span className="country-noflag" />}
                <span>{c}</span>
                <b>{o.n}</b>
              </label>
            ))}
          </div>
        </details>
        <details className="country-filter">
          <summary className="select">
            {styles.length === 0 ? 'Todos os estilos' : styles.length === 1 ? styles[0] : `${styles.length} estilos`}
          </summary>
          <div className="country-menu">
            {styles.length > 0 && <button className="country-clear" onClick={() => set('estilo', '')}>Limpar seleção</button>}
            {styleOptions.map(([c, n]) => (
              <label key={c}>
                <input type="checkbox" checked={styles.includes(c)} onChange={() => toggleStyle(c)} />
                <span>{c}</span>
                <b>{n}</b>
              </label>
            ))}
          </div>
        </details>
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
