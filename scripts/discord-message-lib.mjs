/** Mise en forme déterministe du bulletin du Village du Ciel.
 * Les événements invisibles localement ne sont pas annoncés.
 * Les horaires UTC sont présentés comme instants du phénomène, et non heures d'observation.
 */
import {parisDay,addDays} from './catalogue-lib.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {merge,basic,freshness}=require('./catalogue-merge.cjs');
const tz='Europe/Paris';
const priorityWeight={majeur:0,interessant:1,specialise:2};
const fmtDate=new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',timeZone:'UTC'});
const fmtTime=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:tz});
export const AGENDA_URL='https://allsky.villageduciel.fr/Agenda-Astro/';
export function collectEvents(editorial,generated){
  return merge(Array.isArray(editorial)?editorial:[],Array.isArray(generated)?generated:[])
    .filter(e=>basic(e)&&e.visibility!=='invisible');
}
function sorted(xs){return xs.sort((a,b)=>a.date.localeCompare(b.date)||(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)||(a.utc||'').localeCompare(b.utc||'')||a.title.localeCompare(b.title));}
export function selectEvents(events,now){
  const today=parisDay(now),days3=addDays(today,3),days7=addDays(today,7);
  const relevant=events.filter(e=>e.date>=today&&e.date<=days7);
  return {
    today, 
    todayEvents: sorted(relevant.filter(e=>e.date===today)),
    nearEvents: sorted(relevant.filter(e=>e.date>today&&e.date<=days3)),
    majorEvents: sorted(relevant.filter(e=>e.date>days3&&e.priority==='majeur'))
  };
}
function clean(s){return String(s||'').replace(/[`*_~<>@]/g,'').replace(/\s+/g,' ').slice(0,135);}
export function eventLine(e){
  const d=fmtDate.format(new Date(e.date+'T12:00:00Z'));
  // La date suffit si c'est une simple période sans horaire d'instant indiqué.
  const moment=e.utc&&e.precision!=='date'?` · instant ${fmtTime.format(new Date(e.utc))}`:'';
  const tag=e.priority==='majeur'?' [MAJEUR]':'';
  const vis=e.visibility==='difficile'?' [difficile]':e.visibility==='variable'?' [à confirmer]':'';
  return `• **${d}** — ${clean(e.title)}${moment}${tag}${vis}`;
}
function field(name,events,limit=9){
  const shown=events.slice(0,limit),lines=shown.map(eventLine);let value=lines.join('\n');
  if(events.length>shown.length)value+=`\n… et ${events.length-shown.length} autre(s) à retrouver dans l’agenda.`;
  while(value.length>1024&&lines.length>1){lines.pop();value=lines.join('\n')+`\n… voir l’agenda pour la suite.`;}
  if(value.length>1024)value=value.slice(0,1000)+'…';
  return {name,value:value||'Aucun événement répertorié.',inline:false};
}
export function makeMessage(events,now){
  const {today,todayEvents,nearEvents,majorEvents}=selectEvents(events,now);
  const display=new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeZone:tz}).format(now);
  return {
    username:'Agenda Astro · Village du Ciel',
    content:`**Bulletin astronomique — ${display}**\nLes Herbiers (85) · Observations et instants en heure française.`,
    embeds:[{
      title:'Les rendez-vous du ciel',url:AGENDA_URL,
      description:'Prévisions indicatives : météo, hauteur des astres et sources à vérifier avant observation. Les rappels n’incluent pas les phénomènes déclarés invisibles localement.',
      color:0x347ebc,
      fields:[field('Aujourd’hui',todayEvents,8),field('Dans les 3 prochains jours',nearEvents,10),field('À anticiper dans les 7 jours · majeurs',majorEvents,5)],
      footer:{text:`Village du Ciel · Les Herbiers · Agenda Astro · ${today}`}
    }],
    allowed_mentions:{parse:[]}
  };
}
export function generatedIsUsable(json,now){
  return Boolean(json&&freshness(json,now).ok);
}
export async function sendToDiscord(webhook,payload,fetcher=fetch){
  if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[^\s/?#]+$/.test(webhook))throw Error('Webhook Discord invalide. Configurer le secret DISCORD_WEBHOOK_URL.');
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    if(response.ok)return true;
    if(response.status===429 && attempt<2){
      const body=await response.json().catch(()=>({}));
      const delay=Math.min(5000,Math.max(1000,(Number(body.retry_after)||1)*1000));
      await new Promise(resolve=>setTimeout(resolve,delay));continue;
    }
    // Ne jamais afficher le texte brut retourné : il peut contenir un secret.
    throw Error(`Discord a refusé le message (HTTP ${response.status}).`);
  }
  throw Error('Publication Discord impossible après 3 tentatives.');
}
