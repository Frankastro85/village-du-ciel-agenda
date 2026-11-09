#!/usr/bin/env node
/**
 * Candidats de comètes et occultations pour revue éditoriale.
 * Ne modifie JAMAIS docs/grands-evenements.json ni le site FTP.
 * Aucun texte provenant d'une source externe n'est publié comme événement vérifié.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SITES, plannerURL, parsePlanner, cometCandidates, parseOccultationYear, parseRSS, mergeCandidates} from './veille-rares-lib.mjs';
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(REPO,'docs','veille-evenements-rares.json');
const now = process.env.ASTRO_REFERENCE_DATE ? new Date(process.env.ASTRO_REFERENCE_DATE+'T12:00:00Z') : new Date();
if(!Number.isFinite(+now)) throw new Error('ASTRO_REFERENCE_DATE invalide');
const date=(offset=0)=>new Date(+now+offset*86400000).toISOString().slice(0,10);
const plusYear=()=>new Date(Date.UTC(now.getUTCFullYear()+1,now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
const status=[];
const diagnostics=[];
const errors=[];
const MAX_MS=16000;
async function get(url,type){
  const response=await fetch(url,{signal:AbortSignal.timeout(MAX_MS),headers:{'User-Agent':'VillageDuCiel-AstroAgenda/1.0 (community astronomy monitoring; no commercial crawling)','Accept':type==='json'?'application/json':'application/rss+xml, application/xml, text/html;q=0.8, */*;q=0.4'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const text=await response.text();
  if(text.length>4_000_000) throw new Error('Réponse trop volumineuse');
  return type==='json'?JSON.parse(text):text;
}

const candidates=[];
// Observations planifiées : 5 lieux x 2 dates, sans aucune conclusion définitive sur la géométrie.
for(const day of [date(0),date(14)]){
  const planners=new Map();let successes=0;
  const replies=await Promise.allSettled(SITES.map(async site=>({site, data:parsePlanner(await get(plannerURL(site,day),'json'))})));
  for(let i=0;i<replies.length;i++){
    const result=replies[i],site=SITES[i];
    if(result.status==='fulfilled'){
      planners.set(site.id,result.value.data);successes++;
    }else errors.push(`COBS ${day} ${site.name}: ${String(result.reason?.message||result.reason).slice(0,120)}`);
  }
  if(successes){status.push({source:'COBS',date:day,ok:true,sites:successes});candidates.push(...cometCandidates(planners,day));}
  else status.push({source:'COBS',date:day,ok:false,sites:0});
}

// Occultations : extraction des seules occurrences ayant des liens explicites.
// Certains hébergeurs bloquent la consultation automatisée : indisponibilité non bloquante.
for(const year of [...new Set([now.getUTCFullYear(),now.getUTCFullYear()+1])]){
  const u=`https://theskylive.com/lunar-occultations/${year}`;
  try{
    const html=await get(u,'html');
    const found=parseOccultationYear(html,date(0),plusYear());
    status.push({source:'TheSkyLive',year,ok:true,found:found.length});candidates.push(...found);
  }catch(e){status.push({source:'TheSkyLive',year,ok:false}); errors.push(`TheSkyLive ${year}: ${e.message}`);}
}

// Veille journalistique ciblée (NASA et Google News). Ce sont des signaux, pas des éphémérides.
const feeds=[
  {name:'NASA Science',url:'https://science.nasa.gov/feed/'},
  {name:'Google News — comètes',url:'https://news.google.com/rss/search?q='+encodeURIComponent('("bright comet" OR "comète brillante" OR "naked eye comet") when:14d')+'&hl=fr&gl=FR&ceid=FR:fr'},
  {name:'Google News — occultations',url:'https://news.google.com/rss/search?q='+encodeURIComponent('("lunar occultation" OR "occultation lunaire" OR "planetary occultation") when:14d')+'&hl=fr&gl=FR&ceid=FR:fr'}
];
const feedResponses=await Promise.allSettled(feeds.map(async feed=>({feed,items:parseRSS(await get(feed.url,'xml'),feed.name,now)})));
for(let i=0;i<feeds.length;i++){
  const r=feedResponses[i];
  if(r.status==='fulfilled'){
    status.push({source:r.value.feed.name,ok:true,found:r.value.items.length}); candidates.push(...r.value.items);
  }else{status.push({source:feeds[i].name,ok:false});errors.push(`${feeds[i].name}: ${String(r.reason?.message||r.reason).slice(0,120)}`);}
}

// Ne pas effacer les découvertes précédentes si toutes les sources sont hors ligne.
if(!status.some(s=>s.ok))throw new Error('Toutes les sources sont indisponibles : catalogue de veille conservé, pas de publication de données vides. '+errors.join(' | '));
let previous=[];
if(fs.existsSync(OUT)){
  try{const prev=JSON.parse(fs.readFileSync(OUT,'utf8'));if(prev.schema===1 && Array.isArray(prev.candidates))previous=prev.candidates;}
  catch(e){diagnostics.push('Ancien fichier JSON non exploitable : '+e.message);}
}
const current=mergeCandidates(previous,candidates,now);
const doc={schema:1,generatedAt:now.toISOString(),period:{start:date(),end:plusYear()},
  notice:'Veille de candidats à vérifier. Jamais automatiquement insérés dans le catalogue public ; l’invisibilité depuis la Vendée n’est PAS prouvée par une absence COBS.',
  sources:status,diagnostics:[...diagnostics,...errors].slice(0,35),
  counts:{candidateCount:current.length,newOrUpdated:candidates.length,sourceSuccess:status.filter(s=>s.ok).length,sourceFailed:status.filter(s=>!s.ok).length},
  candidates:current};
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(doc,null,2)+'\n','utf8');
console.log(`Veille : ${doc.counts.candidateCount} candidats, ${doc.counts.sourceSuccess} sources répondent, ${doc.counts.sourceFailed} sources indisponibles.`);
