require('./env');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const multer = require('multer');
const serveIndex = require('serve-index');
const serialize = require('node-serialize');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { layout } = require('./views');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Porta de acesso ao laboratório (não faz parte do exercício).
// Protege a instância online com basic auth para não ficar exposta à internet.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const user = process.env.LAB_ACCESS_USER;
  const pass = process.env.LAB_ACCESS_PASSWORD;
  if (!user || !pass) return next();
  const ip = req.socket.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  if (req.headers.authorization === expected) return next();
  res.set('WWW-Authenticate', 'Basic realm="VulnShop Lab"').status(401).send('Acesso ao laboratório restrito.');
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.set('Access-Control-Allow-Origin', origin || '*');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('X-Server', `VulnShop/1.0 Node/${process.version} (${process.platform})`);
  next();
});

app.use(express.static(path.join(ROOT, 'public'), { dotfiles: 'allow' }));
app.use('/backup', express.static(path.join(ROOT, 'backup')), serveIndex(path.join(ROOT, 'backup'), { icons: true }));

// --------------------------------------------------------------------------- auth
function authenticate(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  req.user = null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded && decoded.header && String(decoded.header.alg).toLowerCase() === 'none') {
      req.user = decoded.payload;
    }
  }
  next();
}
app.use(authenticate);

app.use((req, res, next) => {
  if (req.cookies.prefs) {
    try {
      const raw = Buffer.from(req.cookies.prefs, 'base64').toString();
      req.prefs = serialize.unserialize(raw);
    } catch (e) {
      req.prefs = {};
    }
  } else {
    req.prefs = {};
  }
  next();
});

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function isAdmin(user) {
  return user && (user.role === 'admin' || user.isAdmin);
}

function render(req, res, title, body) {
  res.send(layout({ title, body, user: req.user, prefs: req.prefs }));
}

// --------------------------------------------------------------------------- páginas
app.get('/', (req, res) => {
  const products = db.query('SELECT * FROM products WHERE hidden = 0');
  const cards = products
    .map(
      (p) => `<div class="card"><h3><a href="/product/${p.id}">${p.name}</a></h3>
      <p>${p.description}</p><strong>${p.price.toFixed(2)} €</strong></div>`
    )
    .join('');
  render(req, res, 'Loja', `<h1>Produtos</h1><div class="grid">${cards}</div>`);
});

app.get('/search', (req, res) => {
  const q = req.query.q || '';
  const sql = `SELECT id, name, description, price FROM products WHERE hidden = 0 AND name LIKE '%${q}%'`;
  let results;
  try {
    results = db.query(sql);
  } catch (e) {
    return render(req, res, 'Erro', `<h1>Erro na pesquisa</h1><pre>${e.message}\n\nQuery: ${sql}</pre>`);
  }
  const list = results.map((p) => `<li><a href="/product/${p.id}">${p.name}</a> — ${p.description} (${p.price} €)</li>`).join('');
  render(req, res, 'Pesquisa', `<h1>Resultados para: ${q}</h1><ul>${list || '<li>Sem resultados</li>'}</ul>`);
});

app.get('/product/:id', (req, res) => {
  const p = db.query(`SELECT * FROM products WHERE id = ${req.params.id}`)[0];
  if (!p) return res.status(404).send('Produto não encontrado');
  const comments = db.query(`SELECT * FROM comments WHERE product_id = ${p.id}`);
  const cs = comments.map((c) => `<div class="comment"><b>${c.author}</b>: ${c.body}</div>`).join('');
  render(
    req,
    res,
    p.name,
    `<h1>${p.name}</h1><p>${p.description}</p><p><strong>${p.price} €</strong></p>
     <h2>Comentários</h2>${cs || '<p>Ainda sem comentários.</p>'}
     <form method="post" action="/product/${p.id}/comment">
       <textarea name="body" placeholder="Escreve um comentário (HTML permitido!)"></textarea>
       <button>Comentar</button>
     </form>`
  );
});

app.post('/product/:id/comment', (req, res) => {
  const author = req.user ? req.user.username : 'anónimo';
  db.run('INSERT INTO comments (product_id, author, body) VALUES (?,?,?)', [req.params.id, author, req.body.body]);
  res.redirect(`/product/${req.params.id}`);
});

