import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

function loadFeedback(extraGlobals = {}) {
	const source = readFileSync(resolve('public/board-feedback.js'), 'utf8');
	const context = vm.createContext({ ...extraGlobals });
	vm.runInContext(source, context, { filename: 'board-feedback.js' });
	return context.BmadBoardFeedback;
}

function memoryStorage() {
	const items = new Map();
	return {
		getItem: (key) => (items.has(key) ? items.get(key) : null),
		setItem: (key, value) => items.set(key, String(value)),
		removeItem: (key) => items.delete(key),
	};
}

const throwingStorage = {
	getItem() {
		throw new Error('SecurityError');
	},
	setItem() {
		throw new Error('QuotaExceededError');
	},
	removeItem() {
		throw new Error('SecurityError');
	},
};

const feedback = loadFeedback();

describe('board-feedback loading', () => {
	it('assigns window.BmadBoardFeedback when window exists', () => {
		const window = {};
		const source = readFileSync(resolve('public/board-feedback.js'), 'utf8');
		const context = vm.createContext({ window });
		vm.runInContext(source, context);
		assert.equal(typeof window.BmadBoardFeedback.reloadDecision, 'function');
	});

	it('assigns globalThis.BmadBoardFeedback when window is absent', () => {
		assert.equal(typeof feedback.takeStoredStatus, 'function');
		assert.equal(typeof feedback.readJsonResponse, 'function');
	});
});

describe('reloadDecision', () => {
	const changed = { type: 'file-changed', paths: ['sprint-status.yaml'] };

	it('reloads a tab with nothing in flight (other tab, or own write after a fast save)', () => {
		assert.equal(feedback.reloadDecision(changed, false), 'reload');
	});

	it('defers while this tab has a save or sync in flight (own write, slow sync)', () => {
		assert.equal(feedback.reloadDecision(changed, true), 'defer');
	});

	it('ignores messages that are not file changes', () => {
		assert.equal(feedback.reloadDecision({ type: 'other' }, false), 'skip');
		assert.equal(feedback.reloadDecision({ type: 'other' }, true), 'skip');
		assert.equal(feedback.reloadDecision(null, false), 'skip');
	});

	it('turns several broadcasts during one operation into exactly one reload', () => {
		// Mirrors the client wiring: defer sets a pending flag; the operation's finally reloads once.
		let pending = false;
		let reloads = 0;
		const onMessage = (message, inFlight) => {
			const decision = feedback.reloadDecision(message, inFlight);
			if (decision === 'reload') reloads++;
			else if (decision === 'defer') pending = true;
		};
		const finishOperation = () => {
			if (pending) {
				pending = false;
				reloads++;
			}
		};

		onMessage(changed, true);
		onMessage(changed, true);
		assert.equal(reloads, 0);
		finishOperation();
		assert.equal(reloads, 1);
		finishOperation();
		assert.equal(reloads, 1);
	});
});

describe('failureMessage', () => {
	it('names the action and HTTP status', () => {
		assert.equal(
			feedback.failureMessage('save', { status: 500 }),
			'Could not save the new status (HTTP 500)',
		);
		assert.equal(
			feedback.failureMessage('sync', { status: 502 }),
			'Could not sync the status to GitHub (HTTP 502)',
		);
	});

	it('adds no HTTP suffix for a 2xx status', () => {
		assert.equal(feedback.failureMessage('save', { status: 200 }), 'Could not save the new status');
	});

	it('reports an unreachable server for network failures', () => {
		assert.equal(
			feedback.failureMessage('save', { network: true }),
			'Could not reach the bmad-viewer server',
		);
		assert.equal(
			feedback.failureMessage('sync', { network: true }),
			'Could not reach the bmad-viewer server',
		);
	});
});

