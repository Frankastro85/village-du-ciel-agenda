/**
 * Veille des comètes/occultations — fonctions sans effets de bord.
 * Les candidats sont des PISTES À VALIDER, pas des événements publiables.
 */
import {createHash} from 'node:crypto';

export const SITES = Object.freeze([
  {id:'vendee',name:'Les Herbiers',country:'France',lat:46.87,lon:-1.01},
  {id:'cadix',name:'Cadix',country:'Espagne',lat:36.53,lon:-6.29},
  {id:'marrakech',name:'Marrakech',country:'Maroc',lat:31.63,lon:-8.01},
  {id:'tunis',name:'Tunis',country:'Tunisie',lat:36.81,lon:10.18},
  {id:'athenes',name:'Athènes',country:'Grèce',lat:37.98,lon:23.73}
]);
export const REVIEW_LABEL = 'À vérifier avant publication';
const isoDay = value => new Date(value).toISOString().slice(0,10);
const validDate = value => /^20\d\d-\d\d-\d\d$/.test(String(value)) && !Number.isNaN(Date.parse(value+'T12:00:00Z'));
const DAY = 86400000;
const norm = value => String(value??'').normalize('NFKC').trim();
const normalizedDesignation = obj => norm(obj.mpc_name||obj.comet_name||obj.comet_fullname).toUpperCase().replace(/\s+/g,'');
const round1 = n => Math.round(n*10)/10;
const compact = value => norm(value).replace(/\s+/g,' ').slice(0,300);
const digest = value => createHash('sha256').update(value).digest('hex').slice(0,16);

export function plannerURL(site, day){
  if(!validDate(day)) throw new Error('Date invalide');
  const url = new URL('https://cobs.si/api/planner.api');
  const p = {date:day,lat:site.lat,long:site.lon,alt:100,lim_mag:6.5,min_alt:15,sun_alt:-12,min_sol:25,min_moon:10,filter:1};
  for(const [k,v] of Object.entries(p))url.searchParams.set(k,String(v));
  return url.toString();
}
export function parsePlanner(payload){
  if(!payload || !Array.isArray(payload.comet_list) || !payload.signature?.source?.toLowerCase().includes('cobs'))
    throw new Error('COBS : schéma de réponse inattendu');
  if(!/^1\./.test(String(payload.signature.version)))throw new Error('COBS : version API non validée');
  return payload.comet_list.filter(c =>
    normalizedDesignation(c) && Number.isFinite(+c.magnitude) &&
    Number.isFinite(+c.best_alt) && Number.isFinite(+c.sun_elongation))
    .map(c=>({designation:normalizedDesignation(c),name:compact(c.comet_fullname||c.comet_name),
      magnitude:+c.magnitude,altitude:+c.best_alt,elongation:+c.sun_elongation,
      sourceMethod:Number(c.orbit_calc_source),bestTime:compact(c.best_time)}));
}
export function cometCandidates(planners,day){
  // planners : Map<site.id, tableau> ; disponibilité de la Vendée vérifiée séparément.
  const local = planners.get('vendee');
  const byName = new Map();
  for(const site of SITES.filter(s=>s.id!=='vendee')){
    for(const c of planners.get(site.id)||[]){
      if(c.magnitude>5.8 || c.altitude<15 || c.elongation<25)continue;
      const current = byName.get(c.designation);
      if(!current || c.magnitude<current.magnitude)byName.set(c.designation,{...c,site});
    }
  }
  return [...byName.values()].filter(c=>{
    // Un objet observé dans les conditions choisies en Vendée n'est pas un événement "ailleurs".
    return !Array.isArray(local) || !local.some(l=>l.designation===c.designation && l.magnitude<=6.5);
  }).sort((a,b)=>a.magnitude-b.magnitude).slice(0,12).map(c=>({
    id:`comete-${digest(c.designation)}`,type:'comete',title:`Comète ${c.name}`,
    observedDate:day,source:'COBS · Comet Planner',sourceUrl:'https://cobs.si/',
    priority:c.magnitude<=4.5?'haute':'modérée',
    summary:`Magnitude estimée ${round1(c.magnitude)} · hauteur ${Math.round(c.altitude)}° à ${c.site.name} (${c.site.country}).`,
    why: Array.isArray(local) ?
      'Non présente dans la liste COBS pour Les Herbiers avec les mêmes filtres. Cela ne démontre pas son invisibilité.' :
      'Données Vendée indisponibles : visibilité locale non contrôlée.',
    destinationHint:`${c.site.name}, ${c.site.country}`,
    nextStep:'Vérifier éphémérides, magnitude récente, durée de visibilité et comparaison géométrique avec la Vendée.',
    validation:'unverified',sourceData:{designation:c.designation,magnitude:c.magnitude,siteId:c.site.id,sourceMethod:c.sourceMethod}
  }));
}

