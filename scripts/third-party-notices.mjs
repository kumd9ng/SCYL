import {readFile,writeFile} from 'node:fs/promises';
const packages=['@capacitor/core','@capacitor/android','@capacitor/ios','@capacitor/app','@capacitor/share','@capacitor/filesystem','@capacitor/synapse','@supabase/supabase-js','@supabase/auth-js','@supabase/functions-js','@supabase/postgrest-js','@supabase/realtime-js','@supabase/storage-js','@supabase/phoenix','iceberg-js','tslib','@supabase/auth-js/node_modules/tslib'];
const sections=['SCYL — Third-party runtime notices'];
for(const name of packages){
 const root=new URL('../node_modules/'+name+'/',import.meta.url);
 const meta=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 let license;
 for(const file of ['LICENSE','LICENSE.md','LICENSE.txt']){
   try{license=await readFile(new URL(file,root),'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(!license)throw new Error('Missing runtime license: '+name);
 sections.push(`${meta.name} ${meta.version}\n\n${license.trim()}`);
}
await writeFile(new URL('../assets/third-party-notices.txt',import.meta.url),sections.join('\n\n--------------------\n\n')+'\n');
console.log('Runtime license notices included with application assets.');
