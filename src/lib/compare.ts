// Análise de confronto: previsão + explicações em português.

import { DIVISION_BY_KEY, divisionLbs, type DivisionKey } from '../shared/divisions';
import { blendPriors, FEATURES, featureValues, methodPrior, outcomes, type OutcomeTable } from '../shared/model';
import { atDate, FACTOR_LABEL, predictStats, withMarket } from '../shared/model2';
import type { FightEntry, FighterDetail, ModelParams, Priors } from '../shared/types';
import { fmtNum, fmtPct } from './format';

export function shortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  let last = parts[parts.length - 1];
  if (/^(jr\.?|junior|júnior|sr\.?|ii|iii|iv)$/i.test(last) && parts.length > 2) last = parts[parts.length - 2] + ' ' + last;
  return last;
}

function priorsFor(model: ModelParams, k: DivisionKey): Priors {
  return k !== 'CW' && k !== 'OPEN' && model.priors[k] ? model.priors[k] : model.priors.ALL;
}

export interface Factor {
  key: string;
  label: string;
  value: number;          // contribuição no logit (+ favorece A)
  favored: 'A' | 'B' | null;
  text: string;
}

export interface Analysis {
  pA: number;
  /** chance de A só pelas estatísticas (igual a pA quando não há sinal de mercado) */
  pStats: number;
  /** a previsão inclui o sinal de mercado (luta marcada)? */
  usesMarket: boolean;
  table: OutcomeTable;
  mostLikely: { side: 'A' | 'B'; method: 'KO' | 'SUB' | 'DEC'; p: number };
  methodGivenWin: { A: Record<'KO' | 'SUB' | 'DEC', number>; B: Record<'KO' | 'SUB' | 'DEC', number> };
  factors: Factor[];
  reasonsA: string[];
  reasonsB: string[];
  narrative: string[];
  projections: { strA: number; strB: number; tdA: number; tdB: number };
  division: DivisionKey;
  rounds: number;
  lowData: string[];
  common: { opponent: string; a: FightEntry[]; b: FightEntry[] }[];
}

const METHOD_PT = { KO: 'nocaute', SUB: 'finalização', DEC: 'decisão' } as const;

