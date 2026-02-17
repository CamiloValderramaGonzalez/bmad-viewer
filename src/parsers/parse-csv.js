import { readFileSync } from 'node:fs';
import { createResult, errorResult } from './result-type.js';

/**
 * Parse a CSV file into an array of objects.
 * Custom parser (~50 lines) — handles quoted fields and escaped commas.
 *
 * @param {string} filePath - Path to CSV file
 * @returns {{data: object[]|null, errors: Error[], warnings: string[]}}
 */
export function parseCsv(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8');
		return parseCsvContent(content, filePath);
	} catch (error) {
		return errorResult(error, [`Failed to read ${filePath}`]);
	}
}

/**
 * Parse CSV content string into array of objects.
 * @param {string} content - CSV string
 * @param {string} source - Source identifier for error messages
 * @returns {{data: object[]|null, errors: Error[], warnings: string[]}}
 */
export function parseCsvContent(content, source = 'unknown') {
	const warnings = [];

	try {
		const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
		if (lines.length === 0) {
			return createResult([], [], ['Empty CSV file']);
		}

		const headers = parseCsvLine(lines[0]);

		if (headers.length === 0) {
			return errorResult(new Error(`No headers found in ${source}`));
		}

		const rows = [];
		for (let i = 1; i < lines.length; i++) {
			const values = parseCsvLine(lines[i]);
			if (values.length !== headers.length) {
				warnings.push(
					`Row ${i + 1} in ${source}: expected ${headers.length} columns, got ${values.length}`,
				);
				// Pad or truncate to match headers
				while (values.length < headers.length) values.push('');
			}
			const row = {};
			for (let j = 0; j < headers.length; j++) {
				row[headers[j]] = values[j] || '';
			}
			rows.push(row);
		}

		return createResult(rows, [], warnings);
	} catch (error) {
		return errorResult(error, [`Failed to parse CSV from ${source}`]);
	}
}

/**
 * Parse a single CSV line, handling quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
	const fields = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (inQuotes) {
			if (char === '"' && nextChar === '"') {
				current += '"';
				i++; // skip escaped quote
			} else if (char === '"') {
				inQuotes = false;
			} else {
				current += char;
			}
		} else {
			if (char === '"') {
				inQuotes = true;
			} else if (char === ',') {
				fields.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}
	}

	fields.push(current.trim());
	return fields;
}
