import {quotePDF,slotsPNG,slotLabel,money} from './materiales.mjs';
const normalize = str => str.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const chile = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function salesAgent({db,config,saveQuote,storeVisit,interpret}) {
  db.exec(`CREATE TABLE IF NOT EXISTS sales_flow (lead_id INTEGER PRIMARY KEY REFERENCES leads(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (message_id INTEGER PRIMARY KEY REFERENCES messages(id), filename TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL)`);
  // An attended handoff returns control to the agent, including on older databases.
  const resumeFlow = `UPDATE sales_flow SET data=CASE
    WHEN EXISTS(SELECT 1 FROM quotes WHERE quotes.lead_id=sales_flow.lead_id) THEN '{"phase":"quoted"}'
    ELSE '{}' END WHERE json_extract(data,'$.phase')='human'`;
  db.exec(`CREATE TRIGGER IF NOT EXISTS resume_attended_sales_flow
    AFTER UPDATE OF attention_reason ON leads
    WHEN OLD.attention_reason IS NOT NULL AND NEW.attention_reason IS NULL
    BEGIN ${resumeFlow} AND lead_id=NEW.id; END;
    ${resumeFlow} AND lead_id IN (SELECT id FROM leads WHERE attention_reason IS NULL);`);
  function available() {
    const reserved=new Set(db.prepare('SELECT starts FROM visits').all().map(row=>row.starts));
    const choices=[];
    for(let t=Math.ceil((Date.now()+60000)/1800000)*1800000;choices.length<4 && t<Date.now()+30*86400000;t+=1800000){
      const date=new Date(t);
      if(!/^(Mon|Tue|Wed|Thu|Fri).* (1[0-7]):(00|30)$/.test(chile.format(date))) continue;
      if(!reserved.has(date.toISOString())) choices.push(date.toISOString());
    }
    return choices;
  }
  function flow(id) {
    return JSON.parse(db.prepare('SELECT data FROM sales_flow WHERE lead_id=?').get(id)?.data || '{}');
  }
  async function pdfFor(id) {
    const row=db.prepare('SELECT q.*, l.name FROM quotes q JOIN leads l ON l.id=q.lead_id WHERE q.lead_id=?').get(id);
    if(!row) throw Object.assign(new Error('Primero guarda una cotización.'),{status:404});
    const {catalog,store}=config();
    const f=flow(id);
    return quotePDF({store,name:f.customer || row.name,company:f.company,product:catalog.find(p=>p.id===row.product_id).name,quantity:row.quantity,price:row.unit_price,date:row.created,id});
  }
  async function turn(id,text,deliver) {
    const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(id);
    const f=flow(id);
    const persist=()=>db.prepare('INSERT OR REPLACE INTO sales_flow VALUES (?,?)').run(id,JSON.stringify(f));
    async function say(body,file) {
      if(deliver) await deliver(body,file);
      const now=new Date().toISOString();
      const m=db.prepare("INSERT INTO messages(lead_id,role,body,created) VALUES (?,'equipo',?,?)").run(id,body,now);
      if(file) db.prepare('INSERT INTO attachments VALUES (?,?,?,?)').run(m.lastInsertRowid,file.name,file.mime,file.bytes);
      db.prepare("UPDATE leads SET updated=?,stage=CASE WHEN stage='Nueva' THEN 'En conversación' ELSE stage END WHERE id=?").run(now,id);
    }
    async function human(reason) {
      f.phase='human';persist();
      db.prepare('UPDATE leads SET attention_reason=? WHERE id=?').run(reason,id);
      await say('Te dejo con el equipo de ventas de '+config().store+'. Puedes seguir escribiendo por este mismo chat.');
    }
    if(f.phase==='human' || ['Ganada','Perdida'].includes(lead.stage)) return;
    const t=normalize(text);
    if(lead.attention_reason || /\b(humano|persona real|asesor|vendedor)\b/.test(t)) return human('Pidió atención del equipo de ventas.');
    async function offer(){
      f.slots=available();f.phase='schedule';persist();
      if(!f.slots.length) return human('Necesita coordinar un horario.');
      await say('¿Qué horario te acomoda para venir? Responde con el número de la opción.\n'+f.slots.map((s,i)=>(i+1)+'. '+slotLabel(s)).join('\n'),{name:'Horarios.png',mime:'image/png',bytes:await slotsPNG(f.slots)});
    }
    const catalog=config().catalog;
    const quote=db.prepare('SELECT product_id,quantity,unit_price FROM quotes WHERE lead_id=?').get(id);
    const collecting=f.phase==='details' || f.phase==='company';
    const privateBuyer=/^(?:(?:compro|soy|es|compra|como)\s+(?:como\s+)?)?(?:particular|para mi|a mi nombre)[.! ]*$/.test(t.trim());
    const cleanName=value=>value.trim().replace(/^(?:me llamo|mi nombre es|soy)\s+/i,'').trim();
    const isName=value=>value.length<=70 && /^[\p{L}][\p{L}'’ -]*$/u.test(value) &&
      !/\b(particular|compro|quiero|necesito|precio|unidades|gracias|hola|buenas|visita|empresa|cuanto|cuesta|kit|tapete|soporte)\b/.test(normalize(value));
    const parts=text.trim().split(/[|\n]/).map(s=>s.trim());
    const named=cleanName(parts[0]);
    const items=catalog.filter(p=>t.includes(p.id));
    const units=t.match(/\b\d+\b/);
    if(collecting && items.length===1 && units && !/[?¿]/.test(text)){
      const qty=Number(units[0]);
      if(qty<1 || !Number.isSafeInteger(qty)) return say('¿Cuántas unidades necesitas?');
      if(qty>items[0].stock) return human('La cantidad solicitada supera las existencias.');
      f.product=items[0].id;f.quantity=qty;persist();
      return say('Anoté '+qty+' de '+items[0].name+'. '+(f.phase==='company'?'¿Para qué empresa es, o compras como particular?':'¿A qué nombre preparo la cotización?'));
    }
    const structured=collecting && (privateBuyer || (f.phase==='details' && isName(named)) ||
      (f.phase==='company' && !items.length && !/[?¿]/.test(text) && parts.length===1 && /^[\p{L}\d .&'-]{1,100}$/u.test(text) && !/\b(hola|buenas|gracias|quiero|necesito|cuanto|tienen|visita|me escuchas)\b/.test(t))) ||
      (f.phase==='schedule' && /^(?:la |opcion |el )?[1-4]\b/.test(t));
    const mentionsQuote=/\b(cotizacion|cotizado|presupuesto|pdf|mn-\d+)\b/.test(t);
    const newQuote=/\b(nuev[ao]|otr[ao]|cambiar|modificar)\b/.test(t);
    const asksPrevious=mentionsQuote && !newQuote && /\b(ya|tenia|tengo|anterior|antes|quedo|hicieron|hiciste|era|mande|mandaron|reenvia\w*)\b/.test(t);
    const productPage=catalog.find(p=>t.includes(normalize(p.name)) && /disponibilidad y precio/.test(t));
    if(productPage) return say(productPage.name+' cuesta '+money(productPage.price)+' CLP. '+(productPage.stock>0?'Tenemos '+productPage.stock+' unidades disponibles. ¿Cuántas necesitas?':'Por ahora está agotado.'));
    const asksCatalog=/\b(accesorios|catalogo|productos)\b/.test(t) && /\b(consultar|ver|conocer|tienen|venden|ofrecen|busco|muestrame)\b/.test(t);
    if(asksCatalog && !mentionsQuote && !catalog.some(p=>t.includes(p.id))){
      const names=new Intl.ListFormat('es-CL',{type:'conjunction'}).format(catalog.map(p=>p.name));
      return say('¡Hola! Tenemos '+names+'. ¿Cuál te interesa?');
    }
    const parsed=structured || asksPrevious ? null : await interpret(text,catalog,f.phase || 'inicio');
    if(asksPrevious || (mentionsQuote && !newQuote && parsed?.previousQuote===true)){
      if(!quote) return say('Todavía no veo una cotización guardada en este chat. ¿Qué producto te interesaba?');
      const item=catalog.find(p=>p.id===quote.product_id);
      return say('Sí, aquí está tu cotización MN-'+id+': '+quote.quantity+' × '+(item?.name || quote.product_id)+', por '+money(quote.quantity*quote.unit_price)+' CLP en total.');
    }
    const greeting=/^(hola( buenas?)?|buenas?( tardes| noches| dias)?|buenos dias|me (escuchas|lees)|estas ahi|alo|gracias)[.!?¿¡ ,]*$/.test(t.trim().replace(/^[¿¡]/,''));
    if(greeting || parsed?.conversation===true){
      const fallback=/escuchas|lees|ahi/.test(t) ? 'Sí, te leo. ¿En qué te puedo ayudar?' : '¡Hola! Cuéntame, ¿qué necesitas?';
      return say(typeof parsed?.answer==='string' && parsed.answer.trim() ? parsed.answer.trim().slice(0,450) : fallback);
    }
    if(f.phase==='schedule'){
      const choice=/^(?:la |opcion |el )?([1-4])\b/.exec(t);
      const hour=/\b(\d{1,2}):(\d{2})\b/.exec(t);
      const matches=hour ? f.slots.filter(s=>slotLabel(s).endsWith(hour[1].padStart(2,'0')+':'+hour[2])) : [];
      const slot=hour ? (matches.length===1 ? matches[0] : null) : choice && f.slots[Number(choice[1])-1];
      if(!slot) return say('Para reservar uno de esos bloques, dime el número que figura en la imagen. También puedes pedirme un vendedor.');
      try{storeVisit(lead,slot);}catch(e){if(!e.status)throw e;await say('Ese bloque ya no está disponible. Te muestro los horarios vigentes.');return offer();}
      await say('Tu visita quedó agendada para '+slotLabel(slot)+', hora de Chile.');
      return human('Visita confirmada. Continuar la atención personalmente.');
    }
    const hasQuote=Boolean(db.prepare('SELECT 1 FROM quotes WHERE lead_id=?').get(id));
    const asksVisit=/\b(visita|reunion|verlos?|pasar|horarios?)\b/.test(t);
    if(hasQuote && asksVisit) return offer();
    if(hasQuote && /^(?:(?:muchas|mil) )?gracias[.! ,]*(?:por (?:la cotizacion|el pdf))?[.! ]*$/i.test(t.trim())){
      return say('¡De nada! Si quieres coordinar una visita, escribe «visita».');
    }
    if(collecting){
      if(!structured) return say(f.phase==='company'?'¿Qué empresa pongo en la cotización? También puedes decir «particular».':'¿A qué nombre preparo la cotización?');
      if(privateBuyer) f.company='Particular';
      else if(f.phase==='company') f.company=text.trim();
      else {
        if(parts.length>2 || (parts[1]?.length || 0)>100) return say('¿Me das tu nombre y, si corresponde, el de tu empresa?');
        f.customer=named;
        if(parts[1]) f.company=parts[1];
      }
      if(!f.customer || !isName(f.customer)){
        delete f.customer;f.phase='details';persist();
        return say('Perfecto, a título personal. ¿A qué nombre preparo la cotización?');
      }
      const name=f.customer;
      if(!f.company){
        f.phase='company';persist();
        return say('Gracias, '+name+'. ¿Compras como particular o a nombre de una empresa?');
      }
      try{saveQuote(lead,{product:f.product,quantity:f.quantity});}catch(e){if(!e.status)throw e;return human(e.message);}
      f.phase='quoted';persist();
      db.prepare('UPDATE leads SET name=? WHERE id=?').run(name,id);
      await say('Aquí tienes tu cotización por '+money(db.prepare('SELECT unit_price*quantity AS total FROM quotes WHERE lead_id=?').get(id).total)+' CLP.',{name:'Cotizacion-MN-'+id+'.pdf',mime:'application/pdf',bytes:await pdfFor(id)});
      if(f.visit) return offer();
      return say('Si quieres pasar a ver los productos, dime «visita» y te envío los horarios.');
    }
    if(f.phase==='quoted' && !parsed?.product && !/nuev[ao]|otr[ao]|cambi|modific|pedido|precio|\d|kit|soporte|tapete/.test(t)){
      return say('Cuéntame un poco más. ¿Qué te gustaría saber?');
    }
    const matched=catalog.filter(p=>t.includes(p.id));
    let product=matched.length===1 ? matched[0].id : f.phase==='quoted' ? undefined : f.product;
    let quantity=Number(t.match(/\b\d+\b/)?.[0]) || (f.phase==='quoted' ? undefined : f.quantity);
    let visit=/visita|pasar|verlo|reunion/.test(t) || f.visit;
    if(parsed){
      if(parsed.human===true) return human('Solicitó hablar con ventas.');
      if(catalog.some(p=>p.id===parsed.product)) product=parsed.product;
      if(Number.isSafeInteger(parsed.quantity) && parsed.quantity>0) quantity=parsed.quantity;
      visit=visit || parsed.visit===true;
    }
    if(matched.length>1) return human('Solicitó varios productos en una cotización.');
    Object.assign(f,{product,quantity,visit});persist();
    if(!product || !quantity) {
      f.attempts=(f.attempts || 0)+1;persist();
      if(f.attempts>=3)return human('Consulta sin producto o cantidad claros.');
      return say('Para cotizarte, dime el producto y cuántas unidades necesitas. Tenemos '+catalog.map(p=>p.name).join(', ')+'.');
    }
    if(quantity>catalog.find(p=>p.id===product).stock) return human('La cantidad solicitada supera las existencias.');
    if(f.phase==='quoted'){delete f.customer;delete f.company;}
    f.phase='details';persist();
    await say('Sí, tenemos '+quantity+' unidades. Te preparo el PDF. ¿A nombre de quién lo hago y para qué empresa? Puedes escribir Nombre | Empresa. Si compras para ti, indica «particular» como empresa.');
  }
  return {turn,pdfFor,available,flow};
}
