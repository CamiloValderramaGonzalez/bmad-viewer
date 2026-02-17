import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KanbanCard } from '../../src/components/kanban-card.js';

describe('KanbanCard', () => {
	it('renders card with title and status', () => {
		const html = KanbanCard({ id: '1-1', title: 'Setup', status: 'done', epic: '1' });
		assert.ok(html.includes('Setup'));
		assert.ok(html.includes('kanban-card--done'));
		assert.ok(html.includes('data-id="1-1"'));
	});

	it('escapes HTML in title', () => {
		const html = KanbanCard({ id: '1', title: '<script>alert("xss")</script>', status: 'backlog', epic: '1' });
		assert.ok(!html.includes('<script>'));
		assert.ok(html.includes('&lt;script&gt;'));
	});

	it('includes epic badge', () => {
		const html = KanbanCard({ id: '2-1', title: 'Test', status: 'in-progress', epic: '2' });
		assert.ok(html.includes('Epic 2'));
	});
});