describe('readJsonResponse', () => {
	it('turns an HTML 500 into a plain message', async () => {
		const response = new Response('<html><body>Internal Server Error</body></html>', {
			status: 500,
			headers: { 'Content-Type': 'text/html' },
		});
		await assert.rejects(feedback.readJsonResponse(response, 'save'), {
			message: 'Could not save the new status (HTTP 500)',
		});
	});

	it('turns an empty 502 into a plain message', async () => {
		const response = new Response(null, { status: 502 });
		await assert.rejects(feedback.readJsonResponse(response, 'sync'), {
			message: 'Could not sync the status to GitHub (HTTP 502)',
		});
	});

	it('rejects JSON { ok: false } with the server error, or a fallback', async () => {
		const withError = new Response(JSON.stringify({ ok: false, error: 'Story not found' }), {
			status: 400,
		});
		await assert.rejects(feedback.readJsonResponse(withError, 'save'), {
			message: 'Story not found',
		});

		const bare = new Response(JSON.stringify({ ok: false }), { status: 200 });
		await assert.rejects(feedback.readJsonResponse(bare, 'save'), {
			message: 'Could not save the new status',
		});
	});

	it('resolves JSON { ok: true }', async () => {
		const response = new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
		const data = await feedback.readJsonResponse(response, 'sync');
		assert.equal(data.ok, true);
		assert.equal(data.skipped, true);
	});

	it('reports an unreachable server when the body cannot be read', async () => {
		const broken = {
			status: 200,
			ok: true,
			text: () => Promise.reject(new TypeError('network error')),
		};
		await assert.rejects(feedback.readJsonResponse(broken, 'save'), {
			message: 'Could not reach the bmad-viewer server',
		});
	});
});

describe('stored status', () => {
	it('round-trips the final message across a deferred reload', () => {
		const storage = memoryStorage();
		const now = 1_000_000;

		assert.equal(feedback.reloadDecision({ type: 'file-changed', paths: [] }, true), 'defer');
		feedback.storeStatus(storage, 'Saved locally and synced to GitHub.', 'ok', now);

		const restored = feedback.takeStoredStatus(storage, now + 900);
		assert.equal(restored.message, 'Saved locally and synced to GitHub.');
		assert.equal(restored.kind, 'ok');
	});

	it('is one-shot: a second reload does not show the message again', () => {
		const storage = memoryStorage();
		feedback.storeStatus(storage, 'Saved', 'ok', 0);
		assert.notEqual(feedback.takeStoredStatus(storage, 1), null);
		assert.equal(feedback.takeStoredStatus(storage, 2), null);
	});

	it('expires after 15 s', () => {
		const storage = memoryStorage();
		feedback.storeStatus(storage, 'Saved', 'ok', 0);
		assert.notEqual(feedback.takeStoredStatus(storage, 15_000), null);

		feedback.storeStatus(storage, 'Saved', 'ok', 0);
		assert.equal(feedback.takeStoredStatus(storage, 15_001), null);
		assert.equal(storage.getItem('bmad-viewer:board-status'), null);
	});

	it('rejects a message stamped in the future (clock moved backwards)', () => {
		const storage = memoryStorage();
		feedback.storeStatus(storage, 'Saved', 'ok', 10_000);
		assert.equal(feedback.takeStoredStatus(storage, 5_000), null);
	});

	it('clears the stored message when given an empty one (new drag)', () => {
		const storage = memoryStorage();
		feedback.storeStatus(storage, 'Saved', 'ok', 0);
		feedback.storeStatus(storage, '', '', 1);
		assert.equal(storage.getItem('bmad-viewer:board-status'), null);
		assert.equal(feedback.takeStoredStatus(storage, 2), null);
	});

	it('never throws when storage is blocked or missing', () => {
		assert.doesNotThrow(() => feedback.storeStatus(throwingStorage, 'Saved', 'ok', 0));
		assert.equal(feedback.takeStoredStatus(throwingStorage, 0), null);
		assert.doesNotThrow(() => feedback.storeStatus(null, 'Saved', 'ok', 0));
		assert.equal(feedback.takeStoredStatus(null, 0), null);
		assert.equal(feedback.takeStoredStatus(undefined, 0), null);
	});

	it('still returns the message when removal is blocked', () => {
		const storage = memoryStorage();
		feedback.storeStatus(storage, 'Saved', 'ok', 0);
		storage.removeItem = () => {
			throw new Error('SecurityError');
		};
		assert.equal(feedback.takeStoredStatus(storage, 1).message, 'Saved');
	});

	it('ignores and removes corrupt stored values', () => {
		const storage = memoryStorage();
		storage.setItem('bmad-viewer:board-status', '{not json');
		assert.equal(feedback.takeStoredStatus(storage, 0), null);
		assert.equal(storage.getItem('bmad-viewer:board-status'), null);
	});
});
