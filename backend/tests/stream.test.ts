import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStreamHub, createStreamRouter } from '../src/modules/stream/stream';
import type { AuthService } from '../src/modules/auth/auth.service';
import { HttpError } from '../src/shared/http-error';
let server:Server|undefined;
afterEach(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;}});
const until=async(check:()=>boolean)=>{const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw new Error('Timeout SSE');await new Promise(r=>setTimeout(r,10));}};
it('SSE isola empresa, revalida sessão em eventos e fecha após revogação',async()=>{
 const hub=createStreamHub();let revoked=false;
 const auth={authenticate:vi.fn(async(token?:string)=>{if(token!=='valid'||revoked)throw new HttpError(401,'SEM_SESSAO','Sem sessão');return{id:1,empresa_id:10,nome:'Reader',email:'reader@example.test',perfil:'leitor' as const};})} as unknown as AuthService;
 const app=express();app.use('/api/v1',createStreamRouter(hub,auth,25));
 app.use(((error:HttpError,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error.status??500).end();}) as express.ErrorRequestHandler);
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/stream`;
 expect((await fetch(url)).status).toBe(401);
 const response=await fetch(url,{headers:{Cookie:'stma_session=valid'}});expect(response.status).toBe(200);
 const reader=response.body!.getReader();let text='';let ended=false;
 const consume=(async()=>{while(true){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}ended=true;})();
 try{
  const count=()=>text.split('event: atualizar').length-1;
  await until(()=>count()===1);hub.publish(20);await new Promise(r=>setTimeout(r,80));expect(count()).toBe(1);expect(text).toContain(': heartbeat');
  hub.publish(10);await until(()=>count()===2);
  revoked=true;hub.publish(10);await until(()=>ended);expect(count()).toBe(2);expect(hub.size()).toBe(0);await consume;
 }finally{hub.close();await reader.cancel();}
});
it('hub limita conexões e libera recursos ao encerrar',()=>{
 const hub=createStreamHub();const close=vi.fn();const removes=Array.from({length:50},()=>hub.subscribe(1,()=>{},close));
 expect(()=>hub.subscribe(1,()=>{},close)).toThrow('Limite');removes[0]();expect(()=>hub.subscribe(1,()=>{},close)).not.toThrow();hub.close();expect(hub.size()).toBe(0);expect(close).toHaveBeenCalledTimes(50);
});