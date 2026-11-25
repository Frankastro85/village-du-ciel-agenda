/**
 * Sources orbitales ISS, avec replis sûrs en cas d'indisponibilité CelesTrak.
 * Ne jamais refaire une requête CelesTrak après un HTTP non-200 :
 * https://celestrak.org/usage-policy.php
 * Toute source est contrôlée par l'époque du TLE et par l'identifiant 25544.
 */
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {normalizeTles,parseTleText,ORBIT_SOURCE,SUP_ORBIT_SOURCE} from './transit-core.mjs';

const CACHE_PATH=fileURLToPath(new URL('../docs/iss-orbit.json',import.meta.url));
const ALTERNATIVE_URL='https://api.wheretheiss.at/v1/satellites/25544/tles';
const MAX_AGE_HOURS=48;
const REUSE_CACHE_HOURS=2; // Évite deux requêtes CelesTrak à 25 min d'intervalle.

function checkFresh(tles,source,nowMs){
  const normalized=normalizeTles(tles);
  const recent=normalized.at(-1);
  const ageHours=(nowMs-Date.parse(recent.epoch))/3600000;
  if(!Number.isFinite(ageHours)||ageHours>MAX_AGE_HOURS||ageHours< -1){
    throw Error(`TLE ISS trop ancien ou futur (${ageHours.toFixed(1)} h)`);
  }
  return {tles:normalized,source};
}

async function getResponse(fetcher,url){
  // redirect:manual permet de détecter un endpoint déplacé, sans le suivre
  // silencieusement et potentiellement enfreindre la politique CelesTrak.
  return fetcher(url,{
    headers:{Accept:'text/plain, application/json', 'User-Agent':'VillageDuCiel-ISS-Transits/1.5.6'},
    redirect:'manual',signal:AbortSignal.timeout(18000)
  });
}

/**
 * Recherche des TLE. L'ordre est : CelesTrak, cache du workflow de Réaumur,
 * fournisseur indépendant WhereTheISS. Pas de publication si données périmées.
 * Les paramètres d'injection ne servent qu'aux tests, sans réseau réel.
 */
export async function getTLEWithFallback({
  fetcher=fetch,reader=readFile,nowMs=Date.now(),cachePath=CACHE_PATH
}={}){
  const errors=[];
  let cached=null;
  try{
    const raw=JSON.parse(await reader(cachePath,'utf8'));
    if(raw?.schemaVersion!==1||!Array.isArray(raw?.tles)){
      throw Error('Format du cache orbital non reconnu');
    }
    cached=checkFresh(raw.tles,`Cache orbital ISS (${String(raw.source||'Réaumur')})`,nowMs);
    const cacheAgeHours=(nowMs-Date.parse(raw.generatedAt))/3600000;
    if(cacheAgeHours>=0&&cacheAgeHours<REUSE_CACHE_HOURS){
      console.log('Cache orbital ISS mis à jour récemment : aucune nouvelle requête CelesTrak nécessaire.');
      return cached;
    }
  }catch(error){
    errors.push(`Cache orbital : ${error.message}`);
  }
  for(const [name,url] of [['CelesTrak',ORBIT_SOURCE],['CelesTrak supplemental',SUP_ORBIT_SOURCE]]){
    let response;
    try{
      response=await getResponse(fetcher,url);
    }catch(error){
      errors.push(`${name} : ${error.message}`);
      // Une panne réseau peut concerner l'hébergeur entier ; éviter une autre requête.
      break;
    }
    if(!response.ok){
      errors.push(`${name} : HTTP ${response.status}`);
      // CelesTrak demande l'arrêt immédiat après toute réponse non-200.
      break;
    }
    try{
      const text=await response.text();
      return checkFresh(parseTleText(text,name),name,nowMs);
    }catch(error){
      errors.push(`${name} : ${error.message}`);
      // Réponse HTTP 200 mais données non exploitables : tester le SupGP.
    }
  }

  // Cache d'un précédent calcul Réaumur : réutilisation uniquement si le
  // TLE lui-même reste dans la limite de fraîcheur de 48 heures.
  if(cached){
    console.log('CelesTrak indisponible : utilisation du cache orbital ISS encore valide.');
    return cached;
  }

  // Fournisseur de secours pour des éléments TLE récents.
  try{
    const response=await getResponse(fetcher,ALTERNATIVE_URL);
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const raw=await response.json();
    if(typeof raw?.line1!=='string'||typeof raw?.line2!=='string'){
      throw Error('Réponse TLE alternative incomplète');
    }
    const alternative=checkFresh(parseTleText(`${raw.line1}\n${raw.line2}`,'WhereTheISS.at'),'WhereTheISS.at',nowMs);
    console.log('CelesTrak indisponible : utilisation de WhereTheISS.at (éléments vérifiés).');
    return alternative;
  }catch(error){
    errors.push(`WhereTheISS.at : ${error.message}`);
  }
  throw Error('Aucune donnée orbitale ISS récente : '+errors.join('; ')+'. JSON précédent conservé.');
}
