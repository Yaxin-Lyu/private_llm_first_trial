const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function validateChat(chat) {
  if(!chat||typeof chat.title!=='string'||!Array.isArray(chat.messages)||!chat.messages.length)throw Error('当前对话没有内容可以导出。');
  if(chat.title.length>500||chat.messages.length>5000||JSON.stringify(chat).length>5_000_000)throw Error('对话过大，请拆分后导出。');
  for(const m of chat.messages) {
    if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')throw Error('聊天内容格式无效。');
    if(m.pending)throw Error('请等待这段回复结束后再导出。');
    if(m.attachments!==undefined&&(!Array.isArray(m.attachments)||m.attachments.length>4))throw Error('聊天附件格式无效。');
    if(m.sources!==undefined&&(!Array.isArray(m.sources)||m.sources.length>8))throw Error('引用来源格式无效。');
  }
}
async function chatHTML(chat,store,date=new Date()) {
  validateChat(chat);
  const warnings=[],rows=[];let bytes=0;
  for(const [i,m] of chat.messages.entries()) {
    const files=[];
    for(const ref of m.attachments||[]) {
      let file;
      try{file=await store.get(ref?.id);}catch{
        warnings.push('有附件已丢失');files.push('<p class="note">附件不可用：'+escape(ref?.name||'未命名附件')+'</p>');continue;
      }
      if(file.mime.startsWith('image/')) {
        bytes+=file.size;
        if(bytes>100*1024*1024)throw Error('图片累计超过 100 MB，请拆分对话后导出。');
        files.push('<figure><img src="data:'+file.mime+';base64,'+file.data.toString('base64')+'" alt="'+escape(file.name)+'"><figcaption>'+escape(file.name)+'</figcaption></figure>');
      } else files.push('<p class="note">PDF 附件：'+escape(file.name)+'（原附件内容未嵌入，请另行分享原文件）</p>');
    }
    const sources=(m.sources||[]).map(s=>'<div class="source"><b>['+escape(s.index)+'] '+escape(s.relativePath||s.name)+(s.page?' · 第 '+escape(s.page)+' 页':' · 片段 '+escape(s.part))+'</b><div class="text">'+escape(s.text)+'</div></div>').join('');
    rows.push('<section><h2>'+String(i+1).padStart(2,'0')+' · '+(m.role==='user'?'你':'lyx')+(m.failed?' · 请求未完成':'')+'</h2>'+files.join('')+'<div class="text">'+escape(m.content)+'</div>'+(sources?'<div class="sources"><h3>引用来源'+(m.libraryMode==='overview'?'（文档开头概览）':'')+'</h3>'+sources+'</div>':'')+'</section>');
  }
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'"><title>'+escape(chat.title)+'</title><style>'+`
    @page{size:A4;margin:18mm 18mm 20mm}*{box-sizing:border-box}body{color:#282d29;font:11pt/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0}
    h1{font-size:23pt;line-height:1.4;margin:0 0 10pt;overflow-wrap:anywhere}header{border-bottom:1px solid #ccc;padding-bottom:14pt;margin-bottom:22pt}.meta,.note,figcaption{font-size:9pt;color:#626b64}
    h2{font-size:11pt;color:#8d644a;margin:0 0 9pt;break-after:avoid}h3{font-size:10pt;margin:0 0 8pt;break-after:avoid}
    section{margin:0 0 23pt}.text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;orphans:3;widows:3}
    .sources{border-top:1px solid #ddd;margin-top:12pt;padding-top:10pt}.source{font-size:9pt;margin:0 0 10pt}.source b{display:block;overflow-wrap:anywhere;break-after:avoid}
    figure{margin:8pt 0 14pt;break-inside:avoid}img{max-width:100%;max-height:175mm;object-fit:contain;display:block}figcaption{overflow-wrap:anywhere;margin-top:5pt}
  `+'</style></head><body><header><h1>'+escape(chat.title)+'</h1><div class="meta">lyx 对话记录 · '+escape(date.toLocaleString('zh-CN'))+' · '+chat.messages.length+' 条消息</div></header>'+rows.join('')+'</body></html>';
  return {html,warnings:[...new Set(warnings)]};
}

async function exportChatPDF({chat,store,parent,BrowserWindow,dialog,tempPath}) {
  validateChat(chat);
  const name=chat.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'').trim().slice(0,80)||'lyx 对话';
  const choice=await dialog.showSaveDialog(parent,{title:'分享对话为 PDF',defaultPath:name+'.pdf',filters:[{name:'PDF 文档',extensions:['pdf']}]});
  if(choice.canceled||!choice.filePath)return {canceled:true};
  const destination=/\.pdf$/i.test(choice.filePath)?choice.filePath:choice.filePath+'.pdf';
  const {html,warnings}=await chatHTML(chat,store);
  let win,temp,staging,timer;
  try {
    temp=await fs.mkdtemp(path.join(tempPath,'lyx-pdf-'));
    const filename=path.join(temp,'conversation.html');await fs.writeFile(filename,html,{mode:0o600});
    win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'lyx-export-'+randomUUID()}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    const render=async()=>{
      await win.loadFile(filename);
      await win.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images,img=>img.decode())]).then(()=>true)');
      return win.webContents.printToPDF({pageSize:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,
        headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;color:#888;text-align:center;width:100%">lyx · <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
    };
    const pdf=await Promise.race([render(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF 生成超时，请拆分对话后重试。')),60000);})]);
    staging=path.join(path.dirname(destination),'.lyx-export-'+randomUUID()+'.tmp');
    await fs.writeFile(staging,pdf,{mode:0o600,flag:'wx'});await fs.rename(staging,destination);staging=null;
    return {canceled:false,name:path.basename(destination),warnings};
  } finally {
    clearTimeout(timer);if(win&&!win.isDestroyed())win.destroy();
    if(temp)await fs.rm(temp,{recursive:true,force:true});
    if(staging)await fs.rm(staging,{force:true});
  }
}
module.exports={validateChat,chatHTML,exportChatPDF};
