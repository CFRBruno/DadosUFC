import { ErrorBox, Loading } from '../components/ui';
import { useMeta, useModel } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { FACTOR_LABEL } from '../shared/model2';

export default function About() {
  const { data: model, error } = useModel();
  const meta = useMeta().data;
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
          <p><b>Lutadores no site:</b> quem lutou no UFC a partir de {meta ? fmtDate(meta.scopeFrom) : 'jan 2026'} ou tem luta marcada ({meta?.fighterCount ?? '—'} atletas). Para eles, mostramos a carreira completa no UFC.</p>
          {meta && <p><b>Última atualização:</b> {fmtDate(meta.generatedAt.slice(0, 10))} · último evento na base: {meta.latestEvent?.name} ({fmtDate(meta.latestEvent?.date)}).</p>}
        </div>
        <div className="panel prose">
          <div className="panel-title left">Modelo</div>
          <p><b>1. Retrato pré-luta:</b> todas as {meta?.fightCount.toLocaleString('pt-BR') ?? ''} lutas do UFC são processadas em ordem. Antes de cada luta, cada lutador ganha um retrato com {nVars} medidas: vários ratings (Elo e Glicko, que também medem a incerteza), nível dos adversários, estatísticas da carreira, das lutas mais recentes e ajustadas por quem enfrentou, idade, envergadura, tempo parado e momento.</p>
          <p><b>2. Estatísticas suavizadas:</b> com poucas lutas, as taxas são "puxadas" para a média da categoria, para que uma luta só não gere números extremos.</p>
          <p><b>3. Regressão logística regularizada:</b> o modelo aprende quanto cada diferença entre os dois pesa no resultado, usando {m.trainN.toLocaleString('pt-BR')} lutas desde 2005 e sempre os números que cada um tinha <i>antes</i> da luta.</p>
          <p><b>4. Três leituras em lutas marcadas:</b> o comparador mostra <b>estatísticas</b> (só os números do UFC), <b>mercado</b> (a probabilidade implícita no consenso do mercado de apostas, já sem a margem da casa) e <b>combinada</b> (a previsão final, que pondera as duas). O mercado resume o que as estatísticas do UFC não enxergam (lesões, camp, carreira fora do UFC) e, quando discorda das estatísticas sobre quem é o favorito, isso aparece no texto da análise. O site mostra só essa probabilidade, nunca as cotações. Lutas hipotéticas e eventos ainda sem linha usam apenas as estatísticas.</p>
          <p><b>5. Método:</b> combina como cada um costuma vencer com como o outro costuma perder, partindo da média da categoria (lutas de 5 rounds têm menos decisões).</p>
        </div>
      </div>

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
