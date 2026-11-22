/** Encadré ISS optionnel pour le bulletin Discord V3.1.
 * Ne calcule pas l'orbite au moment de l'envoi : lit le JSON frais généré à 04:15 UTC.
 * En cas de fichier absent/périmé ou de limite Discord, le bulletin continue normalement.
 */
import {readFile} from 'node:fs/promises';
const DAY=86400000;
const TZ='Europe/Paris';
const DAY_LABEL=new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,weekday:'short',day:'2-digit',month:'short'});
const HOUR=new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'});
const URL='https://allsky.villageduciel.fr/Transit-ISS/';
function textLength(items){let n=0;for(const it of items||[]){if(it.type===10)n+=it.content?.length||0;if(it.components)n+=textLength(it.components);}return n;}
export async function addTransitsToDiscord(payload,now=new Date(),path='docs/iss-transits.json'){
 try{
  const data=JSON.parse(await readFile(path,'utf8'));
  const age=now.getTime()-Date.parse(data.generatedAt);
  if(data.schemaVersion!==1||!Array.isArray(data.events)||age < -600000||age > 30*3600000){
   console.warn('ISS Discord : catalogue absent, incompatible ou daté de plus de 30 h. Rubrique omise.');return payload;
  }
  const radiusKm=Number(data.radiusKm);
  if(!Number.isFinite(radiusKm)||radiusKm<0||radiusKm>100){console.warn('ISS Discord : rayon invalide.');return payload;}
  const upcoming=data.events.filter(e=>{
   const t=Date.parse(e.timeUtc);
   return Number.isFinite(t)&&t>=now.getTime()&&t<=now.getTime()+3*DAY&&e.bandDistanceKm<=radiusKm;
  }).sort((a,b)=>a.timeUtc.localeCompare(b.timeUtc)).slice(0,3);
  const rows=upcoming.map(e=>{
   const date=new Date(e.timeUtc),label=e.kind==='sun'?'☀️ Solaire':'🌙 Lunaire';
   const where=e.siteVisible?'sur place':e.bandDistanceKm<=.01?'dans la bande estimée':`bande à ~${Math.round(e.bandDistanceKm)} km`;
   return `• **${label}** · ${DAY_LABEL.format(date)} ${HOUR.format(date)} · ${where} · durée au centre ${(Number(e.durationMs)/1000).toFixed(1)} s`;
  });
  const lines=rows.length?rows.join('\n'):`Aucun transit ISS détecté à moins de ${radiusKm} km de Réaumur dans les 3 prochains jours.`;
  const content=`🛰️ **TRANSITS ISS · RÉAUMUR (85) · ${radiusKm} KM**\n${lines}\n_Prévisions provisoires : revérifier 24 h avant, surtout après une manœuvre._\n🔎 [Recherche GPS et carte des bandes](${URL})`;
  if(payload.flags===32768&&Array.isArray(payload.components)){
   const addition={type:17,accent_color:0x7299d6,components:[{type:10,content}]};
   const present=textLength(payload.components);
   if(present+textLength([addition])>3900){console.warn('ISS Discord : manque de place Components V2, rubrique omise pour préserver le bulletin.');return payload;}
   payload.components.splice(Math.max(0,payload.components.length-1),0,addition);
   console.log(`ISS Discord : carte ajoutée, ${upcoming.length} transit(s) dans les 3 jours.`);
  }else if(Array.isArray(payload.embeds)&&payload.embeds.length<10){
   payload.embeds.push({color:0x7299d6,description:content.slice(0,4000)});
  }else{
   console.warn('ISS Discord : format de message inconnu, rubrique omise.');
  }
 }catch(e){console.warn(`ISS Discord : rubrique non chargée (${e.code||e.message}).`);}
 return payload;
}
