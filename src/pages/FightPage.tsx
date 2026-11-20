import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BodyMap, CmpBar } from '../components/charts';
import { Avatar, CountUp, FighterFlag, ErrorBox, Loading, ResultBadge } from '../components/ui';
import { useFighter } from '../lib/data';
import { divisionName, fmtDate, fmtInt, fmtPct, fmtTime, methodText } from '../lib/format';
import { S, type FightEntry, type StatLine } from '../shared/types';

export default function FightPage() {
  const { slug, fightId } = useParams();
  const { data: f, error } = useFighter(slug);
  const [round, setRound] = useState(-1);
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!f) return <Loading />;
  const fight = f.fights.find((x) => x.id === fightId);
  if (!fight) return <div className="container empty">Luta não encontrada.</div>;
  const st = fight.stats;
  const line = (side: 0 | 1): StatLine | null => {
    if (!st) return null;
    if (round < 0) return side === 0 ? st.me : st.opp;
    return st.rounds[round]?.[side] ?? null;
  };
  const a = line(0);
  const b = line(1);
  const opp = fight.opponent;

  return (
    <div className="container">
      <div className="page-head">
        <Link to={`/evento/${fight.eventId}`} className="eyebrow">{fight.event} · {fmtDate(fight.date)}</Link>
        <h1 style={{ marginTop: 8, fontFamily: 'var(--font-display)', textTransform: 'uppercase', fontWeight: 700 }}>
          {f.name} <span className="accent">vs</span> {opp.name}
        </h1>
        <p>
          {fight.title ? (fight.interim ? 'Cinturão interino · ' : 'Cinturão · ') : ''}{divisionName(fight.division)} · {fight.scheduledRounds} rounds · {fight.location}
        </p>
      </div>

      <div className="pick-row">
        <Link to={`/lutador/${f.slug}`} className="pick-card a">
          <Avatar name={f.name} id={f.id} side="a" size="lg" />
          <div>
            <h3><FighterFlag id={f.id} />{f.name}</h3>
            <div className="chips"><span className="chip chip-record">{fight.recordBefore}</span><ResultBadge r={fight.result} /></div>
          </div>
        </Link>
        <div className="vs-badge">VS</div>
        {opp.slug ? (
          <Link to={`/lutador/${opp.slug}`} className="pick-card b">
            <Avatar name={opp.name} id={opp.id} side="b" size="lg" />
            <div>
              <h3><FighterFlag id={opp.id} />{opp.name}</h3>
              <div className="chips"><span className="chip chip-record">{fight.oppRecordBefore}</span></div>
            </div>
          </Link>
        ) : (
          <div className="pick-card b">
            <Avatar name={opp.name} id={opp.id} side="b" size="lg" />
            <div><h3><FighterFlag id={opp.id} />{opp.name}</h3><div className="chips"><span className="chip chip-record">{fight.oppRecordBefore}</span></div></div>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Desfecho</div>
        <p style={{ textAlign: 'center', fontSize: 17 }}>
          <b>{fight.result === 'W' ? f.name : fight.result === 'L' ? opp.name : ''}</b>{' '}
          {fight.result === 'W' || fight.result === 'L' ? 'venceu por ' : ''}
          {methodText(fight.method, fight.decision, fight.detail).toLowerCase()} — round {fight.endRound}, {fight.endTime}
        </p>
        {fight.referee && <p className="note" style={{ textAlign: 'center', marginTop: 4 }}>Árbitro: {fight.referee}</p>}
      </div>

      <PreFight fight={fight} meName={f.name} oppName={opp.name} />
      {fight.judges && <Judges fight={fight} meName={f.name} oppName={opp.name} />}

      {!st ? (
        <div className="panel note" style={{ marginTop: 16 }}>Sem estatísticas detalhadas para esta luta.</div>
      ) : (
        <>
          <div className="filters" style={{ marginTop: 20, justifyContent: 'center' }}>
            <div className="seg" role="tablist" aria-label="Round">
              <button className={round < 0 ? 'on' : ''} onClick={() => setRound(-1)}>Total</button>
              {st.rounds.map((_, i) => (
                <button key={i} className={round === i ? 'on' : ''} onClick={() => setRound(i)}>R{i + 1}</button>
              ))}
            </div>
          </div>
          {a && b && (
            <div className="grid-2">
              <div className="panel">
                <div className="panel-title">{round < 0 ? 'Comparativo geral' : `Round ${round + 1}`}</div>
                <CmpBar label="Golpes significativos" a={a[S.sigL]} b={b[S.sigL]} fmt={fmtInt} />
                <CmpBar label="Golpes totais" a={a[S.totL]} b={b[S.totL]} fmt={fmtInt} />
                <CmpBar label="Knockdowns" a={a[S.kd]} b={b[S.kd]} fmt={fmtInt} />
                <CmpBar label="Quedas" a={a[S.tdL]} b={b[S.tdL]} fmt={fmtInt} />
                <CmpBar label="Tentativas de finalização" a={a[S.sub]} b={b[S.sub]} fmt={fmtInt} />
                <CmpBar label="Tempo de controle" a={a[S.ctrl]} b={b[S.ctrl]} fmt={fmtTime} />
                <CmpBar label="Reversões" a={a[S.rev]} b={b[S.rev]} fmt={fmtInt} />
              </div>
              <div className="panel">
                <div className="panel-title">Alvos e posições</div>
                <CmpBar label="Cabeça" a={a[S.headL]} b={b[S.headL]} fmt={fmtInt} />
                <CmpBar label="Corpo" a={a[S.bodyL]} b={b[S.bodyL]} fmt={fmtInt} />
                <CmpBar label="Pernas" a={a[S.legL]} b={b[S.legL]} fmt={fmtInt} />
                <CmpBar label="Distância" a={a[S.distL]} b={b[S.distL]} fmt={fmtInt} />
                <CmpBar label="Clinch" a={a[S.clinchL]} b={b[S.clinchL]} fmt={fmtInt} />
                <CmpBar label="Solo" a={a[S.groundL]} b={b[S.groundL]} fmt={fmtInt} />
                <div className="grid-2" style={{ marginTop: 18 }}>
                  <BodyMap head={a[S.headL]} body={a[S.bodyL]} leg={a[S.legL]} color="var(--a)" title={f.name} />
                  <BodyMap head={b[S.headL]} body={b[S.bodyL]} leg={b[S.legL]} color="var(--b)" title={opp.name} />
                </div>
              </div>
            </div>
          )}
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title">Round a round</div>
            <div className="table-scroll">
              <table className="mini-table">
                <thead>
                  <tr><th>Round</th><th>Lutador</th><th>Sig.</th><th>Total</th><th>KD</th><th>Quedas</th><th>Fin.</th><th>Controle</th></tr>
                </thead>
                <tbody>
                  {st.rounds.flatMap((r, i) =>
                    ([0, 1] as const).map((side) => {
                      const l = r[side];
                      return (
                        <tr key={`${i}-${side}`}>
                          <td>{side === 0 ? `R${i + 1}` : ''}</td>
                          <td style={{ color: side === 0 ? 'var(--a)' : 'var(--b)', fontWeight: 700 }}>{side === 0 ? f.name : opp.name}</td>
                          <td>{l[S.sigL]}/{l[S.sigA]}</td>
                          <td>{l[S.totL]}/{l[S.totA]}</td>
                          <td>{l[S.kd]}</td>
                          <td>{l[S.tdL]}/{l[S.tdA]}</td>
                          <td>{l[S.sub]}</td>
                          <td>{fmtTime(l[S.ctrl])}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const M_PT = { KO: 'nocaute', SUB: 'finalização', DEC: 'decisão' } as const;

/** Probabilidades calculadas ANTES da luta (modelo treinado só com lutas anteriores): vencedor, método e resultado completo. */
function PreFight({ fight, meName, oppName }: { fight: FightEntry; meName: string; oppName: string }) {
  const pr = fight.pred;
  if (!pr) return null;
  const m = fight.method === 'KO' || fight.method === 'SUB' || fight.method === 'DEC' ? fight.method : null;
  const decided = fight.result === 'W' || fight.result === 'L';
  const winnerName = fight.result === 'W' ? meName : oppName;
  const pWin = fight.result === 'W' ? pr.p : 1 - pr.p;
  const sh = fight.result === 'W' ? pr.mine : pr.opp;
  const pMethod = m ? pr.p * pr.mine[m] + (1 - pr.p) * pr.opp[m] : null;
  const pBoth = m && decided ? pWin * sh[m] : null;
  const favName = pr.p >= 0.5 ? meName : oppName;
  const favP = Math.max(pr.p, 1 - pr.p);
  const cards: { label: string; value: number; sub: string }[] = [];
  if (decided) cards.push({ label: 'Vencedor', value: pWin, sub: winnerName });
  else cards.push({ label: 'Chance de cada um', value: pr.p, sub: `${meName} ${fmtPct(pr.p)} · ${oppName} ${fmtPct(1 - pr.p)}` });
  if (pMethod != null) cards.push({ label: 'Método', value: pMethod, sub: M_PT[m!] });
  if (pBoth != null) cards.push({ label: 'Resultado completo', value: pBoth, sub: `${winnerName} por ${M_PT[m!]}` });
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title">O que o modelo previa antes da luta</div>
      <div className="pre-grid">
        {cards.map((c) => (
          <div className="pre-card" key={c.label}>
            <span>{c.label}</span>
            <b><CountUp value={c.value} format={(n) => fmtPct(n)} ms={1000} fromZero /></b>
            <small>{c.sub}</small>
            <div className="pct-bar"><i style={{ width: `${c.value * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        Favorito do modelo: <b>{favName}</b> ({fmtPct(favP)}). Cada porcentagem é a chance que o modelo dava a aquele desfecho antes da luta: do vencedor, do método e dos dois juntos.
        O cálculo usa só o que se sabia na época: o modelo foi treinado apenas com lutas anteriores a ela{pr.mk ? ', com o sinal de mercado da época' : ''}.
        Previsões existem para lutas desde 2015.
      </p>
    </div>
  );
}

/** Total de pontos de cada jurado (a pontuação round a round não está disponível nas fontes do site). */
function Judges({ fight, meName, oppName }: { fight: FightEntry; meName: string; oppName: string }) {
  const js = fight.judges ?? [];
  const wins = js.filter((j) => j.me > j.opp).length, loses = js.filter((j) => j.opp > j.me).length;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title">Pontuação dos jurados</div>
      <div className="table-scroll">
        <table className="mini-table judges">
          <thead><tr><th>Jurado</th><th style={{ color: 'var(--a)' }}>{meName}</th><th style={{ color: 'var(--b)' }}>{oppName}</th></tr></thead>
          <tbody>
            {js.map((j) => (
              <tr key={j.name}>
                <td>{j.name}</td>
                <td className={j.me > j.opp ? 'jw' : j.me < j.opp ? 'jl' : ''}>{j.me}</td>
                <td className={j.opp > j.me ? 'jw' : j.opp < j.me ? 'jl' : ''}>{j.opp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        {methodText(fight.method, fight.decision, '')} · {meName} {wins} × {loses} {oppName}. Aqui aparece o total de cada jurado; as fontes do site (UFCStats e ESPN) não publicam a pontuação round a round.
      </p>
    </div>
  );
}
