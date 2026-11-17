import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readmeCliBlock() {
	const readme = readFileSync(join(root, 'README.md'), 'utf8');
	const section = /^## CLI options\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
	assert.ok(section, 'README has a "## CLI options" section');
	return section[1];
}

function cliHelp() {
	return execFileSync(process.execPath, [join(root, 'bin', 'cli.js'), '--help'], {
		encoding: 'utf8',
	});
}

function defaultPort() {
	// DEFAULT_PORT is module-private, so read it from the source.
	const source = readFileSync(join(root, 'src', 'server', 'port-finder.js'), 'utf8');
	const match = /const DEFAULT_PORT = (\d+);/.exec(source);
	assert.ok(match, 'port-finder.js declares DEFAULT_PORT');
	return match[1];
}

describe('README CLI options', () => {
	function helpOptions() {
		const help = cliHelp();
		const start = help.indexOf('Options:');
		const end = help.indexOf('Examples:');
		assert.ok(start >= 0, '--help has an "Options:" section');
		assert.ok(end > start, '--help has an "Examples:" section after "Options:"');
		return help.slice(start, end);
	}

	function flagsIn(text) {
		const long = text.match(/--[a-z][a-z-]*/g) ?? [];
		const short = text.match(/(?<![\w-])-[a-z]\b/g) ?? [];
		return [...new Set([...long, ...short])].sort();
	}

	it('lists exactly the flags that --help prints, long and short', () => {
		const helpFlags = flagsIn(helpOptions());
		assert.ok(helpFlags.length > 0, '--help lists options');
		assert.deepEqual(flagsIn(readmeCliBlock()), helpFlags);
	});

	it('states the same default port as DEFAULT_PORT', () => {
		const port = defaultPort();
		const block = readmeCliBlock();
		assert.match(block, new RegExp(`default: auto-detect from ${port}\\b`));
		assert.match(cliHelp(), new RegExp(`default: auto-detect from ${port}\\b`));
	});
});
