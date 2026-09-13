import fs from 'node:fs';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
fs.mkdirSync(path.join(root,'dom'),{recursive:true});
const target=process.argv[2]||'49A2877942F82B7EB8F926071B4D481B';
const jobs=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'))).slice(Number(process.argv[3]||0),Number(process.argv[4]||149));
const expression=`JSON.stringify((()=>{const get=t=>Array.from(document.querySelectorAll('div.text-title')).find(e=>e.textContent.trim()===t);const d=get('工作职责'),q=get('任职资格');return {url:location.href,title:document.querySelector('.text-h2')?.textContent,responsibilities:d?.nextElementSibling?.textContent,qualifications:q?.nextElementSibling?.textContent,raw_text:d?.parentElement?.innerText,meta:Array.from(d?.parentElement?.querySelectorAll('span')||[]).map(e=>e.textContent).filter(t=>/^(工作地点|项目|职位方向|子方向)：/.test(t))}})())`;
let n=0;for(const job of jobs){const file=path.join(root,'dom',job.id+'.json');if(fs.existsSync(file)){n++;continue;}let data;
for(let attempt=0;attempt<3;attempt++){
 await fetch('http://localhost:3456/eval?target='+target,{method:'POST',body:`location.href=${JSON.stringify(job.url)}; true`});
 for(let poll=0;poll<30;poll++){
  try{const r=await fetch('http://localhost:3456/eval?target='+target,{method:'POST',body:expression});const j=await r.json();data=JSON.parse(j.value);if(data.title===job.title&&data.qualifications?.trim().length>5&&data.responsibilities?.trim().length>5)break;}catch{}
  await new Promise(r=>setTimeout(r,400));
 }
 if(data?.title===job.title&&data?.qualifications?.trim().length>5&&data?.responsibilities?.trim().length>5)break;
}
if(data?.title!==job.title||!(data?.qualifications?.trim().length>5)||!(data?.responsibilities?.trim().length>5)){console.log('FAILED',job.id);continue;}
data.verified_at=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(data,null,2));console.log(++n+'/'+jobs.length+' VERIFIED '+job.id);
}
