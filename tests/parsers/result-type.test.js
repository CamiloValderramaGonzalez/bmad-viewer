import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createResult, successResult, errorResult } from '../../src/parsers/result-type.js';

describe('Result Type', () => {
	it('createResult returns correct structure', () => {
		const result = createResult({ value: 1 }, [], ['warn']);
		assert.deepEqual(result.data, { value: 1 });
		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.warnings, ['warn']);
	});

	it('successResult has no errors', () => {
		const result = successResult({ ok: true });
		assert.deepEqual(result.errors, []);
		assert.ok(result.data.ok);
	});

	it('errorResult has null data', () => {
		const result = errorResult('Something failed');
		assert.equal(result.data, null);
		assert.equal(result.errors.length, 1);
		assert.ok(result.errors[0] instanceof Error);
	});

	it('errorResult accepts Error objects', () => {
		const err = new Error('test error');
		const result = errorResult(err);
		assert.equal(result.errors[0], err);
	});

	it('createResult defaults to null data and empty arrays', () => {
		const result = createResult();
		assert.equal(result.data, null);
		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.warnings, []);
	});
});
