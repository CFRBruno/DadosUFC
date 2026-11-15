// Leitura e normalização dos CSVs do UFCStats.

import Papa from 'papaparse';
import { parseWeightClass, divisionLbs, type DivisionKey } from '../../src/shared/divisions';
import { parseMethod, translateDetail, translateStance, type DecisionKind, type MethodKey } from '../../src/shared/translate';
import { STAT_KEYS, type StatLine } from '../../src/shared/types';
import { readRaw } from './fetch';

type Row = Record<string, string>;
const parse = (txt: string): Row[] => Papa.parse<Row>(txt, { header: true, skipEmptyLines: true }).data;

export interface Bio {
  id: string;
  name: string;
  nickname: string;
  heightIn: number | null;
  reachIn: number | null;
  weightLbs: number | null;
  stance: string;
  dob: string | null;
}

export interface RawFight {
  id: string;
  eventId: string;
  event: string;
  date: string;
  location: string;
  division: DivisionKey;
  title: boolean;
  tournament: boolean;
  /** rótulo original da luta (ex.: "Ultimate Fighter 33 Welterweight Tournament Title Bout") */
  weightClassRaw: string;
  interim: boolean;
  women: boolean;
  scheduledRounds: number;
  method: MethodKey;
  decision: DecisionKind;
  detail: string;
  endRound: number;
  endTime: string;
  durationSec: number;
  referee: string;
  fighters: [{ id: string; name: string }, { id: string; name: string }];
  winner: 0 | 1 | null;
  outcome: 'W' | 'D' | 'NC';
  stats: [StatLine, StatLine] | null;
  rounds: [StatLine, StatLine][];
}

