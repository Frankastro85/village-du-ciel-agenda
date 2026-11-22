
/** Module optionnel de transits ISS pour le bulletin Village du Ciel.
 * Compatible avec Discord Components V2 (flags:32768) et anciens embeds.
 * Les rubriques déjà présentes restent intactes. Aucun envoi Discord ici.
 */
import {readFile} from 'node:fs/promises';
import {readUsableFeed,eventURL} from '../iss-transits/transits-feed-lib.mjs';

const formatDay=new Intl.DateTimeFormat('fr-FR',{
  timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'
});
const formatHour=new Intl.DateTimeFormat('fr-FR',{
  timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'
});
const oneDecimal=n=>new Intl.NumberFormat('fr-FR',{
  maximumFractionDigits:1
}).format(n);
const heading='TRANSITS ISS POSSIBLES';
const appUrl='https://allsky.villageduciel.fr/Agenda-Astro/Transit-ISS/';

function transitLine(e,reference){
  const instant=new Date(e.timeUtc);
  const kind=e.kind==='sun'?'☀️ Solaire':'🌙 Lunaire';
  const where=e.siteVisible
    ?'visible depuis le point de référence (sous réserve de confirmation)'
    :e.bandDistanceKm===0
      ?'dans le couloir estimé autour du point de référence'
      :`bande à environ ${oneDecimal(e.bandDistanceKm)} km du point de référence`;
  const age=Number.isFinite(e.orbitAgeHours)
    ?` · TLE âgé de ${oneDecimal(e.orbitAgeHours)} h à la date du transit`
    :'';
  return `**${kind} · ${formatDay.format(instant)} à ${formatHour.format(instant)}**\n`+
    `${where}${age}. À revérifier avant déplacement.\n`+
    `[Carte et préparation](${eventURL(e,reference)})`;
}

export function withTransits(payload,now,rawFeed){
  const feed=readUsableFeed(rawFeed,now);
  if(!feed?.events?.length||!payload||typeof payload!=='object')return payload;
  const events=feed.events.slice(0,4);
  const intro=`Recherche dans un rayon de ${oneDecimal(feed.reference.radiusKm)} km autour des Herbiers. `+
    'Les heures et couloirs sont indicatifs et peuvent changer après une manœuvre de l’ISS.';
  const safety='Observation solaire exclusivement avec un filtre solaire certifié.';

  // Discord Components V2 : ne jamais ajouter d'embeds au payload.
  if(Array.isArray(payload.components) && (payload.flags & 32768)===32768){
    const existing=payload.components.some(c=>
      c?.type===17 && c.components?.some(t=>
        t?.type===10 && String(t.content||'').includes(heading)
      )
    );
    if(existing)return payload;
    const content=`🛰️ **${heading} · 7 PROCHAINS JOURS**\n${intro}\n\n`+
      events.map(e=>transitLine(e,feed.reference)).join('\n\n')+`\n\n_${safety}_`;
    if(content.length>4000||payload.components.length>=39)return payload;
    const section={type:17,accent_color:0x6baed6,components:[{type:10,content}]};
    const components=[...payload.components];

    // Conserver le lien général et les crédits en dernière position.
    const footerIndex=components.findLastIndex(c=>c?.type===10);
    components.splice(footerIndex>=0?footerIndex:components.length,0,section);
    return {...payload,components};
  }

  // Ancien format Discord : conserver les embeds existants à l'identique.
  if(Array.isArray(payload.embeds) && payload.embeds.length<10){
    if(payload.embeds.some(e=>e?.title?.includes('Transits possibles de l’ISS')))return payload;
    const fields=events.map(e=>({
      name:`${e.kind==='sun'?'☀️ Soleil':'🌙 Lune'} · ${formatDay.format(new Date(e.timeUtc))}`,
      value:transitLine(e,feed.reference),inline:false
    }));
    return {...payload,embeds:[...payload.embeds,{
      title:'🛰️ Transits possibles de l’ISS · 7 prochains jours',
      url:appUrl,description:`${intro} ${safety}`,
      color:0x6baed6,fields,
      footer:{text:'Complément facultatif · TLE CelesTrak · prévisions non garanties'}
    }]};
  }
  return payload;
}

export async function addTransitsToBulletin(payload,now=new Date(),options={}){
  if(process.env.VDC_TRANSITS_DISCORD==='0')return payload;
  try{
    const raw=JSON.parse(await readFile(options.path||'docs/transits-iss.json','utf8'));
    return withTransits(payload,now,raw);
  }catch(error){
    console.warn(`Extension transits ISS ignorée (catalogue indisponible) : ${error.message}`);
    return payload;
  }
}
