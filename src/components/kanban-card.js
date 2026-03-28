import { escapeHtml } from '../utils/html-escape.js';
import { Badge } from './badge.js';

/**
 * Render a kanban story card.
 * @param {{id: string, title: string, status: string, epic: string, editable?: boolean}} props
 * @returns {string} HTML string
 */
export function KanbanCard({ id, title, status, epic, cardType, detail, editable = false }) {
	const typeClass = cardType === 'bug' ? ' kanban-card--bug' : cardType === 'global' ? ' kanban-card--global' : '';
	const cardTypeValue = cardType || 'story';
	const isEditableStory = editable && cardTypeValue === 'story';
	const tag = cardType ? 'div' : 'a';
	const href = cardType ? '' : ` href="#project/story/${escapeHtml(id)}"`;
	const label = cardType === 'bug' ? escapeHtml(epic) : `Epic ${escapeHtml(epic)}`;
	const dragAttrs = isEditableStory ? ' draggable="true" data-draggable="true"' : '';
	return `<${tag}${href} class="kanban-card kanban-card--${escapeHtml(status)}${typeClass}" data-id="${escapeHtml(id)}" data-status="${escapeHtml(status)}" data-card-type="${escapeHtml(cardTypeValue)}"${dragAttrs}>
	<h4 class="kanban-card__title">${escapeHtml(title)}</h4>
	${detail ? `<div class="kanban-card__detail">${escapeHtml(detail)}</div>` : ''}
	<div class="kanban-card__meta">
		${Badge({ status: epic, text: label })}
		${Badge({ status, attrs: ' data-role="story-status-badge"' })}
	</div>
</${tag}>`;
}
