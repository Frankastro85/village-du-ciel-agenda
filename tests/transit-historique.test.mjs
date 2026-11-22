/**
 * Tests de non-régression sur une date historique, sans prétendre reproduire
 * la trajectoire réelle de l'ISS. Les positions sont synthétiques et maîtrisées.
 * Pour confronter les chiffres d'ISS Transit Finder, utiliser des TLE historiques
 * contemporains de l'événement, importables depuis l'interface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {TransitEngine,AU_KM,parseTleText,validateLocation} from '../transit-core.mjs';

const A=6378.137;
const nominal=Date.UTC(2026,10,23,14,23,43,510); // 15:23:43,51 à Paris
const radians=d=>d*Math.PI/180;
const elev=radians(39.3);
const sunElevation=radians(14.3);
const earthTo={
 sun:{x:Math.sin(sunElevation)*AU_KM,y:0,z:Math.cos(sunElevation)*AU_KM},
 moon:{x:Math.sin(elev)*384400,y:0,z:Math.cos(elev)*384400}
};
const tle1='1 25544U 98067A   26327.59981030  .00002998  00000-0  56789-4 0  9990';
const tle2='2 25544  51.6433 300.0056 0004000 145.0000 200.0000 15.50000000 00001';
function fixture(kind){
 const body=earthTo[kind];
 const astro={
  GeoVector:()=>({x:body.x/AU_KM,y:0,z:body.z/AU_KM}),
  Rotation_EQJ_EQD:()=>({}),RotateVector:(_,v)=>v,SiderealTime:()=>0
 };
 const sat={
  twoline2satrec:()=>({}),
  propagate:(_,date)=>{
   const dt=date.getTime()-nominal;
   return {position:{x:A+420*Math.sin(kind==='sun'?sunElevation:elev),y:dt*.007,z:420*Math.cos(kind==='sun'?sunElevation:elev)-dt*.002}};
  },
  gstime:()=>0,eciToEcf:v=>v,
  geodeticToEcf:({latitude,longitude,height})=>({x:(A+height)*Math.cos(latitude)*Math.cos(longitude),y:(A+height)*Math.cos(latitude)*Math.sin(longitude),z:(A+height)*Math.sin(latitude)})
 };
 return new TransitEngine(sat,astro,parseTleText(tle1+'\n'+tle2));
}

test('23 novembre 2026, test simulé du transit lunaire au centre',()=>{
 const eng=fixture('moon'),point=eng.shadow('moon',nominal,0);
 assert.ok(point,'intersection terrain Lune/ISS');
 const location={lat:point.lat,lon:point.lon,heightM:0};
 const result=eng.transitAt('moon',nominal,location);
 assert.ok(result,'la géométrie simulée doit contenir un transit lunaire');
 assert.ok(result.durationMs>0&&result.durationMs<6000,'durée plausible, pas une valeur copiée du comparateur');
 assert.ok(Math.abs(Date.parse(result.timeUtc)-nominal)<800,'temps minimal autour de la conjonction simulée');
 const edges=eng.corridorEdges('moon',point);
 assert.ok(edges?.widthKm>0,'deux bords calculés sur le disque lunaire');
 const outside={lat:point.lat+2*(edges.right.lat-point.lat),lon:point.lon+2*(edges.right.lon-point.lon),heightM:0};
 assert.equal(eng.transitAt('moon',nominal,outside),null,'site hors du couloir lunaire');
});

test('date historique explicite : le test orbital ne doit pas se servir de maintenant',async()=>{
 const eng=fixture('sun');
 const center=eng.shadow('sun',nominal,0);
 assert.ok(center);
 const events=await eng.search({location:{lat:center.lat,lon:center.lon,heightM:0},radiusKm:10,days:.01,kind:'sun',startMs:nominal-4*60*1000});
 assert.equal(events.length,1,'un transit solaire simulé le 23 novembre');
 assert.ok(events[0].siteVisible,'calcul au GPS sur place');
 assert.ok(events[0].siteTransit.durationMs>0);
 assert.equal(events[0].orbitEpoch.slice(0,10),'2026-11-23');
 assert.equal(events[0].path.length,11,'tracé du centre de bande');
 assert.equal(events[0].leftPath.length,events[0].rightPath.length,'bords correspondants');
});

test('TLE trop ancien pour une date de contrôle : rejet explicite',async()=>{
 const eng=fixture('sun');
 await assert.rejects(eng.search({startMs:Date.UTC(2027,0,1),days:1,kind:'sun'}),/archivés proches/);
 assert.throws(()=>validateLocation({lat:91,lon:0,heightM:0}),/hors limites/);
});
