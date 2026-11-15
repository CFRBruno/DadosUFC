import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BodyMap, EloChart, MethodBlock, MethodLegend, SimpleBars } from '../components/charts';
import { compareUrl } from '../components/events';
import { FightRow } from '../components/fighters';
import { Avatar, ErrorBox, Icon, Loading } from '../components/ui';
import { useFighter } from '../lib/data';
import { cmToFtIn, divisionName, fmtDate, fmtNum, fmtPct, recordStr } from '../lib/format';
import type { FighterDetail, Rates } from '../shared/types';

type Tile = { key: keyof Rates; label: string; fmt: (r: Rates) => string; hint: string };
const TILES: Tile[] = [
  { key: 'slpm', label: 'Golpes sig. conectados/min', fmt: (r) => fmtNum(r.slpm, 2), hint: 'Golpes significativos conectados por minuto de luta' },
  { key: 'acc', label: 'Precisão de golpes', fmt: (r) => fmtPct(r.acc), hint: 'Golpes significativos conectados ÷ tentados' },
  { key: 'sapm', label: 'Golpes sig. absorvidos/min', fmt: (r) => fmtNum(r.sapm, 2), hint: 'Quanto menor, melhor' },
  { key: 'def', label: 'Defesa de golpes', fmt: (r) => fmtPct(r.def), hint: '% dos golpes significativos do adversário que não conectaram' },
  { key: 'td', label: 'Quedas por 15 min', fmt: (r) => fmtNum(r.td, 2), hint: 'Quedas completadas a cada 15 minutos' },
  { key: 'tdAcc', label: 'Precisão de quedas', fmt: (r) => fmtPct(r.tdAcc), hint: 'Quedas completadas ÷ tentadas' },
  { key: 'tdDef', label: 'Defesa de quedas', fmt: (r) => fmtPct(r.tdDef), hint: '% das quedas do adversário defendidas' },
  { key: 'sub', label: 'Finalizações tentadas/15 min', fmt: (r) => fmtNum(r.sub, 2), hint: 'Tentativas de finalização a cada 15 minutos' },
  { key: 'kd', label: 'Knockdowns/15 min', fmt: (r) => fmtNum(r.kd, 2), hint: 'Knockdowns aplicados a cada 15 minutos' },
  { key: 'kdAbs', label: 'Knockdowns sofridos/15 min', fmt: (r) => fmtNum(r.kdAbs, 2), hint: 'Quanto menor, melhor' },
  { key: 'ctrl', label: 'Tempo em controle', fmt: (r) => fmtPct(r.ctrl), hint: '% do tempo de luta controlando o adversário' },
  { key: 'finishRate', label: 'Vitórias antes do fim', fmt: (r) => fmtPct(r.finishRate), hint: 'Vitórias por nocaute ou finalização ÷ vitórias' },
];

export default function FighterPage() {
  const { slug } = useParams();
  const { data: f, error } = useFighter(slug);
  if (error) return <div className="container"><ErrorBox message={error === 'não encontrado' ? 'lutador não encontrado' : error} /></div>;
  if (!f) return <Loading />;
  return <Profile f={f} />;
}

