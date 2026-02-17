/**
 * Creates a standardized Result type for parser outputs.
 * Pattern: {data, errors, warnings} for graceful degradation.
 *
 * @param {*} data - Parsed data (null if parse completely failed)
 * @param {Error[]} errors - Critical errors
 * @param {string[]} warnings - Non-critical issues
 * @returns {{data: *, errors: Error[], warnings: string[]}}
 */
export function createResult(data = null, errors = [], warnings = []) {
	return {
		data,
		errors: Array.isArray(errors) ? errors : [errors],
		warnings: Array.isArray(warnings) ? warnings : [warnings],
	};
}

/**
 * Create a success result with data and optional warnings.
 * @param {*} data
 * @param {string[]} warnings
 * @returns {{data: *, errors: Error[], warnings: string[]}}
 */
export function successResult(data, warnings = []) {
	return createResult(data, [], warnings);
}

/**
 * Create an error result with no data.
 * @param {Error|string} error
 * @param {string[]} warnings
 * @returns {{data: null, errors: Error[], warnings: string[]}}
 */
export function errorResult(error, warnings = []) {
	const err = typeof error === 'string' ? new Error(error) : error;
	return createResult(null, [err], warnings);
}
