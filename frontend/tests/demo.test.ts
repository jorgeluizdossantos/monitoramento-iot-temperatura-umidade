import { expect, it } from 'vitest';
import { demoSchema } from '../src/features/demo/model';
it('exige projeção explicitamente demonstrativa e elimina campos não públicos',()=>{
 const row={empresa:'Demo',unidade:'Unidade',setor:'Setor',ambiente:'Sala',estado:'normal',status_conexao:'online',ultima_leitura_em:'2026-10-20T12:00:00Z',temperatura_c:'23.0',umidade_pct:'55.0',device_id:'privado',usuario:'privado'};
 expect(demoSchema.parse({demonstracao:true,dados:[row]}).dados[0]).not.toHaveProperty('device_id');
 expect(demoSchema.safeParse({demonstracao:false,dados:[row]}).success).toBe(false);
 expect(demoSchema.safeParse({demonstracao:true,dados:[{...row,temperatura_c:'NaN'}]}).success).toBe(false);
});
