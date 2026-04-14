/**
 * Configuration constants for Firewatch MCP server
 */

import { readFileSync } from 'node:fs';

export const SERVER_NAME = 'firewatch';

type PackageMetadata = {
  version: string;
};

const packageMetadata = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as PackageMetadata;

export const SERVER_VERSION = packageMetadata.version;
