import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const packagePath = resolve(root, 'package.json');
const lockPath = resolve(root, 'package-lock.json');

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const nextVersion = bumpPatch(packageJson.version);
packageJson.version = nextVersion;
await writeJson(packagePath, packageJson);

try {
  const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
  lockJson.version = nextVersion;
  if (lockJson.packages?.['']) {
    lockJson.packages[''].version = nextVersion;
  }
  await writeJson(lockPath, lockJson);
} catch {
  // package-lock.json is optional for this tiny helper.
}

console.log(`Verze navýšena na ${nextVersion}`);

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(String(version));
  if (!match) {
    throw new Error(`Neplatná semver verze: ${version}`);
  }
  const [, major, minor, patch, suffix] = match;
  return `${major}.${minor}.${Number(patch) + 1}${suffix}`;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
