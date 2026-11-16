import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import RankTabs from '../components/RankTabs';
import { ErrorBox, Loading } from '../components/ui';
import { useJson } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { DIVISION_BY_KEY, MAIN_DIVISIONS, type DivisionKey } from '../shared/divisions';
import type { UpcomingForecast, UpsetFight } from '../shared/types';

const METHOD: Record<string, string> = { KO: 'nocaute', SUB: 'finalização', DEC: 'decisão', DQ: 'desclassificação', OTHER: 'outro' };
const PERIODS = [['2015', 'Desde 2015'], ['2020', 'Desde 2020'], ['2025', 'Desde 2025'], ['2026', 'Só 2026']] as const;

/** Alterna entre lutas já realizadas e lutas dos próximos eventos. */
function WhenToggle({ when, onChange }: { when: 'passadas' | 'proximas'; onChange: (w: 'passadas' | 'proximas') => void }) {
  return (
    <div className="seg" role="group" aria-label="Lutas">
      <button className={when === 'passadas' ? 'on' : ''} onClick={() => onChange('passadas')}>Já realizadas</button>
      <button className={when === 'proximas' ? 'on' : ''} onClick={() => onChange('proximas')}>Próximos eventos</button>
    </div>
  );
}

export default function Upsets() {
  const [params, setParams] = useSearchParams();
  const when = params.get('quando') === 'proximas' ? 'proximas' : 'passadas';
  const setWhen = (w: 'passadas' | 'proximas') => {
    const p = new URLSearchParams(params);
    if (w === 'proximas') p.set('quando', 'proximas'); else p.delete('quando');
    p.delete('modo');
    setParams(p, { replace: true });
  };
  return when === 'proximas' ? <UpcomingView toggle={<WhenToggle when={when} onChange={setWhen} />} /> : <PastView toggle={<WhenToggle when={when} onChange={setWhen} />} />;
}

