import { Link } from 'react-router-dom';
import { ErrorBox, Loading } from '../components/ui';
import { useEvents, useMeta, useModel } from '../lib/data';
import { eventScore } from '../lib/hits';
import { fmtDate, fmtPct } from '../lib/format';
import { FACTOR_LABEL } from '../shared/model2';

export default function About() {
  const { data: model, error } = useModel();
  const meta = useMeta().data;
  const events = useEvents().data;
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!model) return <Loading />;
  const m = model.metrics;
  const weights = model.v2.groupWeights.map((g) => ({ label: FACTOR_LABEL[g.key] ?? g.key, w: g.w }));
  const maxW = Math.max(...weights.map((x) => x.w), 0.001);
  const nVars = model.v2.coef.length;
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Transparência</span>
        <h1 style={{ marginTop: 8 }}>Como a <span className="accent">previsão</span> funciona</h1>
        <p>O que entra no cálculo, de onde vêm os dados e quanto o modelo acerta em lutas que ele nunca viu.</p>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{fmtPct(m.accuracy, 1)}</b><span>{m.usesMarket ? 'acerto do vencedor em lutas marcadas — estatísticas + mercado' : 'acerto do vencedor'} ({m.testN.toLocaleString('pt-BR')} lutas desde {m.testFrom.slice(0, 4)})</span></div>
        <div className="kpi"><b>{fmtPct(m.stats.accuracy, 1)}</b><span>acerto só com estatísticas ({m.stats.n.toLocaleString('pt-BR')} lutas desde {m.stats.from.slice(0, 4)})</span></div>
        <div className="kpi"><b>{fmtPct(m.methodAccuracy, 1)}</b><span>acerto do método quando o vencedor foi acertado</span></div>
        <div className="kpi"><b>{fmtPct(m.exactAccuracy, 1)}</b><span>acerto exato (vencedor + método, entre 6 opções)</span></div>
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        Todos os números são medidos "para a frente": para prever as lutas de um ano, o modelo só conhece as lutas dos anos anteriores.
        Desde {m.recent.from.slice(0, 4)}: {fmtPct(m.recent.accuracy, 1)} em {m.recent.n.toLocaleString('pt-BR')} lutas (só estatísticas: {fmtPct(m.recent.statsAccuracy, 1)}; só rating Elo: {fmtPct(m.eloOnlyAccuracy, 1)}).
      </p>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel prose">
          <div className="panel-title left">Dados</div>
          <p><b>Fonte:</b> UFCStats, a base oficial de estatísticas do UFC, com todas as lutas desde 1993 e estatísticas round a round. Os dados são atualizados automaticamente.</p>
          <p><b>Somente UFC:</b> cartel, taxas e histórico consideram apenas lutas dentro do UFC.</p>
          <p><b>Lutadores no site:</b> quem lutou no UFC a partir de {meta ? fmtDate(meta.scopeFrom) : 'jan 2016'} ou tem luta marcada ({meta?.fighterCount.toLocaleString('pt-BR') ?? '—'} atletas, {meta?.activeCount ?? '—'} deles ativos em 2026). Para eles, mostramos a carreira completa no UFC.</p>
          {meta && <p><b>Última atualização:</b> {fmtDate(meta.generatedAt.slice(0, 10))} · último evento na base: {meta.latestEvent?.name} ({fmtDate(meta.latestEvent?.date)}).</p>}
        </div>
        <div className="panel prose">
          <div className="panel-title left">Modelo</div>
          <p><b>1. Retrato pré-luta:</b> todas as {meta?.fightCount.toLocaleString('pt-BR') ?? ''} lutas do UFC são processadas em ordem. Antes de cada luta, cada lutador ganha um retrato com {nVars} medidas: vários ratings (Elo e Glicko, que também medem a incerteza), nível dos adversários, estatísticas da carreira, das lutas mais recentes e ajustadas por quem enfrentou, idade, envergadura, tempo parado e momento.</p>
          <p><b>2. Estatísticas suavizadas:</b> com poucas lutas, as taxas são "puxadas" para a média da categoria, para que uma luta só não gere números extremos. Para quem tem pouca ou nenhuma luta no UFC, o modelo também usa o <b>cartel em outras organizações</b> (vitórias, derrotas e finais antes do fim, via ESPN), com peso que diminui conforme o lutador acumula lutas no UFC.</p>
          <p><b>3. Regressão logística regularizada:</b> o modelo aprende quanto cada diferença entre os dois pesa no resultado, usando {m.trainN.toLocaleString('pt-BR')} lutas desde 2005 e sempre os números que cada um tinha <i>antes</i> da luta.</p>
          <p><b>4. Três leituras em lutas marcadas:</b> o comparador mostra <b>estatísticas</b> (só os números do UFC), <b>mercado</b> (a probabilidade implícita no consenso do mercado de apostas, já sem a margem da casa) e <b>combinada</b> (a previsão final, que pondera as duas). O mercado resume o que as estatísticas do UFC não enxergam (lesões, camp, carreira fora do UFC) e, quando discorda das estatísticas sobre quem é o favorito, isso aparece no texto da análise. O site mostra só essa probabilidade, nunca as cotações. Lutas hipotéticas e eventos ainda sem linha usam apenas as estatísticas.</p>
          <p><b>5. Método:</b> combina como cada um costuma vencer com como o outro costuma perder, partindo da média da categoria (lutas de 5 rounds têm menos decisões).</p>
        </div>
      </div>

      {m.byConfidence && (
        <div className="panel prose" style={{ marginTop: 16 }}>
          <div className="panel-title left">Confiança da previsão</div>
          <p>Cada previsão ganha um selo de confiança (alta, neutra ou baixa). Ele não é a chance de vitória: mede o quanto dá para confiar nos números daquela luta. Testamos o que realmente separa acertos de erros nas lutas desde 2015 e usamos só o que se mostrou útil: <b>o tamanho da vantagem do favorito</b> e <b>estatísticas e mercado concordarem</b>. Outros fatores (estreia, poucas lutas, tempo parado, incerteza do rating, dados faltando) quase não alteram o acerto, porque o modelo já os trata; eles aparecem como avisos em "ver por quê", com peso pequeno no selo.</p>
          <div className="kpis" style={{ marginTop: 10 }}>
            {m.byConfidence.map((r) => <div className="kpi" key={r.level}><b>{fmtPct(r.accuracy, 1)}</b><span>acerto com confiança {r.level} ({r.n.toLocaleString('pt-BR')} lutas)</span></div>)}
          </div>
        </div>
      )}
      {events && <Scoreboard events={events.past} />}

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title left">Peso de cada fator</div>
        <p className="note" style={{ marginBottom: 14 }}>Quanto cada grupo de variáveis costuma mover a previsão estatística, em média, nas lutas desde {m.stats.from.slice(0, 4)}. Cada grupo soma várias medidas (carreira, lutas recentes e ajuste pelo adversário).</p>
        {weights.map((x) => (
          <div className="factor-top" key={x.label} style={{ padding: '6px 0', gridTemplateColumns: '1fr 220px' }}>
            <span style={{ fontSize: 13.5 }}>{x.label}</span>
            <div className="diverge plain" title={x.w.toFixed(3)}>
              <i style={{ left: 0, width: `${(x.w / maxW) * 100}%`, background: 'var(--brand)' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="panel prose" style={{ marginTop: 16 }}>
        <div className="panel-title left">Limitações</div>
        <ul>
          <li>Estreantes e lutadores com poucas lutas no UFC têm previsões menos confiáveis (o UFC não registra lutas de outras organizações).</li>
          <li>A parte estatística não sabe de lesões, troca de equipe, corte de peso ou luta em casa — por isso o sinal de mercado ajuda tanto nas lutas marcadas.</li>
          <li>O sinal de mercado só existe perto da luta: previsões de eventos distantes e de lutas hipotéticas usam apenas estatísticas{m.marketOnly ? <> (o mercado sozinho acertou {fmtPct(m.marketOnly.accuracy, 1)} nas mesmas lutas da avaliação, as estatísticas sozinhas {fmtPct(m.statsSame.accuracy, 1)} e as duas combinadas {fmtPct(m.accuracy, 1)})</> : null}.</li>
          <li>MMA é um esporte de alta variância: mesmo a melhor previsão erra cerca de 1 em cada 3 lutas.</li>
        </ul>
      </div>
    </div>
  );
}

/** Placar do modelo: previsão feita antes de cada evento × resultado (só vencedor). */
function Scoreboard({ events }: { events: import('../shared/types').EventInfo[] }) {
  const rows = [...events].filter((e) => e.date).sort((a, b) => (a.date! < b.date! ? -1 : 1)).map((e) => ({ e, ...eventScore(e) })).filter((r) => r.n > 0);
  if (!rows.length) return null;
  let cumN = 0, cumH = 0;
  const withCum = rows.map((r) => { cumN += r.n; cumH += r.hits; return { ...r, cum: cumH / cumN }; });
  const total = { n: cumN, h: cumH };
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-title left">Placar do modelo em {withCum[0].e.date!.slice(0, 4)}</div>
      <p style={{ fontSize: 17, marginBottom: 6 }}><b>{total.h} de {total.n}</b> vencedores previstos corretamente (<b>{fmtPct(total.h / total.n, 1)}</b>)</p>
      <p className="note" style={{ marginBottom: 14 }}>
        Cada evento é avaliado com a previsão feita antes dele (modelo treinado só com lutas anteriores; lutas marcadas incluem o sinal de mercado da época). Empates e lutas sem resultado ficam de fora. Num ano, a margem de erro é grande: poucos eventos oscilam bastante em torno da média de longo prazo.
      </p>
      <div className="score-head"><span>Evento</span><span>Acertos</span><span /><span>%</span><span>Acumulado</span></div>
      <div className="score-list">
        {[...withCum].reverse().map((r) => (
          <Link to={`/evento/${r.e.id}`} className="score-row" key={r.e.id}>
            <span className="sc-name">{r.e.name}</span>
            <span className="sc-hits">{r.hits}/{r.n}</span>
            <div className="sc-bar"><i style={{ width: `${(r.hits / r.n) * 100}%` }} /></div>
            <span className="sc-pct">{fmtPct(r.hits / r.n)}</span>
            <span className="sc-cum" title="Acumulado do ano até este evento">{fmtPct(r.cum)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
