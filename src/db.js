const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

let db;

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex');
}

async function init() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT,
      password TEXT,
      role TEXT DEFAULT 'customer',
      credit_card TEXT,
      address TEXT
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      price REAL,
      hidden INTEGER DEFAULT 0
    );
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      author TEXT,
      body TEXT
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      total REAL,
      items TEXT,
      shipping_address TEXT
    );
    CREATE TABLE secrets (
      id INTEGER PRIMARY KEY,
      name TEXT,
      value TEXT
    );
  `);

  const users = [
    ['admin', 'admin@vulnshop.local', md5('admin123'), 'admin', '4111-1111-1111-1111', 'Rua do Servidor 1, Lisboa'],
    ['joana', 'joana@vulnshop.local', md5('joana2024'), 'customer', '5500-0000-0000-0004', 'Av. da Liberdade 100, Lisboa'],
    ['rui', 'rui@vulnshop.local', md5('password'), 'customer', '3400-0000-0000-009', 'Rua de Santa Catarina 5, Porto'],
    ['suporte', 'suporte@vulnshop.local', md5('suporte'), 'support', null, 'Escritório'],
  ];
  for (const u of users) {
    db.run('INSERT INTO users (username,email,password,role,credit_card,address) VALUES (?,?,?,?,?,?)', u);
  }

  const products = [
    ['Teclado Mecânico', 'Switches azuis, muito barulhento. Ideal para open spaces.', 89.9, 0],
    ['Rato Gamer', 'RGB em todo o lado. Até no cabo.', 49.9, 0],
    ['Monitor 27"', 'Resolução 4K, para ver os bugs em alta definição.', 299.0, 0],
    ['Caneca "It works on my machine"', 'Cerâmica, 350ml.', 12.5, 0],
    ['Cartão Oferta Interno', 'Produto interno - não listar. FLAG{hidden_rows_are_still_rows}', 0, 1],
  ];
  for (const p of products) {
    db.run('INSERT INTO products (name,description,price,hidden) VALUES (?,?,?,?)', p);
  }

  db.run("INSERT INTO comments (product_id,author,body) VALUES (1,'joana','Excelente teclado, recomendo!')");
  db.run("INSERT INTO comments (product_id,author,body) VALUES (4,'rui','A minha equipa adorou.')");

  db.run("INSERT INTO orders (user_id,total,items,shipping_address) VALUES (1, 299.0, 'Monitor 27\"', 'Rua do Servidor 1, Lisboa')");
  db.run("INSERT INTO orders (user_id,total,items,shipping_address) VALUES (2, 102.4, 'Teclado Mecânico, Caneca', 'Av. da Liberdade 100, Lisboa')");
  db.run("INSERT INTO orders (user_id,total,items,shipping_address) VALUES (3, 49.9, 'Rato Gamer', 'Rua de Santa Catarina 5, Porto')");

  db.run("INSERT INTO secrets (id,name,value) VALUES (1,'sqli_flag','FLAG{union_select_all_the_things}')");
  db.run("INSERT INTO secrets (id,name,value) VALUES (2,'payment_gateway_key','vs_live_PaymentKey_FAKE_TRAINING_123')");

  const backupDir = path.join(__dirname, '..', 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'db-backup.sqlite'), Buffer.from(db.export()));
}

function query(sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
}

function run(sql, params) {
  db.run(sql, params);
}

function lastId() {
  return query('SELECT last_insert_rowid() AS id')[0].id;
}

module.exports = { init, query, run, lastId, md5 };
