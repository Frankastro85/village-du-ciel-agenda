/* AstroMeteo — Les Herbiers (85) : mêmes calculs pour le site et Discord.
 * Périodes locales Europe/Paris : matin 06-12, après-midi 12-18,
 * soirée 18-00, nuit 00-06 du lendemain. Moyennes horaires arrondies.
 * Attribution requise : Open-Meteo (CC BY 4.0). Aucun secret ni suivi.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AstroMeteo = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const TZ = 'Europe/Paris';
  // Coordonnées du centre des Herbiers fournies par la commune : 46°52'12" N, 1°00'36" O.
  const LAT = 46.87, LON = -1.01;
  const vars = ['cloud_cover','temperature_2m','wind_speed_10m','relative_humidity_2m'];
  const slots = [
    {key:'matin',label:'Matin',start:6,end:12,shift:0},
    {key:'apresmidi',label:'Après-midi',start:12,end:18,shift:0},
    {key:'soiree',label:'Soirée',start:18,end:24,shift:0},
    {key:'nuit',label:'Nuit suivante',start:0,end:6,shift:1}
  ];
  function dayParis(date=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=k=>parts.find(p=>p.type===k).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function dayPlus(day,n){let d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function forecastURL(){const p=new URLSearchParams({latitude:String(LAT),longitude:String(LON),hourly:vars.join(','),timezone:TZ,wind_speed_unit:'kmh',forecast_days:'6'});return 'https://api.open-meteo.com/v1/forecast?'+p.toString();}
  function avg(data){const valid=data.filter(x=>Number.isFinite(x));return valid.length?Math.round(valid.reduce((s,n)=>s+n,0)/valid.length):null;}
  function summarize(raw, fromDay=dayParis(), count=5){
    if(!raw||!raw.hourly||!Array.isArray(raw.hourly.time))throw Error('Prévisions horaires absentes.');
    const h=raw.hourly;
    for(const name of vars)if(!Array.isArray(h[name])||h[name].length!==h.time.length)throw Error('Variable météo manquante : '+name);
    const idx=new Map(h.time.map((s,i)=>[s,i]));
    const days=[];
    for(let d=0;d<count;d++){
      const date=dayPlus(fromDay,d),parts=[];
      for(const s of slots){
        const spanDate=dayPlus(date,s.shift);let indexes=[];
        for(let hour=s.start;hour<s.end;hour++){
          const i=idx.get(spanDate+'T'+String(hour).padStart(2,'0')+':00');
          if(i!==undefined)indexes.push(i);
        }
        const values=Object.fromEntries(vars.map(k=>[k,avg(indexes.map(i=>h[k][i]))]));
        parts.push({key:s.key,label:s.label,nightNext:s.shift===1,available:indexes.length===6 && vars.every(k=>values[k]!==null),...values});
      }
      days.push({date,periods:parts});
    }
    return {location:'Les Herbiers (85)',timezone:TZ,days,source:'Open-Meteo',url:'https://open-meteo.com/',retrievedAt:new Date().toISOString()};
  }
  function weatherText(p){
    if(!p||!p.available)return 'prévision indisponible';
    return `☁ ${p.cloud_cover} % · ${p.temperature_2m} °C · vent ${p.wind_speed_10m} km/h · humidité ${p.relative_humidity_2m} %`;
  }
  function dayLabel(date){
    return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  }
  return {dayParis,dayPlus,forecastURL,summarize,weatherText,dayLabel,slots};
});
