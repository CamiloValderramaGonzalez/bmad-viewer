import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { buildDataModel } from '../data/data-model.js';
import { renderDashboard } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

/**
 * Generate static HTML files from BMAD project.
 * @param {string} bmadDir - Project root containing _bmad/
 * @param {string} outputDir - Output directory for static files
 */
export async function generateStaticSite(bmadDir, outputDir) {
	console.log(`Generating static site from ${bmadDir} to ${outputDir}...`);

	// Create output directory
	mkdirSync(outputDir, { recursive: true });

	// Build data model
	const dataModel = buildDataModel(bmadDir);

	// Generate HTML
	const html = renderDashboard(dataModel);

	// Rewrite absolute asset paths to relative for file:// compatibility
	// and swap WebSocket client script for the static bundle
	const staticHtml = html
		.replace(/<link rel="stylesheet" href="\/styles\.css">/, '<link rel="stylesheet" href="./styles.css">')
		.replace(/<script src="\/client\.js"><\/script>/, '<script src="./client.js"></script>');

	writeFileSync(join(outputDir, 'index.html'), staticHtml, 'utf8');

	// Copy public assets
	const publicFiles = ['styles.css', 'client.js'];
	for (const file of publicFiles) {
		const src = join(PUBLIC_DIR, file);
		if (existsSync(src)) {
			copyFileSync(src, join(outputDir, file));
		}
	}

	const { aggregator } = dataModel;
	const summary = aggregator.getSummary();
	if (summary.warnings.length > 0) {
		console.log(`\nWarnings (${summary.warnings.length}):`);
		for (const w of summary.warnings) {
			console.log(`  - ${w.source}: ${w.message}`);
		}
	}

	console.log(`\nStatic site generated: ${outputDir}/index.html`);
}
