import test from 'node:test';
import assert from 'node:assert/strict';
import {toFeed,readUsableFeed,eventURL,REFERENCE} from '../transits-feed-lib.mjs';
import {withTransits} from '../../scripts/discord-transits-addon.mjs';
const now=new Date('2026-11-22T14:00:00.000Z');
const event={kind:'sun',timeUtc:'2026-11-23T14:00:00.000Z',centerTimeUtc:'2026-11-23T14:00:00.000Z',center:{lat:46.87,lon:-1.01},centerDistanceKm:7,bandDistanceKm:0,durationMs:1000,halfWidthKm:6,orbitAgeHours:28};
const base={content:'Bulletin conservé',embeds:[{title:'Agenda'},{title:'Météo'}],allowed_mentions:{parse:[]}};
const sample=()=>toFeed([event],{generatedAt:now.toISOString(),reference:REFERENCE});
test('le feed ISS est distinct et comporte les paramètres du lieu',()=>{
 const f=sample();assert.equal(f.events.length,1);assert.equal(f.reference.radiusKm,30);
 assert.match(eventURL(f.events[0],f.reference),/rayon=30/);
});
test('les transits s’ajoutent sans toucher aux deux embeds d’origine',()=>{
 const result=withTransits(base,now,sample());assert.equal(result.embeds.length,3);
 assert.deepEqual(result.embeds.slice(0,2),base.embeds);
 assert.equal(base.embeds.length,2);assert.match(result.embeds[2].fields[0].value,/À revérifier/);
});
test('absence de prévision et catalogue périmé : aucun changement',()=>{
 assert.equal(withTransits(base,now,{...sample(),events:[]}),base);
 assert.equal(withTransits(base,now,{...sample(),generatedAt:'2026-11-18T00:00:00Z'}),base);
 assert.equal(withTransits(base,now,null),base);
});
test('un événement passé n’apparaît pas',()=>{
 assert.equal(readUsableFeed({...sample(),events:[{...sample().events[0],timeUtc:'2026-11-19T14:00:00.000Z'}]},now).events.length,0);
});
