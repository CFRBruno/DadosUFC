import { ErrorBox, Loading } from '../components/ui';
import { useMeta, useModel } from '../lib/data';
import { fmtDate, fmtPct } from '../lib/format';
import { FEATURES } from '../shared/model';

export default function About() {
  const { data: model, error } = useModel();
  const meta = useMeta().data;
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!model) return <Loading />;
  const m = model.metrics;
  const weights = FEATURES.map((f, i) => ({ label: f.label, w: model.coef[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const maxW = Math.max(...weights.map((x) => Math.abs(x.w)));
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Transparência</span>
        <h1 style={{ marginTop: 8 }}>Como a <span className="accent">previsão</span> funciona</h1>
        <p>O que entra no cálculo, de onde vêm os dados e quanto o modelo acerta em lutas que ele nunca viu.</p>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{fmtPct(m.accuracy, 1)}</b><span>acerto do vencedor ({m.testN.toLocaleString('pt-BR')} lutas desde {m.testFrom.slice(0, 4)})</span></div>
        <div className="kpi"><b>{fmtPct(m.eloOnlyAccuracy, 1)}</b><span>acerto usando só o rating Elo</span></div>
        <div className="kpi"><b>{fmtPct(m.methodAccuracy, 1)}</b><span>acerto do método quando o vencedor foi acertado</span></div>
        <div className="kpi"><b>{fmtPct(m.exactAccuracy, 1)}</b><span>acerto exato (vencedor + método, entre 6 opções)</span></div>
      </div>

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
          <p><b>1. Rating Elo:</b> todas as {meta?.fightCount.toLocaleString('pt-BR') ?? ''} lutas do UFC são processadas em ordem. Cada lutador começa com 1500; vencer sobe o rating (mais se o adversário for forte ou se for por nocaute/finalização).</p>
          <p><b>2. Estatísticas suavizadas:</b> taxas como golpes por minuto e defesa de quedas são "puxadas" para a média da categoria quando há poucas lutas, para que uma luta só não gere números extremos.</p>
          <p><b>3. Regressão logística:</b> o modelo aprende quanto cada diferença entre os lutadores (Elo, idade, volume, defesa, quedas…) pesa no resultado, usando {m.trainN.toLocaleString('pt-BR')} lutas de 2008 a 2024, com as estatísticas que cada lutador tinha <i>antes</i> de cada luta.</p>
          <p><b>4. Método:</b> combina como cada um costuma vencer com como o outro costuma perder, partindo da média da categoria (lutas de 5 rounds têm menos decisões).</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title left">Peso de cada fator</div>
        <p className="note" style={{ marginBottom: 14 }}>Impacto de uma diferença "típica" entre dois lutadores em cada fator (coeficiente padronizado). Barras para a direita: ter mais desse fator ajuda a vencer; para a esquerda: atrapalha.</p>
        {weights.map((x) => (
          <div className="factor-top" key={x.label} style={{ padding: '6px 0', gridTemplateColumns: '1fr 220px' }}>
            <span style={{ fontSize: 13.5 }}>{x.label}</span>
            <div className="diverge" title={x.w.toFixed(3)}>
              <i style={x.w >= 0
                ? { left: '50%', width: `${(Math.abs(x.w) / maxW) * 50}%`, background: 'var(--win)' }
                : { right: '50%', width: `${(Math.abs(x.w) / maxW) * 50}%`, background: 'var(--loss)' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="panel prose" style={{ marginTop: 16 }}>
        <div className="panel-title left">Limitações</div>
        <ul>
          <li>Estreantes e lutadores com poucas lutas no UFC têm previsões menos confiáveis (o UFC não registra lutas de outras organizações).</li>
          <li>O modelo não sabe de lesões, troca de equipe, corte de peso, luta em casa ou mudança de categoria.</li>
          <li>Casas de apostas acertam cerca de 65–70% dos vencedores; um modelo só com estatísticas públicas fica naturalmente um pouco abaixo disso.</li>
        </ul>
      </div>
    </div>
  );
}
