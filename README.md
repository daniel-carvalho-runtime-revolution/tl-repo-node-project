# VulnShop

Mini-loja online de demonstração, construída em Node.js + Express. Catálogo de
produtos, contas de utilizador, comentários, carrinho/encomendas, painel de
administração e algumas ferramentas internas.

## Requisitos

- Node.js 18+ **ou** Docker.

## Correr

### Docker

```bash
docker compose up --build
```

A app fica em `http://localhost:3000`.

### Node local

```bash
npm install
npm start
```

## Configuração

As definições são lidas de `.env` (ver exemplo no ficheiro). Há ainda uma porta
de acesso opcional (HTTP Basic Auth) controlada por `LAB_ACCESS_USER` /
`LAB_ACCESS_PASSWORD` — deixa ambas vazias para desativar.

## Estrutura

```
src/server.js   rotas e lógica da aplicação
src/db.js       base de dados (sql.js, em memória) + dados-semente
src/views.js    layout HTML
public/         ficheiros estáticos
files/          documentos para download
backup/         backups da configuração/base de dados
```
