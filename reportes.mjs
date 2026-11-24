import nodemailer from 'nodemailer';
import {money} from './materiales.mjs';

const tz='America/Santiago';
const localDay=new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const dayAt = value=>localDay.format(new Date(value));
function shift(day,offset){
  const stamp=new Date(day+'T12:00:00Z');
  stamp.setUTCDate(stamp.getUTCDate()+offset);
  return stamp.toISOString().slice(0,10);
}
export function dailyReports(db,{scenario=false,env=process.env,transport=null}={}){
  db.exec(`CREATE TABLE IF NOT EXISTS report_wins(lead_id INTEGER,at TEXT,amount INTEGER,legacy INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS report_wins_at ON report_wins(at);
    CREATE TABLE IF NOT EXISTS report_settings(id INTEGER PRIMARY KEY CHECK(id=1),recipient TEXT,time TEXT,enabled INTEGER);
    INSERT OR IGNORE INTO report_settings VALUES(1,'','08:00',0);
    CREATE TABLE IF NOT EXISTS report_deliveries(day TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS track_report_win AFTER UPDATE OF stage ON leads
    WHEN NEW.stage='Ganada' AND OLD.stage!='Ganada' BEGIN
      INSERT INTO report_wins(lead_id,at,amount) SELECT NEW.id,NEW.updated,(SELECT quantity*unit_price FROM quotes WHERE lead_id=NEW.id);
    END;`);
  db.exec(`INSERT INTO report_wins(lead_id,at,amount,legacy)
    SELECT l.id,l.updated,q.quantity*q.unit_price,1 FROM leads l LEFT JOIN quotes q ON q.lead_id=l.id
    WHERE l.stage='Ganada' AND NOT EXISTS(SELECT 1 FROM report_wins w WHERE w.lead_id=l.id)`);
  const configured=Boolean(transport || (env.GMAIL_FROM && env.GMAIL_APP_PASSWORD));
  const sender=transport || (configured && nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:env.GMAIL_FROM,pass:env.GMAIL_APP_PASSWORD},connectionTimeout:12000,socketTimeout:20000}));
  function settings(){return {...db.prepare('SELECT recipient,time,enabled FROM report_settings WHERE id=1').get(),configured,scenario};}
  function save({recipient,time,enabled}){
    if(typeof recipient!=='string' || recipient.length>254 || (recipient && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || typeof enabled!=='boolean')
      throw Object.assign(new Error('Revisa el correo y la hora.'),{status:400});
    if(enabled && (!configured || scenario || !recipient)) throw Object.assign(new Error('Para activar el envío configura Gmail, un destinatario y el CRM habitual.'),{status:409});
    db.prepare('UPDATE report_settings SET recipient=?,time=?,enabled=? WHERE id=1').run(recipient,time,Number(enabled));
    return settings();
  }
  function week(end=dayAt(Date.now())){
    const entries=Array.from({length:7},(_,i)=>({day:shift(end,i-6),leads:0,quotes:0,visits:0,wins:0,amount:0,unknown:0,legacy:0}));
    const days=new Map(entries.map(d=>[d.day,d]));
    const from=shift(entries[0].day,-1), until=shift(end,2);
    const filter=scenario ? '' : " AND l.channel!='Simulación'";
    for(const [metric,source,stamp] of [
      ['leads','leads l','l.created'],['quotes','quotes q JOIN leads l ON l.id=q.lead_id','q.created'],
      ['visits','visits v JOIN leads l ON l.id=v.lead_id','v.starts'],['wins','report_wins w JOIN leads l ON l.id=w.lead_id','w.at']]){
      const extra=metric==='wins'?',w.amount,w.legacy':'';
      for(const row of db.prepare('SELECT '+stamp+' AS stamp'+extra+' FROM '+source+' WHERE '+stamp+' >= ? AND '+stamp+' < ?'+filter).all(from,until)){
        const d=days.get(dayAt(row.stamp));if(!d)continue;
        d[metric]++;
        if(metric==='wins'){d.amount+=row.amount || 0;d.unknown+=Number(row.amount===null);d.legacy+=row.legacy;}
      }
    }
    return entries;
  }
  function mail(d,store){
    return {subject:store+' · Ventas del '+d.day,text:[
      'Resumen del '+d.day+' · '+store,
      'Consultas nuevas: '+d.leads,'Cotizaciones vigentes emitidas ese día: '+d.quotes,
      'Ventas marcadas como ganadas: '+d.wins,'Monto cotizado de los cierres: '+money(d.amount)+' CLP',
      'Visitas en agenda para ese día: '+d.visits,
      ...(d.unknown?['Cierres sin monto registrado: '+d.unknown]:[]),
      ...(d.legacy?['Los cierres anteriores al registro diario se ubican según la última actualización disponible.']:[]),
      'La cobranza se verifica por separado.'
    ].join('\n')};
  }
  async function tick(store,now=new Date()){
    const cfg=settings();
    if(!cfg.enabled || scenario || !sender || localTime.format(now)<cfg.time)return;
    const day=shift(dayAt(now),-1);
    if(!db.prepare("INSERT OR IGNORE INTO report_deliveries VALUES (?,'en curso')").run(day).changes)return;
    try{
      await sender.sendMail({from:env.GMAIL_FROM,to:cfg.recipient,...mail(week(day).at(-1),store)});
      db.prepare("UPDATE report_deliveries SET status='enviado' WHERE day=?").run(day);
    }catch{
      db.prepare("UPDATE report_deliveries SET status='revisar entrega' WHERE day=?").run(day);
    }
  }
  function preview(store){
    const today=dayAt(Date.now()), rows=week(shift(today,-1));
    return {rows,example:scenario,today,emails:rows.map(d=>mail(d,store)),settings:settings(),last:db.prepare('SELECT * FROM report_deliveries ORDER BY day DESC LIMIT 1').get() || null};
  }
  return {save,tick,preview};
}
