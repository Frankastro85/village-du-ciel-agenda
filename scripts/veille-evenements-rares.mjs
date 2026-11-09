#!/usr/bin/env node
/**
 * Veille de candidats d'observation pour le club.
 * Uniquement : comètes de magnitude estimée < 10 et occultations majeures.
 * N'écrit JAMAIS dans le catalogue de voyages ni dans le FTP/Discord.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SITES,plannerURL,parsePlanner,cometCandidates,parseOccultationYear,mergeCandidates,eligible,publicComets} from './veille-rares-lib.mjs';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(REPO,'docs','veille-evenements-rares.json');
const COMETS_OUT=path.join(REPO,'docs','cometes-observables.json');
const now=process.env.ASTRO_REFERENCE_DATE?new Date(process.env.ASTRO_REFERENCE_DATE+'T12:00:00Z'):new Date();
if(!Number.isFinite(+now))throw new Error('ASTRO_REFERENCE_DATE invalide');
const day=(plus=0)=>new Date(+now+plus*86400000).toISOString().slice(0,10);
const end=new Date(Date.UTC(now.getUTCFullYear()+1,now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
const sources=[],diagnostics=[],found=[];
const localSamples=new Map();
const TIMEOUT=16000;
async function get(url,kind){
  const response=await fetch(url,{signal:AbortSignal.timeout(TIMEOUT),headers:{
    'User-Agent':'VillageDuCiel-AstroAgenda/1.1 (astronomy club event watch)',
    'Accept':kind==='json'?'application/json':'text/html, */*;q=0.4'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const body=await response.text();
  if(body.length>4_000_000)throw new Error('Réponse trop volumineuse');
  return kind==='json'?JSON.parse(body):body;
}

// COBS : on interroge la Vendée et plusieurs sites de référence, sans déduire une nécessité de voyage.
// Échantillons J, J+7 et J+14 pour détecter une comète devenant plus brillante.
for(const observationDay of [day(0),day(7),day(14),day(21)]){
  const planners=new Map();let ok=0;
  const replies=await Promise.allSettled(SITES.map(async site=>({site,comets:parsePlanner(await get(plannerURL(site,observationDay),'json'))})));
  for(let i=0;i<replies.length;i++){
    const r=replies[i];
    if(r.status==='fulfilled'){ok++;planners.set(r.value.site.id,r.value.comets);}
    else diagnostics.push(`COBS ${observationDay} ${SITES[i].name}: ${String(r.reason?.message||r.reason).slice(0,100)}`);
  }
  sources.push({source:'COBS',date:observationDay,ok:ok>0,sites:ok,threshold:'magnitude < 10'});
  if(planners.has('vendee'))localSamples.set(observationDay,planners.get('vendee'));
  if(ok)found.push(...cometCandidates(planners,observationDay));
}

// Événements mondiaux : seulement planètes brillantes / étoiles de magnitude <= 2.
for(const year of [...new Set([now.getUTCFullYear(),now.getUTCFullYear()+1])]){
  try{
    const html=await get(`https://theskylive.com/lunar-occultations/${year}`,'html');
    const candidates=parseOccultationYear(html,day(),end);
    sources.push({source:'TheSkyLive',year,ok:true,major:candidates.length});
    found.push(...candidates);
  }catch(e){sources.push({source:'TheSkyLive',year,ok:false});diagnostics.push(`TheSkyLive ${year}: ${e.message}`);}
}
if(!sources.some(s=>s.ok))throw new Error('Sources indisponibles : ancien rapport conservé. '+diagnostics.join(' | '));

let previous=[];
if(fs.existsSync(OUT)){
  try{const old=JSON.parse(fs.readFileSync(OUT,'utf8'));if(old.schema===1 && Array.isArray(old.candidates))previous=old.candidates;}
  catch(e){diagnostics.push('Ancien rapport invalide : '+e.message);}
}
// Écraser les résultats génériques historiques du précédent moteur : uniquement les candidats éligibles.
const priorIds=new Set(previous.filter(eligible).map(c=>c.id));
const fresh=new Map(found.filter(eligible).map(c=>[c.id,c]));
const newIds=[...fresh.keys()].filter(id=>!priorIds.has(id));
const current=mergeCandidates(previous,[...fresh.values()],now);
// Les candidats non revus lors de cette exécution restent en historique 14 jours, sans nouvelle alerte.
const doc={schema:1,generatedAt:now.toISOString(),period:{start:day(),end},
  rules:{comets:'magnitude estimée strictement inférieure à 10',
    occultations:'planètes brillantes et étoiles remarquables de magnitude <= 2',
    travelPanel:'éclipses uniquement'},
  notice:'Candidats de veille du club ; visibilité locale et éphémérides à vérifier avant annonce. Aucun ajout automatique au calendrier, panneau de voyages ou Discord.',
  sources,diagnostics:diagnostics.slice(0,40),
  counts:{candidateCount:current.length,detectedThisRun:fresh.size,newDetected:newIds.length,
    cometCount:current.filter(c=>c.type==='comete').length,majorOccultationCount:current.filter(c=>c.type==='occultation').length,
    sourceSuccess:sources.filter(s=>s.ok).length,sourceFailed:sources.filter(s=>!s.ok).length},
  newIds,candidates:current};
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(doc,null,2)+'\n','utf8');
console.log(`Veille du club : ${current.length} candidats éligibles (${doc.counts.cometCount} comètes m<10, ${doc.counts.majorOccultationCount} occultations majeures), ${newIds.length} nouveau(x).`);

// Publication du suivi des comètes dans un fichier DISTINCT du calendrier.
// Ne jamais utiliser un résultat d'une autre ville pour affirmer la visibilité en Vendée.
if(localSamples.size){
  const comets=publicComets(localSamples,now);
  const dates=[...localSamples.keys()].sort();
  const feed={schema:1,generatedAt:now.toISOString(),location:{name:'Les Herbiers (Vendée)',lat:46.87,lon:-1.01},
    rules:{magnitude:'strictement inférieure à 10',sunAltitude:'Soleil ≤ -18°',
      cometAltitude:'comète ≥ 20°',solarElongation:'≥ 30°',
      recentObservations:'filtre COBS = observations récentes (30 jours)',
      sourceMethods:'paramètres photométriques COBS basés sur observations récentes'},
    sampledDates:dates,sourceStatus:'COBS observatoire local',
    notice:'Dates échantillonnées : ce ne sont PAS les dates de début/fin de visibilité. Magnitudes prévisionnelles et météo non garanties.',
    comets};
  fs.mkdirSync(path.dirname(COMETS_OUT),{recursive:true});
  fs.writeFileSync(COMETS_OUT,JSON.stringify(feed,null,2)+'\n','utf8');
  console.log(`Rubrique comètes : ${comets.length} cible(s) locales m < 10 sur ${dates.length} nuits échantillonnées.`);
}else{
  console.warn('Aucune réponse COBS pour Les Herbiers : ancien catalogue cométaire conservé, pas de nouvelle publication.');
}
