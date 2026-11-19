const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const projectRoot = fs.realpathSync(path.join(__dirname, '..'));
const requestedOutput = process.argv[2] || path.join(os.homedir(), 'Downloads', 'aspect-companies-portal-release.zip');
const outputPath = path.resolve(requestedOutput);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const canonicalOutput = path.join(fs.realpathSync(path.dirname(outputPath)), path.basename(outputPath));
const outputRelative = path.relative(projectRoot, canonicalOutput);
if (!outputRelative || (!outputRelative.startsWith('..' + path.sep) && outputRelative !== '..' && !path.isAbsolute(outputRelative))) {
  throw new Error('Choose an output path outside the project folder so an archive cannot include or expose portal data.');
}
if (fs.existsSync(canonicalOutput)) throw new Error('The release archive already exists; choose a new output filename to avoid overwriting it.');

const excludedNames = new Set(['.git', 'node_modules', 'data', 'backups', 'documents']);
const excludedFile = name => name.toLowerCase().startsWith('.env') || /\.sqlite(?:-|$)/i.test(name);
const files = [
  'server.js', 'package.json', 'package-lock.json', 'README.md', 'Dockerfile', '.dockerignore',
  'Start Aspect Portal.bat', 'Start Aspect Portal Pilot.bat',
  'Recover Aspect Admin Access.bat', 'Recover Aspect Portal Pilot Admin Access.bat'
].map(name => path.join(projectRoot, name));
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (excludedNames.has(entry.name) || excludedFile(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile()) files.push(fullPath);
  }
}
for (const directory of ['public', 'scripts', path.join('deploy', 'hostinger')]) collect(path.join(projectRoot, directory));

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return { date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(), time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2) };
}
function localHeader(name, packed, original, checksum, stamp) {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(stamp.time, 10); header.writeUInt16LE(stamp.date, 12);
  header.writeUInt32LE(checksum, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(original.length, 22);
  header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28); name.copy(header, 30); return header;
}
function centralHeader(name, packed, original, checksum, stamp, offset) {
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8); header.writeUInt16LE(8, 10); header.writeUInt16LE(stamp.time, 12); header.writeUInt16LE(stamp.date, 14);
  header.writeUInt32LE(checksum, 16); header.writeUInt32LE(packed.length, 20); header.writeUInt32LE(original.length, 24);
  header.writeUInt16LE(name.length, 28); header.writeUInt16LE(0, 30); header.writeUInt16LE(0, 32); header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36); header.writeUInt32LE(0, 38); header.writeUInt32LE(offset, 42); name.copy(header, 46); return header;
}
if (files.length > 65535) throw new Error('Too many files for a standard ZIP archive.');
const parts = [], directory = []; let offset = 0;
for (const file of files) {
  const relative = path.relative(projectRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || excludedFile(path.basename(relative))) throw new Error('Unsafe file entered the release set: ' + relative);
  const name = Buffer.from(relative.split(path.sep).join('/'), 'utf8');
  const original = fs.readFileSync(file), packed = zlib.deflateRawSync(original, { level: 9 });
  const checksum = crc32(original), stamp = dosDateTime(fs.statSync(file).mtime), header = localHeader(name, packed, original, checksum, stamp);
  parts.push(header, packed); directory.push(centralHeader(name, packed, original, checksum, stamp, offset));
  offset += header.length + packed.length;
  if (offset > 0xffffffff) throw new Error('Release archive exceeds the standard ZIP size limit.');
}
const directoryOffset = offset, directorySize = directory.reduce((size, header) => size + header.length, 0), footer = Buffer.alloc(22);
footer.writeUInt32LE(0x06054b50, 0); footer.writeUInt16LE(0, 4); footer.writeUInt16LE(0, 6);
footer.writeUInt16LE(files.length, 8); footer.writeUInt16LE(files.length, 10); footer.writeUInt32LE(directorySize, 12);
footer.writeUInt32LE(directoryOffset, 16); footer.writeUInt16LE(0, 20); parts.push(...directory, footer);
fs.writeFileSync(canonicalOutput, Buffer.concat(parts), { flag: 'wx', mode: 0o600 });
console.log('Release archive created: ' + canonicalOutput);
console.log('Included ' + files.length + ' application/deployment files. Portal databases, documents, backups, and local settings are excluded.');
