import {createServer} from "node:http"; import {readFile} from "node:fs/promises"; import {dirname, join} from "node:path"; import {spawn} from "node:child_process"; import {fileURLToPath} from "node:url"; import WebSocket from "ws";
const KIT=join(dirname(fileURLToPath(import.meta.url)),".."); const PORT=8425;
const PAGE=`<!doctype html><meta charset=utf-8><link rel=stylesheet href=/s.css><script src=/b.js></script>`;
const server=createServer(async(req,res)=>{const u=(req.url||"/").split("?")[0]; if(u==="/"){res.writeHead(200,{"content-type":"text/html"});return void res.end(PAGE);} const f=u==="/s.css"?join(KIT,"dist","style.css"):join(KIT,"dist","macos-ui-kit.iife.js"); try{const b=await readFile(f); res.writeHead(200,{"content-type":u.endsWith(".css")?"text/css":"text/javascript"}); res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(PORT,"127.0.0.1",r));
const proc=spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--remote-debugging-port=9685","--no-first-run","--disable-gpu","--user-data-dir="+join(process.cwd(),".shot30"),"about:blank"],{stdio:"ignore"});
let t=null; for(let i=0;i<60;i++){try{t=await(await fetch("http://127.0.0.1:9685/json/list")).json(); if(t.length)break;}catch{} await new Promise(r=>setTimeout(r,250));}
const page=t.find(x=>x.type==="page")??t[0]; const ws=new WebSocket(page.webSocketDebuggerUrl); let id=0; const pend=new Map();
ws.on("message",raw=>{const m=JSON.parse(raw.toString()); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>ws.on("open",r));
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate",{url:`http://127.0.0.1:${PORT}/`}); await new Promise(r=>setTimeout(r,1800));
const ev=async e=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true}); if(r?.exceptionDetails) return {ERR:r.exceptionDetails.exception?.description}; return r?.result?.value;};
console.log(JSON.stringify(await ev(`(()=>{
  const sw = new MacUI.Switch({checked:false}); document.body.appendChild(sw.element);
  sw.setChecked(true);
  const box = sw.element.querySelector('[role=switch], input');
  const swEls = [...sw.element.querySelectorAll('*')].map(e=>e.tagName+'.'+(e.className||'')+' role='+(e.getAttribute('role')||'-')+' aria='+(e.getAttribute('aria-checked')||'-')+' checked='+(e.checked ?? '-'));
  const cw = new MacUI.ColorWell({value:'#ff0000'}); document.body.appendChild(cw.element);
  cw.setValue('#00ff00');
  const swatch = cw.element.querySelector('.mac-colorwell__swatch');
  return {
    switchRoot: sw.element.tagName+'.'+sw.element.className+' role='+sw.element.getAttribute('role')+' aria='+sw.element.getAttribute('aria-checked'),
    switchBox: box ? box.tagName+'.'+box.className+' aria='+box.getAttribute('aria-checked') : null,
    switchKids: swEls,
    colorwellRootVar: cw.element.style.getPropertyValue('--mac-colorwell-value'),
    swatchBg: swatch ? getComputedStyle(swatch).backgroundColor : null,
    swatchVar: swatch ? getComputedStyle(swatch).getPropertyValue('--mac-colorwell-value') : null,
    swatchHtml: swatch ? swatch.outerHTML.slice(0,120) : null,
  };})()`),null,1));
try{proc.kill();}catch{} server.close(); process.exit(0);
