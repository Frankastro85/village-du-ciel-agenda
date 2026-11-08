import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {describeEventObservation} from '../scripts/local-observation.mjs';
const require=createRequire(import.meta.url);
const score=require('../scripts/score-ciel.cjs');
const fakeDay=(date,cloud)=>({date,periods:[{key:'soiree',available:true,cloud_cover:cloud,wind_speed_10m:10,relative_humidity_2m:65},{key:'nuit',available:true,cloud_cover:cloud,wind_speed_10m:10,relative_humidity_2m:65}]});
test('indice du ciel décroît avec les nuages et reste borné',()=>{
 const clear=score.scoreDay(fakeDay('2026-11-08',10),0).score;
 const cloudy=score.scoreDay(fakeDay('2026-11-08',90),0).score;
 assert.ok(clear>cloudy);assert.ok(clear<=100&&cloudy>=0);
});
test('nuit indisponible = pas de note artificielle',()=>{
 const d=fakeDay('2026-11-08',20);d.periods[1].available=false;
 assert.equal(score.scoreDay(d).available,false);
 assert.equal(score.rankDays([d]).best,null);
});
test('meilleure nuit choisie selon score, sans inventer de valeurs',()=>{
 const a=fakeDay('2026-11-08',60),b=fakeDay('2026-11-09',15);
 assert.equal(score.rankDays([a,b]).best.date,b.date);
});
test('visibilité locale : ne pas produire de chiffres en absence de moteur',()=>{
 assert.equal(describeEventObservation({}, {title:'Rapprochement Lune – Vénus',type:'conjonction',utc:'2026-11-08T12:00:00Z',date:'2026-11-08'}),null);
 assert.equal(describeEventObservation({}, {title:'Équinoxe',type:'saison',utc:'2026-11-08T12:00:00Z',date:'2026-11-08'}),null);
});
test('visibilité locale : calculs géométriques seulement pour objets connus',()=>{
 const Fake={Body:{Moon:'Moon',Mars:'Mars',Sun:'Sun'},Observer:class {},Equator:(body)=>({ra:0,dec:0,body}),Horizon:(t,o,ra,dec)=>({altitude:35,azimuth:140})};
 const x=describeEventObservation(Fake,{title:'Rapprochement Lune – Mars',type:'conjonction',utc:'2026-11-08T12:00:00Z',date:'2026-11-08'});
 assert.deepEqual(x.atInstant.map(p=>p.label),['Mars','Lune']);
 assert.equal(x.bestNightUTC,null); // Soleil factice toujours au-dessus du seuil nocturne
 assert.equal(x.daylightAtInstant,true);
});
test('crépuscule astronomique : ordre nuit puis aube suivante',()=>{
 require('../../astro_v20_site/astro-calculs.js');
 const {astronomicalNight}=globalThis.AstroCalculs;
 const result=astronomicalNight('2026-11-08');
 assert.ok(result.dawn>result.dusk);
 assert.ok(result.durationMinutes>500&&result.durationMinutes<800);
});
