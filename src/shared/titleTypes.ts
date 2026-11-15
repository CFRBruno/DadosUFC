import type { DecisionKind, MethodKey } from './translate';

export interface TitleStatLine { sig: number; sigA: number; td: number; tdA: number; ctrl: number; sub: number; kd: number }
export interface TitleFighterRef { id: string | null; name: string; slug: string | null }

/** Luta valendo cinturão. `a` é o vencedor quando `winnerIsA`. */
export interface TitleChapter {
  kind: 'fight';
  id: string;
  date: string;
  event: string;
  interim: boolean;
  rounds: number;
  result: 'W' | 'D' | 'NC';
  method: MethodKey;
  decision: DecisionKind;
  detail: string;
  round: number;
  time: string;
  sec: number;
  a: TitleFighterRef;
  b: TitleFighterRef;
  winnerIsA: boolean;
  sa: TitleStatLine | null;
  sb: TitleStatLine | null;
  interimReason?: { source: 'wiki' | 'dados'; text: string } | null;
}

/** Vacância, promoção (campeão inaugural sem luta no UFC) ou nota especial. */
export interface TitleNote {
  kind: 'vacancy' | 'promotion' | 'note';
  date: string;
  dateLabel?: string;
  who: string;
  promote?: string;
  interimOnly?: boolean;
  alsoInterim?: boolean;
  title: string;
  reason: string;
}

export interface TitleDivision {
  name: string;
  women: boolean;
  chapters: TitleChapter[];
  notes: TitleNote[];
  upcoming: { event: string; a: string; b: string }[];
}

export interface TitleHistory {
  generatedAt: string;
  divisions: Record<string, TitleDivision>;
  photos: Record<string, string>;
}