export function analyze(A: FighterDetail, B: FighterDetail, model: ModelParams, opts: { rounds: number; division?: DivisionKey | null; date: string; market?: number | null }): Analysis {
  const division: DivisionKey =
    opts.division && opts.division !== 'OPEN' ? opts.division : A.division === B.division ? A.division : A.division;
  const pa = A.division === B.division || (opts.division && opts.division !== 'OPEN') ? priorsFor(model, division) : blendPriors(priorsFor(model, A.division), priorsFor(model, B.division));
  const va = featureValues(A.totals, pa, opts.date);
  const vb = featureValues(B.totals, pa, opts.date);
  const when = Date.parse(opts.date);
  const lbs = divisionLbs(division);
  const stats = predictStats(model.v2, atDate(A.fv, when, lbs), atDate(B.fv, when, lbs));
  const usesMarket = opts.market != null && !!model.v2.market;
  const pred = { pA: withMarket(model.v2, stats.z, opts.market), rawA: va.raw, rawB: vb.raw, valuesA: va.v, valuesB: vb.v };
  const prior = methodPrior(pa, opts.rounds, model.fiveRoundDecFactor);
  const table = outcomes(pred.pA, A.totals, B.totals, prior);
  const nA = shortName(A.name);
  const nB = shortName(B.name);

  // resultado mais provável
  let mostLikely: Analysis['mostLikely'] = { side: 'A', method: 'DEC', p: 0 };
  for (const side of ['A', 'B'] as const) {
    for (const m of ['KO', 'SUB', 'DEC'] as const) {
      if (table[side][m] > mostLikely.p) mostLikely = { side, method: m, p: table[side][m] };
    }
  }
  const pB = 1 - pred.pA;
  const methodGivenWin = {
    A: { KO: table.A.KO / pred.pA, SUB: table.A.SUB / pred.pA, DEC: table.A.DEC / pred.pA },
    B: { KO: table.B.KO / pB, SUB: table.B.SUB / pB, DEC: table.B.DEC / pB },
  };

  // fatores
  const rawA = pred.rawA;
  const rawB = pred.rawB;
  const vA = pred.valuesA as number[];
  const vB = pred.valuesB as number[];
  const factors: Factor[] = FEATURES
    .map((ft, i) => {
      const value = stats.groups[ft.key] ?? 0;
      const favored: Factor['favored'] = Math.abs(value) < 0.015 ? null : value > 0 ? 'A' : 'B';
      return { key: ft.key, label: FACTOR_LABEL[ft.key] ?? ft.label, value, favored, text: factorText(i, favored, nA, nB, rawA, rawB, A, B) };
    })
    .filter((f) => f.text)
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value));

  // projeções de confronto (estilo x estilo)
  const idx = (k: string) => FEATURES.findIndex((f) => f.key === k);
  const strA = vA[idx('slpm')] * ((1 - vB[idx('def')]) / (1 - pa.def));
  const strB = vB[idx('slpm')] * ((1 - vA[idx('def')]) / (1 - pa.def));
  const tdA = vA[idx('td')] * ((1 - vB[idx('tdDef')]) / (1 - pa.tdDef));
  const tdB = vB[idx('td')] * ((1 - vA[idx('tdDef')]) / (1 - pa.tdDef));

  const lowData = [A, B].filter((f) => f.totals.fights < 3).map((f) => f.name);

  // razões para cada lado
  const reasons = (side: 'A' | 'B') => {
    const me = side === 'A' ? A : B;
    const other = side === 'A' ? B : A;
    const out = factors.filter((f) => f.favored === side).slice(0, 4).map((f) => f.text);
    const pairs: [string, string, (a: string, b: string, pa: number, pb: number) => string][] = [
      ['td', 'tdDef', (a, b, x, y) => `As quedas de ${a} (melhor que ${x}% da categoria) encaram uma defesa de quedas fraca de ${b} (pior que ${100 - y}%).`],
      ['slpm', 'def', (a, b, x, y) => `O volume de ${a} (melhor que ${x}% da categoria) encontra uma defesa em pé vulnerável de ${b} (pior que ${100 - y}%).`],
      ['sub', 'subLossRate', (a, b) => `${a} vive de finalizações e ${b} já foi finalizado(a) ${other.totals.subL} vez(es) no UFC.`],
      ['kd', 'koLossRate', (a, b) => `${a} tem mão pesada e ${b} já perdeu ${other.totals.koL} luta(s) por nocaute.`],
      ['ctrl', 'tdDef', (a, b) => `${a} controla bem no chão e ${b} tem dificuldade para evitar quedas.`],
    ];
    const pMe = me.percentiles as Record<string, number | undefined>;
    const pOt = other.percentiles as Record<string, number | undefined>;
    for (const [mk, ok, txt] of pairs) {
      const x = pMe[mk];
      const y = pOt[ok];
      if (x != null && y != null && x >= 70 && y <= 35) out.push(txt(shortName(me.name), shortName(other.name), x, y));
    }
    return [...new Set(out)].slice(0, 6);
  };

  // narrativa
  const fav = pred.pA >= 0.5 ? nA : nB;
  const favP = Math.max(pred.pA, pB);
  const level = favP < 0.55 ? 'uma luta muito parelha' : favP < 0.65 ? 'leve favoritismo' : favP < 0.75 ? 'favoritismo claro' : 'amplo favoritismo';
  const narrative: string[] = [];
  narrative.push(
    favP < 0.55
      ? `O modelo vê **${level}**: ${nA} tem ${fmtPct(pred.pA)} de chance e ${nB}, ${fmtPct(pB)}. O resultado isolado mais provável é **${mostLikely.side === 'A' ? nA : nB} por ${METHOD_PT[mostLikely.method]}** (${fmtPct(mostLikely.p)}).`
      : `**${fav}** chega com ${level} — ${fmtPct(favP)} de chance de vitória segundo o modelo. O resultado isolado mais provável é **${mostLikely.side === 'A' ? nA : nB} por ${METHOD_PT[mostLikely.method]}** (${fmtPct(mostLikely.p)}).`,
  );
  if (usesMarket) {
    const sA = stats.p;
    const sFav = sA >= 0.5 ? nA : nB;
    const same = (sA >= 0.5) === (pred.pA >= 0.5);
    const diff = Math.abs(pred.pA - sA);
    narrative.push(
      `**Estatísticas × mercado:** como a luta está marcada, a previsão combina as estatísticas com o consenso do mercado (usado só no cálculo). Só pelas estatísticas, ${sFav} teria ${fmtPct(Math.max(sA, 1 - sA))}. ` +
        (!same
          ? `O mercado **inverte** esse favoritismo — sinal de que há informação fora dos números do UFC (lesões, camp, carreira anterior, estilo).`
          : diff < 0.04
            ? 'O mercado praticamente concorda com os números.'
            : (Math.max(pred.pA, pB) > Math.max(sA, 1 - sA) ? 'O mercado **reforça** esse favoritismo.' : 'O mercado vê uma luta **mais equilibrada** do que os números sugerem.')),
    );
  }
  const strEdge = strA - strB;
  narrative.push(
    `**Em pé:** cruzando o volume de cada um com a defesa do outro, a projeção é de ${nA} conectar cerca de **[a:${fmtNum(strA, 1)} golpes significativos por minuto]** e ${nB}, **[b:${fmtNum(strB, 1)}]**. ` +
      (Math.abs(strEdge) < 0.4
        ? 'Na trocação, a disputa tende a ser equilibrada.'
        : `${strEdge > 0 ? nA : nB} deve levar vantagem na trocação.`) +
      knockdownLine(nA, nB, A, B),
  );
  if (Math.max(tdA, tdB) < 0.6) {
    narrative.push(`**No chão:** nenhum dos dois deve buscar muitas quedas (projeção de ${fmtNum(tdA, 1)} × ${fmtNum(tdB, 1)} a cada 15 min). A tendência é a luta acontecer em pé.`);
  } else {
    const g = tdA >= tdB ? nA : nB;
    const gs = tdA >= tdB ? 'a' : 'b';
    const o = tdA >= tdB ? nB : nA;
    const gDef = tdA >= tdB ? B.rates.tdDef : A.rates.tdDef;
    const proj = Math.max(tdA, tdB);
    narrative.push(
      `**No chão:** ${g} é quem deve buscar a queda — projeção de **[${gs}:${fmtNum(proj, 1)} quedas a cada 15 min]** contra uma defesa de ${fmtPct(gDef)} de ${o}. ` +
        (proj >= 1.5 ? `Se conseguir impor esse jogo, ${g} pode controlar boa parte da luta.` : `${o} tem chance real de manter a luta em pé.`),
    );
  }
  const finA = methodGivenWin.A;
  const finB = methodGivenWin.B;
  narrative.push(
    `**Como cada um vence:** se ${nA} vencer, o caminho mais provável é ${METHOD_PT[top(finA)]} (${fmtPct(finA[top(finA)])}); se ${nB} vencer, ${METHOD_PT[top(finB)]} (${fmtPct(finB[top(finB)])}). ` +
      (opts.rounds >= 5 ? `Por ser uma luta de 5 rounds, há mais tempo para finalizações e o cardio pesa mais.` : ''),
  );
  const extras: string[] = [];
  const ageA = A.age, ageB = B.age;
  if (ageA != null && ageB != null && Math.abs(ageA - ageB) >= 4) extras.push(`${ageA < ageB ? nA : nB} é ${Math.abs(ageA - ageB)} anos mais jovem`);
  if (A.reachCm && B.reachCm && Math.abs(A.reachCm - B.reachCm) >= 5) extras.push(`${A.reachCm > B.reachCm ? nA : nB} tem ${Math.abs(A.reachCm - B.reachCm)} cm a mais de envergadura`);
  if (opts.rounds >= 5) {
    const fa = A.fiveRoundFights, fb = B.fiveRoundFights;
    if (fa !== fb) extras.push(`${fa > fb ? nA : nB} tem mais experiência em 5 rounds (${Math.max(fa, fb)} × ${Math.min(fa, fb)} lutas)`);
  }
  if (extras.length) narrative.push(`**Outros pontos:** ${extras.join('; ')}.`);
  if (lowData.length) {
    narrative.push(`**Atenção:** ${lowData.join(' e ')} ${lowData.length > 1 ? 'têm' : 'tem'} menos de 3 lutas no UFC. Nesses casos as estatísticas são puxadas para a média da categoria e a previsão é menos confiável.`);
  }

  // adversários em comum
  const oppA = new Map<string, FightEntry[]>();
  for (const f of A.fights) {
    if (!oppA.has(f.opponent.id)) oppA.set(f.opponent.id, []);
    oppA.get(f.opponent.id)!.push(f);
  }
  const commonMap = new Map<string, { opponent: string; a: FightEntry[]; b: FightEntry[] }>();
  for (const f of B.fights) {
    const fa = oppA.get(f.opponent.id);
    if (!fa || f.opponent.id === A.id) continue;
    if (!commonMap.has(f.opponent.id)) commonMap.set(f.opponent.id, { opponent: f.opponent.name, a: fa, b: [] });
    commonMap.get(f.opponent.id)!.b.push(f);
  }

  return {
    pA: pred.pA,
    pStats: stats.p,
    usesMarket,
    table,
    mostLikely,
    methodGivenWin,
    factors,
    reasonsA: reasons('A'),
    reasonsB: reasons('B'),
    narrative,
    projections: { strA, strB, tdA, tdB },
    division,
    rounds: opts.rounds,
    lowData,
    common: [...commonMap.values()],
  };
}

