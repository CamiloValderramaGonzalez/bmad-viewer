import chokidar from 'chokidar';
import { join } from 'node:path';

/**
 * Create a file watcher for the BMAD directory.
 * Watches for changes, additions, and deletions.
 *
 * @param {string} bmadDir - Project root containing _bmad/
 * @param {function} onChange - Callback when files change: ({type, path}) => void
 * @returns {import('chokidar').FSWatcher}
 */
export function createFileWatcher(bmadDir, onChange) {
	const watchPath = join(bmadDir, '_bmad');
	const outputPath = join(bmadDir, '_bmad-output');

	const watcher = chokidar.watch([watchPath, outputPath], {
		persistent: true,
		ignoreInitial: true,
		usePolling: true,
		interval: 500,
		awaitWriteFinish: {
			stabilityThreshold: 200,
			pollInterval: 100,
		},
	});

	watcher.on('add', (path) => onChange({ type: 'add', path }));
	watcher.on('change', (path) => onChange({ type: 'change', path }));
	watcher.on('unlink', (path) => onChange({ type: 'unlink', path }));
	watcher.on('unlinkDir', (path) => onChange({ type: 'unlinkDir', path }));
	watcher.on('error', (error) => {
		console.error('File watcher error:', error.message);
	});

	return watcher;
}
