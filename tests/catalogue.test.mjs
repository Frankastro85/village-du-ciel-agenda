import test from 'node:test';
import assert from 'node:assert/strict';
import {parisDay,parseUSNOTime,moonPhaseEvent,seasonEvent,meteorWindowEvents,addDays} from '../scripts/catalogue-lib.mjs';

test('conversion France avec changement de jour et d’heure été/hiver',()=>{
  assert.equal(parisDay('2027-03-28T22:30:00Z'),'2027-03-29');
  assert.equal(parisDay('2027-01-01T23:30:00Z'),'2027-01-02');
  assert.equal(addDays('2026-12-28',10),'2027-01-07');
});
test('USNO New Moon et instant UTC exact',()=>{
  const e=moonPhaseEvent({year:2027,month:1,day:7,time:'20:24',phase:'New Moon'});
  assert.equal(e.title,'Nouvelle Lune');assert.equal(e.kind,'nouvelle');
  assert.equal(e.utc,'2027-01-07T20:24:00.000Z');
  assert.equal(e.date,'2027-01-07');assert.equal(e.type,'lune');
});
test('saison depuis éphéméride USNO',()=>{
  const e=seasonEvent({year:2027,month:3,day:20,time:'20:25',phenom:'Equinox'});
  assert.equal(e.title,'Équinoxe de printemps');assert.equal(e.date,'2027-03-20');
});
test('essaims marqués comme repères non annuels',()=>{
  const ev=meteorWindowEvents('2026-12-01','2027-01-31');
  assert.ok(ev.some(x=>x.title.includes('Géminides')));
  assert.ok(ev.some(x=>x.title.includes('Quadrantides')));
  assert.ok(ev.every(x=>x.precision==='date'&&x.utc===null));
});
test('horodatage incorrect rejeté',()=>{
  assert.equal(parseUSNOTime({year:2027,month:1,day:7,time:'bad'}),null);
});
