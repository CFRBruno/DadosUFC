// Pontuação dos jurados (total da luta) nas decisões, via ESPN.
// A ESPN só publica o TOTAL de cada jurado (ex.: 29-28), não a pontuação round a round.
// O que for coletado fica em data/scorecards/archive.json (versionado); cada execução
// completa as lutas que faltam, das mais recentes para as mais antigas (limite por execução).

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './fetch';
import type { RawFight } from './load';

export const SC_FILE = 'data/scorecards/archive.json';
const FIRST_YEAR = 2015;
const PER_RUN = 260;

export interface ScEntry { d: string; a: string; b: string; j: { n: string; a: number; b: number }[] }
export type ScArchive = Record<string, ScEntry>;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function loadScorecards(): Promise<ScArchive> {
  try { return JSON.parse(await readFile(SC_FILE, 'utf8')); } catch { return {}; }
}
async function save(arch: ScArchive) {
  const items = Object.entries(arch).sort((x, y) => y[1].d.localeCompare(x[1].d) || x[0].localeCompare(y[0]));
  await writeFile(SC_FILE, '{\n' + items.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
}

interface SbComp { id: string; date: string; status?: { type?: { name?: string } }; competitors: { id: string; athlete: { displayName: string } }[] }
interface SbEvent { id: string; competitions?: SbComp[] }

async function scoreboard(year: number, current: boolean): Promise<SbEvent[]> {
  const file = path.join(RAW_DIR, `espn-sb-${year}.json`);
  if (!current) {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* baixa abaixo */ }
  }
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${year}0101-${year}1231&limit=400`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const events = ((await res.json()) as { events?: SbEvent[] }).events ?? [];
  if (!current) await writeFile(file, JSON.stringify(events));
  return events;
}

const idOf = (ref?: string) => /(?:athletes|officials)\/(\d+)/.exec(ref ?? '')?.[1];

async function fetchComp(eventId: string, comp: SbComp): Promise<ScEntry | null> {
  const base = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${eventId}/competitions/${comp.id}`;
  const get = async (u: string) => { const r = await fetch(u, { signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<any>; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [offs, l0, l1] = await Promise.all([
    get(`${base}/officials?lang=en&region=us`),
    get(`${base}/competitors/${comp.competitors[0].id}/linescores`),
    get(`${base}/competitors/${comp.competitors[1].id}/linescores`),
  ]);
  const names = new Map<string, string>();
  for (const o of offs.items ?? []) if (o.position?.name === 'Judge') names.set(String(o.id), `${o.firstName} ${o.lastName}`.trim());
  const scores = (l: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = new Map<string, number>();
    for (const it of l.items ?? []) for (const ls of it.linescores ?? []) { const id = idOf(ls.official?.$ref); if (id && typeof ls.value === 'number') m.set(id, ls.value); }
    return m;
  };
  const sa = scores(l0), sb = scores(l1);
  const j = [...names.entries()].flatMap(([id, n]) => (sa.has(id) && sb.has(id) ? [{ n, a: sa.get(id)!, b: sb.get(id)! }] : []));
  return j.length ? { d: comp.date.slice(0, 10), a: comp.competitors[0].athlete.displayName, b: comp.competitors[1].athlete.displayName, j } : null;
}

/** Completa o arquivo com as decisões que ainda não têm pontuação. */
export async function updateScorecards(arch: ScArchive, fights: RawFight[], offline: boolean): Promise<void> {
  if (offline) return;
  const decisions = new Set(fights.filter((f) => f.method === 'DEC' && f.date >= `${FIRST_YEAR}-01-01`).flatMap((f) => {
    const [x, y] = f.fighters.map((s) => norm(s.name));
    return [`${f.date}|${x}|${y}`, `${f.date}|${y}|${x}`];
  }));
  const thisYear = new Date().getUTCFullYear();
  const todo: { eventId: string; comp: SbComp }[] = [];
  const have = new Set(Object.keys(arch));
  for (let y = thisYear; y >= FIRST_YEAR; y--) {
    let events: SbEvent[];
    try { events = await scoreboard(y, y >= thisYear - 1); } catch (e) { console.warn(`  ! Scorecards: calendário ${y} indisponível (${(e as Error).message})`); continue; }
    for (const ev of events) for (const c of ev.competitions ?? []) {
      if (c.competitors?.length !== 2 || c.status?.type?.name !== 'STATUS_FINAL' || have.has(c.id)) continue;
      const names = c.competitors.map((k) => norm(k.athlete.displayName));
      const d = c.date.slice(0, 10);
      const prev = new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
      if ([d, prev].some((dd) => decisions.has(`${dd}|${names[0]}|${names[1]}`))) todo.push({ eventId: ev.id, comp: c });
    }
    if (todo.length >= PER_RUN) break;
  }
  const batch = todo.slice(0, PER_RUN);
  let i = 0, got = 0, failed = 0;
  const worker = async () => {
    while (i < batch.length) {
      const t = batch[i++];
      try { const e = await fetchComp(t.eventId, t.comp); if (e) { arch[t.comp.id] = e; got++; } } catch { failed++; }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  if (got) await save(arch);
  console.log(`  ✓ Scorecards: ${got} novas de ${batch.length} tentadas (${todo.length - batch.length} pendentes${failed ? `, ${failed} falhas` : ''}); arquivo com ${Object.keys(arch).length} decisões`);
}

/** Pontuação dos jurados da luta (na ordem dos lutadores informados), ou null. */
export function scorecardLookup(arch: ScArchive): (date: string, a: string, b: string) => { name: string; a: number; b: number }[] | null {
  const idx = new Map<string, ScEntry>();
  for (const e of Object.values(arch)) {
    const t = Date.parse(e.d);
    for (const k of [0, -1, 1]) idx.set(`${new Date(t + k * 864e5).toISOString().slice(0, 10)}|${norm(e.a)}|${norm(e.b)}`, e);
  }
  return (date, an, bn) => {
    const x = norm(an), y = norm(bn);
    const e = idx.get(`${date}|${x}|${y}`);
    if (e) return e.j.map((j) => ({ name: j.n, a: j.a, b: j.b }));
    const r = idx.get(`${date}|${y}|${x}`);
    return r ? r.j.map((j) => ({ name: j.n, a: j.b, b: j.a })) : null;
  };
}
