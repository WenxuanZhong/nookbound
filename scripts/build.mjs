import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');
const assets = ['index.html', 'css', 'js', '_headers'];

async function ensureExists(targetPath) {
  try {
    await stat(targetPath);
  } catch (error) {
    throw new Error(`Missing required build asset: ${path.relative(root, targetPath)}`);
  }
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const asset of assets) {
    const source = path.join(root, asset);
    const destination = path.join(outDir, asset);
    await ensureExists(source);
    await cp(source, destination, { recursive: true });
  }

  console.log(`Built static site to ${path.relative(root, outDir)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
