// Maintainer-only: copy an explicit allowlist from the official npm registry.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=[];
async function vendor(name,version,directory,allowed){
  const response=await fetch('https://registry.npmjs.org/'+name+'/'+version);if(!response.ok)throw Error('Registry metadata failed.');
  const metadata=await response.json();
  if(new URL(metadata.dist.tarball).hostname!=='registry.npmjs.org')throw Error('Unexpected package source.');
  const tgz=Buffer.from(await(await fetch(metadata.dist.tarball)).arrayBuffer());
  if(metadata.dist.integrity?.startsWith('sha512-')&&'sha512-'+createHash('sha512').update(tgz).digest('base64')!==metadata.dist.integrity)throw Error('Package integrity mismatch.');
  const archive=gunzipSync(tgz),files=[];
  for(let offset=0;offset+512<=archive.length;){
    const header=archive.subarray(offset,offset+512),entry=header.subarray(0,100).toString('utf8').split('\0')[0],size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0/g,'').trim()||'0',8);
    if(!entry)break;const type=String.fromCharCode(header[156]||48);offset+=512;
    const relative=entry.replace(/^package\//,'');
    if((type==='0'||type==='\0')&&allowed(relative)){
      const normalized=relative.replace(/^build\//,'');const destination=path.join(root,'vendor',directory,normalized);
      if(!path.resolve(destination).startsWith(path.resolve(root,'vendor',directory)+path.sep))throw Error('Invalid vendor path.');
      const bytes=archive.subarray(offset,offset+size);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);
      files.push({file:'vendor/'+directory+'/'+normalized,bytes:size,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    offset+=Math.ceil(size/512)*512;
  }
  output.push({package:name,version:metadata.version,license:metadata.license,registry:metadata.dist.tarball,integrity:metadata.dist.integrity,files});
}
await Promise.all([
  vendor('pdfjs-dist','6.5.438','pdfjs',name=>['build/pdf.min.mjs','build/pdf.worker.min.mjs','LICENSE'].includes(name)||/^(cmaps|standard_fonts)\/[^/]+$/.test(name)),
  vendor('mammoth','1.13.0','mammoth',name=>['mammoth.browser.min.js','LICENSE','README.md'].includes(name))
]);
await writeFile(path.join(root,'vendor','manifest.json'),JSON.stringify({retrievedAt:new Date().toISOString(),source:'Official npm registry; archive integrity verified',packages:output},null,2)+'\n');
console.log(JSON.stringify(output.map(p=>({package:p.package,version:p.version,license:p.license,files:p.files.length,bytes:p.files.reduce((n,f)=>n+f.bytes,0)}))));
