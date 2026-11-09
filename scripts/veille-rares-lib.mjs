/**
 * Veille du club Village du Ciel : occultations MAJEURES et comètes m < 10.
 * Le résultat alimente une revue GitHub, jamais directement l'agenda public.
 */
import {createHash} from 'node:crypto';

export const COMET_MAG_LIMIT = 10; // STRICTEMENT < 10, pas <= 10
export const SITES = Object.freeze([
  {id:'vendee',name:'Les Herbiers',country:'France',lat:46.87,lon:-1.01},
  {id:'cadix',name:'Cadix',country:'Espagne',lat:36.53,lon:-6.29},
  {id:'marrakech',name:'Marrakech',country:'Maroc',lat:31.63,lon:-8.01},
  {id:'tunis',name:'Tunis',country:'Tunisie',lat:36.81,lon:10.18},
  {id:'athenes',name:'Athènes',country:'Grèce',lat:37.98,lon:23.73}
]);
const DAY = 86400000;
const norm = x => String(x ?? '').normalize('NFKC').trim();
const text = x => norm(x).replace(/\s+/g,' ').slice(0,300);
const hash = x => createHash('sha256').update(x).digest('hex').slice(0,16);
const dayKey = date => date.toISOString().slice(0,10);
const validDay = d => /^20\d{2}-\d{2}-\d{2}$/.test(String(d)) && !Number.isNaN(Date.parse(d+'T12:00:00Z'));
const designation = c => norm(c.mpc_name||c.comet_name||c.comet_fullname).toUpperCase().replace(/\s+/g,'');
const round1 = n => Math.round(n*10)/10;

// Sources : https://cobs.si/help/cobs_api/planner_api/
export function plannerURL(site,day){
  if(!validDay(day)) throw new Error('Date invalide');
  const u=new URL('https://cobs.si/api/planner.api');
  const params={date:day,lat:site.lat,long:site.lon,alt:100,
    lim_mag:'9.99',min_alt:10,sun_alt:-12,min_sol:20,min_moon:0,filter:1};
  for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
  return u.toString();
}
export function parsePlanner(payload){
  if(!payload||!Array.isArray(payload.comet_list)||!payload.signature?.source?.toLowerCase().includes('cobs'))
    throw new Error('COBS : schéma inattendu');
  if(!/^1\./.test(String(payload.signature.version)))throw new Error('COBS : version API inconnue');
  return payload.comet_list.filter(c=>c && designation(c) && c.magnitude !== null && c.magnitude !== '' &&
      Number.isFinite(Number(c.magnitude)) && Number(c.magnitude)<COMET_MAG_LIMIT &&
      Number.isFinite(Number(c.best_alt)) && Number.isFinite(Number(c.sun_elongation)))
    .map(c=>({designation:designation(c),name:text(c.comet_fullname||c.comet_name||c.mpc_name),
      magnitude:Number(c.magnitude),altitude:Number(c.best_alt),elongation:Number(c.sun_elongation),
      bestTime:text(c.best_time),sourceMethod:Number(c.orbit_calc_source)}));
}
export function cometCandidates(planners,day){
  // Une comète visible depuis les Herbiers est ELIGIBLE : ce n'est pas une sélection de voyages.
  const byName=new Map(),here=new Set((planners.get('vendee')||[]).map(c=>c.designation));
  for(const site of SITES){
    for(const c of planners.get(site.id)||[]){
      if(!(Number.isFinite(c.magnitude)&&c.magnitude<COMET_MAG_LIMIT) || c.altitude<10 || c.elongation<20)continue;
      const old=byName.get(c.designation);
      if(!old || (!old.siteIsLocal&&site.id==='vendee') || (old.siteIsLocal===Boolean(site.id==='vendee')&&c.magnitude<old.magnitude))
        byName.set(c.designation,{...c,site,siteIsLocal:site.id==='vendee'});
    }
  }
  return [...byName.values()].sort((a,b)=>a.magnitude-b.magnitude).slice(0,35).map(c=>({
    id:`comete-${hash(c.designation)}`,type:'comete',title:`Comète ${c.name}`,
    observedDate:day,source:'COBS · Comet Planner',sourceUrl:'https://cobs.si/',
    priority:c.magnitude<6?'haute':'modérée',
    summary:`Magnitude estimée ${c.magnitude.toFixed(2)} (< 10), hauteur indicative ${Math.round(c.altitude)}° à ${c.site.name}.`,
    why: here.has(c.designation)?'Présente dans les prévisions pour Les Herbiers ; vérifier météo et éphémérides.':
      'Détectée dans un site du réseau ; visibilité depuis Les Herbiers non déterminée.',
    destinationHint:'Veille du club — aucun déplacement recommandé automatiquement',
    nextStep:'Confirmer la magnitude sur des observations récentes et les horaires depuis Les Herbiers.',
    validation:'unverified',sourceData:{designation:c.designation,magnitude:c.magnitude,
      bestTime:c.bestTime,siteId:c.site.id,vendeeInPlanner:here.has(c.designation),sourceMethod:c.sourceMethod}
  }));
}

