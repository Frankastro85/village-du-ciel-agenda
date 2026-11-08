/** Visibilité géométrique locale d'un événement identifié — Les Herbiers (85).
 * Requiert Astronomy Engine, déjà utilisé par le générateur principal.
 * Les prévisions ne représentent ni turbulence, ni extinction, ni obstacles d'horizon.
 * Ne jamais qualifier l'heure du minimum géocentrique de meilleure heure locale.
 */
const LAT=46.87,LON=-1.01,HEIGHT=110;
const localDay=t=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t);const get=k=>p.find(x=>x.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;};
const BODIES=[['Mercure','Mercury'],['Vénus','Venus'],['Mars','Mars'],['Jupiter','Jupiter'],['Saturne','Saturn'],['Uranus','Uranus'],['Neptune','Neptune'],['Lune','Moon']];
function namesFor(event){
  if(event.type==='planete'||event.type==='conjonction')return BODIES.filter(([name])=>new RegExp(`(^|[^\\p{L}])${name}([^\\p{L}]|$)`,'iu').test(event.title||''));
  if(event.type==='eclipse')return /solaire/i.test(event.title)?[['Soleil','Sun']]:[['Lune','Moon']];
  return [];
}
function skyPosition(A,observer,body,time){
  const eq=A.Equator(A.Body[body],time,observer,true,true);
  const pos=A.Horizon(time,observer,eq.ra,eq.dec,'normal');
  if(!Number.isFinite(pos.altitude)||!Number.isFinite(pos.azimuth))throw Error('Position non calculable');
  return {altitude:Math.round(pos.altitude*10)/10,azimuth:Math.round(pos.azimuth*10)/10};
}
export function describeEventObservation(A,event){
  if(!event?.utc)return null;
  const time=new Date(event.utc);
  if(!Number.isFinite(time.getTime()))return null;
  const objects=namesFor(event);
  if(!objects.length)return null;
  try{
    const observer=new A.Observer(LAT,LON,HEIGHT);
    const atInstant=objects.map(([label,key])=>({label,...skyPosition(A,observer,key,time)}));
    const daylightAtInstant=skyPosition(A,observer,'Sun',time).altitude>-0.833;
    let best=null;
    if(event.type!=='eclipse'){
      // Échantillonner le soir de l'événement jusqu'au matin suivant, toutes les 30 min.
      const start=Date.parse(event.date+'T15:00:00Z');
      for(let i=0;i<=34;i++){
        const t=new Date(start+i*30*60000);
        if(skyPosition(A,observer,'Sun',t).altitude>-12)continue;
        const altitudes=objects.map(([,key])=>skyPosition(A,observer,key,t).altitude);
        const minAlt=Math.min(...altitudes);
        if(minAlt<10)continue;
        if(!best||minAlt>best.minAlt)best={time:t,minAlt};
      }
    }
    return {atInstant,daylightAtInstant,bestNightUTC:best?.time.toISOString()||null,bestNightMinAlt:best?Math.round(best.minAlt*10)/10:null,
      bestNightNextDay:best?localDay(best.time)>event.date:false,
      note:'Calcul géométrique à 46,87°N / 1,01°O. Le meilleur créneau maximise la hauteur minimale des objets (Soleil < −12°, objets > 10°), hors horizon réel, Lune, météo et turbulence.'};
  }catch{return null;}
}
