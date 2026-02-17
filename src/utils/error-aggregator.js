/**
 * Aggregates errors and warnings from multiple parser Results.
 * Collects all errors/warnings for unified UI display.
 */
export class ErrorAggregator {
	constructor() {
		this.errors = [];
		this.warnings = [];
	}

	/**
	 * Add a parser result to the aggregator.
	 * @param {string} source - Source identifier (e.g., filename)
	 * @param {{data: *, errors: Error[], warnings: string[]}} result
	 */
	addResult(source, result) {
		for (const error of result.errors) {
			this.errors.push({
				source,
				message: error.message || String(error),
				error,
			});
		}
		for (const warning of result.warnings) {
			this.warnings.push({
				source,
				message: warning,
			});
		}
	}

	/**
	 * Check if any errors were collected.
	 * @returns {boolean}
	 */
	hasErrors() {
		return this.errors.length > 0;
	}

	/**
	 * Check if any warnings were collected.
	 * @returns {boolean}
	 */
	hasWarnings() {
		return this.warnings.length > 0;
	}

	/**
	 * Get formatted error/warning messages for UI display.
	 * @returns {{errors: {source: string, message: string}[], warnings: {source: string, message: string}[]}}
	 */
	getSummary() {
		return {
			errors: this.errors.map((e) => ({ source: e.source, message: e.message })),
			warnings: this.warnings.map((w) => ({ source: w.source, message: w.message })),
		};
	}

	/**
	 * Clear all collected errors and warnings.
	 */
	clear() {
		this.errors = [];
		this.warnings = [];
	}
}
