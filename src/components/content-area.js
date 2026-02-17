/**
 * Render the main content area with HTML content.
 * @param {{html: string, title?: string}} props
 * @returns {string} HTML string
 */
export function ContentArea({ html, title }) {
	const titleHtml = title ? `<h1 class="content-area__title">${title}</h1>` : '';
	return `<main class="content-area" id="content-area">
	${titleHtml}
	<div class="content-area__body">
		${html || '<p class="content-area__empty">Select an item from the sidebar to view its content.</p>'}
	</div>
</main>`;
}
