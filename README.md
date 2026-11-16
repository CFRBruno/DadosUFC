# DadosUFC

Site pessoal de estatísticas do UFC. Traz histórico, estilo de luta, pontos fortes e fracos de cada lutador e um **comparador** que estima a chance de vitória e o método mais provável.

- **Escopo:** todos os lutadores que lutaram no UFC desde **01/01/2026** ou que têm luta marcada (masculino e feminino, todas as categorias). Para eles, mostramos a **carreira completa dentro do UFC**. Lutas fora do UFC não entram.
- **Fontes:** [UFCStats](http://ufcstats.com), a base oficial de estatísticas do UFC (todas as lutas desde 1993, round a round). A ESPN fornece as fotos, a bandeira do país e o calendário de próximos eventos. O Wikimedia Commons é a fonte reserva de fotos, com licença livre.
- **Stack:** React 19 + Vite + TypeScript. É um site estático com PWA, então dá para instalar no Android. Hospedagem gratuita no Firebase.

## Páginas

| Rota | O que tem |
|---|---|
| `/` | Próximo evento (com botão "Analisar" em cada luta), último evento e melhor Elo por categoria |
| `/lutadores` | Busca, filtros (gênero, categoria, luta marcada) e ordenação (nome, Elo, vitórias, mais recente) |
| `/lutador/:slug` | Bio, estilo de luta, pontos fortes e fracos, estatísticas com percentil na categoria, métodos de vitória e derrota por round, alvos e posições dos golpes, gráfico do Elo e histórico completo no UFC |
| `/lutador/:slug/luta/:id` | Estatísticas da luta, total e round a round |
| `/comparar?a=…&b=…` | Previsão (% de vitória e 6 resultados possíveis), fatores que mais pesam, por que cada um pode vencer, como a luta deve se desenrolar, números lado a lado, últimas 5 lutas e adversários em comum |
| `/ranking` | Ranking por qualquer estatística física, de cartel ou de desempenho, por categoria ou peso absoluto (com filtro de gênero e mínimo de lutas) |
| `/cinturoes` | **Linha do tempo** de cada cinturão (12 categorias + BMF): visão geral dos reinados e modo história com scroll, com manchetes, scorecards, campeão com defesas e dias, interinos, vacâncias com motivo e recordes que são quebrados ao vivo. Também a lista de todas as disputas desde 1993 |
| `/eventos`, `/evento/:id` | Linha do tempo de todos os eventos desde 2026, em ordem cronológica, com o card aberto ao clicar |
| `/modelo` | Como a previsão funciona e quanto ela acerta |

## Como a previsão funciona

1. **Retrato pré-luta:** todas as ~9.000 lutas do UFC são processadas em ordem cronológica. Antes de cada luta, cada lutador ganha um retrato com cerca de 140 medidas: ratings (Elo e Glicko), nível dos adversários, estatísticas da carreira, das lutas mais recentes e ajustadas por quem enfrentou, idade, envergadura, tempo parado e momento.
2. **Estatísticas suavizadas:** com poucas lutas, as taxas são "puxadas" para a média da categoria.
3. **Regressão logística regularizada:** aprende quanto cada diferença entre os dois lutadores pesa no resultado, usando as lutas desde 2005 e sempre os números que cada um tinha *antes* da luta.
4. **Três leituras em lutas marcadas:** o comparador mostra estatísticas, mercado (probabilidade implícita no consenso do mercado de apostas, sem a margem da casa) e a combinada. O site mostra a probabilidade, nunca as cotações. Lutas hipotéticas e eventos ainda sem linha usam apenas as estatísticas.
5. **Método:** cruza como o favorito costuma vencer com como o adversário costuma perder, partindo da média da categoria (lutas de 5 rounds têm menos decisões).

**Avaliação (sempre "para a frente": para prever um ano, o modelo só conhece os anos anteriores):**

| Modo | Acerto do vencedor |
|---|---|
| Lutas marcadas, estatísticas + mercado (2021 em diante) | ~68% |
| Só estatísticas (2015 em diante) | ~62% |
| Só rating Elo | ~56% |

Os números são recalculados a cada atualização e aparecem em `/modelo`.

### Ranking oficial, forma recente e cinturões

- **Ranking oficial:** desde 20/06/2026 o UFC usa o *Meta UFC Rankings* (modelo baseado em Elo, campeão + 15 por categoria). Como o ufc.com bloqueia acesso automatizado, o pipeline lê a tabela mantida na Wikipédia (`UFC_rankings`), que cita o ufc.com a cada atualização semanal. A data da divulgação fica em `meta.json`. O ranking só cobre quem está no site (lutou em 2026 ou tem luta marcada).
- **Forma recente:** nota de 0 a 100 com as últimas 5 lutas (peso 0,75 por luta mais antiga), usando "resultado − esperado pelo Elo" e um pequeno ajuste por finalização/nocaute.
- **Cinturões:** passagens por cinturões calculadas a partir da linha do tempo (inclui interino e BMF, que não contam como "ex-campeão").
- **Posição nas estatísticas:** cada estatística mostra a colocação na categoria (ou entre todos do gênero quando a categoria tem menos de 15 lutadores elegíveis).

### Previsão pré-luta e scorecards

- **Previsão pré-luta:** cada luta desde 2015 mostra o que o modelo previa *antes* dela (vencedor, método e resultado completo), calculado só com lutas anteriores. Não é a previsão do modelo final, que já "viu" a luta.
- **Scorecards:** a ESPN publica o total de pontos de cada jurado nas decisões (ex.: 29-28), não a pontuação round a round. O pipeline guarda o que coleta em `data/scorecards/archive.json` (até 260 lutas por execução, das mais recentes às mais antigas) e o workflow grava o arquivo de volta no repositório.

### Previsões do card, placar do modelo e imagem de compartilhamento

- **Previsões do card:** a página de cada evento futuro mostra, para cada luta, as três leituras (estatísticas, mercado e combinada), o resultado mais provável e um botão para a análise completa. O cálculo é feito no navegador, com os mesmos dados do comparador.
- **Placar do modelo:** cada luta já realizada mostra se o modelo acertou o vencedor (previsão feita antes da luta) e a página `/modelo` traz o placar por evento e o acumulado do ano.
- **Imagem de compartilhamento:** no comparador, "Copiar imagem" copia um PNG da previsão para a área de transferência (ou baixa o arquivo, se o navegador não permitir). Como o CDN da ESPN não permite desenhar suas fotos num `<canvas>`, o pipeline guarda cópias pequenas em `public/data/photos/` (cache em `data/raw/photos`); elas servem só para essa imagem e têm direitos autorais da ESPN (uso pessoal).

- **Zebras e favoritos** (`/ranking/zebras`): ranking das lutas desde 2015 pela chance pré-luta do vencedor: as maiores zebras (vencedor com a menor chance) e os favoritos que venceram, em peso absoluto ou por categoria, com filtro de período e de disputas de cinturão. Os dados saem de `public/data/upsets.json`.

### Linhas de mercado

A ESPN só publica as linhas perto da data da luta e depois as retira. Por isso, cada execução do pipeline guarda o que encontrar em `data/odds/archive.json`, e o GitHub Actions grava esse arquivo de volta no repositório (commit automático "Atualiza arquivo de linhas de mercado"). Se você trabalha no repositório localmente, faça `git pull` antes de enviar alterações.

## Rodando no seu computador

Requer Node.js 22+.

```bash
npm install
```

```bash
npm run data
```

```bash
npm run dev
```

- `npm run data` baixa os dados e gera `public/data/` (leva ~15 s). `npm run data:offline` reaproveita os arquivos já baixados em `data/raw/`.
- `npm run build` gera o site final em `dist/`.

### Lutas futuras cadastradas à mão

O pipeline busca os próximos cards no UFCStats e, se não conseguir, na ESPN. Se precisar adiantar uma luta que nenhuma das duas trouxe, edite `data/manual/upcoming.json`: os lutadores são encontrados pelo nome, e as lutas que já vieram de outra fonte são ignoradas.

## Publicando no Firebase (grátis)

O plano gratuito (Spark) do Firebase Hosting é mais que suficiente: 10 GB de armazenamento e 360 MB/dia de transferência. Cada versão do site tem ~10 MB.

1. Crie um projeto em <https://console.firebase.google.com> e ative o **Hosting**.
2. Coloque o ID do projeto em `.firebaserc`.
3. **Publicação manual:**

   ```bash
   npm install -g firebase-tools
   ```

   ```bash
   firebase login
   ```

   ```bash
   npm run data && npm run build && firebase deploy --only hosting
   ```

4. **Publicação automática (recomendado):** o workflow `.github/workflows/atualizar-e-publicar.yml` roda **todo dia** às 06:17 (Brasília): baixa os dados novos, gera o site e publica.
   - Em *Project settings → Service accounts* do Firebase, gere uma chave JSON (ou rode `firebase init hosting:github`, que cria tudo sozinho).
   - No GitHub, em *Settings → Secrets and variables → Actions*:
     - Secret `FIREBASE_SERVICE_ACCOUNT`: o conteúdo do JSON.
     - Variable `FIREBASE_PROJECT_ID`: o ID do projeto.
   - Sem esse segredo, o workflow só valida o build.
5. Em *Hosting → Release storage settings*, limite a retenção a ~5 versões para não acumular deploys diários.

## Android

O site já é um **PWA**. No Chrome do Android, abra o endereço e use *Adicionar à tela inicial*. Ele abre em tela cheia, como um app, e funciona offline com os dados já visitados. Se um dia você quiser um APK, o mesmo código pode ser empacotado com o [Capacitor](https://capacitorjs.com) sem reescrever nada.

## Estrutura

```
scripts/pipeline/   coleta e processamento (Node + TypeScript)
  fetch.ts          download dos CSVs e dos próximos eventos (UFCStats)
  espn.ts           calendário, fotos e países (ESPN)
  photos.ts         fotos com licença livre (Wikidata/Wikimedia Commons)
  load.ts           normalização, desambiguação de homônimos
  build.ts          médias por categoria, Elo e estados de carreira
  features.ts       retrato pré-luta de cada lutador (variáveis do modelo)
  odds.ts           linhas de mercado da ESPN (insumo interno do modelo)
  train.ts          treino e avaliação ano a ano do modelo
  insights.ts       taxas, percentis, estilo, pontos fortes e fracos
  index.ts          orquestra e grava public/data/*.json
src/shared/         código usado pelo pipeline E pelo site (modelo, tipos, traduções)
src/lib/            dados, formatação e a análise de confronto (compare.ts)
src/components/     UI (gráficos, cartões, comparador)
src/pages/          páginas
data/manual/        dados curados à mão:
  upcoming.json       lutas futuras (quando nenhuma fonte trouxer)
  title-notes.json    vacâncias, promoções, motivos dos interinos e histórico do BMF (fonte: Wikipedia)
  photos.json         fotos manuais (nome → URL), com prioridade sobre ESPN/Wikimedia
data/odds/          arquivo histórico das linhas de mercado (atualizado pelo pipeline)
```

### Linha do tempo dos cinturões

As lutas vêm da base. Os motivos de vacância e de interinos, as promoções sem luta e as lutas do BMF ficam em `data/manual/title-notes.json`. Quando surgir uma nova vacância, um novo interino ou uma nova luta valendo o BMF, acrescente uma entrada nesse arquivo. Quem estiver sem foto na linha do tempo aparece em `data/raw/sem-foto-cinturoes.txt`; para completar, cadastre a foto em `data/manual/photos.json`.

## Limitações conhecidas

- Fotos: vêm da ESPN, por uma API pública mas não oficial, e são protegidas por direitos autorais. Servem para uso pessoal; não publique o site. Quem não tem foto aparece com as iniciais. O UFC.com bloqueia acesso automatizado e não é usado.
- Estreantes e lutadores com poucas lutas no UFC têm previsões menos confiáveis.
- A parte estatística do modelo não sabe de lesões, corte de peso ou troca de equipe; o sinal de mercado cobre parte disso, mas só existe perto da luta.
