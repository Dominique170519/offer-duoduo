import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const jobs=JSON.parse(await fs.readFile(path.join(root,'jobs.json'),'utf8'));
const wb=Workbook.create(),s=wb.worksheets.add('岗位列表'),d=wb.worksheets.add('职责与资格全文');
const headers=['岗位ID','岗位名称','工作地点','方向','子方向','招聘项目','状态','学历要求（原句）','专业要求（原句）','技能关键词（非穷尽）','毕业要求（原句）','官网详情与投递入口','最近核验（北京时间）','首次采集（北京时间）','公司','招聘类型','部门','团队','薪资','官网发布时间','截止时间'];
const date=v=>(Date.parse(v)+8*3600000)/86400000+25569;
const rows=jobs.map(j=>[j.source_job_id,j.job_title,j.locations.join('、'),j.job_direction,j.job_subdirection,j.recruitment_project,j.status,j.education_requirement,j.major_requirement,j.skills.join('、'),j.graduation_requirement,j.detail_url,date(j.last_verified_at),date(j.first_seen_at),j.company_name,j.recruitment_type,j.department,j.team,j.salary,j.published_at,j.deadline_at]);
const widths=[12,62,24,12,24,24,10,65,65,48,65,75,27,27,14,14,20,20,20,22,22];
const end=rows.length+6;
s.getRange(`A1:U${end}`).format.font={name:'Arial',size:10,color:'#222222'};
s.getRange('B2').values=[['小红书 2027 校园招聘']];s.getRange('B2').format.font={size:16,bold:true};
s.getRange('B3').values=[[`2026-09-13 采集，共 ${jobs.length} 个岗位。职责与任职资格全文在第二张表，按岗位ID筛选。`]];
s.getRange('B4').values=[['空白表示未结构化确认。技能仅为资格原文中的关键词，不表示均为必需项。']];
s.getRange('B5').values=[['来源：https://job.xiaohongshu.com/campus/position']];
s.getRange(`A6:U${end}`).values=[headers,...rows];
const t=s.tables.add(`A6:U${end}`,true,'CampusJobs');t.showFilterButton=true;
s.getRange(`A7:U${end}`).format.wrapText=true;s.getRange(`A7:U${end}`).format.verticalAlignment='top';
s.getRange('A6:U6').format={fill:'#8E243A',font:{color:'#FFFFFF',bold:true,size:10},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:32};
widths.forEach((w,i)=>s.getRangeByIndexes(0,i,end,1).format.columnWidth=w);
s.getRange(`M7:N${end}`).setNumberFormat('yyyy-mm-dd hh:mm:ss');
s.getRange(`A7:A${end}`).setNumberFormat('@');
const weighted=t=>Array.from(String(t??'')).reduce((n,c)=>n+(/[^\x00-\xff]/.test(c)?2:1),0);
rows.forEach((row,i)=>{const lines=Math.max(...row.map((v,k)=>String(v??'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(weighted(l)/(widths[k]-3))),0)));s.getRangeByIndexes(i+6,0,1,21).format.rowHeight=Math.max(42,lines*15+12);});
s.freezePanes.freezeRows(6);s.freezePanes.freezeColumns(2);s.showGridLines=false;s.tabColor='#8E243A';
const fragments=[];
for(const j of jobs)for(const [section,key]of [['工作职责','responsibilities'],['任职资格','qualifications']]){let n=0;for(const line of j[key].split('\n')){if(!line.trim())continue;const chars=Array.from(line);for(let i=0;i<chars.length;i+=200)fragments.push([j.source_job_id,j.job_title,section,++n,chars.slice(i,i+200).join('')]);}}
const fend=fragments.length+5;
d.getRange(`A1:E${fend}`).format.font={name:'Arial',size:10,color:'#222222'};
d.getRange('B2').values=[['工作职责与任职资格全文']];d.getRange('B2').format.font={size:16,bold:true};
d.getRange('B3').values=[['按岗位ID及栏目筛选，按段落顺序阅读。长段分行保存，文字未删减。']];
d.getRange('B4').values=[['来源为岗位列表中的官网详情链接。完整原始分段另保留在 JSON 和 Markdown 中。']];
d.getRange(`A5:E${fend}`).values=[['岗位ID','岗位名称','栏目','段落顺序','原文'],...fragments];
const dt=d.tables.add(`A5:E${fend}`,true,'JobFullText');dt.showFilterButton=true;
[12,60,14,12,110].forEach((w,i)=>d.getRangeByIndexes(0,i,fend,1).format.columnWidth=w);
d.getRange(`A6:E${fend}`).format.wrapText=true;d.getRange(`A6:E${fend}`).format.verticalAlignment='top';
d.getRange('A5:E5').format={fill:'#8E243A',font:{color:'#FFFFFF',bold:true,size:10},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30};
fragments.forEach((r,i)=>d.getRangeByIndexes(i+5,0,1,5).format.rowHeight=Math.max(42,Math.ceil(weighted(r[4])/104)*15+14,Math.ceil(weighted(r[1])/54)*15+14));
d.freezePanes.freezeRows(5);d.freezePanes.freezeColumns(2);d.showGridLines=false;
// Confirm no source text was dropped during display chunking.
for(const j of jobs)for(const [section,key]of [['工作职责','responsibilities'],['任职资格','qualifications']]){
 const actual=fragments.filter(r=>r[0]===j.source_job_id&&r[2]===section).map(r=>r[4]).join('');
 const expected=j[key].split('\n').filter(x=>x.trim()).join('');if(actual!==expected)throw Error('Text reconstruction failed '+j.source_job_id);
}
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'岗位列表!A6:G10',include:'values',tableMaxRows:5,tableMaxCols:7,maxChars:1800})).ndjson);
for(const [sheetName,range,name]of [['岗位列表','A1:G10','preview-list.png'],['职责与资格全文','A1:E10','preview-detail.png']]){
 const image=await wb.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(root,name),new Uint8Array(await image.arrayBuffer()));
}
const out=await SpreadsheetFile.exportXlsx(wb);await out.save(path.join(root,'小红书2027校招岗位.xlsx'));
console.log(JSON.stringify({jobs:jobs.length,fulltext_rows:fragments.length,output:'小红书2027校招岗位.xlsx'}));
