const fs=require('node:fs/promises'),path=require('node:path');
function makePDF(pages) {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids ['+pages.map((_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach((text,i)=>{
    const stream='BT /F1 12 Tf 40 740 Td ('+text.replace(/([\\()])/g,'\\$1')+') Tj ET';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',
      '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream');
  });
  let text='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
  const start=Buffer.byteLength(text);
  text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('');
  text+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  return Buffer.from(text);
}
async function makeDOCX(text) {
  const zip=new(require('jszip'))();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({type:'nodebuffer'});
}
async function createFixtures(root) {
  await fs.mkdir(path.join(root,'课程资料'),{recursive:true});
  await fs.writeFile(path.join(root,'会议计划.txt'),'项目会议安排：下周三下午三点，在苍梧会议室讨论预算。请提前准备材料。');
  await fs.writeFile(path.join(root,'课程资料','学习笔记.md'),'# 光合作用\n植物通过光合作用利用光能，把二氧化碳和水转化为有机物。');
  await fs.writeFile(path.join(root,'课程资料','手册.pdf'),makePDF(['Orion handbook. This is the cover page.','The workshop starts at 14:00 in the Cedar room.']));
  await fs.writeFile(path.join(root,'课程资料','备忘录.docx'),await makeDOCX('Project Aurora: the application deadline is December 10. Bring your research proposal.'));
  await fs.writeFile(path.join(root,'跳过的图片.png'),'not-needed');
  await fs.mkdir(path.join(root,'.private'),{recursive:true});
  await fs.writeFile(path.join(root,'.private','不应导入.txt'),'hidden fixture');
  return root;
}
module.exports={makePDF,makeDOCX,createFixtures};
