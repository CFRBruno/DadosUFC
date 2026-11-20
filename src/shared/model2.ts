// Modelo de previsão v2: ~140 diferenças entre os dois lutadores (ratings, estatísticas
// recentes e ajustadas pelo adversário, físico, momento) numa regressão logística
// regularizada. Quando a luta está marcada e há linha de mercado, ela entra como
// mais um sinal; o comparador mostra a probabilidade de mercado (nunca as cotações).
// Usado pelo pipeline (treino/avaliação) e pelo site (comparador).

export type FeatureVec = Record<string, number | null>;

const DAY = 864e5;

/** Campos tratados à parte (não entram como simples diferença A − B). */
const SPECIAL = new Set(['age', 'layoff', 'ko_recency', 'reach', 'height', 'ape', 'stance', 'debut', 'tenure', 'n']);

/** Variáveis-base de um retrato: tudo o que vira diferença A − B. */
export const baseKeys = (f: FeatureVec): string[] => Object.keys(f).filter((k) => !SPECIAL.has(k) && k[0] !== '_');

export const EXTRA = [
  'd_age', 'd_age_over', 'd_age_under', 'd_layoff', 'd_layoff_long', 'd_ko_recent', 'd_reach', 'd_height', 'd_ape',
  'd_stance_south', 'd_stance_switch', 'd_debut', 'd_tenure', 'd_n',
  'm_td', 'm_str', 'm_sub', 'm_ko', 'm_ctrl', 'm_tdj', 'm_strj', 'x_age_elo',
] as const;

/**
 * Completa o retrato "estático" de um lutador com o que depende da data da luta
 * (idade, tempo parado, incerteza do rating…) e da categoria em que ela acontece.
 */
export function atDate(s: FeatureVec, date: number, lbs: number | null): FeatureVec {
  const f: FeatureVec = { ...s };
  const rd = (rd0: number | null, last: number | null, cc: number) =>
    last == null || rd0 == null ? 350 : Math.min(350, Math.sqrt(rd0 * rd0 + cc * cc * (Math.max(0, date - last) / DAY / 30)));
  f.gl_rd = rd(s._gl_rd, s._gl_last, 12);
  f.gl2_rd = rd(s._gl2_rd, s._gl2_last, 20);
  f.gl_lo = (s.gl_r as number) - (f.gl_rd as number); // estimativa conservadora do rating
  f.age = s._dob != null ? (date - s._dob) / (365.25 * DAY) : null;
  f.layoff = s._last != null ? Math.max(0, date - s._last) / DAY : null;
  f.tenure = s._first != null ? Math.max(0, date - s._first) / (365.25 * DAY) : 0;
  f.ko_recency = s._lastKo != null ? Math.max(0, date - s._lastKo) / DAY : null;
  f.div_move = s._lastLbs != null && lbs != null ? Math.sign(lbs - s._lastLbs) * Math.min(2, Math.abs(lbs - s._lastLbs) / 15) : 0;
  return f;
}

