(() => {
  const $=id=>document.getElementById(id),pending=new Map();
  let visible=true,rateTimer,rateBusy=false,rateRefreshRequested=false;
  function rpc(action,value,{onChunk,timeout=20000}={}) {
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('桌面接口没有响应，请重新打开 App。'));},timeout);
      pending.set(id,{resolve,reject,timer,onChunk});
      parent.postMessage({scope:'lyx-toolbox',type:'request',id,action,value},'*');
    });
  }
  window.toolboxRPC=rpc;
  window.addEventListener('message',event=>{
    if(event.source!==parent || event.data?.scope!=='lyx-toolbox') return;
    const data=event.data;
    if(data.type==='visibility') {
      visible=Boolean(data.visible);clearTimeout(rateTimer);
      if(visible) updateRate();return;
    }
    const request=pending.get(data.id);
    if(data.type==='chunk' && request) {if(typeof data.delta==='string') request.onChunk?.(data.delta);return;}
    if(data.type!=='response' || !request) return;
    clearTimeout(request.timer);pending.delete(data.id);
    if(data.error) request.reject(Error(data.error));else request.resolve(data.result);
  });
  function notify(message) {
    $('toolbox-status').textContent=message;$('toolbox-status').classList.add('show');
    clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toolbox-status').classList.remove('show'),5000);
  }
  document.querySelectorAll('a.card').forEach(link=>link.onclick=event=>{
    event.preventDefault();rpc('openExternal',link.href).catch(e=>notify(e.message));
  });
  let view='all';
  function filter() {
    document.querySelector('.backup').hidden=view==='translation';
    const query=$('search').value.trim().toLowerCase();
    document.querySelectorAll('[data-group]').forEach(section=>{
      let matches=false;
      section.querySelectorAll('a.card').forEach(card=>{
        card.hidden=Boolean(query)&&!card.textContent.toLowerCase().includes(query);
        if(!card.hidden) matches=true;
      });
      if(!section.querySelector('a.card')) matches=!query || section.textContent.toLowerCase().includes(query);
      section.hidden=(view!=='all' && section.dataset.group!==view)||!matches;
    });
  }
  $('search').oninput=filter;
  document.querySelectorAll('.nav a').forEach(link=>link.onclick=event=>{
    event.preventDefault();view=link.dataset.view;
    if(view==='translation') $('search').value='';
    document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a===link));
    filter();window.scrollTo({top:0,behavior:'smooth'});
  });
  const TODO_KEY='toolbox-todos-v1',PLAN_PREFIX='toolbox-plans-',DATE=/^\d{4}-\d{2}-\d{2}$/;
  const read=key=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
  function write(key,items) {
    try {localStorage.setItem(key,JSON.stringify(items));return true;}
    catch {notify('本机存储空间不足，未能保存。请先导出备份。');return false;}
  }
  const now=new Date();
  $('planDate').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  const planKey=()=>PLAN_PREFIX+$('planDate').value;
  function row(item,onCheck,onDelete) {
    const el=document.createElement('div');el.className='task'+(item.done?' done':'');
    const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(item.done);check.setAttribute('aria-label','标记完成');
    check.onchange=()=>onCheck(check.checked);
    const label=document.createElement('label');label.textContent=item.text;
    const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label','删除事项');del.onclick=onDelete;
    el.append(check,label);
    if(item.due) {const date=document.createElement('span');date.className='duedate';date.textContent='截止 '+item.due;el.append(date);}
    el.append(del);return el;
  }
  function renderPlans() {
    const items=read(planKey());$('taskList').replaceChildren();$('planEmpty').hidden=items.length>0;
    items.forEach((item,i)=>$('taskList').append(row(item,done=>{
      items[i].done=done;write(planKey(),items);renderPlans();
    },()=>{items.splice(i,1);write(planKey(),items);renderPlans();})));
  }
  function addPlan() {
    const text=$('planText').value.trim();
    if(!text) return;if(!DATE.test($('planDate').value)) return notify('请先选择计划日期。');
    const items=read(planKey());items.push({text,done:false});
    if(write(planKey(),items)) $('planText').value='';renderPlans();
  }
  $('addPlan').onclick=addPlan;$('planDate').onchange=renderPlans;
  $('planText').onkeydown=e=>{if(e.key==='Enter' && !e.isComposing) addPlan();};
  function renderTodos() {
    const items=read(TODO_KEY).sort((a,b)=>Number(!!a.done)-Number(!!b.done)||(a.due||'9999').localeCompare(b.due||'9999'));
    $('todoList').replaceChildren();$('todoEmpty').hidden=items.length>0;
    items.forEach(item=>$('todoList').append(row(item,done=>{
      const all=read(TODO_KEY),target=all.find(x=>x.id===item.id);
      if(target) target.done=done;write(TODO_KEY,all);renderTodos();
    },()=>{write(TODO_KEY,read(TODO_KEY).filter(x=>x.id!==item.id));renderTodos();})));
  }
  function addTodo() {
    const text=$('todoText').value.trim();if(!text) return;
    const items=read(TODO_KEY);items.push({id:crypto.randomUUID(),text,due:$('todoDue').value,done:false,created:new Date().toISOString()});
    if(write(TODO_KEY,items)) {$('todoText').value='';$('todoDue').value='';}renderTodos();
  }
  $('addTodo').onclick=addTodo;$('todoText').onkeydown=e=>{if(e.key==='Enter' && !e.isComposing) addTodo();};
  function download(value,name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  const validItems=items=>{
    if(!Array.isArray(items) || items.length>10000 || items.some(x=>!x||typeof x.text!=='string'||x.text.length>20000)) throw Error('备份中的事项格式不正确。');
    return items.map(x=>({id:typeof x.id==='string'?x.id:crypto.randomUUID(),text:x.text,due:DATE.test(x.due)?x.due:'',done:!!x.done,created:typeof x.created==='string'?x.created:new Date().toISOString()}));
  };
  function mergeTodos(incoming) {
    const current=read(TODO_KEY),ids=new Set(current.map(x=>x.id));
    for(const item of validItems(incoming)) if(!ids.has(item.id)) {current.push(item);ids.add(item.id);}
    return current;
  }
  async function readFile(input) {
    const file=input.files[0];if(!file) return null;
    if(file.size>5*1024*1024) throw Error('备份文件不能超过 5 MB。');
    return JSON.parse(await file.text());
  }
  $('exportTodos').onclick=()=>download(read(TODO_KEY),'todo-list.json');
  $('importTodos').onclick=()=>$('todoFile').click();
  $('todoFile').onchange=async()=>{
    try {const value=await readFile($('todoFile'));if(value===null) return;
      if(write(TODO_KEY,mergeTodos(value))) {renderTodos();notify('待办已合并导入，同编号事项不会重复。');}
    } catch(e){notify('导入失败：'+e.message);}finally{$('todoFile').value='';}
  };
  $('backupAll').onclick=()=>{
    const plans={};
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key.startsWith(PLAN_PREFIX) && DATE.test(key.slice(PLAN_PREFIX.length))) plans[key.slice(PLAN_PREFIX.length)]=read(key);
    }
    download({format:'lyx-toolbox',version:1,todos:read(TODO_KEY),plans},'lyx-toolbox-backup.json');
  };
  $('restoreAll').onclick=()=>$('backupFile').click();
  $('backupFile').onchange=async()=>{
    const previous=new Map();
    try {
      const value=await readFile($('backupFile'));if(value===null) return;
      if(value.format!=='lyx-toolbox'||value.version!==1||!value.plans||typeof value.plans!=='object'||Array.isArray(value.plans)) throw Error('请选择 lyx 工具箱导出的备份。');
      const updates=new Map([[TODO_KEY,mergeTodos(value.todos)]]);
      for(const [date,raw] of Object.entries(value.plans)) {
        if(!DATE.test(date)) throw Error('计划日期不正确。');
        const items=read(PLAN_PREFIX+date),known=new Set(items.map(x=>JSON.stringify([x.text,!!x.done])));
        for(const item of validItems(raw)) {
          const key=JSON.stringify([item.text,item.done]);
          if(!known.has(key)) {items.push({text:item.text,done:item.done});known.add(key);}
        }
        updates.set(PLAN_PREFIX+date,items);
      }
      for(const [key,items] of updates) {
        previous.set(key,localStorage.getItem(key));
        localStorage.setItem(key,JSON.stringify(items));
      }
      renderPlans();renderTodos();notify('备份已合并导入，现有事项已保留。');
    } catch(e) {
      for(const [key,old] of previous) {try{if(old===null)localStorage.removeItem(key);else localStorage.setItem(key,old);}catch{}}
      notify('导入失败：'+e.message);
    } finally {$('backupFile').value='';}
  };
  async function updateRate() {
    if(!visible) return;
    if(rateBusy) {rateRefreshRequested=true;return;}
    rateBusy=true;
    let delay=60000;
    try {
      const result=await rpc('getRate');
      $('rate').textContent='1 EUR = ¥'+result.value.toFixed(4);
      $('updated').textContent=(result.live?'实时行情':'行情快照')+' · '+new Date(result.stamp||result.checkedAt).toLocaleString()+' · 仅供参考';
      delay=result.live?10000:1200000;
    } catch(e) {$('rate').textContent='暂时无法获取';$('updated').textContent=e.message;}
    finally {
      rateBusy=false;clearTimeout(rateTimer);
      if(rateRefreshRequested) {delay=0;rateRefreshRequested=false;}
      if(visible) rateTimer=setTimeout(updateRate,delay);
    }
  }
  $('rateSetup').onclick=()=>{$('rateConfig').hidden=!$('rateConfig').hidden;};
  $('saveRateKey').onclick=async()=>{
    $('saveRateKey').disabled=true;
    try {
      const result=await rpc('saveRateKey',$('rateKey').value.trim());$('rateKey').value='';
      notify(result.saved?'行情密钥已加密保存':'行情密钥已移除');await updateRate();
    } catch(e){notify(e.message);}finally{$('saveRateKey').disabled=false;}
  };
  rpc('hasRateKey').then(saved=>{$('rateKey').placeholder=saved?'已保存密钥；填写可替换，留空保存可移除':'粘贴 Live-Rates API key';}).catch(()=>{});
  renderPlans();renderTodos();filter();updateRate();
})();
