/**
 * Render the search modal overlay (Ctrl+K).
 * @returns {string} HTML string
 */
export function SearchModal() {
	return `<div class="search-modal" id="search-modal" role="dialog" aria-modal="true" aria-label="Search" hidden>
	<div class="search-modal__backdrop"></div>
	<div class="search-modal__content">
		<input class="search-modal__input" id="search-input" type="text" placeholder="Search agents, workflows, tools..." autocomplete="off" autofocus />
		<div class="search-modal__results" id="search-results" role="listbox"></div>
		<div class="search-modal__footer">
			<span>ESC to close</span>
			<span>&#8595;&#8593; to navigate</span>
			<span>&#9166; to select</span>
		</div>
	</div>
</div>`;
}
