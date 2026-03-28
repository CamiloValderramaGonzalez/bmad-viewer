import { escapeHtml } from '../utils/html-escape.js';
import { KanbanCard } from './kanban-card.js';

/**
 * Render a kanban column with story cards.
 * @param {{title: string, stories: Array<{id: string, title: string, status: string, epic: string}>, columnId?: string, editable?: boolean}} props
 * @returns {string} HTML string
 */
export function KanbanColumn({ title, stories, columnId = '', editable = false }) {
	const cards = stories.map((story) => KanbanCard({ ...story, editable })).join('\n');
	return `<section class="kanban-column" data-column-status="${escapeHtml(columnId)}">
	<h3 class="kanban-column__title">${escapeHtml(title)} <span class="kanban-column__count" data-column-count>${stories.length}</span></h3>
	<div class="kanban-column__cards" data-column-cards ${editable ? 'data-dropzone="true"' : ''}>
		${cards || '<p class="kanban-column__empty">No stories</p>'}
	</div>
</section>`;
}
