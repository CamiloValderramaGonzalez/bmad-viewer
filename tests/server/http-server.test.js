import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
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

			const scriptResponse = await fetch(`${handle.url}/board-feedback.js`);
			assert.equal(scriptResponse.status, 200);
			assert.match(await scriptResponse.text(), /BmadBoardFeedback/);
		} finally {
			await handle.close();
		}
	});

	it('loads /board-feedback.js before /client.js in the dashboard page', async () => {
		const handle = await startServer({
			port: 4301,
			bmadDir: resolve('example-data'),
			open: false,
			interactive: false,
			attachProcessHandlers: false,
		});

		try {
			const response = await fetch(`${handle.url}/`);
			assert.equal(response.status, 200);
			const html = await response.text();
			const feedbackIndex = html.indexOf('<script src="/board-feedback.js"></script>');
			const clientIndex = html.indexOf('<script src="/client.js"></script>');
			assert.ok(feedbackIndex !== -1, 'dashboard should load /board-feedback.js');
			assert.ok(clientIndex !== -1, 'dashboard should load /client.js');
			assert.ok(feedbackIndex < clientIndex, '/board-feedback.js must load before /client.js');
		} finally {
			await handle.close();
		}
	});
});
