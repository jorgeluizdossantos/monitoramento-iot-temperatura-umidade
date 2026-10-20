// Fase 6: build real + Express + MySQL local. Apenas fixtures próprias são removidas.
const path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),from=p=>require(path.join(root,'backend/dist',p));
const express=require('../backend/node_modules/express');
const {chromium,expect}=require('../frontend/node_modules/@playwright/test');
process.env.NODE_ENV='test';process.env.DB_TARGET='local';
(async()=>{
 const env=from('config/env').loadEnvironment();if(env.DB_TARGET!=='local')throw Error('Exige MySQL local');
 const db=from('db/mysql').createDatabase(env);
 const demoDb=from('db/mysql').createDatabase(from('config/database-roles').environmentForRole(env,'demo'));
 const sql=(text,args=[])=>db.withConnection(c=>c.execute(text,args));
 const add=async(text,args)=>(await sql(text,args))[0].insertId;
 const suffix=randomUUID(),name=`Demonstração E2E ${suffix}`;
 let company,server,browser;
 try{
  company=await add('INSERT INTO empresa(nome,eh_demo) VALUES (?,1)',[name]);
  const unit=await add('INSERT INTO unidade(empresa_id,nome) VALUES (?,?)',[company,'Unidade didática']);
  const sector=await add('INSERT INTO setor(empresa_id,unidade_id,nome) VALUES (?,?,?)',[company,unit,'Automação']);
  const room=await add('INSERT INTO ambiente(empresa_id,setor_id,nome,temp_min_ideal,temp_max_ideal) VALUES (?,?,?,18,26)',[company,sector,name]);
  await add("INSERT INTO dispositivo(empresa_id,ambiente_id,device_id,sensor,status_conexao,ultima_leitura_em,ultima_temperatura_c,ultima_umidade_pct) VALUES (?,?,?,'DHT11','online',UTC_TIMESTAMP(3),24,55)",[company,room,`demo-${suffix}`]);
  const demo=from('modules/demo/demo.service').createDemoService(from('modules/demo/mysql-demo.repository').createMysqlDemoRepository(demoDb));
  const app=from('app').createApp({healthRepository:{ping:async()=>{}},logger:from('shared/logger').createLogger('silent'),demo});
  const web=express();web.use(express.static(path.join(root,'frontend/dist')));web.get('/demo',(_req,res)=>res.sendFile(path.join(root,'frontend/dist/index.html')));web.use(app);
  server=web.listen(5175,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage();const methods=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))methods.push(r.method())});
  await page.goto('http://127.0.0.1:5175/demo');
  const card=page.getByRole('article',{name:`Ambiente demonstrativo ${name}`});await expect(card).toContainText('24,0');await expect(card).toContainText('55,0');
  assert(methods.length>0&&methods.every(m=>m==='GET'));
  const response=await page.request.get('http://127.0.0.1:5175/api/v1/demo/painel');assert.equal(response.status(),200);
  for(const row of (await response.json()).dados)for(const key of ['device_id','email','senha_hash','usuario_id'])assert.equal(key in row,false);
  console.log('PASS: demonstração sem login, dados reais da fixture MySQL, conta de leitura, build React e ausência de identificadores/credenciais.');
 }finally{
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
  try{if(company){for(const table of ['dispositivo','ambiente','setor','unidade'])await sql(`DELETE FROM ${table} WHERE empresa_id=?`,[company]);await sql('DELETE FROM empresa WHERE id=?',[company]);}}finally{await Promise.all([db.close(),demoDb.close()])}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
