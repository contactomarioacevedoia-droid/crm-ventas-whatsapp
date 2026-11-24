import PDFDocument from 'pdfkit';
import sharp from 'sharp';

export const money = n => '$' + n.toLocaleString('es-CL');
export const slotLabel = value => new Intl.DateTimeFormat('es-CL', {timeZone:'America/Santiago', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(new Date(value));

export function quotePDF({store, name, company, product, quantity, price, date, id}) {
  const pdf = new PDFDocument({size:'A4', margin:48});
  const chunks = [];
  const result = new Promise((resolve,reject) => {
    pdf.on('data', part => chunks.push(part));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  pdf.rect(0,0,596,12).fill('#bd663d');
  pdf.fillColor('#24463a').font('Helvetica-Bold').fontSize(17).text(store);
  pdf.moveDown().fontSize(32).text('Cotización');
  pdf.font('Helvetica').fontSize(12).fillColor('#46544c').text('Nº MN-' + id + '   ·   ' + new Date(date).toLocaleDateString('es-CL',{timeZone:'America/Santiago'}));
  pdf.moveDown(2).fontSize(11).text('PREPARADA PARA');
  pdf.fontSize(17).fillColor('#202a24').text(name);
  if(company) pdf.fontSize(13).text(company);
  const y=pdf.y+36;
  pdf.rect(48,y,500,35).fill('#24463a');
  for(const [x,label] of [[58,'Producto'],[267,'Unidades'],[350,'Unitario'],[455,'Importe']]) pdf.fillColor('white').fontSize(11).text(label,x,y+11,{lineBreak:false});
  for(const [x,label] of [[58,product],[270,String(quantity)],[350,money(price)],[455,money(price*quantity)]]) pdf.fillColor('#202a24').text(label,x,y+56,{lineBreak:false});
  pdf.moveTo(48,y+85).lineTo(548,y+85).stroke('#cbd5cd');
  pdf.font('Helvetica-Bold').fontSize(20).text('Total CLP   ' + money(price*quantity),48,y+111,{align:'right',width:500});
  pdf.font('Helvetica').fontSize(11).text('Para coordinar una visita o consultar por despacho, responde en el mismo chat.',48,y+175,{width:430});
  pdf.end();
  return result;
}

export async function slotsPNG(slots) {
  const rows=slots.map((slot,i)=>'<text x="48" y="'+(150+i*52)+'">'+(i+1)+'.   '+slotLabel(slot)+'</text>').join('');
  return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="680" height="'+(175+52*slots.length)+'"><rect width="100%" height="100%" fill="#173d32"/><g fill="#fff" font-family="Arial" font-size="27"><text x="48" y="65" font-size="37">Horarios para tu visita</text><text x="48" y="104" font-size="20">Hora de Chile · Responde con el número</text>'+rows+'</g></svg>')).png().toBuffer();
}
