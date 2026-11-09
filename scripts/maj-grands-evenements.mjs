#!/usr/bin/env node
/**
 * Catalogue « Astro ailleurs » du Village du Ciel.
 * - Éclipses solaires : calcul topocentrique des phases totales/annulaires par ville.
 * - Éclipses lunaires totales : contrôle de la hauteur de la Lune et de la visibilité en Vendée.
 * - Événements particuliers : fiches éditoriales validées (occultations, comètes, etc.).
 * - Aucune publication automatisée d'événements non géographiquement vérifiés.
 *
 * L'échantillonnage de villes peut omettre des bandes étroites : ce n'est pas
 * un moteur d'exhaustivité mondiale. Ne pas ajouter une ville d'après sa seule
 * latitude/longitude si l'éclipse y est partielle : les circonstances sont calculées.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as AstronomyPackage from 'astronomy-engine';
const Astronomy=AstronomyPackage.SearchGlobalSolarEclipse ? AstronomyPackage : AstronomyPackage.default;
if(!Astronomy?.SearchGlobalSolarEclipse) throw new Error('Le moteur astronomy-engine ne charge pas correctement');

const HERE=path.dirname(fileURLToPath(import.meta.url));
const REPO=path.resolve(HERE,'..');
const SRC=path.join(REPO,'data','grands-evenements-editoriaux.json');
const OUTPUT=path.join(REPO,'docs','grands-evenements.json');
const START=process.env.ASTRO_REFERENCE_DATE ? new Date(`${process.env.ASTRO_REFERENCE_DATE}T00:00:00Z`) : new Date();
if(!Number.isFinite(START.getTime())) throw new Error('Date de référence invalide');
const END=new Date(START);
END.setUTCMonth(END.getUTCMonth()+15);
const CUT=(d)=>new Date(d).toISOString().slice(0,10);
const IS_IN=(d)=> d >= START && d <= END;
const VENDEE={name:'Les Herbiers',country:'France',lat:46.87,lon:-1.01};

// Villes échantillonnées pour identifier des sites facilement localisables.
// Cela n'est pas une carte géographique continue : ne pas promettre l'exhaustivité.
const SITES=[
 ['Cadix','Espagne',36.53,-6.29],['Tarifa','Espagne',36.01,-5.61],['Algésiras','Espagne',36.13,-5.45],
 ['Gibraltar','Gibraltar',36.14,-5.35],['Ceuta','Espagne',35.89,-5.32],['Séville','Espagne',37.39,-5.98],
 ['Málaga','Espagne',36.72,-4.42],['Grenade','Espagne',37.18,-3.6],['Cordoue','Espagne',37.89,-4.78],
 ['Huelva','Espagne',37.26,-6.94],['Almería','Espagne',36.84,-2.46],['Madrid','Espagne',40.42,-3.7],
 ['Valence','Espagne',39.47,-0.38],['Murcie','Espagne',37.99,-1.13],['Alicante','Espagne',38.35,-0.49],
 ['Barcelone','Espagne',41.39,2.17],['Saragosse','Espagne',41.65,-0.88],['Badajoz','Espagne',38.88,-6.97],
 ['Salamanque','Espagne',40.97,-5.66],['Bilbao','Espagne',43.26,-2.93],['Saint-Jacques-de-Compostelle','Espagne',42.88,-8.55],
 ['Faro','Portugal',37.02,-7.93],['Lisbonne','Portugal',38.72,-9.14],['Porto','Portugal',41.16,-8.62],
 ['Paris','France',48.86,2.35],['Marseille','France',43.3,5.37],['Bordeaux','France',44.84,-0.58],
 ['Lyon','France',45.76,4.84],['Toulouse','France',43.6,1.44],['Nice','France',43.7,7.26],
 ['Ajaccio','France',41.92,8.74],['Montpellier','France',43.61,3.87],['Brest','France',48.39,-4.49],
 ['Rome','Italie',41.9,12.5],['Naples','Italie',40.85,14.27],['Palerme','Italie',38.12,13.36],
 ['Catane','Italie',37.51,15.08],['Bari','Italie',41.12,16.87],['Brindisi','Italie',40.64,17.94],
 ['Florence','Italie',43.77,11.26],['Milan','Italie',45.46,9.19],['Cagliari','Italie',39.22,9.12],
 ['La Valette','Malte',35.90,14.51],['Athènes','Grèce',37.98,23.73],['Patras','Grèce',38.25,21.74],
 ['Thessalonique','Grèce',40.64,22.94],['Héraklion','Grèce',35.34,25.14],['Rhodes','Grèce',36.43,28.22],
 ['Chania','Grèce',35.51,24.02],['Istanbul','Turquie',41.01,28.98],['Izmir','Turquie',38.42,27.14],
 ['Antalya','Turquie',36.9,30.7],['Ankara','Turquie',39.93,32.86],['Mersin','Turquie',36.8,34.63],
 ['Bodrum','Turquie',37.03,27.43],['Nicosie','Chypre',35.17,33.36],['Limassol','Chypre',34.68,33.04],
 ['Tirana','Albanie',41.33,19.82],['Dubrovnik','Croatie',42.65,18.09],['Split','Croatie',43.51,16.44],
 ['Ljubljana','Slovénie',46.05,14.51],['Vienne','Autriche',48.21,16.37],['Budapest','Hongrie',47.5,19.04],
 ['Bucarest','Roumanie',44.43,26.1],['Sofia','Bulgarie',42.7,23.32],['Belgrade','Serbie',44.81,20.46],
 ['Berlin','Allemagne',52.52,13.4],['Zurich','Suisse',47.38,8.54],['Londres','Royaume-Uni',51.5,-0.13],
 ['Dublin','Irlande',53.35,-6.26],['Bruxelles','Belgique',50.85,4.35],['Amsterdam','Pays-Bas',52.37,4.9],
 ['Reykjavík','Islande',64.15,-21.95],['Akureyri','Islande',65.68,-18.09],
 ['Tanger','Maroc',35.76,-5.83],['Tétouan','Maroc',35.57,-5.37],['Rabat','Maroc',34.02,-6.84],
 ['Casablanca','Maroc',33.59,-7.62],['Fès','Maroc',34.07,-5.0],['Marrakech','Maroc',31.63,-8.01],
 ['Agadir','Maroc',30.42,-9.6],['Oujda','Maroc',34.68,-1.91],
 ['Alger','Algérie',36.75,3.06],['Oran','Algérie',35.70,-0.64],['Constantine','Algérie',36.36,6.61],
 ['Annaba','Algérie',36.9,7.77],['Batna','Algérie',35.55,6.17],['Biskra','Algérie',34.85,5.73],
 ['Tamanrasset','Algérie',22.79,5.53],['Ghardaïa','Algérie',32.49,3.67],
 ['Tunis','Tunisie',36.81,10.18],['Sousse','Tunisie',35.83,10.64],['Sfax','Tunisie',34.74,10.76],
 ['Gabès','Tunisie',33.88,10.1],['Djerba','Tunisie',33.81,10.85],['Tozeur','Tunisie',33.92,8.13],
 ['Tripoli','Libye',32.89,13.19],['Misrata','Libye',32.38,15.09],['Benghazi','Libye',32.12,20.07],
 ['Alexandrie','Égypte',31.2,29.91],['Le Caire','Égypte',30.04,31.24],['Louxor','Égypte',25.7,32.64],
 ['Assouan','Égypte',24.09,32.9],['Hurghada','Égypte',27.26,33.81],['Suez','Égypte',29.97,32.55],
 ['Djeddah','Arabie saoudite',21.49,39.19],['Medine','Arabie saoudite',24.47,39.61],
 ['Riyad','Arabie saoudite',24.71,46.67],['Amman','Jordanie',31.96,35.94],
 ['Accra','Ghana',5.6,-0.19],['Cape Coast','Ghana',5.11,-1.25],['Lomé','Togo',6.14,1.21],
 ['Cotonou','Bénin',6.37,2.43],['Abidjan','Côte d’Ivoire',5.36,-4.01],['Lagos','Nigeria',6.52,3.38]
].map(([name,country,lat,lon])=>({name,country,lat,lon}));

function observer(p){return new Astronomy.Observer(p.lat,p.lon,0);}
function utcDate(e){
  const t = e?.peak?.time?.date ?? e?.peak?.date ?? null;
  if (!(t instanceof Date) || !Number.isFinite(t.getTime())) throw new Error('Pic d’éclipse non calculable');
  return t;
}
function nearestLocalSolar(begin,site,target){
  // La première éclipse locale après T-3 jours est soit la même éclipse,
  // soit la prochaine, éventuellement plusieurs années plus tard.
  const eclipse=Astronomy.SearchLocalSolarEclipse(new Date(begin.getTime()-3*86400000),observer(site));
  const t=utcDate(eclipse);
  return Math.abs(t.getTime()-target.getTime())<2*86400000 ? eclipse : null;
}
function isCentral(kind){return ['total','annular'].includes(String(kind).toLowerCase());}
function kindLabel(kind){return String(kind).toLowerCase()==='total'?'totale':'annulaire';}
function durationSeconds(e){
  if(!e.total_begin?.time?.date||!e.total_end?.time?.date)return 0;
  return (e.total_end.time.date.getTime()-e.total_begin.time.date.getTime())/1000;
}
function formatDuration(seconds){
  const s=Math.round(seconds);return `${Math.floor(s/60)} min ${String(s%60).padStart(2,'0')} s`;
}
function distKm(p){const r=Math.PI/180,dlat=(p.lat-VENDEE.lat)*r,dlon=(p.lon-VENDEE.lon)*r;
  const a=Math.sin(dlat/2)**2+Math.cos(VENDEE.lat*r)*Math.cos(p.lat*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(a));}
function pickPlaces(options,limit=7){
  const uniq=new Map();for(const p of options){if(!uniq.has(p.country))uniq.set(p.country,p);}
  // Destinations accessibles et sites avec une phase centrale plus longue.
  const accessible=[...options].sort((a,b)=>distKm(a)-distKm(b)).slice(0,3);
  const long=[...options].sort((a,b)=>b.durationSeconds-a.durationSeconds).slice(0,4);
  const distinct=[...accessible,...long,...uniq.values()].filter((p,i,a)=>a.findIndex(q=>q.name===p.name && q.country===p.country)===i);
  return distinct.slice(0,limit).map(p=>({
    name:p.name,country:p.country,lat:p.lat,lon:p.lon,
    duration:`≈ ${formatDuration(p.durationSeconds)} de ${p.kind==='total'?'totalité':'phase annulaire'} · maximum ${p.peakUTC} UTC`,
    note:'Circumstances astronomiques calculées pour cette ville ; revérifier le site exact, l’horizon et le décalage horaire avant réservation.'
  }));
}
function solarEvent(e){
  const peak=e.peak.date, date=CUT(peak), kind=String(e.kind).toLowerCase();
  if(!isCentral(kind)) return null;
  const sites=[];
  for(const site of SITES){
    const loc=nearestLocalSolar(peak,site,peak);
    if(!loc || !isCentral(loc.kind) || loc.peak.altitude < 6 || loc.total_begin?.altitude < 0 || loc.total_end?.altitude < 0) continue;
    const duration=durationSeconds(loc);
    if(duration<20) continue;
    sites.push({...site,kind:String(loc.kind).toLowerCase(),durationSeconds:duration,peakUTC:loc.peak.time.date.toISOString().slice(11,16)});
  }
  if(!sites.length) return null;
  const local=nearestLocalSolar(peak,VENDEE,peak);
  if(local&&isCentral(local.kind)&&local.peak.altitude>0) return null; // déjà visible en totalité ou annularité en Vendée
  const localText=local&&local.peak.altitude>0?'Éclipse partielle depuis la Vendée : la phase centrale impose un déplacement.':'Éclipse non observable en phase centrale depuis la Vendée.';
  const regions=[...new Set(sites.map(p=>p.country))].slice(0,8).join(', ');
  const selected=pickPlaces(sites);
  return {id:`auto-sol-${date}`,date,title:`Éclipse ${kindLabel(kind)} de Soleil`,category:'Éclipse solaire',
    region:regions,priority:'Exceptionnel',vendee:localText,
    timing:`Maximum astronomique mondial : ${peak.toISOString().slice(11,16)} UTC. Les heures diffèrent selon la destination.`,
    observation:`Phase ${kindLabel(kind)} visible depuis certaines destinations ci-dessous. Les circonstances sont calculées site par site, contrairement à une simple carte régionale.`,
    practical:[
      'Choisir un site vérifié dans la bande de totalité ou d’annularité, avec horizon dégagé.',
      'Vérifier les prévisions météorologiques, les accès et les horaires locaux avant toute réservation.',
      'Utiliser des lunettes certifiées ISO 12312-2 et des filtres solaires adaptés. Jamais d’observation non protégée pendant les phases partielles ni pendant une annularité.',
      'Pour une éclipse totale seulement, les protections peuvent être retirées uniquement durant la totalité complète, puis remises avant la réapparition du Soleil.'
    ],places:selected,
    sources:[{'name':'NASA/GSFC — catalogue officiel','url':'https://eclipse.gsfc.nasa.gov/SEpath/SEpath.html'},
             {'name':'Astronomy Engine — calcul astronomique','url':'https://github.com/cosinekitty/astronomy'}],
    reviewStatus:'verified',origin:'computed',calculation:'Astronomy Engine 2.x — éclipse locale et hauteur du Soleil'};
}
function moonHeightAtPeak(site,peak){
  const obs=observer(site);
  const eq=Astronomy.Equator('Moon',peak,obs,true,true);
  const h=Astronomy.Horizon(peak,obs,eq.ra,eq.dec,'normal');
  return h.altitude;
}
function lunarEvent(e){
  if(String(e.kind).toLowerCase()!=='total')return null;
  const peak=e.peak.date;
  if(moonHeightAtPeak(VENDEE,e.peak)>3)return null; // visible correctement depuis la Vendée
  const opts=SITES.filter(s=>moonHeightAtPeak(s,e.peak)>12)
    .sort((a,b)=>distKm(a)-distKm(b));
  if(!opts.length)return null;
  const places=opts.slice(0,6).map(p=>({name:p.name,country:p.country,lat:p.lat,lon:p.lon,
    duration:`Maximum ${peak.toISOString().slice(11,16)} UTC`,
    note:'Lune calculée au-dessus de 12° d’altitude au maximum ; horaires locaux et météorologie à vérifier.'}));
  return {id:`auto-lun-${CUT(peak)}`,date:CUT(peak),title:'Éclipse totale de Lune',category:'Éclipse lunaire',
    region:[...new Set(places.map(x=>x.country))].join(', '),priority:'Exceptionnel',
    vendee:'La Lune est sous l’horizon ou trop basse au maximum de l’éclipse totale depuis Les Herbiers.',
    timing:`Maximum calculé à ${peak.toISOString().slice(11,16)} UTC`,
    observation:'Le disque lunaire traverse l’ombre terrestre. Cette sélection privilégie des régions où la Lune est suffisamment haute au maximum.',
    practical:['Repérer un horizon ouvert et contrôler les horaires locaux.',
      'L’éclipse de Lune se regarde sans protection particulière, à l’œil nu ou aux jumelles.',
      'Vérifier les horaires du début et de la fin de totalité avant de se déplacer.'],
    places,sources:[{'name':'NASA/GSFC — catalogue des éclipses lunaires','url':'https://eclipse.gsfc.nasa.gov/lunar.html'},
      {'name':'Astronomy Engine — calcul astronomique','url':'https://github.com/cosinekitty/astronomy'}],
    reviewStatus:'verified',origin:'computed',calculation:'Astronomy Engine 2.x — éclipse et hauteur lunaire'};
}
function compute(){
  const events=[];
  // Un calcul global puis un contrôle local pour chaque ville.
  let sol=Astronomy.SearchGlobalSolarEclipse(START);
  for(let n=0;n<10;n++){
    if(sol.peak.date>END)break;
    const item=solarEvent(sol);if(item)events.push(item);
    sol=Astronomy.NextGlobalSolarEclipse(sol.peak);
  }
  let lunar=Astronomy.SearchLunarEclipse(START);
  for(let n=0;n<12;n++){
    if(lunar.peak.date>END)break;
    const item=lunarEvent(lunar);if(item)events.push(item);
    lunar=Astronomy.NextLunarEclipse(lunar.peak);
  }
  return events;
}
const editorial=JSON.parse(fs.readFileSync(SRC,'utf8'));
if(editorial.schema!==1 || !Array.isArray(editorial.events))throw new Error('Source éditoriale invalide');
const manual=editorial.events.filter(e=>e.reviewStatus==='verified'&&e.date>=CUT(START)&&e.date<=CUT(END));
let auto=compute();
// La fiche éditoriale complète et sourcée reste prioritaire pour le même événement.
auto=auto.filter(a=>!manual.some(m=>m.date===a.date&&((m.category==='Éclipse solaire'&&a.category==='Éclipse solaire')||(m.category==='Éclipse lunaire'&&a.category==='Éclipse lunaire'))));
const events=[...manual,...auto].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
const document={schema:1,generatedAt:new Date().toISOString(),period:{start:CUT(START),end:CUT(END)},
  source:'Village du Ciel · calculs Astronomy Engine et fiches éditoriales vérifiées',
  coverage:{
    solar:'Éclipses totales et annulaires calculées pour un réseau de villes européennes, méditerranéennes et proches : échantillonnage non exhaustif.',
    lunar:'Éclipses lunaires totales dont le maximum n’est pas suffisamment observable en Vendée, pour les villes échantillonnées.',
    other:'Occultations, comètes et autres phénomènes : ajout après validation éditoriale (pas de découverte automatique).'
  },counts:{total:events.length,editorial:manual.length,computed:auto.length},events};
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(document,null,2)+'\n');
console.log(`[Agenda Astro] ${events.length} événements : ${manual.length} éditoriaux, ${auto.length} calculés. Période : ${CUT(START)} à ${CUT(END)}.`);
