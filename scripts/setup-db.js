const fs = require('node:fs/promises');
const path = require('node:path');
const { connectDatabase, fail } = require('./setup-utils');

(async () => {
  const db = await connectDatabase();
  try {
    const [tables] = await db.query('SHOW TABLES');
    if (tables.length) throw new Error('O banco deve estar vazio. Nenhum dado foi alterado; use check:db para verificar uma instalação existente.');
    await db.query(await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8'));
    await db.beginTransaction();
    try {
      await db.query(await fs.readFile(path.join(__dirname, 'seed.sql'), 'utf8'));
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log('Schema e seed instalados. Execute npm run check:db.');
  } finally { await db.end(); }
})().catch(fail);
