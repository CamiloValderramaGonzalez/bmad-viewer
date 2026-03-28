# BMAD Viewer VS Code Extension

Open the BMAD dashboard inside VS Code, backed by the same local BMAD workspace and sync capabilities that power the standalone viewer.

## What it does

- Adds a dedicated `BMAD Viewer` icon to the VS Code activity bar.
- Detects the current workspace BMAD root by looking for `_bmad/`.
- Starts an embedded local `bmad-viewer` server for the workspace and renders it inside a VS Code webview.
- Keeps drag-and-drop board interactions, wiki browsing, and platform sync flows available without leaving the editor.

## Local development

```bash
cd apps/vscode-extension
npm install
npm run check
npm run package:vsix
```

The packaged `.vsix` file is emitted in this folder. Install it locally with:

```bash
code --install-extension bmad-viewer-vscode-0.1.0.vsix
```

`npm run check` and `npm run package:vsix` automatically vendor the current repo's `src/` and `public/` assets into the extension package, so the embedded viewer stays aligned with the main project.

## Publish to Visual Studio Marketplace

1. Create or reuse a Visual Studio Marketplace publisher for the `publisher` id in `package.json`.
2. Generate a Personal Access Token in Azure DevOps with Marketplace publish permissions.
3. Run:

```bash
cd apps/vscode-extension
npx @vscode/vsce publish -p YOUR_VSCE_PAT
```

## CI packaging

This repo includes a GitHub Actions workflow at `.github/workflows/vscode-extension.yml` that:

- packages the extension on pull requests and pushes to `master`
- uploads the generated `.vsix` as a workflow artifact
- can publish to the Marketplace on version tags when `VSCE_PAT` is configured
