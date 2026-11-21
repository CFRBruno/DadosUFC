// "Prospectos": lutadores com até 5 lutas no UFC que já mostram números muito acima da média
// e um estilo de luta que termina cedo (nocaute ou finalização). Não é previsão de carreira:
// é uma nota de "vale assistir", baseada só no que já aconteceu no octógono.
//
// Nota (0–100) = 28% finalização (vitórias que não foram para a decisão, com prior para amostras pequenas)
//              + 24% ofensiva (percentil de golpes, knockdowns, finalizações, quedas)
//              + 14% versatilidade (o menor entre ofensiva em pé e no chão)
//              + 14% rapidez (vitórias terminadas bem antes do tempo regulamentar)
//              + 12% domínio (absorve pouco, defende bem)
//              + 8% adversários (Elo médio dos oponentes batidos)
//              − penalidades por derrotas e por decisões.
// Filtros: no máximo 1 derrota (e só com 3+ vitórias, todas antes da decisão), 75%+ das vitórias antes da decisão,
// no máximo 1 em 4 lutas decidida pelos juízes e nota mínima de 55.

import type { FighterDetail, Prospect } from '../../src/shared/types';

const MAX_FIGHTS = 5;
const MIN_SCORE = 55;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

type Pool = { women: boolean; rates: FighterDetail['rates'] };

/** Percentil de um valor contra a distribuição do mesmo gênero (maior = melhor, exceto quando `lower`). */
function makePct(pool: Pool[]) {
  const keys = ['slpm', 'kd', 'sub', 'td', 'ctrl', 'sapm', 'def', 'acc'] as const;
  const arr = new Map<string, number[]>();
  for (const k of keys) for (const g of [true, false]) arr.set(`${k}|${g}`, pool.filter((p) => p.women === g).map((p) => p.rates[k] as number).sort((a, b) => a - b));
  return (women: boolean, k: (typeof keys)[number], v: number, lower = false) => {
    const a = arr.get(`${k}|${women}`)!;
    if (!a.length) return 0.5;
    let below = 0, eq = 0;
    for (const x of a) { if (lower ? x > v : x < v) below++; else if (x === v) eq++; }
    return (below + eq / 2) / a.length;
  };
}