function decodeEntities(text){
  return String(text).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n))))
    .replace(/&#x([a-f\d]+);/gi,(_,n)=>String.fromCodePoint(Math.min(1114111,parseInt(n,16))))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[e]));
}
const plaintext = html=>compact(decodeEntities(String(html).replace(/<[^>]*>/g,' ')));
export function parseOccultationYear(html,start,end){
  if(typeof html!=='string'||html.length<100)return [];
  // Table HTML publique : le contenu ou le balisage peut changer. Source opportuniste.
  const out=[];
  for(const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const row=match[1];
    const href = row.match(/(?:href=["'])([^"']*\/lunar-occultations\/(20\d\d-\d\d-\d\d-[a-z0-9-]+)[^"']*)["']/i);
    if(!href)continue;
    const slug=href[2],date=slug.slice(0,10);
    if(!validDate(date)||date<start||date>end)continue;
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>plaintext(c[1]));
    const magnitudeText=cells.find(c=>/^[−-]?\d+(?:\.\d+)?$/.test(c));
    const name=slug.slice(11).replace(/-/g,' ');
    const planet=/^(venus|mars|mercury|jupiter|saturn|uranus|neptune)$/i.test(name);
    // Ne pas tout importer : étoiles brillantes uniquement, ou planète.
    const relevant=/^(antares|aldebaran|regulus|spica|nunki|alcyone|electra|maia|atlas|pollux|pleiades|betelgeuse)/i.test(name);
    const m=magnitudeText?Number(magnitudeText.replace('−','-')):null;
    if(!planet && !relevant && !(Number.isFinite(m)&&m<=2.5))continue;
    out.push({id:`occultation-${slug}`,type:'occultation',title:`Occultation lunaire : ${name}`,
      observedDate:date,source:'TheSkyLive · catalogue mondial',
      sourceUrl:'https://theskylive.com/lunar-occultations/'+slug,
      priority:planet||name==='antares'?'haute':'modérée',
      summary:`Occultation répertoriée le ${date} UTC, destination et visibilité locale à calculer.`,
      why:'Le calendrier mondial ne garantit pas la visibilité depuis la Vendée ni un lieu européen.',
      destinationHint:'À déterminer',nextStep:'Ouvrir la carte mondiale et comparer Les Herbiers avec une ville d’Europe ou proche.',
      validation:'unverified',sourceData:{slug}});
  }
  return [...new Map(out.map(e=>[e.id,e])).values()].slice(0,35);
}

function rssField(block,field){
  const tag=field.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));
  return m?plaintext(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')):'';
}
export function parseRSS(xml,source,now=new Date()){
  if(typeof xml!=='string'|| !(/<rss\b|<feed\b/i.test(xml)))throw new Error('Flux RSS/Atom invalide');
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(m=>m[1]);
  const out=[];
  for(const b of blocks){
    const title=rssField(b,'title');
    const summary=rssField(b,'description')||rssField(b,'summary');
    const dateString=rssField(b,'pubDate')||rssField(b,'published')||rssField(b,'updated');
    let link=rssField(b,'link');
    if(!link){const lm=b.match(/<link\b[^>]*href=["']([^"']+)["']/i);if(lm)link=decodeEntities(lm[1]);}
    const d=new Date(dateString);
    if(!title||!Number.isFinite(d.getTime())||d>now||now-d>31*DAY)continue;
    if(!/^https:\/\//i.test(link))continue;
    const blob=(title+' '+summary).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    let type;
    if(/occultation|stellar occult|lunar occult|occulting/.test(blob))type='occultation';
    else if(/comet|comete|cometary/.test(blob) && /bright|visible|naked.eye|observ|sky|earth|magnitude|apparent|eclat|lumineus/.test(blob))type='comete';
    else continue;
    out.push({id:`actualite-${digest(link)}`,type,title:title.slice(0,160),observedDate:isoDay(d),
      source,sourceUrl:link,priority:'modérée',summary:summary.slice(0,260),
      why:'Signal d’actualité : ni date de phénomène ni visibilité depuis la Vendée confirmées.',
      destinationHint:'À déterminer',nextStep:'Lire l’article original, identifier la date et valider les circonstances géographiques.',
      validation:'unverified',sourceData:{kind:'article'}});
  }
  return out.slice(0,25);
}

export function mergeCandidates(oldList,newList,now=new Date()){
  const today=isoDay(now),kept=new Map();
  for(const candidate of oldList||[]){
    if(!candidate?.id||!validDate(candidate.lastSeen||candidate.observedDate))continue;
    const oldAge=Date.parse(today+'T12:00:00Z')-Date.parse((candidate.lastSeen||candidate.observedDate)+'T12:00:00Z');
    if(oldAge<=45*DAY) kept.set(candidate.id,candidate);
  }
  for(const candidate of newList){
    if(!candidate?.id||candidate.validation!=='unverified')continue;
    const prior=kept.get(candidate.id);
    kept.set(candidate.id,{...candidate,firstSeen:prior?.firstSeen||today,lastSeen:today});
  }
  return [...kept.values()].sort((a,b)=>({haute:0,'modérée':1}[a.priority]??2)-({haute:0,'modérée':1}[b.priority]??2) || b.lastSeen.localeCompare(a.lastSeen)||a.id.localeCompare(b.id)).slice(0,140);
}
