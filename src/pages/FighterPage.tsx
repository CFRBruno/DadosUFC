import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BodyMap, EloChart, MethodBlock, MethodLegend, SimpleBars } from '../components/charts';
import { compareUrl } from '../components/events';
import FavButton from '../components/FavButton';
import { FightRow, OfficialChip } from '../components/fighters';
import { Avatar, CountUp, ErrorBox, Flag, Icon, Loading } from '../components/ui';
import { useFighter } from '../lib/data';
import { rankingUrl } from '../lib/rankingStats';
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
            <div className="photo-credit"><a href={f.photoPage} target="_blank" rel="noreferrer">Foto: {f.photoPage.includes('espn.com') ? 'ESPN' : 'Wikimedia'}</a></div>
          )}
        </div>
        <div>
          {f.nickname && <div className="nick">"{f.nickname}"</div>}
          <h1>{f.name}</h1>
          <div className="chips">
            {f.country && <span className="chip"><Flag src={f.flag} country={f.country} />{f.country}</span>}
            <span className="chip chip-record" title="Cartel somente no UFC">UFC {recordStr(f.record)}</span>
            {f.eloRank && <span className="chip chip-rank" title="Posição no rating Elo da categoria (entre os lutadores do site)">#{f.eloRank.division} Elo · {divisionName(f.division)}</span>}
            {!f.eloRank && <span className="chip">{divisionName(f.division)}</span>}
            {f.official && <OfficialChip o={f.official} />}
            {f.champ && <span className={`chip ${f.champ === 'atual' ? 'chip-gold' : 'chip-tag'}`}>{f.champ === 'atual' ? 'Campeão atual' : 'Ex-campeão do UFC'}</span>}
            {f.style && <span className="chip chip-style">{f.style}</span>}
            {f.preUfc && f.preUfc.w + f.preUfc.l + f.preUfc.d > 0 && <span className="chip" title="Cartel em outras organizações antes do UFC (ESPN): vitórias-derrotas-empates">Fora do UFC {f.preUfc.w}-{f.preUfc.l}{f.preUfc.d ? `-${f.preUfc.d}` : ''}</span>}
            {f.titlesOutside ? <span className="chip chip-tag" title="Vitórias em lutas de cinturão fora do UFC, segundo a ESPN. A contagem inclui cinturões regionais e pode ser imprecisa.">{f.titlesOutside} vitória{f.titlesOutside > 1 ? 's' : ''} por cinturão fora do UFC</span> : null}
            {f.streak && <span className={`chip ${f.streak.startsWith('V') ? 'chip-up' : 'chip-red'}`}>{f.streak.startsWith('V') ? `${f.streak.slice(1)} vitória(s) seguida(s)` : f.streak.startsWith('D') ? `${f.streak.slice(1)} derrota(s) seguida(s)` : 'Empate'}</span>}
          </div>
        </div>
        {f.ufcStatus && (
          <div className={`status-banner ${f.ufcStatus.kind}`} role="status">
            <b>{f.ufcStatus.kind === 'aposentado' ? 'Aposentado do UFC' : f.ufcStatus.kind === 'dispensado' ? 'Dispensado do UFC' : 'Saiu do UFC'}</b> em {fmtDate(f.ufcStatus.date)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <FavButton kind="fighters" id={f.id} name={f.name} className="big" />
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
        <Link to={rankingUrl('age', f.division)} title="Ver ranking"><span>Idade</span><b>{f.age ?? '—'}</b><small>{f.dob ? fmtDate(f.dob) : ''}</small></Link>
        <Link to={rankingUrl('height', f.division)} title="Ver ranking"><span>Altura</span><b>{f.heightCm ? `${f.heightCm} cm` : '—'}</b><small>{cmToFtIn(f.heightCm)}</small></Link>
        <Link to={rankingUrl('reach', f.division)} title="Ver ranking"><span>Envergadura</span><b>{f.reachCm ? `${f.reachCm} cm` : '—'}</b><small>{f.reachCm ? `${Math.round(f.reachCm / 2.54)}"` : ''}</small></Link>
        <div><span>Base</span><b>{f.stance || '—'}</b></div>
        <Link to={rankingUrl('elo', f.division)} title="Ver ranking"><span>Rating Elo</span><b>{f.elo}</b><small>pico {f.eloPeak}</small></Link>
        <Link to={rankingUrl('tenure', f.division)} title="Ver ranking"><span>Estreia no UFC</span><b>{f.firstFight ? f.firstFight.slice(0, 4) : '—'}</b><small>{f.firstFight ? fmtDate(f.firstFight) : ''}</small></Link>
        <Link to={rankingUrl('avgMin', f.division)} title="Ver ranking"><span>Tempo médio</span><b>{f.rates.avgFightMin ? `${fmtNum(f.rates.avgFightMin, 1)} min` : '—'}</b><small>por luta</small></Link>
        <Link to={rankingUrl('five', f.division)} title="Ver ranking"><span>5 rounds</span><b>{f.fiveRoundFights}</b><small>{f.titleFights ? `${f.titleFights} por cinturão` : 'lutas'}</small></Link>
      </div>

      {f.form && <FormPanel form={f.form} />}
      {f.titleReigns.length > 0 && <TitlePanel f={f} />}

      {debut ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-title left">Estreante</div>
          <p className="text-2">{f.name} ainda não lutou no UFC. Assim que fizer a primeira luta, as estatísticas aparecem aqui automaticamente.</p>
          {f.preUfc && f.preUfc.w + f.preUfc.l + f.preUfc.d > 0 && (
            <p style={{ marginTop: 10 }}><b>Cartel fora do UFC (ESPN):</b> {f.preUfc.w}-{f.preUfc.l}{f.preUfc.d ? `-${f.preUfc.d}` : ''}, com {f.preUfc.ko} vitória{f.preUfc.ko === 1 ? '' : 's'} por nocaute, {f.preUfc.sub} por finalização e {f.preUfc.dec} por decisão. É o que o modelo usa para estimar o nível dele enquanto não há lutas no UFC.</p>
          )}
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
            {f.styleShift && (
              <div style={{ marginTop: 14 }}>
                <div className="text-3" style={{ fontSize: 12, marginBottom: 6 }}>Mudança de estilo no UFC (estatísticas por fase da carreira)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {f.styleShift.map((x, i) => (
                    <span key={x.from} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && <span aria-hidden>→</span>}
                      <span className="chip chip-tag" title={`${x.fights} lutas`}>{x.style} · {x.from.slice(0, 4)}–{x.to.slice(0, 4)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
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
                  <Link to={rankingUrl(t.key, f.division)} className="stat-tile" key={t.key} title={`${t.hint} — clique para ver o ranking`}>
                    <div className="label">{t.label}</div>
                    <div className="value">{t.fmt(f.rates)}</div>
                    {p != null && (
                      <>
                        <div className="pct-bar"><i style={{ width: `${p}%` }} /></div>
                        <div className="pct-label"><span>Percentil</span><span>{p}</span></div>
                        {f.statRanks[t.key] && (
                          <div className="pct-label rank-line" title={f.statRanks[t.key]!.scope === 'cat' ? `Posição entre os lutadores do ${divisionName(f.division)} no site` : 'Categoria pequena: posição entre todos os lutadores do mesmo gênero no site'}>
                            <span>Posição</span><span><b>{f.statRanks[t.key]!.pos}º</b> de {f.statRanks[t.key]!.of}{f.statRanks[t.key]!.scope === 'gen' ? ' (gênero)' : ''}</span>
                          </div>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              {tileCount
                ? `Percentil: 100 = melhor da categoria. Posição: colocação entre os lutadores do ${divisionName(f.division)} no site (para "absorvidos" e "sofridos", menos é melhor).`
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

const METHOD_PT: Record<string, string> = { KO: 'nocaute', SUB: 'finalização', DEC: 'decisão' };
const RES = { W: 'V', L: 'D', D: 'E' } as const;

function FormPanel({ form }: { form: NonNullable<FighterDetail['form']> }) {
  const tone = form.score >= 58 ? 'good' : form.score >= 43 ? 'mid' : 'bad';
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title left">Forma recente</div>
      <div className="form-grid">
        <div className={`form-score ${tone}`}>
          <b><CountUp value={form.score} format={(n) => String(Math.round(n))} /></b>
          <span>{form.label}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="form-gauge" role="img" aria-label={`Forma ${form.score} de 100`}>
            <i style={{ left: `${form.score}%` }} />
          </div>
          <div className="form-gauge-scale"><span>Em crise</span><span>Regular</span><span>Em alta</span></div>
          <div className="form-dots">
            {[...form.last5].reverse().map((x) => (
              <span key={x.date + x.opp} className={`form-dot ${x.r}`} title={`${fmtDate(x.date)} · ${x.r === 'W' ? 'Vitória' : x.r === 'L' ? 'Derrota' : 'Empate'} contra ${x.opp} (${METHOD_PT[x.method] ?? x.method})`}>
                {RES[x.r]}
              </span>
            ))}
            <small>da mais antiga à mais recente</small>
          </div>
        </div>
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        Nota de 0 a 100 com as últimas 5 lutas; as mais recentes pesam mais. Cada luta vale o resultado menos o esperado pelo Elo: vencer um adversário forte pontua mais, perder para um muito mais forte pesa pouco, e finalização ou nocaute ajustam um pouco. 50 é o neutro. Funciona nos dois sentidos: boas fases sobem a nota, fases ruins a derrubam.
      </p>
    </div>
  );
}

function TitlePanel({ f }: { f: FighterDetail }) {
  const champs = f.titleReigns.filter((t) => t.kind === 'champion' && t.division !== 'BMF');
  const divs = [...new Set(champs.map((t) => t.divisionName))];
  const interim = f.titleReigns.filter((t) => t.kind === 'interim');
  const bmf = f.titleReigns.filter((t) => t.division === 'BMF');
  // conta divisões (não reinados): "3 vezes" daria a impressão de 3 categorias diferentes
  const per = divs.map((d) => ({ d, n: champs.filter((t) => t.divisionName === d).length }));
  const reignTxt = (n: number) => (n > 1 ? ` (${n} reinados)` : '');
  const summary = champs.length
    ? divs.length === 1
      ? `Campeão do ${divs[0]}${reignTxt(champs.length)}`
      : `Campeão em ${divs.length} divisões · ${per.map((x) => x.d + reignTxt(x.n)).join(' e ')}`
    : interim.length ? 'Já foi campeão interino' : 'Passou pelo cinturão BMF';
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title left">Cinturões no UFC</div>
      <p style={{ fontWeight: 800, marginBottom: 12 }}>{summary}{interim.length ? ` · ${interim.length} interino${interim.length > 1 ? 's' : ''}` : ''}{bmf.length ? ' · BMF' : ''}</p>
      <ul className="reign-list">
        {f.titleReigns.map((t) => (
          <li key={t.division + t.kind + t.start}>
            <span className={`chip ${t.kind === 'interim' ? 'chip-tag' : t.division === 'BMF' ? 'chip-red' : 'chip-gold'}`}>{t.division === 'BMF' ? 'BMF' : t.kind === 'interim' ? 'Interino' : 'Campeão'}</span>
            <b>{t.division === 'BMF' ? 'Cinturão BMF' : t.divisionName}</b>
            <span className="reign-when">
              {t.kind === 'interim'
                ? `conquistou em ${fmtDate(t.start)}`
                : `${fmtDate(t.start)} → ${t.end ? fmtDate(t.end) : 'atual'}`}
            </span>
            {t.kind === 'champion' && <span className="reign-def">{t.def} defesa{t.def === 1 ? '' : 's'}{t.end && t.endKind === 'vacated' ? ' · deixou vago' : ''}</span>}
          </li>
        ))}
      </ul>
      <p className="note" style={{ marginTop: 10 }}>
        <Link to="/cinturoes" style={{ color: 'var(--brand)' }}>Ver a linha do tempo completa →</Link>
      </p>
    </div>
  );
}
