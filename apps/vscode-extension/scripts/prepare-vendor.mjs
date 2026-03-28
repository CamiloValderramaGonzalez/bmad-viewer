import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionDir = resolve(__dirname, '..');
const repoRoot = resolve(extensionDir, '..', '..');
const vendorRoot = join(extensionDir, 'vendor', 'bmad-viewer');

rmSync(vendorRoot, { recursive: true, force: true });
mkdirSync(vendorRoot, { recursive: true });

for (const relativePath of ['src', 'public', 'LICENSE', 'README.md']) {
	const sourcePath = join(repoRoot, relativePath);
	if (!existsSync(sourcePath)) {
		throw new Error(`Cannot vendor missing path: ${sourcePath}`);
	}

	cpSync(sourcePath, join(vendorRoot, relativePath), {
		recursive: true,
	});
}

console.log(`Vendored viewer assets into ${vendorRoot}`);
