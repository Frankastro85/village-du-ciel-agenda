import test from 'node:test';
import assert from 'node:assert/strict';
import {getTLEWithFallback} from '../orbit-fallback.mjs';

const TLE1='1 25544U 98067A   26329.50000000  .00002998  00000-0  56789-4 0  9990';
const TLE2='2 25544  51.6433 300.0056 0004000 145.0000 200.0000 15.50000000 00001';
const nowMs=Date.UTC(2026,10,25,18,0,0);
const feed={schemaVersion:1,source:'Cache Réaumur',tles:[{line1:TLE1,line2:TLE2}]};
const jsonReader=async()=>JSON.stringify(feed);
const okText=(body)=>({ok:true,status:200,text:async()=>body,json:async()=>JSON.parse(body)});
const failure=(status)=>({ok:false,status});

test('HTTP 503 CelesTrak : aucune seconde requête vers CelesTrak, reprise cache valide',async()=>{
  const calls=[];
  const result=await getTLEWithFallback({nowMs,reader:jsonReader,fetcher:async(url)=>{calls.push(url);return failure(503);}});
  assert.equal(calls.length,1);
  assert.match(result.source,/Cache orbital ISS/);
  assert.equal(result.tles.length,1);
});
test('si le cache est trop ancien, la source indépendante prend le relais',async()=>{
  const calls=[];
  const staleTLE={...feed,tles:[{line1:TLE1.replace('26329.50000000','26310.50000000'),line2:TLE2}]};
  const result=await getTLEWithFallback({nowMs,reader:async()=>JSON.stringify(staleTLE),fetcher:async(url)=>{
    calls.push(url);
    return url.includes('wheretheiss.at')?okText(JSON.stringify({line1:TLE1,line2:TLE2})):failure(503);
  }});
  assert.equal(calls.length,2);
  assert.equal(result.source,'WhereTheISS.at');
});
test('aucun TLE valide : ne jamais fabriquer un catalogue',async()=>{
  const calls=[];
  await assert.rejects(getTLEWithFallback({nowMs,reader:async()=>JSON.stringify({...feed,tles:[{line1:TLE1.replace('26329.50000000','26310.50000000'),line2:TLE2}]}),fetcher:async(url)=>{
    calls.push(url);return failure(503);
  }}),/Aucune donnée orbitale ISS récente/);
  assert.equal(calls.length,2);
});
test('CelesTrak disponible : ne sollicite aucun repli',async()=>{
  const calls=[];
  const result=await getTLEWithFallback({nowMs,reader:async()=>{throw Error('cache ne doit pas être lu');},fetcher:async(url)=>{calls.push(url);return okText(TLE1+'\n'+TLE2);}});
  assert.equal(result.source,'CelesTrak');
  assert.equal(calls.length,1);
});
test('TLE étranger à ISS rejeté, même si HTTP 200',async()=>{
  await assert.rejects(getTLEWithFallback({nowMs,reader:async()=>'{"schemaVersion":1,"tles":[]}',fetcher:async(url)=>{
    return url.includes('wheretheiss.at')?okText(JSON.stringify({line1:TLE1.replace('25544','33591'),line2:TLE2.replace('25544','33591')})):failure(503);
  }}),/Aucune donnée orbitale ISS récente/);
});

test('cache produit 25 minutes avant : aucune requête redondante à CelesTrak',async()=>{
  const recent={...feed,generatedAt:new Date(nowMs-25*60*1000).toISOString()};
  let calls=0;
  const result=await getTLEWithFallback({nowMs,reader:async()=>JSON.stringify(recent),fetcher:async()=>{calls++;throw Error('fetch inutile');}});
  assert.match(result.source,/Cache orbital ISS/);
  assert.equal(calls,0);
});
