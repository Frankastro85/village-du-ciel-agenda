import assert from 'node:assert/strict';
import {plannerURL,parsePlanner,cometCandidates,parseRSS,parseOccultationYear,mergeCandidates} from '../scripts/veille-rares-lib.mjs';
const site={id:'vendee',lat:46.87,lon:-1.01};
assert.match(plannerURL(site,'2026-11-09'),/lim_mag=6.5/);
const cobs=(name='C/2026 A1',mag=4.6)=>({signature:{source:'COBS Query API',version:'1.3'},comet_list:[{
  comet_fullname:name,mpc_name:'K26A010',magnitude:mag,best_alt:40,sun_elongation:90,best_time:'2026-11-09 21:00',orbit_calc_source:1
}]});
const comet=parsePlanner(cobs());assert.equal(comet.length,1);
let found=cometCandidates(new Map([['vendee',[]],['cadix',comet]]),'2026-11-09');
assert.equal(found.length,1);assert.equal(found[0].validation,'unverified');
found=cometCandidates(new Map([['vendee',comet],['cadix',comet]]),'2026-11-09');
assert.equal(found.length,0,'Une comète observable aux Herbiers est exclue de la liste ailleurs');
assert.equal(cometCandidates(new Map([['cadix',parsePlanner(cobs('C/2026 A1',8.1))]]),'2026-11-09').length,0);
const html='<html><body><table><tr><td>24 May</td><td><a href="/lunar-occultations/2027-05-24-nunki">Nunki</a></td><td>2.1</td></tr></table></body></html>';
assert.equal(parseOccultationYear(html,'2026-11-09','2027-11-09').length,1);
assert.equal(parseOccultationYear(html,'2028-01-01','2029-01-01').length,0);
const rss=`<?xml version="1.0"?><rss version="2.0"><channel><item><title>Bright comet visible from the sky</title><link>https://example.org/astronomy/comet</link><pubDate>Mon, 09 Nov 2026 09:00:00 GMT</pubDate><description>Comet observing forecast</description></item></channel></rss>`;
assert.equal(parseRSS(rss,'Exemple',new Date('2026-11-09T12:00:00Z')).length,1);
const first=mergeCandidates([],cometCandidates(new Map([['vendee',[]],['cadix',comet]]),'2026-11-09'),new Date('2026-11-09T12:00:00Z'));
const second=mergeCandidates(first,first,new Date('2026-11-16T12:00:00Z'));
assert.equal(second.length,1);assert.equal(second[0].firstSeen,'2026-11-09');assert.equal(second[0].lastSeen,'2026-11-16');
console.log('Veille rare : 9 contrôles OK (COBS, comparateur Vendée, occultations, RSS, fusion).');
