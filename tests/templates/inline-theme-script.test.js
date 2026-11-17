import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { InlineThemeScript } from '../../src/templates/inline-theme-script.js';

const source = InlineThemeScript()
	.replace(/^<script>/, '')
	.replace(/<\/script>$/, '');

function memoryStorage(initial = {}) {
	const items = new Map(Object.entries(initial));
	return {
		getItem: (key) => (items.has(key) ? items.get(key) : null),
		setItem: (key, value) => items.set(key, String(value)),
		removeItem: (key) => items.delete(key),
		snapshot: () => Object.fromEntries(items),
	};
}

const throwingStorage = {
	getItem() {
		throw new Error('SecurityError');
	},
	setItem() {
		throw new Error('SecurityError');
	},
};

function run({ search = '', storage = memoryStorage(), osDark = false } = {}) {
	const documentElement = { dataset: {} };
	const context = vm.createContext({
		location: { search },
		localStorage: storage,
		document: { documentElement },
	});
	context.window = {
		matchMedia: (query) => ({ matches: query.includes('dark') ? osDark : !osDark }),
	};
	vm.runInContext(source, context, { filename: 'inline-theme-script.js' });
	return documentElement.dataset.theme;
}

describe('InlineThemeScript', () => {
	it('uses the theme parameter over the saved choice and does not persist it', () => {
		const storage = memoryStorage({ 'bmad-theme': 'light' });
		assert.equal(run({ search: '?theme=dark', storage }), 'dark');
		assert.deepEqual(storage.snapshot(), { 'bmad-theme': 'light' });
	});

	it('accepts the light parameter on a dark OS', () => {
		assert.equal(run({ search: '?foo=1&theme=light', osDark: true }), 'light');
	});

	it('ignores an invalid parameter', () => {
		const storage = memoryStorage({ 'bmad-theme': 'light' });
		assert.equal(run({ search: '?theme=purple', storage, osDark: true }), 'light');
		assert.equal(run({ search: '?theme=purple', osDark: true }), 'dark');
	});

	it('falls back to the saved choice without a parameter', () => {
		assert.equal(run({ storage: memoryStorage({ 'bmad-theme': 'dark' }) }), 'dark');
	});

	it('ignores an invalid saved value and falls back to the OS scheme', () => {
		assert.equal(run({ storage: memoryStorage({ 'bmad-theme': 'purple' }), osDark: true }), 'dark');
		assert.equal(
			run({ storage: memoryStorage({ 'bmad-theme': 'purple' }), osDark: false }),
			'light',
		);
	});

	it('falls back to the OS scheme without a parameter or saved choice', () => {
		assert.equal(run({ osDark: true }), 'dark');
		assert.equal(run({ osDark: false }), 'light');
	});

	it('survives blocked storage', () => {
		assert.equal(run({ search: '?theme=light', storage: throwingStorage, osDark: true }), 'light');
		assert.equal(run({ storage: throwingStorage, osDark: true }), 'dark');
	});
});