function decodeEntities(s){return String(s).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n))))
  .replace(/&#x([a-f\d]+);/gi,(_,n)=>String.fromCodePoint(Math.min(1114111,parseInt(n,16))))
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[e]));}
const plain = s=>text(decodeEntities(String(s).replace(/<[^>]*>/g,' ')));
const PLANETS = new Set(['mercury','venus','mars','jupiter','saturn']);
const STAR_MAG = Object.freeze({antares:1.1,aldebaran:0.9,regulus:1.4,spica:1.0,pollux:1.1,
  elnath:1.7,castor:1.6,betelgeuse:0.5});
export function importantOccultationSlug(slug, magnitude=null){
  const obj=String(slug).replace(/^20\d\d-\d\d-\d\d-/,'').toLowerCase().replace(/-/g,' ');
  if(PLANETS.has(obj))return true;
  if(Object.prototype.hasOwnProperty.call(STAR_MAG,obj))return true;
  // Les autres étoiles sont retenues uniquement si la colonne de magnitude est exploitable.
  return magnitude !== null && Number.isFinite(magnitude) && magnitude <= 2 && magnitude >= -2;
}
export function parseOccultationYear(html,start,end){
  if(typeof html!=='string'||html.length<100)return [];
  const out=[];
  for(const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const row=match[1];
    const href=row.match(/href=["']([^"']*\/lunar-occultations\/(20\d\d-\d\d-\d\d-[a-z0-9-]+)[^"']*)["']/i);
    if(!href)continue;
    const slug=href[2],date=slug.slice(0,10);
    if(!validDay(date)||date<start||date>end)continue;
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>plain(c[1]));
    // TheSkyLive : Date | Objet | Mag. | Lune | Visibilité. Ne jamais confondre date et magnitude.
    const rawMag=cells[2]?.replace('−','-').trim();
    const mag=rawMag && /^[+-]?\d+(?:[.,]\d+)?$/.test(rawMag)?Number(rawMag.replace(',','.')):null;
    if(!importantOccultationSlug(slug,mag))continue;
    const name=slug.slice(11).replace(/-/g,' ');
    const planet=PLANETS.has(name);
    out.push({id:`occultation-${slug}`,type:'occultation',title:`Occultation lunaire : ${name}`,
      observedDate:date,source:'TheSkyLive · catalogue mondial',
      sourceUrl:'https://theskylive.com/lunar-occultations/'+slug,
      priority:'haute',
      summary:`Occultation d'${planet?'une planète brillante':'une étoile remarquable'} le ${date}. Visibilité depuis la Vendée à vérifier.`,
      why:'La présence dans un catalogue mondial ne prouve pas la visibilité depuis Les Herbiers.',
      destinationHint:'Veille du club — pas de proposition de voyage',
      nextStep:'Contrôler la carte de visibilité, les heures locales et les conditions d’observation.',
      validation:'unverified',sourceData:{slug,importance:'majeure',magnitude:mag}
    });
  }
  return [...new Map(out.map(e=>[e.id,e])).values()].slice(0,45);
}

export function eligible(c){
  if(!c||c.validation!=='unverified')return false;
  if(c.type==='comete')return c.sourceData?.magnitude !== null &&
    Number.isFinite(Number(c.sourceData?.magnitude)) && Number(c.sourceData.magnitude)<COMET_MAG_LIMIT;
  if(c.type==='occultation')return typeof c.sourceData?.slug==='string' &&
    importantOccultationSlug(c.sourceData.slug,
      Number.isFinite(c.sourceData.magnitude)?c.sourceData.magnitude:null);
  return false; // Pas d'article sans magnitude vérifiée, pas de petites occultations
}
export function mergeCandidates(previous,current,now=new Date()){
  const today=dayKey(now),kept=new Map();
  for(const c of previous||[]){
    if(!eligible(c)||!validDay(c.lastSeen||c.observedDate))continue;
    const age=Date.parse(today+'T12:00:00Z')-Date.parse((c.lastSeen||c.observedDate)+'T12:00:00Z');
    if(age>14*DAY)continue;
    if(c.type==='occultation' && c.observedDate<today)continue;
    kept.set(c.id,{...c,priority:c.type==='occultation'?'haute':c.sourceData.magnitude<6?'haute':'modérée',
      sourceData:c.type==='occultation'?{...c.sourceData,importance:'majeure'}:c.sourceData});
  }
  for(const c of current){
    if(!eligible(c))continue;
    const old=kept.get(c.id);
    kept.set(c.id,{...c,firstSeen:old?.firstSeen||today,lastSeen:today});
  }
  return [...kept.values()].sort((a,b)=>({haute:0,'modérée':1}[a.priority]??2)-({haute:0,'modérée':1}[b.priority]??2)
    ||a.observedDate.localeCompare(b.observedDate)||a.id.localeCompare(b.id)).slice(0,120);
}
