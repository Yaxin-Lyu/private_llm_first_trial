(() => {
  const get=id=>document.getElementById('prompt-'+id);
  let presets={},loading=false;
  const count=()=>get('count').textContent=get('input').value.length.toLocaleString()+' / 8,000';
  const message=text=>get('status').textContent=text;
  window.promptSettings={
    async load() {
      if(loading)return;loading=true;get('save').disabled=true;
      try {
        const config=await window.lyx.getPromptSettings();presets=config.presets;
        get('input').value=config.instructions;count();
        get('preset').replaceChildren(new Option('选择示例，不会自动保存',''));
        for(const [id,preset]of Object.entries(presets))get('preset').add(new Option(preset.label,id));
        message('保存后从下一条聊天消息起生效；不会改变已有回答。');
      }catch(e){message(e.message||'提示词设置读取失败，可以重新填写保存。');}
      finally{loading=false;get('save').disabled=false;}
    }
  };
  get('input').oninput=()=>{count();message('内容尚未保存。');};
  get('preset').onchange=()=>{const preset=presets[get('preset').value];if(preset){get('input').value=preset.text;count();message('已填入示例，点击保存后生效。');}};
  get('reset').onclick=()=>{if(presets.general){get('input').value=presets.general.text;get('preset').value='';count();message('已恢复默认内容，点击保存后生效。');}};
  get('save').onclick=async()=>{
    get('save').disabled=true;
    try{await window.lyx.savePromptSettings(get('input').value);message('已保存，从下一条聊天消息起生效。');}
    catch(e){message(e.message||'保存失败，请重试。');}
    finally{get('save').disabled=false;}
  };
})();
