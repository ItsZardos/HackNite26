// Small real PDF with an xref table; exercises the actual PDF.js parser.
export function makePdf(lines=['The traveler watched the quiet harbor as the boats came home.', 'Morning light filled the room and she felt hopeful about the journey.'],pageCount=1) {
 const stream='BT /F1 12 Tf 50 750 Td '+lines.map((line,i)=>(i?'0 -20 Td ':'')+'('+line.replace(/[()\\]/g,'\\$&')+') Tj').join('\n')+' ET';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
 ];
 for(let i=1;i<pageCount;i++)objects.push(objects[2]);
 objects[1]=`<< /Type /Pages /Kids [${[3,...Array.from({length:pageCount-1},(_,i)=>i+6)].map(n=>n+' 0 R').join(' ')}] /Count ${pageCount} >>`;
 let data='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(data);
 data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('');
 data+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(data);
}
