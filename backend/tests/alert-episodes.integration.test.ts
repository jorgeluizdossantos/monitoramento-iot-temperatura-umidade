import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { loadEnvironment } from '../src/config/env';
import { createDatabase, type Database } from '../src/db/mysql';
import { createMysqlTelemetryRepository } from '../src/modules/telemetria/mysql-telemetry.repository';
import type { TelemetryMessage } from '../src/modules/telemetria/telemetry.repository';
const env=loadEnvironment();if(env.DB_TARGET!=='local'||env.NODE_ENV!=='test')throw new Error('Exige MySQL local de teste');
const db=createDatabase(env);const id=`test-${randomUUID()}`;
const committed=vi.fn();const repository=createMysqlTelemetryRepository(db,committed);
const sql=(text:string,args:unknown[]=[])=>db.withConnection(c=>c.execute(text,args));
const add=async(text:string,args:unknown[]=[])=>((await sql(text,args))[0] as ResultSetHeader).insertId;
let company:number,unit:number,sector:number,room:number,secondRoom:number,device:number;
const base=Date.now();
const reading=(seconds:number,temperature=20,humidity=50):TelemetryMessage=>({kind:'dados',deviceId:id,temperature,humidity,measuredAt:new Date(base+seconds*1000),receivedAt:new Date(),retained:false,timestampSource:'device'});
const alerts=async()=>((await sql('SELECT * FROM alerta WHERE dispositivo_id=? ORDER BY id',[device]))[0] as RowDataPacket[]);
beforeAll(async()=>{
 company=await add('INSERT INTO empresa(nome) VALUES (?)',[id]);
 unit=await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)',[company,'Unit']);
 sector=await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)',[company,unit,'Sector']);
 for(const name of ['Room','Second']){const value=await add('INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal,temp_tolerancia,umid_min_ideal,umid_max_ideal,umid_tolerancia) VALUES (?,?,?,18,26,2,30,70,5)',[company,sector,name]);if(name==='Room')room=value;else secondRoom=value;}
 device=await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor) VALUES (?,?,?,'DHT11')",[company,room,id]);
});
beforeEach(async()=>{await sql('DELETE FROM alerta WHERE dispositivo_id=?',[device]);await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?',[device]);await sql('UPDATE dispositivo SET ultima_leitura_em=NULL,ultima_temperatura_c=NULL,ultima_umidade_pct=NULL,ambiente_id=? WHERE id=?',[room,device]);committed.mockClear();});
afterAll(async()=>{try{if(device){await sql('DELETE FROM alerta WHERE dispositivo_id=?',[device]);await sql('DELETE FROM leitura_telemetria WHERE dispositivo_id=?',[device]);}if(company){for(const table of ['dispositivo','ambiente','setor','unidade'])await sql(`DELETE FROM ${table} WHERE empresa_id=?`,[company]);await sql('DELETE FROM empresa WHERE id=?',[company]);}}finally{await db.close();}});
it('episódio abre, agrava, preserva extremo e encerra na volta à faixa',async()=>{
 await repository.ingest(reading(0,27));await repository.ingest(reading(1,30));await repository.ingest(reading(2,27));
 let rows=await alerts();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({tipo:'temperatura',sentido:'acima',severidade:'critico',valor:'27.0',valor_extremo:'30.0',encerrado_em:null});
 await repository.ingest(reading(3,26));rows=await alerts();expect(rows[0].encerrado_em).toEqual(new Date(base+3000));expect(rows[0].leitura_id).not.toBeNull();expect(committed).toHaveBeenCalledTimes(4);expect(committed).toHaveBeenCalledWith(company);
});
it('umidade é independente; mudança direta de sentido gera episódios separados',async()=>{
 await repository.ingest(reading(0,29,76));await repository.ingest(reading(1,15,50));const rows=await alerts();
 expect(rows).toHaveLength(3);expect(rows.filter(row=>row.encerrado_em===null)).toHaveLength(1);expect(rows.at(-1)).toMatchObject({tipo:'temperatura',sentido:'abaixo',valor_extremo:'15.0'});
});
it('duplicatas concorrentes e leituras atrasadas não alteram episódio atual',async()=>{
 expect((await Promise.all([repository.ingest(reading(2,29)),repository.ingest(reading(2,29))])).sort()).toEqual(['duplicate','stored']);
 await repository.ingest(reading(0,20));await repository.ingest(reading(1,40));
 const rows=await alerts();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({valor_extremo:'29.0',encerrado_em:null});
 expect(committed).toHaveBeenCalledTimes(3);
});
it('mudança de ambiente encerra o episódio antigo e preserva seu vínculo',async()=>{
 await repository.ingest(reading(0,29));await sql('UPDATE dispositivo SET ambiente_id=? WHERE id=?',[secondRoom,device]);await repository.ingest(reading(1,30));
 const rows=await alerts();expect(rows).toHaveLength(2);expect(rows[0].ambiente_id).toBe(room);expect(rows[0].encerrado_em).not.toBeNull();expect(rows[1]).toMatchObject({ambiente_id:secondRoom,encerrado_em:null});
});
it('falha posterior ao alerta faz rollback de leitura, episódio e snapshot e não emite evento',async()=>{
 const failing:Database={...db,withConnection:work=>db.withConnection(c=>work(new Proxy(c,{get(target,property){if(property==='execute')return(query:string,values:unknown[])=>{if(query.startsWith('UPDATE dispositivo SET ultima_leitura_em'))throw new Error('forced');return target.execute(query,values);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}})))};
 await expect(createMysqlTelemetryRepository(failing,committed).ingest(reading(0,29))).rejects.toThrow('forced');
 expect(await alerts()).toHaveLength(0);expect((await sql('SELECT id FROM leitura_telemetria WHERE dispositivo_id=?',[device]))[0]).toHaveLength(0);expect(committed).not.toHaveBeenCalled();
});
it('observador SSE com falha não desfaz commit nem provoca falha da ingestão',async()=>{
 await expect(createMysqlTelemetryRepository(db,()=>{throw new Error('observer');}).ingest(reading(0,29))).resolves.toBe('stored');expect(await alerts()).toHaveLength(1);
});