function Profile({ f }: { f: FighterDetail }) {
  const [resFilter, setResFilter] = useState<'' | 'W' | 'L'>('');
  const [methodFilter, setMethodFilter] = useState<'' | 'KO' | 'SUB' | 'DEC'>('');
  const fights = useMemo(
    () => f.fights.filter((x) => (!resFilter || x.result === resFilter) && (!methodFilter || x.method === methodFilter)),
    [f.fights, resFilter, methodFilter],
  );
  const debut = f.fights.length === 0;
  const tileCount = TILES.filter((t) => f.percentiles[t.key] != null).length;

  return (
    <div className="container">
      <div className="profile-head">
        <div>
          <Avatar name={f.name} id={f.id} size="lg" />
          {f.photoPage && (
            <div className="photo-credit"><a href={f.photoPage} target="_blank" rel="noreferrer">Foto: Wikimedia</a></div>
          )}
        </div>
        <div>
          {f.nickname && <div className="nick">"{f.nickname}"</div>}
          <h1>{f.name}</h1>
          <div className="chips">
            <span className="chip chip-record" title="Cartel somente no UFC">UFC {recordStr(f.record)}</span>
            {f.eloRank && <span className="chip chip-rank" title="Posição no rating Elo da categoria (entre os lutadores do site)">#{f.eloRank.division} Elo · {divisionName(f.division)}</span>}
            {!f.eloRank && <span className="chip">{divisionName(f.division)}</span>}
            {f.style && <span className="chip chip-style">{f.style}</span>}
            {f.streak && <span className={`chip ${f.streak.startsWith('V') ? 'chip-up' : 'chip-red'}`}>{f.streak.startsWith('V') ? `${f.streak.slice(1)} vitória(s) seguida(s)` : f.streak.startsWith('D') ? `${f.streak.slice(1)} derrota(s) seguida(s)` : 'Empate'}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to={`/comparar?a=${f.slug}`} className="btn btn-primary"><Icon name="swords" className="arrow" /> Comparar</Link>
        </div>
      </div>

      {f.next && (
        <div className="callout" style={{ marginTop: 16 }}>
          <Icon name="calendar" />
          <div style={{ flex: 1 }}>
            <b>Próxima luta:</b> {f.next.a.id === f.id ? f.next.b.name : f.next.a.name} — {f.next.event} ({fmtDate(f.next.date)})
          </div>
          {f.next.a.slug && f.next.b.slug && <Link to={compareUrl(f.next)} className="btn btn-ghost">Analisar</Link>}
        </div>
      )}

      <div className="bio-grid">
        <div><span>Idade</span><b>{f.age ?? '—'}</b><small>{f.dob ? fmtDate(f.dob) : ''}</small></div>
        <div><span>Altura</span><b>{f.heightCm ? `${f.heightCm} cm` : '—'}</b><small>{cmToFtIn(f.heightCm)}</small></div>
        <div><span>Envergadura</span><b>{f.reachCm ? `${f.reachCm} cm` : '—'}</b><small>{f.reachCm ? `${Math.round(f.reachCm / 2.54)}"` : ''}</small></div>
        <div><span>Base</span><b>{f.stance || '—'}</b></div>
        <div><span>Rating Elo</span><b>{f.elo}</b><small>pico {f.eloPeak}</small></div>
        <div><span>Estreia no UFC</span><b>{f.firstFight ? f.firstFight.slice(0, 4) : '—'}</b><small>{f.firstFight ? fmtDate(f.firstFight) : ''}</small></div>
        <div><span>Tempo médio</span><b>{f.rates.avgFightMin ? `${fmtNum(f.rates.avgFightMin, 1)} min` : '—'}</b><small>por luta</small></div>
        <div><span>5 rounds</span><b>{f.fiveRoundFights}</b><small>{f.titleFights ? `${f.titleFights} por cinturão` : 'lutas'}</small></div>
      </div>

      {debut ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title left">Estreante</div>
          <p className="text-2">{f.name} ainda não lutou no UFC. Assim que fizer a primeira luta, as estatísticas aparecem aqui automaticamente.</p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title left">Estilo de luta</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span className="chip chip-style" style={{ fontSize: 13, padding: '4px 10px' }}>{f.style}</span>
              {f.styleTags.map((t) => <span key={t} className="chip chip-tag">{t}</span>)}
            </div>
            <p className="text-2" style={{ lineHeight: 1.7 }}>{f.styleText}</p>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="panel">
              <div className="panel-title left">Pontos fortes</div>
              {f.strengths.length ? (
                <ul className="insight-list good">
                  {f.strengths.map((s) => (
                    <li key={s.key}><span className="insight-icon">+</span><div><b>{s.title}</b><p>{s.text}</p></div></li>
                  ))}
                </ul>
              ) : <p className="note">Nenhum destaque estatístico claro ainda.</p>}
            </div>
            <div className="panel">
              <div className="panel-title left">Pontos fracos</div>
              {f.weaknesses.length ? (
                <ul className="insight-list bad">
                  {f.weaknesses.map((s) => (
                    <li key={s.key}><span className="insight-icon">−</span><div><b>{s.title}</b><p>{s.text}</p></div></li>
                  ))}
                </ul>
              ) : <p className="note">Nenhuma fraqueza estatística clara.</p>}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title left">Estatísticas no UFC</div>
            <div className="stat-tiles">
              {TILES.map((t) => {
                const p = f.percentiles[t.key];
                return (
                  <div className="stat-tile" key={t.key} title={t.hint}>
                    <div className="label">{t.label}</div>
                    <div className="value">{t.fmt(f.rates)}</div>
                    {p != null && (
                      <>
                        <div className="pct-bar"><i style={{ width: `${p}%` }} /></div>
                        <div className="pct-label"><span>Percentil</span><span>{p}</span></div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              {tileCount
                ? `Percentil = posição entre os lutadores do ${divisionName(f.division)} no site (100 = melhor da categoria; para "absorvidos" e "sofridos", menos é melhor).`
                : 'Percentis aparecem a partir de 2 lutas e 15 minutos no UFC.'}
            </p>
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div className="panel-title left" style={{ margin: 0 }}>Vitórias e derrotas</div>
                <MethodLegend />
              </div>
              <div className="stack">
                <MethodBlock title="Vitórias" mb={f.wins} />
                <MethodBlock title="Derrotas" mb={f.losses} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-title left">Onde conecta os golpes</div>
              <BodyMap head={f.target.head} body={f.target.body} leg={f.target.leg} color="var(--brand)" title="Alvos dos golpes conectados" />
              <div style={{ marginTop: 20 }}>
                <div className="note" style={{ marginBottom: 8 }}>Posição dos golpes significativos conectados</div>
                <SimpleBars color="var(--brand)" rows={[
                  { label: 'Distância', value: f.position.dist },
                  { label: 'Clinch', value: f.position.clinch },
                  { label: 'Solo', value: f.position.ground },
                ]} />
              </div>
              <div style={{ marginTop: 20 }}>
                <div className="note" style={{ marginBottom: 8 }}>Onde é atingido(a) pelos adversários</div>
                <SimpleBars color="#8a8f98" rows={[
                  { label: 'Cabeça', value: f.targetAbs.head },
                  { label: 'Corpo', value: f.targetAbs.body },
                  { label: 'Pernas', value: f.targetAbs.leg },
                ]} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title left">Evolução do rating Elo</div>
            <EloChart history={f.eloHistory} fights={f.fights} />
          </div>

          <div className="section-title">
            <h2>Histórico no UFC</h2>
            <span className="note">{f.fights.length} lutas</span>
          </div>
          <div className="filters">
            <div className="seg" role="group" aria-label="Resultado">
              {([['', 'Todas'], ['W', 'Vitórias'], ['L', 'Derrotas']] as const).map(([v, l]) => (
                <button key={v} className={resFilter === v ? 'on' : ''} onClick={() => setResFilter(v)}>{l}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Método">
              {([['', 'Todos'], ['KO', 'KO/TKO'], ['SUB', 'Finalização'], ['DEC', 'Decisão']] as const).map(([v, l]) => (
                <button key={v} className={methodFilter === v ? 'on' : ''} onClick={() => setMethodFilter(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="fight-list">
            {fights.map((x) => <FightRow key={x.id} f={x} fighterSlug={f.slug} fighterName={f.name} />)}
            {fights.length === 0 && <div className="empty">Nenhuma luta com esse filtro.</div>}
          </div>
        </>
      )}
    </div>
  );
}
