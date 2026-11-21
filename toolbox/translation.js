(() => {
  const $=id=>document.getElementById('translation-'+id),rpc=window.toolboxRPC;
  const source=$('source'),result=$('result'),from=$('source-language'),to=$('target-language');
  const PREFS_KEY='lyx-translation-languages-v1';
  let ready=false,busy=false,requestId=null,stopping=false,maxCharacters=12000;
  function status(text,state='idle') {$('status').textContent=text;$('status').dataset.state=state;}
  function refresh() {
    $('count').textContent=source.value.length.toLocaleString()+' / '+maxCharacters.toLocaleString();
    $('start').disabled=!ready||busy||!source.value.trim()||source.value.length>maxCharacters||from.value===to.value;
    $('stop').hidden=!busy;$('stop').disabled=stopping;
    $('start').textContent=busy?'翻译中…':'翻译 →';
    source.readOnly=busy;from.disabled=!ready||busy;to.disabled=!ready||busy;
    $('clear').disabled=busy||(!source.value&&!result.value);
    $('swap').disabled=!ready||busy||from.value==='auto';
    $('swap').title=from.value==='auto'?'请先选择原文语言，再交换方向':'交换原文和目标语言';
    $('copy').disabled=busy||!result.value;
    result.setAttribute('aria-busy',String(busy));
  }
  function clearResult() {
    result.value='';$('result-label').textContent='等待翻译';
    if(source.value.length>maxCharacters) status('原文超过 12,000 个字符，请分段翻译。','error');
    else if(from.value===to.value) status('原文和目标语言相同，请更换一种语言。','error');
    else status('输入原文后，点击右侧“翻译”。');
    refresh();
  }
  function saveLanguages() {
    try {localStorage.setItem(PREFS_KEY,JSON.stringify({source:from.value,target:to.value}));}
    catch {status('语言偏好未保存，本次翻译仍可使用。');}
  }
  source.addEventListener('input',clearResult);
  for(const select of [from,to]) select.addEventListener('change',()=>{clearResult();saveLanguages();});
  $('clear').onclick=()=>{if(busy)return;source.value='';clearResult();source.focus();};
  $('swap').onclick=()=>{
    if(busy||from.value==='auto')return;
    if(result.value.length>maxCharacters) return status('译文过长，无法整体交换，请分段复制到左侧。','error');
    const previous=from.value;from.value=to.value;to.value=previous;
    if(result.value) source.value=result.value;
    clearResult();saveLanguages();source.focus();
  };
  $('copy').onclick=async()=>{
    if(!result.value||busy)return;
    try {await rpc('copyTranslation',result.value);status('译文已复制。');}
    catch(error){status(cleanError(error),'error');}
  };
  function cleanError(error) {
    return String(error.message||'翻译失败，请重试。').replace(/Error invoking remote method '[^']+': (?:Error: )?/g,'');
  }
  async function translate() {
    if(!ready||busy)return;
    if(!source.value.trim()) {status('请先在左侧输入要翻译的文字。','error');source.focus();return;}
    if(source.value.length>maxCharacters||from.value===to.value) {clearResult();return;}
    busy=true;stopping=false;requestId=crypto.randomUUID();
    const id=requestId;result.value='';$('result-label').textContent='正在准备译文';
    status('正在翻译…','busy');refresh();
    try {
      const text=await rpc('translate',{requestId:id,text:source.value,source:from.value,target:to.value},{
        timeout:195000,onChunk:delta=>{
          if(requestId!==id)return;
          result.value+=delta;result.scrollTop=result.scrollHeight;$('result-label').textContent='正在生成';
        }
      });
      // Use the complete result as well, so a delayed UI chunk cannot drop text.
      result.value=text;$('result-label').textContent='翻译完成';status('翻译完成，可复制或交换语言继续。','success');
    } catch(error) {
      const message=cleanError(error);
      const stopped=message.includes('翻译已停止');
      $('result-label').textContent=result.value?'未完成的译文':stopped?'已停止':'翻译未完成';
      status(message+(result.value?' 已保留右侧的部分译文。':''),stopped?'idle':'error');
      // A timed-out message bridge must not leave a request running unnoticed.
      if(message.includes('桌面接口没有响应')) rpc('cancelTranslation',id).catch(()=>{});
    } finally {
      if(requestId===id) {busy=false;stopping=false;requestId=null;refresh();}
    }
  }
  $('start').onclick=translate;
  source.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.isComposing) {event.preventDefault();translate();}
  });
  $('stop').onclick=async()=>{
    if(!requestId||stopping)return;
    stopping=true;refresh();status('正在停止…','busy');
    try {await rpc('cancelTranslation',requestId);}
    catch(error){stopping=false;refresh();status(cleanError(error),'error');}
  };
  async function initialize() {
    try {
      const config=await rpc('translationOptions');
      maxCharacters=config.maxCharacters;source.maxLength=maxCharacters;
      from.replaceChildren(new Option('自动识别语言','auto'));to.replaceChildren();
      for(const [code,label] of Object.entries(config.languages)) {
        from.add(new Option(label,code));to.add(new Option(label,code));
      }
      from.value='auto';to.value='zh-CN';
      try {
        const saved=JSON.parse(localStorage.getItem(PREFS_KEY)||'null');
        if(saved&&(saved.source==='auto'||Object.hasOwn(config.languages,saved.source))) from.value=saved.source;
        if(saved&&Object.hasOwn(config.languages,saved.target)) to.value=saved.target;
      } catch {}
      ready=true;clearResult();
    } catch(error){status(cleanError(error),'error');refresh();}
  }
  refresh();initialize();
})();
