#!/usr/bin/env node
/** Bulletin quotidien Discord ; pour l'exécuter :
 *   npm run discord:preview  (sans envoi)
 *   npm run discord:send     (avec secret DISCORD_WEBHOOK_URL)
 * Ne jamais inscrire le webhook dans le dépôt ni sur AllSky.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parisDay} from './catalogue-lib.mjs';
import {collectEvents,makeMessage,sendToDiscord,generatedIsUsable} from './discord-message-lib.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const meteo=require('./meteo-astro.cjs');
const arg=process.argv.slice(2);
const sending=arg.includes('--send');
const forced=arg.includes('--force');
if(!sending&&!arg.includes('--dry-run'))throw Error('Utiliser --dry-run ou --send.');
const now=new Date();const today=parisDay(now);
async function readJSON(filename){try{return JSON.parse(await readFile(filename,'utf8'));}catch{return null;}}
async function fetchEditorial(){
  try{
    const res=await fetch('https://allsky.villageduciel.fr/Agenda-Astro/evenements.json',{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
    if(!res.ok)throw Error(`HTTP ${res.status}`);
    const data=await res.json();if(!Array.isArray(data.events)||data.events.length===0)throw Error('Catalogue FTP vide');
    console.log(`Catalogue éditorial récupéré depuis AllSky (${data.events.length} événements).`);
    return data.events;
  }catch{
    const local=await readJSON('data/evenements.json');
    console.log('Catalogue FTP indisponible : utilisation de la copie de secours dans le dépôt GitHub.');
    return Array.isArray(local?.events)?local.events:[];
  }
}
const last=await readJSON('data/discord-last-send.json');
if(sending&&last?.date===today&&!forced){
  console.log(`Bulletin Discord déjà envoyé le ${today}. Aucune seconde publication.`);
  process.exit(0);
}
const local=await fetchEditorial();
const computed=await readJSON('docs/catalogue.json');
const usable=generatedIsUsable(computed,now);
if(!usable)console.warn('ATTENTION : catalogue calculé absent ou périmé ; utiliser seulement les fiches éditoriales.');
const events=collectEvents(local,usable?computed.events:[]);
if(events.length===0)throw Error('Aucun événement valide, envoi annulé pour éviter un bulletin trompeur.');
// Plusieurs tentatives et requête météo allégée pour les indisponibilités
// ponctuelles. Les données ne sont jamais inventées ou extrapolées.
async function loadWeather(){
  const sources=[
    {label:'Open-Meteo standard',url:meteo.forecastURL()},
    {label:'Open-Meteo allégée',url:meteo.forecastURL({compact:true})},
    {label:'Open-Meteo / Météo-France',url:meteo.forecastURL({compact:true,endpoint:'meteofrance'})}
  ];
  const errors=[];
  let bestPartial=null,bestNightCount=0;
  for(const source of sources){
    // Une indisponibilité HTTP 429/5xx et une erreur réseau justifient
    // un second essai; les erreurs 400 de paramètres passent au repli.
    for(let attempt=1;attempt<=2;attempt++){
      try{
        const response=await fetch(source.url,{signal:AbortSignal.timeout(16000),headers:{Accept:'application/json'}});
        if(!response.ok){
          let reason='';
          try{reason=String((await response.json())?.reason||'').slice(0,110);}catch{}
          const err=new Error(`HTTP ${response.status}${reason?' — '+reason:''}`);
          err.retryable=response.status===429||response.status>=500;
          throw err;
        }
        const raw=await response.json();
        if(raw?.error)throw Error(String(raw.reason||'API météo indisponible').slice(0,160));
        const summary=meteo.summarize(raw,today,3);
        const nights=summary.days.filter(day=>['soiree','nuit'].every(key=>day.periods.find(p=>p.key===key)?.available)).length;
        const available=summary.days.filter(day=>day.periods.some(p=>p.available)).length;
        if(!available)throw Error('Aucune plage horaire exploitable pour les 3 jours');
        console.log(`Météo : ${source.label}, ${nights}/3 nuits complètes et ${available}/3 jours disponibles.`);
        if(nights>bestNightCount){bestPartial=summary;bestNightCount=nights;}
        if(nights===3)return summary;
        if(nights===0 && !bestPartial)bestPartial=summary;
        // Une seconde source peut améliorer une prévision partielle.
        break;
      }catch(err){
        errors.push(`${source.label} essai ${attempt}: ${err.message}`);
        if(err.retryable===false)break;
        if(attempt===1)await new Promise(resolve=>setTimeout(resolve,1200));
      }
    }
  }
  if(bestPartial){
    console.warn(`Météo partielle : ${bestNightCount}/3 nuits exploitables après repli.`);
    return bestPartial;
  }
  console.warn('ATTENTION : météo indisponible après les essais suivants :\n'+errors.join('\n'));
  return null;
}
const weather=await loadWeather();
const payload=makeMessage(events,now,weather);
console.log(`Bulletin préparé (${today}, ${events.length} événements en catalogue).`);
// Message de prévisualisation sans secret, utile avant activation.
if(!sending){console.log(JSON.stringify(payload,null,2));process.exit(0);}
const webhook=process.env.DISCORD_WEBHOOK_URL||'';
if(!webhook)throw Error('Secret DISCORD_WEBHOOK_URL absent : aucun message envoyé.');
await sendToDiscord(webhook,payload);
// Si l'écriture d'état échoue, le message Discord est déjà parti ;
// la seconde exécution pourrait alors réémettre le même bulletin.
await mkdir('data',{recursive:true});
await writeFile('data/discord-last-send.json',JSON.stringify({date:today,sentAt:new Date().toISOString()},null,2)+'\n');
console.log('Publication Discord acceptée. Date enregistrée pour éviter les doublons.');
