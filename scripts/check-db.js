const assert = require('node:assert/strict');
const { connectDatabase, backendRequire, fail } = require('./setup-utils');

(async () => {
  const db = await connectDatabase();
  try {
    const [version] = await db.query('SELECT VERSION() AS version');
    assert.match(version[0].version, /^8\./);
    for (const [table, expected] of Object.entries({ empresa: 2, unidade: 3, setor: 4, ambiente: 4, dispositivo: 4, usuario: 4, leitura_telemetria: 9, alerta: 2 })) {
      const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      assert.equal(total, expected, `Quantidade inesperada em ${table}; este teste exige o seed inicial.`);
      console.log(`${table}: ${total} registros`);
    }
    const [users] = await db.query('SELECT senha_hash FROM usuario');
    for (const user of users) assert.equal(await backendRequire('bcryptjs').compare('demo123', user.senha_hash), true);
    const [indexes] = await db.query("SHOW INDEX FROM leitura_telemetria WHERE Key_name = 'idx_amb_tempo'");
    assert.deepEqual(indexes.map(i => i.Column_name), ['ambiente_id', 'lida_em']);
    await db.beginTransaction();
    try {
      await assert.rejects(db.query("INSERT INTO unidade (empresa_id,nome) VALUES (999999,'Inválida')"), { code: 'ER_NO_REFERENCED_ROW_2' });
      await assert.rejects(db.query('UPDATE ambiente SET temp_min_ideal=40,temp_max_ideal=20 WHERE id=1'), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await assert.rejects(db.query('INSERT INTO leitura_telemetria (dispositivo_id,ambiente_id,temperatura_c,umidade_pct,lida_em) SELECT dispositivo_id,ambiente_id,temperatura_c,umidade_pct,lida_em FROM leitura_telemetria WHERE id=1'), { code: 'ER_DUP_ENTRY' });
      await db.query('UPDATE ambiente SET status=0 WHERE id=1');
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM leitura_telemetria WHERE ambiente_id=1');
      assert.equal(total, 3);
    } finally { await db.rollback(); }
    console.log(`MySQL ${version[0].version}: seed, bcrypt, índice, FK, CHECK, unicidade e preservação de histórico aprovados.`);
  } finally { await db.end(); }
})().catch(fail);
