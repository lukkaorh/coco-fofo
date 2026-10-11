/**
 * Gera a pasta www/ a partir de src/index.html.
 *
 * O visual, o CSS, as animações e o JavaScript do app NÃO são alterados.
 * A única mudança é a fonte Fredoka: em vez de baixar do Google Fonts (precisa de
 * internet), ela passa a vir dentro do app, para o texto ficar idêntico offline.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsSrc = join(root, 'node_modules', '@fontsource', 'fredoka', 'files');
const www = join(root, 'www');

if (!existsSync(fontsSrc)) {
  throw new Error('Pacote da fonte não encontrado. Rode "npm install" antes de "npm run build:www".');
}

// Faixas de caracteres oficiais de cada subconjunto da fonte
const RANGES = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
};

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'fonts'), { recursive: true });

const faces = [];
for (const weight of [400, 500, 600, 700]) {
  for (const subset of ['latin', 'latin-ext']) {
    const name = `fredoka-${subset}-${weight}-normal.woff2`;
    const from = join(fontsSrc, name);
    if (!existsSync(from)) {
      if (subset === 'latin') throw new Error(`Arquivo de fonte ausente: ${name}`);
      continue;
    }
    copyFileSync(from, join(www, 'fonts', name));
    faces.push(
      `@font-face{font-family:'Fredoka';font-style:normal;font-weight:${weight};font-display:swap;` +
        `src:url('./fonts/${name}') format('woff2');unicode-range:${RANGES[subset]}}`
    );
  }
}

let html = readFileSync(join(root, 'src', 'index.html'), 'utf8');

// Remove só as 3 linhas que carregam a fonte da internet
const before = html.length;
html = html.replace(/<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/g, '');
if (html.length === before) throw new Error('Não encontrei os links do Google Fonts em src/index.html.');

// Injeta as fontes locais antes do primeiro <style>
const idx = html.indexOf('<style>');
if (idx === -1) throw new Error('Tag <style> não encontrada em src/index.html.');
html = html.slice(0, idx) + `<style>\n${faces.join('\n')}\n</style>\n` + html.slice(idx);

writeFileSync(join(www, 'index.html'), html);
console.log(`OK: www/index.html gerado com ${faces.length} fontes locais.`);
