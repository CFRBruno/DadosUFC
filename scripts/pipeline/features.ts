// Geração de variáveis (features) por lutador, em ordem cronológica.
// Cada luta recebe o "retrato" pré-luta dos dois lutadores — o modelo nunca vê o futuro.
// Usado para treinar/avaliar o modelo e para o retrato atual de cada lutador no site.

import { divisionLbs, type DivisionKey } from '../../src/shared/divisions';
import { atDate, type FeatureVec } from '../../src/shared/model2';
import type { Priors } from '../../src/shared/types';
import { S } from '../../src/shared/types';
import { priorsFor } from './build';
import type { Bio, RawFight } from './load';

const DAY = 864e5;
const LAMBDAS = { a: 0.8, b: 0.9 } as const; // decaimento por luta (peso das lutas antigas)
type LK = keyof typeof LAMBDAS;

const SUMS = ['time', 'sigL', 'sigA', 'sigAbs', 'sigOppA', 'tdL', 'tdA', 'tdAbs', 'tdOppA', 'sub', 'subAbs', 'kd', 'kdAbs', 'ctrl', 'ctrlAbs', 'headL', 'legL', 'bodyL', 'distL', 'clinchL', 'groundL', 'totL', 'totAbs', 'win', 'cnt'] as const;
type SumKey = (typeof SUMS)[number];
type Sums = Record<SumKey, number>;
const zero = (): Sums => Object.fromEntries(SUMS.map((k) => [k, 0])) as Sums;

// métricas ajustadas pelo adversário: [nome, peso]
const ADJ = ['slpm', 'sapm', 'td', 'tdAbs', 'ctrl', 'ctrlAbs', 'kd', 'kdAbs', 'acc', 'def', 'tdAcc', 'tdDef'] as const;
type AdjKey = (typeof ADJ)[number];

export const ELO_VARIANTS = ['k24', 'k32', 'k40', 'k56', 'dyn', 'mov'] as const;
type EloKey = (typeof ELO_VARIANTS)[number];

interface FState {
  n: number; w: number; l: number; d: number;
  cum: Sums;
  ew: Record<LK, Sums>;
  adj: Record<LK | 'c', Record<AdjKey, { s: number; t: number }>>;
  elo: Record<EloKey, number>;
  gl: { r: number; rd: number; last: number | null };
  gl2: { r: number; rd: number; last: number | null };
  oppElo: { s: number; n: number };       // força dos adversários (ponderada)
  beat: { s: number; n: number; best: number };
  eloTrail: number[];
  results: { r: number; ko: boolean; date: number }[];
  koW: number; subW: number; decW: number; koL: number; subL: number; decL: number;
  lastKoLoss: number | null;
  five: number; titles: number;
  first: number | null; last: number | null; lastLbs: number | null;
  dob: number | null; reach: number | null; height: number | null; stance: number;
}

const newState = (b: Bio | undefined): FState => ({
  n: 0, w: 0, l: 0, d: 0,
  cum: zero(),
  ew: { a: zero(), b: zero() },
  adj: Object.fromEntries((['a', 'b', 'c'] as const).map((k) => [k, Object.fromEntries(ADJ.map((m) => [m, { s: 0, t: 0 }]))])) as FState['adj'],
  elo: Object.fromEntries(ELO_VARIANTS.map((k) => [k, 1500])) as Record<EloKey, number>,
  gl: { r: 1500, rd: 350, last: null },
  gl2: { r: 1500, rd: 350, last: null },
  oppElo: { s: 0, n: 0 }, beat: { s: 0, n: 0, best: 0 },
  eloTrail: [],
  results: [],
  koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0, lastKoLoss: null,
  five: 0, titles: 0, first: null, last: null, lastLbs: null,
  dob: b?.dob ? Date.parse(b.dob) : null,
  reach: b?.reachIn ?? null, height: b?.heightIn ?? null,
  stance: b?.stance === 'Canhoto' ? 1 : b?.stance === 'Troca base' ? 2 : b?.stance === 'Destro' ? 0 : -1,
});

