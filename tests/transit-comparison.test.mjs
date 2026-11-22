import test from 'node:test';
import assert from 'node:assert/strict';
import {TransitEngine,parseTleText,AU_KM} from '../transit-core.mjs';
const A=6378.137, start=Date.UTC(2026,10,22,6,0,0), pass=start+67000;
const line1='1 25544U 98067A   26326.25000000  .00002998  00000-0  56789-4 0  9990';
const line2='2 25544  51.6433 300.0056 0004000 145.0000 200.0000 15.50000000 00001';
const satellite={
 twoline2satrec:()=>({}),
 propagate:(_,date)=>({position:{x:A+420,y:(date.getTime()-pass)*.007,z:0}}),
 gstime:()=>0,eciToEcf:p=>p,
 geodeticToEcf:({latitude,longitude,height})=>({x:(A+height)*Math.cos(latitude)*Math.cos(longitude),y:(A+height)*Math.cos(latitude)*Math.sin(longitude),z:(A+height)*Math.sin(latitude)})
};
const Astronomy={GeoVector:()=>({x:1,y:0,z:0}),Rotation_EQJ_EQD:()=>({}),RotateVector:(_,v)=>v,SiderealTime:()=>0};
const elements=parseTleText(line1+'\n'+line2);
test('la largeur est calculée perpendiculairement et les durées distinguent centre et lieu',async()=>{
 const eng=new TransitEngine(satellite,Astronomy,elements);
 const center=eng.shadow('sun',pass,0);
 assert.ok(center);
 const half=eng.halfWidthKm('sun',center);
 const expected=420*Math.tan(Math.asin(695700/AU_KM));
 assert.ok(Math.abs(half-expected)<.3,`half=${half}km attendu=${expected}km`);
 const edges=eng.corridorEdges('sun',center);
 assert.ok(edges&&edges.widthKm>0);
 assert.ok(Math.abs(edges.widthKm-2*expected)<.6);
 const offsetLoc={lat:.009,lon:0,heightM:0}; // ~1 km de la ligne centrale
 const events=await eng.search({location:offsetLoc,radiusKm:0,days:.02,kind:'sun',startMs:start});
 assert.equal(events.length,1);
 assert.ok(events[0].siteVisible);
 assert.ok(events[0].siteTransit?.durationMs>0);
 assert.ok(events[0].siteTransit.durationMs<events[0].durationMs);
 assert.ok(events[0].siteTransit.chordArcmin<2*eng.separation('sun',pass,offsetLoc).radiusDeg*60);
 assert.ok(events[0].path.length>=4);
 assert.equal(events[0].leftPath.length,events[0].path.length);
 assert.equal(events[0].rightPath.length,events[0].path.length);
 const far=await eng.search({location:{lat:.045,lon:0,heightM:0},radiusKm:0,days:.02,kind:'sun',startMs:start});
 assert.equal(far.length,0,'à 5 km hors bande : pas de transit local');
});
