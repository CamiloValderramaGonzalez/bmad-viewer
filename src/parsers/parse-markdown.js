import { readFileSync } from 'node:fs';
import { marked } from 'marked';
import yaml from 'js-yaml';
import { createResult, errorResult } from './result-type.js';

// Configure marked for security
marked.setOptions({
	gfm: true,
	breaks: false,
});

/**
 * Parse a Markdown file and convert to sanitized HTML.
 *
 * @param {string} filePath - Path to Markdown file
 * @returns {{data: {html: string, frontmatter: object|null, raw: string}|null, errors: Error[], warnings: string[]}}
 */
export function parseMarkdown(filePath) {
	try {
		const content = readFileSync(filePath, 'utf8');
		return parseMarkdownContent(content, filePath);
	} catch (error) {
		return errorResult(error, [`Failed to read ${filePath}`]);
	}
}

/**
 * Parse Markdown content string to HTML.
 * @param {string} content - Markdown string
 * @param {string} source - Source identifier for error messages
 * @returns {{data: {html: string, frontmatter: object|null, raw: string}|null, errors: Error[], warnings: string[]}}
 */
export function parseMarkdownContent(content, source = 'unknown') {
	try {
		// Extract frontmatter if present
		let frontmatter = null;
		let markdownBody = content;

		const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
		if (fmMatch) {
			try {
				frontmatter = yaml.load(fmMatch[1]);
			} catch {
				// Ignore frontmatter parse errors
			}
			markdownBody = fmMatch[2];
		}

		const html = marked.parse(markdownBody);

		return createResult({ html, frontmatter, raw: content }, [], []);
	} catch (error) {
		return errorResult(error, [`Failed to parse Markdown from ${source}`]);
	}
}