// ---- taxas com encolhimento para a média da categoria -------------------------
const KM = 15; // minutos de pseudo-amostra
function rates(s: Sums, p: Priors, km = KM) {
  const min = s.time / 60;
  const r = (x: number, priorPerMin: number) => (x + priorPerMin * km) / (min + km);
  const pct = (x: number, a: number, prior: number, k: number) => (x + prior * k) / (a + k);
  return {
    slpm: r(s.sigL, p.slpm), sapm: r(s.sigAbs, p.sapm),
    acc: pct(s.sigL, s.sigA, p.acc, 30), def: 1 - pct(s.sigAbs, s.sigOppA, 1 - p.def, 30),
    td: 15 * r(s.tdL, p.td / 15), tdAbs: 15 * r(s.tdAbs, p.td / 15),
    tdAcc: pct(s.tdL, s.tdA, p.tdAcc, 5), tdDef: 1 - pct(s.tdAbs, s.tdOppA, 1 - p.tdDef, 5),
    sub: 15 * r(s.sub, p.sub / 15), subAbs: 15 * r(s.subAbs, p.sub / 15),
    kd: 15 * r(s.kd, p.kd / 15), kdAbs: 15 * r(s.kdAbs, p.kd / 15),
    ctrl: (s.ctrl + p.ctrl * km * 60) / (s.time + km * 60), ctrlAbs: (s.ctrlAbs + p.ctrl * km * 60) / (s.time + km * 60),
  };
}

export type { FeatureVec };
export type { FState };

/** Retrato do lutador antes de uma luta (ou hoje). */
export function snapshot(st: FState, p: Priors, date: number, lbs: number | null): FeatureVec {
  return atDate(staticSnapshot(st, p), date, lbs);
}

