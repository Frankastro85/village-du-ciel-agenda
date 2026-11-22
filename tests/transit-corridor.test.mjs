import test from 'node:test';
import assert from 'node:assert/strict';
import {TransitEngine,parseTleText,AU_KM} from '../transit-core.mjs';

// Cas de test SIMULÉ : soleil bas (14,3°), projection oblique de la
// trajectoire ISS. Reproduit l'erreur de V1.1 (coupe à heure fixe).
const A=6378.137;
const pass=Date.UTC(2026,10,22,6,1,7);
const elev=14.3*Math.PI/180;
const sun={x:AU_KM*Math.sin(elev),y:0,z:AU_KM*Math.cos(elev)};
const tle1='1 25544U 98067A   26326.25000000  .00002998  00000-0  56789-4 0  9990';
const tle2='2 25544  51.6433 300.0056 0004000 145.0000 200.0000 15.50000000 00001';
const astro={GeoVector:()=>({x:sun.x/AU_KM,y:0,z:sun.z/AU_KM}),Rotation_EQJ_EQD:()=>({}),RotateVector:(_,v)=>v,SiderealTime:()=>0};
const sat={
 twoline2satrec:()=>({}),
 propagate:(_,d)=>{const dt=d.getTime()-pass;return{position:{x:A+420*Math.sin(elev),y:dt*.007,z:420*Math.cos(elev)-dt*.002}};},
 gstime:()=>0,eciToEcf:v=>v,
 geodeticToEcf:({latitude,longitude,height})=>({x:(A+height)*Math.cos(latitude)*Math.cos(longitude),y:(A+height)*Math.cos(latitude)*Math.sin(longitude),z:(A+height)*Math.sin(latitude)})
};
const eng=new TransitEngine(sat,astro,parseTleText(tle1+'\n'+tle2));

test('une bande oblique correspond aux minima temporels et à la visibilité GPS',()=>{
 const p=eng.shadow('sun',pass,0);
 assert.ok(p);
 const edges=eng.corridorEdges('sun',p,22);
 assert.ok(edges);
 assert.ok(edges.widthKm>14.5&&edges.widthKm<16.5,`largeur attendue ~15,2 km, obtenue ${edges.widthKm}`);
 const along=(factor)=>({lat:p.lat+factor*(edges.right.lat-p.lat),lon:p.lon+factor*(edges.right.lon-p.lon),heightM:0});
 const inside=along(.95),outside=along(1.06);
 const near=eng.closestApproach('sun',pass,inside);
 const far=eng.closestApproach('sun',pass,outside);
 assert.ok(near.deltaRad<0,'la position à 95 % de la demi-largeur est dans la bande');
 assert.ok(far.deltaRad>0,'la position à 106 % de la demi-largeur est hors de la bande');
 assert.ok(eng.transitAt('sun',pass,inside),'durée du transit détectée dans la bande');
 assert.equal(eng.transitAt('sun',pass,outside),null,'aucune durée hors de la bande');
 const fixed=eng.separation('sun',pass,inside);
 assert.ok(fixed.deltaRad>0,'l’ancien test à heure fixe excluait à tort ce site : régression reproduite');
});
