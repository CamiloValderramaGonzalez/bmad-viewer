import { escapeHtml } from '../utils/html-escape.js';
import { KanbanCard } from './kanban-card.js';

/**
 * Render a kanban column with story cards.
 * @param {{title: string, stories: Array<{id: string, title: string, status: string, epic: string}>}} props
 * @returns {string} HTML string
 */
export function KanbanColumn({ title, stories }) {
	const cards = stories.map((story) => KanbanCard(story)).join('\n');
	return `<div class="kanban-column">
	<h3 class="kanban-column__title">${escapeHtml(title)} <span class="kanban-column__count">${stories.length}</span></h3>
	<div class="kanban-column__cards">
		${cards || '<p class="kanban-column__empty">No stories</p>'}
	</div>
</div>`;
}
