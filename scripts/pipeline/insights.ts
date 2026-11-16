// Taxas de carreira, percentis, estilo de luta e pontos fortes/fracos (regras).

import type { FightEntry, FormInfo, Insight, ModelState, Rates, StatRank } from '../../src/shared/types';
import { S } from '../../src/shared/types';

const nf = (n: number, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pc = (n: number) => `${Math.round(n * 100)}%`;

export function computeRates(st: ModelState, fights: FightEntry[]): Rates {
  const min = st.time / 60;
  const r = (x: number, d: number) => (d > 0 ? x / d : 0);
  // ritmo: golpes no R3 vs R1 nas lutas que chegaram ao 3º round
  let r1 = 0, r3 = 0, n3 = 0;
  for (const f of fights) {
    // só lutas em que o 3º round foi completo (evita distorção de finalizações no R3)
    if (!f.stats || f.stats.rounds.length < 3 || f.durationSec < 15 * 60) continue;
    r1 += f.stats.rounds[0][0][S.sigL];
    r3 += f.stats.rounds[2][0][S.sigL];
    n3++;
  }
  const finishes = st.koW + st.subW;
  return {
    slpm: r(st.sigL, min),
    sapm: r(st.sigAbs, min),
    acc: r(st.sigL, st.sigA),
    def: st.sigOppA ? 1 - st.sigAbs / st.sigOppA : 0,
    td: r(st.tdL, min) * 15,
    tdAcc: r(st.tdL, st.tdA),
    tdDef: st.tdOppA ? 1 - st.tdAbs / st.tdOppA : 0,
    sub: r(st.sub, min) * 15,
    kd: r(st.kd, min) * 15,
    kdAbs: r(st.kdAbs, min) * 15,
    ctrl: r(st.ctrl, st.time),
    avgFightMin: r(min, fights.filter((f) => f.stats).length),
    finishRate: r(finishes, st.wins),
    koLossRate: r(st.koL, st.fights),
    subLossRate: r(st.subL, st.fights),
    paceRatio: n3 >= 2 && r1 >= 15 ? r3 / r1 : null,
  };
}

/** Métricas com percentil e orientação (true = maior é melhor). */
export const PCT_KEYS: [keyof Rates, boolean][] = [
  ['slpm', true], ['sapm', false], ['acc', true], ['def', true],
  ['td', true], ['tdAcc', true], ['tdDef', true], ['sub', true],
  ['kd', true], ['kdAbs', false], ['ctrl', true], ['finishRate', true],
  ['koLossRate', false], ['subLossRate', false],
];

export function eligibleFor(key: keyof Rates, st: ModelState): boolean {
  if (st.time < 15 * 60 || st.fights < 2) return false;
  if (key === 'acc') return st.sigA >= 50;
  if (key === 'def') return st.sigOppA >= 50;
  if (key === 'tdAcc') return st.tdA >= 5;
  if (key === 'tdDef') return st.tdOppA >= 5;
  if (key === 'finishRate') return st.wins >= 2;
  return true;
}

/** Percentis "orientados" (0–100, maior = melhor) dentro de cada grupo; `ranksOut` recebe também a posição. */
export function computePercentiles(
  items: { id: string; group: string; women: boolean; rates: Rates; st: ModelState }[],
  ranksOut?: Map<string, Partial<Record<keyof Rates, StatRank>>>,
): Map<string, Partial<Record<keyof Rates, number>>> {
  const out = new Map<string, Partial<Record<keyof Rates, number>>>();
  for (const it of items) { out.set(it.id, {}); ranksOut?.set(it.id, {}); }
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    if (!groups.has(it.group)) groups.set(it.group, []);
    groups.get(it.group)!.push(it);
  }
  for (const [key, higher] of PCT_KEYS) {
    for (const it of items) {
      if (!eligibleFor(key, it.st)) continue;
      let pool = (groups.get(it.group) ?? []).filter((o) => eligibleFor(key, o.st));
      let scope: StatRank['scope'] = 'cat';
      if (pool.length < 15) { pool = items.filter((o) => o.women === it.women && eligibleFor(key, o.st)); scope = 'gen'; }
      const v = it.rates[key] as number;
      const vals = pool.map((o) => o.rates[key] as number);
      const below = vals.filter((x) => (higher ? x < v : x > v)).length;
      const equal = vals.filter((x) => x === v).length;
      out.get(it.id)![key] = Math.round((100 * (below + equal / 2)) / vals.length);
      const better = vals.filter((x) => (higher ? x > v : x < v)).length;
      if (ranksOut) ranksOut.get(it.id)![key] = { pos: better + 1, of: vals.length, scope };
    }
  }
  return out;
}

