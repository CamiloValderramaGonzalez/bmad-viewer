import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const extensionDir = new URL('..', import.meta.url);
const packageJsonPath = new URL('package.json', extensionDir);
const extensionEntryPath = new URL('extension.cjs', extensionDir);

JSON.parse(readFileSync(packageJsonPath, 'utf8'));
readFileSync(extensionEntryPath, 'utf8');
execFileSync(process.execPath, ['--check', fileURLToPath(extensionEntryPath)], { stdio: 'inherit' });

console.log('VS Code extension manifest and entrypoint are readable.');
