/* Agenda Astro V2 — indice indicatif pour l'observation du ciel profond.
 * Cette note n'est PAS une prévision de seeing, transparence ou visibilité de l'horizon.
 * Pondération explicite : nuages 76 %, gêne lunaire potentielle 14 %, vent 6 %, humidité 4 %.
 * La fraction lunaire est approximée par cycle synodique ; la hauteur de Lune n'est pas prise en compte.
 * Module UMD partagé à l'identique entre page web et moteur Node.js/Discord.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AstroScoreCiel=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const BASE=Date.parse('2000-01-06T18:14:00Z'),SYNODIC=29.530588853;
  function clamp(n,min=0,max=100){return Math.min(max,Math.max(min,n));}
  function moonFractionApprox(day){
    const ms=Date.parse(day+'T21:00:00Z');
    if(!Number.isFinite(ms))return null;
    const cycle=((ms-BASE)/86400000/SYNODIC%1+1)%1;
    return (1-Math.cos(2*Math.PI*cycle))/2;
  }
  function scoreDay(day,fractionOverride){
    const periods=day?.periods||[];
    const evening=periods.find(p=>p.key==='soiree');
    const night=periods.find(p=>p.key==='nuit');
    if(!evening?.available||!night?.available)return {date:day?.date||'',available:false,score:null};
    const avg=(key)=>0.5*(evening[key]+night[key]);
    const clouds=avg('cloud_cover'),wind=avg('wind_speed_10m'),humidity=avg('relative_humidity_2m');
    const fraction=Number.isFinite(fractionOverride)?clamp(fractionOverride,0,1):moonFractionApprox(day.date);
    if(!Number.isFinite(clouds)||!Number.isFinite(wind)||!Number.isFinite(humidity)||!Number.isFinite(fraction))return {date:day.date,available:false,score:null};
    const penalty=clamp(clouds)*.76+fraction*14+clamp(wind/40,0,1)*6+clamp((humidity-60)/40,0,1)*4;
    const score=Math.round(clamp(100-penalty));
    const level=score>=75?'favorable':score>=50?'mitige':'defavorable';
    return {date:day.date,available:true,score,level,clouds:Math.round(clouds),wind:Math.round(wind),humidity:Math.round(humidity),moon:Math.round(fraction*100)};
  }
  function rankDays(days){
    const scores=(days||[]).map(day=>scoreDay(day));
    const candidates=scores.filter(s=>s.available);
    const best=candidates.length?[...candidates].sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date))[0]:null;
    return {scores,best};
  }
  function label(level){return level==='favorable'?'Favorable':level==='mitige'?'Mitigé':'Défavorable';}
  return {moonFractionApprox,scoreDay,rankDays,label};
});
