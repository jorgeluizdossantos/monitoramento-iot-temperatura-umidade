import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const row={empresa:'Indústria demonstrativa',unidade:'Salvador',setor:'Automação',ambiente:'Painel elétrico',estado:'normal',status_conexao:'online',ultima_leitura_em:'2026-10-20T12:00:00Z',temperatura_c:'24.0',umidade_pct:'55.0'};
test('demo pública não consulta sessão, não escreve e preserva estado offline',async({page})=>{
 const calls:string[]=[];
 await page.route('**/api/v1/**',r=>{const req=r.request();calls.push(req.method()+' '+new URL(req.url()).pathname);return r.fulfill({json:{demonstracao:true,dados:[row,{...row,ambiente:'Bomba',estado:'critico',status_conexao:'offline'}]}})});
 await page.goto('/demo',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('article')).toHaveCount(2);
 await expect(page.getByRole('article',{name:'Ambiente demonstrativo Bomba'})).toContainText('Sem leitura atual confirmada');
 await expect(page.getByRole('button',{name:/LED|limite|Reconhecer/})).toHaveCount(0);
 const before=calls.length;
 await page.getByRole('button',{name:'Atualizar demonstração'}).click();
 await expect.poll(()=>calls.length).toBeGreaterThan(before);
 expect(calls.every(c=>c==='GET /api/v1/demo/painel')).toBe(true);
});
test('demo mostra erro, permite repetir e trata resultado vazio',async({page})=>{
 let fails=true;
 await page.route('**/api/v1/demo/painel',r=>r.fulfill(fails?{status:503,json:{erro:{codigo:'INDISPONIVEL',mensagem:'Indisponível',campos:[]}}}:{json:{demonstracao:true,dados:[]}}));
 await page.goto('/demo',{waitUntil:'domcontentloaded'});await expect(page.getByRole('alert')).toContainText('indisponível');
 fails=false;await page.getByRole('button',{name:'Atualizar demonstração'}).click();
 await expect(page.getByRole('heading',{name:'Nenhum ambiente demonstrativo disponível'})).toBeVisible();
});
for(const theme of ['light','dark'])for(const target of ['demo','login','painel','historico','cadastro','alertas']){
 test(`acessibilidade ${target} / ${theme}`,async({page},info)=>{
  test.setTimeout(60000); // Inclui screenshot e análise axe; não é um orçamento de resposta da API.
  await page.addInitScript(theme=>localStorage.setItem('stma-theme',theme),theme);
  await page.route('**/api/v1/**',r=>{
   const p=new URL(r.request().url()).pathname;
   if(p.endsWith('/auth/me'))return target==='login'?r.fulfill({status:401,json:{erro:{codigo:'SESSAO',mensagem:'Sem sessão',campos:[]}}}):r.fulfill({json:{usuario:{id:1,empresa_id:1,nome:'Teste',email:'teste@example.test',perfil:'administrador'}}});
   if(p.endsWith('/demo/painel'))return r.fulfill({json:{demonstracao:true,dados:[row]}});
   if(p.endsWith('/serie'))return r.fulfill({json:{dados:[],fonte:'leituras_brutas_e_resumos',granularidade:'hora'}});
   if(p.endsWith('/stream'))return r.fulfill({status:503,body:''});
   return r.fulfill({json:{dados:[],total:0,pagina:1,tamanho:20}});
  });
  const paths={demo:'/demo',login:'/entrar',painel:'/painel',historico:'/ambientes/1/historico',cadastro:'/cadastros/unidades',alertas:'/alertas'};
  await page.goto(paths[target as keyof typeof paths],{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{level:1})).toBeVisible();
  if(target==='demo')await expect(page.getByRole('article')).toHaveCount(1);
  if(target==='cadastro')await page.getByRole('button',{name:/Cadastrar /}).click();
  await page.screenshot({path:info.outputPath(`${target}-${theme}.png`),fullPage:true});
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
test('teclado e tema persistem após navegação e recarga',async({page,isMobile})=>{
 await page.route('**/api/v1/demo/painel',r=>r.fulfill({json:{demonstracao:true,dados:[row]}}));
 await page.goto('/demo',{waitUntil:'domcontentloaded'});await expect(page.getByRole('article')).toHaveCount(1);
 if(isMobile)await page.getByRole('link',{name:'Ir para o conteúdo'}).focus();else await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Ir para o conteúdo'})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
 await page.getByRole('button',{name:'Ativar tema escuro'}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Ativar tema claro'})).toHaveAttribute('aria-pressed','true');
});
