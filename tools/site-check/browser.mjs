import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('../../website/',import.meta.url)));
const server=createServer(async(req,res)=>{try{let p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));assert(p===root||p.startsWith(root+'/'));if((await stat(p)).isDirectory())p=resolve(p,'index.html');const b=await readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.CONTINUITY_SITE_URL||`http://127.0.0.1:${server.address().port}/`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CONTINUITY_CHROME?{executablePath:process.env.CONTINUITY_CHROME}:{})});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(base);
  await page.waitForFunction(()=>document.body.dataset.view==='understand');
  const link=page.getByRole('link',{name:'04 Web Simulator Playground',exact:true});await link.waitFor({state:'visible'});
  assert.equal(await page.getByRole('tablist').getByRole('link').count(),0);
  await page.getByRole('tab',{name:'01 Understand the idea'}).focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.body.dataset.view==='explore');
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.body.dataset.view==='try');
  await page.keyboard.press('Tab');assert(await link.evaluate(e=>e===document.activeElement));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(process.env.CONTINUITY_SCREENSHOTS)await page.screenshot({path:`${process.env.CONTINUITY_SCREENSHOTS}/navigation-${width}.png`,fullPage:true});
  await link.click();await page.waitForURL('**/playground/');
  await page.waitForFunction(()=>document.querySelector('#decision')?.textContent.includes('Allowed by these rules'));
  await page.locator('#withdraw').check();await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#decision')?.textContent.includes('Not allowed by these rules'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 assert.deepEqual(errors,[]);console.log('PASS: navigation, keyboard tabs/page link, 390/768/1440px layout, actual playground worker and revocation');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
