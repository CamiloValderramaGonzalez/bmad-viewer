import { createHash } from 'node:crypto';

/** @type {Set<import('net').Socket>} */
const clients = new Set();

/**
 * Handle WebSocket upgrade request manually using Node.js built-in APIs.
 * No external dependencies needed.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('net').Socket} socket
 * @param {Buffer} head
 */
export function handleUpgrade(req, socket, head) {
	const key = req.headers['sec-websocket-key'];
	if (!key) {
		socket.destroy();
		return;
	}

	const acceptKey = createHash('sha1')
		.update(`${key}258EAFA5-E914-47DA-95CA-5AB5DC11CE10`)
		.digest('base64');

	const responseHeaders = [
		'HTTP/1.1 101 Switching Protocols',
		'Upgrade: websocket',
		'Connection: Upgrade',
		`Sec-WebSocket-Accept: ${acceptKey}`,
		'',
		'',
	].join('\r\n');

	socket.write(responseHeaders);
	clients.add(socket);

	socket.on('close', () => clients.delete(socket));
	socket.on('error', () => {
		clients.delete(socket);
		socket.destroy();
	});

	// Handle incoming frames (ping/pong, close)
	socket.on('data', (buffer) => {
		const opcode = buffer[0] & 0x0f;
		// Close frame
		if (opcode === 0x08) {
			clients.delete(socket);
			socket.end();
		}
		// Ping frame — respond with pong
		if (opcode === 0x09) {
			const pong = Buffer.alloc(2);
			pong[0] = 0x8a; // FIN + pong opcode
			pong[1] = 0;
			socket.write(pong);
		}
	});
}

/**
 * Send a WebSocket text frame to a socket.
 * @param {import('net').Socket} socket
 * @param {string} message
 */
function sendFrame(socket, message) {
	const payload = Buffer.from(message, 'utf8');
	const frame = [];

	// FIN + text opcode
	frame.push(0x81);

	// Payload length
	if (payload.length < 126) {
		frame.push(payload.length);
	} else if (payload.length < 65536) {
		frame.push(126);
		frame.push((payload.length >> 8) & 0xff);
		frame.push(payload.length & 0xff);
	} else {
		frame.push(127);
		const lenBuf = Buffer.alloc(8);
		lenBuf.writeBigUInt64BE(BigInt(payload.length));
		frame.push(...lenBuf);
	}

	const header = Buffer.from(frame);
	socket.write(Buffer.concat([header, payload]));
}

/**
 * Broadcast a file change event to all connected WebSocket clients.
 * @param {string[]} changedPaths - Array of changed file paths
 */
export function broadcastChange(changedPaths) {
	const message = JSON.stringify({
		type: 'file-changed',
		paths: changedPaths,
	});

	for (const client of clients) {
		try {
			if (!client.destroyed) {
				sendFrame(client, message);
			}
		} catch {
			clients.delete(client);
		}
	}
}

/**
 * Close all WebSocket connections.
 */
export function closeAllConnections() {
	for (const client of clients) {
		try {
			client.end();
		} catch {
			// ignore
		}
	}
	clients.clear();
}

/**
 * Get the number of connected clients.
 * @returns {number}
 */
export function getClientCount() {
	return clients.size;
}
