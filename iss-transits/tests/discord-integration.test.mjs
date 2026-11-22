import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {addTransitsToDiscord} from '../../scripts/discord-transits.mjs';
const now=new Date('2026-11-22T08:00:00.000Z');
const container=()=>({flags:32768,components:[{type:10,content:'Bulletin'},{type:17,accent_color:12,components:[{type:10,content:'Météo'}]},{type:10,content:'Agenda complet'}]});
async function fixture(data,fn){const dir=await mkdtemp(join(tmpdir(),'vdc-iss-'));try{const path=join(dir,'data.json');await writeFile(path,JSON.stringify(data));await fn(path);}finally{await rm(dir,{recursive:true,force:true});}}
test('Encadré ISS inséré dans le bulletin sans toucher aux cartes existantes',async()=>{
 const event={kind:'moon',timeUtc:'2026-11-23T06:14:00.000Z',siteVisible:false,bandDistanceKm:3,durationMs:600};
 await fixture({schemaVersion:1,generatedAt:now.toISOString(),radiusKm:30,events:[event]},async path=>{
  const msg=container();await addTransitsToDiscord(msg,now,path);
  assert.equal(msg.components.length,4);
  assert.ok(msg.components[2].components[0].content.includes('Lunaire'));
  assert.equal(msg.components.at(-1).content,'Agenda complet');
 });
});
test('Catalogue périmé omis sans bloquer les autres rubriques',async()=>{
 await fixture({schemaVersion:1,generatedAt:'2026-11-19T00:00:00.000Z',radiusKm:30,events:[]},async path=>{
  const msg=container();await addTransitsToDiscord(msg,now,path);assert.equal(msg.components.length,3);
 });
});
test('Aucun transit valide : affiche une information honnête',async()=>{
 await fixture({schemaVersion:1,generatedAt:now.toISOString(),radiusKm:30,events:[]},async path=>{
  const msg=container();await addTransitsToDiscord(msg,now,path);
  assert.ok(msg.components[2].components[0].content.includes('Aucun transit ISS'));
 });
});
