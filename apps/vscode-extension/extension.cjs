const vscode = require('vscode');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const VIEW_CONTAINER_COMMAND = 'workbench.view.extension.bmadViewer';
const VIEW_ID = 'bmadViewer.dashboard';
const EXTENSION_CONFIG = 'bmadViewer';
const EDITOR_PANEL_TYPE = 'bmadViewer.editorPanel';

// ── Shared server & module loader ──────────────────────────────────

class BmadServerManager {
	constructor(context) {
		this.context = context;
		this.serverHandle = null;
		this.activeBmadDir = null;
		this.selectedWorkspaceFolder = null;
		this.viewerModulesPromise = null;
	}

	async getWorkspaceState() {
		const workspaceFolder = this.getPreferredWorkspaceFolder();
		if (!workspaceFolder) {
			return { workspaceFolder: null, bmadDir: null };
		}

		const { detectBmadDir } = await this.loadViewerModules();
		const bmadDir = detectBmadDir(workspaceFolder.uri.fsPath);
		return { workspaceFolder, bmadDir };
	}

	getPreferredWorkspaceFolder() {
		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		if (!workspaceFolders.length) {
			this.selectedWorkspaceFolder = null;
			return null;
		}

		if (this.selectedWorkspaceFolder) {
			const stillPresent = workspaceFolders.find((folder) => folder.uri.toString() === this.selectedWorkspaceFolder.uri.toString());
			if (stillPresent) {
				return stillPresent;
			}
			this.selectedWorkspaceFolder = null;
		}

		const activeUri = vscode.window.activeTextEditor?.document?.uri;
		if (activeUri) {
			const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
			if (activeFolder) {
				return activeFolder;
			}
		}

		return workspaceFolders[0];
	}

	async selectWorkspaceFolder() {
		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		if (!workspaceFolders.length) {
			void vscode.window.showInformationMessage('Open a workspace folder first to choose a BMAD project.');
			return;
		}

		const selected = await vscode.window.showQuickPick(
			workspaceFolders.map((folder) => ({
				label: folder.name,
				description: folder.uri.fsPath,
				folder,
			})),
			{
				placeHolder: 'Choose the workspace folder that contains your BMAD project',
			},
		);

		if (!selected) {
			return;
		}

		this.selectedWorkspaceFolder = selected.folder;
	}

	async ensureServer(bmadDir) {
		if (this.serverHandle && this.activeBmadDir === bmadDir) {
			return this.serverHandle.url;
		}

		await this.stopServer();

		const preferredPort = vscode.workspace.getConfiguration(EXTENSION_CONFIG).get('preferredPort', 4100);
		const { startServer } = await this.loadViewerModules();

		this.serverHandle = await startServer({
			port: preferredPort,
			bmadDir,
			open: false,
			interactive: false,
			attachProcessHandlers: false,
		});
		this.activeBmadDir = bmadDir;
		return this.serverHandle.url;
	}

	async stopServer() {
		if (!this.serverHandle) {
			this.activeBmadDir = null;
			return;
		}

		const handle = this.serverHandle;
		this.serverHandle = null;
		this.activeBmadDir = null;
		await handle.close();
	}

	async loadViewerModules() {
		if (!this.viewerModulesPromise) {
			const viewerRoot = path.join(this.context.extensionPath, 'vendor', 'bmad-viewer');
			const startServerUrl = pathToFileURL(path.join(viewerRoot, 'src', 'server', 'http-server.js')).href;
			const detectBmadUrl = pathToFileURL(path.join(viewerRoot, 'src', 'data', 'bmad-detector.js')).href;

			this.viewerModulesPromise = Promise.all([
				import(startServerUrl),
				import(detectBmadUrl),
			]).then(([serverModule, detectorModule]) => ({
				startServer: serverModule.startServer,
				detectBmadDir: detectorModule.detectBmadDir,
			}));
		}

		return this.viewerModulesPromise;
	}

	async dispose() {
		await this.stopServer();
	}
}

// ── Editor panel (main area) ───────────────────────────────────────

class BmadEditorPanel {
	static currentPanel = null;

	static async open(context, serverManager) {
		if (BmadEditorPanel.currentPanel) {
			BmadEditorPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
			await BmadEditorPanel.currentPanel.update();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			EDITOR_PANEL_TYPE,
			'BMAD Viewer',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			},
		);

