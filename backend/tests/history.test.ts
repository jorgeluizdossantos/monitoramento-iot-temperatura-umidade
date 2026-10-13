import { expect,it,vi } from 'vitest';
import { createHistoryService,validatePeriod } from '../src/modules/telemetria/history.service';
import type { HistoryRepository } from '../src/modules/telemetria/history.repository';
const base=new Date('2026-01-01T00:00:00Z');
it('períodos inclusivos no limite de duração: 31/366 dias, com fim exclusivo',()=>{
 for(const days of [31,366]){
  expect(()=>validatePeriod({de:base,ate:new Date(+base+days*86400000)},days)).not.toThrow();
  expect(()=>validatePeriod({de:base,ate:new Date(+base+days*86400000+1)},days)).toThrow();
 }
 expect(()=>validatePeriod({de:base,ate:base},31)).toThrow();
});
it('validação rejeita autoridade e datas sem fuso antes de consultar banco',async()=>{
 const repository={assertRoom:vi.fn()} as unknown as HistoryRepository;
 const service=createHistoryService(repository);const actor={id:1,empresa_id:2,nome:'User',email:'u@e.test',perfil:'leitor' as const};
 await expect(service.history('1',{de:'2026-01-01T00:00:00',ate:'2026-01-02T00:00:00Z'},actor)).rejects.toThrow();
 await expect(service.history('1',{de:base.toISOString(),ate:'2026-01-02T00:00:00Z',empresa_id:3},actor)).rejects.toThrow();
 expect(repository.assertRoom).not.toHaveBeenCalled();
 await expect(service.history('1',{}, {...actor,empresa_id:null,perfil:'superadmin'})).rejects.toMatchObject({status:403});
});