function PastView({ toggle }: { toggle: React.ReactNode }) {
  const rows = useJson<UpsetFight[]>('upsets.json');
  const [params, setParams] = useSearchParams();
  const mode = params.get('modo') === 'favoritos' ? 'favoritos' : 'zebras';
  const scope = params.get('escopo') === 'cat' ? 'cat' : 'abs';
  const cat = (params.get('cat') as DivisionKey) || 'LW';
  const gender = params.get('genero') ?? '';
  const from = PERIODS.some(([v]) => v === params.get('desde')) ? params.get('desde')! : '2015';
  const onlyTitle = params.get('cinturao') === '1';
  const [limit, setLimit] = useState(50);

  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
    setLimit(50);
  };

  const list = useMemo(() => {
    if (!rows.data) return [];
    const out = rows.data
      .filter((f) => f.d >= `${from}-01-01` && (!onlyTitle || f.t))
      .filter((f) => (scope === 'cat' ? f.v === cat : !gender || (gender === 'f') === !!DIVISION_BY_KEY[f.v]?.women))
      .map((f) => ({ f, pw: f.w === 0 ? f.p : 1 - f.p })); // chance pré-luta do vencedor
    out.sort((x, y) => (mode === 'zebras' ? x.pw - y.pw : y.pw - x.pw) || (x.f.d < y.f.d ? 1 : -1));
    return out;
  }, [rows.data, from, onlyTitle, scope, cat, gender, mode]);

  const ranks = useMemo(() => {
    const r: number[] = [];
    list.forEach((x, i) => r.push(i > 0 && Math.round(x.pw * 1000) === Math.round(list[i - 1].pw * 1000) ? r[i - 1] : i + 1));
    return r;
  }, [list]);

  const where = scope === 'cat' ? DIVISION_BY_KEY[cat]?.name : gender === 'f' ? 'Feminino — todas as categorias' : gender === 'm' ? 'Masculino — todas as categorias' : 'Peso absoluto — todas as categorias';

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Ranking</span>
        <h1 style={{ marginTop: 8 }}>{mode === 'zebras' ? 'Maiores zebras' : 'Favoritos que venceram'}</h1>
        <p>
          {mode === 'zebras'
            ? 'Lutas em que o vencedor tinha a menor chance antes da luta, segundo o modelo.'
            : 'Lutas em que o vencedor era o maior favorito antes da luta, segundo o modelo.'} {where}.
        </p>
      </div>

      <div className="filters" style={{ marginBottom: 10 }}><RankTabs /></div>
      <div className="filters">
        {toggle}
        <div className="seg" role="group" aria-label="Tipo">
          <button className={mode === 'zebras' ? 'on' : ''} onClick={() => set({ modo: null })}>Zebras</button>
          <button className={mode === 'favoritos' ? 'on' : ''} onClick={() => set({ modo: 'favoritos' })}>Favoritos que venceram</button>
        </div>
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
        <select className="select" value={from} onChange={(e) => set({ desde: e.target.value === '2015' ? null : e.target.value })} aria-label="Período">
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="chip" style={{ height: 42, padding: '0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyTitle} onChange={(e) => set({ cinturao: e.target.checked ? '1' : null })} /> Só disputas de cinturão
        </label>
      </div>

      {rows.error ? <ErrorBox message={rows.error} /> : !rows.data ? <Loading /> : (
        <>
          <p className="note" style={{ marginBottom: 12 }}>{list.length.toLocaleString('pt-BR')} lutas</p>
          <ol className="rank-list">
            {list.slice(0, limit).map((x, i) => {
              const { f, pw } = x;
              const win = f.w === 0 ? f.a : f.b, lose = f.w === 0 ? f.b : f.a;
              const slug = win[1] ?? lose[1];
              const inner = (
                <>
                  <span className={`rank-pos ${ranks[i] <= 3 ? `top${ranks[i]}` : ''}`}>{ranks[i]}</span>
                  <div className="up-main">
                    <div className="up-names">
                      <b className="up-win">{win[0]}</b>
                      <span className="up-def">venceu</span>
                      <span className="up-lose">{lose[0]}</span>
                    </div>
                    <div className="sub">
                      {f.t && <span style={{ color: 'var(--brand)' }}>Cinturão · </span>}
                      {METHOD[f.m] ?? f.m} · {DIVISION_BY_KEY[f.v]?.short} · {f.e} · {fmtDate(f.d)}
                    </div>
                  </div>
                  <div className="up-odds" title="Chance de cada um antes da luta">
                    <div className="up-bar"><i style={{ width: `${pw * 100}%` }} /></div>
                    <small>vencedor {fmtPct(pw)} · perdedor {fmtPct(1 - pw)}</small>
                  </div>
                  <b className="rank-val">{fmtPct(pw)}</b>
                </>
              );
              return (
                <li key={f.i}>
                  {slug ? <Link to={`/lutador/${slug}/luta/${f.i}`} className="rank-row up-row">{inner}</Link> : <div className="rank-row up-row">{inner}</div>}
                </li>
              );
            })}
          </ol>
          {list.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 20 }}><button className="btn btn-outline" onClick={() => setLimit((l) => l + 50)}>Mostrar mais</button></div>
          )}
          {list.length === 0 && <div className="empty">Nenhuma luta com esse filtro.</div>}
          <p className="note" style={{ marginTop: 14 }}>
            A chance é a que o modelo dava antes da luta, calculada só com o que se sabia na época (modelo treinado apenas com lutas anteriores). A partir de 2021 a previsão inclui também o sinal de mercado da época; antes disso, só estatísticas, por isso as zebras mais antigas tendem a ser menos extremas. Empates e lutas sem resultado ficam de fora.
          </p>
        </>
      )}
    </div>
  );
}

type UpMode = 'favoritos' | 'equilibradas' | 'discordam';

