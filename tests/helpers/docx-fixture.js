import {createRequire} from 'node:module';
// Use the ZIP implementation that Mammoth itself depends on.
const require=createRequire(import.meta.resolve('mammoth'));
const JSZip=require('jszip');
export async function makeDocx(text='The traveler arrived at the quiet harbor. Morning light shone on the boats as she thought about the journey ahead and the friends she hoped to meet.') {
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text.replaceAll('&','&amp;').replaceAll('<','&lt;')}</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph: 海 and hope.</w:t></w:r></w:p></w:body></w:document>`);
 return zip.generateAsync({type:'nodebuffer'});
}
