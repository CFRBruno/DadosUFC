// Treino e avaliação do modelo v2.
// A avaliação é sempre "para a frente": para prever as lutas do ano Y, o modelo só
// conhece as lutas anteriores a Y — nenhum número de acerto vem de lutas vistas no treino.

import type { MethodShares } from '../../src/shared/model';
import { baseKeys, FACTOR_LABEL, groupOf, logit, pairNames, pairVector, sigmoid2, type Model2 } from '../../src/shared/model2';
import type { ModelMetrics } from '../../src/shared/types';
import type { Sample } from './features';

const TRAIN_FROM = '2005-01-01';
const EVAL_FROM = 2015;        // 1º ano avaliado (só estatísticas)
const MARKET_EVAL_FROM = 2021; // 1º ano avaliado com mercado (as linhas começam em 2019)
const RECENT_FROM = '2025-01-01';
const C_STATS = 0.003;         // regularização forte: muitas variáveis correlacionadas
const C_BLEND = 10;

/** Dados auxiliares de cada luta para medir o acerto de método (vêm do processamento clássico). */
export interface MethodInfo { method: string; sharesA: MethodShares; sharesB: MethodShares; eloA: number; eloB: number }

/**
 * Regressão logística com L2, sem intercepto (o problema é simétrico: trocar A e B inverte tudo).
 * Minimiza ½‖w‖² + 2C·Σ perda — equivalente ao treino com os dados espelhados.
 * Resolvida pelo método de Newton (convergência em poucas iterações).
 */
function fitLR(rows: Float64Array[], y: number[], C: number): { sd: number[]; coef: number[] } {
  const n = rows.length, d = rows[0].length;
  const sd = new Array<number>(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) sd[j] += r[j] * r[j];
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / n) || 1;
  const Z = rows.map((r) => { const z = new Float64Array(d); for (let j = 0; j < d; j++) z[j] = r[j] / sd[j]; return z; });
  const w = new Float64Array(d);
  const k = 2 * C;
  const objective = (v: Float64Array) => {
    let o = 0;
    for (let j = 0; j < d; j++) o += 0.5 * v[j] * v[j];
    for (let i = 0; i < n; i++) {
      let z = 0; const x = Z[i];
      for (let j = 0; j < d; j++) z += v[j] * x[j];
      const s = y[i] === 1 ? z : -z;
      o += k * (s > 0 ? Math.log1p(Math.exp(-s)) : -s + Math.log1p(Math.exp(s)));
    }
    return o;
  };
  let cur = objective(w);
  for (let it = 0; it < 50; it++) {
    const g = Float64Array.from(w);
    const H = new Float64Array(d * d);
    for (let i = 0; i < n; i++) {
      const x = Z[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      const p = sigmoid2(z);
      const e = k * (p - y[i]), h = k * p * (1 - p);
      for (let j = 0; j < d; j++) {
        const xj = x[j];
        if (xj === 0) continue;
        g[j] += e * xj;
        const hx = h * xj, row = j * d;
        for (let l = 0; l <= j; l++) H[row + l] += hx * x[l];
      }
    }
    for (let j = 0; j < d; j++) H[j * d + j] += 1;
    // Cholesky (triângulo inferior) e solução de H·δ = g
    for (let j = 0; j < d; j++) {
      for (let l = 0; l <= j; l++) {
        let s = H[j * d + l];
        for (let m = 0; m < l; m++) s -= H[j * d + m] * H[l * d + m];
        H[j * d + l] = j === l ? Math.sqrt(s) : s / H[l * d + l];
      }
    }
    const delta = Float64Array.from(g);
    for (let j = 0; j < d; j++) { let s = delta[j]; for (let m = 0; m < j; m++) s -= H[j * d + m] * delta[m]; delta[j] = s / H[j * d + j]; }
    for (let j = d - 1; j >= 0; j--) { let s = delta[j]; for (let m = j + 1; m < d; m++) s -= H[m * d + j] * delta[m]; delta[j] = s / H[j * d + j]; }
    let step = 1, next = w, val = cur;
    for (let t = 0; t < 20; t++) {
      next = Float64Array.from(w, (v, j) => v - step * delta[j]);
      val = objective(next);
      if (val <= cur + 1e-12) break;
      step /= 2;
    }
    let move = 0;
    for (let j = 0; j < d; j++) { move = Math.max(move, Math.abs(next[j] - w[j])); w[j] = next[j]; }
    cur = val;
    if (move < 1e-9) break;
  }
  return { sd, coef: Array.from(w) };
}