/** Parte do retrato que não depende da data da luta; os campos `_` guardam o necessário para `atDate`. */
export function staticSnapshot(st: FState, p: Priors): FeatureVec {
  const f: FeatureVec = {};
  const c = rates(st.cum, p);
  for (const [k, v] of Object.entries(c)) f['c_' + k] = v;
  for (const lk of ['a', 'b'] as const) {
    const e = rates(st.ew[lk], p, 10);
    for (const [k, v] of Object.entries(e)) f[`e${lk}_${k}`] = v;
    f[`e${lk}_win`] = (st.ew[lk].win + 0.5 * 1.5) / (st.ew[lk].cnt + 1.5);
  }
  // ajustadas pelo adversário: média da categoria + resíduo médio (encolhido)
  const base: Record<AdjKey, number> = {
    slpm: p.slpm, sapm: p.sapm, td: p.td, tdAbs: p.td, ctrl: p.ctrl, ctrlAbs: p.ctrl, kd: p.kd, kdAbs: p.kd,
    acc: p.acc, def: p.def, tdAcc: p.tdAcc, tdDef: p.tdDef,
  };
  const kAdj: Record<AdjKey, number> = { slpm: 12, sapm: 12, td: 12, tdAbs: 12, ctrl: 12, ctrlAbs: 12, kd: 12, kdAbs: 12, acc: 40, def: 40, tdAcc: 6, tdDef: 6 };
  for (const lk of ['a', 'b', 'c'] as const) {
    for (const m of ADJ) {
      const a = st.adj[lk][m];
      f[`j${lk}_${m}`] = base[m] + a.s / (a.t + kAdj[m]);
    }
  }
  for (const k of ELO_VARIANTS) f['elo_' + k] = st.elo[k];
  f.gl_r = st.gl.r; f.gl2_r = st.gl2.r;
  f.opp_elo = st.oppElo.n ? st.oppElo.s / st.oppElo.n : 1500;
  f.beat_elo = (st.beat.s + 1450 * 1) / (st.beat.n + 1);
  f.best_win = st.beat.best || 1400;
  const tr = st.eloTrail;
  f.elo_trend = tr.length >= 2 ? st.elo.k40 - tr[Math.max(0, tr.length - 3)] : 0;
  f.elo_peak_gap = tr.length ? Math.max(...tr, st.elo.k40) - st.elo.k40 : 0;
  // forma
  const res = st.results;
  const lastK = (k: number) => { const x = res.slice(-k); return (x.reduce((s, r) => s + r.r, 0) + 0.5 * 2) / (x.length + 2); };
  f.form3 = lastK(3); f.form5 = lastK(5);
  let streak = 0;
  for (let i = res.length - 1; i >= 0; i--) {
    const r = res[i].r;
    if (r === 0.5) break;
    if (streak === 0) streak = r === 1 ? 1 : -1;
    else if ((streak > 0) === (r === 1)) streak += r === 1 ? 1 : -1;
    else break;
  }
  f.streak = streak;
  f.n = st.n; f.logn = Math.log1p(st.n);
  f.winpct = (st.w + 0.5 * 3) / (st.n + 3);
  f.minutes = Math.log1p(st.cum.time / 60);
  const fin = (x: number, d: number, prior: number, k = 4) => (x + prior * k) / (d + k);
  f.koW = fin(st.koW, st.w, p.method.KO); f.subW = fin(st.subW, st.w, p.method.SUB); f.decW = fin(st.decW, st.w, p.method.DEC);
  f.koL = fin(st.koL, st.n, p.koLoss, 3); f.subL = fin(st.subL, st.n, 0.09, 3);
  f.koL_n = st.koL; f.koL3 = res.slice(-3).filter((r) => r.ko).length;
  f.fin_rate = fin(st.koW + st.subW, st.n, 0.27, 4);
  f.dec_share = fin(st.decW + st.decL, st.n, 0.47, 4);
  f.five = Math.log1p(st.five); f.titles = Math.log1p(st.titles);
  // estilo (proporções dos golpes conectados)
  const tot = st.cum.headL + st.cum.bodyL + st.cum.legL;
  f.leg_share = (st.cum.legL + 0.14 * 40) / (tot + 40);
  f.head_share = (st.cum.headL + 0.66 * 40) / (tot + 40);
  const pos = st.cum.distL + st.cum.clinchL + st.cum.groundL;
  f.ground_share = (st.cum.groundL + 0.14 * 40) / (pos + 40);
  f.clinch_share = (st.cum.clinchL + 0.12 * 40) / (pos + 40);
  f.sig_share = (st.cum.sigL + 0.62 * 60) / (st.cum.totL + 60); // golpes significativos / totais
  f.reach = st.reach; f.height = st.height; f.stance = st.stance;
  f.ape = st.reach != null && st.height != null ? st.reach - st.height : null;
  f.debut = st.n === 0 && st.cum.cnt === 0 ? 1 : 0;
  // insumos dos campos que dependem da data (ver atDate)
  f._dob = st.dob; f._last = st.last; f._first = st.first; f._lastKo = st.lastKoLoss; f._lastLbs = st.lastLbs;
  f._gl_rd = st.gl.rd; f._gl_last = st.gl.last; f._gl2_rd = st.gl2.rd; f._gl2_last = st.gl2.last;
  return f;
}

export interface Sample {
  id: string; date: string; div: DivisionKey; women: boolean; rounds: number; title: boolean;
  a: string; b: string; an: string; bn: string;
  y: number; method: string;
  fa: FeatureVec; fb: FeatureVec;
}

const g = (rd: number) => 1 / Math.sqrt(1 + (3 * (Math.LN10 / 400) ** 2 * rd * rd) / Math.PI ** 2);
function glicko(me: FState['gl'], opp: { r: number; rd: number }, s: number, date: number, cc: number) {
  const q = Math.LN10 / 400;
  const rd = me.last == null ? 350 : Math.min(350, Math.sqrt(me.rd * me.rd + cc * cc * ((date - me.last) / DAY / 30)));
  const gj = g(opp.rd);
  const E = 1 / (1 + 10 ** ((-gj * (me.r - opp.r)) / 400));
  const d2 = 1 / (q * q * gj * gj * E * (1 - E));
  const denom = 1 / (rd * rd) + 1 / d2;
  return { r: me.r + (q / denom) * gj * (s - E), rd: Math.max(40, Math.sqrt(1 / denom)), last: date };
}

