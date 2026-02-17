Launch the bmad-viewer visual dashboard for this project.

## Instructions

1. Detect the project root by looking for a `_bmad/` directory in the current working directory or up to 3 parent directories.
2. If `_bmad/` is not found, inform the user and stop.
3. Start the bmad-viewer server by running this command in the background:

```bash
npx bmad-viewer --path <project-root>
```

4. Wait for the server to output the URL (e.g., `http://localhost:4000`).
5. Tell the user the URL and that they can:
   - Open it in their browser
   - Press `o` in the terminal to reopen the browser
   - Press `q` to stop the server
6. The server runs in the background and auto-refreshes when files change.
