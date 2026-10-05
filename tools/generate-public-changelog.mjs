import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function sanitize(text) {
  return text
    .replace(/\b(?:MUWEB[_-]?)?R?\d*[_-]?FIX\d+\b/gi, 'atualização interna')
    .replace(/\bFIX\s*\d+\b/gi, 'atualização interna')
    .replace(/\bHOTFIX\b/gi, 'correção')
    .replace(/\bcheckpoint\b/gi, 'etapa de desenvolvimento')
    .replace(/\s+/g, ' ')
    .trim();
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }),
);

const date = args.date || new Date().toISOString().slice(0, 10);
const title = sanitize(args.title || `Atualização ${date}`);
const summary = sanitize(args.summary || 'Atualização da source pública, com melhorias e correções acumuladas do projeto.');
const output = args.output || 'CHANGELOG.md';

let previous = '';
try {
  previous = git(['describe', '--tags', '--abbrev=0']);
} catch {
  previous = '';
}

const range = previous ? `${previous}..HEAD` : 'HEAD';
let subjects = [];
try {
  subjects = git(['log', '--format=%s', range])
    .split('\n')
    .map(sanitize)
    .filter(Boolean)
    .filter((line) => !/changelog|release|publica atualização/i.test(line));
} catch {
  subjects = [];
}

let stats = '';
try {
  stats = git(['diff', '--shortstat', previous || git(['rev-list', '--max-parents=0', 'HEAD']) + '^', 'HEAD']);
} catch {
  try {
    stats = git(['show', '--shortstat', '--format=', 'HEAD']);
  } catch {
    stats = '';
  }
}

const unique = [...new Set(subjects)].slice(0, 30);
const details = unique.length
  ? unique.map((item) => `- ${item}`).join('\n')
  : '- Atualizações internas consolidadas na source pública.';

const entry = `## ${title}\n\n${summary}\n\n### Alterações\n${details}\n${stats ? `\n### Estatísticas\n- ${sanitize(stats)}` : ''}\n\n`;

let existing = existsSync(output) ? readFileSync(output, 'utf8') : '# Changelog\n\nHistórico público das atualizações relevantes do Projeto MuWeb. Nomes internos de checkpoints e builds não são publicados aqui.\n\n';

if (!existing.startsWith('# Changelog')) {
  existing = `# Changelog\n\n${existing}`;
}

const marker = existing.indexOf('\n', existing.indexOf('\n') + 1);
const headerEnd = marker >= 0 ? marker + 1 : existing.length;
const head = existing.slice(0, headerEnd).trimEnd();
const tail = existing.slice(headerEnd).trimStart();

writeFileSync(output, `${head}\n\n${entry}${tail}`, 'utf8');
console.log(`Changelog atualizado em ${output}`);
if (previous) console.log(`Base: ${previous}`);
