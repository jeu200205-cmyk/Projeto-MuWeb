import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('./start-r90-safe.cjs');

try {
  await main();
} catch (error) {
  console.error('\n[R90] FALHA:', error?.message || error);
  process.exitCode = 1;
}
