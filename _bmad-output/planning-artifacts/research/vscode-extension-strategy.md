# VS Code Extension Strategy

## Why An Extension Makes Sense

The viewer already has:

- a reusable data model
- a renderer that emits HTML
- a client-side interaction layer

That makes it a strong candidate for a VS Code extension that hosts the dashboard inside the editor.

## Recommended Strategy

1. Create an extension project inside this repository.
2. Reuse or extract the current viewer core.
3. Host the dashboard in a VS Code webview or sidebar view.
4. Add commands for open, refresh and sync.

## Important Product Principle

The extension should expose the BMAD board inside VS Code, but BMAD local files should remain the primary source of truth.

## Suggested Epic Mapping

- scaffold and embedded host
- workspace detection and actions
- UX, settings and packaging
