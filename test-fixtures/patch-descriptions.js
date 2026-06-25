// Removes [ Description = "..." ] annotation lines from Section1.m
// inside the DataMashup blob of an xlsx file.
// Usage: node patch-descriptions.js <xlsx>

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const xlsxPath = process.argv[2];
if (!xlsxPath) { console.error('Usage: node patch-descriptions.js <xlsx>'); process.exit(1); }

const outerZip = new AdmZip(xlsxPath);
const customXmlEntry = outerZip.getEntries().find(e => e.entryName === 'customXml/item1.xml');
if (!customXmlEntry) { console.error('No customXml/item1.xml found'); process.exit(1); }

// item1.xml may be UTF-16 LE (Excel default) — detect and decode properly
const rawBytes = customXmlEntry.getData();
const isUtf16 = rawBytes[0] === 0xFF && rawBytes[1] === 0xFE ||
                rawBytes[1] === 0x00; // UTF-16 LE without BOM shows NUL interleave
const xml = (rawBytes[0] === 0xFF && rawBytes[1] === 0xFE)
    ? rawBytes.toString('utf16le')
    : rawBytes[1] === 0x00
        ? Buffer.concat([Buffer.from([0xFF, 0xFE]), rawBytes]).toString('utf16le')
        : rawBytes.toString('utf8');

const match = xml.match(/<DataMashup[^>]*>([^<]+)</);
if (!match) { console.error('No DataMashup base64 found'); process.exit(1); }

const b64 = match[1];
const blob = Buffer.from(b64, 'base64');

// DataMashup layout: 4 bytes version | 4 bytes inner-zip-length | <inner zip> | <metadata XML>
const zipLen = blob.readInt32LE(4);
const innerZipBytes = blob.slice(8, 8 + zipLen);
const metaBytes = blob.slice(8 + zipLen);

// Patch inner ZIP
const innerZip = new AdmZip(innerZipBytes);
const mEntry = innerZip.getEntries().find(e => e.entryName === 'Formulas/Section1.m');
if (!mEntry) { console.error('No Formulas/Section1.m found'); process.exit(1); }

const original = mEntry.getData().toString('utf8');
console.log('Before patch:\n', original);

// Strip annotation lines like: [ Description = "..." ]\n
const patched = original.replace(/\[ Description = "[^"]*" \]\r?\n/g, '');
console.log('After patch:\n', patched);

innerZip.updateFile('Formulas/Section1.m', Buffer.from(patched, 'utf8'));
const newInnerZipBytes = innerZip.toBuffer();

// Rebuild blob
const newBlob = Buffer.alloc(8 + newInnerZipBytes.length + metaBytes.length);
blob.copy(newBlob, 0, 0, 4);                                   // version bytes
newBlob.writeInt32LE(newInnerZipBytes.length, 4);              // new inner zip length
newInnerZipBytes.copy(newBlob, 8);                             // inner zip
metaBytes.copy(newBlob, 8 + newInnerZipBytes.length);          // metadata unchanged

const newB64 = newBlob.toString('base64');
const newXml = xml.replace(/(<DataMashup[^>]*>)[^<]+(<)/, `$1${newB64}$2`);

// Re-encode in the same encoding as original
let newXmlBytes;
if (rawBytes[0] === 0xFF && rawBytes[1] === 0xFE) {
    newXmlBytes = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(newXml, 'utf16le')]);
} else if (rawBytes[1] === 0x00) {
    newXmlBytes = Buffer.from(newXml, 'utf16le');
} else {
    newXmlBytes = Buffer.from(newXml, 'utf8');
}
outerZip.updateFile('customXml/item1.xml', newXmlBytes);
outerZip.writeZip(xlsxPath);

console.log('\nPatched:', xlsxPath);
