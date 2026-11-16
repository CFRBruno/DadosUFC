import type { DivisionKey } from './divisions';
import type { FeatureVec, Model2 } from './model2';
import type { DecisionKind, MethodKey } from './translate';

/**
 * Ordem das estatísticas por round/luta (arrays compactos no JSON).
 * L = conectados, A = tentados.
 */
export const STAT_KEYS = [
  'kd', 'sigL', 'sigA', 'totL', 'totA', 'tdL', 'tdA', 'sub', 'rev', 'ctrl',
  'headL', 'headA', 'bodyL', 'bodyA', 'legL', 'legA',
  'distL', 'distA', 'clinchL', 'clinchA', 'groundL', 'groundA',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const S: Record<StatKey, number> = Object.fromEntries(STAT_KEYS.map((k, i) => [k, i])) as Record<StatKey, number>;
export type StatLine = number[];

export type Result = 'W' | 'L' | 'D' | 'NC';

/** Estado acumulado de carreira (somente UFC) usado pelo modelo. */
export interface ModelState {
  time: number;      // segundos lutados
  fights: number;
  wins: number;
  losses: number;
  draws: number;
  sigL: number; sigA: number;
  sigAbs: number; sigOppA: number;
  tdL: number; tdA: number;
  tdAbs: number; tdOppA: number;
  sub: number; kd: number; kdAbs: number;
  ctrl: number; ctrlAbs: number;
  koW: number; subW: number; decW: number;
  koL: number; subL: number; decL: number;
  recent: Result[];          // últimos resultados, mais recente por último
  lastDate: string | null;   // ISO
  dob: string | null;        // ISO
  reach: number | null;      // polegadas
  height: number | null;     // polegadas
  elo: number;
}

export interface Priors {
  slpm: number; sapm: number; acc: number; def: number;
  td: number; tdAcc: number; tdDef: number; sub: number;
  kd: number; ctrl: number; koLoss: number;
  /** Proporção de vitórias por método (lutas de 3 rounds). */
  method: { KO: number; SUB: number; DEC: number };
}

export interface ModelMetrics {
  /** lutas usadas no treino final */
  trainN: number;
  /** avaliação principal (ano a ano, sempre em lutas que o modelo ainda não tinha visto) */
  testN: number; testFrom: string;
  accuracy: number; logLoss: number;
  /** a avaliação principal inclui o sinal de mercado? */
  usesMarket: boolean;
  eloOnlyAccuracy: number;
  methodAccuracy: number; exactAccuracy: number;
  /** o mercado sozinho, nas mesmas lutas */
  marketOnly: { n: number; accuracy: number; logLoss: number } | null;
  /** só estatísticas, nas mesmas lutas da avaliação principal */
  statsSame: { n: number; accuracy: number; logLoss: number };
  /** só estatísticas, no período longo */
  stats: { from: string; n: number; accuracy: number; logLoss: number };
  /** período recente (modelo completo e só estatísticas) */
  recent: { from: string; n: number; accuracy: number; logLoss: number; statsAccuracy: number };
  /** lutas com linha de mercado no histórico */
  marketFights: number;
}

export interface ModelParams {
  version: number;
  v2: Model2;
  priors: Record<string, Priors>; // por divisão + 'ALL'
  fiveRoundDecFactor: number;
  metrics: ModelMetrics;
}

export interface FightSide {
  /** Estatísticas totais da luta [STAT_KEYS] */
  me: StatLine;
  opp: StatLine;
  /** Por round: [me, opp] */
  rounds: [StatLine, StatLine][];
}

export interface FightEntry {
  id: string;
  date: string;
  event: string;
  eventId: string;
  location: string;
  division: DivisionKey;
  title: boolean;
  interim: boolean;
  scheduledRounds: number;
  opponent: { id: string; name: string; slug: string | null };
  result: Result;
  method: MethodKey;
  decision: DecisionKind;
  detail: string;
  endRound: number;
  endTime: string;
  durationSec: number;
  referee: string;
  recordBefore: string;
  oppRecordBefore: string;
  eloBefore: number;
  eloAfter: number;
  oppEloBefore: number;
  stats: FightSide | null;
  /** previsão feita ANTES da luta (modelo treinado só com lutas anteriores), do ponto de vista do lutador da página */
  pred?: FightPred;
  /** pontuação de cada jurado (total da luta) nas decisões, quando disponível */
  judges?: { name: string; me: number; opp: number }[];
}

export interface FightPred {
  /** chance de o lutador da página vencer */
  p: number;
  /** a previsão usou o sinal de mercado (só inclusa, nunca exibida) */
  mk: boolean;
  /** como cada um venceria: distribuição do método se o lutador vencer / se o adversário vencer */
  mine: { KO: number; SUB: number; DEC: number };
  opp: { KO: number; SUB: number; DEC: number };
}

export interface MethodCount { n: number; byRound: number[] }
export interface MethodBreakdown { KO: MethodCount; SUB: MethodCount; DEC: MethodCount; OTHER: MethodCount }

export interface Rates {
  slpm: number; sapm: number; acc: number; def: number;
  td: number; tdAcc: number; tdDef: number; sub: number;
  kd: number; kdAbs: number; ctrl: number; avgFightMin: number;
  finishRate: number; koLossRate: number; subLossRate: number;
  paceRatio: number | null;
}

export interface Insight {
  key: string;
  title: string;
  text: string;
  score: number; // força do sinal 0..1
}

/** Forma recente: nota 0–100 (alto = boa fase) com base nas últimas 5 lutas. */
export interface FormInfo {
  score: number;
  label: string;
  /** da mais recente para a mais antiga */
  last5: { r: 'W' | 'L' | 'D'; opp: string; method: string; date: string; delta: number }[];
}

/** Posição no ranking oficial do UFC (Meta UFC Rankings). `pos` 0 = campeão. */
export interface OfficialRank { division: DivisionKey; pos: number; interim: boolean }

/** Posição numa estatística dentro da categoria (ou entre todos do mesmo gênero quando a categoria é pequena). */
export interface StatRank { pos: number; of: number; scope: 'cat' | 'gen' }

/** Passagem por um cinturão do UFC. */
export interface TitleReign {
  division: string;       // DivisionKey ou 'BMF'
  divisionName: string;
  kind: 'champion' | 'interim';
  start: string;
  end: string | null;     // null = atual
  def: number;
  endKind: 'lost' | 'vacated' | 'ongoing' | 'interim';
}

export interface FighterSummary {
  id: string;
  slug: string;
  name: string;
  nickname: string;
  division: DivisionKey;
  women: boolean;
  record: { w: number; l: number; d: number; nc: number };
  elo: number;
  lastFight: string | null;
  age: number | null;
  style: string;
  streak: string;
  upcoming: boolean;
  /** lutou em 2026 ou tem luta marcada */
  active: boolean;
  /** foto (Wikimedia Commons) e página do arquivo, para crédito/licença */
  photo: string | null;
  photoPage: string | null;
  /** país (pt-BR) e bandeira, via ESPN */
  country: string;
  flag: string;
  /** foto hospedada no próprio site (usada ao gerar a imagem de compartilhamento, que não pode ler fotos de outros domínios) */
  photoLocal?: string;
  official: OfficialRank | null;
  /** campeão atual / ex-campeão do UFC (cinturão linear; o BMF não conta) */
  champ: 'atual' | 'ex' | null;
}

export interface FighterDetail extends FighterSummary {
  divisions: DivisionKey[];
  heightCm: number | null;
  reachCm: number | null;
  stance: string;
  dob: string | null;
  firstFight: string | null;
  eloPeak: number;
  eloHistory: [string, number][];
  eloRank: { division: number; of: number } | null;
  form: FormInfo | null;
  rates: Rates;
  percentiles: Partial<Record<keyof Rates, number>>;
  statRanks: Partial<Record<keyof Rates, StatRank>>;
  titleReigns: TitleReign[];
  totals: ModelState;
  wins: MethodBreakdown;
  losses: MethodBreakdown;
  target: { head: number; body: number; leg: number };
  targetAbs: { head: number; body: number; leg: number };
  position: { dist: number; clinch: number; ground: number };
  styleTags: string[];
  styleText: string;
  strengths: Insight[];
  weaknesses: Insight[];
  fiveRoundFights: number;
  titleFights: number;
  fights: FightEntry[];
  next: UpcomingBout | null;
  /** retrato estatístico atual usado pelo modelo de previsão */
  fv: FeatureVec;
}

export interface UpcomingBout {
  eventId: string;
  event: string;
  date: string | null;
  division: DivisionKey;
  title: boolean;
  /** rounds previstos: luta principal e disputas de cinturão = 5 */
  rounds: number;
  /** ordem no card (0 = luta principal) */
  order: number;
  a: { id: string | null; name: string; slug: string | null };
  b: { id: string | null; name: string; slug: string | null };
  /** sinal de mercado para o lutador `a` (insumo interno do modelo; não é exibido) */
  mk?: number;
}

export interface EventFight {
  id: string;
  a: { id: string; name: string; slug: string | null };
  b: { id: string; name: string; slug: string | null };
  winner: 0 | 1 | null;
  result: 'W' | 'D' | 'NC';
  method: MethodKey;
  decision: DecisionKind;
  detail: string;
  endRound: number;
  endTime: string;
  division: DivisionKey;
  title: boolean;
  scheduledRounds: number;
  /** previsão feita antes da luta (treinada só com lutas anteriores), do ponto de vista do lutador `a` */
  pred?: { pA: number; mk: boolean; shA: { KO: number; SUB: number; DEC: number }; shB: { KO: number; SUB: number; DEC: number } };
}

export interface EventInfo {
  id: string;
  name: string;
  date: string | null;
  location: string;
  upcoming: boolean;
  fights: EventFight[];
  bouts: UpcomingBout[];
  source?: string;
}

export interface Meta {
  generatedAt: string;
  latestEvent: { name: string; date: string } | null;
  scopeFrom: string;
  fighterCount: number;
  /** lutadores que lutaram em 2026 ou têm luta marcada */
  activeCount: number;
  fightCount: number;
  model: ModelMetrics;
  upcomingSource: string;
  /** data de divulgação do ranking oficial exibido */
  rankingsDate: string | null;
}

/** Disputa de cinturão (ou final de torneio) do histórico completo do UFC. */
export interface TitleFight {
  id: string;
  date: string;
  event: string;
  eventId: string;
  division: DivisionKey;
  interim: boolean;
  tournament: boolean;
  /** rótulo do torneio (ex.: "TUF 33"), vazio para disputas de cinturão */
  label: string;
  a: { id: string; name: string; slug: string | null };
  b: { id: string; name: string; slug: string | null };
  winner: 0 | 1 | null;
  result: 'W' | 'D' | 'NC';
  method: MethodKey;
  decision: DecisionKind;
  detail: string;
  endRound: number;
  endTime: string;
  scheduledRounds: number;
  /** slug de um lutador do site que lutou essa luta (para abrir as estatísticas) */
  statsSlug: string | null;
}

/** Linha do ranking: valores brutos por chave de estatística. */
export interface RankingRow {
  id: string;
  s: Record<string, number | null>;
}

/** Ranking oficial do UFC por categoria (campeão = pos 0), para a tela inicial. */
export interface OfficialBoard {
  released: string | null;
  divisions: { key: DivisionKey; name: string; women: boolean; entries: { pos: number; name: string; id: string | null; slug: string | null }[] }[];
}

/** Luta com a previsão feita antes dela (modelo treinado só com lutas anteriores), para o ranking de zebras e favoritos. */
export interface UpsetFight {
  i: string;                 // id da luta
  d: string;                 // data
  e: string;                 // evento
  v: DivisionKey;
  t: boolean;                // disputa de cinturão
  a: [name: string, slug: string | null];
  b: [name: string, slug: string | null];
  w: 0 | 1;                  // quem venceu
  p: number;                 // chance pré-luta de `a`
  m: string;                 // método (KO, SUB, DEC…)
  mk: boolean;               // a previsão incluiu o sinal de mercado
}

/** Pico de Elo de um lutador (todos os que já lutaram no UFC). */
export interface EloPeakRow {
  n: string;                  // nome
  s: string | null;           // slug (só quem tem página)
  p: number;                  // pico
  pd: string;                 // data do pico (após a luta)
  c: number;                  // Elo atual (após a última luta)
  f: number;                  // lutas no UFC
  v: DivisionKey;             // última categoria
  y0: number;                 // ano da estreia
  y1: number;                 // ano da última luta
  a: boolean;                 // ativo em 2026
}

/** Previsão para as lutas dos próximos eventos (modelo final aplicado ao retrato atual de cada lutador). */
export interface UpcomingForecast {
  event: { id: string; name: string; date: string | null };
  v: DivisionKey;
  t: boolean;
  rounds: number;
  a: [name: string, slug: string | null];
  b: [name: string, slug: string | null];
  /** chance de `a` — combinada, só estatísticas e mercado (null se não há linha) */
  p: number;
  ps: number;
  pm: number | null;
}
