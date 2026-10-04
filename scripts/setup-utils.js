// Utilitários exclusivos do provisionamento; config/ da aplicação pertence à Fase 1.
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
backendRequire('dotenv').config({ path: path.join(__dirname, '../.env') });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Preencha ${name} no .env local.`);
  return value;
}

async function connectDatabase() {
  return backendRequire('mysql2/promise').createConnection({
    host: required('DB_HOST'), port: Number(required('DB_PORT')),
    database: required('DB_NAME'), user: required('DB_USER'),
    password: required('DB_PASSWORD'), timezone: 'Z', multipleStatements: true,
    connectTimeout: 10000
  });
}

function fail(error) {
  // Não imprimir objetos de conexão, URLs ou senhas.
  console.error(`Falha no setup: ${error.code || error.message}`);
  process.exitCode = 1;
}

module.exports = { backendRequire, required, connectDatabase, fail };
