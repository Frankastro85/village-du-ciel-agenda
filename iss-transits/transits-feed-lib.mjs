/** Village du Ciel — format facultatif des transits ISS, version 1.5.
 * Aucune modification du catalogue astronomique historique.
 */
export const FEED_VERSION = 1;
export const REFERENCE = Object.freeze({
  name:'Les Herbiers (85) · point de référence indicatif (mairie)',
  lat:46.86910, lon:-1.01350, heightM:0, radiusKm:30
});
export const APP_URL='https://allsky.villageduciel.fr/Agenda-Astro/Transit-ISS/';
const finite = v => typeof v==='number' && Number.isFinite(v);
const isISO=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s)&&Number.isFinite(Date.parse(s));
export function eventURL(event, reference=REFERENCE){
  const lat=Number(reference.lat),lon=Number(reference.lon);
  const alt=Number(reference.heightM??0),radius=Number(reference.radiusKm??30);
  const params=new URLSearchParams({lat:String(lat),lon:String(lon),alt:String(alt),rayon:String(radius),jours:'7',type:event.kind==='sun'?'sun':'moon'});
  return APP_URL+'?'+params.toString();
}
export function toFeed(events,{generatedAt=new Date().toISOString(),reference=REFERENCE,source='CelesTrak',periodDays=7}={}){
  if(!Array.isArray(events))throw Error('Résultats transits absents.');
  if(!isISO(generatedAt))throw Error('Horodatage génération incorrect.');
  const rows=events.filter(e=>['sun','moon'].includes(e?.kind)&&isISO(e?.timeUtc)&&e?.center&&finite(e.center.lat)&&finite(e.center.lon))
    .map(e=>({
      id:`iss-${e.kind}-${e.centerTimeUtc||e.timeUtc}`.replace(/[^a-z0-9-]/gi,'-'),
      kind:e.kind,timeUtc:e.timeUtc,centerTimeUtc:e.centerTimeUtc||e.timeUtc,
      siteVisible:Boolean(e.siteVisible),center:{lat:e.center.lat,lon:e.center.lon},
      centerDistanceKm:Number(e.centerDistanceKm||0),bandDistanceKm:Number(e.bandDistanceKm||0),
      widthKm:Number(e.halfWidthKm||0)*2,
      durationSec:Number(((e.siteTransit?.durationMs??e.durationMs)||0)/1000),
      altitudeDeg:Number(e.altitudeDeg||0),orbitEpoch:e.orbitEpoch||null,
      orbitAgeHours:Number(e.orbitAgeHours??999),
      confidence:Number(e.orbitAgeHours??999)<=24?'proche':Number(e.orbitAgeHours??999)<=72?'provisoire':'a-reverifier',
      status:'possible'
    }));
  const unique=new Map();for(const e of rows)unique.set(`${e.kind}:${e.centerTimeUtc}`,e);
  return {schemaVersion:FEED_VERSION,status:'ok',generatedAt,periodDays,source,
    reference:{...reference},events:[...unique.values()].sort((a,b)=>a.timeUtc.localeCompare(b.timeUtc))};
}
export function readUsableFeed(feed,now=new Date(),maxAgeHours=48){
  if(!feed||feed.schemaVersion!==FEED_VERSION||feed.status!=='ok'||!isISO(feed.generatedAt)||!Array.isArray(feed.events))return null;
  if(!feed.reference||!finite(feed.reference.lat)||!finite(feed.reference.lon)||!finite(feed.reference.radiusKm))return null;
  const age=(now.getTime()-Date.parse(feed.generatedAt))/3600000;
  if(!Number.isFinite(age)||age<-.25||age>maxAgeHours)return null;
  const last=now.getTime()+7*86400000;
  return {...feed,events:feed.events.filter(e=>e&&['sun','moon'].includes(e.kind)&&isISO(e.timeUtc)&&e.status==='possible'&&Date.parse(e.timeUtc)>=now.getTime()&&Date.parse(e.timeUtc)<=last && finite(e.bandDistanceKm) && finite(e.centerDistanceKm))};
}
