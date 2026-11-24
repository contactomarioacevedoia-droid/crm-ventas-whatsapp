import makeSocket, { DisconnectReason, useMultiFileAuthState, normalizeMessageContent } from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import {rename} from 'node:fs/promises';

export function linkPhone(onMessage) {
  const folder='./datos/vinculo';
  let socket, starting=false, status='Sin vincular', qr='', epoch=0;
  async function start(){
    if(socket || starting) return;
    starting=true;
    status='Conectando con WhatsApp…';
    try {
      const {state,saveCreds}=await useMultiFileAuthState(folder);
      const current=makeSocket({auth:state,logger:pino({level:'silent'}),markOnlineOnConnect:false,syncFullHistory:false});
      socket=current;
      current.ev.on('creds.update',saveCreds);
      current.ev.on('connection.update',async update=>{
        if(socket!==current)return;
        if(update.qr){
          const version=++epoch;
          const image=await QRCode.toDataURL(update.qr,{width:300,margin:3});
          if(version===epoch && current===socket){qr=image;status='Escanea desde Dispositivos vinculados';}
        }
        if(update.connection==='open'){epoch++;qr='';status='Vinculado';}
        if(update.connection==='close'){
          const reason=update.lastDisconnect?.error?.output?.statusCode;
          epoch++;qr='';socket=null;status='Sin conexión. Pulsa Mostrar QR para reintentar.';
          if(reason===DisconnectReason.loggedOut){
            await rename(folder,folder+'-cerrado-'+Date.now()).catch(()=>{});
          } else if(reason===DisconnectReason.restartRequired) {
            start().catch(()=>{status='Reconecta desde el CRM.';});
          }
        }
      });
      current.ev.on('messages.upsert',({type,messages})=>{
        if(type!=='notify')return;
        for(const message of messages){
          const from=message.key.remoteJid;
          if(message.key.fromMe || !/@(s\.whatsapp\.net|lid)$/.test(from) || !message.key.id)continue;
          const payload=normalizeMessageContent(message.message);
          const body=payload?.conversation || payload?.extendedTextMessage?.text;
          if(!body)continue;
          onMessage({from,name:message.pushName,body,id:from+'/'+message.key.id}).catch(()=>console.error('Revisa la ficha en Te toca.'));
        }
      });
    }catch(error){status='Sin conexión. Vuelve a intentarlo.';throw error;}
    finally{starting=false;}
  }
  async function send(to,text,file){
    if(status!=='Vinculado' || !socket) throw Object.assign(new Error('Vincula WhatsApp en Conexiones.'),{status:409});
    let payload={text};
    if(file?.mime==='image/png') payload={image:file.bytes,caption:text};
    if(file?.mime==='application/pdf') payload={document:file.bytes,mimetype:file.mime,fileName:file.name,caption:text};
    await socket.sendMessage(to,payload);
  }
  return {start,send,state:()=>({status,qr})};
}
