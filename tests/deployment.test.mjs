import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const pageUrl = new URL('https://kokoirin.github.io/Glimpse/');

test('the standalone page resolves every local stylesheet, script and icon inside Glimpse', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<title>Glimpse/);
  assert.doesNotMatch(html, /碰一下|href="\.\.\//);
  assert.match(html, /https:\/\/kokoirin.github.io\/rin3\/me\/glimpse\//);
  const resources = [...html.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)="([^"#]+)"/g)].map(match => match[1]);
  assert(resources.length >= 5);
  for (const resource of resources) {
    const url = new URL(resource, pageUrl);
    assert.equal(url.origin, pageUrl.origin);
    assert(url.pathname.startsWith('/Glimpse/'));
    assert((await readFile(new URL(resource, root))).length > 0);
  }
});

test('the install manifest launches Glimpse and references correctly sized standalone icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.name, 'Glimpse');
  assert.equal(manifest.display, 'standalone');
  for (const key of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[key], pageUrl).href, pageUrl.href);
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src, root));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
});
