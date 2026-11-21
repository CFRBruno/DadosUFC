// Resultados ao vivo: o navegador consulta o placar público da ESPN (a API aceita chamadas de qualquer site).
// Um único consultor compartilhado serve todos os componentes: 20 s com luta rolando ou prestes a começar,
// 60 s nos demais casos, e pausa com a aba escondida.
import { useSyncExternalStore } from 'react';

export interface LiveBout {
  state: 'pre' | 'live' | 'done';
  /** round atual (ao vivo) ou em que acabou */
  period: number;
  rounds: number;
  /** relógio do round (ao vivo) ou minutagem em que acabou */
  clock: string;
  winner: string | null;
  method: string | null;
  names: [string, string];
  /** ids da ESPN: luta e os dois lutadores (na ordem de `names`), para buscar estatísticas */
  compId: string;
  eventId: string;
  ids: [string, string];
}

interface Snapshot { bouts: Map<string, LiveBout>; liveEvents: Set<string>; fetchedAt: number }

const URL = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const pairKey = (a: string, b: string) => [norm(a), norm(b)].sort().join('|');

const METHOD: [RegExp, string][] = [[/kotko|ko|tko/i, 'KO/TKO'], [/submission|sub/i, 'Finalização'], [/decision/i, 'Decisão']];

interface EspnComp {
  status: { period?: number; displayClock?: string; type: { name: string; state?: string } };
  format?: { regulation?: { periods?: number } };
  id?: string;
  competitors: { id?: string; winner?: boolean; athlete: { displayName: string } }[];
  details?: { type?: { text?: string } }[];
}
interface EspnEvent { id: string; status: { type: { name: string } }; competitions?: EspnComp[] }

function parse(events: EspnEvent[]): Snapshot {
  const bouts = new Map<string, LiveBout>();
  const liveEvents = new Set<string>();
  for (const e of events) {
    let anyLive = false;
    for (const c of e.competitions ?? []) {
      if (c.competitors.length !== 2) continue;
      const t = c.status.type.name;
      // pelo "state" da ESPN (in = rolando, inclusive no intervalo entre rounds; post = encerrada), com o nome como reserva
      const st = c.status.type.state;
      const state = st === 'in' || t === 'STATUS_IN_PROGRESS' ? 'live'
        : t === 'STATUS_FINAL' || (st === 'post' && !/CANCEL|POSTPON/.test(t)) ? 'done'
        : t === 'STATUS_PRE_FIGHT' ? 'pre'
        : t !== 'STATUS_SCHEDULED' && st && st !== 'pre' ? 'live' // qualquer outro estado intermediário da ESPN
        : null;
      if (!state) continue;
      const [x, y] = c.competitors.map((k) => k.athlete.displayName) as [string, string];
      const win = c.competitors.find((k) => k.winner)?.athlete.displayName ?? null;
      const txt = (c.details ?? []).map((d) => d.type?.text ?? '').find((s) => /Unofficial Winner/i.test(s)) ?? '';
      const method = state === 'done' ? METHOD.find(([re]) => re.test(txt.replace(/Unofficial Winner/i, '')))?.[1] ?? null : null;
      if (state === 'live') anyLive = true;
      bouts.set(`${e.id}|${pairKey(x, y)}`, { state, period: c.status.period ?? 0, rounds: c.format?.regulation?.periods ?? 3, clock: c.status.displayClock ?? '', winner: win, method, names: [x, y], compId: c.id ?? '', eventId: e.id, ids: [c.competitors[0].id ?? '', c.competitors[1].id ?? ''] });
      bouts.set(pairKey(x, y), bouts.get(`${e.id}|${pairKey(x, y)}`)!);
    }
    if (anyLive || e.status.type.name === 'STATUS_IN_PROGRESS') liveEvents.add(e.id);
  }
  return { bouts, liveEvents, fetchedAt: Date.now() };
}

let snap: Snapshot = { bouts: new Map(), liveEvents: new Set(), fetchedAt: 0 };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function tick() {
  timer = null;
  let next = 60_000;
  if (!document.hidden) {
    try {
      const res = await fetch(`${URL}?t=${Math.floor(Date.now() / 10_000)}`); // sem cabeçalhos extras: evita o preflight de CORS
      if (res.ok) {
        snap = parse(((await res.json()) as { events?: EspnEvent[] }).events ?? []);
        subs.forEach((f) => f());
        if (snap.liveEvents.size || [...snap.bouts.values()].some((b) => b.state !== 'done')) next = 20_000;
      }
    } catch { /* sem rede: tenta de novo no próximo ciclo */ }
  }
  if (subs.size) timer = setTimeout(tick, next);
}

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1 && !timer) void tick();
  const vis = () => { if (!document.hidden && subs.size && !timer) void tick(); };
  document.addEventListener('visibilitychange', vis);
  return () => {
    subs.delete(f);
    document.removeEventListener('visibilitychange', vis);
    if (!subs.size && timer) { clearTimeout(timer); timer = null; }
  };
}

