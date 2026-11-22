import test from 'node:test';
import assert from 'node:assert/strict';
import {TransitEngine,parseTleText,haversineKm,validateLocation,orbitEpochFromLine1,AU_KM} from '../transit-core.mjs';
const A=6378.137;
const start=Date.UTC(2026,10,22,6,0,0),pass=start+67000;
const line1='1 25544U 98067A   26326.25000000  .00002998  00000-0  56789-4 0  9990';
const line2='2 25544  51.6433 300.0056 0004000 145.0000 200.0000 15.50000000 00001';
const toEcf=({latitude,longitude,height})=>{const lat=latitude,lon=longitude;return{x:(A+height)*Math.cos(lat)*Math.cos(lon),y:(A+height)*Math.cos(lat)*Math.sin(lon),z:(A+height)*Math.sin(lat)};};
const satellite={
 twoline2satrec:()=>({}),
 propagate:(_,date)=>({position:{x:A+420,y:(date.getTime()-pass)*.007,z:0}}),
 gstime:()=>0,
 eciToEcf:p=>p,
 geodeticToEcf:toEcf
};
const Astronomy={
 GeoVector:(body)=>({x:body==='Sun'?1:384400/AU_KM,y:0,z:0}),
 Rotation_EQJ_EQD:()=>({}),RotateVector:(_,v)=>v,SiderealTime:()=>0
};
const elements=parseTleText(line1+'\n'+line2);
test('Extraction du TLE ISS valide',()=>{
 assert.equal(elements.length,1);assert.equal(orbitEpochFromLine1(line1).slice(0,10),'2026-11-22');
});
test('Coordonnées et distances',()=>{
 assert.equal(validateLocation({lat:46.71815,lon:-.80121}).lat,46.71815);
 assert.ok(haversineKm({lat:0,lon:0},{lat:0,lon:1})>110);
 assert.throws(()=>validateLocation({lat:91,lon:0}),/hors limites/);
});
test('Alignement SGP4/astre simulé à la position exacte',async()=>{
 const eng=new TransitEngine(satellite,Astronomy,elements);
 const point=eng.shadow('sun',pass,0);
 assert.ok(point);assert.ok(Math.abs(point.lat)<.001);assert.ok(Math.abs(point.lon)<.001);
 const sep=eng.separation('sun',pass,{lat:0,lon:0,heightM:0});
 assert.ok(sep.angularSeparationDeg<.001);assert.ok(sep.radiusDeg>.2);
 const actual=await eng.search({location:{lat:0,lon:0,heightM:0},radiusKm:0,days:.02,kind:'sun',startMs:start});
 assert.equal(actual.length,1,JSON.stringify(actual));
 assert.ok(actual[0].durationMs>0&&actual[0].durationMs<5000);
 assert.ok(actual[0].bandDistanceKm<.1);
 assert.ok(Math.abs(Date.parse(actual[0].timeUtc)-pass)<1000);
});
test('Éviter les faux positifs de loin et éléments périmés',async()=>{
 const eng=new TransitEngine(satellite,Astronomy,elements);
 const far=await eng.search({location:{lat:42,lon:30},radiusKm:30,days:.02,kind:'sun',startMs:start});
 assert.equal(far.length,0);
 await assert.rejects(()=>eng.search({location:{lat:0,lon:0},radiusKm:0,days:1,startMs:Date.UTC(2027,0,1)}),/périmées/);
});
