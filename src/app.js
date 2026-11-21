const STORAGE_KEY='lyx-chat-conversations-v1',MODEL_KEY='lyx-chat-model-v1';
const $=selector=>document.querySelector(selector);
const welcome=$('#welcome'),messagesEl=$('#messages'),input=$('#message-input'),form=$('#composer');
const historyEl=$('#history-list'),toastEl=$('#toast'),settings=$('#settings-dialog'),modelSelect=$('#model-select');
const previewCache=new Map(),draft=$('#draft-attachments'),picker=$('#attachment-input');
let conversations=loadConversations(),activeId=conversations[0]?.id||createConversation();
let isSending=false,isAddingFiles=false,pendingAttachments=[],sendingChatId=null,exportingChatId=null;
modelSelect.value=localStorage.getItem(MODEL_KEY)||'gpt-5-mini';
if(!modelSelect.value) modelSelect.value='gpt-5-mini';

function loadConversations() {
  try {
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    if(!Array.isArray(stored)) return [];
    return stored.filter(chat=>chat && typeof chat.id==='string' && Array.isArray(chat.messages)).map(chat=>({
      ...chat,messages:chat.messages.filter(m=>m && ['user','assistant'].includes(m.role)).map(m=>({
        ...m,content:typeof m.content==='string'?m.content:'',pending:false,failed:!!(m.failed||m.pending),
        ...(m.pending?{content:(m.content||'')+'\n上次回复已中断，请重新发送问题。'}:{})
      }))
    }));
  } catch {return [];}
}
function save() {
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(conversations));}
  catch {showToast('聊天存储空间不足，请清理旧记录后再试。');}
}
function createConversation() {
  const id=crypto.randomUUID();conversations.unshift({id,title:'新对话',messages:[]});save();return id;
}
function active(){return conversations.find(chat=>chat.id===activeId);}
window.chatLibrary={
  getSelected:()=>active()?.libraryIds||[],
  busy:()=>isSending,
  setSelected:ids=>{
    if(isSending)throw Error('请等待当前回复结束后再调整资料。');
    if(ids.length>500)throw Error('资料库最多选择 500 份资料。');
    active().libraryIds=[...new Set(ids)];save();window.dispatchEvent(new Event('lyx-chat-changed'));
  },
  prune:ids=>{
    let changed=false;const valid=new Set(ids);
    for(const chat of conversations)if(chat.libraryIds?.some(id=>!valid.has(id))){
      chat.libraryIds=chat.libraryIds.filter(id=>valid.has(id));changed=true;
    }
    if(changed)save();
  }
};
function hasDesktopBridge(){return typeof window.lyx?.hasApiKey==='function';}
function showToast(text) {
  toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toastEl.classList.remove('show'),4200);
}
async function updateConnectionMode() {
  const available=hasDesktopBridge(),connected=available && await window.lyx.hasApiKey().catch(()=>false);
  $('#connection-mode').textContent=connected?'· API 已配置':available?'· 演示模式':'· 浏览器预览';
  $('.disclaimer').textContent=connected?'回复通过 OpenAI API 生成。图片和 PDF 会随对话发送，用量计入 API 账户。'
    :available?'在设置中保存 API Key，即可聊天、看图或阅读 PDF。当前仅提供文字演示。'
    :'这是浏览器预览。请打开 lyx 桌面 App 使用 API 和附件功能。';
}
function getPreview(file) {
  if(!previewCache.has(file.id)) {
    previewCache.set(file.id,window.lyx?.previewAttachment(file.id).catch(()=>null)||Promise.resolve(null));
  }
  return previewCache.get(file.id);
}
function attachmentCard(file,removable=false) {
  const card=document.createElement('div');card.className='attachment-card';
  const media=document.createElement('button');media.type='button';media.className='attachment-preview';
  if(file.mime?.startsWith('image/')) {
    const img=document.createElement('img');img.alt=file.name;media.append(img);media.title='查看图片';
    getPreview(file).then(src=>{
      if(src) {img.src=src;media.onclick=()=>{$('#full-image').src=src;$('#full-image').alt=file.name;$('#image-title').textContent=file.name;$('#image-dialog').showModal();};}
      else {media.textContent='图片已丢失';media.title='本地图片不存在，请重新添加';media.disabled=true;}
    });
  } else {media.textContent='PDF';media.title='PDF 附件（发送后由模型阅读）';media.disabled=true;}
  const label=document.createElement('span');label.className='attachment-name';label.textContent=file.name;label.title=file.name;
  card.append(media,label);
  if(removable) {
    const remove=document.createElement('button');remove.type='button';remove.className='remove-attachment';remove.textContent='×';
    remove.setAttribute('aria-label','移除 '+file.name);remove.disabled=isAddingFiles||isSending;
    remove.onclick=async()=>{
      try {
        await window.lyx.removeAttachment(file.id);
        pendingAttachments=pendingAttachments.filter(f=>f.id!==file.id);previewCache.delete(file.id);renderDraft();
      } catch(e){showToast('移除失败：'+e.message);}
    };
    card.append(remove);
  }
  return card;
}
function renderDraft() {
  draft.replaceChildren();draft.hidden=!pendingAttachments.length;
  pendingAttachments.forEach(file=>draft.append(attachmentCard(file,true)));
  $('#attachment-hint').hidden=!pendingAttachments.length && !isAddingFiles;
  $('#attachment-hint').textContent=isAddingFiles?'正在读取附件…':'发送后，附件会上传至 OpenAI。最多 4 个，每个不超过 10 MB。';
  $('#send-button').disabled=isSending||isAddingFiles;
  $('#attach-button').disabled=isSending||isAddingFiles;
}
async function addFiles(files) {
  if(isSending||isAddingFiles) return showToast('请等待当前操作完成后再添加附件。');
  if(!hasDesktopBridge()) return showToast('请使用 lyx 桌面 App 添加附件。');
  const list=Array.from(files);
  if(list.length+pendingAttachments.length>4) return showToast('每条消息最多添加 4 个附件，请减少所选文件。');
  isAddingFiles=true;renderDraft();
  try {
    for(const file of list) {
      if(!/\.(png|jpe?g|webp|pdf)$/i.test(file.name)) {showToast('暂不支持 '+file.name+'；请选择 PNG、JPG、WEBP 或 PDF。');continue;}
      if(!file.size||file.size>10*1024*1024) {showToast(file.name+' 必须非空且不超过 10 MB。');continue;}
      try {
        if(/\.(png|jpe?g|webp)$/i.test(file.name)) {
          let bitmap;
          try {bitmap=await createImageBitmap(file);} catch {throw Error('图片无法解码，请重新导出 PNG、JPG 或 WEBP。');}
          const pixels=bitmap.width*bitmap.height;bitmap.close();
          if(pixels>40_000_000) throw Error('图片像素过大，请缩小到 4000 万像素以内。');
        }
        const saved=await window.lyx.addAttachment({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});
        const {preview,...meta}=saved;pendingAttachments.push(meta);
        if(preview) previewCache.set(meta.id,Promise.resolve(preview));
      } catch(e){showToast('添加失败：'+e.message);}
    }
  } finally {isAddingFiles=false;picker.value='';renderDraft();}
}
function renderBubble(bubble,message) {
  bubble.replaceChildren();
  if(message.attachments?.length) {
    const files=document.createElement('div');files.className='attachment-list sent-attachments';
    message.attachments.forEach(file=>files.append(attachmentCard(file)));bubble.append(files);
  }
  if(message.content) {const content=document.createElement('div');content.textContent=message.content;bubble.append(content);}
  if(message.pending) {
    const status=document.createElement('div');status.className='pending-bubble';
    const label=document.createElement('span');label.textContent=message.content?'正在生成':'正在思考';
    const dots=document.createElement('span');dots.className='typing-dots';dots.setAttribute('aria-label','正在生成回复');
    for(let i=0;i<3;i++) dots.append(document.createElement('i'));
    status.append(label,dots);bubble.append(status);
  }
  if(message.failed) bubble.classList.add('failed');
  if(message.sources?.length) {
    const sources=document.createElement('div');sources.className='message-sources';
    const title=document.createElement('span');title.textContent=message.libraryMode==='overview'?'本次参考：文档开头片段（概览）':'本次检索到的参考片段';
    sources.append(title);
    for(const source of message.sources) {
      const button=document.createElement('button');button.type='button';
      button.textContent='['+source.index+'] '+source.name+(source.page?' · 第 '+source.page+' 页':' · 片段 '+source.part);
      button.onclick=()=>window.openLibrarySource?.(source);sources.append(button);
    }
    bubble.append(sources);
  }
}
function scrollConversation() {const el=$('#conversation');el.scrollTop=el.scrollHeight;}
function render() {
  const chat=active();welcome.hidden=chat.messages.length>0;messagesEl.replaceChildren();
  for(const message of chat.messages) {
    const row=document.createElement('div');row.className='message '+message.role;
    if(message.role==='assistant') {const avatar=document.createElement('div');avatar.className='msg-avatar';avatar.textContent='✳';row.append(avatar);}
    const bubble=document.createElement('div');bubble.className='bubble';renderBubble(bubble,message);row.append(bubble);messagesEl.append(row);
  }
  renderHistory();scrollConversation();window.dispatchEvent(new Event('lyx-chat-changed'));
}
function renderHistory() {
  historyEl.replaceChildren();
  for(const chat of conversations) {
    const row=document.createElement('div');row.className='history-row';
    const button=document.createElement('button');button.className='history-item'+(chat.id===activeId?' selected':'');button.textContent=chat.title;
    button.title=chat.title;button.onclick=()=>{closeChatMenu();activeId=chat.id;window.showWorkspace('chat');render();};
    const more=document.createElement('button');more.className='history-more';more.textContent='···';more.setAttribute('aria-label','管理对话 '+chat.title);more.setAttribute('aria-haspopup','menu');
    more.onclick=()=>openChatMenu(chat.id,more);row.append(button,more);historyEl.append(row);
  }
  $('#share-button').disabled=!active().messages.length||activeId===sendingChatId||Boolean(exportingChatId);
}
let menuChatId=null,menuTrigger=null,editChatId=null,editAction=null;
const chatMenu=$('#chat-menu'),editDialog=$('#chat-edit-dialog');
function closeChatMenu(focus=false) {
  chatMenu.hidden=true;$('#chat-more').setAttribute('aria-expanded','false');
  if(focus&&menuTrigger?.isConnected)menuTrigger.focus();
}
function openChatMenu(id,trigger) {
  if(!chatMenu.hidden&&menuChatId===id&&menuTrigger===trigger){closeChatMenu(true);return;}
  menuChatId=id;menuTrigger=trigger;const chat=conversations.find(c=>c.id===id);
  $('#chat-menu-title').textContent=chat.title;
  $('#chat-export').disabled=!chat.messages.length||id===sendingChatId||Boolean(exportingChatId);
  $('#chat-delete').disabled=id===sendingChatId||id===exportingChatId;
  $('#chat-menu-note').textContent=id===sendingChatId?'回复生成中，结束后可导出或删除。':'本地对话可导出 PDF 分享。';
  chatMenu.hidden=false;trigger.setAttribute('aria-expanded','true');
  const rect=trigger.getBoundingClientRect();
  chatMenu.style.left=Math.max(8,Math.min(rect.right-chatMenu.offsetWidth,innerWidth-chatMenu.offsetWidth-8))+'px';
  chatMenu.style.top=Math.min(rect.bottom+5,innerHeight-chatMenu.offsetHeight-8)+'px';
  $('#chat-rename').focus();
}
function editChat(action) {
  editChatId=menuChatId;editAction=action;const chat=conversations.find(c=>c.id===editChatId);closeChatMenu();if(!chat)return;
  $('#chat-edit-title').textContent=action==='rename'?'重命名对话':'删除这段对话';
  $('#chat-name-label').hidden=action!=='rename';$('#chat-name').value=chat.title;
  $('#chat-edit-copy').textContent=action==='rename'?'起一个方便查找的名字。':'将删除“'+chat.title+'”及仅由它使用的聊天附件。资料库、其他对话和已导出的 PDF 会保留。此操作不能撤销。';
  $('#chat-edit-confirm').textContent=action==='rename'?'保存名称':'删除对话';
  $('#chat-edit-confirm').classList.toggle('danger-button',action==='delete');
  editDialog.showModal();if(action==='rename'){$('#chat-name').focus();$('#chat-name').select();}
}
$('#chat-edit-form').onsubmit=async event=>{
  event.preventDefault();const chat=conversations.find(c=>c.id===editChatId);if(!chat)return editDialog.close();
  if(editAction==='rename'){
    const name=$('#chat-name').value.trim();if(!name)return;
    chat.title=name;chat.renamed=true;save();renderHistory();editDialog.close();return;
  }
  if(chat.id===sendingChatId||chat.id===exportingChatId)return showToast('请等待这段对话的回复或导出完成。');
  const next=conversations.filter(c=>c.id!==chat.id);
  // Persist the removal before removing its unshared attachments. A storage error
  // must never leave a retained conversation pointing to files we just deleted.
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{return showToast('删除未保存，请检查本地存储空间。');}
  conversations=next;if(activeId===chat.id)activeId=conversations[0]?.id||createConversation();
  const retained=new Set([...conversations.flatMap(c=>c.messages.flatMap(m=>m.attachments||[])),...pendingAttachments].map(f=>f.id));
  const obsolete=[...new Set(chat.messages.flatMap(m=>m.attachments||[]).map(f=>f.id))].filter(id=>!retained.has(id));
  editDialog.close();render();
  const results=await Promise.allSettled(obsolete.map(id=>{previewCache.delete(id);return window.lyx?.removeAttachment(id);}));
  showToast(results.some(r=>r.status==='rejected')?'对话已删除，部分本地附件未能清理。':'对话已删除');
};
$('#chat-edit-cancel').onclick=()=>editDialog.close();
$('#chat-more').onclick=()=>openChatMenu(activeId,$('#chat-more'));
$('#chat-rename').onclick=()=>editChat('rename');$('#chat-delete').onclick=()=>editChat('delete');
async function exportConversation(id) {
  const chat=conversations.find(c=>c.id===id);closeChatMenu();
  if(!chat?.messages.length)return showToast('当前对话还没有内容可以导出。');
  if(id===sendingChatId)return showToast('请等待回复结束后再导出完整对话。');
  if(exportingChatId)return;
  if(!window.lyx?.exportChatPDF)return showToast('请在 lyx 桌面 App 中导出 PDF。');
  exportingChatId=id;renderHistory();showToast('请选择保存位置，随后生成完整对话 PDF…');
  try{
    const result=await window.lyx.exportChatPDF(JSON.parse(JSON.stringify(chat)));
    showToast(result.canceled?'已取消导出':'已保存 '+result.name+(result.warnings.length?'；部分附件已丢失，PDF 内已标注。':''));
  }catch(e){showToast('导出失败：'+e.message.replace(/Error invoking remote method '[^']+': (?:Error: )?/g,''));}
  finally{exportingChatId=null;renderHistory();}
}
$('#chat-export').onclick=()=>exportConversation(menuChatId);
document.addEventListener('click',event=>{if(!chatMenu.hidden&&!chatMenu.contains(event.target)&&!menuTrigger?.contains(event.target))closeChatMenu();});
document.addEventListener('keydown',event=>{
  if(chatMenu.hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeChatMenu(true);}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const buttons=[...chatMenu.querySelectorAll('button:not(:disabled)')];
    const current=buttons.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus();
  }
});
window.addEventListener('resize',()=>closeChatMenu());
function demoReply(text) {
  return '这是本地文字演示，还没有调用 AI。\n\n在左下角设置中保存 OpenAI API Key 后，就可以回答你的问题，也能分析图片和 PDF。\n\n你刚才说：'+text;
}
async function send(text) {
  text=text.trim();
  if((!text && !pendingAttachments.length)||isSending||isAddingFiles) return;
  isSending=true;renderDraft();
  const chat=active();
  sendingChatId=chat.id;closeChatMenu();renderHistory();
  const libraryIds=[...(chat.libraryIds||[])];
  let assistantMessage;
  try {
    const connected=hasDesktopBridge() && await window.lyx.hasApiKey();
    if(pendingAttachments.length && !connected) {showToast('请先在设置中保存 API Key，再发送图片或 PDF。附件已保留。');return;}
    if(libraryIds.length&&!connected){showToast('请先在设置中保存 API Key，再使用资料库问答。');return;}
    const files=pendingAttachments;pendingAttachments=[];
    chat.messages.push({role:'user',content:text,attachments:files});
    if(chat.title==='新对话'&&!chat.renamed) {const title=text||files[0]?.name||'附件问答';chat.title=title.slice(0,24)+(title.length>24?'…':'');}
    assistantMessage={role:'assistant',content:'',pending:true};chat.messages.push(assistantMessage);
    input.value='';input.style.height='auto';save();renderDraft();render();
    if(!connected) {
      await new Promise(resolve=>setTimeout(resolve,450));assistantMessage.content=demoReply(text);
    } else {
      await window.lyx.streamReply(modelSelect.value,chat.messages.slice(0,-1),delta=>{
        assistantMessage.content+=delta;
        if(activeId===chat.id) {
          const bubble=messagesEl.lastElementChild?.querySelector('.bubble');
          if(bubble) renderBubble(bubble,assistantMessage);scrollConversation();
        }
      },{libraryIds,onSources:context=>{
        assistantMessage.sources=context.sources;assistantMessage.libraryMode=context.mode;
        if(activeId===chat.id)render();
      }});
    }
    assistantMessage.pending=false;
  } catch(error) {
    if(assistantMessage) {
      assistantMessage.pending=false;assistantMessage.failed=true;
      assistantMessage.content+=(assistantMessage.content?'\n\n':'')+'请求未完成：'+(error.message||'请检查 API 设置与网络。');
    } else showToast(error.message||'无法检查 API 设置。');
  } finally {isSending=false;sendingChatId=null;save();render();renderDraft();}
}

form.addEventListener('submit', event => { event.preventDefault(); send(input.value); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
document.querySelector('#new-chat').onclick = () => { activeId = createConversation(); window.showWorkspace('chat'); render(); input.focus(); };
document.querySelector('#settings-button').onclick = async () => {
  if (!hasDesktopBridge()) { showToast('请运行桌面版 lyx 后再设置 API Key。'); return; }
  settings.showModal();
  const connected = await window.lyx.hasApiKey().catch(() => false);
  document.querySelector('#api-status-pill').textContent = connected ? '已保存' : '待配置';
  document.querySelector('#api-status-copy').textContent = connected ? '密钥已加密保存在本机。' : 'API Key 将使用 macOS 安全存储保存在本机。';
  document.querySelector('#api-key-input').value = '';
  window.promptSettings?.load();
};
document.querySelector('#save-api-key').onclick = async () => {
  if (!hasDesktopBridge()) { showToast('浏览器预览没有安全存储接口，请使用桌面版。'); return; }
  const button = document.querySelector('#save-api-key');
  button.disabled = true;
  const value = document.querySelector('#api-key-input').value.trim();
  try {
    await window.lyx.saveApiKey(value);
    const connected = await window.lyx.hasApiKey();
    document.querySelector('#api-status-pill').textContent = connected ? '已保存' : '待配置';
    document.querySelector('#api-status-copy').textContent = connected ? '密钥已加密保存在本机。' : '已移除保存的密钥。';
    document.querySelector('#api-key-input').value = '';
    await updateConnectionMode();
    showToast(connected ? 'API Key 已加密保存' : 'API Key 已移除');
  } catch (error) { showToast(error.message || '保存失败'); }
  finally { button.disabled = false; }
};
modelSelect.addEventListener('change', () => localStorage.setItem(MODEL_KEY, modelSelect.value));
document.querySelectorAll('.close-dialog').forEach(button => button.onclick = () => settings.close());
settings.addEventListener('click', event => { if (event.target === settings) settings.close(); });
document.querySelector('#clear-history').onclick=async()=>{
  if(isSending||isAddingFiles||exportingChatId) return showToast('请等待回复、附件读取或导出完成后再清除。');
  if(!confirm('清除所有聊天记录和图片、PDF 附件？此操作不能撤销。资料库、工具箱计划和待办会保留。')) return;
  try {
    await window.lyx.clearAttachments();pendingAttachments=[];previewCache.clear();
    conversations=[];activeId=createConversation();settings.close();render();renderDraft();showToast('聊天记录与附件已清除');
  } catch(e){showToast('清除失败：'+e.message);}
};
document.querySelector('#attach-button').onclick=()=>{
  if(!hasDesktopBridge()) return showToast('请使用 lyx 桌面 App 添加附件。');
  picker.click();
};
picker.onchange=()=>addFiles(picker.files);
form.addEventListener('paste',event=>{
  const images=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
  if(images.length) {event.preventDefault();addFiles(images);}
});
const chatPanel=$('#chat-panel');
chatPanel.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')) {event.preventDefault();form.classList.add('drag-over');}});
chatPanel.addEventListener('dragleave',event=>{if(!chatPanel.contains(event.relatedTarget)) form.classList.remove('drag-over');});
chatPanel.addEventListener('drop',event=>{event.preventDefault();form.classList.remove('drag-over');addFiles(event.dataTransfer.files);});
document.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')) event.preventDefault();});
document.addEventListener('drop',event=>event.preventDefault());
$('#close-image').onclick=()=>$('#image-dialog').close();
$('#image-dialog').addEventListener('close',()=>$('#full-image').removeAttribute('src'));
$('.rail-action[title="新对话"]').onclick=()=>$('#new-chat').click();
document.querySelector('#mode-button').onclick = () => showToast('模型模式可在设置中选择');
document.querySelector('#share-button').onclick = () => exportConversation(activeId);
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#new-chat').click(); }
});
render();
renderDraft();
updateConnectionMode();
