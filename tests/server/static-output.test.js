import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { generateStaticSite } from '../../src/server/static-generator.js';

describe('generateStaticSite', () => {
	it('does not reference live-only scripts in the static HTML', async () => {
		const outputDir = mkdtempSync(join(tmpdir(), 'bmad-viewer-static-'));
		try {
			await generateStaticSite(resolve('example-data'), outputDir);
			const html = readFileSync(join(outputDir, 'index.html'), 'utf8');
			assert.match(html, /project-dashboard/);
			assert.doesNotMatch(html, /\/client\.js/);
			assert.doesNotMatch(html, /\/board-feedback\.js/);
		} finally {
			rmSync(outputDir, { recursive: true, force: true });
		}
	});
});
