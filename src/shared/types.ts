import type { DivisionKey } from './divisions';
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

export interface ModelParams {
  version: number;
  features: string[];
  mean: number[];
  std: number[];
  coef: number[];
  priors: Record<string, Priors>; // por divisão + 'ALL'
  fiveRoundDecFactor: number;
  metrics: {
    trainN: number; testN: number; testFrom: string;
    accuracy: number; logLoss: number;
    eloOnlyAccuracy: number; baselineFavAccuracy: number;
    methodAccuracy: number; exactAccuracy: number;
  };
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
  /** foto (Wikimedia Commons) e página do arquivo, para crédito/licença */
  photo: string | null;
  photoPage: string | null;
  /** país (pt-BR) e bandeira, via ESPN */
  country: string;
  flag: string;
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
  rates: Rates;
  percentiles: Partial<Record<keyof Rates, number>>;
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
  fightCount: number;
  model: ModelParams['metrics'];
  upcomingSource: string;
}
