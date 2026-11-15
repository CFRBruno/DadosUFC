import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, ErrorBox, Loading } from '../components/ui';
import { useJson } from '../lib/data';
import { divisionName, fmtDate, methodText } from '../lib/format';
import { MAIN_DIVISIONS, type DivisionKey } from '../shared/divisions';
import type { TitleFight } from '../shared/types';

const Timeline = lazy(() => import('./titles/Timeline'));

export default function Titles() {
  const [params, setParams] = useSearchParams();
  const view = params.get('ver') === 'lista' ? 'lista' : 'linha';
  const set = (v: string) => {
    const p = new URLSearchParams(params);
    if (v === 'lista') { p.set('ver', 'lista'); p.delete('peso'); } else p.delete('ver');
    setParams(p, { replace: true });
  };
  return (
    <>
      <div className="container" style={{ paddingTop: 20 }}>
        <div className="seg" role="tablist" aria-label="Visualização">
          <button role="tab" aria-selected={view === 'linha'} className={view === 'linha' ? 'on' : ''} onClick={() => set('linha')}>Linha do tempo</button>
          <button role="tab" aria-selected={view === 'lista'} className={view === 'lista' ? 'on' : ''} onClick={() => set('lista')}>Todas as disputas</button>
        </div>
      </div>
      {view === 'linha' ? (
        <div style={{ marginTop: 16 }}>
          <Suspense fallback={<Loading />}><Timeline /></Suspense>
        </div>
      ) : <TitleList />}
    </>
  );
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function TitleList() {
  const { data, error } = useJson<TitleFight[]>('titles.json');
  const [params, setParams] = useSearchParams();
  const cat = (params.get('cat') as DivisionKey | null) ?? '';
  const kind = params.get('tipo') ?? '';
  const withTournaments = params.get('torneios') === '1';
  const order = params.get('ordem') === 'antigas' ? 'antigas' : 'recentes';
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(80);

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
    setLimit(80);
  };

  const list = useMemo(() => {
    if (!data) return [];
    const nq = norm(q.trim());
    const l = data.filter(
      (t) =>
        (withTournaments || !t.tournament) &&
        (!cat || t.division === cat) &&
        (!kind || (kind === 'interino' ? t.interim : !t.interim && !t.tournament)) &&
        (!nq || norm(t.a.name).includes(nq) || norm(t.b.name).includes(nq)),
    );
    return order === 'antigas' ? [...l].reverse() : l;
  }, [data, cat, kind, withTournaments, order, q]);

  // última disputa linear por categoria
  const latest = useMemo(() => {
    if (!data) return [];
    return MAIN_DIVISIONS.map((d) => ({ d, t: data.find((t) => t.division === d.key && !t.interim && !t.tournament) })).filter((x) => x.t);
  }, [data]);

  // agrupado por ano
  const groups = useMemo(() => {
    const out: { year: string; items: TitleFight[] }[] = [];
    for (const t of list.slice(0, limit)) {
      const y = t.date.slice(0, 4);
      if (!out.length || out[out.length - 1].year !== y) out.push({ year: y, items: [] });
      out[out.length - 1].items.push(t);
    }
    return out;
  }, [list, limit]);

  const total = data?.filter((t) => !t.tournament).length ?? 0;

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Histórico desde 1993</span>
        <h1 style={{ marginTop: 8 }}>Disputas de <span className="accent">cinturão</span></h1>
        <p>Todas as {total} lutas valendo cinturão do UFC (linear e interino). Finais de torneio, como TUF e Road to UFC, aparecem só se você marcar a opção.</p>
      </div>

      {error ? <ErrorBox message={error} /> : !data ? <Loading /> : (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>Última disputa por categoria</h2>
          </div>
          <div className="grid-3">
            {latest.map(({ d, t }) => {
              const w = t!.winner === 0 ? t!.a : t!.winner === 1 ? t!.b : null;
              const l = t!.winner === 0 ? t!.b : t!.winner === 1 ? t!.a : null;
              return (
                <button key={d.key} className="belt-card" onClick={() => set('cat', d.key)}>
                  <div className="eyebrow">{d.name}</div>
                  {w ? (
                    <div className="belt-winner">
                      <Avatar name={w.name} id={w.id} size="sm" />
                      <div>
                        <b>{w.name}</b>
                        <div className="note">venceu {l?.name} · {fmtDate(t!.date)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="note" style={{ marginTop: 8 }}>{t!.a.name} × {t!.b.name}: {t!.result === 'D' ? 'empate' : 'sem resultado'} · {fmtDate(t!.date)}</div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="note" style={{ marginTop: 10 }}>Vencedor da última luta valendo o cinturão linear. O site não acompanha cinturões vagos ou abandonados.</p>

          <div className="section-title"><h2>Todas as disputas</h2></div>
          <div className="filters">
            <input className="input search" placeholder="Buscar lutador…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(80); }} aria-label="Buscar lutador" />
            <select className="select" value={cat} onChange={(e) => set('cat', e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {MAIN_DIVISIONS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </select>
            <div className="seg" role="group" aria-label="Tipo">
              {[['', 'Todas'], ['linear', 'Linear'], ['interino', 'Interino']].map(([v, l]) => (
                <button key={v} className={kind === v ? 'on' : ''} onClick={() => set('tipo', v)}>{l}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Ordem">
              <button className={order === 'recentes' ? 'on' : ''} onClick={() => set('ordem', null)}>Mais recentes</button>
              <button className={order === 'antigas' ? 'on' : ''} onClick={() => set('ordem', 'antigas')}>Mais antigas</button>
            </div>
            <label className="chip" style={{ height: 42, padding: '0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={withTournaments} onChange={(e) => set('torneios', e.target.checked ? '1' : null)} /> Incluir finais de torneio
            </label>
          </div>
          <p className="note" style={{ marginBottom: 8 }}>{list.length} luta{list.length === 1 ? '' : 's'}</p>

          {groups.map((g) => (
            <section key={g.year}>
              <h3 className="tl-month" style={{ paddingLeft: 2 }}>{g.year}</h3>
              <div className="fight-list">
                {g.items.map((t) => <TitleRow key={t.id} t={t} />)}
              </div>
            </section>
          ))}
          {list.length > limit && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => setLimit((l) => l + 80)}>Mostrar mais</button>
            </div>
          )}
          {list.length === 0 && <div className="empty">Nenhuma disputa com esse filtro.</div>}
        </>
      )}
    </div>
  );
}

function Name({ p, win }: { p: TitleFight['a']; win: boolean }) {
  const cls = win ? 'belt-w' : 'belt-l';
  return p.slug ? <Link to={`/lutador/${p.slug}`} className={cls}>{p.name}</Link> : <span className={cls}>{p.name}</span>;
}

function TitleRow({ t }: { t: TitleFight }) {
  const decided = t.winner != null;
  const w = t.winner === 1 ? t.b : t.a;
  const l = t.winner === 1 ? t.a : t.b;
  return (
    <div className="title-row">
      <div className="title-date">{fmtDate(t.date)}</div>
      <div className="title-main">
        <div className="title-tags">
          <span className="chip">{t.tournament ? t.label || 'Torneio' : divisionName(t.division)}</span>
          {t.interim && <span className="chip chip-rank">Interino</span>}
          {t.tournament && <span className="chip chip-style">Final de torneio</span>}
          <span className="note">{t.event}</span>
        </div>
        <div className="title-fighters">
          {decided ? (
            <><Name p={w} win /> <span className="muted">venceu</span> <Name p={l} win={false} /></>
          ) : (
            <><Name p={t.a} win={false} /> <span className="muted">×</span> <Name p={t.b} win={false} /> <span className="muted">— {t.result === 'D' ? 'empate' : 'sem resultado'}</span></>
          )}
        </div>
      </div>
      <div className="title-how">
        {t.result === 'NC' ? 'Sem resultado' : t.result === 'D' ? 'Empate' : methodText(t.method, t.decision, t.detail)}
        <small>R{t.endRound} · {t.endTime}{t.scheduledRounds ? ` · ${t.scheduledRounds} rounds` : ''}</small>
        {t.statsSlug && <Link to={`/lutador/${t.statsSlug}/luta/${t.id}`} className="title-link">Estatísticas →</Link>}
      </div>
    </div>
  );
}
