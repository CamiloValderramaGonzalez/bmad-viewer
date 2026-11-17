/**
 * Generate inline script for anti-FOWT (Flash of Wrong Theme).
 * Runs in <head> before page render to set correct theme immediately.
 *
 * Order: `?theme=light|dark` URL parameter (used by the VS Code extension, never
 * persisted), then the saved `bmad-theme` choice, then the OS colour scheme.
 * @returns {string} Inline script tag
 */
export function InlineThemeScript() {
	return `<script>
(function(){var t=null;try{var m=/[?&]theme=([^&#]*)/.exec(location.search||'');if(m&&(m[1]==='light'||m[1]==='dark')){t=m[1]}}catch(e){}if(!t){try{var s=localStorage.getItem('bmad-theme');if(s==='light'||s==='dark'){t=s}}catch(e){}}if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})();
</script>`;
}
