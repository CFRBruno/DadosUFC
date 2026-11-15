// Processamento cronológico: priors por categoria, Elo, estados pré-luta e treino.

import type { DivisionKey } from '../../src/shared/divisions';
import { addFight, emptyState, featureDiff, featureValues, FEATURES, methodPrior, methodShares, sigmoid, type MethodShares } from '../../src/shared/model';
import type { ModelParams, ModelState, Priors, Result } from '../../src/shared/types';
import { S } from '../../src/shared/types';
import type { Bio, RawFight } from './load';

export const TRAIN_FROM = '2008-01-01';
export const TEST_FROM = '2025-01-01';

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

    if (f.winner != null && f.date >= TRAIN_FROM) {
      const fa = featureValues(a, p, f.date).v;
      const fb = featureValues(b, p, f.date).v;
      const prior = methodPrior(p, f.scheduledRounds, fiveRoundDecFactor);
      samples.push({
        date: f.date,
        x: featureDiff(fa, fb),
        y: f.winner === 0 ? 1 : 0,
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

// --- Regressão logística ------------------------------------------------------------

function fitLogistic(X: number[][], y: number[], std: number[], l2 = 0.02, iters = 600, lr = 0.5): number[] {
  const d = X[0].length;
  const w = new Array(d).fill(0);
  const n = X.length;
  // dados simétricos: (x, y) e (-x, 1-y) → sem intercepto
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += (w[j] * xi[j]) / std[j];
      const p = sigmoid(z);
      const pn = sigmoid(-z);
      const e1 = p - y[i];
      const e2 = pn - (1 - y[i]);
      for (let j = 0; j < d; j++) g[j] += ((e1 - e2) * xi[j]) / std[j];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / (2 * n) + l2 * w[j]);
  }
  return w;
}

export function trainModel(samples: Sample[], priors: Record<string, Priors>, fiveRoundDecFactor: number): ModelParams {
  const d = FEATURES.length;
  const train = samples.filter((s) => s.date < TEST_FROM);
  const test = samples.filter((s) => s.date >= TEST_FROM);
  const std = Array.from({ length: d }, (_, j) => {
    const v = train.map((s) => s.x[j]).filter((x) => x !== 0);
    const m2 = v.reduce((t, x) => t + x * x, 0) / Math.max(1, v.length);
    return Math.sqrt(m2) || 1;
  });
  const mean = new Array(d).fill(0);

  const evaluate = (w: number[], set: Sample[]) => {
    let correct = 0, ll = 0, eloCorrect = 0, methodHit = 0, methodN = 0, exact = 0;
    for (const s of set) {
      let z = 0;
      for (let j = 0; j < d; j++) z += (w[j] * s.x[j]) / std[j];
      const p = Math.min(1 - 1e-6, Math.max(1e-6, sigmoid(z)));
      ll += -(s.y * Math.log(p) + (1 - s.y) * Math.log(1 - p));
      const predA = p >= 0.5;
      if (predA === (s.y === 1)) correct++;
      eloCorrect += s.eloA === s.eloB ? 0.5 : (s.eloA > s.eloB) === (s.y === 1) ? 1 : 0;
      // método (quando o vencedor foi acertado)
      const shares = s.y === 1 ? s.sharesA : s.sharesB;
      const top = (Object.entries(shares) as [string, number][]).sort((x, y) => y[1] - x[1])[0][0];
      if (predA === (s.y === 1) && s.method !== 'OTHER') {
        methodN++;
        if (top === s.method) methodHit++;
      }
      // resultado exato (vencedor + método) entre 6 opções
      const outs: [string, number][] = [
        ...(['KO', 'SUB', 'DEC'] as const).map((m) => ['A' + m, p * s.sharesA[m]] as [string, number]),
        ...(['KO', 'SUB', 'DEC'] as const).map((m) => ['B' + m, (1 - p) * s.sharesB[m]] as [string, number]),
      ];
      const best = outs.sort((x, y) => y[1] - x[1])[0][0];
      if (best === (s.y === 1 ? 'A' : 'B') + s.method) exact++;
    }
    return {
      accuracy: correct / set.length,
      logLoss: ll / set.length,
      eloOnlyAccuracy: eloCorrect / set.length,
      methodAccuracy: methodN ? methodHit / methodN : 0,
      exactAccuracy: exact / set.length,
    };
  };

  const wTrain = fitLogistic(train.map((s) => s.x), train.map((s) => s.y), std);
  const m = evaluate(wTrain, test);
  // modelo final: treinado com tudo
  const wAll = fitLogistic(samples.map((s) => s.x), samples.map((s) => s.y), std);

  return {
    version: 1,
    features: FEATURES.map((f) => f.key),
    mean,
    std,
    coef: wAll,
    priors,
    fiveRoundDecFactor,
    metrics: {
      trainN: train.length,
      testN: test.length,
      testFrom: TEST_FROM,
      accuracy: m.accuracy,
      logLoss: m.logLoss,
      eloOnlyAccuracy: m.eloOnlyAccuracy,
      baselineFavAccuracy: m.eloOnlyAccuracy,
      methodAccuracy: m.methodAccuracy,
      exactAccuracy: m.exactAccuracy,
    },
  };
}
