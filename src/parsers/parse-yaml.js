import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { createResult, errorResult } from './result-type.js';

/**
 * Parse a YAML file and return Result type.
 * Wraps js-yaml with error handling for graceful degradation.
 *
 * @param {string} filePath - Path to YAML file
 * @returns {{data: object|null, errors: Error[], warnings: string[]}}
 */
export function parseYaml(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8');
		return parseYamlContent(content, filePath);
	} catch (error) {
		return errorResult(error, [`Failed to read ${filePath}`]);
	}
}

/**
 * Parse YAML content string.
 * @param {string} content - YAML string
 * @param {string} source - Source identifier for error messages
 * @returns {{data: object|null, errors: Error[], warnings: string[]}}
 */
export function parseYamlContent(content, source = 'unknown') {
	try {
		const data = yaml.load(content);

		if (data === undefined || data === null) {
			return createResult(null, [], [`Empty YAML content in ${source}`]);
		}

		return createResult(data, [], []);
	} catch (error) {
		const warnings = [`Failed to parse ${source}`];

		// Extract line number from js-yaml error if available
		if (error.mark && error.mark.line !== undefined) {
			warnings.push(`YAML syntax error at line ${error.mark.line + 1} in ${source}`);
		}

		return errorResult(error, warnings);
	}
}
