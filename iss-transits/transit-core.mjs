/**
 * Village du Ciel — moteur de recherche des transits de l'ISS v1.0.
 * SGP4 (satellite.js) + astrométrie (Astronomy Engine), géométrie WGS84.
 * MÊME FICHIER pour navigateur et Node.js, sans accès réseau dans le cœur.
 * Prévisions indicatives : effet des manœuvres ISS et imprécisions TLE,
 * réfraction non modélisée. Toujours vérifier les 24 h précédentes.
 */
export const REAUMUR={lat:46.71815,lon:-0.80121,heightM:0,name:'Réaumur (85)'};
export const ORBIT_SOURCE='https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
export const SUP_ORBIT_SOURCE='https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=ISS&FORMAT=TLE';
export const AU_KM=149597870.7, RAD=Math.PI/180, DEG=180/Math.PI;
const DAY=86400000, A=6378.137, B=6356.752314245, RADIUS_KM={sun:695700,moon:1737.4};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const add=(p,q)=>({x:p.x+q.x,y:p.y+q.y,z:p.z+q.z});
const sub=(p,q)=>({x:p.x-q.x,y:p.y-q.y,z:p.z-q.z});
const scale=(p,v)=>({x:p.x*v,y:p.y*v,z:p.z*v});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const norm=a=>Math.sqrt(dot(a,a));
const unit=a=>scale(a,1/norm(a));
const validCoord=n=>Number.isFinite(n);
export const orbitEpochFromLine1=line=>{
 if(!/^1 25544/.test(line||''))throw Error('Identifiant TLE différent de celui de l’ISS (25544).');
 const yy=Number(line.slice(18,20)),day=Number(line.slice(20,32));
 if(!Number.isFinite(day)||day<1||day>=367)throw Error('Époque TLE illisible.');
 return new Date(Date.UTC(yy<57?2000+yy:1900+yy,0,1)+(day-1)*DAY).toISOString();
};
export function parseTleText(raw,source='CelesTrak'){
 const lines=String(raw).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const result=[];
 for(let i=0;i<lines.length;i++){
  if(!/^1 25544/.test(lines[i]))continue;
  const next=lines.slice(i+1,i+3).find(s=>/^2 25544/.test(s));
  if(!next)continue;
  try{result.push({line1:lines[i],line2:next,epoch:orbitEpochFromLine1(lines[i]),source});}catch{}
 }
 return normalizeTles(result);
}
export function normalizeTles(tles){
 if(!Array.isArray(tles))throw Error('Liste TLE absente.');
 const unique=new Map();
 for(const t of tles){
  if(!/^1 25544/.test(t?.line1||'')||!/^2 25544/.test(t?.line2||''))continue;
  try{const epoch=orbitEpochFromLine1(t.line1);unique.set(epoch,{line1:t.line1,line2:t.line2,epoch,source:t.source||'CelesTrak'});}catch{}
 }
 const xs=[...unique.values()].sort((a,b)=>a.epoch.localeCompare(b.epoch));
 if(xs.length===0)throw Error('Aucun jeu TLE ISS valide.');
 return xs;
}
export function validateLocation({lat,lon,heightM=0}){
 lat=Number(lat);lon=Number(lon);heightM=Number(heightM);
 if(!validCoord(lat)||!validCoord(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Latitude/longitude hors limites.');
 if(!validCoord(heightM)||heightM< -500||heightM>6000)throw Error('Altitude hors plage (-500 à 6000 m).');
 return {lat,lon,heightM};
}
export function haversineKm(a,b){
 const dlat=(b.lat-a.lat)*RAD,dlon=(b.lon-a.lon)*RAD;
 const q=Math.sin(dlat/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dlon/2)**2;
 return 2*6371.0088*Math.asin(Math.sqrt(clamp(q,0,1)));
}
function ecefToGeo(p,altM=0){
 // Géodésiques WGS84, altitude cible connue (intersection ellipsoïdale).
 const lon=Math.atan2(p.y,p.x),rho=Math.hypot(p.x,p.y),e2=1-(B/A)**2;
 let lat=Math.atan2(p.z,rho*(1-e2));
 for(let i=0;i<6;i++){
  const sn=Math.sin(lat),n=A/Math.sqrt(1-e2*sn*sn);
  lat=Math.atan2(p.z+e2*n*sn,rho);
 }
 return {lat:lat*DEG,lon:lon*DEG,heightM:altM};
}
function terrainIntersect(satelliteEcf,bodyEcf,altM=0){
 const direction=unit(sub(satelliteEcf,bodyEcf)); // trajectoire de l'ombre à partir de l'ISS
 const a=A+altM/1000,b=B+altM/1000;
 const c2=(direction.x**2+direction.y**2)/a**2+direction.z**2/b**2;
 const c1=2*((satelliteEcf.x*direction.x+satelliteEcf.y*direction.y)/a**2+satelliteEcf.z*direction.z/b**2);
 const c0=(satelliteEcf.x**2+satelliteEcf.y**2)/a**2+satelliteEcf.z**2/b**2-1;
 const discr=c1*c1-4*c2*c0;
 if(discr<=0)return null;
 const near=(-c1-Math.sqrt(discr))/(2*c2);
 if(near<=0)return null;
 return add(satelliteEcf,scale(direction,near));
}
function angleRad(a,b){
 // atan2(|a × b|,a·b) précis pour les angles de l'ordre de 0,001°.
 const cross={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
 return Math.atan2(norm(cross),dot(a,b));
}
function localUp({lat,lon}){const p=lat*RAD,l=lon*RAD;return{x:Math.cos(p)*Math.cos(l),y:Math.cos(p)*Math.sin(l),z:Math.sin(p)};}
function lookAngleDetails(p,ecef){
 const up=localUp(p),vec=sub(ecef,p.xyz),v=unit(vec);
 const east={x:-Math.sin(p.lon*RAD),y:Math.cos(p.lon*RAD),z:0};
 const north={x:-Math.sin(p.lat*RAD)*Math.cos(p.lon*RAD),y:-Math.sin(p.lat*RAD)*Math.sin(p.lon*RAD),z:Math.cos(p.lat*RAD)};
 return {altitudeDeg:Math.asin(clamp(dot(v,up),-1,1))*DEG,azimuthDeg:(Math.atan2(dot(v,east),dot(v,north))*DEG+360)%360};
}
export class TransitEngine{
 /** satellite = namespace satellite.js, Astro = namespace Astronomy Engine. */
 constructor(satellite,Astro,tles){
  if(!satellite?.propagate||!Astro?.GeoVector||!Astro?.RotateVector||!Astro?.SiderealTime)throw Error('Bibliothèques SGP4 ou Astronomy Engine manquantes.');
  this.satellite=satellite;this.Astro=Astro;
  this.tles=normalizeTles(tles);
  this.records=this.tles.map(t=>({...t,epochMs:Date.parse(t.epoch),rec:satellite.twoline2satrec(t.line1,t.line2)}));
 }
 closest(ms){
  const xs=this.records;
  let low=0,high=xs.length;
  while(low<high){const m=(low+high)>>1;if(xs[m].epochMs<ms)low=m+1;else high=m;}
  if(low===0)return xs[0];if(low===xs.length)return xs[xs.length-1];
  return ms-xs[low-1].epochMs<=xs[low].epochMs-ms?xs[low-1]:xs[low];
 }
 at(ms){
  const date=new Date(ms),orb=this.closest(ms);
  const state=this.satellite.propagate(orb.rec,date);
  if(!state?.position||!Number.isFinite(state.position.x))return null;
  const gmst=this.satellite.gstime(date);
  return {sat:this.satellite.eciToEcf(state.position,gmst),source:orb.source,epoch:orb.epoch,epochAgeHours:Math.abs(ms-orb.epochMs)/3600000};
 }
 bodyEcf(kind,ms){
  const date=new Date(ms),name=kind==='sun'?'Sun':'Moon';
  // GeoVector = géocentrique apparent EQJ (UA) ; précession + nutation vers EQD.
  // Rotation vers ECEF par le temps sidéral apparent de Greenwich (GAST).
  const geovec=this.Astro.GeoVector(name,date,true);
  const eqd=this.Astro.RotateVector(this.Astro.Rotation_EQJ_EQD(date),geovec);
  const gst=this.Astro.SiderealTime(date)*15*RAD;
  const c=Math.cos(gst),s=Math.sin(gst);
  return {x:(eqd.x*c+eqd.y*s)*AU_KM,y:(-eqd.x*s+eqd.y*c)*AU_KM,z:eqd.z*AU_KM};
 }
 shadow(kind,ms,altM=0){
  const state=this.at(ms);if(!state)return null;
  const body=this.bodyEcf(kind,ms);
  const ground=terrainIntersect(state.sat,body,altM);
  if(!ground)return null;
  const geo=ecefToGeo(ground,altM);
  const sunMoonLook=lookAngleDetails({...geo,xyz:ground},body);
  if(sunMoonLook.altitudeDeg<10)return null;
  return {...geo,point:ground,body,sat:state.sat,kind,ms,
   altitudeDeg:sunMoonLook.altitudeDeg,azimuthDeg:sunMoonLook.azimuthDeg,
   epochAgeHours:state.epochAgeHours,source:state.source,epoch:state.epoch};
 }
 separation(kind,ms,loc){
  const site=validateLocation(loc);
  const ecef=this.satellite.geodeticToEcf({latitude:site.lat*RAD,longitude:site.lon*RAD,height:site.heightM/1000});
  const orbit=this.at(ms);if(!orbit)return null;
  const body=this.bodyEcf(kind,ms);
  const svec=sub(orbit.sat,ecef),bvec=sub(body,ecef);
  const ang=angleRad(unit(svec),unit(bvec));
  const radiusRad=Math.asin(clamp(RADIUS_KM[kind]/norm(bvec),0,1));
  const angles=lookAngleDetails({...site,xyz:ecef},body);
  return {angularSeparationDeg:ang*DEG,radiusDeg:radiusRad*DEG,deltaRad:ang-radiusRad,
   altitudeDeg:angles.altitudeDeg,azimuthDeg:angles.azimuthDeg,rangeKm:norm(svec)};
 }
 halfWidthKm(kind,point){
  const center={lat:point.lat,lon:point.lon,heightM:point.heightM};
  const angular=this.separation(kind,point.ms,center);if(!angular)return 0;
  // Gradient topocentrique local de l'écart angulaire (décalage 1 km N/E).
  const alongNorth={...center,lat:clamp(center.lat+1/111.2,-89.999,89.999)};
  const alongEast={...center,lon:((center.lon+1/(111.2*Math.max(.02,Math.cos(center.lat*RAD)))+540)%360)-180};
  const n=this.separation(kind,point.ms,alongNorth);
  const e=this.separation(kind,point.ms,alongEast);
  if(!n||!e)return 0;
  const grad=Math.hypot(n.angularSeparationDeg,e.angularSeparationDeg);
  // Au centre l'écart est 0 : ces dérivées sont des normes, pas des dérivées signées.
  return grad>1e-8?clamp(angular.radiusDeg/grad,0,75):0;
 }
 duration(kind,point){
  const loc={lat:point.lat,lon:point.lon,heightM:point.heightM};
  const center=this.separation(kind,point.ms,loc);
  if(!center||center.deltaRad>=0)return null;
  const solve=direction=>{
   let lo=0,hi=100; // 100 millisecondes pour un premier test
   const f=s=>this.separation(kind,point.ms+direction*s,loc)?.deltaRad??1;
   while(hi<20000 && f(hi)<0){lo=hi;hi*=2;}
   if(f(hi)<0)return null;
   for(let k=0;k<20;k++){const mid=(lo+hi)/2;if(f(mid)<0)lo=mid;else hi=mid;}
   return point.ms+direction*(lo+hi)/2;
  };
  const start=solve(-1),end=solve(1);
  if(start==null||end==null||end<=start)return null;
  return {startUtc:new Date(start).toISOString(),endUtc:new Date(end).toISOString(),durationMs:Math.round(end-start)};
 }
 async search(options={},progress=()=>{}){
  const location=validateLocation(options.location||REAUMUR);
  const radiusKm=Number(options.radiusKm??30),days=Number(options.days??5);
  if(!Number.isFinite(radiusKm)||radiusKm<0||radiusKm>100)throw Error('Rayon autorisé : 0 à 100 km.');
  if(!Number.isFinite(days)||days<.01||days>7)throw Error('Période maximale : 7 jours (précision orbitale).');
  const kind=options.kind||'both';if(!['sun','moon','both'].includes(kind))throw Error('Type de transit invalide.');
  const kinds=kind==='both'?['sun','moon']:[kind];
  const startMs=options.startMs??Date.now(),endMs=startMs+days*DAY;
  const dataAgeHours=Math.min(...this.records.map(r=>Math.abs(startMs-r.epochMs)/3600000));
  if(dataAgeHours>72)throw Error(`Données ISS périmées : ${Math.round(dataAgeHours)} h. Actualiser les TLE avant de calculer.`);
  const stepMs=10000;const nSteps=Math.ceil((endMs-startMs)/stepMs);
  const list=[];const previous=new Map();const possible=[];
  // D'abord trajectoire de l'ombre géographique à pas de 10 s ;
  // test de distance point-segment : ne manque pas un passage entre deux échantillons.
  for(let i=0;i<=nSteps;i++){
   if(options.signal?.aborted)throw Error('Calcul interrompu.');
   const t=Math.min(endMs,startMs+i*stepMs);
   const orbit=this.at(t);
   if(!orbit){previous.clear();continue;}
   for(const body of kinds){
    const bodyVector=this.bodyEcf(body,t),position=terrainIntersect(orbit.sat,bodyVector,location.heightM);
    let point=null;
    if(position){
     const geo=ecefToGeo(position,location.heightM);
     const elevation=lookAngleDetails({...geo,xyz:position},bodyVector).altitudeDeg;
     if(elevation>=10)point={...geo,ms:t};
    }
    const prev=previous.get(body);
    if(point&&prev){
     const trackKm=haversineKm(point,prev);
     // Éviter les segments au travers de la planète ou d'un horizon discontinu.
     if(trackKm<550){
      const s=segmentDistanceKm(location,prev,point);
      if(s<=radiusKm+90)possible.push({body,t0:prev.ms,t1:t,estimate:s});
     }
    }
    if(point)previous.set(body,point);else previous.delete(body);
   }
   if(i%800===0){progress(Math.min(1,i/nSteps));if(options.yieldControl)await options.yieldControl();}
  }
  progress(1);
  // Grouper les segments d'une même traversée ; chercher le moment le plus proche.
  for(const body of kinds){
   let candidates=possible.filter(p=>p.body===body).sort((a,b)=>a.t0-b.t0);
   const groups=[];
   for(const p of candidates){const last=groups.at(-1);if(last&&p.t0<=last.t1+stepMs){last.t1=Math.max(last.t1,p.t1);last.estimate=Math.min(last.estimate,p.estimate);}else groups.push({...p});}
   for(const g of groups){
    if(options.signal?.aborted)throw Error('Calcul interrompu.');
    let best=null;
    // Plusieurs minima éventuels : évaluer chaque intervalle de 10 s.
    for(let a=g.t0;a<g.t1;a+=stepMs){
     const b=Math.min(a+stepMs,g.t1);
     const phi=.6180339887498949;
     let lo=a,hi=b,c=hi-(hi-lo)*phi,d=lo+(hi-lo)*phi;
     const evalAt=t=>{const q=this.shadow(body,t,location.heightM);return q?{point:q,dist:haversineKm(location,q)}:{point:null,dist:Infinity};};
     let ec=evalAt(c),ed=evalAt(d);
     for(let z=0;z<20;z++){
      if(ec.dist<ed.dist){hi=d;d=c;ed=ec;c=hi-(hi-lo)*phi;ec=evalAt(c);}
      else {lo=c;c=d;ec=ed;d=lo+(hi-lo)*phi;ed=evalAt(d);}
     }
     const e=ec.dist<ed.dist?ec:ed;
     if(e.point && (!best||e.dist<best.dist))best=e;
    }
    if(!best)continue;
    const central=best.point;
    const halfWidth=this.halfWidthKm(body,central);
    const borderDist=Math.max(0,best.dist-halfWidth);
    if(borderDist>radiusKm)continue;
    const transit=this.duration(body,central);if(!transit)continue;
    const observed=this.separation(body,central.ms,location);
    const visibleAtSite=observed&&observed.deltaRad<=0&&observed.altitudeDeg>=10;
    const event={kind:body,timeUtc:new Date(central.ms).toISOString(),
      startUtc:transit.startUtc,endUtc:transit.endUtc,durationMs:transit.durationMs,
      siteVisible:Boolean(visibleAtSite),center:{lat:Number(central.lat.toFixed(6)),lon:Number(central.lon.toFixed(6))},
      observer:{lat:location.lat,lon:location.lon,heightM:location.heightM},
      centerDistanceKm:Number(best.dist.toFixed(2)),bandDistanceKm:Number(borderDist.toFixed(2)),
      halfWidthKm:Number(halfWidth.toFixed(2)),altitudeDeg:Number(central.altitudeDeg.toFixed(1)),azimuthDeg:Number(central.azimuthDeg.toFixed(1)),
      orbitEpoch:central.epoch,orbitAgeHours:Math.round(central.epochAgeHours),source:central.source,
      quality:central.epochAgeHours<=24?'rapprochée':central.epochAgeHours<=72?'provisoire':'veille',
      path:[]};
    // Tracé géographique local autour du point de transit (aucune fausse bande sur carte).
    for(let dt=-20000;dt<=20000;dt+=1000){
     const p=this.shadow(body,central.ms+dt,location.heightM);
     if(p&&haversineKm(p,central)<250)event.path.push([Number(p.lat.toFixed(5)),Number(p.lon.toFixed(5))]);
    }
    if(!list.some(x=>x.kind===event.kind&&Math.abs(Date.parse(x.timeUtc)-central.ms)<90000))list.push(event);
   }
  }
  return list.sort((a,b)=>a.timeUtc.localeCompare(b.timeUtc));
 }
}
function segmentDistanceKm(ref,p1,p2){
 // Projection tangentielle locale utilisable sur de courts segments (<550 km).
 const kx=111.195*Math.max(.04,Math.cos(ref.lat*RAD)),ky=111.195;
 const wrap=d=>((d+540)%360)-180;
 const x1=wrap(p1.lon-ref.lon)*kx,y1=(p1.lat-ref.lat)*ky;
 const x2=wrap(p2.lon-ref.lon)*kx,y2=(p2.lat-ref.lat)*ky;
 const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;
 const u=L>0?clamp(-(x1*dx+y1*dy)/L,0,1):0;
 return Math.hypot(x1+u*dx,y1+u*dy);
}
