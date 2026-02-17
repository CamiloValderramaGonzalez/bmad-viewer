import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const MAX_PARENT_LEVELS = 3;
const BMAD_DIR_NAME = '_bmad';

/**
 * Auto-detect _bmad/ directory starting from given path,
 * searching up to 3 parent directories.
 * @param {string} startDir - Directory to start searching from
 * @returns {string|null} - Absolute path to project root containing _bmad/, or null
 */
export function detectBmadDir(startDir) {
	let currentDir = resolve(startDir);

	for (let i = 0; i <= MAX_PARENT_LEVELS; i++) {
		const bmadPath = join(currentDir, BMAD_DIR_NAME);

		if (existsSync(bmadPath) && statSync(bmadPath).isDirectory()) {
			return currentDir;
		}

		const parentDir = dirname(currentDir);
		// Reached filesystem root
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	return null;
}

/**
 * Detect BMAD version from config or VERSION file.
 * @param {string} bmadDir - Path to project root containing _bmad/
 * @returns {{version: string|null, compatible: boolean, warning: string|null}}
 */
export function detectBmadVersion(bmadDir) {
	const bmadPath = join(bmadDir, BMAD_DIR_NAME);

	// Try config.yaml first
	const configPath = join(bmadPath, 'bmm', 'config.yaml');
	if (existsSync(configPath)) {
		try {
			const content = readFileSync(configPath, 'utf8');
			const versionMatch = content.match(/version:\s*['"]?(\d+\.\d+\.\d+[^'"]*)/i);
			if (versionMatch) {
				const version = versionMatch[1];
				const majorVersion = Number.parseInt(version.split('.')[0], 10);
				return {
					version,
					compatible: majorVersion >= 6,
					warning: majorVersion < 6
						? `Detected BMAD v${majorVersion}. Viewer optimized for v6+. Some features may not be available.`
						: null,
				};
			}
		} catch {
			// Ignore parse errors
		}
	}

	// Try VERSION file
	const versionFilePath = join(bmadPath, 'VERSION');
	if (existsSync(versionFilePath)) {
		try {
			const version = readFileSync(versionFilePath, 'utf8').trim();
			const majorVersion = Number.parseInt(version.split('.')[0], 10);
			return {
				version,
				compatible: majorVersion >= 6,
				warning: majorVersion < 6
					? `Detected BMAD v${majorVersion}. Viewer optimized for v6+. Some features may not be available.`
					: null,
			};
		} catch {
			// Ignore read errors
		}
	}

	return { version: null, compatible: true, warning: null };
}