const score = (m: { sd: number[]; coef: number[] }, x: Float64Array) => {
  let z = 0;
  for (let j = 0; j < x.length; j++) z += (m.coef[j] * x[j]) / m.sd[j];
  return z;
};

export interface Trained { v2: Model2; metrics: ModelMetrics; zOos: Map<string, number> }

export function trainModel2(samples: Sample[], market: (number | null)[], info: Map<string, MethodInfo>): Trained {
  const keys = baseKeys(samples[0].fa);
  const names = pairNames(keys);
  const X = samples.map((s) => Float64Array.from(pairVector(keys, s.fa, s.fb)));
  const y = samples.map((s) => s.y);
  const N = samples.length;
  const lastYear = Number(samples[N - 1].date.slice(0, 4));
  const idxWhere = (fn: (i: number) => boolean) => { const o: number[] = []; for (let i = 0; i < N; i++) if (fn(i)) o.push(i); return o; };
  const fit = (ix: number[], C = C_STATS) => fitLR(ix.map((i) => X[i]), ix.map((i) => y[i]), C);

  // 1. só estatísticas, ano a ano
  const z = new Array<number>(N).fill(NaN);
  for (let Y = EVAL_FROM; Y <= lastYear; Y++) {
    const tr = idxWhere((i) => samples[i].date >= TRAIN_FROM && samples[i].date < `${Y}-01-01`);
    const te = idxWhere((i) => samples[i].date.startsWith(String(Y)));
    if (!te.length) continue;
    const m = fit(tr);
    for (const i of te) z[i] = score(m, X[i]);
  }

  // 2. mercado + estatísticas, ano a ano (só lutas com linha de mercado)
  const hasM = (i: number) => market[i] != null && !Number.isNaN(z[i]);
  const bx = (i: number) => Float64Array.of(logit(market[i]!), z[i]);
  const pFinal = z.map((v) => (Number.isNaN(v) ? NaN : sigmoid2(v)));
  const combined = new Array<boolean>(N).fill(false);
  for (let Y = MARKET_EVAL_FROM; Y <= lastYear; Y++) {
    const tr = idxWhere((i) => hasM(i) && samples[i].date < `${Y}-01-01`);
    const te = idxWhere((i) => hasM(i) && samples[i].date.startsWith(String(Y)));
    if (tr.length < 300 || !te.length) continue;
    const m = fitLR(tr.map(bx), tr.map((i) => y[i]), C_BLEND);
    for (const i of te) { pFinal[i] = sigmoid2(score(m, bx(i))); combined[i] = true; }
  }

  // 3. modelos finais (tudo o que existe até hoje)
  const all = idxWhere((i) => samples[i].date >= TRAIN_FROM);
  const stats = fit(all);
  const mIdx = idxWhere(hasM);
  let blend: Model2['market'] = null;
  if (mIdx.length >= 300) {
    const b = fitLR(mIdx.map(bx), mIdx.map((i) => y[i]), C_BLEND);
    blend = { a: b.coef[0] / b.sd[0], b: b.coef[1] / b.sd[1] };
  }

  // peso médio de cada fator (|contribuição| média no logit) nas lutas recentes
  const gw = new Map<string, number>();
  const recent = idxWhere((i) => samples[i].date >= `${EVAL_FROM}-01-01`);
  for (const i of recent) {
    const g = new Map<string, number>();
    for (let j = 0; j < names.length; j++) {
      const key = groupOf(names[j]);
      g.set(key, (g.get(key) ?? 0) + (stats.coef[j] * X[i][j]) / stats.sd[j]);
    }
    for (const [key, v] of g) gw.set(key, (gw.get(key) ?? 0) + Math.abs(v) / recent.length);
  }
  const groupWeights = [...gw.entries()].filter(([key]) => FACTOR_LABEL[key]).map(([key, w]) => ({ key, w })).sort((p, q) => q.w - p.w);

  // 4. métricas
  const evalSet = (ix: number[], prob: (i: number) => number) => {
    let ok = 0, ll = 0;
    for (const i of ix) {
      const p = Math.min(1 - 1e-6, Math.max(1e-6, prob(i)));
      if ((p >= 0.5) === (y[i] === 1)) ok++;
      ll -= y[i] === 1 ? Math.log(p) : Math.log(1 - p);
    }
    return { n: ix.length, accuracy: ix.length ? ok / ix.length : 0, logLoss: ix.length ? ll / ix.length : 0 };
  };
  const statsAll = idxWhere((i) => !Number.isNaN(z[i]));
  const head = idxWhere((i) => combined[i]);
  const headline = head.length ? head : statsAll;
  const hm = evalSet(headline, (i) => pFinal[i]);
  let eloOk = 0, methodHit = 0, methodN = 0, exact = 0, infoN = 0;
  for (const i of headline) {
    const s = info.get(samples[i].id);
    if (!s) continue;
    infoN++;
    eloOk += s.eloA === s.eloB ? 0.5 : (s.eloA > s.eloB) === (y[i] === 1) ? 1 : 0;
    const p = pFinal[i];
    const right = (p >= 0.5) === (y[i] === 1);
    const shares = y[i] === 1 ? s.sharesA : s.sharesB;
    const top = (Object.entries(shares) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    if (right && s.method !== 'OTHER') { methodN++; if (top === s.method) methodHit++; }
    const outs: [string, number][] = [
      ...(['KO', 'SUB', 'DEC'] as const).map((k) => ['A' + k, p * s.sharesA[k]] as [string, number]),
      ...(['KO', 'SUB', 'DEC'] as const).map((k) => ['B' + k, (1 - p) * s.sharesB[k]] as [string, number]),
    ];
    if (outs.sort((a, b) => b[1] - a[1])[0][0] === (y[i] === 1 ? 'A' : 'B') + s.method) exact++;
  }
  const rec = idxWhere((i) => !Number.isNaN(z[i]) && samples[i].date >= RECENT_FROM);
  const metrics: ModelMetrics = {
    trainN: all.length,
    testN: hm.n,
    testFrom: samples[headline[0]]?.date ?? '',
    accuracy: hm.accuracy,
    logLoss: hm.logLoss,
    usesMarket: head.length > 0,
    eloOnlyAccuracy: infoN ? eloOk / infoN : 0,
    methodAccuracy: methodN ? methodHit / methodN : 0,
    exactAccuracy: infoN ? exact / infoN : 0,
    marketOnly: head.length ? evalSet(head, (i) => market[i]!) : null,
    statsSame: evalSet(headline, (i) => sigmoid2(z[i])),
    stats: { from: `${EVAL_FROM}-01-01`, ...evalSet(statsAll, (i) => sigmoid2(z[i])) },
    recent: { from: RECENT_FROM, ...evalSet(rec, (i) => pFinal[i]), statsAccuracy: evalSet(rec, (i) => sigmoid2(z[i])).accuracy },
    marketFights: mIdx.length,
  };
  const zOos = new Map<string, number>();
  for (let i = 0; i < N; i++) if (!Number.isNaN(z[i])) zOos.set(samples[i].id, z[i]);
  return { v2: { keys, sd: stats.sd, coef: stats.coef, market: blend, groupWeights }, metrics, zOos };
}
