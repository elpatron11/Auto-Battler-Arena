import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const module={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL('../src/lib/squadRatings.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports});
export const squadRatingFixture=module.exports;