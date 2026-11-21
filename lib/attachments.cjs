const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 4;
const ID = /^[a-f0-9-]{36}$/;

function fileType(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (bytes.length>=20 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {
    if(bytes.readUInt32LE(4)+8!==bytes.length) throw Error('WEBP 文件不完整，请重新导出后添加。');
    for(let offset=12;offset<bytes.length;) {
      if(offset+8>bytes.length) throw Error('WEBP 文件不完整。');
      const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4);
      if(kind==='ANIM'||kind==='ANMF') throw Error('暂不支持动态 WEBP，请导出静态图片。');
      if(offset+8+length>bytes.length) throw Error('WEBP 文件不完整。');
      offset+=8+length+(length%2);
    }
    return 'image/webp';
  }
  if (bytes.toString('ascii',0,5)==='%PDF-') return 'application/pdf';
  throw new Error('仅支持 PNG、JPG、WEBP 图片和 PDF；文件内容必须与格式一致。');
}

function createAttachmentStore(directory, nativeImage) {
  function filename(id,ext) {
    if (typeof id!=='string' || !ID.test(id)) throw new Error('附件编号无效。');
    return path.join(directory, id+ext);
  }
  async function get(id) {
    try {
      const meta=JSON.parse(await fs.readFile(filename(id,'.json'),'utf8'));
      const data=await fs.readFile(filename(id,'.bin'));
      if (!data.length || data.length>MAX_FILE_BYTES || fileType(data)!==meta.mime) throw Error('invalid');
      return { ...meta, id, size:data.length, data };
    } catch { throw new Error('这张图片或 PDF 的本地文件已丢失，请重新添加，或新建对话继续。'); }
  }
  return {
    async add({name,bytes}) {
      if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) throw Error('无法读取附件。');
      const data=Buffer.from(bytes);
      if (!data.length || data.length>MAX_FILE_BYTES) throw Error('附件必须非空，且每个文件不超过 10 MB。');
      const mime=fileType(data);
      // Electron nativeImage decodes PNG/JPEG. Chromium validates WebP in the
      // renderer before IPC; here we also verify its RIFF container and size.
      if (mime.startsWith('image/') && mime!=='image/webp') {
        const img=nativeImage.createFromBuffer(data);
        if (img.isEmpty()) throw Error('图片无法解码，请换一张 PNG、JPG 或 WEBP。');
        const {width,height}=img.getSize();
        if (width*height>40_000_000) throw Error('图片像素过大，请缩小到 4000 万像素以内。');
      }
      const id=randomUUID();
      const rawName=path.basename(String(name||'附件')).replace(/[\x00-\x1f]/g,'').slice(0,150);
      const ext=mime==='application/pdf'?'.pdf':mime==='image/jpeg'?'.jpg':mime==='image/webp'?'.webp':'.png';
      const safeName=rawName.toLowerCase().endsWith(ext) || (ext==='.jpg' && /\.jpeg$/i.test(rawName)) ? rawName : rawName+ext;
      const meta={id,name:safeName,mime,size:data.length};
      await fs.mkdir(directory,{recursive:true});
      try {
        await fs.writeFile(filename(id,'.bin'),data,{mode:0o600});
        await fs.writeFile(filename(id,'.json'),JSON.stringify(meta),{mode:0o600});
      } catch(error) {
        await Promise.all([fs.rm(filename(id,'.bin'),{force:true}),fs.rm(filename(id,'.json'),{force:true})]);
        throw error;
      }
      return {...meta, preview:mime.startsWith('image/')?`data:${mime};base64,${data.toString('base64')}`:null};
    },
    get,
    async preview(id) {
      const file=await get(id);
      return file.mime.startsWith('image/')?`data:${file.mime};base64,${file.data.toString('base64')}`:null;
    },
    async remove(id) {
      await Promise.all([fs.rm(filename(id,'.bin'),{force:true}),fs.rm(filename(id,'.json'),{force:true})]);
    },
    async clear() { await fs.rm(directory,{recursive:true,force:true}); }
  };
}

async function buildInput(messages, store) {
  const input=[];
  let totalBytes=0;
  for (const message of (Array.isArray(messages)?messages.slice(-30):[])) {
    if (!message || !['user','assistant'].includes(message.role) || message.failed || message.pending) continue;
    const text=typeof message.content==='string'?message.content.slice(0,12000):'';
    if (message.role==='assistant') { if (text) input.push({role:'assistant',content:text}); continue; }
    const refs=Array.isArray(message.attachments)?message.attachments:[];
    if (refs.length>MAX_FILES) throw Error('每条消息最多添加 4 个附件。');
    const content=[];
    if(text) content.push({type:'input_text',text});
    for(const ref of refs) {
      const file=await store.get(ref.id);
      totalBytes+=file.size;
      if(totalBytes>MAX_REQUEST_BYTES) throw Error('本次对话上下文中的附件超过 20 MB，请新建对话并重新选择需要的文件。');
      const dataURL=`data:${file.mime};base64,${file.data.toString('base64')}`;
      content.push(file.mime==='application/pdf'
        ? {type:'input_file',filename:file.name,file_data:dataURL}
        : {type:'input_image',image_url:dataURL,detail:'auto'});
    }
    if (content.length) input.push({role:'user',content});
  }
  if(!input.length) throw Error('没有可发送的消息。');
  return input;
}
module.exports={createAttachmentStore,buildInput,fileType,MAX_FILE_BYTES,MAX_FILES};
