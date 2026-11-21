const {parentPort,workerData}=require('node:worker_threads');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const LIMIT=250000;
async function extract() {
  const data=Buffer.from(workerData.bytes),ext=workerData.extension;
  let pages=[],warnings=[];
  if(ext==='.pdf') {
    const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const pdfjs=await import(pathToFileURL(path.join(pdfRoot,'legacy/build/pdf.mjs')).href);
    pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(pdfRoot,'legacy/build/pdf.worker.mjs')).href;
    const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,disableFontFace:true,
      useSystemFonts:false,cMapUrl:path.join(pdfRoot,'cmaps/'),cMapPacked:true,
      standardFontDataUrl:path.join(pdfRoot,'standard_fonts/'),verbosity:0});
    let total=0,empty=0;
    try {
      const pdf=await task.promise;
      if(pdf.numPages>500) throw Error('PDF 超过 500 页，请拆分后导入。');
      for(let n=1;n<=pdf.numPages;n++) {
        const page=await pdf.getPage(n),content=await page.getTextContent();
        const text=content.items.filter(x=>typeof x.str==='string').map(x=>x.str+(x.hasEOL?'\n':' ')).join('').trim();
        total+=text.length;if(total>LIMIT) throw Error('提取文字超过 25 万字符，请拆分文档。');
        if(text) pages.push({page:n,text});else empty++;
        page.cleanup();
      }
      if(empty) warnings.push(empty+' 页没有可提取文字，可能是扫描页或空白页。');
    } finally {await task.destroy();}
  } else if(ext==='.docx') {
    const result=await require('mammoth').extractRawText({buffer:data});
    pages=[{page:null,text:result.value}];
    if(result.messages.length) warnings.push('Word 提取时有格式提示，请在预览中核对文字。');
  } else {
    let text;
    if(data[0]===255&&data[1]===254) text=new TextDecoder('utf-16le',{fatal:true}).decode(data.subarray(2));
    else if(data[0]===254&&data[1]===255) text=new TextDecoder('utf-16be',{fatal:true}).decode(data.subarray(2));
    else {
      try {text=new TextDecoder('utf-8',{fatal:true}).decode(data);}
      catch {throw Error('文本编码无法识别，请另存为 UTF-8 后导入。');}
    }
    if(text.includes('\u0000')) throw Error('文件包含二进制内容，无法作为文本导入。');
    pages=[{page:null,text}];
  }
  pages=pages.map(x=>({...x,text:x.text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim()})).filter(x=>x.text);
  const characters=pages.reduce((n,x)=>n+x.text.length,0);
  if(!characters) throw Error('没有可提取的文字；扫描件或图片请先做文字识别（OCR）。');
  if(characters>LIMIT) throw Error('提取文字超过 25 万字符，请拆分文档。');
  return {pages,characters,warnings};
}
extract().then(value=>parentPort.postMessage({value}),error=>parentPort.postMessage({
  error:error.name==='PasswordException'?'PDF 已加密，请先解除密码后导入。':error.message||'无法读取文件。'
}));
