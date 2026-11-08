import test from 'node:test';
import assert from 'node:assert/strict';
import {collectEvents,selectEvents,makeMessage,eventLine,sendToDiscord,generatedIsUsable} from '../scripts/discord-message-lib.mjs';
const e=(id,date,priority='interessant',more={})=>({id,date,title:'Rapprochement Lune / Jupiter',type:'conjonction',priority,visibility:'visible',period:'Aube',material:'Œil nu',description:'Test',source:{name:'Observatoire'},utc:null,precision:'date',kind:'',...more});
test('les événements invisibles sont écartés, les doublons stricts aussi',()=>{
 const evs=collectEvents([e('a','2026-11-07'),e('b','2026-11-07','majeur',{visibility:'invisible'})],[]);
 assert.equal(evs.length,1);assert.equal(evs[0].id,'a');
});
test('sélection aujourd’hui J+3 et majeurs à J+7 (Paris)',()=>{
 const now=new Date('2026-11-07T19:00:00Z');
 const evs=[e('d0','2026-11-07'),e('d1','2026-11-08'),e('d3','2026-11-10'),e('d4','2026-11-11','majeur'),e('d5','2026-11-12'),e('d8','2026-11-15','majeur')];
 const x=selectEvents(evs,now);
 assert.equal(x.today,'2026-11-07');assert.deepEqual(x.todayEvents.map(y=>y.id),['d0']);
 assert.deepEqual(x.nearEvents.map(y=>y.id),['d1','d3']);assert.deepEqual(x.majorEvents.map(y=>y.id),['d4']);
});
test('heure française après passage à l’heure d’été',()=>{
 const t=e('hr','2027-03-29','majeur',{utc:'2027-03-29T17:30:00Z',precision:'minute'});
 assert.match(eventLine(t),/19:30/);
});
test('la charge Discord respecte les limites et interdit les mentions',()=>{
 const es=Array.from({length:120},(_,i)=>e('ev'+i,'2026-11-07','majeur',{title:'@everyone **un événement particulièrement long** '+i+' x'.repeat(14)}));
 const payload=makeMessage(es,new Date('2026-11-07T09:00:00Z'));
 assert.deepEqual(payload.allowed_mentions,{parse:[]});
 assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));
 assert.ok(!JSON.stringify(payload).includes('@everyone'));
 assert.equal(payload.embeds[0].fields.length,2);
 assert.match(payload.content,/AGENDA COMPLET/);
 assert.ok(payload.content.includes('https://allsky.villageduciel.fr/Agenda-Astro/'));
});
test('webhook invalide interdit',async()=>{
 await assert.rejects(()=>sendToDiscord('https://example.com/not-webhook',{}),/Webhook/);
});
test('simulation de livraison valide',async()=>{
 let called=0;await sendToDiscord('https://discord.com/api/webhooks/123456789/a-long-secret', {content:'Essai'},async(_url,opts)=>{called++;assert.equal(opts.method,'POST');return {ok:true};});
 assert.equal(called,1);
});
test('catalogue calculé obsolète signalé',()=>{
 assert.equal(generatedIsUsable({automationActive:true,events:[e('x','2026-11-07')],generatedAt:'2025-01-01T00:00:00Z'},new Date('2026-11-07T00:00:00Z')),false);
});

test('sections aujourd’hui et demain bien séparées',()=>{
 const now=new Date('2026-11-08T07:00:00Z');
 const events=[e('aujourd','2026-11-08','interessant',{title:'Éclipse fictive'}),e('demain','2026-11-09','majeur',{type:'lune',kind:'nouvelle',title:'Nouvelle Lune'}),e('j2','2026-11-10')];
 const message=makeMessage(events,now);
 const fields=message.embeds[0].fields;
 assert.match(fields[0].name,/AUJOURD’HUI/);
 assert.match(fields[1].name,/DEMAIN/);
 assert.match(fields[0].value,/Éclipse fictive/);
 assert.doesNotMatch(fields[0].value,/Nouvelle Lune/);
 assert.match(fields[1].value,/Nouvelle Lune/);
 assert.match(message.content,/DEMAIN : 1 événement/);
 assert.doesNotMatch(fields[1].value,/MAJEUR/);
 assert.match(fields[2].name,/2 à 3 jours/);
 assert.match(fields[2].value,/Rapprochement/);
});
test('jour suivant correctement pris en compte au changement de jour parisien',()=>{
 const now=new Date('2026-11-08T23:30:00Z'); // 9 novembre 00:30 Paris
 const x=selectEvents([e('a','2026-11-09'),e('b','2026-11-10')],now);
 assert.equal(x.today,'2026-11-09');
 assert.deepEqual(x.todayEvents.map(e=>e.id),['a']);
 assert.deepEqual(x.tomorrowEvents.map(e=>e.id),['b']);
});
