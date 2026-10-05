// Rebuild only: npm ci --prefix tools/fengari-bitmap-build --ignore-scripts
// Then: node tools/build-fengari-bitmap.mjs
// The checked-in bundle needs neither npm Lua dependencies nor a CDN at runtime.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dependencies=path.join(root,'tools/fengari-bitmap-build/node_modules');
const require=createRequire(path.join(dependencies,'package.json'));
const {build}=require('esbuild');
await build({entryPoints:[path.join(root,'tools/fengari-bitmap-entry.mjs')],
 nodePaths:[dependencies],bundle:true,format:'esm',platform:'browser',minify:true,
 define:{'process.env.FENGARICONF':'undefined',process:'undefined'},
 outfile:path.join(root,'vendor/fengari-bitmap-0.1.4.mjs')});
