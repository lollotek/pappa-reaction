// Crea release/pappa-reaction-<versione>.zip dalla cartella dist/ (dopo `vite build`).
// Zip scritto a mano con zlib di Node: nessuna dipendenza in più.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const files = listFiles(dist).sort();
if (!files.some((f) => f.endsWith('index.html'))) {
  console.error('dist/index.html mancante: esegui prima `npm run build`.');
  process.exit(1);
}

const local = [];
const central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(relative(dist, file).split(sep).join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // firma file locale
  header.writeUInt16LE(20, 4); // versione necessaria
  header.writeUInt16LE(0x0800, 6); // nomi in UTF-8
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0); // firma directory centrale
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);

  offset += header.length + name.length + packed.length;
}

const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // fine directory centrale
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `pappa-reaction-${version}.zip`);
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(
  `Creato ${relative(root, out)} (${files.length} file, ${(statSync(out).size / 1024).toFixed(0)} kB)`,
);
