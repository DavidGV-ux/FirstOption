#!/usr/bin/env node
/*
 * Genera, a partir del export web de Expo:
 *  - dist/precache-manifest.json: lista de archivos para que el service
 *    worker los precargue y la PWA funcione offline (incluye los bundles
 *    con hash de Metro y el HTML de cada ruta).
 *  - dist/_redirects: URLs limpias y fallback SPA para Netlify /
 *    Cloudflare Pages (el export estático emite /ruta.html; sin esto,
 *    recargar en /ruta daría 404 en hosts sin clean URLs).
 *  - dist/404.html: fallback SPA para GitHub Pages.
 *
 * Uso: node scripts/generate-precache.js [directorio]  (default: dist)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] ?? 'dist');
const skip = new Set(['sw.js', 'precache-manifest.json', '_redirects', '404.html']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (!skip.has(entry.name)) {
      files.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return files;
}

if (!fs.existsSync(root)) {
  console.error(`[precache] No existe el directorio ${root}; ¿ejecutaste expo export -p web?`);
  process.exit(1);
}

const urls = walk(root).map((file) => `./${file}`).sort();
fs.writeFileSync(path.join(root, 'precache-manifest.json'), JSON.stringify(urls, null, 2));

// _redirects: cada ruta estática se sirve desde su .html (conserva el
// prerender) y el resto cae al shell SPA. Los rewrites 200 no pisan
// archivos existentes, así que los assets con hash se sirven normales.
const routes = urls
  .filter((url) => url.endsWith('.html') && url !== './index.html' && url !== './404.html')
  .map((url) => `/${url.slice(2, -5)}  ${url.slice(2)}  200`);
const redirects = ['/  /index.html  200', ...routes, '/*  /index.html  200'].join('\n') + '\n';
fs.writeFileSync(path.join(root, '_redirects'), redirects);

// GitHub Pages no lee _redirects: usa 404.html como fallback SPA.
fs.copyFileSync(path.join(root, 'index.html'), path.join(root, '404.html'));

console.log(`[precache] ${urls.length} archivos -> ${path.join(root, 'precache-manifest.json')}`);
console.log(`[precache] ${routes.length} rutas -> ${path.join(root, '_redirects')}`);
console.log(`[precache] fallback SPA -> ${path.join(root, '404.html')}`);