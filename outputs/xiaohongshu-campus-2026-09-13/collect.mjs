import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
fs.mkdirSync(path.join(root,'raw'),{recursive:true});
const save=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2));
const target='D265E016F4909C45614E0D08E3DD749C';
async function evaluate(js){const r=await fetch('http://localhost:3456/eval?target='+target,{method:'POST',body:js});const j=await r.json();if(j.error)throw Error(JSON.stringify(j));return typeof j.value==='string'?JSON.parse(j.value):j.value;}
const snapshot=`JSON.stringify({url:location.href,page:Number(document.querySelector('.ant-pagination-item-active')?.textContent),total:Number(document.body.innerText.match(/全部职位[（(](\\d+)/)?.[1]),nextDisabled:document.querySelector('.ant-pagination-next')?.getAttribute('aria-disabled'),jobs:Array.from(document.querySelectorAll('a[href]')).filter(a=>/\\/campus\\/position\\/\\d+$/.test(a.href)).map(a=>({id:a.href.split('/').pop(),url:a.href,title:a.children[0].textContent,meta:Array.from(a.children[1].querySelectorAll('span')).filter(s=>!s.className).map(s=>s.textContent),responsibilities:a.children[2].textContent,raw_list_text:a.innerText}))})`;
if(process.argv[2]==='list'){
 const pages=[]; let previous='';
 for(let page=1;page<=30;page++){
  let s;
  for(let retry=0;retry<30;retry++) {s=await evaluate(snapshot);if(s.page===page&&s.jobs.length&&s.jobs.map(x=>x.id).join()!==previous)break;await new Promise(r=>setTimeout(r,500));}
  if(s.page!==page||!s.jobs.length||s.jobs.map(x=>x.id).join()===previous)throw Error('Page failed '+page);
  s.observed_at=new Date().toISOString();pages.push(s);save('list-pages.json',pages);previous=s.jobs.map(x=>x.id).join();
  console.log('Page',page,'jobs',s.jobs.length,'total',s.total);
  if(s.nextDisabled==='true')break;
  await evaluate(`document.querySelector('.ant-pagination-next button').click(); JSON.stringify(true)`);
 }
 const jobs=[...new Map(pages.flatMap(p=>p.jobs.map(j=>({...j,first_seen_at:p.observed_at}))).map(j=>[j.id,j])).values()];
 save('inventory.json',jobs);console.log('UNIQUE',jobs.length,'EXPECTED',pages.at(-1).total);
 if(jobs.length!==pages.at(-1).total)process.exitCode=2;
}
if(process.argv[2]==='details'){
 const jobs=JSON.parse(fs.readFileSync(path.join(root,'inventory.json')));let next=0,done=0;const metrics=[];const start=Date.now();
 await Promise.all(Array.from({length:4},async()=>{while(next<jobs.length){const job=jobs[next++],file=path.join(root,'raw',job.id+'.md');if(fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes('任职资格')){done++;continue;}let ok=false;for(let attempt=1;attempt<=3&&!ok;attempt++){let t=Date.now();try{const {stdout,stderr}=await run('dokobot.cmd',['read',job.url,'--local','--timeout','45'],{shell:true,timeout:65000,maxBuffer:2*1024*1024,windowsHide:true});if(!stdout.includes('任职资格')||!stdout.includes(job.title))throw Error('Missing title or qualifications: '+stdout.slice(0,100));fs.writeFileSync(file,stdout);metrics.push({id:job.id,attempt,seconds:(Date.now()-t)/1000,verified_at:new Date().toISOString(),ok:true});ok=true;}catch(e){metrics.push({id:job.id,attempt,seconds:(Date.now()-t)/1000,ok:false,error:String(e).slice(0,300)});}save('timing.json',{started_at:new Date(start).toISOString(),elapsed_seconds:(Date.now()-start)/1000,completed:done,metrics});}done++;console.log(`${done}/${jobs.length} ${job.id} ${ok?'OK':'FAILED'}`);}}));
 save('timing.json',{started_at:new Date(start).toISOString(),elapsed_seconds:(Date.now()-start)/1000,completed:done,metrics});
}
