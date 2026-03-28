/**
 * Render a linear progress bar.
 * @param {{completed: number, total: number}} props
 * @returns {string} HTML string
 */
export function ProgressBar({ completed, total }) {
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	return `<div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" data-progress-root>
	<div class="progress-bar__fill" data-progress-fill style="width:${pct}%"></div>
	<span class="progress-bar__label" data-progress-label>${pct}%</span>
</div>`;
}
