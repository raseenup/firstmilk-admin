/* Preserve the Capacitor-generated components and set the portal's Android data policy. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const main=fileURLToPath(new URL('../android/app/src/main/',import.meta.url));
const manifest=path.join(main,'AndroidManifest.xml');
const original=await readFile(manifest,'utf8');
const tags=original.match(/<application\b[^>]*>/g);
if(tags?.length!==1)throw new Error('Expected one Android application element.');
let tag=tags[0];
for(const [name,value] of Object.entries({
  allowBackup:'false',fullBackupContent:'false',dataExtractionRules:'@xml/fmv_data_extraction',
  usesCleartextTraffic:'false',networkSecurityConfig:'@xml/fmv_network_security'
})){
  const attribute=new RegExp('\\sandroid:'+name+'\\s*=\\s*(?:"[^"]*"|\\x27[^\\x27]*\\x27)','g');
  tag=tag.replace(attribute,'').replace(/>$/,'\n        android:'+name+'="'+value+'">');
}
const xml=path.join(main,'res','xml');
await mkdir(xml,{recursive:true});
await writeFile(path.join(xml,'fmv_network_security.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false" />\n</network-security-config>\n');
const domains=['root','file','database','sharedpref','external','device_root','device_file','device_database','device_sharedpref'];
const exclude=domains.map(d=>'    <exclude domain="'+d+'" path="." />').join('\n');
await writeFile(path.join(xml,'fmv_data_extraction.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n'+exclude+
  '\n  </cloud-backup>\n  <device-transfer>\n'+exclude+'\n  </device-transfer>\n</data-extraction-rules>\n');
await writeFile(manifest,original.replace(tags[0],()=>tag));