/** Vetor do confronto: todas as colunas são antissimétricas (trocar A e B inverte o sinal). */
export function pairVector(keys: string[], a: FeatureVec, b: FeatureVec): number[] {
  const n = (v: number | null | undefined) => v ?? 0;
  const row = keys.map((k) => n(a[k]) - n(b[k]));
  const dd = (k: string, fn: (v: number) => number = (v) => v, def: number | null = null) => {
    let va = a[k], vb = b[k];
    if (va == null || vb == null) {
      if (def == null) return 0;
      va = va ?? def; vb = vb ?? def;
    }
    return fn(va) - fn(vb);
  };
  const A = a as Record<string, number>, B = b as Record<string, number>;
  const ageA = a.age ?? 30, ageB = b.age ?? 30;
  row.push(
    dd('age'),
    dd('age', (v) => Math.max(0, v - 33)),
    dd('age', (v) => Math.max(0, 27 - v)),
    dd('layoff', Math.log1p, 200),
    dd('layoff', (v) => Math.max(0, v - 400) / 365, 200),
    dd('ko_recency', (v) => 1 / (1 + v / 365), 1e9),
    dd('reach'), dd('height'), dd('ape'),
    (a.stance === 1 && b.stance === 0 ? 1 : 0) - (b.stance === 1 && a.stance === 0 ? 1 : 0),
    (a.stance === 2 ? 1 : 0) - (b.stance === 2 ? 1 : 0),
    n(a.debut) - n(b.debut),
    n(a.tenure) - n(b.tenure),
    n(a.n) - n(b.n),
    A.c_td * (1 - B.c_tdDef) - B.c_td * (1 - A.c_tdDef),
    A.c_slpm * (1 - B.c_def) - B.c_slpm * (1 - A.c_def),
    A.c_sub * B.subL - B.c_sub * A.subL,
    A.c_kd * B.c_kdAbs - B.c_kd * A.c_kdAbs,
    A.c_ctrl * (1 - B.c_tdDef) - B.c_ctrl * (1 - A.c_tdDef),
    A.jb_td * (1 - B.jb_tdDef) - B.jb_td * (1 - A.jb_tdDef),
    A.jb_slpm * (1 - B.jb_def) - B.jb_slpm * (1 - A.jb_def),
    ((ageA - ageB) * ((A.elo_k40 + B.elo_k40) / 2 - 1500)) / 100,
  );
  return row;
}

export const pairNames = (keys: string[]): string[] => [...keys.map((k) => 'd_' + k), ...EXTRA];

// --- Fatores (agrupam as variáveis para explicar a previsão) ------------------------

export const FACTOR_LABEL: Record<string, string> = {
  elo: 'Rating e nível dos adversários',
  slpm: 'Volume de golpes',
  sapm: 'Golpes absorvidos',
  acc: 'Precisão de golpes',
  def: 'Defesa de golpes',
  td: 'Quedas',
  tdAcc: 'Precisão de quedas',
  tdDef: 'Defesa de quedas',
  sub: 'Jogo de finalização',
  kd: 'Poder de nocaute',
  kdAbs: 'Knockdowns sofridos',
  ctrl: 'Controle e jogo de chão',
  age: 'Idade',
  reach: 'Envergadura, altura e base',
  exp: 'Experiência no UFC',
  form: 'Fase recente',
  layoff: 'Tempo parado',
  koLoss: 'Queixo (derrotas por nocaute)',
};

/** A que fator pertence cada variável do modelo. */
export function groupOf(name: string): string {
  const k = name.replace(/^d_/, '');
  const stat = /^(?:c|ea|eb|ja|jb|jc)_(.+)$/.exec(k)?.[1];
  if (stat) {
    if (stat === 'win') return 'form';
    if (stat === 'tdAbs') return 'tdDef';
    if (stat === 'subAbs') return 'sub';
    if (stat === 'ctrlAbs') return 'ctrl';
    return stat;
  }
  if (/^(elo_k|elo_dyn|elo_mov|gl_r$|gl2_r$|gl_lo|opp_elo|beat_elo|best_win|winpct|elo_peak_gap|titles)/.test(k)) return 'elo';
  if (/^(age|x_age_elo)/.test(k)) return 'age';
  if (/^(reach|height|ape|stance)/.test(k)) return 'reach';
  if (/^(logn|minutes|n$|tenure|five|debut|gl_rd|gl2_rd)/.test(k)) return 'exp';
  if (/^(form|streak|elo_trend|fin_rate|dec_share|decW)/.test(k)) return 'form';
  if (/^(layoff|div_move)/.test(k)) return 'layoff';
  if (/^(koL|ko_recent)/.test(k)) return 'koLoss';
  if (/^(m_td)/.test(k)) return 'td';
  if (/^(m_str|sig_share|head_share|leg_share)/.test(k)) return 'slpm';
  if (/^(m_sub|subW|subL)/.test(k)) return 'sub';
  if (/^(m_ko|koW)/.test(k)) return 'kd';
  if (/^(m_ctrl|ground_share|clinch_share)/.test(k)) return 'ctrl';
  return 'elo';
}

