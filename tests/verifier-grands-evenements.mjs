import fs from 'node:fs';
const p='docs/grands-evenements.json';
const doc=JSON.parse(fs.readFileSync(p,'utf8'));
function assert(cond,text){if(!cond) throw new Error(text);}
assert(doc.schema===1,'Schéma JSON invalide');
assert(Number.isFinite(Date.parse(doc.generatedAt)),'Horodatage invalide');
assert(Array.isArray(doc.events)&&doc.events.length<=300,'Liste invalide');
const ids=new Set();
for(const e of doc.events){
  assert(typeof e.id==='string'&&!ids.has(e.id),'ID manquant ou en doublon');ids.add(e.id);
  assert(/^20\d\d-\d\d-\d\d$/.test(e.date),'Date invalide');
  assert(e.reviewStatus==='verified','Événement non vérifié publié');
  for(const key of ['title','category','vendee','region','timing','observation'])assert(typeof e[key]==='string'&&e[key].length>0,'Champ manquant '+key);
  assert(Array.isArray(e.practical)&&Array.isArray(e.places)&&Array.isArray(e.sources),'Données de fiche incomplètes');
  for(const s of e.sources)assert(/^https:\/\//.test(s.url),'Source non HTTPS');
  for(const pl of e.places)assert(Number.isFinite(pl.lat)&&Number.isFinite(pl.lon)&&Math.abs(pl.lat)<=90&&Math.abs(pl.lon)<=180,'Coordonnées invalides');
}
console.log('Catalogue grands événements valide :',doc.events.length,'événements');
