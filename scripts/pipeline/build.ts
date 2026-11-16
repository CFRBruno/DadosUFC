// Processamento cronológico: priors por categoria, Elo, estados pré-luta e treino.

import type { DivisionKey } from '../../src/shared/divisions';
import { addFight, emptyState, featureDiff, featureValues, methodPrior, methodShares, type MethodShares } from '../../src/shared/model';
import type { ModelState, Priors, Result } from '../../src/shared/types';
import { S } from '../../src/shared/types';
import type { Bio, RawFight } from './load';

export const TRAIN_FROM = '2008-01-01';

// --- Priors -------------------------------------------------------------------

export function computePriors(fights: RawFight[]): { priors: Record<string, Priors>; fiveRoundDecFactor: number } {
  type Acc = { min: number; time: number; sigL: number; sigA: number; tdL: number; tdA: number; sub: number; kd: number; ctrl: number; sides: number; koL: number; ko: number; subW: number; dec: number };
  const blank = (): Acc => ({ min: 0, time: 0, sigL: 0, sigA: 0, tdL: 0, tdA: 0, sub: 0, kd: 0, ctrl: 0, sides: 0, koL: 0, ko: 0, subW: 0, dec: 0 });
  const acc = new Map<string, Acc>();
  let dec3 = 0, tot3 = 0, dec5 = 0, tot5 = 0;
  for (const f of fights) {
    if (f.date < '2015-01-01') continue;
    const keys = [f.division as string, 'ALL'];
    for (const k of keys) {
      if (!acc.has(k)) acc.set(k, blank());
      const a = acc.get(k)!;
      if (f.stats) {
        for (const side of f.stats) {
          a.min += f.durationSec / 60;
          a.time += f.durationSec;
          a.sigL += side[S.sigL]; a.sigA += side[S.sigA];
          a.tdL += side[S.tdL]; a.tdA += side[S.tdA];
          a.sub += side[S.sub]; a.kd += side[S.kd]; a.ctrl += side[S.ctrl];
        }
      }
      if (f.winner != null) {
        a.sides += 2;
        if (f.method === 'KO') { a.ko++; a.koL++; }
        else if (f.method === 'SUB') a.subW++;
        else if (f.method === 'DEC') a.dec++;
        if (f.scheduledRounds === 3 && k === 'ALL') {
          tot3++;
          if (f.method === 'DEC') dec3++;
        }
        if (f.scheduledRounds === 5 && k === 'ALL') {
          tot5++;
          if (f.method === 'DEC') dec5++;
        }
      }
    }
  }
  const priors: Record<string, Priors> = {};
  for (const [k, a] of acc) {
    const fin = a.ko + a.subW + a.dec || 1;
    priors[k] = {
      slpm: a.sigL / a.min,
      sapm: a.sigL / a.min,
      acc: a.sigL / a.sigA,
      def: 1 - a.sigL / a.sigA,
      td: (a.tdL / a.min) * 15,
      tdAcc: a.tdL / a.tdA,
      tdDef: 1 - a.tdL / a.tdA,
      sub: (a.sub / a.min) * 15,
      kd: (a.kd / a.min) * 15,
      ctrl: a.ctrl / a.time,
      koLoss: a.koL / Math.max(1, a.sides),
      method: { KO: a.ko / fin, SUB: a.subW / fin, DEC: a.dec / fin },
    };
  }
  return { priors, fiveRoundDecFactor: dec5 / tot5 / (dec3 / tot3) };
}

export function priorsFor(priors: Record<string, Priors>, division: DivisionKey): Priors {
  return priors[division] && division !== 'CW' && division !== 'OPEN' ? priors[division] : priors.ALL;
}

// --- Elo ------------------------------------------------------------------------

const ELO_K = 36;
const FINISH_BONUS = 1.2;

export function eloExpected(ra: number, rb: number) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

// --- Processamento cronológico ---------------------------------------------------

