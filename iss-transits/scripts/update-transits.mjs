#!/usr/bin/env node
/** Mise à jour indépendante des transits ISS de Réaumur et des TLE utilisables sur la page. */
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import * as satelliteModule from 'satellite.js';
import * as astronomyModule from 'astronomy-engine';
const satellite=satelliteModule.twoline2satrec?satelliteModule:satelliteModule.default;
const Astronomy=astronomyModule.GeoVector?astronomyModule:astronomyModule.default;
import {TransitEngine,REAUMUR,ORBIT_SOURCE,SUP_ORBIT_SOURCE,parseTleText} from '../transit-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const docs=resolve(root,'docs');
const now=Date.now();
const maxDays=Number(process.env.ISS_DAYS||5),radiusKm=Number(process.env.ISS_RADIUS_KM||30);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function download(url){
 let last;
 for(let i=0;i<3;i++){
  try{
   const r=await fetch(url,{headers:{'Accept':'text/plain','User-Agent':'VillageDuCiel-ISS-Transits/1.0 (research forecast)'},signal:AbortSignal.timeout(18000)});
   if(!r.ok)throw Error('HTTP '+r.status);
   const text=await r.text();
   if(text.length<100||text.length>500000)throw Error('Réponse TLE de taille incorrecte');
   return text;
  }catch(e){last=e;if(i<2)await sleep(1500*(i+1));}
 }
 throw last;
}
async function getElements(){
 for(const [source,url] of [['CelesTrak SupGP ISS',SUP_ORBIT_SOURCE],['CelesTrak GP ISS',ORBIT_SOURCE]]){
  try{
   const tles=parseTleText(await download(url),source);
   const closest=Math.min(...tles.map(x=>Math.abs(now-Date.parse(x.epoch))/3600000));
   if(closest>72)throw Error(`Époque orbitale trop éloignée : ${Math.round(closest)} h`);
   console.log(`${source} : ${tles.length} TLE, plus proche de maintenant ${Math.round(closest)} h.`);
   return {tles,source,url};
  }catch(e){console.warn(`Source ${source} indisponible : ${e.message}`);}
 }
 // Dernier secours, différent du fournisseur principal ; sert à produire un bulletin utile.
 const alt='https://api.wheretheiss.at/v1/satellites/25544/tles';
 try{
  const raw=JSON.parse(await download(alt));
  const tles=parseTleText(`${raw.line1}\n${raw.line2}`,'WhereTheISS.at');
  if(Math.min(...tles.map(x=>Math.abs(now-Date.parse(x.epoch))/3600000))>72)throw Error('TLE alternative périmée');
  return {tles,source:'WhereTheISS.at',url:alt};
 }catch(e){throw Error(`Aucune source orbitale ISS fraîche disponible : ${e.message}`);}
}
const result=await getElements();
const orbital={schemaVersion:1,generatedAt:new Date(now).toISOString(),source:result.source,url:result.url,tles:result.tles,
 disclaimer:'Positions prévisionnelles, sujettes aux manœuvres de l’ISS et à l’évolution des éléments orbitaux.'};
const engine=new TransitEngine(satellite,Astronomy,result.tles);
console.log(`Calcul Réaumur, ${radiusKm} km, ${maxDays} jours…`);
const events=await engine.search({location:REAUMUR,radiusKm,days:maxDays,startMs:now},p=>{if(p===1)console.log('Balayage orbital terminé.');});
const report={schemaVersion:1,generatedAt:new Date(now).toISOString(),source:result.source,
 location:{...REAUMUR},radiusKm,days:maxDays,events,
 disclaimers:[
  'Les horaires et bandes géographiques sont prévisionnels et doivent être confirmés 24 h avant.',
  'Éléments SGP4 non assimilés aux éphémérides opérationnelles en temps réel ; déplacements possibles après manœuvre.',
  'Durées estimées sur la ligne centrale, et non nécessairement à la position GPS initiale.',
  'Soleil : observation uniquement avec filtre solaire certifié adapté.'
 ]};
await mkdir(docs,{recursive:true});
await writeFile(resolve(docs,'iss-orbit.json'),JSON.stringify(orbital,null,2)+'\n');
await writeFile(resolve(docs,'iss-transits.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Prévisions ISS terminées : ${events.length} transit(s) à moins de ${radiusKm} km de Réaumur.`);
for(const e of events)console.log(`${e.kind} ${e.timeUtc} • distance bande ${e.bandDistanceKm} km • ${e.quality} • durée centre ${(e.durationMs/1000).toFixed(2)} s`);
