import {readFile,writeFile} from 'node:fs/promises';
const packages=['@capacitor/core','@capacitor/android','@capacitor/ios','@capacitor/app','@capacitor/share','@capacitor/filesystem'];
const sections=['SCYL — Third-party runtime notices'];
for(const name of packages){
 const root=new URL('../node_modules/'+name+'/',import.meta.url);
 const meta=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 const license=await readFile(new URL('LICENSE',root),'utf8');
 sections.push(`${name} ${meta.version}\n\n${license.trim()}`);
}
await writeFile(new URL('../assets/third-party-notices.txt',import.meta.url),sections.join('\n\n--------------------\n\n')+'\n');
console.log('Runtime license notices included with application assets.');
