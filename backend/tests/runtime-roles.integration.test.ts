import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import mysql, { type Connection, type ResultSetHeader } from 'mysql2/promise';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { backendRoot, loadEnvironment } from '../src/config/env';
import { createDatabase, mysqlOptions, type Database } from '../src/db/mysql';
import { runtimeGrants, type RuntimeRole } from '../src/db/runtime-grants';
import { createMysqlMaintenanceRepository } from '../src/modules/maintenance/mysql-maintenance.repository';
import { createMysqlDemoRepository } from '../src/modules/demo/mysql-demo.repository';
import { createMysqlTelemetryRepository } from '../src/modules/telemetria/mysql-telemetry.repository';
const env=loadEnvironment();if(env.DB_TARGET!=='local'||env.NODE_ENV!=='test')throw new Error('Exige MySQL local de teste');
const privateFile=path.join(backendRoot,'.env.provision');
const adminEnv={...(fs.existsSync(privateFile)?dotenv.parse(fs.readFileSync(privateFile)):{}),...process.env};
const adminUser=adminEnv.TEST_DB_ADMIN_USER||adminEnv.DB_PROVISION_USER;
const adminPassword=adminEnv.TEST_DB_ADMIN_PASSWORD||adminEnv.DB_PROVISION_PASSWORD;
if(!adminUser||!adminPassword)throw new Error('Configure administrador local de teste; não usar Aiven.');
const suffix=randomBytes(5).toString('hex');
const accounts:string[]=[];const pools:Partial<Record<RuntimeRole,Database>>={};
let admin:Connection,company:number,room:number,device:number;
beforeAll(async()=>{
 admin=await mysql.createConnection({...mysqlOptions(env),user:adminUser,password:adminPassword});
 for(const role of ['api','maintenance','demo'] as const){
  const user=`stma_test_${suffix}_${role==='maintenance'?'jobs':role}`;const password=randomBytes(24).toString('hex');
  await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);accounts.push(user);
  for(const grant of runtimeGrants(env.database.name,user,role))await admin.query(grant);
  pools[role]=createDatabase({...env,database:{...env.database,user,password}});
 }
 const add=async(text:string,args:unknown[])=>(await pools.api!.withConnection(async c=>(await c.execute<ResultSetHeader>(text,args))[0].insertId));
 company=await add('INSERT INTO empresa(nome,eh_demo) VALUES (?,1)',[`roles-${suffix}`]);
 const unit=await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)',[company,'Unit']);
 const sector=await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)',[company,unit,'Sector']);
 room=await add('INSERT INTO ambiente(empresa_id,setor_id,nome) VALUES (?,?,?)',[company,sector,`Room-${suffix}`]);
 device=await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'OUTRO')",[company,room,`test-${suffix}`]);
 const reading=await add("INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em) VALUES (?,?,29,50,'1990-01-01 10:00:00')",[device,room]);
 await add("INSERT INTO alerta(ambiente_id,dispositivo_id,leitura_id,tipo,sentido,severidade,valor,valor_extremo,limite_violado,ocorrido_em) VALUES (?,?,?,'temperatura','acima','critico',29,29,26,'1990-01-01 10:00:00')",[room,device,reading]);
},30000);
afterAll(async()=>{
 try{
  await Promise.all(Object.values(pools).map(db=>db.close()));
  if(admin){
   if(company){await admin.execute('DELETE FROM evento_porta WHERE ambiente_id=?',[room]);await admin.execute('DELETE FROM alerta WHERE ambiente_id=?',[room]);await admin.execute('DELETE FROM leitura_telemetria WHERE ambiente_id=?',[room]);await admin.execute('DELETE FROM leitura_hora WHERE ambiente_id=?',[room]);for(const table of ['dispositivo','ambiente','setor','unidade'])await admin.execute(`DELETE FROM ${table} WHERE empresa_id=?`,[company]);await admin.execute('DELETE FROM empresa WHERE id=?',[company]);}
   for(const user of accounts)await admin.query(`DROP USER '${user}'@'%'`);
  }
 }finally{await admin?.end();}
},30000);
it('API não apaga telemetria nem altera schema; demonstração não escreve nem lê usuários',async()=>{
 await expect(pools.api!.withConnection(c=>c.execute('DELETE FROM leitura_telemetria WHERE id=0'))).rejects.toMatchObject({code:'ER_TABLEACCESS_DENIED_ERROR'});
 await expect(pools.api!.withConnection(c=>c.execute('CREATE TABLE forbidden_test(id INT)'))).rejects.toMatchObject({code:'ER_TABLEACCESS_DENIED_ERROR'});
 await expect(pools.demo!.withConnection(c=>c.execute('UPDATE empresa SET ativo=0 WHERE id=0'))).rejects.toMatchObject({code:'ER_TABLEACCESS_DENIED_ERROR'});
 await expect(pools.demo!.withConnection(c=>c.execute('SELECT id FROM usuario LIMIT 1'))).rejects.toMatchObject({code:'ER_TABLEACCESS_DENIED_ERROR'});
 expect((await createMysqlDemoRepository(pools.demo!).panel()).some(row=>row.empresa===`roles-${suffix}`)).toBe(true);
});
it('manutenção resume/expurga com privilégios mínimos e preserva alerta pela FK',async()=>{
 const repo=createMysqlMaintenanceRepository(pools.maintenance!);
 await repo.summarize(new Date('1990-01-01T10:00:00Z'),new Date('1990-01-01T11:00:00Z'));
 expect((await repo.purgeReadings(new Date('1990-01-01T11:00:00Z'),()=>true)).affected).toBe(1);
 const [rows]=await pools.api!.withConnection(c=>c.execute('SELECT leitura_id,valor FROM alerta WHERE dispositivo_id=?',[device]));
 expect(rows).toEqual([expect.objectContaining({leitura_id:null,valor:'29.0'})]);
 await repo.cleanSessions(new Date('1990-01-01T00:00:00Z'),()=>true);
 await repo.markOffline(new Date('1990-01-01T00:00:00Z'));
});
it('API ingere e deduplica leitura e transição de porta com travas e privilégios limitados',async()=>{
 const repo=createMysqlTelemetryRepository(pools.api!);const time=new Date('2001-01-01T00:00:00Z');
 const reading={kind:'dados' as const,deviceId:`test-${suffix}`,temperature:24,humidity:50,measuredAt:time,receivedAt:time,retained:false,timestampSource:'device' as const};
 expect(await repo.ingest(reading)).toBe('stored');expect(await repo.ingest(reading)).toBe('duplicate');
 expect(await repo.ingest({kind:'porta',deviceId:`test-${suffix}`,open:true,measuredAt:time,receivedAt:time,retained:false})).toBe('stored');
});
