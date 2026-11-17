import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const extensionPath = fileURLToPath(
	new URL('../../apps/vscode-extension/extension.cjs', import.meta.url),
);

// Fake extension root: package.json plus vendored viewer modules driven by globalThis.__bmadStub.
let fakeRoot;
const stub = {
	bmadDir: null,
	starts: [],
	closes: 0,
};

function writeFakeExtensionRoot() {
	fakeRoot = mkdtempSync(join(tmpdir(), 'bmad-ext-'));
	writeFileSync(
		join(fakeRoot, 'package.json'),
		JSON.stringify({ version: '0.0.0-test', type: 'module' }),
	);
	const src = join(fakeRoot, 'vendor', 'bmad-viewer', 'src');
	mkdirSync(join(src, 'server'), { recursive: true });
	mkdirSync(join(src, 'data'), { recursive: true });
	writeFileSync(
		join(src, 'server', 'http-server.js'),
		`export async function startServer(options) {
	const s = globalThis.__bmadStub;
	s.starts.push(options);
	return { url: 'http://localhost:' + options.port, close: async () => { s.closes += 1; } };
}
`,
	);
	writeFileSync(
		join(src, 'data', 'bmad-detector.js'),
		'export function detectBmadDir() { return globalThis.__bmadStub.bmadDir; }\n',
	);
	writeFileSync(
		join(src, 'data', 'data-model.js'),
		'export function buildDataModel() { return { project: null }; }\n',
	);
}

function createVscodeStub({ config = {}, themeKind = 2 } = {}) {
	const listeners = { config: [], theme: [] };
	const commands = new Map();
	const panels = [];
	const disposable = { dispose() {} };
	const vscode = {
		ViewColumn: { One: 1 },
		Uri: {
			file: (p) => ({ fsPath: p, toString: () => `file://${p}` }),
			parse: (u) => u,
		},
		env: { openExternal: async () => true },
		commands: {
			registerCommand: (id, fn) => {
				commands.set(id, fn);
				return disposable;
			},
			executeCommand: async () => undefined,
		},
		workspace: {
			workspaceFolders: [{ name: 'repo', uri: vscode_uri('/repo') }],
			getWorkspaceFolder: () => undefined,
			getConfiguration: () => ({
				get: (key, fallback) => (key in config ? config[key] : fallback),
			}),
			onDidChangeWorkspaceFolders: () => disposable,
			onDidChangeConfiguration: (fn) => {
				listeners.config.push(fn);
				return disposable;
			},
		},
		window: {
			activeColorTheme: { kind: themeKind },
			activeTextEditor: undefined,
			registerWebviewViewProvider: () => disposable,
			onDidChangeActiveColorTheme: (fn) => {
				listeners.theme.push(fn);
				return disposable;
			},
			showWarningMessage: async () => undefined,
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
			createWebviewPanel: () => {
				const panel = {
					webview: {
						html: '',
						cspSource: 'vscode-resource:',
						asWebviewUri: (u) => u.toString(),
						onDidReceiveMessage: () => disposable,
					},
					reveal() {},
					onDidDispose: () => disposable,
				};
				panels.push(panel);
				return panel;
			},
		},
	};
	return { vscode, listeners, commands, panels };
}

function vscode_uri(p) {
	return { fsPath: p, toString: () => `file://${p}` };
}

function loadExtension(vscodeStub) {
	const originalLoad = Module._load;
	Module._load = function (request, ...rest) {
		if (request === 'vscode') return vscodeStub;
		return originalLoad.call(this, request, ...rest);
	};
	try {
		delete require.cache[extensionPath];
		return require(extensionPath);
	} finally {
		Module._load = originalLoad;
	}
}

function makeContext() {
	return { extensionPath: fakeRoot, subscriptions: [] };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('extension wiring', () => {
	before(() => {
		writeFakeExtensionRoot();
		globalThis.__bmadStub = stub;
	});

	after(() => {
		rmSync(fakeRoot, { recursive: true, force: true });
		globalThis.__bmadStub = undefined;
	});

	it('does not open a panel at startup when no BMAD project is detected', async () => {
		stub.bmadDir = null;
		const { vscode, panels } = createVscodeStub({ config: { openOnStartup: true } });
		const extension = loadExtension(vscode);
		extension.activate(makeContext());
		await flush();
		assert.equal(panels.length, 0);
		await extension.deactivate();
	});

	it('restarts the server when preferredPort changes', async () => {
		stub.bmadDir = '/repo/_bmad';
		stub.starts = [];
		stub.closes = 0;
		const config = { preferredPort: 4100 };
		const { vscode, listeners, commands } = createVscodeStub({ config });
		const extension = loadExtension(vscode);
		extension.activate(makeContext());
		await commands.get('bmadViewer.openInBrowser')();
		assert.equal(stub.starts.length, 1);

		config.preferredPort = 4200;
		for (const listener of listeners.config) {
			listener({ affectsConfiguration: (section) => section.startsWith('bmadViewer') });
		}
		await flush();
		assert.equal(stub.closes, 1, 'running server is stopped');
		assert.equal(stub.starts.length, 2, 'server is started again');
		assert.equal(stub.starts[1].port, 4200);
		await extension.deactivate();
	});

	it('passes the light theme to the dashboard iframe for a light editor theme', async () => {
		stub.bmadDir = '/repo/_bmad';
		const { vscode, commands, panels } = createVscodeStub({ themeKind: 1 });
		const extension = loadExtension(vscode);
		extension.activate(makeContext());
		await commands.get('bmadViewer.focus')();
		assert.equal(panels.length, 1);
		assert.match(panels[0].webview.html, /theme=light/);
		await extension.deactivate();
	});

	it('returns a promise from deactivate after activate', async () => {
		stub.bmadDir = null;
		const { vscode } = createVscodeStub();
		const extension = loadExtension(vscode);
		extension.activate(makeContext());
		const result = extension.deactivate();
		assert.ok(result instanceof Promise);
		await result;
	});
});
