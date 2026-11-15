# DadosUFC

Site pessoal de estatísticas do UFC. Traz histórico, estilo de luta, pontos fortes e fracos de cada lutador e um **comparador** que estima a chance de vitória e o método mais provável.

- **Escopo:** todos os lutadores que lutaram no UFC desde **01/01/2026** ou que têm luta marcada (masculino e feminino, todas as categorias). Para eles, mostramos a **carreira completa dentro do UFC**. Lutas fora do UFC não entram.
- **Fonte:** [UFCStats](http://ufcstats.com), a base oficial de estatísticas do UFC (todas as lutas desde 1993, round a round).
- **Stack:** React 19 + Vite + TypeScript. É um site estático com PWA, então dá para instalar no Android. Hospedagem gratuita no Firebase.

## Páginas

| Rota | O que tem |
|---|---|
| `/` | Próximo evento (com botão "Analisar" em cada luta), último evento e melhor Elo por categoria |
| `/lutadores` | Busca, filtros (gênero, categoria, luta marcada) e ordenação (nome, Elo, vitórias, mais recente) |
| `/lutador/:slug` | Bio, estilo de luta, pontos fortes e fracos, estatísticas com percentil na categoria, métodos de vitória e derrota por round, alvos e posições dos golpes, gráfico do Elo e histórico completo no UFC |
| `/lutador/:slug/luta/:id` | Estatísticas da luta, total e round a round |
| `/comparar?a=…&b=…` | Previsão (% de vitória e 6 resultados possíveis), fatores que mais pesam, por que cada um pode vencer, como a luta deve se desenrolar, números lado a lado, últimas 5 lutas e adversários em comum |
| `/eventos`, `/evento/:id` | Próximos cards e eventos de 2026 |
| `/modelo` | Como a previsão funciona e quanto ela acerta |

## Como a previsão funciona

1. **Elo:** todas as ~9.000 lutas do UFC são processadas em ordem cronológica. Cada lutador começa com 1500 pontos, e vitórias por nocaute ou finalização valem mais.
2. **Estatísticas suavizadas:** taxas como golpes/min e defesa de quedas são "puxadas" para a média da categoria quando o lutador tem poucas lutas.
3. **Regressão logística:** treinada com ~7.000 lutas (2008–2024), usando as estatísticas que cada lutador tinha *antes* de cada luta. São 18 fatores: Elo, volume, precisão, defesa, quedas, finalizações, knockdowns, controle, idade, envergadura, experiência, forma recente, tempo parado e derrotas por KO.
4. **Método:** cruza como o favorito costuma vencer com como o adversário costuma perder, partindo da média da categoria (lutas de 5 rounds têm menos decisões).

**Backtest (lutas de 2025–2026 que o modelo não viu no treino):** 63,8% de acerto do vencedor, contra 55,9% usando só o Elo. O número é recalculado a cada atualização e aparece em `/modelo`.

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

O pipeline busca os próximos cards no UFCStats. Se precisar adiantar uma luta que ainda não está lá, edite `data/manual/upcoming.json` (os lutadores são encontrados pelo nome).

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
  fetch.ts          download dos CSVs e dos próximos eventos
  load.ts           normalização, desambiguação de homônimos
  build.ts          médias por categoria, Elo, treino e backtest do modelo
  insights.ts       taxas, percentis, estilo, pontos fortes e fracos
  index.ts          orquestra e grava public/data/*.json
src/shared/         código usado pelo pipeline E pelo site (modelo, tipos, traduções)
src/lib/            dados, formatação e a análise de confronto (compare.ts)
src/components/     UI (gráficos, cartões, comparador)
src/pages/          páginas
data/manual/        lutas futuras cadastradas à mão
```

## Limitações conhecidas

- Sem fotos dos lutadores: o UFC.com bloqueia acesso automatizado. O site usa as iniciais.
- Estreantes e lutadores com poucas lutas no UFC têm previsões menos confiáveis.
- O modelo não sabe de lesões, corte de peso, troca de equipe ou mudança de categoria.
