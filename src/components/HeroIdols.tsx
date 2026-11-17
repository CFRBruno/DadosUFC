import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFighters } from '../lib/data';

/** Ídolos brasileiros do UFC: cartões octogonais que giram em profundidade, com rastros de movimento nos cantos. */
const IDOLS = [
  { slug: 'alex-pereira', title: 'Poatan', name: 'Alex Pereira' },
  { slug: 'charles-oliveira', title: 'Charles do Bronx', name: 'Charles Oliveira' },
  { slug: 'anderson-silva', title: 'O Spider', name: 'Anderson Silva' },
  { slug: 'renato-moicano', title: 'Moicano', name: 'Renato Moicano' },
  { slug: 'jose-aldo', title: 'José Aldo', name: 'Rei do Rio' },
] as const;

// maior resolução da mesma foto (o resumo traz a versão pequena)
const big = (u: string) => u.replace('w=240&h=174', 'w=520&h=380');

// linhas de velocidade: nascem perto do centro e correm para fora (cantos incluídos)
const LINES = Array.from({ length: 44 }, (_, i) => {
  const a = (i / 44) * Math.PI * 2 + ((i * 37) % 11) * 0.011;
  const r0 = 130 + ((i * 53) % 90), len = 380 + ((i * 29) % 160);
  return { x1: 500 + r0 * Math.cos(a), y1: 500 + r0 * Math.sin(a), x2: 500 + (r0 + len) * Math.cos(a), y2: 500 + (r0 + len) * Math.sin(a), len, dur: 1.1 + ((i * 17) % 18) / 10, delay: -(((i * 23) % 30) / 10), w: 1.4 + ((i * 7) % 4) * 0.8 };
});

export default function HeroIdols() {
  const fighters = useFighters().data;
  const cards = useMemo(() => {
    if (!fighters) return [];
    return IDOLS.flatMap((i) => { const f = fighters.find((x) => x.slug === i.slug); return f?.photo ? [{ ...i, photo: big(f.photo), country: f.country }] : []; });
  }, [fighters]);
  const [front, setFront] = useState(0);
  const [pulse, setPulse] = useState(0);

  // a cada ~3,4 s o próximo ídolo avança para o centro (pausa com a aba em segundo plano)
  useEffect(() => {
    if (cards.length < 3 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setFront((f) => (f + 1) % cards.length);
      setPulse((p) => p + 1);
    }, 3400);
    return () => clearInterval(t);
  }, [cards.length]);

  if (cards.length < 3) return <div className="hero-visual" aria-hidden="true" />;
  const n = cards.length;
  const lead = cards[front];

  return (
    <div className="hero-idols">
      <div className="idols-glow" aria-hidden="true" />
      <div data-depth="6" className="idols-lines" aria-hidden="true">
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="streakG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ed1c24" stopOpacity="0" />
              <stop offset="1" stopColor="#ff6b70" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {LINES.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#ff4d54" strokeWidth={l.w} strokeLinecap="round"
              strokeDasharray={`${l.len * 0.3} ${l.len}`} style={{ ['--len' as string]: `${-(l.len * 1.22)}`, animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s` }} />
          ))}
        </svg>
      </div>

      <div data-depth="16" className="idols-stage">
        {cards.map((c, i) => {
          const slot = (((i - front) % n) + n) % n; // 0 centro · 1 direita · … · n−1 esquerda
          const cls = n === 5 ? slot : slot === 0 ? 0 : slot === 1 ? 1 : slot === n - 1 ? 4 : 2 + ((slot - 2) % 2);
          return (
            <Link key={c.slug} to={`/lutador/${c.slug}`} className={`idol slot-${cls}`} aria-label={c.name} tabIndex={cls === 0 ? 0 : -1}>
              <span className="idol-ghosts" aria-hidden="true">
                <img src={c.photo} alt="" className="g1" /><img src={c.photo} alt="" className="g2" /><img src={c.photo} alt="" className="g3" /><img src={c.photo} alt="" className="g4" />
              </span>
              <span className="idol-frame">
                <span className="idol-photo"><img src={c.photo} alt="" loading="eager" decoding="async" referrerPolicy="no-referrer" /></span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="idols-flash" key={pulse} aria-hidden="true" />
      <div className="idol-label" key={lead.slug} aria-live="polite">
        <b>{lead.title}</b>
        <span>{lead.name}{lead.country ? ` · ${lead.country}` : ''}</span>
      </div>
      <div className="idol-dots" aria-hidden="true">{cards.map((c, i) => <i key={c.slug} className={i === front ? 'on' : ''} />)}</div>
    </div>
  );
}