export interface Model2 {
  /** variáveis-base (entram como diferença A − B) */
  keys: string[];
  sd: number[];
  coef: number[];
  /** logit final = a·logit(mercado) + b·logit(estatísticas); null se ainda não há lutas com mercado */
  market: { a: number; b: number } | null;
  /** peso médio de cada fator nas previsões (para a página "Modelo") */
  groupWeights: { key: string; w: number }[];
}

export const sigmoid2 = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => { const q = Math.min(1 - 1e-4, Math.max(1e-4, p)); return Math.log(q / (1 - q)); };

/** Previsão só com estatísticas: logit, probabilidade e contribuição de cada fator. */
export function predictStats(m: Model2, a: FeatureVec, b: FeatureVec): { z: number; p: number; groups: Record<string, number> } {
  const x = pairVector(m.keys, a, b);
  const names = pairNames(m.keys);
  const groups: Record<string, number> = {};
  let z = 0;
  for (let j = 0; j < x.length; j++) {
    const c = (m.coef[j] * x[j]) / m.sd[j];
    z += c;
    const g = groupOf(names[j]);
    groups[g] = (groups[g] ?? 0) + c;
  }
  return { z, p: sigmoid2(z), groups };
}

/** Combina o logit das estatísticas com a probabilidade de mercado (sem margem) do lutador A. */
export function withMarket(m: Model2, z: number, marketP: number | null | undefined): number {
  if (marketP == null || !m.market) return sigmoid2(z);
  return sigmoid2(m.market.a * logit(marketP) + m.market.b * z);
}

// --- Confiança da previsão ------------------------------------------------------------

export type ConfLevel = 'alta' | 'neutra' | 'baixa';
export interface Confidence {
  /** 0–1 */
  score: number;
  level: ConfLevel;
  /** o que pesou, do mais importante ao menos; `good` = aumenta a confiança */
  reasons: { good: boolean; text: string }[];
}

/** Limites calibrados com as lutas de 2015 em diante (ver `npm run data`: acerto por nível de confiança). */
export const CONF_HIGH = 0.72;
export const CONF_LOW = 0.42;

/**
 * Quão confiável é a previsão desta luta, a partir do que o modelo sabe sobre cada lutador:
 * número de lutas no UFC (e estreia), incerteza do rating (Glicko), tempo parado, dados cadastrais
 * faltando e, quando há linha de mercado, se ela concorda com as estatísticas.
 * Não mede a chance de vitória (uma luta 50–50 pode ter confiança alta); mede o quanto dá para confiar nos números.
 */
