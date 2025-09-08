// Copy *.test.js to dist/ and fix imports ../dist/* -> ./*
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const srcDir = path.join(fileURLToPath(root), 'src');
const distDir = path.join(fileURLToPath(root), 'dist');

const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith('.test.js'));
await fs.mkdir(distDir, { recursive: true });
for (const f of files) {
  const inPath = path.join(srcDir, f);
  const outPath = path.join(distDir, f);
  let txt = await fs.readFile(inPath, 'utf8');
  txt = txt.replaceAll('../dist/', './');
  await fs.writeFile(outPath, txt);
}
console.log(`Prepared ${files.length} test file(s) in dist/`);