export interface Sample {
  id: string;
  date: string;
  x: number[];
  y: number;             // 1 se A venceu
  eloA: number;
  eloB: number;
  method: 'KO' | 'SUB' | 'DEC' | 'OTHER';
  sharesA: MethodShares; // método se A vencer
  sharesB: MethodShares;
}

export interface FightSnapshot {
  eloBefore: [number, number];
  eloAfter: [number, number];
  recordBefore: [string, string];
}

export interface Processed {
  states: Map<string, ModelState>;
  snapshots: Map<string, FightSnapshot>;
  eloHistory: Map<string, [string, number][]>;
  samples: Sample[];
}

const recStr = (s: ModelState) => `${s.wins}-${s.losses}-${s.draws}`;

export function processChronologically(
  fights: RawFight[],
  bios: Map<string, Bio>,
  priors: Record<string, Priors>,
  fiveRoundDecFactor: number,
): Processed {
  const states = new Map<string, ModelState>();
  const snapshots = new Map<string, FightSnapshot>();
  const eloHistory = new Map<string, [string, number][]>();
  const samples: Sample[] = [];

  const stateOf = (id: string) => {
    let s = states.get(id);
    if (!s) {
      s = emptyState();
      const b = bios.get(id);
      if (b) {
        s.dob = b.dob;
        s.reach = b.reachIn;
        s.height = b.heightIn;
      }
      states.set(id, s);
      eloHistory.set(id, []);
    }
    return s;
  };

  for (const f of fights) {
    const a = stateOf(f.fighters[0].id);
    const b = stateOf(f.fighters[1].id);
    const p = priorsFor(priors, f.division);

    if (f.date >= TRAIN_FROM) {
      const fa = featureValues(a, p, f.date).v;
      const fb = featureValues(b, p, f.date).v;
      const prior = methodPrior(p, f.scheduledRounds, fiveRoundDecFactor);
      samples.push({
        id: f.id,
        date: f.date,
        x: featureDiff(fa, fb),
        y: f.winner == null ? 0.5 : f.winner === 0 ? 1 : 0,
        eloA: a.elo,
        eloB: b.elo,
        method: f.method === 'KO' || f.method === 'SUB' || f.method === 'DEC' ? f.method : 'OTHER',
        sharesA: methodShares(a, b, prior),
        sharesB: methodShares(b, a, prior),
      });
    }

    const snap: FightSnapshot = {
      eloBefore: [a.elo, b.elo],
      eloAfter: [a.elo, b.elo],
      recordBefore: [recStr(a), recStr(b)],
    };

    // Elo
    if (f.outcome !== 'NC') {
      const ea = eloExpected(a.elo, b.elo);
      const sa = f.winner === 0 ? 1 : f.winner === 1 ? 0 : 0.5;
      const k = ELO_K * (f.method === 'KO' || f.method === 'SUB' ? FINISH_BONUS : 1);
      const delta = k * (sa - ea);
      a.elo += delta;
      b.elo -= delta;
    }
    snap.eloAfter = [a.elo, b.elo];
    snapshots.set(f.id, snap);
    eloHistory.get(f.fighters[0].id)!.push([f.date, Math.round(a.elo)]);
    eloHistory.get(f.fighters[1].id)!.push([f.date, Math.round(b.elo)]);

    // Estado de carreira
    const resA: Result = f.outcome === 'NC' ? 'NC' : f.outcome === 'D' ? 'D' : f.winner === 0 ? 'W' : 'L';
    const resB: Result = resA === 'W' ? 'L' : resA === 'L' ? 'W' : resA;
    addFight(a, { me: f.stats?.[0] ?? null, opp: f.stats?.[1] ?? null, result: resA, method: f.method, durationSec: f.durationSec, date: f.date });
    addFight(b, { me: f.stats?.[1] ?? null, opp: f.stats?.[0] ?? null, result: resB, method: f.method, durationSec: f.durationSec, date: f.date });
  }
  return { states, snapshots, eloHistory, samples };
}
