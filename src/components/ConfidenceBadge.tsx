import type { Confidence } from '../shared/model2';

const LABEL = { alta: 'Alta', neutra: 'Neutra', baixa: 'Baixa' } as const;

/** Selo de confiança da previsão: medidor de 3 níveis; `detail` lista o que pesou. */
export default function ConfidenceBadge({ c, detail = false }: { c: Confidence; detail?: boolean }) {
  const idx = c.level === 'alta' ? 3 : c.level === 'neutra' ? 2 : 1;
  const badge = (
    <span className={`conf conf-${c.level}`} title={`Confiança ${LABEL[c.level].toLowerCase()} na previsão`}>
      <span className="conf-bars" aria-hidden="true"><i className={idx >= 1 ? 'on' : ''} /><i className={idx >= 2 ? 'on' : ''} /><i className={idx >= 3 ? 'on' : ''} /></span>
      <span className="conf-txt">Confiança <b>{LABEL[c.level]}</b></span>
    </span>
  );
  if (!detail) return badge;
  return (
    <details className="conf-detail">
      <summary>{badge}<span className="conf-more">ver por quê</span></summary>
      <ul>
        {c.reasons.map((r, i) => <li key={i} className={r.good ? 'good' : 'bad'}><span>{r.good ? '+' : '−'}</span>{r.text}</li>)}
      </ul>
    </details>
  );
}
