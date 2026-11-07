/* Fusion des prévisions automatiques et des fiches éditoriales existantes.
 * Les données auto (phases/saisons/oppositions) remplacent leurs doublons
 * du catalogue manuel ; les fiches spécialisées non couvertes sont gardées.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AstroCatalogue=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const valid=['lune','saison','planete','conjonction','eclipse','meteores'];
  const basic=e=>e&&typeof e==='object'&&/^(19|20|21)\d\d-\d\d-\d\d$/.test(e.date)&&typeof e.id==='string'&&e.id.length<150&&typeof e.title==='string'&&valid.includes(e.type)&&['majeur','interessant','specialise'].includes(e.priority)&&['visible','difficile','variable','invisible'].includes(e.visibility)&&e.source&&typeof e.source.name==='string';
  function word(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\u2013\u2014\-]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
  const sameDay=(a,b,margin)=>Math.abs(Date.parse(a.date+'T12:00:00Z')-Date.parse(b.date+'T12:00:00Z'))<=margin*86400000;
  function similar(m,a){
    if(m.type!==a.type)return false;
    if(m.type==='lune'&&m.kind&&a.kind)return m.kind===a.kind&&sameDay(m,a,2);
    if(m.type==='saison')return sameDay(m,a,2)&&(word(m.title).split(' ')[0]===word(a.title).split(' ')[0]);
    if(m.type==='eclipse')return sameDay(m,a,1)&&word(m.title).includes('lunaire')===word(a.title).includes('lunaire');
    if(m.type==='meteores'){
      // La fiche manuelle de l'année fait foi pour le maximum des essaims.
      const candidates=['quadrantides','lyrides','aquarides','perseides','orionides','taurides','leonides','geminides','ursides'];
      return sameDay(m,a,7)&&candidates.some(k=>word(m.title).includes(k)&&word(a.title).includes(k));
    }
    const planets=['mercure','venus','mars','jupiter','saturne','uranus','neptune'];
    const mplanets=planets.filter(p=>word(m.title).split(' ').includes(p));
    const aplanets=planets.filter(p=>word(a.title).split(' ').includes(p));
    if(!mplanets.length||!aplanets.length||!sameDay(m,a,2))return false;
    if(m.type==='planete')return (word(m.title).includes('opposition')===word(a.title).includes('opposition'))&&mplanets.join(',')===aplanets.join(',');
    if(m.type==='conjonction')return mplanets.length===aplanets.length&&mplanets.every(x=>aplanets.includes(x))&&word(m.title).includes('lune')===word(a.title).includes('lune');
    return false;
  }
  function merge(manual,computed){
    const a=Array.isArray(manual)?manual.filter(basic):[],b=Array.isArray(computed)?computed.filter(basic):[];
    // Pour les essaims, le maximum confirmé par l'éditeur remplace le repère habituel.
    const keptAuto=b.filter(c=>!(c.type==='meteores'&&a.some(m=>m.type==='meteores'&&similar(m,c))));
    const results=[...keptAuto];
    for(const m of a){if(!keptAuto.some(c=>similar(m,c)))results.push(m);}
    const ids=new Set();return results.filter(e=>{if(ids.has(e.id))return false;ids.add(e.id);return true;}).sort((x,y)=>x.date.localeCompare(y.date)||(x.utc||'').localeCompare(y.utc||'')||x.title.localeCompare(y.title));
  }
  function freshness(feed,now=new Date()){
    if(!feed||feed.automationActive!==true||!Array.isArray(feed.events)||!feed.events.some(basic))return {ok:false,reason:'Catalogue automatique invalide'};
    const ts=Date.parse(feed.generatedAt);if(!Number.isFinite(ts))return {ok:false,reason:'Date de mise à jour inconnue'};
    const days=(+now-ts)/86400000;
    if(days>14||days< -2)return{ok:false,reason:'Catalogue automatique périmé ou horodaté dans le futur'};
    return{ok:true,stale:days>2,days};
  }
  return {merge,freshness,basic};
});