const top = (m: Record<'KO' | 'SUB' | 'DEC', number>) => (Object.entries(m) as ['KO' | 'SUB' | 'DEC', number][]).sort((a, b) => b[1] - a[1])[0][0];

function knockdownLine(nA: string, nB: string, A: FighterDetail, B: FighterDetail): string {
  const kA = A.rates.kd, kB = B.rates.kd;
  if (Math.max(kA, kB) < 0.3) return '';
  const p = kA >= kB ? nA : nB;
  const o = kA >= kB ? B : A;
  const k = Math.max(kA, kB);
  return ` ${p} derruba ${fmtNum(k, 2)} vezes a cada 15 min${o.totals.koL ? `, e ${shortName(o.name)} já perdeu ${o.totals.koL} vez(es) por nocaute no UFC` : ''}.`;
}

function factorText(
  i: number, favored: 'A' | 'B' | null, nA: string, nB: string,
  ra: (number | null)[], rb: (number | null)[], A: FighterDetail, B: FighterDetail,
): string {
  if (!favored) return '';
  const key = FEATURES[i].key;
  const [w, l] = favored === 'A' ? [nA, nB] : [nB, nA];
  const [wv, lv] = favored === 'A' ? [ra[i], rb[i]] : [rb[i], ra[i]];
  const W = favored === 'A' ? A : B;
  const L = favored === 'A' ? B : A;
  const has = wv != null && lv != null;
  // O fator soma várias variáveis (carreira, lutas recentes, ajuste pelo adversário). Quando o
  // número de carreira aponta para o outro lado, usamos um texto que não cita esse número.
  const lowerBetter = key === 'sapm' || key === 'kdAbs' || key === 'age' || key === 'layoff' || key === 'koLoss';
  let agrees = has ? ((wv as number) - (lv as number)) * (lowerBetter ? -1 : 1) > 0 : false;
  if (key === 'elo') agrees = W.elo > L.elo;
  if (key === 'form') {
    const wins = (f: FighterDetail) => f.totals.recent.slice(-3).filter((r) => r === 'W').length;
    agrees = wins(W) > wins(L);
  }
  if (key === 'koLoss') agrees = L.totals.koL > 0 && L.totals.koL * Math.max(1, W.totals.fights) > W.totals.koL * Math.max(1, L.totals.fights);
  if (!agrees) {
    const generic: Record<string, string> = {
      elo: `${w} leva vantagem no conjunto dos ratings — resultados, momento e nível dos adversários que enfrentou no UFC.`,
      slpm: `${w} leva vantagem no volume de golpes quando se olha para as lutas mais recentes e para o nível dos adversários.`,
      sapm: `${w} tem absorvido menos golpes nas lutas mais recentes, considerando quem enfrentou.`,
      acc: `${w} tem sido mais preciso(a) em pé nas lutas mais recentes, considerando quem enfrentou.`,
      def: `${w} tem se defendido melhor em pé nas lutas mais recentes, considerando quem enfrentou.`,
      td: `${w} leva vantagem no jogo de quedas quando se cruza o ataque de um com a defesa do outro.`,
      tdAcc: `${w} tem aproveitado melhor as quedas nas lutas mais recentes, considerando quem enfrentou.`,
      tdDef: `${w} tem defendido melhor as quedas nas lutas mais recentes, considerando quem enfrentou.`,
      sub: `${w} leva vantagem no jogo de finalização — a ameaça de um contra a vulnerabilidade do outro.`,
      kd: `${w} leva vantagem no poder de nocaute quando se cruza a mão de um com o queixo do outro.`,
      kdAbs: `${w} tem ido menos ao chão por golpes nas lutas mais recentes.`,
      ctrl: `${w} leva vantagem no controle e no jogo de chão nas lutas mais recentes.`,
      form: `${w} vem em melhor momento — sequência, tendência do rating e resultados recentes.`,
      koLoss: `${w} leva vantagem no quesito queixo: histórico e proximidade de derrotas por nocaute.`,
    };
    return generic[key] ?? '';
  }
  switch (key) {
    case 'elo':
      return `${w} tem rating Elo mais alto (${Math.round(W.elo)} × ${Math.round(L.elo)}): resultados melhores e contra adversários mais fortes no UFC.`;
    case 'slpm':
      return has ? `${w} conecta mais golpes significativos: ${fmtNum(wv, 2)} por minuto, contra ${fmtNum(lv, 2)} de ${l}.` : '';
    case 'sapm':
      return has ? `${w} absorve menos golpes: ${fmtNum(wv, 2)} por minuto, contra ${fmtNum(lv, 2)} de ${l}.` : '';
    case 'acc':
      return has ? `${w} é mais preciso(a) em pé: acerta ${fmtPct(wv)} dos golpes, contra ${fmtPct(lv)} de ${l}.` : '';
    case 'def':
      return has ? `${w} defende melhor em pé: evita ${fmtPct(wv)} dos golpes, contra ${fmtPct(lv)} de ${l}.` : '';
    case 'td':
      return has ? `${w} busca mais quedas: ${fmtNum(wv, 2)} a cada 15 min, contra ${fmtNum(lv, 2)} de ${l}.` : '';
    case 'tdAcc':
      return has ? `${w} completa mais quedas: ${fmtPct(wv)} de aproveitamento, contra ${fmtPct(lv)} de ${l}.` : '';
    case 'tdDef':
      return has ? `${w} defende melhor as quedas: ${fmtPct(wv)}, contra ${fmtPct(lv)} de ${l}.` : '';
    case 'sub':
      return has ? `${w} ameaça mais com finalizações: ${fmtNum(wv, 2)} tentativas a cada 15 min, contra ${fmtNum(lv, 2)} de ${l}.` : '';
    case 'kd':
      return has ? `${w} tem mais poder de nocaute: ${fmtNum(wv, 2)} knockdowns a cada 15 min, contra ${fmtNum(lv, 2)} de ${l}.` : '';
    case 'kdAbs':
      return has ? `${l} vai mais ao chão: sofre ${fmtNum(lv, 2)} knockdowns a cada 15 min, contra ${fmtNum(wv, 2)} de ${w}.` : '';
    case 'ctrl':
      return has ? `${w} controla mais a luta: ${fmtPct(wv)} do tempo em controle, contra ${fmtPct(lv)} de ${l}.` : '';
    case 'age':
      return has ? `${w} é mais jovem (${Math.floor(wv as number)} × ${Math.floor(lv as number)} anos) — idade pesa bastante no MMA.` : '';
    case 'reach':
      return has ? `${w} tem mais envergadura (${Math.round((wv as number) * 2.54)} × ${Math.round((lv as number) * 2.54)} cm).` : '';
    case 'exp':
      return has ? `${w} tem mais experiência no UFC (${wv} × ${lv} lutas).` : '';
    case 'form': {
      const wr = W.totals.recent.slice(-3), lr = L.totals.recent.slice(-3);
      return `${w} vem em melhor fase: ${wr.filter((r) => r === 'W').length} vitória(s) nas últimas ${wr.length}, contra ${lr.filter((r) => r === 'W').length} de ${l}.`;
    }
    case 'layoff':
      return has ? `${l} está mais tempo parado(a): ${Math.round((lv as number) / 30)} meses sem lutar, contra ${Math.round((wv as number) / 30)} de ${w}.` : '';
    case 'koLoss':
      return `${l} é mais vulnerável a nocautes: ${L.totals.koL} derrota(s) por KO em ${L.totals.fights} lutas, contra ${W.totals.koL} em ${W.totals.fights} de ${w}.`;
    default:
      return '';
  }
}

export const divisionLabel = (k: DivisionKey) => DIVISION_BY_KEY[k]?.name ?? k;
