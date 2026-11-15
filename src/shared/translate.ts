// Tradução para pt-BR dos termos do UFCStats.

export type MethodKey = 'KO' | 'SUB' | 'DEC' | 'DQ' | 'NC' | 'OTHER';
export type DecisionKind = 'U' | 'S' | 'M' | null;

export const METHOD_LABEL: Record<MethodKey, string> = {
  KO: 'KO/TKO',
  SUB: 'Finalização',
  DEC: 'Decisão',
  DQ: 'Desclassificação',
  NC: 'Sem resultado',
  OTHER: 'Outro',
};

export const DECISION_LABEL: Record<'U' | 'S' | 'M', string> = {
  U: 'unânime',
  S: 'dividida',
  M: 'majoritária',
};

export function parseMethod(raw: string): { method: MethodKey; decision: DecisionKind; doctor: boolean } {
  const m = raw.trim().toLowerCase();
  if (m.startsWith('decision')) {
    const decision: DecisionKind = m.includes('split') ? 'S' : m.includes('majority') ? 'M' : 'U';
    return { method: 'DEC', decision, doctor: false };
  }
  if (m.startsWith('ko/tko') || m.startsWith('tko')) return { method: 'KO', decision: null, doctor: m.includes('doctor') };
  if (m.startsWith('submission')) return { method: 'SUB', decision: null, doctor: false };
  if (m === 'dq') return { method: 'DQ', decision: null, doctor: false };
  if (m.startsWith('overturned') || m.startsWith('could not continue')) return { method: 'NC', decision: null, doctor: false };
  return { method: 'OTHER', decision: null, doctor: false };
}

// --- Detalhes de finalização / nocaute --------------------------------------

