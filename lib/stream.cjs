async function readResponseStream(body,onDelta) {
  if(!body) throw Error('服务未返回可读取的回复。');
  const reader=body.getReader(),decoder=new TextDecoder();
  let buffer='',answer='',completed=false;
  function frame(value) {
    const dataText=value.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
    if(!dataText || dataText==='[DONE]') return;
    let data;
    try {data=JSON.parse(dataText);} catch {throw Error('回复数据格式异常，请重试。');}
    if(data.type==='response.output_text.delta' && typeof data.delta==='string') {answer+=data.delta;onDelta(data.delta);}
    if(data.type==='error' || data.type==='response.failed') throw Error(data.error?.message||data.response?.error?.message||data.message||'模型生成失败。');
    if(data.type==='response.incomplete') throw Error('回复未完整生成：'+(data.response?.incomplete_details?.reason||'请缩短问题后重试。'));
    if(data.type==='response.completed') completed=true;
  }
  try {
    while(!completed) {
      const {value,done}=await reader.read();
      if(done) break;
      buffer+=decoder.decode(value,{stream:true});
      const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()||'';
      for(const value of frames) frame(value);
    }
    buffer+=decoder.decode();
    if(buffer.trim() && !completed) frame(buffer);
    if(!completed) throw Error('连接已中断，回复可能不完整，请重试。');
    if(!answer) throw Error('模型没有返回文字，请稍后重试，或在设置中更换可用模型。');
    return answer;
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
module.exports={readResponseStream};
