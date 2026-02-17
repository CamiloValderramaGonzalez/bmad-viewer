import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { getMimeType } from './mime-types.js';
import { findAvailablePort } from './port-finder.js';
import { handleUpgrade, broadcastChange } from './websocket.js';
import { createFileWatcher } from '../watchers/file-watcher.js';
import { buildDataModel } from '../data/data-model.js';
import { renderDashboard } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

/**
 * Start the bmad-viewer HTTP server.
 * @param {{port: number|null, bmadDir: string, open: boolean}} options
 */
export async function startServer({ port, bmadDir, open }) {
	const actualPort = await findAvailablePort(port);

	// Build initial data model
	let dataModel = buildDataModel(bmadDir);

	// Create HTTP server
	const server = createServer((req, res) => {
		const url = new URL(req.url, `http://localhost:${actualPort}`);
		const pathname = url.pathname;

		// Security headers
		res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
		res.setHeader('X-Content-Type-Options', 'nosniff');

		// API endpoint: get fresh HTML
		if (pathname === '/api/dashboard') {
			res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
			dataModel = buildDataModel(bmadDir);
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

	// WebSocket upgrade handler
	server.on('upgrade', (req, socket, head) => {
		handleUpgrade(req, socket, head);
	});

	// File watcher for live reload
	const pendingChanges = [];
	let debounceTimer = null;

	createFileWatcher(bmadDir, ({ type, path }) => {
		pendingChanges.push(path);

		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			dataModel = buildDataModel(bmadDir);
			broadcastChange([...pendingChanges]);
			pendingChanges.length = 0;
		}, 150);
	});

	// Start listening
	server.listen(actualPort, '127.0.0.1', () => {
		const url = `http://localhost:${actualPort}`;
		console.log(`\n  bmad-viewer running at ${url}\n`);

		if (open) {
			openBrowser(url);
		}
	});

	// Graceful shutdown
	process.on('SIGINT', () => {
		console.log('\nShutting down...');
		server.close();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		server.close();
		process.exit(0);
	});
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
