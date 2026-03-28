/**
 * Render sprint stats boxes.
 * @param {{total: number, pending: number, inProgress: number, done: number, inProgressLabel?: string}} props
 * @returns {string} HTML string
 */
export function StatsBox({ total, pending, inProgress, done, inProgressLabel = 'In Progress' }) {
	return `<div class="stats-box">
	<div class="stats-box__item stats-box__item--total">
		<span class="stats-box__number" data-stat-total>${total}</span>
		<span class="stats-box__label">Stories</span>
	</div>
	<div class="stats-box__item stats-box__item--pending">
		<span class="stats-box__number" data-stat-pending>${pending}</span>
		<span class="stats-box__label">Pending</span>
	</div>
	<div class="stats-box__item stats-box__item--in-progress">
		<span class="stats-box__number" data-stat-active>${inProgress}</span>
		<span class="stats-box__label">${inProgressLabel}</span>
	</div>
	<div class="stats-box__item stats-box__item--done">
		<span class="stats-box__number" data-stat-done>${done}</span>
		<span class="stats-box__label">Done</span>
	</div>
</div>`;
}
