import { escapeHtml } from '../utils/html-escape.js';
import { Badge } from './badge.js';

/**
 * Render a kanban story card.
 * @param {{id: string, title: string, status: string, epic: string}} props
 * @returns {string} HTML string
 */
export function KanbanCard({ id, title, status, epic }) {
	return `<div class="kanban-card kanban-card--${escapeHtml(status)}" data-id="${escapeHtml(id)}">
	<h4 class="kanban-card__title">${escapeHtml(title)}</h4>
	<div class="kanban-card__meta">
		${Badge({ status: epic, text: `Epic ${escapeHtml(epic)}` })}
		${Badge({ status })}
	</div>
</div>`;
}
