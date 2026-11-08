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
let weather=null;
try{
  const result=await fetch(meteo.forecastURL(),{signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('HTTP '+result.status);
  const json=await result.json();if(json.error)throw Error(json.reason||'API météo indisponible');
  weather=meteo.summarize(json,today,2);
  console.log(`Open-Meteo : météo sur ${weather.days.length} jours récupérée.`);
}catch(err){console.warn(`Météo indisponible : ${err.message}. Aucun chiffre météo inventé.`);}
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