export interface Dataset {
  bios: Map<string, Bio>;
  fights: RawFight[];       // ordem cronológica
  events: Map<string, { id: string; name: string; date: string; location: string }>;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const idFromUrl = (u: string) => u.match(/([0-9a-f]{16})\/?$/)?.[1] ?? u;

function isoDate(s: string): string | null {
  const t = Date.parse(clean(s) + ' UTC');
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function inches(s: string): number | null {
  const m = clean(s).match(/(\d+)'\s*(\d+)?/);
  if (m) return Number(m[1]) * 12 + Number(m[2] ?? 0);
  const r = clean(s).match(/^([\d.]+)"/);
  return r ? Number(r[1]) : null;
}

const ofPair = (s: string): [number, number] => {
  const m = clean(s).match(/(\d+)\s+of\s+(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
const secs = (s: string) => {
  const m = clean(s).match(/^(\d+):(\d+)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const num = (s: string) => {
  const n = Number(clean(s));
  return Number.isFinite(n) ? n : 0;
};

function statLine(r: Row): StatLine {
  const [sigL, sigA] = ofPair(r['SIG.STR.']);
  const [totL, totA] = ofPair(r['TOTAL STR.']);
  const [tdL, tdA] = ofPair(r['TD']);
  const [headL, headA] = ofPair(r['HEAD']);
  const [bodyL, bodyA] = ofPair(r['BODY']);
  const [legL, legA] = ofPair(r['LEG']);
  const [distL, distA] = ofPair(r['DISTANCE']);
  const [clinchL, clinchA] = ofPair(r['CLINCH']);
  const [groundL, groundA] = ofPair(r['GROUND']);
  const o: Record<string, number> = {
    kd: num(r['KD']), sigL, sigA, totL, totA, tdL, tdA, sub: num(r['SUB.ATT']), rev: num(r['REV.']), ctrl: secs(r['CTRL']),
    headL, headA, bodyL, bodyA, legL, legA, distL, distA, clinchL, clinchA, groundL, groundA,
  };
  return STAT_KEYS.map((k) => o[k]);
}

const sumLines = (lines: StatLine[]): StatLine =>
  STAT_KEYS.map((_, i) => lines.reduce((s, l) => s + (l[i] ?? 0), 0));

function roundDurations(fmt: string): { scheduled: number; mins: number[] } {
  const sched = Number(fmt.match(/^(\d+)\s*Rnd/)?.[1] ?? 1);
  const mins = (fmt.match(/\(([\d-]+)\)/)?.[1] ?? '').split('-').map(Number).filter((n) => n > 0);
  return { scheduled: sched, mins };
}

export async function loadDataset(): Promise<Dataset> {
  const [evRows, resRows, statRows, detRows, tottRows] = await Promise.all([
    readRaw('ufc_event_details.csv').then(parse),
    readRaw('ufc_fight_results.csv').then(parse),
    readRaw('ufc_fight_stats.csv').then(parse),
    readRaw('ufc_fighter_details.csv').then(parse),
    readRaw('ufc_fighter_tott.csv').then(parse),
  ]);

  // Eventos
  const events = new Map<string, { id: string; name: string; date: string; location: string }>();
  const eventByName = new Map<string, string>();
  for (const r of evRows) {
    const date = isoDate(r.DATE);
    if (!date) continue;
    const id = idFromUrl(r.URL);
    events.set(id, { id, name: clean(r.EVENT), date, location: clean(r.LOCATION) });
    eventByName.set(norm(r.EVENT), id);
  }

  // Biografias
  const bios = new Map<string, Bio>();
  for (const r of tottRows) {
    const id = idFromUrl(r.URL);
    bios.set(id, {
      id,
      name: clean(r.FIGHTER),
      nickname: '',
      heightIn: inches(r.HEIGHT),
      reachIn: inches(r.REACH),
      weightLbs: Number(clean(r.WEIGHT).match(/\d+/)?.[0]) || null,
      stance: translateStance(r.STANCE),
      dob: isoDate(r.DOB),
    });
  }
  for (const r of detRows) {
    const id = idFromUrl(r.URL);
    const name = clean(`${r.FIRST} ${r.LAST}`);
    const b = bios.get(id);
    if (b) {
      b.nickname = clean(r.NICKNAME);
      if (!b.name) b.name = name;
    } else {
      bios.set(id, { id, name, nickname: clean(r.NICKNAME), heightIn: null, reachIn: null, weightLbs: null, stance: '', dob: null });
    }
  }
  const idsByName = new Map<string, string[]>();
  for (const b of bios.values()) {
    const k = norm(b.name);
    if (!idsByName.has(k)) idsByName.set(k, []);
    idsByName.get(k)!.push(b.id);
  }

  /** Resolve nome → id, desambiguando homônimos por peso e idade. */
  const resolve = (name: string, division: DivisionKey, date: string): string => {
    const cands = idsByName.get(norm(name)) ?? [];
    if (cands.length === 1) return cands[0];
    if (cands.length === 0) {
      const id = 'x' + norm(name);
      if (!bios.has(id)) bios.set(id, { id, name: clean(name), nickname: '', heightIn: null, reachIn: null, weightLbs: null, stance: '', dob: null });
      return id;
    }
    const lbs = divisionLbs(division);
    let best = cands[0];
    let bestScore = Infinity;
    for (const id of cands) {
      const b = bios.get(id)!;
      let score = lbs && b.weightLbs ? Math.abs(b.weightLbs - lbs) : 25;
      if (b.dob) {
        const age = (Date.parse(date) - Date.parse(b.dob)) / (365.25 * 864e5);
        if (age < 18 || age > 48) score += 100;
      }
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  };

  // Estatísticas por luta (chave: evento + luta)
  const statsByBout = new Map<string, Map<string, { round: number; line: StatLine }[]>>();
  for (const r of statRows) {
    const key = norm(r.EVENT) + '|' + norm(r.BOUT);
    if (!statsByBout.has(key)) statsByBout.set(key, new Map());
    const m = statsByBout.get(key)!;
    const f = norm(r.FIGHTER);
    if (!m.has(f)) m.set(f, []);
    const round = Number(clean(r.ROUND).match(/\d+/)?.[0] ?? 0);
    m.get(f)!.push({ round, line: statLine(r) });
  }

  // Lutas
  const seen = new Set<string>();
  const fights: RawFight[] = [];
  // Linhas com evento conhecido primeiro (dedupe de eventos renomeados)
  const sorted = [...resRows].sort((x, y) => Number(eventByName.has(norm(y.EVENT))) - Number(eventByName.has(norm(x.EVENT))));
  for (const r of sorted) {
    const id = idFromUrl(r.URL);
    if (seen.has(id)) continue;
    const evId = eventByName.get(norm(r.EVENT));
    if (!evId) continue;
    seen.add(id);
    const ev = events.get(evId)!;
    const [na, nb] = clean(r.BOUT).split(' vs. ').map(clean);
    if (!na || !nb) continue;
    const wc = parseWeightClass(r.WEIGHTCLASS);
    const pm = parseMethod(r.METHOD);
    const outcome = clean(r.OUTCOME);
    let winner: 0 | 1 | null = null;
    let res: 'W' | 'D' | 'NC' = 'W';
    if (outcome === 'W/L') winner = 0;
    else if (outcome === 'L/W') winner = 1;
    else if (outcome.startsWith('D')) res = 'D';
    else res = 'NC';
    const method: MethodKey = res === 'NC' ? 'NC' : pm.method;
    const endRound = Number(clean(r.ROUND)) || 1;
    const { scheduled, mins } = roundDurations(clean(r['TIME FORMAT']));
    let durationSec = secs(r.TIME);
    for (let i = 0; i < endRound - 1; i++) durationSec += (mins[i] ?? 5) * 60;

    const st = statsByBout.get(norm(r.EVENT) + '|' + norm(r.BOUT));
    let stats: [StatLine, StatLine] | null = null;
    let rounds: [StatLine, StatLine][] = [];
    const ra = st?.get(norm(na));
    const rb = st?.get(norm(nb));
    if (ra && rb && ra.length && rb.length) {
      ra.sort((x, y) => x.round - y.round);
      rb.sort((x, y) => x.round - y.round);
      const n = Math.min(ra.length, rb.length);
      rounds = Array.from({ length: n }, (_, i) => [ra[i].line, rb[i].line] as [StatLine, StatLine]);
      stats = [sumLines(ra.map((x) => x.line)), sumLines(rb.map((x) => x.line))];
    }

    fights.push({
      id,
      eventId: evId,
      event: ev.name,
      date: ev.date,
      location: ev.location,
      division: wc.division,
      title: wc.title,
      tournament: wc.tournament,
      weightClassRaw: clean(r.WEIGHTCLASS),
      interim: wc.interim,
      women: wc.women,
      scheduledRounds: scheduled,
      method,
      decision: pm.decision,
      detail: translateDetail(method, r.DETAILS),
      endRound,
      endTime: clean(r.TIME),
      durationSec,
      referee: clean(r.REFEREE),
      fighters: [
        { id: resolve(na, wc.division, ev.date), name: na },
        { id: resolve(nb, wc.division, ev.date), name: nb },
      ],
      winner,
      outcome: res,
      stats,
      rounds,
    });
  }

  // Ordem cronológica (estável dentro do mesmo evento)
  fights.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { bios, fights, events };
}
