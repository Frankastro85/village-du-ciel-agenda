/** Agenda Astro · Bulletin Discord visuel V3 (Components V2).
 * Structure : événement du jour (ambre), rendez-vous (bleu), phases lunaires
 * (violet), météo sur 3 jours (turquoise) et lien agenda.
 * Conserve la sélection, les informations d'observation et la prévention de
 * doublons gérée par discord-bulletin.mjs. Pas de secret dans ce fichier.
 */
import {parisDay, addDays} from './catalogue-lib.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {merge, basic, freshness}=require('./catalogue-merge.cjs');
const meteo=require('./meteo-astro.cjs');
const skyScore=require('./score-ciel.cjs');

export const AGENDA_URL='https://allsky.villageduciel.fr/Agenda-Astro/';
const TZ='Europe/Paris';
const priorityWeight={majeur:0,interessant:1,specialise:2};
const dateShort=new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',timeZone:'UTC'});
const dateFull=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const timeParis=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
const moonIcons={nouvelle:'🌑',premier:'🌓',pleine:'🌕',dernier:'🌗'};
const color={ambre:0xf2a33a,bleu:0x5d9ee9,violet:0x9d80dd,turquoise:0x41b9cb};

const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const safe=(s,max=300)=>String(s??'').replace(/[`*_~<>@]/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const dateLabel=d=>dateFull.format(new Date(`${d}T12:00:00Z`));
const sorted=items=>[...items].sort((a,b)=>a.date.localeCompare(b.date)
  ||(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)
  ||(a.utc||'').localeCompare(b.utc||'')||a.title.localeCompare(b.title));
const TXT=text=>({type:10,content:text});
const SEP=()=>({type:14,divider:true,spacing:1});
const CARD=(accent,...children)=>({type:17,accent_color:accent,components:children});

export function collectEvents(editorial,generated){
  return merge(Array.isArray(editorial)?editorial:[],Array.isArray(generated)?generated:[])
    .filter(e=>basic(e)&&e.visibility!=='invisible');
}
export function selectEvents(events,now){
  const today=parisDay(now),tomorrow=addDays(today,1);
  const days3=addDays(today,3),days7=addDays(today,7);
  const relevant=events.filter(e=>e.date>=today&&e.date<=days7);
  const todayEvents=sorted(relevant.filter(e=>e.date===today));
  const tomorrowEvents=sorted(relevant.filter(e=>e.date===tomorrow));
  const laterEvents=sorted(relevant.filter(e=>e.date>tomorrow&&e.date<=days3));
  return {today,tomorrow,todayEvents,tomorrowEvents,laterEvents,
    nearEvents:sorted([...tomorrowEvents,...laterEvents]),
    majorEvents:sorted(relevant.filter(e=>e.date>days3&&e.priority==='majeur'&&e.type!=='lune')),
    laterMoonPhases:sorted(relevant.filter(e=>e.date>days3&&e.type==='lune'))};
}
export function eventLine(e,{showDate=true}={}){
  const d=dateShort.format(new Date(`${e.date}T12:00:00Z`));
  const instant=e.utc&&e.precision!=='date'&&Number.isFinite(Date.parse(e.utc))
    ?` · instant ${timeParis.format(new Date(e.utc))}`:'';
  const isMoon=e.type==='lune';
  const prefix=isMoon?(moonIcons[e.kind]||'🌙'):'•';
  const flag=!isMoon&&e.priority==='majeur'?' · **MAJEUR**':'';
  const visibility=e.visibility==='difficile'?' · difficile':e.visibility==='variable'?' · à confirmer':'';
  return `${prefix} ${showDate?`**${d}** · `:''}${safe(e.title,115)}${instant}${flag}${visibility}`;
}

// Note météo : données Open-Meteo identiques à l'agenda. Créneaux moyens
// de 6 heures, jamais présentés comme une météo à une minute exacte.
function requestedPeriods(e){
  const p=normalized(e.period);
  if(/instant astronomique|heure non renseignee|selon l.heure/.test(p))return null;
  const n=p.match(/nuits?\s+du\s+(\d{1,2})\s+au\s+(\d{1,2})/);
  if(n&&Number(n[1])!==Number(String(e.date||'').slice(-2)))return null;
  if(/fin de nuit|seconde partie de nuit|deuxieme partie de nuit|avant l.aube|aube|avant le lever du soleil/.test(p))
    return {keys:['nuit'],label:'fin de nuit (00–06 h)'};
  if(/matin/.test(p))return {keys:['matin'],label:'matin (06–12 h)'};
  if(/apres.midi|journee|en journee/.test(p))return {keys:['apresmidi'],label:'après-midi (12–18 h)'};
  if(/soir|crepuscule|apres le coucher du soleil/.test(p)&&!/nuit/.test(p))
    return {keys:['soiree'],label:'soirée (18–00 h)'};
  if(/nuit|nocturne|meteores/.test(p)||e.type==='meteores')
    return {keys:['soiree','nuit'],label:'soirée et nuit suivante (18–06 h)'};
  return null;
}
function météoClasse(score,clouds){
  if(score>=85&&clouds<=20)return 'Excellentes';
  if(score>=70&&clouds<=40)return 'Bonnes';
  if(score>=50&&clouds<=65)return 'Moyennes';
  return 'Défavorables';
}
function pictogramme(label){
  if(label==='Excellentes'||label==='Bonnes')return '🟢';
  if(label==='Moyennes')return '🟠';
  if(label==='Défavorables')return '🔴';
  return '⚪';
}
export function conditionsEvenement(e,weather){
  if(!e||e.type==='lune'||e.type==='saison')return null;
  const selected=requestedPeriods(e);
  if(!selected)return null;
  const day=(weather?.days||[]).find(d=>d.date===e.date);
  if(!day)return {available:false,text:'Prévisions indisponibles pour ce jour.'};
  const periods=selected.keys.map(k=>(day.periods||[]).find(p=>p.key===k));
  if(periods.some(p=>!p?.available||!['cloud_cover','wind_speed_10m','relative_humidity_2m'].every(k=>Number.isFinite(p[k]))))
    return {available:false,text:'Prévisions incomplètes pour ce créneau.'};
  const avg=k=>periods.reduce((sum,p)=>sum+p[k],0)/periods.length;
  const clouds=avg('cloud_cover'),wind=avg('wind_speed_10m'),humidity=avg('relative_humidity_2m');
  const lunar=selected.keys.some(k=>k==='soiree'||k==='nuit')?skyScore.moonFractionApprox(e.date):0;
  if(!Number.isFinite(lunar))return {available:false,text:'Indice météo non calculable.'};
  const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
  const score=Math.round(clamp(100-clouds*.76-lunar*14-clamp(wind/40)*6-clamp((humidity-60)/40)*4,0,100));
  const label=météoClasse(score,clouds);
  return {available:true,label,score,clouds:Math.round(clouds),wind:Math.round(wind),period:selected.label,
    text:`${label} · indice ${score}/100 · nuages ${Math.round(clouds)} % · vent ${Math.round(wind)} km/h · ${selected.label}`};
}
function focusEvent(todayEvents){
  return sorted(todayEvents).sort((a,b)=>(a.type==='lune'?1:0)-(b.type==='lune'?1:0)
    ||(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9))[0]||null;
}
function focusCard(e,today,weather){
  const title=`✨ **À OBSERVER AUJOURD'HUI**\n## ${safe(e.title,130)}`;
  const details=[];
  if(e.priority==='majeur')details.push('⭐ **Événement majeur**');
  if(e.period)details.push(`🕒 **Période :** ${safe(e.period,130)}`);
  if(e.utc&&e.precision!=='date'&&Number.isFinite(Date.parse(e.utc)))
    details.push(`**Instant astronomique :** ${timeParis.format(new Date(e.utc))} (pas nécessairement l’heure d’observation)`);
  if(e.description)details.push(safe(e.description,330));
  if(e.advice)details.push(`💡 **Conseil :** ${safe(e.advice,190)}`);
  if(e.visibility==='variable'||e.visibility==='difficile')details.push('Visibilité astronomique locale : à vérifier.');
  const c=conditionsEvenement(e,weather);
  const meteoText=!c?'⚪ **Météo :** créneau d’observation non déterminé.'
    :!c.available?`⚪ **Météo :** ${c.text}`
    :`${pictogramme(c.label)} **Météo : ${c.label}** · ${c.score}/100\n☁️ Nuages ${c.clouds} % · Vent ${c.wind} km/h · ${c.period}`;
  return CARD(color.ambre,TXT(title),TXT(details.join('\n')),SEP(),TXT(meteoText));
}
function linesOf(events,limit,{showDate=true}={}){
  const shown=events.slice(0,limit);
  const lines=shown.map(e=>eventLine(e,{showDate}));
  if(events.length>shown.length)lines.push(`… et ${events.length-shown.length} autre(s) événement(s) dans l'agenda.`);
  return lines.join('\n');
}
function nextEventsCard(selection,focus,weather){
  const {today,tomorrow,todayEvents,tomorrowEvents,laterEvents,majorEvents}=selection;
  const other=todayEvents.filter(e=>e.id!==focus?.id);
  const blocks=['🔵 **DEMAIN · '+dateLabel(tomorrow).toUpperCase()+'**',
    linesOf(tomorrowEvents,5,{showDate:false})||'Aucun événement signalé dans le catalogue.'];
  if(other.length)blocks.push(`**Autres événements aujourd’hui**\n${linesOf(other,4,{showDate:false})}`);
  const tomorrowRatings=tomorrowEvents.filter(e=>e.type!=='lune'&&e.type!=='saison').map(e=>{
    const c=conditionsEvenement(e,weather);
    return c?`${pictogramme(c.label)} ${safe(e.title,90)} : ${c.available?`${c.label} (${c.score}/100)`:'prévision indisponible'}`:null;
  }).filter(Boolean);
  if(tomorrowRatings.length)blocks.push(`**Conditions demain**\n${tomorrowRatings.slice(0,3).join('\n')}`);
  if(laterEvents.length)blocks.push(`**📆 Dans 2 à 3 jours**\n${linesOf(laterEvents,4)}`);
  if(majorEvents.length)blocks.push(`**⭐ Événements majeurs à J+4–J+7**\n${linesOf(majorEvents,4)}`);
  blocks.push('_Les événements annoncés invisibles depuis Les Herbiers sont exclus. Les instants astronomiques ne sont pas nécessairement des heures d’observation._');
  return CARD(color.bleu,TXT(blocks.join('\n\n').slice(0,1150)));
}
function moonCard(events,today){
  // Les quatre prochaines phases, même si l'une est également signalée
  // comme événement du jour. Il n'y a aucun doublon dans le bloc « aujourd'hui ».
  const moon=sorted(events.filter(e=>e.type==='lune'&&e.date>=today)).slice(0,4);
  const content=moon.length?moon.map(e=>eventLine(e)).join('\n')
    :'Aucune phase lunaire disponible dans le catalogue pour les prochaines dates.';
  return CARD(color.violet,TXT(`🌙 **PROCHAINES PHASES LUNAIRES**\n${content.slice(0,600)}`));
}
function scoreClass(score){
  if(!Number.isFinite(score))return {name:'Indisponibles',dot:'⚪'};
  if(score>=85)return {name:'Excellentes',dot:'🟢'};
  if(score>=75)return {name:'Bonnes',dot:'🟢'};
  if(score>=50)return {name:'Moyennes',dot:'🟠'};
  return {name:'Défavorables',dot:'🔴'};
}
function meteoDetail(day){
  const summary=(day.periods||[]).map(p=>p.available?
    `**${safe(p.label,30)} :** ${meteo.weatherText(p)}`:`**${safe(p.label,30)} :** prévision indisponible`).join('\n');
  return `**${meteo.dayLabel(day.date)}**\n${summary}`;
}
function weatherCard(weather){
  const days=(weather?.days||[]).slice(0,3);
  const ranking=skyScore.rankDays(days);
  const labels=['Aujourd’hui','Demain','J+2'];
  const three=Array.from({length:3},(_,i)=>{
    const d=days[i],sc=ranking.scores[i];
    if(!d||!sc?.available)return `⚪ **${labels[i]} :** prévisions indisponibles`;
    const {name,dot}=scoreClass(sc.score);
    return `${dot} **${labels[i]} · ${meteo.dayLabel(d.date)} : ${name}** · ${sc.score}/100 · nuages ${sc.clouds} %`;
  }).join('\n');
  const best=ranking.best;
  const bestText=best?
    `✨ **Meilleure nuit estimée :** ${meteo.dayLabel(best.date)} · ${scoreClass(best.score).dot} ${best.score}/100 · nuages soir/nuit ${best.clouds} %`:
    'Prévisions nocturnes insuffisantes pour comparer les trois nuits.';
  const detail=days.length?days.map(meteoDetail).join('\n\n'):'Aucune donnée météo disponible. Consultez le site.';
  return CARD(color.turquoise,
    TXT(`🌤️ **MÉTÉO D'OBSERVATION · 3 JOURS**\n${three}`),
    TXT(bestText),SEP(),
    TXT(`**DÉTAIL DES PRÉVISIONS**\n${detail.slice(0,1550)}`),
    TXT('_Indice indicatif : nuages, gêne lunaire approximative, vent et humidité. Nuit suivante = 00–06 h le lendemain. Pas de mesure du seeing ou de la transparence._')
  );
}
function textParts(components){
  const result=[];
  for(const comp of components){
    if(comp.type===10)result.push(comp);
    if(Array.isArray(comp.components))result.push(...textParts(comp.components));
  }
  return result;
}
function limitV2Text(components){
  const texts=textParts(components);
  const total=texts.reduce((n,c)=>n+c.content.length,0);
  if(total<=3900)return;
  // Réduction de la partie détaillée météo d'abord, sans effacer les titres,
  // la synthèse 3 jours ni les phases lunaires.
  let remaining=total-3900;
  const candidates=[...texts].filter(c=>c.content.includes('**DÉTAIL DES PRÉVISIONS**'));
  for(const c of candidates){
    if(remaining<=0)break;
    const keep=Math.max(180,c.content.length-remaining-65);
    const old=c.content.length;
    if(keep<old)c.content=c.content.slice(0,keep).replace(/\n[^\n]*$/,'')+'\n… détails complets dans l’Agenda Astro.';
    remaining-=old-c.content.length;
  }
  // En cas de catalogue exceptionnellement chargé, compacter les rendez-vous.
  for(const c of texts.filter(c=>c.content.startsWith('🔵 **DEMAIN'))){
    if(remaining<=0)break;
    const old=c.content.length;
    c.content=c.content.slice(0,Math.max(170,old-remaining-70)).replace(/\n[^\n]*$/,'')+'\n… autres dates dans l’agenda.';
    remaining-=old-c.content.length;
  }
  if(texts.reduce((n,c)=>n+c.content.length,0)>4000)throw Error('Bulletin Discord : limite de texte Components V2 dépassée.');
}
export function makeMessage(events,now,weather=null){
  const selection=selectEvents(events,now);
  const {today,todayEvents}=selection;
  const focus=focusEvent(todayEvents);
  const date=new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeZone:TZ}).format(now);
  const count=todayEvents.length;
  const header=TXT(`🔭 **BULLETIN ASTRONOMIQUE — ${date}**\n📍 Les Herbiers (85) · heures françaises${count?` · ${count} événement${count>1?'s':''} aujourd’hui`:''}`);
  const components=[header];
  if(focus)components.push(focusCard(focus,today,weather));
  components.push(nextEventsCard(selection,focus,weather));
  components.push(moonCard(events,today));
  components.push(weatherCard(weather));
  components.push(TXT(`📅 **[Agenda complet et météo détaillée](${AGENDA_URL})**\n_Village du Ciel · Les Herbiers (85) · Sources astronomiques du catalogue et Open-Meteo (CC BY 4.0)._`));
  limitV2Text(components);
  return {username:'Agenda Astro · Village du Ciel',flags:32768,components,allowed_mentions:{parse:[]}};
}
export function generatedIsUsable(json,now){return Boolean(json&&freshness(json,now).ok);}

