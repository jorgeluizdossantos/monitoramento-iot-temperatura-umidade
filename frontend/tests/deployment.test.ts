import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { configuration } = createRequire(import.meta.url)('../scripts/configure-vercel.cjs');
it('rewrite preserva API antes do fallback SPA e não aceita backend privado ou credenciais',()=>{
 const config=configuration('https://api.example.com');
 expect(config.rewrites[0]).toEqual({source:'/api/:path*',destination:'https://api.example.com/api/:path*'});
 expect(config.rewrites.at(-1).destination).toBe('/index.html');
 for(const value of [undefined,'http://api.example.com','https://localhost','https://127.0.0.1','https://192.168.0.2','https://user:pass@api.example.com','https://api.example.com/token','https://api.example.com/?token=secret'])expect(()=>configuration(value)).toThrow();
});
