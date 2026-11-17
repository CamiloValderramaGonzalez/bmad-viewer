/* bmad-viewer board-feedback.js - Pure helpers for board save/sync feedback and live reload */
(function (root) {
	'use strict';

	var STATUS_STORAGE_KEY = 'bmad-viewer:board-status';
	var STATUS_TTL_MS = 15000;
	var UNREACHABLE_MESSAGE = 'Could not reach the bmad-viewer server';
	var ACTION_MESSAGES = {
		save: 'Could not save the new status',
		sync: 'Could not sync the status to GitHub',
	};

	/**
	 * Decide what a tab does with a WebSocket message.
	 * - 'skip': not a file change.
	 * - 'defer': reload once this tab's in-flight save/sync finishes.
	 * - 'reload': reload now.
	 * @param {{type?: string}|null} message
	 * @param {boolean} inFlight
	 * @returns {'skip'|'defer'|'reload'}
	 */
	function reloadDecision(message, inFlight) {
		if (!message || message.type !== 'file-changed') return 'skip';
		return inFlight ? 'defer' : 'reload';
	}

	/**
	 * Plain message for a failed save or sync.
	 * @param {'save'|'sync'} action
	 * @param {{status?: number, network?: boolean}} [info]
	 * @returns {string}
	 */
	function failureMessage(action, info) {
		if (info && info.network) return UNREACHABLE_MESSAGE;
		var base = ACTION_MESSAGES[action] || 'The request failed';
		if (info && typeof info.status === 'number' && info.status >= 400) {
			return base + ' (HTTP ' + info.status + ')';
		}
		return base;
	}

	/**
	 * Read a JSON API response. Resolves with the payload when it is JSON with `ok` true;
	 * otherwise rejects with an Error carrying a plain message (the server's `error` when
	 * it sent one, else `failureMessage`).
	 * @param {Response} response
	 * @param {'save'|'sync'} action
	 * @returns {Promise<object>}
	 */
	function readJsonResponse(response, action) {
		return response.text().then(
			function (text) {
				var data = null;
				try {
					data = text ? JSON.parse(text) : null;
				} catch (e) {
					data = null;
				}

				if (!data || typeof data !== 'object') {
					throw new Error(failureMessage(action, { status: response.status }));
				}

				if (!data.ok || !response.ok) {
					throw new Error(
						typeof data.error === 'string' && data.error
							? data.error
							: failureMessage(action, { status: response.status }),
					);
				}

				return data;
			},
			function () {
				throw new Error(failureMessage(action, { network: true }));
			},
		);
	}

	/**
	 * Remember the final board message so it survives a reload. Never throws.
	 * @param {Storage|null} storage
	 * @param {string} msg
	 * @param {string} kind
	 * @param {number} now
	 */
	function storeStatus(storage, msg, kind, now) {
		try {
			if (!storage) return;
			if (!msg) {
				storage.removeItem(STATUS_STORAGE_KEY);
				return;
			}
			storage.setItem(
				STATUS_STORAGE_KEY,
				JSON.stringify({ message: String(msg), kind: kind || '', at: now }),
			);
		} catch (e) {
			/* storage blocked or full: feedback is best effort */
		}
	}

	/**
	 * Take the stored board message: read it, then remove it so it is shown once.
	 * Returns null when there is none, it is corrupt, or it is older than 15 s. Never throws.
	 * @param {Storage|null} storage
	 * @param {number} now
	 * @returns {{message: string, kind: string}|null}
	 */
	function takeStoredStatus(storage, now) {
		var raw = null;
		try {
			if (!storage) return null;
			raw = storage.getItem(STATUS_STORAGE_KEY);
		} catch (e) {
			return null;
		}
		if (!raw) return null;

		try {
			storage.removeItem(STATUS_STORAGE_KEY);
		} catch (e) {
			/* best effort */
		}

		try {
			var parsed = JSON.parse(raw);
			if (!parsed || typeof parsed.message !== 'string' || typeof parsed.at !== 'number') {
				return null;
			}
			var age = now - parsed.at;
			if (age < 0 || age > STATUS_TTL_MS) return null;
			return { message: parsed.message, kind: typeof parsed.kind === 'string' ? parsed.kind : '' };
		} catch (e) {
			return null;
		}
	}

	root.BmadBoardFeedback = {
		STATUS_TTL_MS: STATUS_TTL_MS,
		UNREACHABLE_MESSAGE: UNREACHABLE_MESSAGE,
		reloadDecision: reloadDecision,
		failureMessage: failureMessage,
		readJsonResponse: readJsonResponse,
		storeStatus: storeStatus,
		takeStoredStatus: takeStoredStatus,
	};
})(typeof window !== 'undefined' ? window : globalThis);
