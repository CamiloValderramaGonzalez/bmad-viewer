/**
 * Generate inline script for anti-FOWT (Flash of Wrong Theme).
 * Runs in <head> before page render to set correct theme immediately.
 * @returns {string} Inline script tag
 */
export function InlineThemeScript() {
	return `<script>
(function(){var t=localStorage.getItem('bmad-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})();
</script>`;
}
