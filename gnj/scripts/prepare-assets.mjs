// Extract the original GNJ photographs without inventing or retouching content.
// Run: node scripts/prepare-assets.mjs /path/to/logo.jpeg /path/to/flyer.jpeg
import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
const [logo, flyer] = process.argv.slice(2);
if (!logo || !flyer) throw new Error('Supply the logo and flyer file paths.');
await mkdir('public/images', { recursive: true });
await copyFile(logo, 'public/images/gnj-logo.jpg');
const metadata = await sharp(flyer).metadata();
if (metadata.width !== 1152 || metadata.height !== 1600) throw new Error('The original flyer must be 1152 × 1600 pixels for these extraction coordinates.');
for (const [name, top, height] of [['garden', 77, 343], ['courtyard', 446, 343], ['patio', 814, 343], ['path', 1182, 343]]) {
  await sharp(flyer).extract({ left: 103, top, width: 321, height }).webp({ quality: 92 }).toFile(`public/images/${name}.webp`);
}
console.log('GNJ logo and four original project photographs prepared.');
