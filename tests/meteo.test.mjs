import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const weather=createRequire(import.meta.url)('../scripts/meteo-astro.cjs');
import {makeMessage} from '../scripts/discord-message-lib.mjs';
function sample(start='2026-11-08',count=6){
 const dates=[];let d=new Date(start+'T12:00:00Z');
 for(let day=0;day<count;day++){
  const k=d.toISOString().slice(0,10);
  for(let h=0;h<24;h++)dates.push(k+'T'+String(h).padStart(2,'0')+':00');
  d.setUTCDate(d.getUTCDate()+1);
 }
 return {hourly:{time:dates,cloud_cover:dates.map((_,i)=>i%100),temperature_2m:dates.map(()=>10),wind_speed_10m:dates.map(()=>16),relative_humidity_2m:dates.map(()=>70)}};
}
test('cinq jours et nuit suivante à J+5, moyenne horaire',()=>{
 const x=weather.summarize(sample(),'2026-11-08',5);
 assert.equal(x.days.length,5);assert.equal(x.days[4].periods.length,4);
 assert.deepEqual(x.days[0].periods.map(p=>p.available),[true,true,true,true]);
 assert.equal(x.days[0].periods[0].temperature_2m,10);
 assert.equal(x.days[4].periods[3].relative_humidity_2m,70);
 assert.equal(x.days[0].periods[3].cloud_cover,27);
});
test('données manquantes sans valeurs imaginées',()=>{
 const x=weather.summarize(sample('2026-11-08',5),'2026-11-08',5);
 assert.equal(x.days[4].periods[3].available,false);
 assert.equal(weather.weatherText(x.days[4].periods[3]),'prévision indisponible');
});
test('bulletin Discord résumé à deux jours, les quatre périodes sont conservées',()=>{
 const payload=makeMessage([],new Date('2026-11-08T07:00:00Z'),weather.summarize(sample(),'2026-11-08',5));
 assert.equal(payload.embeds.length,2);
 assert.equal(payload.embeds[1].fields.length,3);
 assert.match(payload.embeds[1].title,/aujourd’hui et demain/);
 assert.match(payload.embeds[1].fields[0].name,/(nuit|Nuit|Conditions)/);
 const next=payload.embeds[1].fields.slice(1);
 assert.equal(next.length,2);
 assert.ok(next.every(f=>['Matin','Après-midi','Soirée','Nuit suivante'].every(period=>f.value.includes(period))));
 assert.ok(!payload.embeds[1].fields.some(f=>f.name.includes('J+2')));
 assert.match(payload.content,/allsky\.villageduciel\.fr\/Agenda-Astro\//);
 assert.ok(payload.embeds.flatMap(e=>e.fields).every(f=>f.value.length<=1024));
 assert.deepEqual(payload.allowed_mentions,{parse:[]});
});

test('météo non disponible : aucun chiffre inventé et lien conservé',()=>{
 const payload=makeMessage([],new Date('2026-11-08T09:00:00Z'));
 assert.match(payload.embeds[1].fields.at(-1).value,/Aucune donnée météo/);
 assert.match(payload.content,/AGENDA COMPLET/);
});
