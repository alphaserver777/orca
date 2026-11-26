import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createServer} from 'node:http';

test('actual shipped WEB static handler serves patched existing chunk with its startup allowlist', async () => {
  const runtime = process.env.ORCA_TIMELINE_RUNTIME || '/opt/orca/runtime/orca-1.4.274';
  const overlay = process.env.ORCA_TIMELINE_OVERLAY || '/tmp/orca-timeline-overlay-implementation';
  const code = readFileSync(path.join(runtime,'orcad/orcad-server.js'),'utf8');
  const start = code.indexOf('async function u5b('), end = code.indexOf('var sQp,',start);
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({URL, Aj:path, aQp:fsPromises, sQp:fs,
    l5b:new Set(['/web-index.html']),lQp:['/assets/','/cmaps/','/standard_fonts/','/wasm/'],
    c5b:new Map([['.js','text/javascript; charset=utf-8'],['.html','text/html; charset=utf-8']])});
  vm.runInContext(code.slice(start,end),context);
  const allowlist = new Set(JSON.parse(readFileSync(path.join(runtime,'orcad/out/renderer/.orca-web-client-files.json'))));
  const handler = vm.runInContext('u5b',context);
  const server = createServer((req,res)=>handler(overlay,allowlist,req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const chunk = await fetch(base+'/assets/App-CTRL5owY.js?timeline=transport-test');
    assert.equal(chunk.status,200); assert.match(chunk.headers.get('content-type'),/javascript/);
    assert.match(await chunk.text(),/OrcaTimelineLaunch/);
    assert.equal((await fetch(base+'/assets/orca-timeline-test.js')).status,404);
    const index=await fetch(base+'/web-index.html');
    assert.equal(index.status,200);
    assert.match(await index.text(),/type="importmap"/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
