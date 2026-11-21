(() => {
  const frame=document.querySelector('#toolbox-frame');
  let current='chat';
  const tellVisibility=()=>frame.contentWindow?.postMessage({scope:'lyx-toolbox',type:'visibility',visible:current==='toolbox' && !document.hidden},'*');
  window.showWorkspace=view=>{
    current=['toolbox','library'].includes(view)?view:'chat';
    for(const name of ['chat','toolbox','library']) {
      document.querySelector('#'+name+'-panel').hidden=name!==current;
      document.querySelector('#'+name+'-button').classList.toggle('active',name===current);
    }
    if(current==='toolbox' && !frame.getAttribute('src')) frame.src='toolbox/index.html';
    tellVisibility();
    window.dispatchEvent(new CustomEvent('lyx-workspace',{detail:current}));
  };
  for(const name of ['chat','toolbox','library']) document.querySelector('#'+name+'-button').onclick=()=>window.showWorkspace(name);
  frame.addEventListener('load',tellVisibility);
  document.addEventListener('visibilitychange',tellVisibility);
  const actions={
    translationOptions:()=>window.lyx.getTranslationOptions(),
    cancelTranslation:id=>window.lyx.cancelTranslation(id),
    copyTranslation:text=>window.lyx.copyTranslation(text),
    translate:(value,id)=>window.lyx.translateText({
      requestId:value?.requestId,text:value?.text,source:value?.source,target:value?.target,
      model:localStorage.getItem('lyx-chat-model-v1')||'gpt-5-mini'
    },delta=>frame.contentWindow?.postMessage({scope:'lyx-toolbox',type:'chunk',id,delta},'*')),
    getRate:()=>window.lyx.getRate(),
    hasRateKey:()=>window.lyx.hasRateKey(),
    saveRateKey:key=>window.lyx.saveRateKey(key),
    openExternal:url=>window.lyx.openExternal(url)
  };
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(event.source!==frame.contentWindow || data?.scope!=='lyx-toolbox' || data.type!=='request' || typeof data.id!=='string') return;
    if(!Object.hasOwn(actions,data.action)) return;
    try {
      if(!window.lyx) throw Error('请使用桌面版 lyx 打开工具箱。');
      const result=await actions[data.action](data.value,data.id);
      frame.contentWindow.postMessage({scope:'lyx-toolbox',type:'response',id:data.id,result},'*');
    } catch(error) {
      frame.contentWindow.postMessage({scope:'lyx-toolbox',type:'response',id:data.id,error:error.message||'操作失败'},'*');
    }
  });
})();
