import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlContent } from '../../src/parsers/parse-yaml.js';

describe('parseYamlContent', () => {
	it('parses valid YAML', () => {
		const yaml = 'name: test\nversion: 1.0';
		const result = parseYamlContent(yaml, 'test.yaml');
		assert.equal(result.errors.length, 0);
		assert.equal(result.data.name, 'test');
		assert.equal(result.data.version, 1.0);
	});

	it('returns error for invalid YAML', () => {
		const yaml = 'invalid: [unclosed bracket';
		const result = parseYamlContent(yaml, 'bad.yaml');
		assert.equal(result.errors.length, 1);
		assert.equal(result.data, null);
	});

	it('handles empty content with warning', () => {
		const result = parseYamlContent('', 'empty.yaml');
		assert.equal(result.warnings.length, 1);
	});

	it('parses nested YAML structures', () => {
		const yaml = 'development_status:\n  epic-1: in-progress\n  1-1-setup: done';
		const result = parseYamlContent(yaml, 'sprint.yaml');
		assert.equal(result.data.development_status['epic-1'], 'in-progress');
		assert.equal(result.data.development_status['1-1-setup'], 'done');
	});
});
