function layout({ title, body, user, prefs }) {
  const theme = (prefs && prefs.theme) || 'light';
  const nav = user
    ? `<a href="/profile">${user.username}</a> <a href="/admin">Admin</a> <a href="/logout">Sair</a>`
    : `<a href="/login">Login</a> <a href="/register">Registo</a>`;
  return `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · VulnShop</title>
  <link rel="stylesheet" href="/style.css">
  <!-- TODO: remover antes de ir para produção - credenciais de teste: suporte / suporte -->
</head>
<body class="${theme}">
  <header>
    <a href="/" class="logo">🛒 VulnShop</a>
    <form action="/search"><input name="q" placeholder="Pesquisar produtos..."></form>
    <nav><a href="/download">Documentos</a> <a href="/fetch">Pré-visualizar URL</a> ${nav}</nav>
  </header>
  <main>${body}</main>
  <footer>VulnShop v1.0 · Express 4.17.1 · <a href="/redirect?to=https://example.com">Parceiros</a></footer>
</body>
</html>`;
}

module.exports = { layout };