export function confidence(
  a: FeatureVec, b: FeatureVec,
  o: { nameA?: string; nameB?: string; market?: number | null; pStats?: number; p?: number } = {},
): Confidence {
  const nA = o.nameA ?? 'O lutador A', nB = o.nameB ?? 'O lutador B';
  const reasons: Confidence['reasons'] = [];
  const num = (v: number | null | undefined, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const fa = num(a.n), fb = num(b.n);
  const exp = (n: number) => 1 - Math.exp(-n / 4); // 0 lutas → 0 · 3 → 0,53 · 8 → 0,86
  const lo = Math.min(fa, fb), hi = Math.max(fa, fb);
  const expScore = 0.65 * exp(lo) + 0.35 * exp(hi);

  const rdA = num(a.gl_rd, 350), rdB = num(b.gl_rd, 350);
  const rdScore = 1 - Math.min(1, Math.max(0, ((rdA + rdB) / 2 - 60) / 290));

  const lay = (f: FeatureVec) => (f.layoff == null ? 0 : Math.min(1, Math.max(0, (num(f.layoff) - 450) / 700)));
  const rust = Math.max(lay(a), lay(b));
  const info = (f: FeatureVec) => (f.age == null ? 0.4 : 0) + (f.reach == null ? 0.2 : 0);
  const miss = Math.max(info(a), info(b));

  const has = o.market != null;
  let disagree = false;
  if (has && o.pStats != null) disagree = (o.market! >= 0.5) !== (o.pStats >= 0.5) && Math.abs(o.market! - o.pStats) > 0.08;
  // Testado nas lutas de 2015 em diante: o que de fato separa acertos de erros é (1) o tamanho da vantagem do favorito
  // e (2) estatísticas e mercado concordarem. Experiência, tempo parado e incerteza do rating quase não mudam o acerto
  // (o modelo já os trata), então entram só com peso pequeno e como avisos.
  const margin = Math.min(1, Math.abs((o.p ?? 0.5) - 0.5) / 0.3);
  const agree = has ? (disagree ? 0 : 1) : 0.4;
  const soft = 0.6 * expScore + 0.15 * rdScore + 0.15 * (1 - rust) + 0.1 * (1 - miss);
  let score = 0.55 * margin + 0.3 * agree + 0.15 * soft;
  score = Math.min(1, Math.max(0, score));

  // explicações
  const deb = (f: FeatureVec, n: string) => { if (num(f.n) === 0) reasons.push({ good: false, text: `${n} é estreante: o modelo só conhece a média da categoria, sem nenhum resultado no UFC.` }); };
  deb(a, nA); deb(b, nB);
  const few = (f: FeatureVec, n: string) => { const k = num(f.n); if (k >= 1 && k < 4) reasons.push({ good: false, text: `${n} tem só ${k} luta${k > 1 ? 's' : ''} no UFC: as estatísticas ainda oscilam muito.` }); };
  few(a, nA); few(b, nB);
  if (lo >= 6) reasons.push({ good: true, text: `Os dois têm histórico longo no UFC (${fa} e ${fb} lutas).` });
  else if (lo >= 4 && fa > 0 && fb > 0) reasons.push({ good: true, text: `Os dois têm um histórico razoável no UFC (${fa} e ${fb} lutas).` });
  const lg = (f: FeatureVec, n: string) => { const d = num(f.layoff); if (f.layoff != null && d > 450) reasons.push({ good: false, text: `${n} está há ${Math.round(d / 30)} meses sem lutar (risco de ferrugem).` }); };
  lg(a, nA); lg(b, nB);
  const ri = (f: FeatureVec, n: string, rd: number) => { if (num(f.n) >= 1 && rd > 190) reasons.push({ good: false, text: `O rating de ${n} ainda é incerto (poucos adversários de nível conhecido).` }); };
  ri(a, nA, rdA); ri(b, nB, rdB);
  const mi = (f: FeatureVec, n: string) => { if (f.age == null) reasons.push({ good: false, text: `Falta a data de nascimento de ${n}: a idade não entra no cálculo.` }); else if (f.reach == null) reasons.push({ good: false, text: `Falta a envergadura de ${n}.` }); };
  mi(a, nA); mi(b, nB);
  if (o.p != null) { const mg = Math.abs(o.p - 0.5); if (mg >= 0.2) reasons.push({ good: true, text: `Há uma vantagem clara de um lado (${Math.round(Math.max(o.p, 1 - o.p) * 100)}%).` }); else if (mg < 0.08) reasons.push({ good: false, text: 'Luta muito parelha (perto de 50–50): o resultado é difícil de cravar.' }); }
  if (has && !disagree) reasons.push({ good: true, text: 'Há linha de mercado e ela está de acordo com as estatísticas.' });
  if (has && disagree) reasons.push({ good: false, text: 'Estatísticas e mercado apontam favoritos diferentes.' });
  if (!has) reasons.push({ good: false, text: 'Sem linha de mercado: a previsão usa só as estatísticas.' });

  const level: ConfLevel = score >= CONF_HIGH ? 'alta' : score < CONF_LOW ? 'baixa' : 'neutra';
  return { score, level, reasons: reasons.sort((x, y) => Number(x.good) - Number(y.good)) };
}
