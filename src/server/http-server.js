import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { getMimeType } from './mime-types.js';
import { findAvailablePort } from './port-finder.js';
import { attachWebSocket, broadcastChange, closeAllConnections } from './websocket.js';
import { createFileWatcher } from '../watchers/file-watcher.js';
import { buildDataModel } from '../data/data-model.js';
import { updateSprintStatusFile } from '../data/sprint-status-updater.js';
import { loadIntegrationsConfig, toPublicIntegrationsConfig } from '../integrations/integration-store.js';
import { applyGitHubSync, connectGitHubIntegration, hasGitHubIntegration, previewGitHubSync, syncGitHubProject, syncGitHubStatusForStory } from '../integrations/github/github-sync.js';
import { renderDashboard } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

/**
 * Start the bmad-viewer HTTP server.
 * @param {{
 *   port: number|null,
 *   bmadDir: string,
 *   open: boolean,
 *   interactive?: boolean,
 *   attachProcessHandlers?: boolean,
 *   host?: string
 * }} options
 * @returns {Promise<{server: import('node:http').Server, port: number, url: string, close: () => Promise<void>}>}
 */
export async function startServer({
	port,
	bmadDir,
	open,
	interactive = true,
	attachProcessHandlers = interactive,
	host = '127.0.0.1',
}) {
	const actualPort = await findAvailablePort(port);

	// Custom path overrides (can be set via API)
	const overrides = { customEpicsPath: null, customOutputPath: null, customSprintStatusPath: null };

	// Build initial data model
	let dataModel = buildDataModel(bmadDir, overrides);

	// Create HTTP server
	const server = createServer((req, res) => {
		const url = new URL(req.url, `http://localhost:${actualPort}`);
		const pathname = url.pathname;

		// Security headers
		res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
		res.setHeader('X-Content-Type-Options', 'nosniff');

		// API endpoint: set custom paths
		if (pathname === '/api/set-paths' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				try {
					const data = JSON.parse(body);
					if (data.epicsPath !== undefined) overrides.customEpicsPath = data.epicsPath || null;
					if (data.outputPath !== undefined) overrides.customOutputPath = data.outputPath || null;
					if (data.sprintStatusPath !== undefined) overrides.customSprintStatusPath = data.sprintStatusPath || null;
					dataModel = buildDataModel(bmadDir, overrides);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ ok: true, epics: dataModel.project.epics.length, stories: dataModel.project.stories.total }));
				} catch {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
				}
			});
			return;
		}

		// API endpoint: get current overrides
		if (pathname === '/api/get-paths') {
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify(overrides));
			return;
		}

		// API endpoint: integrations overview
		if (pathname === '/api/integrations') {
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify(toPublicIntegrationsConfig(loadIntegrationsConfig(bmadDir))));
			return;
		}

		// API endpoint: connect github integration
		if (pathname === '/api/integrations/github/connect' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', async () => {
				try {
					const payload = JSON.parse(body);
					const result = await connectGitHubIntegration(bmadDir, payload);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, ...result }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not connect GitHub integration' }));
				}
			});
			return;
		}

		// API endpoint: preview github sync
		if (pathname === '/api/integrations/github/preview' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', async () => {
				try {
					if (body) JSON.parse(body);
					dataModel = buildDataModel(bmadDir, overrides);
					const result = await previewGitHubSync(bmadDir, dataModel.project);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, ...result }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not preview GitHub sync' }));
				}
			});
			return;
		}

		// API endpoint: apply github sync
		if (pathname === '/api/integrations/github/sync' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', async () => {
				try {
					if (body) JSON.parse(body);
					dataModel = buildDataModel(bmadDir, overrides);
					const result = await applyGitHubSync(bmadDir, dataModel.project);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, ...result }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not sync GitHub issues' }));
				}
			});
			return;
		}

		// API endpoint: create or sync github project board
		if (pathname === '/api/integrations/github/project/sync' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', async () => {
				try {
					if (body) JSON.parse(body);
					dataModel = buildDataModel(bmadDir, overrides);
					const result = await syncGitHubProject(bmadDir, dataModel.project);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, ...result }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not create GitHub project board' }));
				}
			});
			return;
		}

		// API endpoint: sync a moved story status to GitHub immediately
		if (pathname === '/api/integrations/github/story-status' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', async () => {
				try {
					const payload = JSON.parse(body);
					if (!hasGitHubIntegration(bmadDir)) {
						res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
						res.end(JSON.stringify({ ok: true, skipped: true, reason: 'github-not-connected' }));
						return;
					}

					dataModel = buildDataModel(bmadDir, overrides);
					const result = await syncGitHubStatusForStory(bmadDir, dataModel.project, payload.storyId);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: true, ...result }));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not sync GitHub status' }));
				}
			});
			return;
		}

		// API endpoint: update story status in sprint-status
		if (pathname === '/api/story-status' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				try {
					const data = JSON.parse(body);
					const storyId = data.storyId;
					const nextStatus = data.nextStatus;
					const sprintBoard = dataModel.project.board;

					if (!sprintBoard?.editable || !sprintBoard.sprintStatusPath) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ ok: false, error: 'Board is read-only because no writable sprint-status source was detected' }));
						return;
					}

					const update = updateSprintStatusFile({
						filePath: sprintBoard.sprintStatusPath,
						storyId,
						nextStatus,
					});

					dataModel = buildDataModel(bmadDir, overrides);
					res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({
						ok: true,
						update,
						stories: dataModel.project.stories,
					}));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Could not update story status' }));
				}
			});
			return;
		}

		// API endpoint: get fresh HTML
		if (pathname === '/api/dashboard') {
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			dataModel = buildDataModel(bmadDir, overrides);
			const html = renderDashboard(dataModel);
			res.end(JSON.stringify({ html }));
			return;
		}

		// Serve static files from public/
		if (pathname !== '/') {
			const filePath = join(PUBLIC_DIR, pathname);
			if (existsSync(filePath)) {
				const ext = extname(filePath);
				const mime = getMimeType(ext);
				res.writeHead(200, { 'Content-Type': mime });
				res.end(readFileSync(filePath));
				return;
			}
		}

		// Serve main dashboard HTML
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		const html = renderDashboard(dataModel);
		res.end(html);
	});

	// WebSocket server
	attachWebSocket(server);

	// File watcher for live reload
	const pendingChanges = [];
	let debounceTimer = null;

	const watcher = createFileWatcher(bmadDir, ({ type, path }) => {
		pendingChanges.push(path);

		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			dataModel = buildDataModel(bmadDir, overrides);
			broadcastChange([...pendingChanges]);
			pendingChanges.length = 0;
		}, 150);
	});

	const displayHost = host === '127.0.0.1' ? 'localhost' : host;
	const url = `http://${displayHost}:${actualPort}`;
	let stdinHandler = null;
	let sigintHandler = null;
	let sigtermHandler = null;
	let cleanedUp = false;

	async function cleanupResources() {
		if (cleanedUp) {
			return;
		}
		cleanedUp = true;

		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		if (stdinHandler && process.stdin.isTTY) {
			process.stdin.off('data', stdinHandler);
			try {
				process.stdin.setRawMode(false);
			} catch {
				// Ignore unsupported terminals.
			}
			process.stdin.pause();
		}

		if (sigintHandler) {
			process.off('SIGINT', sigintHandler);
		}

		if (sigtermHandler) {
			process.off('SIGTERM', sigtermHandler);
		}

		await watcher.close();
		closeAllConnections();
	}

	async function close() {
		await cleanupResources();

		if (!server.listening) {
			return;
		}

		await new Promise((resolve) => {
			server.close(() => resolve());
		});
	}

	server.on('close', () => {
		void cleanupResources();
	});

	if (attachProcessHandlers) {
		sigintHandler = () => {
			console.log('\nShutting down...');
			void close().finally(() => process.exit(0));
		};

		sigtermHandler = () => {
			void close().finally(() => process.exit(0));
		};

		process.on('SIGINT', sigintHandler);
		process.on('SIGTERM', sigtermHandler);
	}

	// Start listening
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(actualPort, host, () => {
			server.off('error', reject);
		console.log(`\n  bmad-viewer running at ${url}`);
		if (interactive) {
			console.log('  Press o to open in browser, q to quit\n');
		} else {
			console.log('');
		}

		if (open) {
			openBrowser(url);
		}

		// Listen for keypresses
		if (interactive && process.stdin.isTTY) {
			process.stdin.setRawMode(true);
			process.stdin.resume();
			stdinHandler = (key) => {
				const ch = key.toString();
				if (ch === 'o' || ch === 'O') {
					openBrowser(url);
					console.log(`  Opening ${url}`);
				} else if (ch === 'q' || ch === 'Q' || ch === '\u0003') {
					console.log('\nShutting down...');
					void close().finally(() => process.exit(0));
				}
			};
			process.stdin.on('data', stdinHandler);
		}
		resolve();
	});
	});

	return {
		server,
		port: actualPort,
		url,
		close,
	};
}

/**
 * Open URL in default browser (cross-platform).
 * @param {string} url
 */
function openBrowser(url) {
	const { platform } = process;
	const cmd =
		platform === 'darwin'
			? 'open'
			: platform === 'win32'
				? 'start'
				: 'xdg-open';

	import('node:child_process').then(({ exec }) => {
		exec(`${cmd} ${url}`);
	});
}
