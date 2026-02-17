/**
 * Render sprint stats boxes.
 * @param {{total: number, pending: number, inProgress: number, done: number}} props
 * @returns {string} HTML string
 */
export function StatsBox({ total, pending, inProgress, done }) {
	return `<div class="stats-box">
	<div class="stats-box__item stats-box__item--total">
		<span class="stats-box__number">${total}</span>
		<span class="stats-box__label">Stories</span>
	</div>
	<div class="stats-box__item stats-box__item--pending">
		<span class="stats-box__number">${pending}</span>
		<span class="stats-box__label">Pending</span>
	</div>
	<div class="stats-box__item stats-box__item--in-progress">
		<span class="stats-box__number">${inProgress}</span>
		<span class="stats-box__label">In Progress</span>
	</div>
	<div class="stats-box__item stats-box__item--done">
		<span class="stats-box__number">${done}</span>
		<span class="stats-box__label">Done</span>
	</div>
</div>`;
}
