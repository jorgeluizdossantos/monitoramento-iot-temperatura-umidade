import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase } from '../src/db/mysql';
import { createMysqlDemoRepository } from '../src/modules/demo/mysql-demo.repository';
const env=loadEnvironment();if(env.NODE_ENV!=='test'||env.DB_TARGET!=='local')throw new Error('Exige MySQL local de teste');
const db=createDatabase(env);const suffix=randomUUID();const companies:number[]=[];
const sql=(text:string,args:unknown[]=[])=>db.withConnection(c=>c.execute(text,args));
const add=async(text:string,args:unknown[]=[])=>((await sql(text,args))[0] as ResultSetHeader).insertId;
let publicCompany:number;
beforeAll(async()=>{
 for(const demo of [0,1]){
  const company=await add('INSERT INTO empresa(nome,eh_demo) VALUES (?,?)',[`demo-test-${demo}-${suffix}`,demo]);companies.push(company);if(demo)publicCompany=company;
  const unit=await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)',[company,'Unit']);
  const sector=await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)',[company,unit,'Sector']);
  const room=await add('INSERT INTO ambiente(empresa_id,setor_id,nome) VALUES (?,?,?)',[company,sector,`Room-${suffix}`]);
  await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'OUTRO')",[company,room,`test-${demo}-${suffix}`]);
 }
});
afterAll(async()=>{try{for(const company of companies){for(const table of ['dispositivo','ambiente','setor','unidade'])await sql(`DELETE FROM ${table} WHERE empresa_id=?`,[company]);await sql('DELETE FROM empresa WHERE id=?',[company]);}}finally{await db.close();}});
it('publica somente empresa demo ativa, sem identificador físico, sessão ou dados cadastrais privados',async()=>{
 const repo=createMysqlDemoRepository(db);
 const own=(await repo.panel()).filter(row=>row.ambiente===`Room-${suffix}`);
 expect(own).toHaveLength(1);expect(own[0].empresa).toBe(`demo-test-1-${suffix}`);
 expect(Object.keys(own[0]).sort()).toEqual(['ambiente','empresa','estado','setor','status_conexao','temperatura_c','ultima_leitura_em','umidade_pct','unidade'].sort());
 await sql('UPDATE empresa SET eh_demo=0 WHERE id=?',[publicCompany]);
 expect((await repo.panel()).filter(row=>row.ambiente===`Room-${suffix}`)).toEqual([]);
 await sql('UPDATE empresa SET eh_demo=1,ativo=0 WHERE id=?',[publicCompany]);
 expect((await repo.panel()).filter(row=>row.ambiente===`Room-${suffix}`)).toEqual([]);
});
