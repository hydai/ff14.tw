# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FF14.tw is a multi-tool website for Final Fantasy XIV players in Taiwan, providing various utilities like character card generators, leveling calculators, and other game-related tools. The project uses a vanilla web stack with a modular architecture where each tool is self-contained within the `tools/` directory.

## Architecture

- **Static Website**: Pure HTML/CSS/JavaScript with no build tools, bundlers, or frameworks
- **Multi-Tool Structure**: Each tool is completely self-contained in its own directory under `tools/`
- **Shared Resources**: Common utilities in `assets/` (CSS variables, utility functions, constants)
- **Language**: Traditional Chinese (zh-Hant) - all UI text and content
- **Deployment**: GitHub Pages with custom domain (ff14.tw via CNAME)

## Development Commands

This is a static website with **no build process**. Files can be edited directly and changes are reflected immediately.

**Local Development:**
- Open `index.html` directly in browser, or
- Use a local server: `python -m http.server` or `npx serve .`

**No package management, linting, or testing commands** - the project uses vanilla web technologies only.

## Shared Architecture Patterns

### Tool Structure
Each tool follows this pattern:
```
tools/[tool-name]/
├── index.html    # Tool page with header/nav structure
├── style.css     # Tool-specific styles
└── script.js     # Tool functionality
```

### HTML Structure
All pages include:
- Header with logo and navigation (`header.header > .container`)
- Main content area (`main.main > .container`) 
- Footer with copyright
- Links to shared resources: `../../assets/css/common.css` and `../../assets/js/common.js`

### CSS Architecture
- Root-level CSS custom properties in `assets/css/common.css`
- Consistent component classes: `.tool-card`, `.btn`, `.container`
- Mobile-first responsive design with breakpoints at 768px
- Gradient backgrounds and shadow effects for visual consistency

### JavaScript Utilities
- `FF14Utils` global object provides common functions:
  - `formatNumber()` - add thousands separators
  - `copyToClipboard()` - copy with toast notification
  - `showToast()` - success/error notifications
  - `validateNumber()` - input validation
  - `loadData()` - async JSON loading
- `FF14_JOBS` constant with job categories
- Common DOM patterns: back-to-top button, tool card interactions

### Adding New Tools
1. Create directory under `tools/[tool-name]/`
2. Copy HTML structure from existing tool, update title/descriptions
3. Import shared CSS/JS: `../../assets/css/common.css` and `../../assets/js/common.js`
4. Add tool card to main `index.html` with icon, title, description
5. Use established styling patterns and `FF14Utils` functions

## Development Guidelines

- 總是使用繁體中文與台灣用語來撰寫文件

## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改產生一個 git commit