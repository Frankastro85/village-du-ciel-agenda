import assert from 'node:assert/strict';
import {plannerURL,parsePlanner,cometCandidates,parseOccultationYear,importantOccultationSlug,eligible,mergeCandidates,publicComets} from '../scripts/veille-rares-lib.mjs';

const site={id:'vendee',lat:46.87,lon:-1.01};
assert.match(plannerURL(site,'2026-11-09'),/lim_mag=9.99/);
assert.match(plannerURL(site,'2026-11-09'),/filter=1/);
const pack=(mag,name='C/2026 ABC')=>({signature:{source:'COBS Query API',version:'1.3'},comet_list:[{
  comet_fullname:name,mpc_name:'K26Z001',magnitude:mag,best_alt:35,sun_elongation:60,best_time:'2026-11-09 22:00',orbit_calc_source:1}]});
assert.equal(parsePlanner(pack(9.99)).length,1);
assert.equal(parsePlanner(pack(10.0)).length,0,'magnitude 10 exclue');
assert.equal(parsePlanner(pack(10.5)).length,0);
assert.equal(parsePlanner(pack(null)).length,0,'magnitude nulle ne signifie pas 0');
const c=parsePlanner(pack(9.2));
let a=cometCandidates(new Map([['vendee',c]]),'2026-11-09');
assert.equal(a.length,1,'Comète visible aux Herbiers incluse dans la veille');
assert.equal(a[0].sourceData.magnitude,9.2);
assert.equal(a[0].sourceData.vendeeInPlanner,true);
assert.ok(eligible(a[0]));
const html=`<html><table>
<tr><td>4 Jan</td><td><a href="/lunar-occultations/2027-01-04-antares">Antares</a></td><td>1.1</td><td>9%</td><td>—</td></tr>
<tr><td>8 Jan</td><td><a href="/lunar-occultations/2027-01-08-mercury">Mercury</a></td><td>-1.0</td><td>1%</td><td>—</td></tr>
<tr><td>18 Jan</td><td><a href="/lunar-occultations/2027-01-18-alcyone">Alcyone</a></td><td>2.9</td><td>97%</td><td>—</td></tr>
<tr><td>24 May</td><td><a href="/lunar-occultations/2027-05-24-nunki">Nunki</a></td><td>2.1</td><td>80%</td><td>—</td></tr>
<tr><td>25 May</td><td><a href="/lunar-occultations/2027-05-25-rarestar">Star</a></td><td>1.8</td><td>20%</td><td>—</td></tr>
</table></html>`;
const occ=parseOccultationYear(html,'2026-11-09','2027-11-09');
assert.equal(occ.length,3,'Seulement les objets remarquables retenus');
assert.ok(occ.every(eligible));
assert.ok(importantOccultationSlug('2027-01-04-antares'));
assert.ok(!importantOccultationSlug('2027-05-24-nunki',2.1));
assert.ok(!importantOccultationSlug('2027-01-18-alcyone',2.9));
assert.equal(parseOccultationYear(html,'2028-01-01','2029-01-01').length,0);
const before=mergeCandidates([],a,new Date('2026-11-09T12:00:00Z'));
assert.equal(before.length,1);
assert.equal(mergeCandidates(before,a,new Date('2026-11-16T12:00:00Z')).length,1);
const old=[{...a[0],sourceData:{...a[0].sourceData,magnitude:10}}];
assert.equal(mergeCandidates(old,[],new Date('2026-11-09T12:00:00Z')).length,0);
const olderOcc=[{...occ[0],sourceData:{slug:'2027-01-04-antares'},lastSeen:'2026-11-08'}];
assert.equal(mergeCandidates(olderOcc,[],new Date('2026-11-09T12:00:00Z'))[0].sourceData.importance,'majeure');
console.log('Veille du club : filtres de magnitude <10, occultations majeures, validité géographique non déduite, fusion OK.');

const local=new Map([['2026-11-09',parsePlanner(pack(9.2))],['2026-11-16',parsePlanner(pack(9.7))]]);
const publicList=publicComets(local,new Date('2026-11-09T00:00:00Z'));
assert.equal(publicList.length,1);
assert.equal(publicList[0].samples.length,2);
assert.equal(publicList[0].firstSample,'2026-11-09');
assert.equal(publicList[0].lastSample,'2026-11-16');
const absent=publicComets(new Map([['2026-11-09',parsePlanner(pack(10))]]),new Date('2026-11-09T12:00:00Z'));
assert.equal(absent.length,0,'Magnitude >=10 jamais publiée');
const tooLow=publicComets(new Map([['2026-11-09', [{...c[0],altitude:12}]]]),new Date('2026-11-09T12:00:00Z'));
assert.equal(tooLow.length,0,'Comète basse non retenue');
console.log('Catalogue cométaire séparé : seuils, dates multiples et visibilité locale simulée OK.');
