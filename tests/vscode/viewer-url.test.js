import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { themeForKind, withTheme, shouldOpenOnStartup } = require(
	fileURLToPath(new URL('../../apps/vscode-extension/lib/viewer-url.cjs', import.meta.url)),
);

describe('themeForKind', () => {
	it('maps Light (1) and HighContrastLight (4) to light', () => {
		assert.equal(themeForKind(1), 'light');
		assert.equal(themeForKind(4), 'light');
	});

	it('maps Dark (2) and HighContrast (3) to dark', () => {
		assert.equal(themeForKind(2), 'dark');
		assert.equal(themeForKind(3), 'dark');
	});

	it('falls back to dark for an unknown kind', () => {
		assert.equal(themeForKind(undefined), 'dark');
	});
});

describe('withTheme', () => {
	it('appends the theme to a bare server URL', () => {
		assert.equal(withTheme('http://localhost:4100', 'light'), 'http://localhost:4100/?theme=light');
	});

	it('keeps an existing query and adds the theme', () => {
		assert.equal(
			withTheme('http://localhost:4100/?view=board', 'dark'),
			'http://localhost:4100/?view=board&theme=dark',
		);
	});

	it('replaces an existing theme parameter', () => {
		assert.equal(
			withTheme('http://127.0.0.1:4101/?theme=dark', 'light'),
			'http://127.0.0.1:4101/?theme=light',
		);
	});
});

describe('shouldOpenOnStartup', () => {
	it('opens when the setting is on and a BMAD project is detected', () => {
		assert.equal(shouldOpenOnStartup({ openOnStartup: true, bmadDir: '/repo/_bmad' }), true);
	});

	it('does not open in a workspace without _bmad', () => {
		assert.equal(shouldOpenOnStartup({ openOnStartup: true, bmadDir: null }), false);
	});

	it('does not open when the setting is off', () => {
		assert.equal(shouldOpenOnStartup({ openOnStartup: false, bmadDir: '/repo/_bmad' }), false);
	});
});

describe('extension manifest', () => {
	it('activates on onStartupFinished', () => {
		const manifest = JSON.parse(
			readFileSync(new URL('../../apps/vscode-extension/package.json', import.meta.url), 'utf8'),
		);
		assert.ok(manifest.activationEvents.includes('onStartupFinished'));
	});
});
