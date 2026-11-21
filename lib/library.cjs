const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {Worker}=require('node:worker_threads');
const EXTENSIONS=['.pdf','.docx','.txt','.md','.markdown','.csv','.json'];
const MAX_FILE_BYTES=10*1024*1024,MAX_BATCH_BYTES=100*1024*1024,MAX_BATCH_FILES=200,MAX_DOCUMENTS=500;
const ID=/^[0-9a-f-]{36}$/;
function extractDocument(bytes,extension,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted) return reject(Error('导入已停止。'));
    const worker=new Worker(path.join(__dirname,'extract-worker.cjs'),{
      workerData:{bytes,extension},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:192}
    });
    let settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      worker.terminate().catch(()=>{});
      if(error)reject(error);else resolve(value);
    };
    const timer=setTimeout(()=>finish(Error('文件处理超过 30 秒，请拆分或重新导出后再试。')),30000);
    const abort=()=>finish(Error('导入已停止。'));
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',result=>finish(result.error?Error(result.error):null,result.value));
    worker.once('error',()=>finish(Error('文件解析失败或占用内存过多，请重新导出或拆分。')));
    worker.once('exit',()=>{if(!settled)finish(Error('文件解析进程提前结束，请换一个文件重试。'));});
  });
}
function splitPages(pages) {
  const chunks=[];
  for(const page of pages) {
    for(let start=0;start<page.text.length;) {
      let end=Math.min(start+1100,page.text.length);
      if(end<page.text.length) {
        const split=page.text.lastIndexOf('\n',end);
        if(split>start+550) end=split;
      }
      chunks.push({page:page.page,part:chunks.length+1,text:page.text.slice(start,end).trim()});
      if(end===page.text.length)break;start=end-120;
    }
  }
  return chunks;
}
function queryTerms(text) {
  const stop=new Set(['的','了','是','在','和','与','我','你','它','这','请','什么','如何','怎么','哪些','这个','这些','资料','文档','文件','告诉','一下','the','a','an','is','are','of','to','in','what','how','please','this','these','and','for','me','about']);
  const words=[...new Intl.Segmenter('zh',{granularity:'word'}).segment(text.normalize('NFKC').toLowerCase())]
    .filter(x=>x.isWordLike).map(x=>x.segment).filter(x=>!stop.has(x)&&x.length>1);
  return [...new Set(words)].slice(0,60);
}
function retrieve(documents,query) {
  const candidates=documents.flatMap(doc=>splitPages(doc.pages).map(chunk=>({...chunk,id:doc.id,name:doc.name,relativePath:doc.relativePath,
    haystack:(doc.name+' '+chunk.text).normalize('NFKC').toLowerCase()})));
  const terms=queryTerms(query),N=candidates.length;
  const frequency=new Map(terms.map(t=>[t,candidates.filter(c=>c.haystack.includes(t)).length]));
  for(const c of candidates) c.score=terms.reduce((score,term)=>{
    const n=frequency.get(term);if(!n||!c.haystack.includes(term))return score;
    const count=Math.min(4,c.haystack.split(term).length-1);
    return score+Math.log(1+(N-n+0.5)/(n+0.5))*(1+Math.log(count));
  },0);
  let matches=candidates.filter(c=>c.score>0).sort((a,b)=>b.score-a.score),mode='search';
  if(!matches.length&&/总结|概览|概括|摘要|大意|summari[sz]e|summary|overview/i.test(query)) {
    matches=documents.flatMap(doc=>candidates.filter(c=>c.id===doc.id).slice(0,1));mode='overview';
  }
  const perFile=new Map(),sources=[];
  for(const candidate of matches) {
    if((perFile.get(candidate.id)||0)>=3)continue;
    perFile.set(candidate.id,(perFile.get(candidate.id)||0)+1);
    const {haystack,score,...source}=candidate;
    sources.push({...source,index:sources.length+1});
    if(sources.length===8)break;
  }
  return {sources,mode};
}
// Scan one document at a time in two passes. Folder selection may contain the
// entire library; keep only the best eight chunks instead of retaining all text.
async function retrieveStored(ids,query,get) {
  const terms=queryTerms(query),frequency=new Map(terms.map(t=>[t,0]));let count=0;
  const chunks=doc=>splitPages(doc.pages).map(c=>({...c,id:doc.id,name:doc.name,relativePath:doc.relativePath,
    haystack:(doc.name+' '+c.text).normalize('NFKC').toLowerCase()}));
  for(const id of ids){
    for(const c of chunks(await get(id))){count++;for(const t of terms)if(c.haystack.includes(t))frequency.set(t,frequency.get(t)+1);}
    await new Promise(resolve=>setImmediate(resolve));
  }
  let best=[],overview=[];
  for(const id of ids) {
    const candidates=chunks(await get(id));if(overview.length<8&&candidates[0])overview.push(candidates[0]);
    for(const c of candidates)c.score=terms.reduce((score,t)=>{
      const n=frequency.get(t);if(!n||!c.haystack.includes(t))return score;
      return score+Math.log(1+(count-n+0.5)/(n+0.5))*(1+Math.log(Math.min(4,c.haystack.split(t).length-1)));
    },0);
    best=[...best,...candidates.filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,3)].sort((a,b)=>b.score-a.score).slice(0,8);
    await new Promise(resolve=>setImmediate(resolve));
  }
  let mode='search';
  if(!best.length&&/总结|概览|概括|摘要|大意|summari[sz]e|summary|overview/i.test(query)){best=overview;mode='overview';}
  return {sources:best.map(({haystack,score,...source},i)=>({...source,index:i+1})),mode};
}
function locationsFor(doc) {
  return doc.locations?.length?doc.locations:[{rootId:doc.relativePath.includes('/')?'legacy:'+doc.relativePath.split('/')[0]:'files',relativePath:doc.relativePath}];
}
function createLibrary(directory,{extract=extractDocument}={}) {
  const root=path.join(directory,'documents');
  function folder(id) {
    if(typeof id!=='string'||!ID.test(id))throw Error('资料编号无效。');
    return path.join(root,id);
  }
  async function list() {
    let entries;
    try{entries=await fs.readdir(root);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    const rows=[];
    for(const id of entries.filter(x=>ID.test(x))) {
      try {
        const meta=JSON.parse(await fs.readFile(path.join(folder(id),'meta.json'),'utf8'));
        if(meta.id===id&&typeof meta.name==='string')rows.push(meta);
      } catch {}
    }
    return rows.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));
  }
  async function get(id) {
    const dir=folder(id);
    try {
      const meta=JSON.parse(await fs.readFile(path.join(dir,'meta.json'),'utf8'));
      const pages=JSON.parse(await fs.readFile(path.join(dir,'text.json'),'utf8'));
      return {...meta,pages};
    } catch {throw Error('资料文件已丢失或损坏，请重新导入。');}
  }
  async function importPaths(paths,onProgress=()=>{},signal) {
    const report={added:0,duplicates:0,skipped:0,issues:[],cancelled:false},files=[];
    let scanned=0,scanLimit=false,batchBytes=0;
    const issue=(name,reason)=>{report.skipped++;if(report.issues.length<50)report.issues.push({name,reason});};
    async function walk(filename,base,rootId,depth=0) {
      if(signal?.aborted)return;
      if(++scanned>5000||files.length>=MAX_BATCH_FILES) {scanLimit=true;return;}
      let stat;try{stat=await fs.lstat(filename);}catch{issue(path.basename(filename),'没有读取权限。');return;}
      const name=path.basename(filename);
      if(stat.isSymbolicLink()){issue(name,'已跳过符号链接。');return;}
      if(name.startsWith('.')||['node_modules','dist','build'].includes(name)){issue(name,'已跳过隐藏文件或构建目录。');return;}
      if(stat.isDirectory()) {
        if(depth>12){issue(name,'目录层级超过 12 层。');return;}
        let names;try{names=await fs.readdir(filename);}catch{issue(name,'无法读取目录。');return;}
        for(const child of names.sort()) {if(scanLimit||signal?.aborted)break;await walk(path.join(filename,child),base,rootId,depth+1);}
      } else if(stat.isFile()) {
        const relativePath=path.relative(base,filename),extension=path.extname(name).toLowerCase();
        if(!EXTENSIONS.includes(extension)){issue(relativePath,'格式暂不支持。');return;}
        if(!stat.size||stat.size>MAX_FILE_BYTES){issue(relativePath,'文件必须非空且不超过 10 MB。');return;}
        if(batchBytes+stat.size>MAX_BATCH_BYTES){issue(relativePath,'本次累计大小超过 100 MB。');return;}
        batchBytes+=stat.size;files.push({filename,relativePath,name,extension,rootId});
      }
    }
    onProgress({stage:'scan',done:0,total:0,name:'正在扫描所选文件…'});
    for(const filename of paths){
      if(scanLimit||signal?.aborted)break;
      const stat=await fs.lstat(filename).catch(()=>null);
      const rootId=stat?.isDirectory()?'folder:'+createHash('sha256').update(path.resolve(filename)).digest('hex'):'files';
      await walk(filename,path.dirname(filename),rootId);
    }
    if(scanLimit)issue('导入数量限制','每次最多处理 200 个文件、扫描 5,000 个目录项；请分批选择。');
    const existing=await list(),hashes=new Map(existing.map(x=>[x.hash,x]));
    await fs.mkdir(root,{recursive:true});
    for(let i=0;i<files.length;i++) {
      if(signal?.aborted)break;
      const file=files[i];onProgress({stage:'extract',done:i,total:files.length,name:file.relativePath});
      let staging;
      try {
        const stat=await fs.lstat(file.filename);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)throw Error('文件类型或大小已变化，请重新选择。');
        const data=await fs.readFile(file.filename);
        if(!data.length||data.length>MAX_FILE_BYTES)throw Error('文件必须非空且不超过 10 MB。');
        const hash=createHash('sha256').update(data).digest('hex');
        const location={rootId:file.rootId,relativePath:file.relativePath};
        if(hashes.has(hash)){
          const meta=hashes.get(hash),locations=locationsFor(meta);
          // Retain every imported location even when the contents are identical.
          if(!locations.some(x=>x.rootId===location.rootId&&x.relativePath===location.relativePath)){
            meta.locations=[...locations,location];
            const target=path.join(folder(meta.id),'meta.json'),temp=target+'.tmp';
            await fs.writeFile(temp,JSON.stringify(meta),{mode:0o600});await fs.rename(temp,target);
          }
          report.duplicates++;continue;
        }
        if(existing.length+report.added>=MAX_DOCUMENTS){issue(file.relativePath,'资料库最多保存 500 个文件。');continue;}
        const parsed=await extract(data,file.extension,signal);
        if(signal?.aborted)break;
        const id=randomUUID(),meta={id,name:file.name,relativePath:file.relativePath,locations:[location],extension:file.extension,size:data.length,hash,
          characters:parsed.characters,pages:file.extension==='.pdf'?parsed.pages.length:null,warnings:parsed.warnings,importedAt:new Date().toISOString()};
        staging=path.join(root,'.import-'+id);await fs.mkdir(staging);
        await fs.writeFile(path.join(staging,'source'+file.extension),data,{mode:0o600});
        await fs.writeFile(path.join(staging,'meta.json'),JSON.stringify(meta),{mode:0o600});
        await fs.writeFile(path.join(staging,'text.json'),JSON.stringify(parsed.pages),{mode:0o600});
        await fs.rename(staging,folder(id));staging=null;hashes.set(hash,meta);report.added++;
      } catch(error) {
        if(signal?.aborted)break;
        issue(file.relativePath,error.message||'无法导入。');
      } finally {if(staging)await fs.rm(staging,{recursive:true,force:true});}
    }
    report.cancelled=Boolean(signal?.aborted);
    onProgress({stage:'done',done:files.length,total:files.length,name:''});
    return report;
  }
  return {list,get,importPaths,
    async remove(id){await fs.rm(folder(id),{recursive:true,force:true});},
    async retrieve(ids,query) {
      if(!Array.isArray(ids)||ids.length>MAX_DOCUMENTS)throw Error('最多选择 500 份资料。');
      return retrieveStored([...new Set(ids)],query,get);
    },
    async preview(id) {
      const doc=await get(id),full=doc.pages.map(p=>(p.page?'【第 '+p.page+' 页】\n':'')+p.text).join('\n\n');
      return {name:doc.name,text:full.slice(0,40000),truncated:full.length>40000,warnings:doc.warnings};
    }
  };
}
module.exports={createLibrary,extractDocument,retrieve,queryTerms,EXTENSIONS,MAX_FILE_BYTES};