		const logoUri = panel.webview.asWebviewUri(
			vscode.Uri.file(path.join(context.extensionPath, 'media', 'logo.png')),
		);
		panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'logo.png'));

		BmadEditorPanel.currentPanel = new BmadEditorPanel(panel, serverManager, logoUri);
		await BmadEditorPanel.currentPanel.update();
	}

	constructor(panel, serverManager, logoUri) {
		this.panel = panel;
		this.serverManager = serverManager;
		this.logoUri = logoUri;

		this.panel.onDidDispose(() => {
			BmadEditorPanel.currentPanel = null;
		});

		this.panel.webview.onDidReceiveMessage(async (message) => {
			switch (message?.type) {
				case 'refresh':
					await this.update();
					break;
				case 'open-in-browser':
					await this.openInBrowser();
					break;
				case 'select-workspace-folder':
					await this.serverManager.selectWorkspaceFolder();
					await this.update();
					break;
				case 'open-folder':
					await vscode.commands.executeCommand('workbench.action.files.openFolder');
					break;
				default:
					break;
			}
		});
	}

	async openInBrowser() {
		const state = await this.serverManager.getWorkspaceState();
		if (!state.bmadDir) {
			void vscode.window.showWarningMessage('No BMAD workspace is currently available to open.');
			return;
		}

		const serverUrl = await this.serverManager.ensureServer(state.bmadDir);
		await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
	}

	async update() {
		try {
			const state = await this.serverManager.getWorkspaceState();
			if (!state.workspaceFolder) {
				this.panel.webview.html = renderEditorEmpty(this.panel.webview, this.logoUri);
				return;
			}

			if (!state.bmadDir) {
				this.panel.webview.html = renderEditorMissingBmad(this.panel.webview, this.logoUri, state.workspaceFolder);
				return;
			}

			const serverUrl = await this.serverManager.ensureServer(state.bmadDir);
			this.panel.webview.html = renderEditorViewer(this.panel.webview, serverUrl, state.workspaceFolder, state.bmadDir);
		} catch (error) {
			this.panel.webview.html = renderEditorError(this.panel.webview, this.logoUri, error instanceof Error ? error.message : 'Unknown error.');
		}
	}
}

// ── Sidebar view provider ──────────────────────────────────────────

class BmadSidebarProvider {
	constructor(context, serverManager) {
		this.context = context;
		this.serverManager = serverManager;
		this.webviewView = null;
	}

	async resolveWebviewView(webviewView) {
		this.webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message?.type) {
				case 'open-dashboard':
					await BmadEditorPanel.open(this.context, this.serverManager);
					break;
				case 'open-in-browser': {
					const state = await this.serverManager.getWorkspaceState();
					if (state.bmadDir) {
						const serverUrl = await this.serverManager.ensureServer(state.bmadDir);
						await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
					}
					break;
				}
				case 'select-workspace-folder':
					await this.serverManager.selectWorkspaceFolder();
					await this.refresh();
					break;
				case 'open-folder':
					await vscode.commands.executeCommand('workbench.action.files.openFolder');
					break;
				default:
					break;
			}
		});

		await this.refresh();
	}

	async refresh() {
		if (!this.webviewView) {
			return;
		}

		const logoUri = this.webviewView.webview.asWebviewUri(
			vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'logo.png')),
		);

		try {
			const state = await this.serverManager.getWorkspaceState();
			this.webviewView.webview.html = renderSidebar(this.webviewView.webview, logoUri, state);
		} catch (error) {
			this.webviewView.webview.html = renderSidebar(this.webviewView.webview, logoUri, { workspaceFolder: null, bmadDir: null, error: error instanceof Error ? error.message : 'Unknown error' });
		}
	}
}

// ── Sidebar HTML ───────────────────────────────────────────────────

