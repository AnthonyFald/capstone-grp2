import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const run=promisify(execFile);
test('Windows desktop accepts an arbitrary clone name and legacy workspace without starting the app', {skip:process.platform!=='win32'}, async()=>{
  const tempRoot=path.resolve(tmpdir());
  const folder=await mkdtemp(path.join(tempRoot,'capstone-paths-'));
  assert.ok(path.resolve(folder).startsWith(tempRoot+path.sep));
  try{
    const clone=path.join(folder,'renamed clone');
    const legacy=path.join(folder,'legacy workspace');
    for(const repo of [clone,path.join(legacy,'app')]){
      const host=path.join(repo,'demo-3','runner','desktop-host.mjs');
      await mkdir(path.dirname(host),{recursive:true});await writeFile(host,'// path fixture only');
    }
    const fakeNode=path.join(folder,'node fixture.exe');
    await writeFile(fakeNode,'never executed');
    const harness=path.join(folder,'PathHarness.cs');
    await writeFile(harness,`using System; using System.IO;
internal static class PathHarness {
  public static int Main(string[] args){
    if(CapstonePaths.ResolveRepo(args[0])!=Path.GetFullPath(args[0]))return 1;
    if(CapstonePaths.ResolveRepo(args[1])!=Path.Combine(Path.GetFullPath(args[1]),"app"))return 2;
    if(CapstonePaths.ResolveNode()!=Path.GetFullPath(args[2]))return 3;
    Environment.SetEnvironmentVariable("CAPSTONE_NODE_EXECUTABLE",null);
    if(!CapstonePaths.ResolveNode().EndsWith(Path.Combine("node","bin","node.exe")))return 4;
    Console.WriteLine("clone, legacy workspace, explicit Node and legacy fallback verified; no app started");
    return 0;
  }
}`);
    const output=path.join(folder,'PathHarness.exe');
    const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
    const source=fileURLToPath(new URL('./CapstoneApp.cs',import.meta.url));
    await run(compiler,['/nologo','/target:exe','/main:PathHarness','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/out:'+output,source,harness],{windowsHide:true});
    const result=await run(output,[clone,legacy,fakeNode],{env:{...process.env,CAPSTONE_NODE_EXECUTABLE:fakeNode},windowsHide:true});
    assert.match(result.stdout,/no app started/);
  }finally{await rm(folder,{recursive:true,force:true});}
});
