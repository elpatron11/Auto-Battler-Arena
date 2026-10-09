import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createServer} from 'vite';

test('rank definitions load through the development module graph, not the public asset directory',async()=>{
  const server=await createServer({
    configFile:false,
    root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true,hmr:false,watch:null},
    optimizeDeps:{noDiscovery:true,include:[]},
  });
  try{
    const ranks=await server.transformRequest('/src/lib/arenaRanks.ts');
    assert.ok(ranks?.code.includes('/src/lib/arena-ranks.json?import'));
    assert.ok(!ranks.code.includes('/public/arena-ranks.json'));
    const definitions=await server.transformRequest('/src/lib/arena-ranks.json?import');
    assert.ok(definitions?.code.includes('Grandmaster'));
    assert.ok(definitions.code.includes('2200'));
  }finally{
    await server.close();
  }
});