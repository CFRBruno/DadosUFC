import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIVISION_BY_KEY } from '../shared/divisions';
import type { FightEntry, FighterSummary } from '../shared/types';
import { S } from '../shared/types';
import { divisionName, fmtDate, fmtPct, fmtTime, methodText, recordStr } from '../lib/format';
import { Avatar, Flag, Icon, ResultBadge } from './ui';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchFighters(list: FighterSummary[], q: string): FighterSummary[] {
  const n = norm(q.trim());
  if (!n) return list;
  return list
    .map((f) => {
      const name = norm(f.name);
      const nick = norm(f.nickname);
      let score = -1;
      if (name.startsWith(n)) score = 3;
      else if (name.split(' ').some((p) => p.startsWith(n))) score = 2;
      else if (name.includes(n)) score = 1;
      else if (nick.includes(n)) score = 0.5;
      return { f, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || b.f.elo - a.f.elo)
    .map((x) => x.f);
}

export function FighterCard({ f }: { f: FighterSummary }) {
  return (
    <Link to={`/lutador/${f.slug}`} className="fighter-card">
      <Avatar name={f.name} id={f.id} />
      <div className="info">
        {f.nickname && <div className="nick">"{f.nickname}"</div>}
        <div className="name"><Flag src={f.flag} country={f.country} /> {f.name}</div>
        <div className="meta">
          <span className="chip chip-record">{recordStr(f.record)}</span>
          <span className="chip">{DIVISION_BY_KEY[f.division]?.short ?? f.division}</span>
          {f.style && f.style !== 'Estreante' && <span className="chip chip-style">{f.style}</span>}
          {f.style === 'Estreante' && <span className="chip chip-red">Estreante</span>}
          {f.upcoming && <span className="chip chip-up">Próxima luta</span>}
        </div>
      </div>
      <div className="elo">
        <b>{f.elo}</b>
        <span>Elo</span>
      </div>
    </Link>
  );
}

/** Campo de busca com lista (combobox acessível). */
export function FighterPicker({
  list, onPick, placeholder = 'Buscar lutador…', exclude,
}: { list: FighterSummary[]; onPick: (f: FighterSummary) => void; placeholder?: string; exclude?: string | null }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const listId = useRef(`cb-${Math.random().toString(36).slice(2)}`).current;
  const results = useMemo(() => searchFighters(list, q).filter((f) => f.slug !== exclude).slice(0, 30), [list, q, exclude]);
  const pick = (f: FighterSummary) => {
    onPick(f);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="combo">
      <input
        className="input search"
        style={{ width: '100%' }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); pick(results[idx]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <div className="combo-list" role="listbox" id={listId}>
          {results.map((f, i) => (
            <div
              key={f.id}
              role="option"
              aria-selected={i === idx}
              className="combo-item"
              onMouseDown={(e) => { e.preventDefault(); pick(f); }}
              onMouseEnter={() => setIdx(i)}
            >
              <Avatar name={f.name} id={f.id} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div className="n">{f.name}</div>
                <div className="s">{recordStr(f.record)} · {DIVISION_BY_KEY[f.division]?.short} · Elo {f.elo}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Linha de luta no histórico, com estatísticas ao expandir. */
export function FightRow({ f, fighterSlug, fighterName }: { f: FightEntry; fighterSlug: string; fighterName: string }) {
  const [open, setOpen] = useState(false);
  const s = f.stats;
  const howShort = f.method === 'DEC' ? 'Decisão' : f.method === 'KO' ? 'KO/TKO' : f.method === 'SUB' ? 'Finalização' : f.method === 'NC' ? 'NC' : f.method;
  return (
    <div className="fight-row">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ResultBadge r={f.result} />
        <div style={{ minWidth: 0 }}>
          <div className="opp">
            {f.opponent.name}{' '}
            {f.title && <span className="chip chip-rank" style={{ marginLeft: 4 }}>{f.interim ? 'Cinturão interino' : 'Cinturão'}</span>}
          </div>
          <div className="ev">{f.event} · {fmtDate(f.date)}</div>
        </div>
        <div className="how">
          {howShort}
          <small>R{f.endRound} · {f.endTime}</small>
        </div>
      </button>
      {open && (
        <div className="details">
          <div className="text-2" style={{ fontSize: 13.5 }}>
            <b style={{ color: 'var(--text)' }}>{methodText(f.method, f.decision, f.detail)}</b> · {divisionName(f.division)} · {f.scheduledRounds} rounds · duração {fmtTime(f.durationSec)}
            {f.referee && <> · árbitro {f.referee}</>}
            <br />
            Cartel antes: {f.recordBefore} (adversário {f.oppRecordBefore}) · Elo {f.eloBefore} → {f.eloAfter} <span className="muted">(adversário {f.oppEloBefore})</span>
          </div>
          {s ? (
            <div className="table-scroll">
              <table className="mini-table">
                <thead>
                  <tr><th></th><th>Golpes sig.</th><th>Precisão</th><th>Golpes totais</th><th>Quedas</th><th>KD</th><th>Fin.</th><th>Controle</th></tr>
                </thead>
                <tbody>
                  {([[fighterName, s.me], [f.opponent.name, s.opp]] as [string, number[]][]).map(([label, line], i) => {
                    return (
                      <tr key={i}>
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</td>
                        <td>{line[S.sigL]}/{line[S.sigA]}</td>
                        <td>{line[S.sigA] ? fmtPct(line[S.sigL] / line[S.sigA]) : '—'}</td>
                        <td>{line[S.totL]}/{line[S.totA]}</td>
                        <td>{line[S.tdL]}/{line[S.tdA]}</td>
                        <td>{line[S.kd]}</td>
                        <td>{line[S.sub]}</td>
                        <td>{fmtTime(line[S.ctrl])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="note">Sem estatísticas detalhadas para esta luta.</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {s && <Link className="btn btn-ghost" to={`/lutador/${fighterSlug}/luta/${f.id}`}>Round a round</Link>}
            {f.opponent.slug && <Link className="btn btn-ghost" to={`/lutador/${f.opponent.slug}`}>Perfil de {f.opponent.name.split(' ')[0]}</Link>}
            {f.opponent.slug && <Link className="btn btn-ghost" to={`/comparar?a=${fighterSlug}&b=${f.opponent.slug}`}><Icon name="swords" className="arrow" /> Comparar</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
