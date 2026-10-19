# Guia: publicar, instalar e ativar a sincronização

Tudo aqui é gratuito. Os nomes de menus do GitHub e do Google podem mudar um pouco com o tempo.

## 1) Publicar no GitHub Pages (celular e computador usam o mesmo link)
1. Crie uma conta em github.com e clique em **New repository**. Dê um nome (ex.: `controle-gastos`) e deixe **Public** (o GitHub Pages grátis exige repositório público; só o código fica público, os dados de cada usuário ficam no aparelho dele).
2. Na página do repositório: **Add file → Upload files**. Arraste o **conteúdo** da pasta `controle-gastos` (index.html, sw.js, manifest.webmanifest, pastas css, js e icons), não a pasta em si. Clique em **Commit changes**.
3. **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em 1 a 2 minutos o link aparece no topo da mesma página: `https://SEU-USUARIO.github.io/controle-gastos/`.

**Atualizar depois:** suba os arquivos novos de novo (mesmos nomes substituem) e troque o número em `const CACHE = 'controle-gastos-v2'` no `sw.js` (v3, v4…). Sem isso, quem já instalou pode continuar vendo a versão antiga.

## 2) Instalar
- **Android (Chrome):** abra o link → menu ⋮ → **Instalar app**.
- **iPhone (Safari):** abra o link → botão Compartilhar → **Adicionar à Tela de Início**. Instalado assim, o iPhone não apaga os dados por falta de uso (no Safari comum ele pode apagar após ~7 dias sem abrir). Mesmo assim, ative a sincronização ou faça backup.
- **Computador (Chrome ou Edge):** abra o link → ícone de instalar na barra de endereço (ou menu → **Instalar Controle de Gastos**). Vira um programa com ícone próprio, janela sem barra de navegação e atalhos (Novo lançamento, Contas, Painel). Funciona offline.

> **Por que não um .exe (Electron/Tauri)?** O login do Google (necessário para a sincronização) costuma ser bloqueado dentro de navegadores embutidos como o Electron. Instalado pelo Chrome/Edge, o app usa o login normal do Google e a sincronização funciona. Se o cliente preferir um .exe e abrir mão da sincronização no desktop, dá para empacotar depois.

## 3) Ativar a sincronização pelo Google Drive
Você faz isto **uma vez**; depois o cliente só toca em **Ajustes → Conectar Google Drive** em cada aparelho.

1. Acesse console.cloud.google.com e crie um **projeto** (ex.: "Controle de Gastos").
2. **APIs e serviços → Biblioteca** → procure **Google Drive API** → **Ativar**.
3. **Tela de consentimento OAuth** (ou "Google Auth Platform"): tipo **Externo**, nome do app, e-mail de suporte. Em *Escopos*, adicione `.../auth/drive.appdata`. Depois **publique o app** (status "Em produção"). Se ficar "Em teste", o Google faz as autorizações expirarem em 7 dias. O escopo `drive.appdata` é de baixo risco e normalmente não exige análise do Google.
4. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://SEU-USUARIO.github.io` (só o domínio, sem `/controle-gastos`). Para testar no seu PC, acrescente também `http://localhost:8000` (ou a porta que usar).
   - Deixe "URIs de redirecionamento" vazio.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
6. Abra `js/config.js`, cole entre as aspas em `googleClientId: ''`, salve e suba o arquivo de novo no GitHub. (Alternativa sem editar arquivo: colar o ID em Ajustes, no campo "modo avançado", em cada aparelho.)
7. Em cada aparelho: **Ajustes → Conectar Google Drive** e entre com a conta do Google.

**Como funciona:**
- Os dados vão para uma pasta **oculta do app** no Drive da própria conta (não aparece em "Meu Drive" e não ocupa espaço visível). Só este app tem acesso.
- A sincronização é automática alguns segundos depois de cada alteração, ao abrir o app e ao voltar a ter internet. Há também o botão **Sincronizar agora**.
- Se o mesmo lançamento for editado nos dois aparelhos antes de sincronizar, **vale a edição mais recente**. Lançamentos criados em aparelhos diferentes são todos mantidos, e exclusões também são propagadas.
- Para usar a conta de outra pessoa (cliente final), cada pessoa conecta a **própria** conta do Google nos próprios aparelhos.
- Não é tempo real: o outro aparelho recebe a mudança quando abre o app ou sincroniza.

## 4) Senha, backup e relatórios
- **Senha (opcional):** Ajustes → Senha para abrir o app. Só funciona quando o app é aberto por https (link publicado/instalado) ou localhost. É uma trava de uso, não uma criptografia dos dados. Não há recuperação: "Esqueci a senha" apaga os dados do aparelho (voltam da nuvem se a sincronização estiver ativa). A senha vale por aparelho e não sincroniza.
- **Backup:** Ajustes → Exportar backup gera um arquivo .json com tudo.
- **Relatórios (DRE e extrato):** menu Relatórios. Para PDF sem Excel: **Imprimir / PDF** → destino **Salvar como PDF** (ou escolha a impressora). O ano inteiro sai em página deitada.

## 5) Identidade do cliente (foto/logo)
- **Dentro do app:** Ajustes → *Foto ou logo da empresa*: escolher imagem (PNG, JPG, WebP ou SVG), nome e formato (quadrada ou redonda). A imagem é reduzida automaticamente e fica **neste aparelho**; vai junto no backup (exportar/importar), mas **não** sincroniza pelo Google Drive. Em cada aparelho, escolha a imagem uma vez.
- **Ícone do app instalado (tela inicial / área de trabalho):** não muda por Ajustes. Para personalizar para um cliente, substitua `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` e `icons/icon.svg` pelos arquivos dele antes de publicar, e troque o número de `CACHE` no `sw.js`. Para trocar o nome do app instalado, edite `name` e `short_name` no `manifest.webmanifest`.
