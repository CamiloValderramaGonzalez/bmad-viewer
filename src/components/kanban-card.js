import { escapeHtml } from '../utils/html-escape.js';
import { Badge } from './badge.js';

/**
 * Render a kanban story card.
 * @param {{id: string, title: string, status: string, epic: string}} props
 * @returns {string} HTML string
 */
export function KanbanCard({ id, title, status, epic, cardType, detail }) {
	const typeClass = cardType === 'bug' ? ' kanban-card--bug' : cardType === 'global' ? ' kanban-card--global' : '';
	const tag = cardType ? 'div' : 'a';
	const href = cardType ? '' : ` href="#project/story/${escapeHtml(id)}"`;
	const label = cardType === 'bug' ? escapeHtml(epic) : `Epic ${escapeHtml(epic)}`;
	return `<${tag}${href} class="kanban-card kanban-card--${escapeHtml(status)}${typeClass}" data-id="${escapeHtml(id)}">
	<h4 class="kanban-card__title">${escapeHtml(title)}</h4>
	${detail ? `<div class="kanban-card__detail">${escapeHtml(detail)}</div>` : ''}
	<div class="kanban-card__meta">
		${Badge({ status: epic, text: label })}
		${Badge({ status })}
	</div>
</${tag}>`;
}
