const vscode = require('vscode');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const VIEW_CONTAINER_COMMAND = 'workbench.view.extension.bmadViewer';
const VIEW_ID = 'bmadViewer.dashboard';
const EXTENSION_CONFIG = 'bmadViewer';

class BmadViewerProvider {
	constructor(context) {
		this.context = context;
		this.webviewView = null;
		this.serverHandle = null;
		this.activeBmadDir = null;
		this.selectedWorkspaceFolder = null;
		this.viewerModulesPromise = null;
	}

	async resolveWebviewView(webviewView) {
		this.webviewView = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message?.type) {
				case 'refresh':
					await this.refresh();
					break;
				case 'open-in-browser':
					await this.openInBrowser();
					break;
				case 'select-workspace-folder':
					await this.selectWorkspaceFolder();
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

		try {
			const state = await this.getWorkspaceState();
			if (!state.workspaceFolder) {
				await this.stopServer();
				this.webviewView.webview.html = this.renderEmptyWorkspace();
				return;
			}

			if (!state.bmadDir) {
				await this.stopServer();
				this.webviewView.webview.html = this.renderMissingBmad(state.workspaceFolder);
				return;
			}

			const serverUrl = await this.ensureServer(state.bmadDir);
			this.webviewView.webview.html = this.renderViewer({
				serverUrl,
				workspaceFolder: state.workspaceFolder,
				bmadDir: state.bmadDir,
			});
		} catch (error) {
			await this.stopServer();
			this.webviewView.webview.html = this.renderError(error instanceof Error ? error.message : 'Unknown extension error.');
		}
	}

	async openInBrowser() {
		const state = await this.getWorkspaceState();
		if (!state.bmadDir) {
			void vscode.window.showWarningMessage('No BMAD workspace is currently available to open.');
			return;
		}

		const serverUrl = await this.ensureServer(state.bmadDir);
		await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
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
		await this.refresh();
	}