/** Estado ao vivo atual (atualiza sozinho enquanto algum componente o usa). */
export function useLive(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

export function liveOf(s: Snapshot, eventId: string | null | undefined, a: string, b: string): LiveBout | null {
  return (eventId && s.bouts.get(`${eventId.replace(/^espn-/, '')}|${pairKey(a, b)}`)) || s.bouts.get(pairKey(a, b)) || null;
}

export interface CurrentInfo<T> {
  /** luta rolando agora, ou a próxima a começar */
  current: T | null;
  /** true quando `current` está rolando de fato */
  isLive: boolean;
  /** última luta concluída (a mais perto da luta principal), com o resultado */
  last: { bout: T; live: LiveBout } | null;
  doneCount: number;
}

/**
 * Qual é a luta "atual" de um evento ao vivo. O card é listado da luta principal (order 0) para baixo
 * e acontece de baixo para cima; então a atual é a que está rolando ou, não havendo, a primeira ainda
 * não concluída depois da última luta encerrada (a de maior `order` entre as pendentes).
 */
export function currentBout<T extends { a: { name: string }; b: { name: string }; order: number }>(s: Snapshot, eventId: string, bouts: T[]): CurrentInfo<T> {
  const withLive = bouts.map((b) => ({ b, lv: liveOf(s, eventId, b.a.name, b.b.name) }));
  const liveNow = withLive.find((x) => x.lv?.state === 'live');
  const done = withLive.filter((x) => x.lv?.state === 'done').sort((x, y) => x.b.order - y.b.order);
  const pending = withLive.filter((x) => x.lv?.state !== 'done').sort((x, y) => y.b.order - x.b.order);
  const next = liveNow ?? pending[0] ?? null;
  return {
    current: next ? next.b : null,
    isLive: !!liveNow,
    last: done[0] ? { bout: done[0].b, live: done[0].lv! } : null,
    doneCount: done.length,
  };
}

// --- Estatísticas da luta (ESPN core API): totais acumulados até agora + lances por round ----------------------

export interface FightStats {
  /** por lutador (na ordem de `names`): valores acumulados da luta inteira */
  fighters: [Record<string, number>, Record<string, number>];
  /** lances por round (knockdowns e quedas) e marcadores de fim de round */
  rounds: { period: number; events: { clock: string; text: string }[]; ended: boolean }[];
  fetchedAt: number;
}

const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events';
const PLAY_PT: Record<string, string> = { Knockdown: 'Knockdown', Takedown: 'Queda', 'Takedown Attempt': 'Tentativa de queda', 'Submission Attempt': 'Tentativa de finalização', 'Significant Strike': 'Golpe significativo' };

async function getJson<T>(u: string): Promise<T> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

export async function fetchFightStats(b: LiveBout): Promise<FightStats> {
  const base = `${CORE}/${b.eventId}/competitions/${b.compId}`;
  const stat = async (id: string) => {
    const d = await getJson<{ splits?: { categories?: { stats?: { abbreviation: string; value: number; displayValue: string }[] }[] } }>(`${base}/competitors/${id}/statistics/0`);
    const out: Record<string, number> = {};
    for (const c of d.splits?.categories ?? []) for (const s of c.stats ?? []) {
      const k = s.abbreviation.trim();
      out[k] = k === 'TIC' ? clockSec(s.displayValue) : Number(s.value);
    }
    return out;
  };
  const plays = async () => {
    const d = await getJson<{ items?: { type?: { text?: string }; period?: { number?: number }; clock?: { displayValue?: string } }[] }>(`${base}/plays?limit=300`);
    const by = new Map<number, { period: number; events: { clock: string; text: string }[]; ended: boolean }>();
    for (const p of d.items ?? []) {
      const n = p.period?.number ?? 0;
      if (!n) continue;
      if (!by.has(n)) by.set(n, { period: n, events: [], ended: false });
      const r = by.get(n)!;
      const t = p.type?.text ?? '';
      if (t === 'Round End') r.ended = true;
      else if (PLAY_PT[t] && t !== 'Takedown Attempt') r.events.push({ clock: p.clock?.displayValue ?? '', text: PLAY_PT[t] });
    }
    return [...by.values()].sort((x, y) => x.period - y.period);
  };
  const [a, c, rounds] = await Promise.all([stat(b.ids[0]), stat(b.ids[1]), plays().catch(() => [])]);
  return { fighters: [a, c], rounds, fetchedAt: Date.now() };
}

export const clockSec = (s: string) => { const m = /^(\d+):(\d{2})$/.exec(s ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