function renderSidebar(webview, logoUri, state) {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`img-src ${webview.cspSource} https: data:`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	let content;

	if (state.error) {
		content = `
			<div class="status error">
				<span class="status-icon">!</span>
				<span>${escapeHtml(state.error)}</span>
			</div>
			<button data-action="open-dashboard">Retry</button>`;
	} else if (!state.workspaceFolder) {
		content = `
			<p class="muted">Open a folder that contains a BMAD project to get started.</p>
			<button data-action="open-folder">Open Folder</button>`;
	} else if (!state.bmadDir) {
		content = `
			<div class="status warn">
				<span class="status-icon">?</span>
				<span>No <code>_bmad</code> folder found in <strong>${escapeHtml(state.workspaceFolder.name)}</strong></span>
			</div>
			<button class="secondary" data-action="select-workspace-folder">Change Folder</button>`;
	} else {
		content = `
			<div class="status ok">
				<span class="status-icon">&#10003;</span>
				<span>BMAD project detected in <strong>${escapeHtml(state.workspaceFolder.name)}</strong></span>
			</div>
			<button data-action="open-dashboard">Open Dashboard</button>
			<div class="links">
				<button class="link" data-action="open-in-browser">Open in Browser</button>
				<button class="link" data-action="select-workspace-folder">Change Folder</button>
			</div>`;
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>BMAD Viewer</title>
	<style>
		html, body {
			margin: 0;
			padding: 0;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}
		body {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 16px;
			padding: 20px 14px;
		}
		.logo {
			width: 64px;
			height: 64px;
			border-radius: 14px;
		}
		h2 {
			margin: 0;
			font-size: 15px;
			font-weight: 600;
			text-align: center;
		}
		p.muted {
			margin: 0;
			color: var(--vscode-descriptionForeground);
			text-align: center;
			line-height: 1.5;
		}
		.status {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			padding: 10px 12px;
			border-radius: 10px;
			width: 100%;
			line-height: 1.4;
		}
		.status-icon {
			flex-shrink: 0;
			width: 20px;
			height: 20px;
			border-radius: 50%;
			display: grid;
			place-items: center;
			font-size: 12px;
			font-weight: bold;
			color: #fff;
		}
		.status.ok {
			background: color-mix(in srgb, #2ea04380 30%, transparent);
		}
		.status.ok .status-icon { background: #2ea043; }
		.status.warn {
			background: color-mix(in srgb, #d29922 20%, transparent);
		}
		.status.warn .status-icon { background: #d29922; }
		.status.error {
			background: color-mix(in srgb, #f85149 20%, transparent);
		}
		.status.error .status-icon { background: #f85149; }
		code {
			background: var(--vscode-textCodeBlock-background);
			padding: 1px 4px;
			border-radius: 4px;
			font-size: 12px;
		}
		button {
			width: 100%;
			border: 0;
			border-radius: 8px;
			padding: 10px 14px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			cursor: pointer;
			font: inherit;
			font-weight: 600;
			font-size: 13px;
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.links {
			display: flex;
			flex-direction: column;
			gap: 4px;
			width: 100%;
		}
		button.link {
			background: transparent;
			color: var(--vscode-textLink-foreground);
			font-weight: 400;
			padding: 6px;
			font-size: 12px;
		}
		button.link:hover {
			background: transparent;
			text-decoration: underline;
		}
		.help {
			margin-top: 8px;
			padding: 12px;
			border-radius: 10px;
			border: 1px solid var(--vscode-panel-border);
			width: 100%;
		}
		.help h3 {
			margin: 0 0 8px 0;
			font-size: 12px;
			font-weight: 600;
			color: var(--vscode-descriptionForeground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		.help ul {
			margin: 0;
			padding: 0 0 0 16px;
			line-height: 1.8;
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
		}
	</style>
</head>
<body>
	<img class="logo" src="${logoUri}" alt="BMAD Viewer" />
	<h2>BMAD Viewer</h2>
	${content}
	<div class="help">
		<h3>Quick Start</h3>
		<ul>
			<li>Open a folder with a <code>_bmad</code> directory</li>
			<li>Click <strong>Open Dashboard</strong> to launch the viewer in the editor</li>
			<li>Use the board to manage epics, stories, and tasks</li>
			<li>Browse your project wiki and documentation</li>
		</ul>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		for (const button of document.querySelectorAll('button[data-action]')) {
			button.addEventListener('click', () => {
				vscode.postMessage({ type: button.dataset.action });
			});
		}
	</script>
</body>
</html>`;
}

// ── Editor panel HTML ──────────────────────────────────────────────

function renderEditorViewer(webview, serverUrl, workspaceFolder, bmadDir) {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`img-src ${webview.cspSource} https: data:`,
		`script-src 'nonce-${nonce}'`,
		`frame-src http://localhost:* http://127.0.0.1:*`,
	].join('; ');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>BMAD Viewer</title>
	<style>
		* { box-sizing: border-box; }
		html, body { margin: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
		body { display: flex; flex-direction: column; }
		.toolbar {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			padding: 8px 14px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editorWidget-background);
			flex-shrink: 0;
		}
		.heading { display: flex; align-items: center; gap: 8px; }
		.heading strong { font-size: 13px; }
		.heading span { color: var(--vscode-descriptionForeground); font-size: 11px; }
		.actions { display: flex; gap: 6px; flex-wrap: wrap; }
		button {
			border: 0;
			border-radius: 4px;
			padding: 4px 10px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			cursor: pointer;
			font: inherit;
			font-size: 12px;
		}
		button:hover { background: var(--vscode-button-secondaryHoverBackground); }
		button.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		button.primary:hover { background: var(--vscode-button-hoverBackground); }
		iframe {
			flex: 1;
			display: block;
			width: 100%;
			border: 0;
			background: #fff;
		}
	</style>
</head>
<body>
	<section class="toolbar">
		<div class="heading">
			<strong>${escapeHtml(workspaceFolder.name)}</strong>
			<span>${escapeHtml(bmadDir)}</span>
		</div>
		<div class="actions">
			<button data-action="select-workspace-folder">Change folder</button>
			<button data-action="refresh">Refresh</button>
			<button class="primary" data-action="open-in-browser">Open in browser</button>
		</div>
	</section>
	<iframe src="${serverUrl}" title="BMAD Viewer dashboard"></iframe>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		for (const button of document.querySelectorAll('button[data-action]')) {
			button.addEventListener('click', () => {
				vscode.postMessage({ type: button.dataset.action });
			});
		}
	</script>
</body>
</html>`;
}

function renderEditorStateCard(webview, logoUri, title, description, primaryLabel, primaryAction) {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`img-src ${webview.cspSource} https: data:`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>BMAD Viewer</title>
	<style>
		html, body { margin: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
		body { display: grid; place-items: center; padding: 40px; }
		.card { max-width: 480px; text-align: center; display: grid; gap: 16px; justify-items: center; }
		img { width: 80px; height: 80px; border-radius: 16px; }
		h1 { margin: 0; font-size: 22px; }
		p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.6; font-size: 14px; }
		button { border: 0; border-radius: 8px; padding: 10px 24px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; font: inherit; font-weight: 600; }
		button:hover { background: var(--vscode-button-hoverBackground); }
	</style>
</head>
<body>
	<section class="card">
		<img src="${logoUri}" alt="BMAD Viewer" />
		<h1>${escapeHtml(title)}</h1>
		<p>${escapeHtml(description)}</p>
		<button data-action="${primaryAction}">${escapeHtml(primaryLabel)}</button>
	</section>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		for (const button of document.querySelectorAll('button[data-action]')) {
			button.addEventListener('click', () => {
				vscode.postMessage({ type: button.dataset.action });
			});
		}
	</script>
</body>
</html>`;
}

function renderEditorEmpty(webview, logoUri) {
	return renderEditorStateCard(webview, logoUri,
		'Open a folder to get started',
		'BMAD Viewer needs a workspace folder with a _bmad directory to display your project dashboard.',
		'Open Folder', 'open-folder',
	);
}

function renderEditorMissingBmad(webview, logoUri, workspaceFolder) {
	return renderEditorStateCard(webview, logoUri,
		'No BMAD project found',
		`No _bmad folder was found in "${workspaceFolder.name}". Make sure your workspace contains a _bmad directory.`,
		'Choose Another Folder', 'select-workspace-folder',
	);
}

function renderEditorError(webview, logoUri, message) {
	return renderEditorStateCard(webview, logoUri,
		'Something went wrong',
		message,
		'Retry', 'refresh',
	);
}

// ── Helpers ────────────────────────────────────────────────────────

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function getNonce() {
	return Math.random().toString(36).slice(2, 12);
}

function loadExtensionVersion(context) {
	const packageJsonPath = path.join(context.extensionPath, 'package.json');
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	return packageJson.version;
}

// ── Activation ─────────────────────────────────────────────────────

function activate(context) {
	const serverManager = new BmadServerManager(context);
	const sidebarProvider = new BmadSidebarProvider(context, serverManager);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEW_ID, sidebarProvider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		}),
		vscode.commands.registerCommand('bmadViewer.focus', async () => {
			await BmadEditorPanel.open(context, serverManager);
		}),
		vscode.commands.registerCommand('bmadViewer.refresh', async () => {
			if (BmadEditorPanel.currentPanel) {
				await BmadEditorPanel.currentPanel.update();
			}
			await sidebarProvider.refresh();
		}),
		vscode.commands.registerCommand('bmadViewer.openInBrowser', async () => {
			const state = await serverManager.getWorkspaceState();
			if (!state.bmadDir) {
				void vscode.window.showWarningMessage('No BMAD workspace is currently available to open.');
				return;
			}
			const serverUrl = await serverManager.ensureServer(state.bmadDir);
			await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
		}),
		vscode.commands.registerCommand('bmadViewer.selectWorkspaceFolder', async () => {
			await serverManager.selectWorkspaceFolder();
			if (BmadEditorPanel.currentPanel) {
				await BmadEditorPanel.currentPanel.update();
			}
			await sidebarProvider.refresh();
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void sidebarProvider.refresh();
			if (BmadEditorPanel.currentPanel) {
				void BmadEditorPanel.currentPanel.update();
			}
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(EXTENSION_CONFIG)) {
				void sidebarProvider.refresh();
				if (BmadEditorPanel.currentPanel) {
					void BmadEditorPanel.currentPanel.update();
				}
			}
		}),
		{
			dispose() {
				void serverManager.dispose();
			},
		},
	);

	const extensionVersion = loadExtensionVersion(context);
	void vscode.commands.executeCommand('setContext', 'bmadViewer.extensionVersion', extensionVersion);

	if (vscode.workspace.getConfiguration(EXTENSION_CONFIG).get('openOnStartup', false) && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
		void BmadEditorPanel.open(context, serverManager);
	}
}

function deactivate() {
	return undefined;
}

module.exports = {
	activate,
	deactivate,
};