export function buildFeatures(
  fights: RawFight[], bios: Map<string, Bio>, priors: Record<string, Priors>, from = '2003-01-01',
): { samples: Sample[]; states: Map<string, FState> } {
  const states = new Map<string, FState>();
  const get = (id: string) => {
    let s = states.get(id);
    if (!s) { s = newState(bios.get(id)); states.set(id, s); }
    return s;
  };
  const samples: Sample[] = [];
  for (const f of fights) {
    const A = get(f.fighters[0].id), B = get(f.fighters[1].id);
    const p = priorsFor(priors, f.division);
    const date = Date.parse(f.date);
    const lbs = divisionLbs(f.division);
    const fa = snapshot(A, p, date, lbs), fb = snapshot(B, p, date, lbs);
    if (f.winner != null && f.date >= from) {
      samples.push({
        id: f.id, date: f.date, div: f.division, women: f.women, rounds: f.scheduledRounds, title: f.title,
        a: f.fighters[0].id, b: f.fighters[1].id, an: f.fighters[0].name, bn: f.fighters[1].name,
        y: f.winner === 0 ? 1 : 0, method: f.method, fa, fb,
      });
    }
    if (f.outcome === 'NC') { A.last = date; B.last = date; continue; }
    const sa = f.winner === 0 ? 1 : f.winner === 1 ? 0 : 0.5;
    const finish = f.method === 'KO' || f.method === 'SUB';
    // ---- ratings (usando valores pré-luta dos dois)
    const eloPre = { A: { ...A.elo }, B: { ...B.elo } };
    for (const k of ELO_VARIANTS) {
      const ea = 1 / (1 + 10 ** ((eloPre.B[k] - eloPre.A[k]) / 400));
      const baseK = k === 'k24' ? 24 : k === 'k32' ? 32 : k === 'k40' ? 40 : k === 'k56' ? 56 : 0;
      let ka = baseK, kb = baseK;
      if (k === 'dyn' || k === 'mov') {
        ka = 26 + 60 / (1 + A.n / 2); kb = 26 + 60 / (1 + B.n / 2);
      }
      let mult = finish ? 1.2 : 1;
      if (k === 'mov') mult = finish ? 1.3 : f.decision === 'S' ? 0.7 : f.decision === 'M' ? 0.8 : 1;
      A.elo[k] += ka * mult * (sa - ea);
      B.elo[k] -= kb * mult * (sa - ea);
    }
    const gA = { ...A.gl }, gB = { ...B.gl }, g2A = { ...A.gl2 }, g2B = { ...B.gl2 };
    const rdAt = (x: FState['gl'], cc: number) => (x.last == null ? 350 : Math.min(350, Math.sqrt(x.rd * x.rd + cc * cc * ((date - x.last) / DAY / 30))));
    A.gl = glicko(gA, { r: gB.r, rd: rdAt(gB, 12) }, sa, date, 12);
    B.gl = glicko(gB, { r: gA.r, rd: rdAt(gA, 12) }, 1 - sa, date, 12);
    A.gl2 = glicko(g2A, { r: g2B.r, rd: rdAt(g2B, 20) }, sa, date, 20);
    B.gl2 = glicko(g2B, { r: g2A.r, rd: rdAt(g2A, 20) }, 1 - sa, date, 20);

    // ---- estatísticas da luta
    const upd = (me: FState, op: FState, i: 0 | 1, mine: FeatureVec, theirs: FeatureVec, s: number, oppEloPre: number) => {
      const st = f.stats;
      const sec = f.durationSec;
      const add: Sums = zero();
      if (st) {
        const a = st[i], b = st[1 - i];
        Object.assign(add, {
          time: sec, sigL: a[S.sigL], sigA: a[S.sigA], sigAbs: b[S.sigL], sigOppA: b[S.sigA],
          tdL: a[S.tdL], tdA: a[S.tdA], tdAbs: b[S.tdL], tdOppA: b[S.tdA], sub: a[S.sub], subAbs: b[S.sub],
          kd: a[S.kd], kdAbs: b[S.kd], ctrl: a[S.ctrl], ctrlAbs: b[S.ctrl],
          headL: a[S.headL], legL: a[S.legL], bodyL: a[S.bodyL], distL: a[S.distL], clinchL: a[S.clinchL], groundL: a[S.groundL],
          totL: a[S.totL], totAbs: b[S.totL],
        });
      }
      add.win = s; add.cnt = 1;
      for (const k of SUMS) me.cum[k] += add[k];
      for (const lk of ['a', 'b'] as const) for (const k of SUMS) me.ew[lk][k] = me.ew[lk][k] * LAMBDAS[lk] + add[k];
      // resíduos contra o que o adversário costuma permitir
      if (st && sec > 0) {
        const min = sec / 60;
        const a = st[i], b = st[1 - i];
        const T = theirs as Record<string, number>;
        const obs: [AdjKey, number, number, number][] = [
          // [métrica, observado, esperado (taxa do adversário), peso]
          ['slpm', a[S.sigL] / min, T.c_sapm, min], ['sapm', b[S.sigL] / min, T.c_slpm, min],
          ['td', (a[S.tdL] / min) * 15, T.c_tdAbs, min], ['tdAbs', (b[S.tdL] / min) * 15, T.c_td, min],
          ['ctrl', a[S.ctrl] / sec, T.c_ctrlAbs, min], ['ctrlAbs', b[S.ctrl] / sec, T.c_ctrl, min],
          ['kd', (a[S.kd] / min) * 15, T.c_kdAbs, min], ['kdAbs', (b[S.kd] / min) * 15, T.c_kd, min],
        ];
        if (a[S.sigA] > 0) obs.push(['acc', a[S.sigL] / a[S.sigA], 1 - T.c_def, a[S.sigA]]);
        if (b[S.sigA] > 0) obs.push(['def', 1 - b[S.sigL] / b[S.sigA], 1 - T.c_acc, b[S.sigA]]);
        if (a[S.tdA] > 0) obs.push(['tdAcc', a[S.tdL] / a[S.tdA], 1 - T.c_tdDef, a[S.tdA]]);
        if (b[S.tdA] > 0) obs.push(['tdDef', 1 - b[S.tdL] / b[S.tdA], 1 - T.c_tdAcc, b[S.tdA]]);
        for (const [m, o, e, w] of obs) {
          const r = o - e;
          for (const lk of ['a', 'b'] as const) { const x = me.adj[lk][m]; x.s = x.s * LAMBDAS[lk] + w * r; x.t = x.t * LAMBDAS[lk] + w; }
          me.adj.c[m].s += w * r; me.adj.c[m].t += w;
        }
      }
      void mine; void op;
      me.n += 1;
      if (s === 1) { me.w++; if (f.method === 'KO') me.koW++; else if (f.method === 'SUB') me.subW++; else if (f.method === 'DEC') me.decW++; }
      else if (s === 0) { me.l++; if (f.method === 'KO') { me.koL++; me.lastKoLoss = date; } else if (f.method === 'SUB') me.subL++; else if (f.method === 'DEC') me.decL++; }
      else me.d++;
      me.results.push({ r: s, ko: s === 0 && f.method === 'KO', date });
      me.oppElo.s = me.oppElo.s * 0.9 + oppEloPre; me.oppElo.n = me.oppElo.n * 0.9 + 1;
      if (s === 1) { me.beat.s += oppEloPre; me.beat.n += 1; me.beat.best = Math.max(me.beat.best, oppEloPre); }
      me.eloTrail.push(me.elo.k40);
      if (f.scheduledRounds >= 5) me.five++;
      if (f.title) me.titles++;
      if (me.first == null) me.first = date;
      me.last = date;
      if (lbs) me.lastLbs = lbs;
    };
    upd(A, B, 0, fa, fb, sa, eloPre.B.k40);
    upd(B, A, 1, fb, fa, 1 - sa, eloPre.A.k40);
  }
  return { samples, states };
}

/** Retrato atual (parte estática) de um lutador, arredondado para o JSON do site. */
export function currentSnapshot(states: Map<string, FState>, id: string, bio: Bio | undefined, p: Priors): FeatureVec {
  const f = staticSnapshot(states.get(id) ?? newState(bio), p);
  for (const k of Object.keys(f)) {
    const v = f[k];
    if (typeof v === 'number' && !Number.isInteger(v)) f[k] = Math.round(v * 1e5) / 1e5;
  }
  return f;
}