// --- Forma recente -----------------------------------------------------------------------

/**
 * Nota de forma (0–100) com as últimas N lutas (padrão 5), as mais recentes pesando mais.
 * Cada luta vale "resultado − resultado esperado pelo Elo": vencer um adversário forte pontua mais,
 * perder para um muito mais forte pesa pouco. Finalização/nocaute ajusta ±0,10. Poucas lutas
 * puxam a nota para 50.
 */
export function computeForm(entries: FightEntry[], window = 5): FormInfo | null {
  const last = entries.filter((e) => e.result !== 'NC').slice(0, window); // entries: mais recente primeiro
  // a luta mais antiga da janela sempre pesa ~35% da mais recente, qualquer que seja o tamanho da janela
  const decay = window > 1 ? 0.35 ** (1 / (window - 1)) : 1;
  if (!last.length) return null;
  let sum = 0, wsum = 0;
  const last5: FormInfo['last5'] = [];
  last.forEach((e, k) => {
    const exp = 1 / (1 + 10 ** ((e.oppEloBefore - e.eloBefore) / 400));
    const sc = e.result === 'W' ? 1 : e.result === 'L' ? 0 : 0.5;
    const fin = e.method === 'KO' || e.method === 'SUB';
    const perf = sc - exp + (sc === 1 && fin ? 0.1 : sc === 0 && fin ? -0.1 : 0);
    const w = decay ** k;
    sum += w * perf; wsum += w;
    last5.push({ r: e.result as 'W' | 'L' | 'D', opp: e.opponent.name, method: e.method, date: e.date, delta: Math.round(perf * 100) / 100 });
  });
  const n = last.length;
  const avg = (sum / wsum) * (n / (n + 1));
  const score = Math.max(0, Math.min(100, Math.round(50 + 55 * avg)));
  const label = score >= 70 ? 'Em alta' : score >= 58 ? 'Boa fase' : score >= 43 ? 'Regular' : score >= 30 ? 'Em baixa' : 'Em crise';
  return { score, label, last5 };
}

// --- Estilo -------------------------------------------------------------------------

export interface StyleResult { style: string; tags: string[]; text: string }

