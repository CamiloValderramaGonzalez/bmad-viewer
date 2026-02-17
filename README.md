# bmad-viewer

Visual dashboard for BMAD (Boring Maintainable Agile Development) projects.

## Features

- 📊 Live project dashboard with sprint status visualization
- 🔍 Fuzzy search across agents, workflows, and tools
- 📝 Markdown-based wiki with auto-refresh
- 🎨 Dark/light theme support
- 🚀 Zero-config - auto-detects `_bmad/` folder
- 📦 Installable via npx - no global installation needed

## Quick Start

```bash
# Run in a BMAD project directory
npx bmad-viewer

# Or specify a custom path
npx bmad-viewer --path /path/to/bmad/project

# Custom port
npx bmad-viewer --port 8080
```

## Requirements

- Node.js 18+ (LTS)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT
