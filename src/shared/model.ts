// Núcleo estatístico: estado de carreira, features, previsão de vencedor e método.
// Usado tanto pelo pipeline (treino/backtest) quanto pelo site (comparador).

import type { ModelState, Priors, Result, StatLine } from './types';
import { S } from './types';
import type { MethodKey } from './translate';

export const ELO_START = 1500;

export function emptyState(): ModelState {
  return {
    time: 0, fights: 0, wins: 0, losses: 0, draws: 0,
    sigL: 0, sigA: 0, sigAbs: 0, sigOppA: 0,
    tdL: 0, tdA: 0, tdAbs: 0, tdOppA: 0,
    sub: 0, kd: 0, kdAbs: 0, ctrl: 0, ctrlAbs: 0,
    koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0,
    recent: [], lastDate: null, dob: null, reach: null, height: null,
    elo: ELO_START,
  };
}

/** Atualiza o estado acumulado com uma luta (perspectiva do lutador). */
export function addFight(
  st: ModelState,
  f: { me: StatLine | null; opp: StatLine | null; result: Result; method: MethodKey; durationSec: number; date: string },
): void {
  if (f.me && f.opp) {
    st.time += f.durationSec;
    st.sigL += f.me[S.sigL]; st.sigA += f.me[S.sigA];
    st.sigAbs += f.opp[S.sigL]; st.sigOppA += f.opp[S.sigA];
    st.tdL += f.me[S.tdL]; st.tdA += f.me[S.tdA];
    st.tdAbs += f.opp[S.tdL]; st.tdOppA += f.opp[S.tdA];
    st.sub += f.me[S.sub]; st.kd += f.me[S.kd]; st.kdAbs += f.opp[S.kd];
    st.ctrl += f.me[S.ctrl]; st.ctrlAbs += f.opp[S.ctrl];
  }
  if (f.result === 'NC') {
    st.lastDate = f.date;
    return;
  }
  st.fights += 1;
  if (f.result === 'W') {
    st.wins += 1;
    if (f.method === 'KO') st.koW += 1;
    else if (f.method === 'SUB') st.subW += 1;
    else if (f.method === 'DEC') st.decW += 1;
  } else if (f.result === 'L') {
    st.losses += 1;
    if (f.method === 'KO') st.koL += 1;
    else if (f.method === 'SUB') st.subL += 1;
    else if (f.method === 'DEC') st.decL += 1;
  } else {
    st.draws += 1;
  }
  st.recent.push(f.result);
  if (st.recent.length > 5) st.recent.shift();
  st.lastDate = f.date;
}

// --- Features ----------------------------------------------------------------

export interface FeatureDef {
  key: string;
  label: string;
  /** como exibir o valor bruto */
  fmt: 'int' | 'dec1' | 'dec2' | 'pct' | 'years' | 'in' | 'days';
}

export const FEATURES: FeatureDef[] = [
  { key: 'elo', label: 'Rating Elo', fmt: 'int' },
  { key: 'slpm', label: 'Golpes sig. conectados/min', fmt: 'dec2' },
  { key: 'sapm', label: 'Golpes sig. absorvidos/min', fmt: 'dec2' },
  { key: 'acc', label: 'Precisão de golpes', fmt: 'pct' },
  { key: 'def', label: 'Defesa de golpes', fmt: 'pct' },
  { key: 'td', label: 'Quedas por 15 min', fmt: 'dec2' },
  { key: 'tdAcc', label: 'Precisão de quedas', fmt: 'pct' },
  { key: 'tdDef', label: 'Defesa de quedas', fmt: 'pct' },
  { key: 'sub', label: 'Tentativas de finalização/15 min', fmt: 'dec2' },
  { key: 'kd', label: 'Knockdowns/15 min', fmt: 'dec2' },
  { key: 'kdAbs', label: 'Knockdowns sofridos/15 min', fmt: 'dec2' },
  { key: 'ctrl', label: 'Tempo de controle', fmt: 'pct' },
  { key: 'age', label: 'Idade', fmt: 'years' },
  { key: 'reach', label: 'Envergadura', fmt: 'in' },
  { key: 'exp', label: 'Experiência no UFC', fmt: 'int' },
  { key: 'form', label: 'Forma recente', fmt: 'pct' },
  { key: 'layoff', label: 'Tempo parado', fmt: 'days' },
  { key: 'koLoss', label: 'Derrotas por nocaute', fmt: 'pct' },
];

const K_MIN = 15;   // minutos de "pseudo-luta" para encolher taxas
const K_STR = 30;   // golpes tentados de pseudo-amostra
const K_TD = 5;     // quedas tentadas de pseudo-amostra

const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/**
 * Valores "suavizados" de cada feature (com encolhimento bayesiano para a
 * média da categoria — evita que 1 luta gere números extremos).
 * Retorna também os valores brutos para exibição.
 */
export function featureValues(st: ModelState, p: Priors, refDate: string): { v: (number | null)[]; raw: (number | null)[] } {
  const min = st.time / 60;
  const per15 = (x: number, prior15: number) => (15 * (x + (prior15 / 15) * K_MIN)) / (min + K_MIN);
  const slpm = (st.sigL + p.slpm * K_MIN) / (min + K_MIN);
  const sapm = (st.sigAbs + p.sapm * K_MIN) / (min + K_MIN);
  const acc = (st.sigL + p.acc * K_STR) / (st.sigA + K_STR);
  const def = 1 - (st.sigAbs + (1 - p.def) * K_STR) / (st.sigOppA + K_STR);
  const td = per15(st.tdL, p.td);
  const tdAcc = (st.tdL + p.tdAcc * K_TD) / (st.tdA + K_TD);
  const tdDef = 1 - (st.tdAbs + (1 - p.tdDef) * K_TD) / (st.tdOppA + K_TD);
  const sub = per15(st.sub, p.sub);
  const kd = per15(st.kd, p.kd);
  const kdAbs = per15(st.kdAbs, p.kd);
  const ctrl = (st.ctrl + p.ctrl * K_MIN * 60) / (st.time + K_MIN * 60);
  const age = st.dob ? yearsBetween(st.dob, refDate) : null;
  const reach = st.reach;
  const exp = Math.log1p(st.fights);
  const recent = st.recent.slice(-3);
  const form = (recent.reduce((s, r) => s + (r === 'W' ? 1 : r === 'D' ? 0.5 : 0), 0) + 1) / (recent.length + 2);
  const layoffDays = st.lastDate ? Math.max(0, daysBetween(st.lastDate, refDate)) : null;
  const layoff = layoffDays == null ? Math.log1p(180) : Math.log1p(layoffDays);
  const koLoss = (st.koL + p.koLoss * 3) / (st.fights + 3);

  const v = [st.elo / 100, slpm, sapm, acc, def, td, tdAcc, tdDef, sub, kd, kdAbs, ctrl, age, reach, exp, form, layoff, koLoss];

  // valores brutos (sem encolhimento) para mostrar ao usuário
  const safe = (n: number, d: number) => (d > 0 ? n / d : null);
  const raw = [
    st.elo,
    safe(st.sigL, min), safe(st.sigAbs, min), safe(st.sigL, st.sigA),
    st.sigOppA > 0 ? 1 - st.sigAbs / st.sigOppA : null,
    min > 0 ? (st.tdL / min) * 15 : null, safe(st.tdL, st.tdA),
    st.tdOppA > 0 ? 1 - st.tdAbs / st.tdOppA : null,
    min > 0 ? (st.sub / min) * 15 : null,
    min > 0 ? (st.kd / min) * 15 : null,
    min > 0 ? (st.kdAbs / min) * 15 : null,
    safe(st.ctrl, st.time), age, reach, st.fights,
    recent.length ? recent.filter((r) => r === 'W').length / recent.length : null,
    layoffDays, safe(st.koL, st.fights),
  ];
  return { v, raw };
}

/** Diferença de features A − B (0 quando falta dado de um dos lados). */
export function featureDiff(a: (number | null)[], b: (number | null)[]): number[] {
  return a.map((x, i) => (x == null || b[i] == null ? 0 : x - (b[i] as number)));
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// --- Método provável ---------------------------------------------------------

export type MethodShares = { KO: number; SUB: number; DEC: number };

export function methodPrior(p: Priors, rounds: number, fiveRoundDecFactor: number): MethodShares {
  const dec = p.method.DEC * (rounds >= 5 ? fiveRoundDecFactor : 1);
  const t = p.method.KO + p.method.SUB + dec;
  return { KO: p.method.KO / t, SUB: p.method.SUB / t, DEC: dec / t };
}

/**
 * Distribuição de método dado que `w` vence `l`.
 * Combina a tendência ofensiva do vencedor com a vulnerabilidade do perdedor
 * (estilo "log5"), encolhidas para a média da categoria.
 */
export function methodShares(w: ModelState, l: ModelState, prior: MethodShares): MethodShares {
  const k = 4;
  const off = {
    KO: (w.koW + prior.KO * k) / (w.wins + k),
    SUB: (w.subW + prior.SUB * k) / (w.wins + k),
    DEC: (w.decW + prior.DEC * k) / (w.wins + k),
  };
  const vul = {
    KO: (l.koL + prior.KO * k) / (l.losses + k),
    SUB: (l.subL + prior.SUB * k) / (l.losses + k),
    DEC: (l.decL + prior.DEC * k) / (l.losses + k),
  };
  const raw = {
    KO: (off.KO * vul.KO) / prior.KO,
    SUB: (off.SUB * vul.SUB) / prior.SUB,
    DEC: (off.DEC * vul.DEC) / prior.DEC,
  };
  const t = raw.KO + raw.SUB + raw.DEC;
  return { KO: raw.KO / t, SUB: raw.SUB / t, DEC: raw.DEC / t };
}

export interface OutcomeTable {
  A: MethodShares; // probabilidades absolutas (somam pA)
  B: MethodShares; // somam 1 - pA
}

export function outcomes(pA: number, a: ModelState, b: ModelState, prior: MethodShares): OutcomeTable {
  const sa = methodShares(a, b, prior);
  const sb = methodShares(b, a, prior);
  const pB = 1 - pA;
  return {
    A: { KO: pA * sa.KO, SUB: pA * sa.SUB, DEC: pA * sa.DEC },
    B: { KO: pB * sb.KO, SUB: pB * sb.SUB, DEC: pB * sb.DEC },
  };
}

/** Média de duas priors (lutas entre categorias / peso casado). */
export function blendPriors(p: Priors, q: Priors): Priors {
  const m = (x: number, y: number) => (x + y) / 2;
  return {
    slpm: m(p.slpm, q.slpm), sapm: m(p.sapm, q.sapm), acc: m(p.acc, q.acc), def: m(p.def, q.def),
    td: m(p.td, q.td), tdAcc: m(p.tdAcc, q.tdAcc), tdDef: m(p.tdDef, q.tdDef), sub: m(p.sub, q.sub),
    kd: m(p.kd, q.kd), ctrl: m(p.ctrl, q.ctrl), koLoss: m(p.koLoss, q.koLoss),
    method: { KO: m(p.method.KO, q.method.KO), SUB: m(p.method.SUB, q.method.SUB), DEC: m(p.method.DEC, q.method.DEC) },
  };
}
