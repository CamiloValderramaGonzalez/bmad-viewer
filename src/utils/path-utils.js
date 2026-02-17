import { join, resolve, normalize, relative, extname, basename, dirname } from 'node:path';

/**
 * Normalize path separators for cross-platform compatibility.
 * @param {string} filePath
 * @returns {string}
 */
export function normalizePath(filePath) {
	return normalize(filePath).replace(/\\/g, '/');
}

/**
 * Safely join paths with normalization.
 * @param {...string} paths
 * @returns {string}
 */
export function safePath(...paths) {
	return normalizePath(join(...paths));
}

/**
 * Get relative path from one directory to another.
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function relativePath(from, to) {
	return normalizePath(relative(from, to));
}

export { resolve, extname, basename, dirname };