// Repli compatible : si Discord refuse les Components V2 (400), reconstituer
// un message classique à partir des mêmes rubriques, sans URL répétée sur
// les embeds (Discord masque les embeds partageant la même URL).
function legacyFallback(payload){
  const main=payload.components.filter(c=>c.type===10);
  const cards=payload.components.filter(c=>c.type===17);
  const embeds=cards.map(c=>({
    color:c.accent_color,
    description:c.components.filter(x=>x.type===10).map(x=>x.content).join('\n\n').slice(0,4096)
  }));
  return {username:payload.username,
    content:[main[0]?.content||'🔭 Bulletin astronomique',main.at(-1)?.content||''].join('\n\n').slice(0,2000),
    embeds,allowed_mentions:{parse:[]}};
}
export async function sendToDiscord(webhook,payload,fetcher=fetch){
  if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[^\s/?#]+$/.test(webhook))
    throw Error('Webhook Discord invalide. Configurer DISCORD_WEBHOOK_URL.');
  let body=payload;
  let fallbackAttempted=false;
  for(let attempt=0;attempt<4;attempt++){
    const url=new URL(webhook);
    if(body.flags===32768)url.searchParams.set('with_components','true');
    const response=await fetcher(url.toString(),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(20000)
    });
    if(response.ok)return true;
    if(response.status===400&&body.flags===32768&&!fallbackAttempted){
      fallbackAttempted=true;
      console.warn('Discord refuse le format graphique V2 (HTTP 400). Essai automatique en embeds classiques.');
      body=legacyFallback(payload);
      continue;
    }
    if(response.status===429&&attempt<3){
      const data=await response.json().catch(()=>({}));
      const seconds=Math.max(1,Number(data.retry_after)||1);
      await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*seconds)));
      continue;
    }
    // Ne pas afficher de réponse brute qui pourrait contenir des secrets.
    throw Error(`Discord a refusé le bulletin (HTTP ${response.status}).`);
  }
  throw Error('Publication Discord impossible après plusieurs tentatives.');
}
