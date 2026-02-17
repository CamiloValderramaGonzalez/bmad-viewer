import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownContent } from '../../src/parsers/parse-markdown.js';

describe('parseMarkdownContent', () => {
	it('converts markdown to HTML', () => {
		const md = '# Hello\n\nThis is **bold** text.';
		const result = parseMarkdownContent(md, 'test.md');
		assert.equal(result.errors.length, 0);
		assert.ok(result.data.html.includes('<h1>'));
		assert.ok(result.data.html.includes('<strong>bold</strong>'));
	});

	it('extracts frontmatter', () => {
		const md = '---\ntitle: Test\nstatus: complete\n---\n\n# Content';
		const result = parseMarkdownContent(md, 'test.md');
		assert.equal(result.data.frontmatter.title, 'Test');
		assert.equal(result.data.frontmatter.status, 'complete');
	});

	it('handles content without frontmatter', () => {
		const md = '# Just Content\n\nNo frontmatter here.';
		const result = parseMarkdownContent(md, 'test.md');
		assert.equal(result.data.frontmatter, null);
		assert.ok(result.data.html.includes('Just Content'));
	});

	it('preserves raw content', () => {
		const md = '# Raw\n\nContent preserved.';
		const result = parseMarkdownContent(md, 'test.md');
		assert.equal(result.data.raw, md);
	});
});
