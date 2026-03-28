import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { startServer } from '../../src/server/http-server.js';

describe('startServer', () => {
	it('starts in embedded mode and serves dashboard HTML', async () => {
		const handle = await startServer({
			port: 4300,
			bmadDir: resolve('example-data'),
			open: false,
			interactive: false,
			attachProcessHandlers: false,
		});

		try {
			const response = await fetch(`${handle.url}/api/dashboard`);
			assert.equal(response.status, 200);

			const payload = await response.json();
			assert.match(payload.html, /project-dashboard/);
		} finally {
			await handle.close();
		}
	});
});