export function computeProspects(details: FighterDetail[], today: string): Map<string, Prospect> {
  // referência: quem já tem pelo menos 5 minutos de luta com estatísticas
  const pool = details.filter((d) => d.totals.time >= 300).map((d) => ({ women: d.women, rates: d.rates }));
  const pct = makePct(pool);
  const cutoff = new Date(Date.parse(today) - 3 * 365 * 864e5).toISOString().slice(0, 10);
  const rows: { d: FighterDetail; p: Prospect }[] = [];
  for (const d of details) {
    const st = d.totals;
    if (d.fights.length < 1 || d.fights.length > MAX_FIGHTS) continue;
    if (!d.active || (d.lastFight ?? '') < cutoff || d.ufcStatus?.kind === 'dispensado' || d.ufcStatus?.kind === 'aposentado') continue;
    if (st.time < 120 || st.wins < 1 || st.losses > 1) continue;
    // "implacável": no máximo uma derrota, e só se vier com 3+ vitórias, todas antes da decisão
    if (st.losses === 1 && !(st.wins >= 3 && st.koW + st.subW === st.wins)) continue;
    const decided = d.fights.filter((e) => e.result !== 'NC');
    const fin = st.koW + st.subW;
    const finScore = (fin + 0.5) / (st.wins + 1); // prior de 50% para amostras pequenas
    // taxas "estabilizadas": lutas de segundos geram taxas absurdas (ex.: 7 knockdowns a cada 15 min),
    // então somamos minutos de prior ao denominador. Quem luta pouco é comparado de forma conservadora.
    const min = st.time / 60;
    const r = { ...d.rates, slpm: (st.sigL / (min + 2)), kd: (st.kd * 15) / (min + 8), sub: (st.sub * 15) / (min + 8), td: (st.tdL * 15) / (min + 8) };
    const strike = (pct(d.women, 'slpm', r.slpm) + pct(d.women, 'kd', r.kd)) / 2;
    const ground = (pct(d.women, 'sub', r.sub) + pct(d.women, 'td', r.td) + pct(d.women, 'ctrl', r.ctrl)) / 3;
    const offense = Math.max(strike, ground) * 0.6 + ((strike + ground) / 2) * 0.4;
    const versatility = Math.min(strike, ground) * 0.5 + (st.koW > 0 && st.subW > 0 ? 0.5 : 0);
    const wins = decided.filter((e) => e.result === 'W');
    // rapidez: fração do tempo regulamentar usada nas vitórias (menos = melhor)
    const speed = wins.length
      ? wins.reduce((s, e) => s + (e.method === 'KO' || e.method === 'SUB' ? clamp(1 - e.durationSec / (e.scheduledRounds * 300) / 0.8) : 0), 0) / wins.length
      : 0;
    const dominance = (pct(d.women, 'sapm', r.sapm, true) + pct(d.women, 'def', r.def)) / 2;
    const oppElo = wins.length ? wins.reduce((s, e) => s + e.oppEloBefore, 0) / wins.length : 1500;
    const opp = clamp((oppElo - 1400) / 250);
    const decShare = decided.filter((e) => e.method === 'DEC').length / Math.max(1, decided.length);
    let score = 100 * (0.28 * finScore + 0.24 * offense + 0.14 * versatility + 0.14 * speed + 0.12 * dominance + 0.08 * opp);
    score -= 12 * st.losses + 14 * decShare;
    score *= 0.88 + 0.12 * Math.min(1, st.time / 900); // pouca luta = nota puxada para baixo
    // exigência mínima: precisa ter terminado luta(s) e ser claramente acima da média
    // exigência mínima: pelo menos 75% das vitórias antes da decisão, no máximo 1 em 4 lutas indo para os juízes
    if (fin < 1 || fin / st.wins < 0.75 || decShare > 0.25 || offense < 0.6) continue;
    if (score < MIN_SCORE) continue;
    const tags: string[] = [];
    if (st.losses === 0) tags.push('Invicto no UFC');
    if (st.koW >= 1 && st.subW >= 1) tags.push('Versátil: nocaute e finalização');
    else if (st.koW > st.subW) tags.push('Nocauteador');
    else if (st.subW > st.koW) tags.push('Finalizador');
    if (fin === st.wins && st.wins >= 2) tags.push('Todas as vitórias antes da decisão');
    if (speed >= 0.65) tags.push('Termina rápido');
    if (pct(d.women, 'kd', r.kd) >= 0.85) tags.push('Knockdowns acima da média');
    if (pct(d.women, 'sub', r.sub) >= 0.85) tags.push('Ameaça no jiu-jitsu');
    const why: string[] = [];
    why.push(`${st.wins}V-${st.losses}D no UFC, ${fin} de ${st.wins} vitórias antes da decisão (${st.koW} nocaute${st.koW === 1 ? '' : 's'}, ${st.subW} finalizaç${st.subW === 1 ? 'ão' : 'ões'}).`);
    const mm = `${Math.floor(st.time / 60)}:${String(Math.round(st.time % 60)).padStart(2, '0')}`;
    const bits: string[] = [];
    if (st.kd > 0) bits.push(`${st.kd} knockdown${st.kd > 1 ? 's' : ''}`);
    if (st.sub > 0) bits.push(`${st.sub} tentativa${st.sub > 1 ? 's' : ''} de finalização`);
    if (st.tdL > 0) bits.push(`${st.tdL} queda${st.tdL > 1 ? 's' : ''}`);
    if (st.sigL > 0) bits.push(`${st.sigL} golpes significativos`);
    if (bits.length) why.push(`Em ${mm} de luta no UFC: ${bits.join(', ')}.`);
    const hi = ([['volume de golpes', pct(d.women, 'slpm', r.slpm)], ['knockdowns', pct(d.women, 'kd', r.kd)], ['finalizações', pct(d.women, 'sub', r.sub)], ['quedas', pct(d.women, 'td', r.td)]] as [string, number][]).sort((x, y) => y[1] - x[1]).filter((x) => x[1] >= 0.75).slice(0, 2);
    if (hi.length) why.push(`Acima da média do UFC em ${hi.map((x) => `${x[0]} (melhor que ${Math.min(99, Math.round(x[1] * 100))}%)`).join(' e ')}, já descontando a amostra pequena.`);
    if (speed >= 0.5) why.push(`Vitórias terminadas rápido (${wins.filter((e) => e.method === 'KO' || e.method === 'SUB').map((e) => `${Math.floor(e.durationSec / 60)}:${String(e.durationSec % 60).padStart(2, '0')}`).join(', ')}).`);
    rows.push({ d, p: { score: Math.round(score), rank: 0, tags: tags.slice(0, 4), why, fights: d.fights.length } });
  }
  rows.sort((a, b) => b.p.score - a.p.score);
  const out = new Map<string, Prospect>();
  rows.forEach((x, i) => { x.p.rank = i + 1; out.set(x.d.id, x.p); });
  return out;
}
