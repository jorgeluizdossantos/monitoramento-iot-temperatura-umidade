const fs=require('node:fs');
const path=require('node:path');
function configuration(value){
 let origin;try{origin=new URL(value)}catch{throw Error('Informe a origem HTTPS pública do backend.')}
 const host=origin.hostname.toLowerCase();
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(host)||host.includes(':'))throw Error('Use somente uma origem HTTPS pública, sem caminho nem credenciais.');
 return {$schema:'https://openapi.vercel.sh/vercel.json',framework:'vite',buildCommand:'npm run build',outputDirectory:'dist',
  rewrites:[{source:'/api/:path*',destination:origin.origin+'/api/:path*'},{source:'/health',destination:origin.origin+'/health'},{source:'/:path*',destination:'/index.html'}],
  headers:[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]}]};
}
if(require.main===module){try{const value=process.argv[2]||process.env.STMA_BACKEND_ORIGIN; const target=path.resolve(__dirname,'../vercel.json');fs.writeFileSync(target,JSON.stringify(configuration(value),null,2)+'\n');console.log('vercel.json gerado. Confira destino, domínio e configuração de cookies antes do deploy.')}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={configuration};
