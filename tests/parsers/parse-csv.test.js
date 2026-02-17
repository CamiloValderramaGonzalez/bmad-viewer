import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvContent } from '../../src/parsers/parse-csv.js';

describe('parseCsvContent', () => {
	it('parses basic CSV with headers', () => {
		const csv = 'ID,Title,Type\n1,Agent One,agent\n2,Workflow Two,workflow';
		const result = parseCsvContent(csv, 'test.csv');
		assert.equal(result.errors.length, 0);
		assert.equal(result.data.length, 2);
		assert.equal(result.data[0].ID, '1');
		assert.equal(result.data[0].Title, 'Agent One');
		assert.equal(result.data[1].Type, 'workflow');
	});

	it('handles quoted fields with commas', () => {
		const csv = 'Name,Description\n"Smith, John","A person, obviously"';
		const result = parseCsvContent(csv, 'test.csv');
		assert.equal(result.data[0].Name, 'Smith, John');
		assert.equal(result.data[0].Description, 'A person, obviously');
	});

	it('handles escaped quotes inside quoted fields', () => {
		const csv = 'Name,Desc\n"Say ""hello""","test"';
		const result = parseCsvContent(csv, 'test.csv');
		assert.equal(result.data[0].Name, 'Say "hello"');
	});

	it('returns empty array for empty content', () => {
		const result = parseCsvContent('', 'test.csv');
		assert.deepEqual(result.data, []);
	});

	it('warns on mismatched column count', () => {
		const csv = 'A,B,C\n1,2';
		const result = parseCsvContent(csv, 'test.csv');
		assert.equal(result.warnings.length, 1);
		assert.equal(result.data.length, 1);
		assert.equal(result.data[0].C, '');
	});
});
