import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BodyMap, CmpBar } from '../components/charts';
import { compareUrl } from '../components/events';
import { FighterPicker } from '../components/fighters';
import { Avatar, Icon, Loading, ResultBadge, Rich } from '../components/ui';
import { analyze, shortName, type Analysis } from '../lib/compare';
import { useEvents, useFighter, useFighters, useModel } from '../lib/data';
import { divisionName, fmtDate, fmtInt, fmtNum, fmtPct, recordStr, todayIso } from '../lib/format';
import { DIVISION_BY_KEY, type DivisionKey } from '../shared/divisions';
import type { FighterDetail, FighterSummary, ModelParams } from '../shared/types';

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const slugA = params.get('a');
  const slugB = params.get('b');
  const rounds = Number(params.get('r') ?? 3) === 5 ? 5 : 3;
  const division = (params.get('d') as DivisionKey | null) ?? null;
  const evName = params.get('ev');

  const fighters = useFighters().data;
  const events = useEvents().data;
  const model = useModel().data;
  const A = useFighter(slugA);
  const B = useFighter(slugB);

  const update = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  const pick = (side: 'a' | 'b') => (f: FighterSummary) => update({ [side]: f.slug, ev: null, d: null });

  const quick = useMemo(
    () => (events?.upcoming ?? []).flatMap((e) => e.bouts.filter((b) => b.a.slug && b.b.slug)).slice(0, 14),
    [events],
  );

  const ready = A.data && B.data && model;
  const analysis = useMemo(
    () => (ready ? analyze(A.data!, B.data!, model!, { rounds, division, date: todayIso() }) : null),
    [ready, A.data, B.data, model, rounds, division],
  );

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Análise de confronto</span>
        <h1 style={{ marginTop: 8 }}>Comparador <span className="accent">A × B</span></h1>
        <p>Escolha dois lutadores ou uma luta marcada. O modelo cruza as estatísticas do UFC de cada um e estima a chance de vitória e o método mais provável.</p>
      </div>

      {quick.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="note" style={{ marginBottom: 8 }}>Próximas lutas</div>
          <div className="quick-picks">
            {quick.map((b, i) => (
              <Link key={i} to={compareUrl(b)} className="quick-pick">
                {shortName(b.a.name)} <span style={{ color: 'var(--brand)' }}>vs</span> {shortName(b.b.name)} <small>{b.event}</small>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="pick-row">
        <PickCard side="a" f={A.data} loading={A.loading} list={fighters} onPick={pick('a')} onClear={() => update({ a: null })} exclude={slugB} />
        <div className="vs-badge"><Icon name="swords" /></div>
        <PickCard side="b" f={B.data} loading={B.loading} list={fighters} onPick={pick('b')} onClear={() => update({ b: null })} exclude={slugA} />
      </div>

      {A.data && B.data && (
        <div className="filters" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <div className="note">
            {evName ? <>Luta marcada: <b style={{ color: 'var(--text)' }}>{evName}</b> · </> : ''}
            {division ? divisionName(division) : A.data.division === B.data.division ? divisionName(A.data.division) : `${DIVISION_BY_KEY[A.data.division]?.short} × ${DIVISION_BY_KEY[B.data.division]?.short}`}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="note">Duração</span>
            <div className="seg" role="group" aria-label="Rounds">
              {[3, 5].map((r) => (
                <button key={r} className={rounds === r ? 'on' : ''} onClick={() => update({ r: String(r) })}>{r} rounds</button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => update({ a: slugB, b: slugA })} title="Inverter lados">⇄</button>
          </div>
        </div>
      )}

      {(slugA && slugB && !ready) && <Loading label="Analisando…" />}
      {analysis && A.data && B.data && model && <AnalysisView A={A.data} B={B.data} an={analysis} model={model} />}
      {!slugA || !slugB ? (
        <div className="empty">Selecione os dois lutadores para ver a análise.</div>
      ) : null}
    </div>
  );
}

function PickCard({
  side, f, loading, list, onPick, onClear, exclude,
}: {
  side: 'a' | 'b'; f: FighterDetail | null; loading: boolean; list: FighterSummary[] | null;
  onPick: (f: FighterSummary) => void; onClear: () => void; exclude: string | null;
}) {
  if (loading) return <div className={`pick-card ${side}`}><Loading label="" /></div>;
  if (!f) {
    return (
      <div className={`pick-card ${side}`}>
        <Avatar name="?" side={side} size="lg" />
        {list ? <FighterPicker list={list} onPick={onPick} exclude={exclude} placeholder={side === 'a' ? 'Lutador vermelho…' : 'Lutador azul…'} /> : <span className="note">Carregando lista…</span>}
      </div>
    );
  }
  return (
    <div className={`pick-card ${side}`}>
      <button className="clear" onClick={onClear} aria-label={`Remover ${f.name}`}><Icon name="x" /></button>
      <Avatar name={f.name} id={f.id} side={side} size="lg" />
      <div style={{ minWidth: 0 }}>
        {f.nickname && <div className="nick">"{f.nickname}"</div>}
        <Link to={`/lutador/${f.slug}`}><h3>{f.name}</h3></Link>
        <div className="chips">
          <span className="chip chip-record">{recordStr(f.record)}</span>
          {f.eloRank && <span className="chip chip-rank">#{f.eloRank.division} Elo</span>}
          <span className="chip">{DIVISION_BY_KEY[f.division]?.short}</span>
        </div>
      </div>
    </div>
  );
}

const M = { KO: 'KO/TKO', SUB: 'Finalização', DEC: 'Decisão' } as const;
const MC = { KO: 'var(--ko)', SUB: 'var(--sub)', DEC: 'var(--dec)' } as const;

function AnalysisView({ A, B, an, model }: { A: FighterDetail; B: FighterDetail; an: Analysis; model: ModelParams }) {
  const nA = shortName(A.name);
  const nB = shortName(B.name);
  const shown = an.factors.slice(0, 8);
  const maxAbs = Math.max(...shown.map((f) => Math.abs(f.value)), 0.01);
  const ra = A.rates, rb = B.rates;
  const ta = A.totals, tb = B.totals;
  const debutA = A.fights.length === 0, debutB = B.fights.length === 0;

  return (
    <div style={{ marginTop: 16 }}>
      {/* Previsão */}
      <div className="panel">
        <div className="panel-title">Previsão</div>
        <div className="predict-top">
          <div>
            <div className="pct" style={{ color: 'var(--a)' }}>{fmtPct(an.pA)}</div>
            <div className="who">{nA}</div>
          </div>
          <div className="note" style={{ textAlign: 'center', paddingBottom: 6 }}>chance de<br />vitória</div>
          <div className="right">
            <div className="pct" style={{ color: 'var(--b)' }}>{fmtPct(1 - an.pA)}</div>
            <div className="who">{nB}</div>
          </div>
        </div>
        <div className="predict-bar" role="img" aria-label={`${nA} ${fmtPct(an.pA)}, ${nB} ${fmtPct(1 - an.pA)}`}>
          <i style={{ width: `${an.pA * 100}%` }} />
          <i style={{ width: `${(1 - an.pA) * 100}%` }} />
        </div>
        <div className="outcome-grid">
          {(['A', 'B'] as const).map((side) => (
            <div key={side}>
              <div style={{ fontWeight: 800, marginBottom: 6, color: side === 'A' ? 'var(--a)' : 'var(--b)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {side === 'A' ? nA : nB} vence por…
              </div>
              {(['KO', 'SUB', 'DEC'] as const).map((m) => (
                <div className="outcome-row" key={m}>
                  <span>{M[m]}</span>
                  <div className="bar"><i style={{ width: `${an.table[side][m] * 100}%`, background: MC[m] }} /></div>
                  <b>{fmtPct(an.table[side][m])}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="most-likely">
          Resultado mais provável: <b>{an.mostLikely.side === 'A' ? A.name : B.name} por {M[an.mostLikely.method].toLowerCase()}</b> ({fmtPct(an.mostLikely.p)}).
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          Modelo de regressão logística treinado com {model.metrics.trainN.toLocaleString('pt-BR')} lutas do UFC; acertou {fmtPct(model.metrics.accuracy, 1)} dos vencedores em {model.metrics.testN.toLocaleString('pt-BR')} lutas desde {model.metrics.testFrom.slice(0, 4)} que ele não viu no treino. <Link to="/modelo" style={{ color: 'var(--brand)' }}>Como funciona →</Link>
        </p>
      </div>

      {/* Fatores */}
      <div className="panel">
        <div className="panel-title">O que mais pesa na previsão</div>
        <div className="legend" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span><i style={{ background: 'var(--a)' }} />favorece {nA}</span>
          <span><i style={{ background: 'var(--b)' }} />favorece {nB}</span>
        </div>
        {shown.map((f) => (
          <div className="factor-row" key={f.key}>
            <div className="factor-top">
              <b>{f.label}</b>
              <div className="diverge" aria-hidden="true">
                <i style={
                  f.value > 0
                    ? { right: '50%', width: `${(Math.abs(f.value) / maxAbs) * 50}%`, background: 'var(--a)' }
                    : { left: '50%', width: `${(Math.abs(f.value) / maxAbs) * 50}%`, background: 'var(--b)' }
                } />
              </div>
            </div>
            <p>{f.text}</p>
          </div>
        ))}
      </div>

      {/* Razões e narrativa */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel reason-col a">
          <h3>Por que {nA} pode vencer</h3>
          {an.reasonsA.length ? <ul>{an.reasonsA.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="note">Nenhuma vantagem estatística clara.</p>}
        </div>
        <div className="panel reason-col b">
          <h3>Por que {nB} pode vencer</h3>
          {an.reasonsB.length ? <ul>{an.reasonsB.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="note">Nenhuma vantagem estatística clara.</p>}
        </div>
      </div>
      <div className="panel narrative">
        <div className="panel-title">Como a luta deve se desenrolar</div>
        {an.narrative.map((p, i) => <p key={i}><Rich text={p} /></p>)}
      </div>

      {/* Números lado a lado */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-title">Cartel no UFC</div>
          <CmpBar label="Vitórias" a={ta.wins} b={tb.wins} fmt={fmtInt} />
          <CmpBar label="Derrotas" a={ta.losses} b={tb.losses} fmt={fmtInt} higherIsBetter={false} />
          <CmpBar label="Vitórias por KO/TKO" a={ta.koW} b={tb.koW} fmt={fmtInt} />
          <CmpBar label="Vitórias por finalização" a={ta.subW} b={tb.subW} fmt={fmtInt} />
          <CmpBar label="Vitórias por decisão" a={ta.decW} b={tb.decW} fmt={fmtInt} higherIsBetter={null} />
          <CmpBar label="Derrotas por KO/TKO" a={ta.koL} b={tb.koL} fmt={fmtInt} higherIsBetter={false} />
          <CmpBar label="Derrotas por finalização" a={ta.subL} b={tb.subL} fmt={fmtInt} higherIsBetter={false} />
        </div>
        <div className="panel">
          <div className="panel-title">Físico e experiência</div>
          <CmpBar label="Idade" a={A.age} b={B.age} fmt={(n) => `${n}`} higherIsBetter={false} />
          <CmpBar label="Altura (cm)" a={A.heightCm} b={B.heightCm} fmt={fmtInt} />
          <CmpBar label="Envergadura (cm)" a={A.reachCm} b={B.reachCm} fmt={fmtInt} />
          <CmpBar label="Rating Elo" a={A.elo} b={B.elo} fmt={fmtInt} hint="Rating calculado com todas as lutas do UFC: sobe ao vencer, mais ainda contra adversários fortes" />
          <CmpBar label="Lutas de 5 rounds" a={A.fiveRoundFights} b={B.fiveRoundFights} fmt={fmtInt} />
          <CmpBar label="Disputas de cinturão" a={A.titleFights} b={B.titleFights} fmt={fmtInt} />
          <div className="note" style={{ marginTop: 10, textAlign: 'center' }}>Base: {A.stance || '—'} × {B.stance || '—'}</div>
        </div>
        <div className="panel">
          <div className="panel-title">Em pé</div>
          <CmpBar label="Golpes sig. conectados/min" a={debutA ? null : ra.slpm} b={debutB ? null : rb.slpm} fmt={(n) => fmtNum(n, 2)} />
          <CmpBar label="Precisão" a={debutA ? null : ra.acc} b={debutB ? null : rb.acc} fmt={(n) => fmtPct(n)} />
          <CmpBar label="Golpes sig. absorvidos/min" a={debutA ? null : ra.sapm} b={debutB ? null : rb.sapm} fmt={(n) => fmtNum(n, 2)} higherIsBetter={false} />
          <CmpBar label="Defesa de golpes" a={debutA ? null : ra.def} b={debutB ? null : rb.def} fmt={(n) => fmtPct(n)} />
          <CmpBar label="Knockdowns/15 min" a={debutA ? null : ra.kd} b={debutB ? null : rb.kd} fmt={(n) => fmtNum(n, 2)} />
          <CmpBar label="Knockdowns sofridos/15 min" a={debutA ? null : ra.kdAbs} b={debutB ? null : rb.kdAbs} fmt={(n) => fmtNum(n, 2)} higherIsBetter={false} />
          <div className="note" style={{ marginTop: 10, textAlign: 'center' }}>
            Projeção no confronto: {fmtNum(an.projections.strA, 1)} × {fmtNum(an.projections.strB, 1)} golpes sig./min
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">No chão</div>
          <CmpBar label="Quedas/15 min" a={debutA ? null : ra.td} b={debutB ? null : rb.td} fmt={(n) => fmtNum(n, 2)} />
          <CmpBar label="Precisão de quedas" a={debutA ? null : ra.tdAcc} b={debutB ? null : rb.tdAcc} fmt={(n) => fmtPct(n)} />
          <CmpBar label="Defesa de quedas" a={debutA ? null : ra.tdDef} b={debutB ? null : rb.tdDef} fmt={(n) => fmtPct(n)} />
          <CmpBar label="Finalizações tentadas/15 min" a={debutA ? null : ra.sub} b={debutB ? null : rb.sub} fmt={(n) => fmtNum(n, 2)} />
          <CmpBar label="Tempo em controle" a={debutA ? null : ra.ctrl} b={debutB ? null : rb.ctrl} fmt={(n) => fmtPct(n)} />
          <div className="note" style={{ marginTop: 10, textAlign: 'center' }}>
            Projeção no confronto: {fmtNum(an.projections.tdA, 1)} × {fmtNum(an.projections.tdB, 1)} quedas a cada 15 min
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Distribuição de golpes</div>
        <div className="grid-2">
          <div>
            <div style={{ color: 'var(--a)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13, marginBottom: 10 }}>{A.name}</div>
            <BodyMap head={A.target.head} body={A.target.body} leg={A.target.leg} color="var(--a)" title={A.name} />
          </div>
          <div>
            <div style={{ color: 'var(--b)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13, marginBottom: 10 }}>{B.name}</div>
            <BodyMap head={B.target.head} body={B.target.body} leg={B.target.leg} color="var(--b)" title={B.name} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Últimas 5 lutas</div>
        <div className="grid-2">
          {[A, B].map((f, i) => (
            <div key={f.id}>
              <div style={{ color: i ? 'var(--b)' : 'var(--a)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13, marginBottom: 10 }}>{f.name}</div>
              <div className="fight-list">
                {f.fights.slice(0, 5).map((x) => (
                  <Link key={x.id} to={`/lutador/${f.slug}/luta/${x.id}`} className="fight-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px' }}>
                    <ResultBadge r={x.result} />
                    <div style={{ minWidth: 0 }}>
                      <div className="opp" style={{ fontWeight: 800, fontSize: 14 }}>{x.opponent.name}</div>
                      <div className="ev" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.event} · {fmtDate(x.date)}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>
                      {x.method === 'DEC' ? 'Decisão' : x.method === 'KO' ? 'KO/TKO' : x.method === 'SUB' ? 'Finalização' : x.method}
                      <div className="note" style={{ textTransform: 'none' }}>R{x.endRound}</div>
                    </div>
                  </Link>
                ))}
                {f.fights.length === 0 && <div className="note">Estreante no UFC.</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {an.common.length > 0 && (
        <div className="panel">
          <div className="panel-title">Adversários em comum</div>
          <div className="table-scroll">
            <table className="mini-table">
              <thead><tr><th>Adversário</th><th style={{ color: 'var(--a)' }}>{nA}</th><th style={{ color: 'var(--b)' }}>{nB}</th></tr></thead>
              <tbody>
                {an.common.map((c) => (
                  <tr key={c.opponent}>
                    <td>{c.opponent}</td>
                    <td>{c.a.map((x) => `${x.result === 'W' ? 'V' : x.result === 'L' ? 'D' : x.result} (${x.method === 'DEC' ? 'Dec' : x.method}, ${x.date.slice(0, 4)})`).join(' · ')}</td>
                    <td>{c.b.map((x) => `${x.result === 'W' ? 'V' : x.result === 'L' ? 'D' : x.result} (${x.method === 'DEC' ? 'Dec' : x.method}, ${x.date.slice(0, 4)})`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