const SUBMISSIONS: [RegExp, string][] = [
  [/rear naked choke/i, 'mata-leão'],
  [/guillotine/i, 'guilhotina'],
  [/triangle armbar/i, 'triângulo com chave de braço'],
  [/arm triangle/i, 'triângulo de braço'],
  [/triangle/i, 'triângulo'],
  [/armbar/i, 'chave de braço'],
  [/d'arce|darce/i, "D'Arce"],
  [/anaconda/i, 'anaconda'],
  [/kimura/i, 'kimura'],
  [/americana/i, 'americana'],
  [/omoplata/i, 'omoplata'],
  [/heel hook/i, 'chave de calcanhar'],
  [/kneebar/i, 'chave de joelho'],
  [/ankle lock/i, 'chave de tornozelo'],
  [/toe hold/i, 'chave de dedão'],
  [/calf slicer/i, 'calf slicer'],
  [/neck crank/i, 'neck crank'],
  [/twister/i, 'twister'],
  [/von flue/i, 'von flue'],
  [/peruvian necktie/i, 'gravata peruana'],
  [/north-south choke|north south choke/i, 'estrangulamento norte-sul'],
  [/ezekiel/i, 'ezequiel'],
  [/scarf hold/i, 'estrangulamento no katagatame'],
  [/bulldog/i, 'bulldog choke'],
  [/face crank/i, 'face crank'],
  [/forearm choke/i, 'estrangulamento com antebraço'],
  [/keylock/i, 'keylock'],
  [/wristlock/i, 'chave de punho'],
  [/achilles/i, 'chave de Aquiles'],
  [/suloev/i, 'suloev stretch'],
  [/strikes/i, 'desistência por golpes'],
  [/choke/i, 'estrangulamento'],
  [/verbal/i, 'desistência verbal'],
];

const STRIKES: [RegExp, string][] = [
  [/spinning back fist/i, 'backfist rodado'],
  [/spinning back elbow/i, 'cotovelada rodada'],
  [/spinning back kick/i, 'chute rodado'],
  [/spinning wheel kick|wheel kick/i, 'chute giratório'],
  [/flying knee/i, 'joelhada voadora'],
  [/superman punch/i, 'superman punch'],
  [/punches/i, 'socos'],
  [/punch/i, 'soco'],
  [/elbows/i, 'cotoveladas'],
  [/elbow/i, 'cotovelada'],
  [/knees/i, 'joelhadas'],
  [/knee/i, 'joelhada'],
  [/kicks/i, 'chutes'],
  [/kick/i, 'chute'],
  [/slam/i, 'slam'],
  [/stomp/i, 'pisão'],
];

const TARGETS: [RegExp, string][] = [
  [/to head|\bhead\b/i, 'na cabeça'],
  [/to body|\bbody\b/i, 'no corpo'],
  [/to leg|\bleg\b/i, 'na perna'],
];

const POSITIONS: [RegExp, string][] = [
  [/at distance/i, 'à distância'],
  [/in clinch/i, 'no clinch'],
  [/from mount/i, 'da montada'],
  [/from back control/i, 'das costas'],
  [/from bottom half guard/i, 'por baixo, da meia-guarda'],
  [/from half guard/i, 'da meia-guarda'],
  [/from bottom guard/i, 'por baixo, da guarda'],
  [/from guard/i, 'da guarda'],
  [/from side control/i, 'do cem-quilos'],
  [/from crucifix/i, 'do crucifixo'],
  [/from north-south/i, 'do norte-sul'],
  [/from front headlock/i, 'da gravata frontal'],
  [/after drop to (ground|guard|half guard)/i, 'puxando para o chão'],
  [/standing/i, 'em pé'],
  [/on ground/i, 'no solo'],
];

const OTHER_DETAILS: [RegExp, string][] = [
  [/facial cut|cuts?\b/i, 'corte no rosto'],
  [/eye injury/i, 'lesão no olho'],
  [/knee injury/i, 'lesão no joelho'],
  [/leg injury/i, 'lesão na perna'],
  [/arm injury/i, 'lesão no braço'],
  [/shoulder injury/i, 'lesão no ombro'],
  [/ankle injury/i, 'lesão no tornozelo'],
  [/hand injury/i, 'lesão na mão'],
  [/injury/i, 'lesão'],
  [/corner stoppage/i, 'interrupção pelo córner'],
  [/eye poke/i, 'dedo no olho acidental'],
  [/illegal knee/i, 'joelhada ilegal'],
  [/illegal (up-?kick|kick)/i, 'chute ilegal'],
  [/headbutt/i, 'cabeçada'],
  [/groin/i, 'golpe baixo'],
  [/doctor/i, 'interrupção médica'],
  [/retirement|retired/i, 'desistência entre rounds'],
  [/exhaustion/i, 'exaustão'],
];

function first(list: [RegExp, string][], s: string): string | null {
  for (const [re, pt] of list) if (re.test(s)) return pt;
  return null;
}

/** Traduz o campo DETAILS para um texto curto em português. */
export function translateDetail(method: MethodKey, raw: string): string {
  const s = (raw || '').trim();
  if (!s || method === 'DEC') return '';
  const technical = /technical submission/i.test(s) ? ' (técnica)' : '';
  const subStrikes = /submission to strikes/i.test(s) ? ' (desistência)' : '';
  if (method === 'SUB') {
    const name = first(SUBMISSIONS, s) ?? s.toLowerCase();
    const pos = first(POSITIONS, s);
    return `${name}${pos ? ' ' + pos : ''}${technical}`;
  }
  if (method === 'KO') {
    const strike = first(STRIKES, s);
    if (strike) {
      const target = first(TARGETS, s);
      const pos = first(POSITIONS, s);
      return [strike, target, pos].filter(Boolean).join(' ') + subStrikes;
    }
    return first(OTHER_DETAILS, s) ?? s.replace(/^to/, '').toLowerCase();
  }
  return first(OTHER_DETAILS, s) ?? s.toLowerCase();
}

export function translateStance(raw: string | null | undefined): string {
  switch ((raw || '').trim().toLowerCase()) {
    case 'orthodox': return 'Destro';
    case 'southpaw': return 'Canhoto';
    case 'switch': return 'Troca base';
    case 'open stance': return 'Base aberta';
    case 'sideways': return 'Lateral';
    default: return '';
  }
}

export const RESULT_LABEL = { W: 'Vitória', L: 'Derrota', D: 'Empate', NC: 'Sem resultado' } as const;
