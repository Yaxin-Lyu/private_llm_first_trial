// Only loaded by check-desktop.cjs. Never included in the packaged app.
const {app,safeStorage,shell,session,clipboard,dialog}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lyx-desktop-check-'));
app.setPath('appData',profile);
app.on('will-quit',()=>fs.rmSync(profile,{recursive:true,force:true}));
safeStorage.isEncryptionAvailable=()=>true;
safeStorage.encryptString=value=>Buffer.from(value).map(n=>n^0x5a);
safeStorage.decryptString=value=>Buffer.from(value).map(n=>n^0x5a).toString();
global.fixture={requests:[],external:[],downloads:[],failure:false,clipboard:'',pick:'folder'};
dialog.showSaveDialog=async()=>global.fixture.cancelSave?{canceled:true}:{canceled:false,filePath:global.fixture.exportPath||path.join(profile,'测试对话.pdf')};
const fixtureFiles=require('./library-fixtures.cjs').createFixtures(path.join(profile,'测试资料'));
dialog.showOpenDialog=async()=>{
  const folder=await fixtureFiles;
  if(global.fixture.pick==='cancel')return {canceled:true,filePaths:[]};
  return {canceled:false,filePaths:global.fixture.pick==='folder'?[folder]:[path.join(folder,'会议计划.txt')]};
};
clipboard.writeText=value=>{global.fixture.clipboard=value;};
app.whenReady().then(()=>session.defaultSession.on('will-download',(_event,item)=>{
  item.setSavePath(path.join(__dirname,'../.checks',require('../package.json').version,item.getFilename()));
  item.on('done',(_e,state)=>global.fixture.downloads.push({name:item.getFilename(),state}));
}));
shell.openExternal=async url=>{global.fixture.external.push(url);};
global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://www.live-rates.com/')) return {ok:true,json:async()=>[{currency:'EUR/CNY',rate:'7.8',timestamp:1700000000}]};
  if(url!=='https://api.openai.com/v1/responses') throw Error('Unexpected fixture URL');
  const payload=JSON.parse(options.body);
  global.fixture.requests.push(payload);
  if(global.fixture.failure) return {ok:false,status:429,json:async()=>({error:{message:'测试额度不足'}})};
  if(options.signal.aborted) throw new DOMException('Aborted','AbortError');
  let stopped=false,abort;
  const chunks=payload.instructions?.includes('professional translator')?['今天的会议已经推迟到下午三点。','\n请提前准备好资料。']
    :payload.instructions?.includes('资料库问答规则')?['会议在下周三下午三点举行，','地点是苍梧会议室。[1]']
    :['这是一张图片。','可以继续提问。'];
  return {ok:true,body:new ReadableStream({
    async start(controller) {
      abort=()=>{stopped=true;controller.error(new DOMException('Aborted','AbortError'));};
      options.signal.addEventListener('abort',abort,{once:true});
      for(const event of [...chunks.map(delta=>({type:'response.output_text.delta',delta})),{type:'response.completed'}]) {
        await new Promise(r=>setTimeout(r,400));
        if(stopped) return;
        controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));
      }
      options.signal.removeEventListener('abort',abort);stopped=true;controller.close();
    },
    cancel(){stopped=true;options.signal.removeEventListener('abort',abort);}
  })};
};
require(process.env.LYX_TEST_APP_ROOT?path.join(process.env.LYX_TEST_APP_ROOT,'main.cjs'):'../main.cjs');