export function classifyStyle(
  st: ModelState,
  rates: Rates,
  p: Partial<Record<keyof Rates, number>>,
  target: { head: number; body: number; leg: number },
  position: { dist: number; clinch: number; ground: number },
): StyleResult {
  const landed = target.head + target.body + target.leg || 1;
  const pos = position.dist + position.clinch + position.ground || 1;
  const legShare = target.leg / landed;
  const bodyShare = target.body / landed;
  const headShare = target.head / landed;
  const distShare = position.dist / pos;
  const clinchShare = position.clinch / pos;
  const groundShare = position.ground / pos;
  const g = (k: keyof Rates) => p[k] ?? 50;

  if (st.fights < 1 || st.time < 60) {
    return { style: 'Estreante', tags: [], text: 'Ainda sem lutas registradas no UFC — não há estatísticas suficientes para definir o estilo.' };
  }

  const wrestling = (g('td') + g('ctrl')) / 2;
  const bjj = g('sub');
  const striking = (g('slpm') + g('kd') + g('acc')) / 3;

  let style: string;
  if (wrestling >= 72 && wrestling >= bjj) style = 'Wrestler';
  // jiu-jitsu exige também envolvimento real no chão (quedas ou controle)
  else if (bjj >= 80 && (st.subW >= 1 || rates.sub >= 1) && (g('td') >= 55 || g('ctrl') >= 50)) style = 'Especialista em jiu-jitsu';
  else if (wrestling >= 58 && striking >= 58) style = 'Lutador completo';
  else if (wrestling >= 60 || (bjj >= 65 && wrestling >= 50)) style = 'Grappler';
  else style = 'Trocador';

  const tags: string[] = [];
  if (g('slpm') >= 75) tags.push('Volume alto');
  if (g('kd') >= 75 || (st.wins >= 3 && st.koW / st.wins >= 0.5)) tags.push('Mão pesada');
  if (g('def') >= 70 && g('slpm') <= 50) tags.push('Contra-ataque');
  if (legShare >= 0.22) tags.push('Chutes nas pernas');
  if (bodyShare >= 0.24) tags.push('Trabalho de corpo');
  if (clinchShare >= 0.25) tags.push('Clinch');
  if (groundShare >= 0.25 && g('ctrl') >= 60) tags.push('Ground and pound');
  if (g('sub') >= 75) tags.push('Ameaça de finalização');
  if (g('td') >= 75) tags.push('Quedas');
  if (g('tdDef') >= 80) tags.push('Anti-queda');
  if (rates.paceRatio != null && rates.paceRatio >= 1.1) tags.push('Cardio forte');
  if (st.wins >= 3 && rates.finishRate >= 0.7) tags.push('Finalizador nato');

  const parts: string[] = [];
  const intro: Record<string, string> = {
    Wrestler: 'Wrestler que busca levar a luta para o chão',
    'Especialista em jiu-jitsu': 'Especialista em jiu-jitsu, perigoso nas finalizações',
    'Lutador completo': 'Lutador completo, competente em pé e no chão',
    Grappler: 'Grappler que mistura quedas e jogo de chão',
    Trocador: 'Trocador que prefere decidir a luta em pé',
  };
  parts.push(
    `${intro[style]}: conecta ${nf(rates.slpm, 2)} golpes significativos por minuto com ${pc(rates.acc)} de precisão` +
      (rates.td >= 0.5 ? ` e média de ${nf(rates.td, 2)} quedas a cada 15 min.` : '.'),
  );
  if (landed > 20) {
    const where = headShare >= 0.6 ? 'mira principalmente a cabeça' : legShare >= 0.22 ? 'ataca muito as pernas' : bodyShare >= 0.24 ? 'investe bastante no corpo' : 'distribui bem os alvos';
    const at = distShare >= 0.7
      ? 'trabalha principalmente à distância'
      : clinchShare >= 0.25 && clinchShare >= groundShare
        ? 'tem muito trabalho no clinch'
        : groundShare >= 0.25
          ? 'causa bastante dano no solo'
          : 'divide o trabalho entre distância, clinch e solo';
    parts.push(`Nos golpes, ${where} (${pc(headShare)} cabeça, ${pc(bodyShare)} corpo, ${pc(legShare)} pernas) e ${at}.`);
  }
  if (st.wins > 0) {
    parts.push(`Das ${st.wins} vitórias no UFC, ${st.koW} foram por nocaute, ${st.subW} por finalização e ${st.decW} por decisão.`);
  }
  return { style, tags, text: parts.join(' ') };
}

// --- Pontos fortes e fracos --------------------------------------------------------------

