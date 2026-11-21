import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ResultBoutRow, UpcomingBoutRow } from '../components/events';
import FavButton from '../components/FavButton';
import { useFavorites } from '../lib/favorites';
import { ErrorBox, Icon, LiveDot, Loading } from '../components/ui';
import { currentBout, liveOf, useLive } from '../lib/live';
import { shortName } from '../lib/compare';
import { useEvents, useFighters } from '../lib/data';
import type { EventInfo, FighterSummary } from '../shared/types';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MON = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

type Filter = 'todos' | 'realizados' | 'proximos';

export default function Events() {
  const { data, error } = useEvents();
  const fighters = useFighters().data;
  const byId = useMemo(() => new Map((fighters ?? []).map((f) => [f.id, f])), [fighters]);
  const [params, setParams] = useSearchParams();
  const order = params.get('ordem') === 'recentes' ? 'recentes' : 'cronologica';
  const filter = (params.get('mostrar') as Filter) || 'proximos';
  const [open, setOpen] = useState<Set<string>>(() => new Set(params.get('aberto') ? [params.get('aberto')!] : []));
  const nextRef = useRef<HTMLDivElement>(null);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const list = useMemo(() => {
    if (!data) return [];
    let all = [...data.past, ...data.upcoming];
    if (filter === 'realizados') all = all.filter((e) => !e.upcoming);
    if (filter === 'proximos') all = all.filter((e) => e.upcoming);
    const key = (e: EventInfo) => e.date ?? '9999-12-31';
    all.sort((a, b) => key(a).localeCompare(key(b)));
    return order === 'recentes' ? all.reverse() : all;
  }, [data, filter, order]);

  const nextId = data?.upcoming[0]?.id ?? null;

  // grupos por mês
  const groups = useMemo(() => {
    const out: { label: string; events: EventInfo[] }[] = [];
    for (const e of list) {
      const label = e.date ? `${MONTHS[Number(e.date.slice(5, 7)) - 1]} de ${e.date.slice(0, 4)}` : 'Data a definir';
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, events: [] });
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [list]);

  useEffect(() => {
    const id = params.get('aberto');
    if (id) document.getElementById(`ev-${id}`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOpen = list.length > 0 && list.every((e) => open.has(e.id));

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Calendário</span>
        <h1 style={{ marginTop: 8 }}>Eventos</h1>
        <p>Todos os eventos do UFC desde janeiro de 2016, mais os próximos cards. Clique num evento para ver as lutas.</p>
      </div>

      {data && <LivePriority events={data.upcoming} />}

      <div className="filters">
        <div className="seg" role="group" aria-label="Mostrar">
          {([['todos', 'Todos'], ['realizados', 'Realizados'], ['proximos', 'Próximos']] as const).map(([v, l]) => (
            <button key={v} className={filter === v ? 'on' : ''} onClick={() => setParam('mostrar', v === 'proximos' ? null : v)}>{l}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Ordem">
          <button className={order === 'cronologica' ? 'on' : ''} onClick={() => setParam('ordem', null)}>Mais antigos primeiro</button>
          <button className={order === 'recentes' ? 'on' : ''} onClick={() => setParam('ordem', 'recentes')}>Mais recentes primeiro</button>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(list.map((e) => e.id)))}>
          {allOpen ? 'Recolher todos' : 'Expandir todos'}
        </button>
        {nextId && filter !== 'realizados' && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setOpen((s) => new Set(s).add(nextId));
              nextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            Ir para o próximo evento
          </button>
        )}
      </div>

      {error ? <ErrorBox message={error} /> : !data ? <Loading /> : (
        <div className="timeline">
          {groups.map((g) => (
            <section key={g.label} className="tl-group" aria-label={g.label}>
              <h2 className="tl-month">{g.label}</h2>
              {g.events.map((e) => (
                <div key={e.id} id={`ev-${e.id}`} ref={e.id === nextId ? nextRef : undefined} style={{ scrollMarginTop: 80 }}>
                  <EventItem e={e} open={open.has(e.id)} onToggle={() => toggle(e.id)} isNext={e.id === nextId} byId={byId} />
                </div>
              ))}
            </section>
          ))}
          {list.length === 0 && <div className="empty">Nenhum evento.</div>}
        </div>
      )}
    </div>
  );
}

/** Área prioritária do evento que está acontecendo agora: leva ao card e rola até a luta atual. */
function LivePriority({ events }: { events: EventInfo[] }) {
  const snap = useLive();
  const live = events.filter((e) => snap.liveEvents.has(e.id.replace(/^espn-/, '')));
  if (!live.length) return null;
  return (
    <div className="live-priority-list">
      {live.map((e) => {
        const info = currentBout(snap, e.id, e.bouts);
        const lastWin = info.last?.live.winner;
        return (
          <Link key={e.id} to={`/evento/${e.id}?ir=atual`} className="live-priority" aria-label={`Evento ao vivo: ${e.name}. Ir para a luta atual`}>
            <LiveDot label="Evento ao vivo" />
            <div className="lp-name">{e.name}</div>
            {info.current && (
              <div className="lp-now">
                {info.isLive ? 'Agora' : 'A seguir'}: {shortName(info.current.a.name)} × {shortName(info.current.b.name)}
                {info.isLive && (() => { const lv = liveOf(snap, e.id, info.current!.a.name, info.current!.b.name); return lv ? ` · R${lv.period} ${lv.clock}` : ''; })()}
              </div>
            )}
            {info.last && (
              <div className="lp-last">
                Última concluída: <b>{lastWin ?? 'sem vencedor'}</b>{lastWin ? ` venceu ${shortName(info.last.live.names.find((n) => n !== lastWin) ?? '')}` : ''} · {[info.last.live.method, `R${info.last.live.period}`, info.last.live.clock].filter(Boolean).join(' · ')}
              </div>
            )}
            <span className="lp-cta">Ir para a luta atual →</span>
          </Link>
        );
      })}
    </div>
  );
}

function EventItem({ e, open, onToggle, isNext, byId }: { e: EventInfo; open: boolean; onToggle: () => void; isNext: boolean; byId: Map<string, FighterSummary> }) {
  const main = e.upcoming ? e.bouts[0] : e.fights[0];
  const panelId = `evp-${e.id}`;
  let mainLine = '';
  if (main) {
    mainLine = `${shortName(main.a.name)} vs ${shortName(main.b.name)}`;
    if (!e.upcoming && 'winner' in main) {
      const w = main.winner === 0 ? main.a.name : main.winner === 1 ? main.b.name : null;
      mainLine += w ? ` · venceu ${shortName(w)}` : main.result === 'D' ? ' · empate' : ' · sem resultado';
    }
  }
  const favEvent = useFavorites().events.includes(e.id);
  const count = e.upcoming ? e.bouts.length : e.fights.length;
  const isLive = useLive().liveEvents.has(e.id.replace(/^espn-/, ''));
  const prospects = e.upcoming ? new Set(e.bouts.flatMap((b) => [b.a.id, b.b.id]).filter((id): id is string => !!id && !!byId.get(id)?.prospect)).size : 0;
  return (
    <div className={`tl-item ${open ? 'open' : ''} ${e.upcoming ? 'upcoming' : ''} ${favEvent ? 'is-fav' : ''}`}>
      <FavButton kind="events" id={e.id} name={e.name} className="corner" />
      <button className="tl-head" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
        <div className="tl-date">
          {e.date ? (
            <>
              <b>{e.date.slice(8, 10)}</b>
              <span>{MON[Number(e.date.slice(5, 7)) - 1]}</span>
            </>
          ) : (
            <span>A definir</span>
          )}
        </div>
        <div className="tl-info">
          <div className="tl-badges">
            {isLive && <LiveDot />}
            {isNext && !isLive && <span className="chip chip-red">Próximo</span>}
            {e.upcoming && !isNext && <span className="chip chip-up">Em breve</span>}
            {!e.upcoming && <span className="chip">Realizado</span>}
            <span className="note">{count} luta{count === 1 ? '' : 's'}</span>
            {prospects > 0 && <span className="prospect-tag" style={{ marginLeft: 0 }} title="Lutadores prospectos neste card">{prospects} prospecto{prospects === 1 ? '' : 's'}</span>}
          </div>
          <div className="tl-name">{e.name}</div>
          <div className="tl-sub">{[mainLine, e.location].filter(Boolean).join(' · ')}</div>
        </div>
        <Icon name="chev" className="tl-chev" />
      </button>
      {open && (
        <div className="tl-panel" id={panelId}>
          {e.upcoming
            ? e.bouts.map((b, i) => <UpcomingBoutRow key={i} b={b} byId={byId} />)
            : e.fights.map((f) => <ResultBoutRow key={f.id} f={f} />)}
          {count === 0 && <p className="note">Card ainda não divulgado.</p>}
          <div style={{ marginTop: 14 }}>
            <Link to={`/evento/${e.id}`} className="btn btn-ghost">Abrir página do evento</Link>
          </div>
        </div>
      )}
    </div>
  );
}
