/** Mise en forme déterministe du bulletin du Village du Ciel.
 * Les événements invisibles localement ne sont pas annoncés.
 * Les horaires UTC sont présentés comme instants du phénomène, et non heures d'observation.
 */
import {parisDay,addDays} from './catalogue-lib.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {merge,basic,freshness}=require('./catalogue-merge.cjs');
const meteo=require('./meteo-astro.cjs');
const skyScore=require('./score-ciel.cjs');
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
  const today=parisDay(now),tomorrow=addDays(today,1);
  const days3=addDays(today,3),days7=addDays(today,7);
  const relevant=events.filter(e=>e.date>=today&&e.date<=days7);
  const todayEvents=sorted(relevant.filter(e=>e.date===today));
  const tomorrowEvents=sorted(relevant.filter(e=>e.date===tomorrow));
  const laterEvents=sorted(relevant.filter(e=>e.date>tomorrow&&e.date<=days3));
  return {
    today,tomorrow,todayEvents,tomorrowEvents,laterEvents,
    // Conserver nearEvents pour les appels existants (J+1 à J+3).
    nearEvents: sorted([...tomorrowEvents,...laterEvents]),
    majorEvents: sorted(relevant.filter(e=>e.date>days3&&e.priority==='majeur'&&e.type!=='lune')),
    laterMoonPhases: sorted(relevant.filter(e=>e.date>days3&&e.type==='lune'))
  };
}
function clean(s){return String(s||'').replace(/[`*_~<>@]/g,'').replace(/\s+/g,' ').slice(0,135);}
const moonIcons={nouvelle:'🌑',premier:'🌓',pleine:'🌕',dernier:'🌗'};
export function eventLine(e,{showDate=true}={}){
  const d=fmtDate.format(new Date(e.date+'T12:00:00Z'));
  // La date suffit si c'est une simple période sans horaire d'instant indiqué.
  const moment=e.utc&&e.precision!=='date'?` · instant ${fmtTime.format(new Date(e.utc))}`:'';
  const isMoon=e.type==='lune';
  const prefix=isMoon?(moonIcons[e.kind]||'🌙'):'•';
  const tag=!isMoon&&e.priority==='majeur'?' [MAJEUR]':'';
  const vis=e.visibility==='difficile'?' [difficile]':e.visibility==='variable'?' [à confirmer]':'';
  return `${prefix} ${showDate?'**'+d+'** — ':''}${clean(e.title)}${moment}${tag}${vis}`;
}
function field(name,events,limit=9,{showDate=true}={}){
  const shown=events.slice(0,limit),lines=shown.map(e=>eventLine(e,{showDate}));
  let value=lines.join('\n');
  if(events.length>shown.length)value+=`\n… et ${events.length-shown.length} autre(s) dans l'agenda complet.`;
  while(value.length>1024&&lines.length>1){lines.pop();value=lines.join('\n')+'\n… autres événements dans l’agenda.';}
  if(value.length>1024)value=value.slice(0,1000)+'…';
  return {name,value:value||'Aucun événement signalé dans le catalogue.',inline:false};
}
const fmtShort=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
function dayTitle(day){return fmtShort.format(new Date(day+'T12:00:00Z'));}
function weatherField(day,heading){
  // Quatre périodes restent disponibles, mais sur deux jours seulement.
  // Aucune valeur n'est extrapolée lorsqu'une période est absente.
  return {
    name:heading,
    value:day.periods.map(p=>`**${p.label}** · ${meteo.weatherText(p)}`).join('\n'),
    inline:false
  };
}
export function makeMessage(events,now,weather=null){
  const {today,tomorrow,todayEvents,tomorrowEvents,laterEvents,majorEvents,laterMoonPhases}=selectEvents(events,now);
  const display=new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeZone:tz}).format(now);
  // La sélection de la meilleure nuit ne porte volontairement que sur J / J+1.
  const days=(weather?.days||[]).slice(0,2);
  const ranking=skyScore.rankDays(days),best=ranking.best;
  const poor=ranking.scores.filter(s=>s.available).every(s=>s.score<40);
  const bestLabel=best?(poor?'Nuit la moins défavorable':'Meilleure nuit estimée'):'Conditions nocturnes';
  const bestValue=best
    ?`${meteo.dayLabel(best.date)} · **${best.score}/100 (${skyScore.label(best.level)})** · nuages du soir/nuit : ${best.clouds} %.`
    :'Données insuffisantes pour comparer les deux nuits.';
  const weatherFields=[{name:bestLabel,value:bestValue,inline:false},
    ...days.map((d,i)=>weatherField(d,i===0?'☀️ AUJOURD’HUI · '+meteo.dayLabel(d.date):'🌙 DEMAIN · '+meteo.dayLabel(d.date)))];
  if(!days.length)weatherFields.push({name:'Prévisions indisponibles',value:'Aucune donnée météo disponible ce matin. Consultez le site pour réessayer.',inline:false});

  const eventFields=[
    field(`🟠 AUJOURD’HUI · ${dayTitle(today)}`,todayEvents,8,{showDate:false}),
    field(`🔵 DEMAIN · ${dayTitle(tomorrow)}`,tomorrowEvents,8,{showDate:false})
  ];
  if(laterEvents.length)eventFields.push(field('📆 Dans 2 à 3 jours',laterEvents,9));
  if(majorEvents.length)eventFields.push(field('⭐ Événements majeurs à J+4–J+7',majorEvents,5));
  if(laterMoonPhases.length)eventFields.push(field('🌙 Phases lunaires à J+4–J+7',laterMoonPhases,4));
  const alerts=[
    todayEvents.length?`🟠 **AUJOURD’HUI : ${todayEvents.length} événement${todayEvents.length>1?'s':''}**`:null,
    tomorrowEvents.length?`🔵 **DEMAIN : ${tomorrowEvents.length} événement${tomorrowEvents.length>1?'s':''}**`:null
  ].filter(Boolean).join(' · ');

  return {
    username:'Agenda Astro · Village du Ciel',
    // URL publique volontairement sur sa propre ligne, cliquable et visible sur mobile.
    content:`🔭 **BULLETIN ASTRONOMIQUE — ${display}**\n📍 Les Herbiers (85) · heures françaises${alerts?'\n'+alerts:''}\n\n📅 **AGENDA COMPLET — ÉVÉNEMENTS ET FICHES**\n${AGENDA_URL}`,
    embeds:[
      {
        title:'🔭 Rendez-vous astronomiques · aujourd’hui et demain',
        url:AGENDA_URL,
        description:'Les événements annoncés comme invisibles depuis Les Herbiers sont exclus. Les instants calculés ne sont pas toujours des heures d’observation.',
        color:0xe8a76c,
        fields:eventFields,
        footer:{text:`Village du Ciel · Les Herbiers · ${today}`}
      },
      {
        title:'☁️ Météo d’observation · aujourd’hui et demain',
        url:AGENDA_URL,
        description:'Nuages, température, vent et humidité. « Nuit suivante » = 00–06 h le lendemain. Indice indicatif pour le ciel profond, sans mesure de turbulence ni hauteur lunaire.',
        color:0x36aabd,
        fields:weatherFields,
        footer:{text:'Prévisions indicatives · Open-Meteo (CC BY 4.0) · https://open-meteo.com/'}
      }
    ],
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