	async dispose() {
		await this.stopServer();
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

	renderViewer({ serverUrl, workspaceFolder, bmadDir }) {
		const nonce = getNonce();
		const csp = [
			"default-src 'none'",
			`style-src ${this.webviewView.webview.cspSource} 'unsafe-inline'`,
			`img-src ${this.webviewView.webview.cspSource} https: data:`,
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
		:root {
			color-scheme: light dark;
			--bg: var(--vscode-editor-background);
			--panel: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
			--border: var(--vscode-panel-border);
			--text: var(--vscode-editor-foreground);
			--muted: var(--vscode-descriptionForeground);
			--accent: var(--vscode-button-background);
			--accent-text: var(--vscode-button-foreground);
		}

		* { box-sizing: border-box; }
		html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: var(--vscode-font-family); }
		body { display: grid; grid-template-rows: auto 1fr; gap: 12px; padding: 12px; }
		.toolbar {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 12px 14px;
			border: 1px solid var(--border);
			border-radius: 14px;
			background: var(--panel);
		}
		.heading { display: grid; gap: 4px; }
		.heading strong { font-size: 13px; }
		.heading span { color: var(--muted); font-size: 11px; }
		.actions { display: flex; gap: 8px; flex-wrap: wrap; }
		button {
			border: 0;
			border-radius: 999px;
			padding: 8px 12px;
			background: var(--accent);
			color: var(--accent-text);
			cursor: pointer;
			font: inherit;
		}
		button.secondary {
			background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 90%, transparent);
			color: var(--vscode-button-secondaryForeground);
		}
		.frame {
			min-height: 420px;
			height: 100%;
			border: 1px solid var(--border);
			border-radius: 18px;
			overflow: hidden;
			background: var(--panel);
		}
		iframe {
			display: block;
			width: 100%;
			height: 100%;
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
			<button class="secondary" data-action="select-workspace-folder">Change folder</button>
			<button class="secondary" data-action="refresh">Refresh</button>
			<button data-action="open-in-browser">Open in browser</button>
		</div>
	</section>
	<section class="frame">
		<iframe src="${serverUrl}" title="BMAD Viewer dashboard"></iframe>
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

	renderEmptyWorkspace() {
		return this.renderStateCard({
			title: 'Open a folder to load BMAD Viewer',
			description: 'The extension needs a workspace folder so it can locate a BMAD project and start the embedded dashboard.',
			primaryLabel: 'Open folder',
			primaryAction: 'open-folder',
		});
	}

	renderMissingBmad(workspaceFolder) {
		return this.renderStateCard({
			title: 'No BMAD project found in this workspace',
			description: `We looked for a _bmad folder starting from ${workspaceFolder.uri.fsPath} and up to three parent folders.`,
			primaryLabel: 'Choose another folder',
			primaryAction: 'select-workspace-folder',
			secondaryLabel: 'Refresh',
			secondaryAction: 'refresh',
		});
	}

	renderError(message) {
		return this.renderStateCard({
			title: 'BMAD Viewer could not start',
			description: message,
			primaryLabel: 'Retry',
			primaryAction: 'refresh',
		});
	}

	renderStateCard({ title, description, primaryLabel, primaryAction, secondaryLabel, secondaryAction }) {
		const nonce = getNonce();
		const csp = [
			"default-src 'none'",
			`style-src ${this.webviewView.webview.cspSource} 'unsafe-inline'`,
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
		html, body {
			margin: 0;
			height: 100%;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
		body {
			display: grid;
			place-items: center;
			padding: 24px;
		}
		.card {
			max-width: 520px;
			padding: 24px;
			border-radius: 18px;
			border: 1px solid var(--vscode-panel-border);
			background: color-mix(in srgb, var(--vscode-editorWidget-background) 88%, transparent);
			display: grid;
			gap: 12px;
		}
		h1 { margin: 0; font-size: 20px; }
		p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
		.actions { display: flex; gap: 10px; flex-wrap: wrap; }
		button {
			border: 0;
			border-radius: 999px;
			padding: 8px 12px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			cursor: pointer;
			font: inherit;
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
	</style>
</head>
<body>
	<section class="card">
		<h1>${escapeHtml(title)}</h1>
		<p>${escapeHtml(description)}</p>
		<div class="actions">
			<button data-action="${primaryAction}">${escapeHtml(primaryLabel)}</button>
			${secondaryLabel && secondaryAction ? `<button class="secondary" data-action="${secondaryAction}">${escapeHtml(secondaryLabel)}</button>` : ''}
		</div>
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
}

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

function activate(context) {
	const provider = new BmadViewerProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		}),
		vscode.commands.registerCommand('bmadViewer.focus', async () => {
			await vscode.commands.executeCommand(VIEW_CONTAINER_COMMAND);
			await provider.refresh();
		}),
		vscode.commands.registerCommand('bmadViewer.refresh', async () => {
			await provider.refresh();
		}),
		vscode.commands.registerCommand('bmadViewer.openInBrowser', async () => {
			await provider.openInBrowser();
		}),
		vscode.commands.registerCommand('bmadViewer.selectWorkspaceFolder', async () => {
			await provider.selectWorkspaceFolder();
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void provider.refresh();
		}),
		vscode.window.onDidChangeActiveTextEditor(() => {
			void provider.refresh();
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(EXTENSION_CONFIG)) {
				void provider.refresh();
			}
		}),
		{
			dispose() {
				void provider.dispose();
			},
		},
	);

	const extensionVersion = loadExtensionVersion(context);
	void vscode.commands.executeCommand('setContext', 'bmadViewer.extensionVersion', extensionVersion);

	if (vscode.workspace.getConfiguration(EXTENSION_CONFIG).get('openOnStartup', false) && (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
		void vscode.commands.executeCommand(VIEW_CONTAINER_COMMAND);
	}
}

function deactivate() {
	return undefined;
}

module.exports = {
	activate,
	deactivate,
};
