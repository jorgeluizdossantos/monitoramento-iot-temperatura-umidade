import { randomUUID, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { Agent, type Server } from 'node:http';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase } from '../src/db/mysql';
import { createMysqlMonitoringRepository } from '../src/modules/telemetria/mysql-monitoring.repository';
import { createMonitoringService } from '../src/modules/telemetria/monitoring.service';
import { createApp } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { createAuthService } from '../src/modules/auth/auth.service';
import { createMysqlAuthRepository } from '../src/modules/auth/mysql-auth.repository';
import { hashToken } from '../src/modules/auth/auth.service';
import { createHistoryService } from '../src/modules/telemetria/history.service';
import { createMysqlHistoryRepository } from '../src/modules/telemetria/mysql-history.repository';
const env=loadEnvironment();
if(env.DB_TARGET!=='local'||env.NODE_ENV!=='test')throw new Error('Exige MySQL local de teste');
const db=createDatabase(env); const suffix=randomUUID();
const sql=(text:string,args:unknown[]=[])=>db.withConnection(c=>c.execute(text,args));
let company:number,other:number,unit:number,sector:number,room:number,device:number,alert:string,operator:number,reader:number;
let app:ReturnType<typeof createApp>;
let server:Server;
const requestAgent=new Agent({keepAlive:false});
const tokens={operator:randomBytes(32).toString('hex'),reader:randomBytes(32).toString('hex'),foreign:randomBytes(32).toString('hex')};
const add=async(text:string,args:unknown[]=[])=>((await sql(text,args))[0] as ResultSetHeader).insertId;
const cookie=(token:string)=>`stma_session=${token}`;
beforeAll(async()=>{
 company=await add('INSERT INTO empresa(nome) VALUES (?)',[`monitor-${suffix}`]);
 other=await add('INSERT INTO empresa(nome) VALUES (?)',[`other-${suffix}`]);
 unit=await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)',[company,'Unidade']);
 sector=await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)',[company,unit,'Setor']);
 room=await add('INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal,temp_tolerancia) VALUES (?,?,?,18,26,2)',[company,sector,'Sala']);
 device=await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor,ultima_leitura_em,ultima_temperatura_c,ultima_umidade_pct) VALUES (?,?,?,'DHT11',UTC_TIMESTAMP(3),29,55)",[company,room,`test-${suffix}`]);
 alert=String(await add("INSERT INTO alerta(ambiente_id,dispositivo_id,tipo,sentido,severidade,valor,valor_extremo,limite_violado,ocorrido_em) VALUES (?,?,'temperatura','acima','critico',29,29,26,UTC_TIMESTAMP(3))",[room,device]));
 for(const [role,token,tenant] of [['operador',tokens.operator,company],['leitor',tokens.reader,company],['leitor',tokens.foreign,other]] as const){
  const id=await add('INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)',[tenant,role,`${role}-${tenant}-${suffix}@example.test`,'unused-test-hash',role]);
  if(token===tokens.operator)operator=id; if(token===tokens.reader)reader=id;
  await sql('INSERT INTO sessao(usuario_id,token_hash,expira_em) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))',[id,hashToken(token)]);
 }
 const auth=await createAuthService(createMysqlAuthRepository(db),8);
 app=createApp({healthRepository:{ping:async()=>{}},logger:createLogger('silent'),auth:{service:auth,env},monitoring:createMonitoringService(createMysqlMonitoringRepository(db)),history:createHistoryService(createMysqlHistoryRepository(db))});
 server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
});
afterAll(async()=>{try{
 requestAgent.destroy();
 if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 if(company){
  await sql('DELETE FROM auditoria WHERE empresa_id IN (?,?)',[company,other]);
  await sql('DELETE s FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE u.empresa_id IN (?,?)',[company,other]);
  await sql('DELETE FROM alerta WHERE ambiente_id=?',[room]);
  await sql('DELETE FROM leitura_telemetria WHERE ambiente_id=?',[room]);
  for(const table of ['dispositivo','ambiente','setor','unidade','usuario'])await sql(`DELETE FROM ${table} WHERE empresa_id IN (?,?)`,[company,other]);
  await sql('DELETE FROM empresa WHERE id IN (?,?)',[company,other]);
 }
}finally{await db.close();}},60000);
it('painel autentica, isola empresa e aplica a classificação da view',async()=>{
 expect((await request(server).get('/api/v1/painel')).status).toBe(401);
 const own=await request(server).get('/api/v1/painel').agent(requestAgent).set('Cookie',cookie(tokens.reader));
 expect(own.status).toBe(200);expect(own.body.dados).toHaveLength(1);expect(own.body.dados[0]).toMatchObject({ambiente_id:room,estado:'critico'});
 expect((await request(server).get('/api/v1/painel').agent(requestAgent).set('Cookie',cookie(tokens.foreign))).body.dados).toEqual([]);
 expect((await request(server).get(`/api/v1/painel?empresa_id=${other}`).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 await sql('UPDATE setor SET ativo=0 WHERE id=?',[sector]);
 try{expect((await request(server).get('/api/v1/painel').agent(requestAgent).set('Cookie',cookie(tokens.reader))).body.dados).toEqual([]);}finally{await sql('UPDATE setor SET ativo=1 WHERE id=?',[sector]);}
});
it('alertas são paginados e leitor não reconhece; outra empresa recebe 404',async()=>{
 const own=await request(server).get('/api/v1/alertas').agent(requestAgent).set('Cookie',cookie(tokens.reader));expect(own.body.total).toBe(1);
 expect((await request(server).get('/api/v1/alertas').agent(requestAgent).set('Cookie',cookie(tokens.foreign))).body.total).toBe(0);
 expect((await request(server).post(`/api/v1/alertas/${alert}/reconhecer`).agent(requestAgent).set('Cookie',cookie(tokens.reader)).send({})).status).toBe(403);
 const service=createMonitoringService(createMysqlMonitoringRepository(db));
 await expect(service.acknowledge(alert,{}, {actor:{id:operator,empresa_id:other,nome:'other',email:'other@test.invalid',perfil:'operador'},ip:null})).rejects.toMatchObject({status:403});
 // Mesmo identificador existe, mas a consulta no escopo alheio não o revela.
 const foreignOperator=await add("INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,'Foreign',?,'unused','operador')",[other,`foreign-${suffix}@example.test`]);
 await expect(service.acknowledge(alert,{}, {actor:{id:foreignOperator,empresa_id:other,nome:'Foreign',email:'foreign@test.invalid',perfil:'operador'},ip:null})).rejects.toMatchObject({status:404});
});
it('reconhecimento idempotente preserva autor e episódio aberto, com uma auditoria',async()=>{
 const url=`/api/v1/alertas/${alert}/reconhecer`;
 const first=await request(server).post(url).agent(requestAgent).set('Cookie',cookie(tokens.operator)).send({});expect(first.status).toBe(200);
 const again=await request(server).post(url).agent(requestAgent).set('Cookie',cookie(tokens.operator)).send({});expect(again.status).toBe(200);
 expect(first.body.dados.reconhecido_por).toBe(operator);expect(first.body.dados.encerrado_em).toBeNull();
 expect(again.body.dados.reconhecido_em).toBe(first.body.dados.reconhecido_em);
 const [rows]=await sql("SELECT COUNT(*) total FROM auditoria WHERE empresa_id=? AND acao='reconhecer'",[company]);expect(Number((rows as RowDataPacket[])[0].total)).toBe(1);
 expect((await request(server).post(url).agent(requestAgent).set('Cookie',cookie(tokens.operator)).set('Origin','https://other.invalid').send({})).status).toBe(403);
 expect((await request(server).get('/api/v1/alertas?tamanho=501').agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 expect(reader).toBeGreaterThan(0);
});
it('histórico, série e CSV respeitam período, paginação, UTC e escopo da empresa',async()=>{
 for(const [time,temp] of [['2026-01-01 00:00:00.000',20],['2026-01-01 00:30:00.000',22],['2026-01-01 01:00:00.000',24]] as const)await sql('INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em) VALUES (?,?,?,50,?)',[device,room,temp,time]);
 const query={de:'2026-01-01T00:00:00Z',ate:'2026-01-01T01:00:00Z'};
 const path=`/api/v1/ambientes/${room}`;
 const response=await request(server).get(`${path}/leituras`).query({...query,tamanho:1,pagina:2}).agent(requestAgent).set('Cookie',cookie(tokens.reader));
 expect(response.status).toBe(200);expect(response.body.total).toBe(2);expect(response.body.dados).toHaveLength(1);expect(response.body.dados[0].medido_em).toBe('2026-01-01T00:00:00.000Z');
 const series=await request(server).get(`${path}/serie`).query(query).agent(requestAgent).set('Cookie',cookie(tokens.reader));
 expect(series.status).toBe(200);expect(series.body.fonte).toBe('leituras_brutas');expect(series.body.dados).toHaveLength(1);expect(Number(series.body.dados[0].temp_media)).toBe(21);
 const csv=await request(server).get(`${path}/leituras.csv`).query(query).agent(requestAgent).set('Cookie',cookie(tokens.reader));
 expect(csv.status).toBe(200);expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(3);expect(csv.text).toContain('2026-01-01T00:00:00.000Z,20.0,50.0');
 for(const endpoint of ['leituras','serie','leituras.csv']){
  expect((await request(server).get(`${path}/${endpoint}`).query(query).agent(requestAgent).set('Cookie',cookie(tokens.foreign))).status).toBe(404);
  expect((await request(server).get(`${path}/${endpoint}`).query({...query,empresa_id:company}).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 }
 expect((await request(server).get(`${path}/leituras`).query({de:'2026-01-01T00:00:00Z',ate:'2026-02-02T00:00:00Z'}).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 expect((await request(server).get(`${path}/serie`).query({de:'2026-01-01T00:00:00Z',ate:'2027-01-03T00:00:00Z'}).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 expect((await request(server).get(`${path}/leituras`).query({de:query.ate,ate:query.de}).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 expect((await request(server).get(`${path}/leituras`).query({de:'invalid',ate:query.ate}).agent(requestAgent).set('Cookie',cookie(tokens.reader))).status).toBe(400);
});
it('100 mil leituras: páginas inicial/final abaixo de 3 s e CSV completo sem truncamento',async()=>{
 const digits='(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
 await sql(`INSERT INTO leitura_telemetria(dispositivo_id,ambiente_id,temperatura_c,umidade_pct,medido_em)
 SELECT ?,?,20,50,TIMESTAMPADD(SECOND,a.n+10*b.n+100*c.n+1000*d.n+10000*e.n,'2026-01-02 00:00:00') FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c CROSS JOIN ${digits} d CROSS JOIN ${digits} e`,[device,room]);
 console.info('Carga inserida');
 const query={de:'2026-01-02T00:00:00Z',ate:'2026-01-04T00:00:00Z'};
 for(const pagina of [1,200]){
  const start=performance.now();const response=await request(server).get(`/api/v1/ambientes/${room}/leituras`).query({...query,pagina,tamanho:500}).agent(requestAgent).set('Cookie',cookie(tokens.reader));const ms=performance.now()-start;
  expect(response.status).toBe(200);expect(response.body.total).toBe(100000);expect(response.body.dados).toHaveLength(500);expect(ms).toBeLessThan(3000);
  console.info(JSON.stringify({benchmark:'historico-http-100000',pagina,ms:Math.round(ms)}));
 }
 console.info('Iniciando CSV de carga');
 const csv=await request(server).get(`/api/v1/ambientes/${room}/leituras.csv`).query(query).agent(requestAgent).set('Cookie',cookie(tokens.reader));
 expect(csv.status).toBe(200);expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(100001);
},60000);
