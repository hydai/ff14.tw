# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FF14.tw is a multi-tool website for Final Fantasy XIV players, providing various utilities like character card generators, leveling calculators, and other game-related tools. The project uses a modular architecture where each tool is a separate sub-project within the `tools/` directory.

## Architecture

- **Static Website**: HTML/CSS/JavaScript with no build tools or frameworks
- **Multi-Tool Structure**: Each tool is self-contained in its own directory
- **Shared Resources**: Common CSS, JavaScript, and assets are shared across tools
- **Language**: Traditional Chinese (zh-Hant)
- **Deployment**: GitHub Pages with custom domain (ff14.tw via CNAME)

## File Structure

```txt
ff14.tw/
├── index.html              # Main navigation/landing page
├── assets/
│   ├── css/common.css     # Shared styles and CSS variables
│   ├── js/common.js       # Shared utilities and functions
│   └── images/            # Shared images and icons
├── tools/
│   ├── character-card/    # Character card generator tool
│   └── sect-calculator/   # Leveling calculator tool
├── data/                  # Game data and JSON files
└── CNAME                  # GitHub Pages domain configuration
```

## Development Guidelines

### Adding New Tools

1. Create a new directory under `tools/[tool-name]/`
2. Include `index.html`, `style.css`, and `script.js` files
3. Link shared resources from `assets/` directory
4. Add navigation link to main `index.html`
5. Follow existing naming conventions and structure

### Shared Resources

- `assets/css/common.css`: Contains CSS variables, common styles, and component classes
- `assets/js/common.js`: Provides utility functions like `FF14Utils` and common constants
- All tools should import these shared resources for consistency

### Styling Conventions

- Use CSS custom properties (variables) defined in `common.css`
- Follow responsive design patterns established in existing tools
- Maintain consistent component styling (cards, buttons, forms)

### JavaScript Conventions

- Use `FF14Utils` for common operations (formatting, validation, notifications)
- Implement proper input validation and error handling
- Follow the established event handling patterns

## Development Commands

This is a static website with no build process. Files can be edited directly and changes are reflected immediately when deployed to GitHub Pages.

For local development, simply open `index.html` in a web browser or use a local server like `python -m http.server`.
