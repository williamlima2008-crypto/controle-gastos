# Controle de Gastos (PWA)

App de controle financeiro em HTML/CSS/JS puro, sem dependências e sem servidor próprio.
Os dados ficam no aparelho (IndexedDB), funciona offline e pode sincronizar pelo Google Drive
do próprio usuário (opcional). Publicar e instalar: veja **GUIA-PUBLICAR.md**.

## Como testar agora
O PWA precisa ser servido por `http://localhost` ou `https://`.

```
cd controle-gastos
python -m http.server 8000
# abra http://localhost:8000
```

Em **Ajustes → Carregar exemplo** você vê tudo preenchido.

## O que está pronto
- Lançamentos de receitas e despesas, com repetição mensal; categorias e plano de contas
- Contas a pagar e a receber com vencimento e alertas (banner e notificação ao abrir)
- Saldo e fluxo de caixa com projeção de 30/60/90 dias
- Painel gráfico: mês x mês anterior, dois meses à escolha ou intervalo de datas
- **Relatórios:** DRE (mês, ano ou intervalo; realizado ou previsto) e extrato, para impressora ou
  "Salvar como PDF" (sem Excel)
- **Sincronização** celular <-> computador pelo Google Drive do usuário (pasta oculta do app),
  com mesclagem por registro e exclusões propagadas
- **Senha opcional** para abrir o app (hash PBKDF2-SHA256 com sal)
- **Foto ou logo do cliente** + nome no topo de todas as telas (menu lateral no desktop, barra fixa no celular),
  nos relatórios impressos e na tela de senha; formato quadrado ou redondo (Ajustes)
- Backup em JSON; instalável no celular e no computador (atalhos: Novo lançamento, Contas, Painel)
- Navegação SPA, layout responsivo, tema claro/escuro automático

## Estrutura
```
index.html  manifest.webmanifest  sw.js  GUIA-PUBLICAR.md
css/style.css
js/config.js     ID do cliente Google (preencher ao publicar)
js/util.js       dinheiro (centavos), datas, helpers
js/db.js         IndexedDB, categorias padrão, backup, exclusões (tombstones)
js/sync.js       mesclagem + Google Identity + Drive (appDataFolder)
js/lock.js       senha opcional
js/charts.js     gráficos em SVG
js/views.js      lançamentos, contas, fluxo, categorias, ajustes, formulários
js/painel.js     painel com seletor de período
js/relatorios.js DRE e extrato com impressão/PDF
js/app.js        roteador, navegação, alertas, service worker
```

## Ainda não feito
- **Leitor de nota fiscal** (QR code/código de barras), a pedido só se o cliente quiser
- Empacotamento .exe (Electron/Tauri): o app já instala como programa pelo Chrome/Edge;
  o .exe não é recomendado porque o login do Google costuma ser bloqueado em navegadores embutidos
