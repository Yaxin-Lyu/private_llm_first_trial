const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {makePDF}=require('./library-fixtures.cjs');
const {extractDocument,createLibrary}=require('../lib/library.cjs');
module.exports=async(page,app,out)=>{
  const history=page.locator('.history-item');assert.equal(await history.count(),1);
  await page.locator('#new-chat').click();assert.equal(await history.count(),2);
  await page.locator('#chat-more').click();await page.locator('#chat-rename').click();
  await page.locator('#chat-name').fill('新建就能管理的对话');await page.locator('#chat-edit-confirm').click();
  await page.reload();assert.equal(await history.first().textContent(),'新建就能管理的对话');
  await page.locator('.history-more').first().click();await page.locator('#chat-delete').click();
  await page.locator('#chat-edit-cancel').click();assert.equal(await history.count(),2);
  await page.locator('#chat-more').click();await page.locator('#chat-delete').click();await page.locator('#chat-edit-confirm').click();
  assert.equal(await history.count(),1);
  const fixture=await page.evaluate(async pdf=>{
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=160;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ebecda';ctx.fillRect(0,0,480,160);ctx.fillStyle='#86654f';ctx.font='28px sans-serif';ctx.fillText('PDF 分享测试 图片',35,85);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));const bytes=new Uint8Array(await blob.arrayBuffer());
    const image=await window.lyx.addAttachment({name:'分享图片.png',bytes});delete image.preview;
    const file=await window.lyx.addAttachment({name:'原始资料.pdf',bytes:new Uint8Array(pdf)});delete file.preview;
    const chats=[{id:crypto.randomUUID(),title:'学习笔记与资料引用',messages:[
      {role:'user',content:'请结合图片与资料说明部署步骤。<script>这是正文，不应执行</script>',attachments:[image,file]},
      {role:'assistant',content:Array.from({length:30},(_,i)=>'第 '+(i+1)+' 步：先在本机整理资料，再检查应用设置。\n中文与 English 都需要完整保留，长段落应自动换行和分页。').join('\n\n')+'\n最后一句完整保留。',sources:[{index:1,name:'部署说明.txt',relativePath:'学习资料/部署说明.txt',part:1,text:'引用原文：程序在本机运行，模型通过 API 提供回答。'}]}]},
      {id:crypto.randomUUID(),title:'保留共享图片',messages:[{role:'user',content:'图片仍被这里引用。',attachments:[image]}]}];
    localStorage.setItem('lyx-chat-conversations-v1',JSON.stringify(chats));return {image:image.id,file:file.id};
  },[...makePDF(['Original PDF attachment'])]);
  await page.reload();
  await app.evaluate(()=>{global.fixture.cancelSave=true;});await page.locator('#share-button').click();
  await page.locator('#toast').filter({hasText:'已取消导出'}).waitFor();
  const output=path.join(out,'chat-share.pdf');
  await app.evaluate((_,output)=>{global.fixture.cancelSave=false;global.fixture.exportPath=output;},output);
  await page.locator('#share-button').click();await page.locator('#toast').filter({hasText:'已保存 chat-share.pdf'}).waitFor({timeout:60000});
  const parsed=await extractDocument(await fs.readFile(output),'.pdf');
  const text=parsed.pages.map(p=>p.text).join('\n').normalize('NFKC').replace(/\s/g,'');assert.ok(parsed.pages.length>=3);
  for(const expected of ['最后一句完整保留','引用原文','原始资料.pdf','这是正文','分享图片.png'])assert.ok(text.includes(expected),expected);
  await page.locator('#chat-more').click();await page.screenshot({path:path.join(out,'chat-menu.png')});
  await page.locator('#chat-delete').click();await page.locator('#chat-edit-confirm').click();
  assert.equal(await history.count(),1);assert.ok(await page.evaluate(id=>window.lyx.previewAttachment(id),fixture.image));
  await page.waitForFunction(async id=>{try{await window.lyx.previewAttachment(id);return false;}catch{return true;}},fixture.file);
  await page.locator('.history-more').first().click();await page.locator('#chat-delete').click();await page.locator('#chat-edit-confirm').click();
  await page.waitForFunction(async id=>{try{await window.lyx.previewAttachment(id);return false;}catch{return true;}},fixture.image);
  assert.equal(await history.count(),1);assert.equal(await history.first().textContent(),'新对话');
  assert.ok((await fs.stat(output)).size>1000);
  // A 24-file folder can be selected without the previous twenty-file ceiling.
  const profile=await app.evaluate(({app})=>app.getPath('userData'));
  const source=path.join(profile,'large-source');await fs.mkdir(source,{recursive:true});
  for(let i=0;i<24;i++)await fs.writeFile(path.join(source,i+'.txt'),'预算资料 '+i);
  const store=createLibrary(path.join(profile,'library-v1'),{extract:async bytes=>({pages:[{page:null,text:bytes.toString()}],characters:bytes.length,warnings:[]})});
  await store.importPaths([source]);await page.locator('#library-button').click();
  await page.getByRole('checkbox',{name:'选择文件夹 large-source',exact:true}).check();
  assert.equal(await page.evaluate(()=>window.chatLibrary.getSelected().length),24);
  for(const doc of await store.list())await store.remove(doc.id);
  await page.locator('#chat-button').click();await page.locator('#library-button').click();
  await page.locator('#library-empty').waitFor();await page.locator('#chat-button').click();
  console.log('PASS chat: empty and last conversation deletion, rename persistence, confirmation cancellation, PDF cancellation/content/pagination/image/citations, shared attachment cleanup, whole-folder selection over 20 files');
};
