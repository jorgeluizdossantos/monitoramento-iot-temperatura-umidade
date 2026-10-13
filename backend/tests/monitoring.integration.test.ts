import { randomUUID, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
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
const env=loadEnvironment();
if(env.DB_TARGET!=='local'||env.NODE_ENV!=='test')throw new Error('Exige MySQL local de teste');
const db=createDatabase(env); const suffix=randomUUID();
const sql=(text:string,args:unknown[]=[])=>db.withConnection(c=>c.execute(text,args));
let company:number,other:number,unit:number,sector:number,room:number,device:number,alert:string,operator:number,reader:number;
let app:ReturnType<typeof createApp>;
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
 app=createApp({healthRepository:{ping:async()=>{}},logger:createLogger('silent'),auth:{service:auth,env},monitoring:createMonitoringService(createMysqlMonitoringRepository(db))});
});
afterAll(async()=>{try{
 if(company){
  await sql('DELETE FROM auditoria WHERE empresa_id IN (?,?)',[company,other]);
  await sql('DELETE s FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE u.empresa_id IN (?,?)',[company,other]);
  await sql('DELETE FROM alerta WHERE ambiente_id=?',[room]);
  for(const table of ['dispositivo','ambiente','setor','unidade','usuario'])await sql(`DELETE FROM ${table} WHERE empresa_id IN (?,?)`,[company,other]);
  await sql('DELETE FROM empresa WHERE id IN (?,?)',[company,other]);
 }
}finally{await db.close();}});
it('painel autentica, isola empresa e aplica a classificação da view',async()=>{
 expect((await request(app).get('/api/v1/painel')).status).toBe(401);
 const own=await request(app).get('/api/v1/painel').set('Cookie',cookie(tokens.reader));
 expect(own.status).toBe(200);expect(own.body.dados).toHaveLength(1);expect(own.body.dados[0]).toMatchObject({ambiente_id:room,estado:'critico'});
 expect((await request(app).get('/api/v1/painel').set('Cookie',cookie(tokens.foreign))).body.dados).toEqual([]);
 expect((await request(app).get(`/api/v1/painel?empresa_id=${other}`).set('Cookie',cookie(tokens.reader))).status).toBe(400);
 await sql('UPDATE setor SET ativo=0 WHERE id=?',[sector]);
 try{expect((await request(app).get('/api/v1/painel').set('Cookie',cookie(tokens.reader))).body.dados).toEqual([]);}finally{await sql('UPDATE setor SET ativo=1 WHERE id=?',[sector]);}
});
it('alertas são paginados e leitor não reconhece; outra empresa recebe 404',async()=>{
 const own=await request(app).get('/api/v1/alertas').set('Cookie',cookie(tokens.reader));expect(own.body.total).toBe(1);
 expect((await request(app).get('/api/v1/alertas').set('Cookie',cookie(tokens.foreign))).body.total).toBe(0);
 expect((await request(app).post(`/api/v1/alertas/${alert}/reconhecer`).set('Cookie',cookie(tokens.reader)).send({})).status).toBe(403);
 const service=createMonitoringService(createMysqlMonitoringRepository(db));
 await expect(service.acknowledge(alert,{}, {actor:{id:operator,empresa_id:other,nome:'other',email:'other@test.invalid',perfil:'operador'},ip:null})).rejects.toMatchObject({status:403});
 // Mesmo identificador existe, mas a consulta no escopo alheio não o revela.
 const foreignOperator=await add("INSERT INTO usuario(empresa_id,nome,email,senha_hash,perfil) VALUES (?,'Foreign',?,'unused','operador')",[other,`foreign-${suffix}@example.test`]);
 await expect(service.acknowledge(alert,{}, {actor:{id:foreignOperator,empresa_id:other,nome:'Foreign',email:'foreign@test.invalid',perfil:'operador'},ip:null})).rejects.toMatchObject({status:404});
});
it('reconhecimento idempotente preserva autor e episódio aberto, com uma auditoria',async()=>{
 const url=`/api/v1/alertas/${alert}/reconhecer`;
 const first=await request(app).post(url).set('Cookie',cookie(tokens.operator)).send({});expect(first.status).toBe(200);
 const again=await request(app).post(url).set('Cookie',cookie(tokens.operator)).send({});expect(again.status).toBe(200);
 expect(first.body.dados.reconhecido_por).toBe(operator);expect(first.body.dados.encerrado_em).toBeNull();
 expect(again.body.dados.reconhecido_em).toBe(first.body.dados.reconhecido_em);
 const [rows]=await sql("SELECT COUNT(*) total FROM auditoria WHERE empresa_id=? AND acao='reconhecer'",[company]);expect(Number((rows as RowDataPacket[])[0].total)).toBe(1);
 expect((await request(app).post(url).set('Cookie',cookie(tokens.operator)).set('Origin','https://other.invalid').send({})).status).toBe(403);
 expect((await request(app).get('/api/v1/alertas?tamanho=501').set('Cookie',cookie(tokens.reader))).status).toBe(400);
 expect(reader).toBeGreaterThan(0);
});