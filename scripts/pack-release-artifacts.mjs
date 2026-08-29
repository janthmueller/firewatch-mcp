#!/usr/bin/env node
/**
 * Packs prebuilt public and privileged-context npm packages for a release job.
 * Publishing is intentionally handled by a separate, privileged workflow job.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {object} PackageMetadata
 * @property {string} name
 * @property {string} version
 * @property {string[]} files
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDirectory = resolve(root, 'release-artifacts');

/**
 * @param {string} packageDirectory
 * @param {PackageMetadata} packageMetadata
 * @param {string} destinationName
 * @returns {void}
 */
function packPackage(packageDirectory, packageMetadata, destinationName) {
  execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', artifactsDirectory], {
    cwd: packageDirectory,
    stdio: 'inherit',
  });

  const generatedName = `${packageMetadata.name
    .replace(/^@/, '')
    .replace('/', '-')}-${packageMetadata.version}.tgz`;
  renameSync(
    resolve(artifactsDirectory, generatedName),
    resolve(artifactsDirectory, destinationName)
  );
}

for (const buildDirectory of ['dist', 'dist.moz']) {
  if (!existsSync(resolve(root, buildDirectory))) {
    throw new Error(`Required build output is missing: ${buildDirectory}`);
  }
}

/** @type {PackageMetadata} */
const mainPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
/** @type {PackageMetadata} */
const mozPackage = JSON.parse(readFileSync(resolve(root, 'package.moz.json'), 'utf8'));

rmSync(artifactsDirectory, { recursive: true, force: true });
mkdirSync(artifactsDirectory, { recursive: true });

packPackage(root, mainPackage, 'firefox-devtools-mcp.tgz');

const stagingDirectory = mkdtempSync(resolve(tmpdir(), 'firefox-devtools-mcp-moz-'));

try {
  for (const entry of mozPackage.files) {
    const source = resolve(root, entry);
    if (!existsSync(source)) {
      throw new Error(`Required moz package entry is missing: ${entry}`);
    }

    const destination = resolve(stagingDirectory, entry);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }

  writeFileSync(
    resolve(stagingDirectory, 'package.json'),
    JSON.stringify(mozPackage, null, 2) + '\n'
  );
  packPackage(stagingDirectory, mozPackage, 'firefox-devtools-mcp-moz.tgz');
} finally {
  rmSync(stagingDirectory, { recursive: true, force: true });
}

console.log(`Release artifacts written to ${artifactsDirectory}`);
