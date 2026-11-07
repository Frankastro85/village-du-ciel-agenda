import * as Astronomy from 'astronomy-engine';
import {mkdir,writeFile} from 'node:fs/promises';
import {generateCatalogue} from './catalogue-lib.mjs';
const catalogue=await generateCatalogue({A:Astronomy,now:new Date()});
if(catalogue.events.length<30)throw new Error(`Catalogue trop réduit (${catalogue.events.length}). Publication refusée.`);
await mkdir('docs',{recursive:true});
await writeFile('docs/catalogue.json',JSON.stringify(catalogue,null,2)+'\n','utf8');
console.log(`${catalogue.events.length} événements — du ${catalogue.period.start} au ${catalogue.period.end}`);
if(catalogue.warnings.length)console.warn('Secours API :',catalogue.warnings.join('; '));
