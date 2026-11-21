(() => {
  const get=id=>document.getElementById('library-'+id);
  let documents=[],importId=null,loading=false;
  const expanded=new Set();
  const status=text=>get('status').textContent=clean(text);
  const clean=value=>String(value||'操作失败').replace(/Error invoking remote method '[^']+': (?:Error: )?/g,'');
  const selected=()=>window.chatLibrary.getSelected(),busy=()=>Boolean(importId)||window.chatLibrary.busy();
  function selection(ids) {
    try{window.chatLibrary.setSelected(ids);render();}
    catch(e){status(e.message);}
  }
  function render() {
    const ids=new Set(selected()),query=get('search').value.trim().toLowerCase();
    const entries=documents.flatMap(doc=>(doc.locations?.length?doc.locations:[{rootId:doc.relativePath.includes('/')?'legacy:'+doc.relativePath.split('/')[0]:'files',relativePath:doc.relativePath}]).map(location=>({...doc,...location})));
    const rows=entries.filter(doc=>(doc.relativePath+' '+doc.name).toLowerCase().includes(query));
    get('files').replaceChildren();
    function fileRow(doc) {
      const row=document.createElement('div');row.className='library-file'+(ids.has(doc.id)?' chosen':'');
      const check=document.createElement('input');check.type='checkbox';check.checked=ids.has(doc.id);check.disabled=busy();
      check.setAttribute('aria-label','选择 '+doc.name);
      check.onchange=()=>selection(check.checked?[...selected(),doc.id]:selected().filter(id=>id!==doc.id));
      const details=document.createElement('div');details.className='library-file-copy';
      const title=document.createElement('b');title.textContent=doc.name;
      const location=document.createElement('span');location.textContent=doc.relativePath;
      const info=document.createElement('small');info.textContent=doc.extension.slice(1).toUpperCase()+' · '+Math.ceil(doc.size/1024)+' KB · '+doc.characters.toLocaleString()+' 字符'+(doc.pages?' · '+doc.pages+' 页含文字':'');
      details.append(title,location,info);
      if(doc.warnings?.length){const note=document.createElement('small');note.className='library-warning';note.textContent=doc.warnings.join(' ');details.append(note);}
      const preview=document.createElement('button');preview.className='library-text-button';preview.textContent='预览';
      preview.onclick=async()=>{
        try{
          const value=await window.lyx.previewLibrary(doc.id);
          get('preview-title').textContent=value.name;get('preview-text').textContent=value.text;
          get('preview-note').textContent=(value.truncated?'仅预览前 40,000 字符，检索使用完整提取文字。 ':'')+(value.warnings||[]).join(' ');
          get('preview-dialog').showModal();
        }catch(e){status(e.message);}
      };
      const remove=document.createElement('button');remove.className='library-text-button danger';remove.textContent='移除';remove.disabled=busy();
      remove.onclick=async()=>{
        if(!confirm('从资料库移除“'+doc.name+'”及它在所有文件夹中的记录？原文件不会删除，已有聊天中的引用片段仍会保留。'))return;
        remove.disabled=true;
        try{await window.lyx.removeLibrary(doc.id);await refresh();status('已从资料库移除。');}
        catch(e){status(e.message);remove.disabled=false;}
      };
      row.append(check,details,preview,remove);return row;
    }
    const roots=new Map();
    for(const doc of rows){
      const parts=doc.relativePath.split('/').filter(Boolean),folder=parts.length>1;
      const key=folder?doc.rootId:'files';
      if(!roots.has(key))roots.set(key,{key,name:folder?parts[0]:'单独导入的文件',children:new Map(),files:[],ids:new Set()});
      let node=roots.get(key);node.ids.add(doc.id);
      for(const part of parts.slice(folder?1:0,-1)){
        const childKey=node.key+'/'+part;
        if(!node.children.has(part))node.children.set(part,{key:childKey,name:part,children:new Map(),files:[],ids:new Set()});
        node=node.children.get(part);node.ids.add(doc.id);
      }
      node.files.push(doc);
    }
    function folderRow(node,depth=0){
      const wrapper=document.createElement('div');wrapper.className='library-folder';
      const header=document.createElement('div');header.className='library-folder-header';
      const check=document.createElement('input');check.type='checkbox';check.disabled=busy();
      const count=[...node.ids].filter(id=>ids.has(id)).length;
      check.checked=count===node.ids.size;check.indeterminate=count>0&&count<node.ids.size;
      check.setAttribute('aria-label','选择文件夹 '+node.name);
      check.onchange=()=>selection(check.checked?[...new Set([...selected(),...node.ids])]:selected().filter(id=>!node.ids.has(id)));
      const toggle=document.createElement('button');toggle.className='library-folder-toggle';
      const isOpen=Boolean(query)||expanded.has(node.key);
      toggle.textContent=(isOpen?'▾':'▸')+'　▱ '+node.name;toggle.setAttribute('aria-expanded',String(isOpen));
      toggle.onclick=()=>{if(expanded.has(node.key))expanded.delete(node.key);else expanded.add(node.key);render();};
      const info=document.createElement('span');info.textContent=count+' / '+node.ids.size+' 份';
      header.append(check,toggle,info);wrapper.append(header);
      const content=document.createElement('div');content.className='library-folder-content';content.hidden=!isOpen;
      // Cap visual indentation for deeply nested imported directories.
      if(depth>=3)content.style.marginLeft='0';
      for(const child of [...node.children.values()].sort((a,b)=>a.name.localeCompare(b.name)))content.append(folderRow(child,depth+1));
      for(const doc of node.files)content.append(fileRow(doc));
      wrapper.append(content);return wrapper;
    }
    for(const root of roots.values())get('files').append(folderRow(root));
    get('files').hidden=!rows.length;get('empty').hidden=rows.length>0;
    get('empty').querySelector('h2').textContent=documents.length?'没有匹配的资料':'把你的资料放进来';
    get('empty').querySelector('p').textContent=documents.length?'试试其他文件名或文件夹名称。':'可以一次选择多个文件，也可以选择整个文件夹。导入后会保留副本，原文件不受影响。';
    get('count').textContent=documents.length?new Set(rows.map(d=>d.id)).size+' / '+documents.length+' 份资料':'还没有资料';
    get('selected-count').textContent='已选 '+ids.size+' 份';
    get('use').disabled=!ids.size||busy();
    for(const id of ['import-files','import-folder','select-visible','unselect-all'])get(id).disabled=busy();
    get('context').hidden=!ids.size;get('context-label').textContent='本次参考资料库 · '+ids.size+' 份';
    get('context-clear').disabled=window.chatLibrary.busy();
  }
  async function refresh() {
    if(!window.lyx?.listLibrary){status('请打开 lyx 桌面 App 使用资料库。');return;}
    if(loading)return;loading=true;
    try{documents=await window.lyx.listLibrary();window.chatLibrary.prune(documents.map(x=>x.id));render();}
    catch(e){status(e.message);}finally{loading=false;}
  }
  async function importDocuments(kind) {
    if(importId||!window.lyx)return;
    importId=crypto.randomUUID();get('progress').hidden=false;get('progress-text').textContent='请选择要导入的'+(kind==='files'?'文件':'文件夹')+'…';
    get('import-stop').disabled=false;render();status('导入过程中不会调用 OpenAI。');
    try{
      const report=await window.lyx.importLibrary(kind,importId,progress=>{
        get('progress-text').textContent=progress.stage==='scan'?progress.name:'正在处理 '+progress.done+' / '+progress.total+'：'+progress.name;
      });
      get('report').hidden=false;
      get('report-summary').textContent=(report.cancelled?'已取消或停止 · ':'导入完成 · ')+report.added+' 个新增，'+report.duplicates+' 个重复，'+report.skipped+' 个跳过';
      get('report-issues').replaceChildren();
      for(const issue of report.issues){const li=document.createElement('li');li.textContent=issue.name+'：'+issue.reason;get('report-issues').append(li);}
      if(report.skipped>report.issues.length){const li=document.createElement('li');li.textContent='仅显示前 '+report.issues.length+' 条跳过原因。';get('report-issues').append(li);}
      get('report').open=report.issues.length>0;
      status(report.added?'导入成功。勾选需要参考的资料，再点击“用所选资料提问”。':'没有新增资料，请查看导入结果。');
    }catch(e){status(e.message);}
    finally{importId=null;get('progress').hidden=true;await refresh();render();}
  }
  get('import-files').onclick=()=>importDocuments('files');
  get('import-folder').onclick=()=>importDocuments('folder');
  get('import-stop').onclick=async()=>{
    if(!importId)return;get('import-stop').disabled=true;
    try{await window.lyx.cancelLibraryImport(importId);}catch(e){status(e.message);get('import-stop').disabled=false;}
  };
  get('search').oninput=render;
  get('select-visible').onclick=()=>{
    const query=get('search').value.trim().toLowerCase(),ids=new Set(selected());
    for(const doc of documents.filter(doc=>[doc.relativePath,doc.name,...(doc.locations||[]).map(x=>x.relativePath)].join(' ').toLowerCase().includes(query)))ids.add(doc.id);
    selection([...ids]);
  };
  get('unselect-all').onclick=()=>selection([]);
  get('use').onclick=()=>{window.showWorkspace('chat');document.getElementById('message-input').focus();};
  get('context-manage').onclick=()=>window.showWorkspace('library');
  get('context-clear').onclick=()=>selection([]);
  get('preview-close').onclick=()=>get('preview-dialog').close();
  document.getElementById('source-close').onclick=()=>document.getElementById('source-dialog').close();
  window.openLibrarySource=source=>{
    document.getElementById('source-title').textContent='['+source.index+'] '+source.name+(source.page?' · 第 '+source.page+' 页':' · 片段 '+source.part);
    document.getElementById('source-text').textContent=source.text;
    document.getElementById('source-dialog').showModal();
  };
  window.addEventListener('lyx-workspace',event=>{if(event.detail==='library')refresh();});
  window.addEventListener('lyx-chat-changed',render);
  refresh();
})();
