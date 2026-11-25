#!/usr/bin/env node
/** Extension optionnelle ; ne modifie que docs/transits-iss.json.
 * Pas de publication Discord ici. Échec réseau / TLE => aucun écrasement.
 */
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as satellite from 'satellite.js';
import * as Astronomy from 'astronomy-engine';
import {TransitEngine} from './transit-core.mjs';
import {getTLEWithFallback} from './orbit-fallback.mjs';
import {REFERENCE,toFeed} from './transits-feed-lib.mjs';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'docs','transits-iss.json');

function compareRows(a,b){return JSON.stringify({reference:a.reference,events:a.events,periodDays:a.periodDays,source:a.source})===JSON.stringify({reference:b.reference,events:b.events,periodDays:b.periodDays,source:b.source});}
async function main(){
 const now=new Date();
 const {tles,source}=await getTLEWithFallback();
 const engine=new TransitEngine(satellite,Astronomy,tles);
 const location={lat:REFERENCE.lat,lon:REFERENCE.lon,heightM:REFERENCE.heightM};
 const results=await engine.search({location,radiusKm:REFERENCE.radiusKm,days:7,kind:'both',startMs:now.getTime()},part=>{if(part===1)console.log('Recherche orbitale terminée.');});
 const feed=toFeed(results,{generatedAt:new Date().toISOString(),source,reference:REFERENCE});
 if(feed.events.some(e=>!Number.isFinite(Date.parse(e.timeUtc))))throw Error('Horaires invalides : publication annulée.');
 let old=null;try{old=JSON.parse(await readFile(output,'utf8'));}catch{}
 // Un catalogue inchangé est daté à nouveau pour conserver un état de fraîcheur.
 await mkdir(resolve(root,'docs'),{recursive:true});
 const temp=output+'.tmp-'+process.pid;
 try{
  await writeFile(temp,JSON.stringify(feed,null,2)+'\n','utf8');
  await rename(temp,output);
 }catch(err){await unlink(temp).catch(()=>{});throw err;}
 console.log(`Catalogue ISS: ${feed.events.length} événement(s), ${source}, ${REFERENCE.radiusKm} km autour des Herbiers.${old&&compareRows(old,feed)?' Prévisions inchangées.':''}`);
 console.log('Seul docs/transits-iss.json a été généré.');
}
await main().catch(err=>{console.error('Recherche ISS non publiée : '+err.message);process.exitCode=1;});
