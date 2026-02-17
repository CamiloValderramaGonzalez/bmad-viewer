import { WebSocketServer } from 'ws';

/** @type {import('ws').WebSocketServer|null} */
let wss = null;

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {import('http').Server} server
 */
export function attachWebSocket(server) {
	wss = new WebSocketServer({ server });

	wss.on('connection', (ws) => {
		ws.on('error', () => {});
	});
}

/**
 * Broadcast a file change event to all connected WebSocket clients.
 * @param {string[]} changedPaths
 */
export function broadcastChange(changedPaths) {
	if (!wss) return;

	const message = JSON.stringify({
		type: 'file-changed',
		paths: changedPaths,
	});

	for (const client of wss.clients) {
		if (client.readyState === 1) { // WebSocket.OPEN
			client.send(message);
		}
	}
}

/**
 * Close all WebSocket connections.
 */
export function closeAllConnections() {
	if (wss) {
		wss.close();
	}
}

/**
 * Get the number of connected clients.
 * @returns {number}
 */
export function getClientCount() {
	return wss ? wss.clients.size : 0;
}
