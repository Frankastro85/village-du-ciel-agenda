/* Village du Ciel - Fusion des catalogues V1.6 (2026-11)
 * Source automatique : date/heure astronomiques et source du calcul.
 * Source editoriale : niveau d'interet, visibilite locale, conseils et materiel.
 * Une meme planete dans une fenetre de 2 jours ne suffit PAS a identifier
 * le meme phenomene (elongation, opposition, quadrature, etc.).
 * Compatible navigateur (window.AstroCatalogue) et Node (module.exports).
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AstroCatalogue=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const valid=['lune','saison','planete','conjonction','eclipse','meteores'];
  const basic=e=>e&&typeof e==='object'&&/^(19|20|21)\d\d-\d\d-\d\d$/.test(e.date)&&typeof e.id==='string'&&e.id.length<150&&typeof e.title==='string'&&valid.includes(e.type)&&['majeur','interessant','specialise'].includes(e.priority)&&['visible','difficile','variable','invisible'].includes(e.visibility)&&e.source&&typeof e.source.name==='string';
  function word(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\u2013\u2014\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
  const sameDay=(a,b,margin)=>Math.abs(Date.parse(a.date+'T12:00:00Z')-Date.parse(b.date+'T12:00:00Z'))<=margin*86400000;
  const planets=['mercure','venus','mars','jupiter','saturne','uranus','neptune'];
  function planetNames(e){const words=word(e.title).split(' ');return planets.filter(p=>words.includes(p));}
  // L'identite du phenomene est necessaire pour decider d'une substitution.
  function planetPhenomenon(e){
    const s=word(e.title);
    if(s.includes('elongation')){
      const direction=/\b(orientale?|soir)\b|\ba l est\b/.test(s)?'est':/\b(occidentale?|ouest|matin)\b|\ba l ouest\b/.test(s)?'ouest':'';
      return {type:'elongation',direction};
    }
    for(const [type,re] of [
      ['opposition',/\bopposition\b/],
      ['quadrature',/\bquadrature\b/],
      ['conjonction',/\bconjonction\b/],
      ['station',/\b(stationnaire|station|stationarite)\b/],
      ['brightness',/\b(brillance|eclat|luminosite|brightness)\b/],
      ['perihelie',/\bperihelie\b/],
      ['aphelie',/\baphelie\b/]
    ])if(re.test(s))return {type,direction:''};
    return {type:'autre:'+s,direction:''};
  }
  function samePlanetPhenomenon(m,a){
    const mp=planetNames(m),ap=planetNames(a);
    if(!mp.length||!ap.length||mp.join(',')!==ap.join(','))return false;
    const x=planetPhenomenon(m),y=planetPhenomenon(a);
    if(x.type!==y.type)return false;
    // "Plus grande elongation de Mercure" (automatique) n'indique pas
    // toujours est/ouest. La fiche manuelle detaillee reste compatible.
    return x.type!=='elongation'||!x.direction||!y.direction||x.direction===y.direction;
  }
  function similar(m,a){
    if(m.type!==a.type)return false;
    if(m.type==='lune'&&m.kind&&a.kind)return m.kind===a.kind&&sameDay(m,a,2);
    if(m.type==='saison')return sameDay(m,a,2)&&(word(m.title).split(' ')[0]===word(a.title).split(' ')[0]);
    if(m.type==='eclipse')return sameDay(m,a,1)&&word(m.title).includes('lunaire')===word(a.title).includes('lunaire');
    if(m.type==='meteores'){
      const candidates=['quadrantides','lyrides','aquarides','perseides','orionides','taurides','leonides','geminides','ursides'];
      return sameDay(m,a,7)&&candidates.some(k=>word(m.title).includes(k)&&word(a.title).includes(k));
    }
    if(!sameDay(m,a,2))return false;
    if(m.type==='planete')return samePlanetPhenomenon(m,a);
    if(m.type==='conjonction'){
      const mp=planetNames(m),ap=planetNames(a);
      if(mp.length!==ap.length||!mp.every(x=>ap.includes(x)))return false;
      const mt=word(m.title),at=word(a.title);
      if(mt.includes('lune')!==at.includes('lune'))return false;
      // Ne pas fusionner deux rapprochements d'une meme planete avec deux
      // etoiles/amas differents (ex. Mars-Regulus et Mars-Pollux).
      const partners=['regulus','spica','aldebaran','antares','pollux','castor','sirius','pleiades','m45','m44','betelgeuse','arcturus'];
      const mpartners=partners.filter(p=>mt.split(' ').includes(p));
      const apartners=partners.filter(p=>at.split(' ').includes(p));
      return mpartners.join(',')===apartners.join(',');
    }
    return false;
  }
  function mergeEditorial(auto,manual){
    // Pour une meme realite astronomique : date/heure et identifiant auto
    // + annotation edito du club. Cela preserve "Specialise" et les conseils.
    return {
      ...auto,
      priority: manual.priority,
      visibility: manual.visibility,
      period: manual.period||auto.period,
      material: manual.material||auto.material,
      description: manual.description||auto.description,
      advice: manual.advice||auto.advice
    };
  }
  function merge(manual,computed){
    const a=Array.isArray(manual)?manual.filter(basic):[],b=Array.isArray(computed)?computed.filter(basic):[];
    // Pour les essaims, la fiche editoriale fait foi pour le maximum.
    const keptAuto=b.filter(c=>!(c.type==='meteores'&&a.some(m=>m.type==='meteores'&&similar(m,c))));
    const usedManual=new Set();
    const results=keptAuto.map(c=>{
      if(c.type!=='planete')return c;
      const index=a.findIndex((m,i)=>!usedManual.has(i)&&similar(m,c));
      if(index<0)return c;
      usedManual.add(index);
      return mergeEditorial(c,a[index]);
    });
    for(let i=0;i<a.length;i++){
      if(usedManual.has(i))continue;
      const m=a[i];
      if(!keptAuto.some(c=>similar(m,c)))results.push(m);
    }
    const ids=new Set();
    return results.filter(e=>{if(ids.has(e.id))return false;ids.add(e.id);return true;})
      .sort((x,y)=>x.date.localeCompare(y.date)||(x.utc||'').localeCompare(y.utc||'')||x.title.localeCompare(y.title));
  }
  function freshness(feed,now=new Date()){
    if(!feed||feed.automationActive!==true||!Array.isArray(feed.events)||!feed.events.some(basic))return {ok:false,reason:'Catalogue automatique invalide'};
    const ts=Date.parse(feed.generatedAt);if(!Number.isFinite(ts))return {ok:false,reason:'Date de mise a jour inconnue'};
    const days=(+now-ts)/86400000;
    if(days>14||days< -2)return{ok:false,reason:'Catalogue automatique perime ou horodate dans le futur'};
    return{ok:true,stale:days>2,days};
  }
  return {merge,freshness,basic};
});