/** Zebras e favoritos nos próximos eventos: o modelo final aplicado ao retrato atual de cada lutador. */
function UpcomingView({ toggle }: { toggle: React.ReactNode }) {
  const rows = useJson<UpcomingForecast[]>('upcoming-forecast.json');
  const [params, setParams] = useSearchParams();
  const mode: UpMode = params.get('modo') === 'equilibradas' ? 'equilibradas' : params.get('modo') === 'discordam' ? 'discordam' : 'favoritos';
  const scope = params.get('escopo') === 'cat' ? 'cat' : 'abs';
  const cat = (params.get('cat') as DivisionKey) || 'LW';
  const gender = params.get('genero') ?? '';
  const onlyTitle = params.get('cinturao') === '1';
  const set = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };

  const list = useMemo(() => {
    if (!rows.data) return [];
    const out = rows.data
      .filter((f) => (!onlyTitle || f.t) && (scope === 'cat' ? f.v === cat : !gender || (gender === 'f') === !!DIVISION_BY_KEY[f.v]?.women))
      .map((f) => ({ f, fav: Math.max(f.p, 1 - f.p), disc: f.pm == null ? -1 : Math.abs(f.pm - f.ps) + ((f.pm >= 0.5) !== (f.ps >= 0.5) ? 1 : 0) }));
    if (mode === 'favoritos') out.sort((x, y) => y.fav - x.fav);
    else if (mode === 'equilibradas') out.sort((x, y) => x.fav - y.fav);
    else return out.filter((x) => x.disc >= 0).sort((x, y) => y.disc - x.disc);
    return out;
  }, [rows.data, mode, scope, cat, gender, onlyTitle]);

  const title = mode === 'favoritos' ? 'Maiores favoritos e azarões' : mode === 'equilibradas' ? 'Lutas mais equilibradas' : 'Onde estatísticas e mercado discordam';
  const intro = mode === 'favoritos'
    ? 'Os confrontos marcados em que o modelo vê a maior vantagem de um lado. O azarão é quem tem mais chance de dar zebra se a previsão errar.'
    : mode === 'equilibradas' ? 'Os confrontos marcados em que o modelo vê o resultado mais aberto.'
    : 'Lutas em que as estatísticas e o mercado apontam favoritos diferentes ou confiam em níveis muito diferentes: onde há mais espaço para uma zebra.';

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Ranking · próximos eventos</span>
        <h1 style={{ marginTop: 8 }}>{title}</h1>
        <p>{intro}</p>
      </div>
      <div className="filters" style={{ marginBottom: 10 }}><RankTabs /></div>
      <div className="filters">
        {toggle}
        <div className="seg" role="group" aria-label="Tipo">
          <button className={mode === 'favoritos' ? 'on' : ''} onClick={() => set({ modo: null })}>Favoritos e azarões</button>
          <button className={mode === 'equilibradas' ? 'on' : ''} onClick={() => set({ modo: 'equilibradas' })}>Mais equilibradas</button>
          <button className={mode === 'discordam' ? 'on' : ''} onClick={() => set({ modo: 'discordam' })}>Estatísticas × mercado</button>
        </div>
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
        <label className="chip" style={{ height: 42, padding: '0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyTitle} onChange={(e) => set({ cinturao: e.target.checked ? '1' : null })} /> Só disputas de cinturão
        </label>
      </div>

      {rows.error ? <ErrorBox message={rows.error} /> : !rows.data ? <Loading /> : (
        <>
          <p className="note" style={{ marginBottom: 12 }}>{list.length} luta{list.length === 1 ? '' : 's'}</p>
          <ol className="rank-list">
            {list.map(({ f, fav }, i) => {
              const aFav = f.p >= 0.5;
              const favP = aFav ? f.a : f.b, dogP = aFav ? f.b : f.a;
              const stFav = f.ps >= 0.5;
              const inner = (
                <>
                  <span className="rank-pos">{i + 1}</span>
                  <div className="up-main">
                    <div className="up-names">
                      <b className="up-win">{favP[0]}</b>
                      <span className="up-def">favorito(a) sobre</span>
                      <span className="up-lose">{dogP[0]}</span>
                    </div>
                    <div className="sub">
                      {f.t && <span style={{ color: 'var(--brand)' }}>Cinturão · </span>}
                      {DIVISION_BY_KEY[f.v]?.short} · {f.rounds} rounds · {f.event.name} · {fmtDate(f.event.date)}
                      {f.pm != null && <> · estatísticas {fmtPct(Math.max(f.ps, 1 - f.ps))} {stFav ? f.a[0].split(' ').slice(-1)[0] : f.b[0].split(' ').slice(-1)[0]}, mercado {fmtPct(Math.max(f.pm, 1 - f.pm))} {f.pm >= 0.5 ? f.a[0].split(' ').slice(-1)[0] : f.b[0].split(' ').slice(-1)[0]}</>}
                    </div>
                  </div>
                  <div className="up-odds" title="Chance de cada um (previsão combinada)">
                    <div className="up-bar"><i style={{ width: `${fav * 100}%` }} /></div>
                    <small>favorito {fmtPct(fav)} · azarão {fmtPct(1 - fav)}</small>
                  </div>
                  <b className="rank-val">{mode === 'discordam' && f.pm != null ? `${Math.round(Math.abs(f.pm - f.ps) * 100)} pts` : fmtPct(fav)}</b>
                </>
              );
              const cmp = f.a[1] && f.b[1] ? `/comparar?a=${f.a[1]}&b=${f.b[1]}&r=${f.rounds}` : null;
              return <li key={`${f.event.id}-${f.a[0]}-${f.b[0]}`}>{cmp ? <Link to={cmp} className="rank-row up-row">{inner}</Link> : <div className="rank-row up-row">{inner}</div>}</li>;
            })}
          </ol>
          {list.length === 0 && <div className="empty">Nenhuma luta com esse filtro. {mode === 'discordam' ? 'A comparação com o mercado só existe para lutas que já têm linha.' : ''}</div>}
          <p className="note" style={{ marginTop: 14 }}>
            Previsões do modelo final aplicado ao retrato atual de cada lutador; em lutas com linha de mercado, a chance combina estatísticas e mercado. Só aparecem lutas em que os dois lutadores já têm histórico no site; estreantes ficam de fora. Clique numa luta para abrir a análise completa.
          </p>
        </>
      )}
    </div>
  );
}
