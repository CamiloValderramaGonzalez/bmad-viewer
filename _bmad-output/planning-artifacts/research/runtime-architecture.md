# Runtime Architecture

## Main Runtime Pieces

1. CLI bootstrap in `bin/cli.js`
2. BMAD detection in `src/data/bmad-detector.js`
3. HTTP server in `src/server/http-server.js`
4. renderer and HTML templates in `src/server/renderer.js` and `src/templates`
5. browser client in `public/client.js`
6. file watching and websocket refresh in `src/watchers` and `src/server/websocket.js`

## Runtime Flow

1. The CLI resolves the target BMAD directory.
2. The app builds an in-memory data model from `_bmad/` and `_bmad-output/`.
3. The server renders one HTML dashboard.
4. The browser client handles routing, interactions and refresh.
5. File watchers rebuild state when project files change.

## Important Design Choice

The filesystem is intentionally the database. The viewer does not introduce a separate persistence layer for core BMAD state.
