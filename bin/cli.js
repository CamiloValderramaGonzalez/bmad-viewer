#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const args = process.argv.slice(2);

// Parse CLI flags
const flags = {
	port: null,
	path: null,
	output: null,
	noOpen: false,
	version: false,
	help: false,
};

for (let i = 0; i < args.length; i++) {
	switch (args[i]) {
		case '--version':
		case '-v':
			flags.version = true;
			break;
		case '--help':
		case '-h':
			flags.help = true;
			break;
		case '--port':
		case '-p':
			flags.port = Number.parseInt(args[++i], 10);
			break;
		case '--path':
			flags.path = args[++i];
			break;
		case '--output':
		case '-o':
			flags.output = args[++i];
			break;
		case '--no-open':
			flags.noOpen = true;
			break;
		case '--install-skill':
			flags.installSkill = true;
			break;
		default:
			console.error(`Unknown flag: ${args[i]}`);
			console.error('Run "bmad-viewer --help" for usage information.');
			process.exit(1);
	}
}

// --version
if (flags.version) {
	console.log(`bmad-viewer v${pkg.version}`);
	process.exit(0);
}

// --help
if (flags.help) {
	console.log(`
bmad-viewer v${pkg.version}
Visual dashboard for BMAD projects

Usage:
  bmad-viewer [options]

Options:
  --port, -p <port>    Set server port (default: auto-detect from 4000)
  --path <dir>         Path to BMAD project (default: auto-detect _bmad/)
  --output, -o <dir>   Generate static HTML files (no server)
  --no-open            Don't open browser automatically
  --install-skill      Install /viewer slash command for Claude Code
  --version, -v        Show version number
  --help, -h           Show this help message

Examples:
  npx bmad-viewer                          Auto-detect and serve
  npx bmad-viewer --port 8080              Use specific port
  npx bmad-viewer --path ./my-project      Specify project path
  npx bmad-viewer --output ./docs          Generate static files
  npx bmad-viewer --install-skill          Install Claude Code slash command
`);
	process.exit(0);
}

// Validate port
if (flags.port !== null) {
	if (Number.isNaN(flags.port) || flags.port < 1024 || flags.port > 65535) {
		console.error('Error: Port must be between 1024-65535');
		process.exit(1);
	}
}

// Validate path
if (flags.path !== null) {
	const { existsSync, statSync } = await import('node:fs');
	if (!existsSync(flags.path) || !statSync(flags.path).isDirectory()) {
		console.error(`Error: Path does not exist or is not a directory: ${flags.path}`);
		process.exit(1);
	}
}

// --install-skill
if (flags.installSkill) {
	const { existsSync, mkdirSync, copyFileSync } = await import('node:fs');
	const { resolve } = await import('node:path');

	const targetDir = resolve(process.cwd(), '.claude', 'commands');
	const targetFile = join(targetDir, 'viewer.md');
	const sourceFile = join(__dirname, '..', '.claude', 'commands', 'viewer.md');

	if (!existsSync(sourceFile)) {
		console.error('Error: Skill source file not found in bmad-viewer package.');
		process.exit(1);
	}

	mkdirSync(targetDir, { recursive: true });
	copyFileSync(sourceFile, targetFile);
	console.log(`\n  Installed /viewer slash command to ${targetFile}`);
	console.log('  You can now use /viewer in Claude Code to launch bmad-viewer.\n');
	process.exit(0);
}

// Auto-install /viewer skill if not present
{
	const { existsSync, mkdirSync, copyFileSync } = await import('node:fs');
	const { resolve } = await import('node:path');
	const targetFile = resolve(process.cwd(), '.claude', 'commands', 'viewer.md');
	const sourceFile = join(__dirname, '..', '.claude', 'commands', 'viewer.md');
	if (!existsSync(targetFile) && existsSync(sourceFile)) {
		mkdirSync(resolve(process.cwd(), '.claude', 'commands'), { recursive: true });
		copyFileSync(sourceFile, targetFile);
		console.log('  Installed /viewer slash command for Claude Code.');
	}
}

// Import and start the application
const { detectBmadDir } = await import('../src/data/bmad-detector.js');
const { startServer } = await import('../src/server/http-server.js');
const { generateStaticSite } = await import('../src/server/static-generator.js');

// Detect BMAD directory
const bmadDir = flags.path || detectBmadDir(process.cwd());

if (!bmadDir) {
	console.error(`
Error: No BMAD installation found.

bmad-viewer looked for a _bmad/ folder in the current directory
and up to 3 parent directories, but couldn't find one.

Solutions:
  1. Run this command from within a BMAD project directory
  2. Specify the path: bmad-viewer --path /path/to/project
  3. Try the example data: bmad-viewer --path ./node_modules/bmad-viewer/example-data

Learn more: https://github.com/bmad-method/BMAD-METHOD
`);
	process.exit(1);
}

// Static generation mode
if (flags.output) {
	await generateStaticSite(bmadDir, flags.output);
	process.exit(0);
}

// Server mode (default)
await startServer({
	port: flags.port,
	bmadDir,
	open: !flags.noOpen,
});