export function strengthsWeaknesses(
  st: ModelState,
  rates: Rates,
  p: Partial<Record<keyof Rates, number>>,
  fights: FightEntry[],
  divisionName: string,
  refDate: string,
  age: number | null,
): { strengths: Insight[]; weaknesses: Insight[] } {
  const S_: Insight[] = [];
  const W_: Insight[] = [];
  const has = (k: keyof Rates) => p[k] != null;
  const pct = (k: keyof Rates) => p[k] as number;
  const top = (k: keyof Rates) => `top ${Math.max(1, 100 - pct(k))}% do ${divisionName}`;
  const bottom = (k: keyof Rates) => `entre os ${Math.max(1, pct(k))}% piores do ${divisionName}`;
  const strong = (k: keyof Rates) => has(k) && pct(k) >= 75;
  const weak = (k: keyof Rates) => has(k) && pct(k) <= 25;
  const sc = (k: keyof Rates) => Math.abs(pct(k) - 50) / 50;

  if (strong('slpm')) S_.push({ key: 'slpm', title: 'Volume de golpes', text: `Conecta ${nf(rates.slpm, 2)} golpes significativos por minuto (${top('slpm')}).`, score: sc('slpm') });
  if (strong('acc')) S_.push({ key: 'acc', title: 'Precisão', text: `Acerta ${pc(rates.acc)} dos golpes significativos (${top('acc')}).`, score: sc('acc') });
  if (strong('def')) S_.push({ key: 'def', title: 'Defesa em pé', text: `Evita ${pc(rates.def)} dos golpes do adversário (${top('def')}).`, score: sc('def') });
  if (strong('sapm')) S_.push({ key: 'sapm', title: 'Difícil de acertar', text: `Absorve só ${nf(rates.sapm, 2)} golpes significativos por minuto (${top('sapm')}).`, score: sc('sapm') });
  if (strong('kd') && st.kd >= 2) S_.push({ key: 'kd', title: 'Poder de nocaute', text: `${st.kd} knockdowns no UFC — ${nf(rates.kd, 2)} a cada 15 min (${top('kd')}).`, score: sc('kd') });
  if (strong('td') && st.tdL >= 3) S_.push({ key: 'td', title: 'Quedas', text: `Média de ${nf(rates.td, 2)} quedas a cada 15 min (${top('td')}).`, score: sc('td') });
  if (strong('tdAcc')) S_.push({ key: 'tdAcc', title: 'Quedas eficientes', text: `Completa ${pc(rates.tdAcc)} das tentativas de queda (${top('tdAcc')}).`, score: sc('tdAcc') * 0.8 });
  if (strong('tdDef')) S_.push({ key: 'tdDef', title: 'Defesa de quedas', text: `Defende ${pc(rates.tdDef)} das quedas tentadas pelos adversários (${top('tdDef')}).`, score: sc('tdDef') });
  if (strong('sub') && st.sub >= 2) S_.push({ key: 'sub', title: 'Ameaça de finalização', text: `${nf(rates.sub, 2)} tentativas de finalização a cada 15 min (${top('sub')}).`, score: sc('sub') });
  if (strong('ctrl')) S_.push({ key: 'ctrl', title: 'Controle no solo', text: `Passa ${pc(rates.ctrl)} do tempo de luta controlando o adversário (${top('ctrl')}).`, score: sc('ctrl') });
  if (strong('finishRate') && st.wins >= 3) S_.push({ key: 'finishRate', title: 'Finalizador', text: `${pc(rates.finishRate)} das vitórias vieram antes do fim da luta.`, score: sc('finishRate') });
  if (st.fights >= 5 && st.koL === 0) S_.push({ key: 'chin', title: 'Queixo resistente', text: `Nunca sofreu nocaute em ${st.fights} lutas no UFC.`, score: 0.7 });
  if (rates.paceRatio != null && rates.paceRatio >= 1.1) S_.push({ key: 'cardio', title: 'Cardio', text: `Aumenta o ritmo ao longo da luta: conecta ${pc(rates.paceRatio)} no 3º round em relação ao 1º.`, score: Math.min(1, rates.paceRatio - 0.6) });
  const five = fights.filter((f) => f.scheduledRounds === 5).length;
  if (five >= 3) S_.push({ key: 'fiveRounds', title: 'Experiência em 5 rounds', text: `${five} lutas de 5 rounds no UFC.`, score: Math.min(1, five / 8) });
  const recent = st.recent.slice(-3);
  if (recent.length === 3 && recent.every((r) => r === 'W')) S_.push({ key: 'form', title: 'Boa fase', text: `Venceu as últimas ${recentStreak(fights)} lutas.`, score: 0.6 });

  if (weak('slpm')) W_.push({ key: 'slpm', title: 'Pouco volume', text: `Conecta apenas ${nf(rates.slpm, 2)} golpes significativos por minuto (${bottom('slpm')}).`, score: sc('slpm') });
  if (weak('acc')) W_.push({ key: 'acc', title: 'Precisão baixa', text: `Acerta só ${pc(rates.acc)} dos golpes significativos (${bottom('acc')}).`, score: sc('acc') });
  if (weak('def')) W_.push({ key: 'def', title: 'Defesa em pé', text: `Defende apenas ${pc(rates.def)} dos golpes do adversário (${bottom('def')}).`, score: sc('def') });
  if (weak('sapm')) W_.push({ key: 'sapm', title: 'Absorve muitos golpes', text: `Recebe ${nf(rates.sapm, 2)} golpes significativos por minuto (${bottom('sapm')}).`, score: sc('sapm') });
  if (weak('tdDef')) W_.push({ key: 'tdDef', title: 'Defesa de quedas', text: `Defende só ${pc(rates.tdDef)} das quedas (${bottom('tdDef')}).`, score: sc('tdDef') });
  if (weak('kdAbs') && st.kdAbs >= 2) W_.push({ key: 'kdAbs', title: 'Vai muito ao chão', text: `Sofreu ${st.kdAbs} knockdowns no UFC (${nf(rates.kdAbs, 2)} a cada 15 min).`, score: sc('kdAbs') });
  if (st.koL >= 2 && rates.koLossRate >= 0.25) W_.push({ key: 'koL', title: 'Vulnerável a nocautes', text: `${st.koL} das ${st.losses} derrotas no UFC foram por nocaute.`, score: Math.min(1, rates.koLossRate * 2) });
  if (st.subL >= 2 && rates.subLossRate >= 0.2) W_.push({ key: 'subL', title: 'Vulnerável a finalizações', text: `${st.subL} das ${st.losses} derrotas no UFC foram por finalização.`, score: Math.min(1, rates.subLossRate * 2.2) });
  if (rates.paceRatio != null && rates.paceRatio <= 0.7) W_.push({ key: 'cardio', title: 'Cai de rendimento', text: `No 3º round conecta só ${pc(rates.paceRatio)} do volume do 1º round.`, score: Math.min(1, 1.1 - rates.paceRatio) });
  if (st.lastDate) {
    const days = (Date.parse(refDate) - Date.parse(st.lastDate)) / 864e5;
    if (days > 450) W_.push({ key: 'layoff', title: 'Inatividade', text: `Está há ${Math.round(days / 30)} meses sem lutar.`, score: Math.min(1, days / 900) });
  }
  if (age != null && age >= 36) W_.push({ key: 'age', title: 'Idade', text: `Tem ${Math.floor(age)} anos — acima da média de idade dos atletas do UFC.`, score: Math.min(1, (age - 33) / 8) });
  const lastTwo = st.recent.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((r) => r === 'L')) W_.push({ key: 'form', title: 'Má fase', text: `Perdeu as últimas ${recentStreak(fights)} lutas.`, score: 0.6 });

  S_.sort((a, b) => b.score - a.score);
  W_.sort((a, b) => b.score - a.score);
  return { strengths: S_.slice(0, 6), weaknesses: W_.slice(0, 6) };
}

/** Sequência atual (fights em ordem decrescente de data; ignora NC). */
export function recentStreak(fights: FightEntry[]): number {
  const valid = fights.filter((f) => f.result !== 'NC');
  if (!valid.length) return 0;
  const first = valid[0].result;
  let n = 0;
  for (const f of valid) {
    if (f.result !== first) break;
    n++;
  }
  return n;
}
