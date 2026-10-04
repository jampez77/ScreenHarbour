import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Use the production bundle and the separate fictional fixture. Only this
// explicit file list is published; server configuration is never included.
await import('./build.mjs');
const root = new URL('../', import.meta.url);
const output = new URL('dist/demo-site/', root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('dist/', output), { recursive: true });
await mkdir(new URL('demo/', output), { recursive: true });
await mkdir(new URL('assets/providers/', output), { recursive: true });
for (const path of ['dist/demo.js', 'dist/jellyfin-tv-layout.js', 'dist/jellyfin-tv-layout.js.map', 'demo/demo.css', 'LICENSE.md', 'assets/providers/README.md']) {
  await cp(new URL(path, root), new URL(path, output));
}
await cp(new URL('demo/assets/', root), new URL('demo/assets/', output), { recursive: true });
await cp(new URL('assets/loading/', root), new URL('assets/loading/', output), { recursive: true });
await cp(new URL('assets/seasonal-fonts/', root), new URL('assets/seasonal-fonts/', output), { recursive: true });
await mkdir(new URL('assets/seasonal/', output), { recursive: true });
for (const name of await readdir(new URL('assets/seasonal/', root))) {
  if (/\.(webp|md)$/.test(name)) await cp(new URL(`assets/seasonal/${name}`, root), new URL(`assets/seasonal/${name}`, output));
}
const html = await readFile(new URL('demo/index.html', root), 'utf8');
// Keep the existing local /demo/index.html route while publishing a root
// entry point whose assets stay within any GitHub Pages project subpath.
await writeFile(new URL('index.html', output), html.replace(/(["'])\/(demo|dist)\//g, '$1./$2/'));
await writeFile(new URL('.nojekyll', output), '');
console.log(`Static demo ready: ${fileURLToPath(output)}`);
