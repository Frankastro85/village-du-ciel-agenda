/** Complément facultatif du bulletin Discord du Village du Ciel.
 * Ajoute AU PLUS un troisième embed ; les deux existants restent strictement inchangés.
 * Si JSON absent, vide, vieux ou désactivé, renvoie exactement le payload reçu.
 */
import {readFile} from 'node:fs/promises';
import {readUsableFeed,eventURL} from '../iss-transits/transits-feed-lib.mjs';
const formatDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
const formatHour=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const oneDecimal=n=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n);
export function withTransits(payload,now,rawFeed){
 const feed=readUsableFeed(rawFeed,now);
 if(!feed||!feed.events.length||!payload||!Array.isArray(payload.embeds)||payload.embeds.length>=10)return payload;
 const fields=feed.events.slice(0,4).map(e=>{
   const time=new Date(e.timeUtc),solar=e.kind==='sun';
   const kind=solar?'☀️ Soleil':'🌙 Lune';
   const where=e.siteVisible?'Depuis le point de référence':`Bande estimée à ${oneDecimal(e.bandDistanceKm)} km du point de référence (à vol d’oiseau)`;
   return {name:`${kind} · ${formatDay.format(time)}`,
     value:`Vers **${formatHour.format(time)}** (heure française) · ${where}. **À revérifier** (TLE daté de ${e.orbitAgeHours} h avant l'événement).\n[Préparer l’observation et voir les couloirs](${eventURL(e,feed.reference)})`,inline:false};
 });
 return {...payload,embeds:[...payload.embeds,{
   title:'🛰️ Transits possibles de l’ISS · 7 prochains jours',
   url:'https://allsky.villageduciel.fr/Agenda-Astro/Transit-ISS/',
   description:`Recherche indicative dans un rayon de ${feed.reference.radiusKm} km autour des Herbiers. Ce n’est pas un passage ISS visible ordinaire. Prévisions sujettes à fortes variations après manœuvre ; recontrôler dans les 24 h avant l’observation. Pour le Soleil, utiliser exclusivement un filtre solaire certifié.`,
   color:0x6baed6,fields,footer:{text:'Complément facultatif · TLE CelesTrak · prévisions non garanties'}
 }]};
}
export async function addTransitsToBulletin(payload,now=new Date(),options={}){
 if(process.env.VDC_TRANSITS_DISCORD==='0')return payload;
 try{
  const contents=await readFile(options.path||'docs/transits-iss.json','utf8');
  return withTransits(payload,now,JSON.parse(contents));
 }catch(err){
  console.warn(`Extension transits ISS ignorée (catalogue absent/invalide) : ${err.message}`);
  return payload;
 }
}