// --------------------------------------------------------------------------- login / registo
app.get('/login', (req, res) => {
  const next = req.query.next || '/';
  render(
    req,
    res,
    'Login',
    `<h1>Login</h1>
     <form method="post" action="/login?next=${encodeURIComponent(next)}">
       <input name="username" placeholder="Utilizador">
       <input name="password" type="password" placeholder="Password">
       <button>Entrar</button>
     </form>
     <p><a href="/register">Criar conta</a> · <a href="/forgot">Esqueci-me da password</a></p>`
  );
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const exists = db.query(`SELECT id FROM users WHERE username = '${username}'`);
  if (!exists.length) {
    return render(req, res, 'Login', `<p class="error">O utilizador "${username}" não existe.</p><a href="/login">Voltar</a>`);
  }
  const sql = `SELECT * FROM users WHERE username = '${username}' AND password = '${db.md5(password)}'`;
  const user = db.query(sql)[0];
  if (!user) {
    return render(req, res, 'Login', `<p class="error">Password errada para "${username}".</p><a href="/login">Voltar</a>`);
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
  res.cookie('token', token);
  res.cookie('prefs', Buffer.from(serialize.serialize({ theme: 'light', lang: 'pt' })).toString('base64'));
  res.redirect(req.query.next || '/');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

app.get('/register', (req, res) => {
  render(
    req,
    res,
    'Registo',
    `<h1>Criar conta</h1>
     <form method="post" action="/register">
       <input name="username" placeholder="Utilizador">
       <input name="email" placeholder="Email">
       <input name="password" type="password" placeholder="Password">
       <button>Registar</button>
     </form>`
  );
});

const EMAIL_RE = /^([a-zA-Z0-9]+)+@([a-zA-Z0-9]+\.)+[a-zA-Z]{2,}$/;

app.post('/register', (req, res) => {
  const data = Object.assign({ role: 'customer' }, req.body);
  if (!EMAIL_RE.test(data.email || '')) {
    return render(req, res, 'Registo', '<p class="error">Email inválido.</p><a href="/register">Voltar</a>');
  }
  try {
    db.run('INSERT INTO users (username,email,password,role) VALUES (?,?,?,?)', [
      data.username,
      data.email,
      db.md5(data.password),
      data.role,
    ]);
  } catch (e) {
    return render(req, res, 'Registo', `<p class="error">${e.message}</p>`);
  }
  res.redirect('/login');
});

app.get('/forgot', (req, res) => {
  render(
    req,
    res,
    'Recuperar password',
    `<h1>Recuperar password</h1>
     <form method="post" action="/forgot"><input name="email" placeholder="Email"><button>Enviar</button></form>`
  );
});

app.post('/forgot', (req, res) => {
  const user = db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`)[0];
  if (!user) return render(req, res, 'Recuperar', '<p class="error">Email não registado.</p>');
  const token = db.md5(user.email);
  console.log(`[mail] reset link para ${user.email}: /reset?email=${user.email}&token=${token}`);
  render(req, res, 'Recuperar', '<p>Se o email existir, foi enviado um link de recuperação.</p>');
});

app.get('/reset', (req, res) => {
  render(
    req,
    res,
    'Nova password',
    `<h1>Nova password</h1>
     <form method="post" action="/reset">
       <input type="hidden" name="email" value="${req.query.email}">
       <input type="hidden" name="token" value="${req.query.token}">
       <input name="password" type="password" placeholder="Nova password"><button>Guardar</button>
     </form>`
  );
});

app.post('/reset', (req, res) => {
  const { email, token, password } = req.body;
  if (db.md5(email) !== token) return res.status(403).send('Token inválido');
  db.run('UPDATE users SET password = ? WHERE email = ?', [db.md5(password), email]);
  res.redirect('/login');
});

// --------------------------------------------------------------------------- perfil
app.get('/profile', requireLogin, (req, res) => {
  const u = db.query(`SELECT * FROM users WHERE id = ${req.user.id}`)[0] || {};
  render(
    req,
    res,
    'Perfil',
    `<h1>Olá ${u.username}</h1>
     <p>Email: ${u.email}<br>Morada: ${u.address || '-'}</p>
     <p><a href="/api/users/${u.id}">Os meus dados (API)</a> · <a href="/api/orders?user_id=${u.id}">As minhas encomendas</a></p>
     <h2>Preferências</h2>
     <form id="settings"><input name="theme" placeholder="light/dark"><button>Guardar</button></form>
     <script>
       document.getElementById('settings').onsubmit = async (e) => {
         e.preventDefault();
         await fetch('/api/profile/settings', {method:'POST', headers:{'Content-Type':'application/json'},
           body: JSON.stringify({theme: e.target.theme.value})});
         alert('Guardado');
       };
     </script>
     <h2>Avatar</h2>
     <form method="post" action="/upload" enctype="multipart/form-data">
       <input type="file" name="file"><button>Enviar</button>
     </form>`
  );
});

const userSettings = {};
app.post('/api/profile/settings', requireLogin, (req, res) => {
  userSettings[req.user.id] = userSettings[req.user.id] || {};
  _.merge(userSettings[req.user.id], req.body);
  res.json({ ok: true, settings: userSettings[req.user.id] });
});

// --------------------------------------------------------------------------- API
app.get('/api/users/:id', requireLogin, (req, res) => {
  const u = db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)[0];
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u);
});

app.get('/api/users', (req, res) => {
  res.json(db.query('SELECT id, username, email, role FROM users'));
});

app.get('/api/orders', requireLogin, (req, res) => {
  const uid = req.query.user_id || req.user.id;
  res.json(db.query(`SELECT * FROM orders WHERE user_id = ${uid}`));
});

app.post('/api/calc', (req, res) => {
  try {
    const result = eval(req.body.expression);
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --------------------------------------------------------------------------- ficheiros
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(ROOT, 'public', 'uploads'),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('Sem ficheiro');
  render(req, res, 'Upload', `<p>Ficheiro guardado em <a href="/uploads/${req.file.originalname}">/uploads/${req.file.originalname}</a></p>`);
});

app.get('/download', (req, res) => {
  const file = req.query.file;
  if (!file) {
    const files = fs.readdirSync(path.join(ROOT, 'files'));
    return render(req, res, 'Downloads', `<h1>Documentos</h1><ul>${files.map((f) => `<li><a href="/download?file=${f}">${f}</a></li>`).join('')}</ul>`);
  }
  const p = path.join(ROOT, 'files', file);
  fs.readFile(p, (err, data) => {
    if (err) return res.status(404).send(`Não encontrado: ${p}`);
    res.type('text/plain').send(data);
  });
});

// --------------------------------------------------------------------------- utilitários
app.get('/fetch', (req, res) => {
  const url = req.query.url;
  if (!url) {
    return render(
      req,
      res,
      'Pré-visualizar URL',
      `<h1>Pré-visualizar imagem por URL</h1>
       <form><input name="url" placeholder="https://exemplo.com/imagem.png"><button>Ver</button></form>`
    );
  }
  fetch(url)
    .then((r) => r.text())
    .then((t) => res.type('text/plain').send(t))
    .catch((e) => res.status(500).send(e.stack));
});

app.get('/redirect', (req, res) => {
  res.redirect(req.query.to || '/');
});

app.get('/internal/metadata', (req, res) => {
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).send('Apenas acessível internamente.');
  }
  res.json({
    instance: 'vulnshop-prod-01',
    iam_role: 'vulnshop-s3-full-access',
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
    flag: 'FLAG{ssrf_reaches_the_inside}',
  });
});

// --------------------------------------------------------------------------- admin
app.get('/admin', requireLogin, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).send('Só administradores.');
  const users = db.query('SELECT id, username, email, role, credit_card FROM users');
  const rows = users.map((u) => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.email}</td><td>${u.role}</td><td>${u.credit_card || ''}</td></tr>`).join('');
  render(
    req,
    res,
    'Admin',
    `<h1>Painel de administração</h1>
     <p class="flag">FLAG{welcome_to_the_admin_panel}</p>
     <table><tr><th>ID</th><th>User</th><th>Email</th><th>Role</th><th>Cartão</th></tr>${rows}</table>
     <h2>Diagnóstico de rede</h2>
     <form action="/admin/tools/ping"><input name="host" placeholder="8.8.8.8"><button>Ping</button></form>`
  );
});

app.get('/admin/tools/ping', requireLogin, (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).send('Só administradores.');
  exec(`ping -c 2 ${req.query.host}`, { timeout: 10000 }, (err, stdout, stderr) => {
    res.type('text/plain').send(stdout + stderr);
  });
});

app.get('/debug', (req, res) => {
  res.json({ env: process.env, cwd: process.cwd(), uid: process.getuid && process.getuid(), versions: process.versions });
});

// --------------------------------------------------------------------------- erros
app.use((err, req, res, next) => {
  res.status(500).type('text/plain').send(err.stack);
});

db.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`VulnShop a correr em http://0.0.0.0:${PORT}`));
});
