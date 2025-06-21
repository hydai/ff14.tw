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

### Tool JavaScript Architecture
Each tool typically uses a class-based architecture:
- **Main Calculator Class**: Encapsulates all tool logic and state
- **DOM Element Caching**: Store frequently accessed elements in `this.elements`
- **Event Handler Management**: Use named methods for event handlers to enable proper cleanup
- **State Management**: Maintain tool state in class properties
- **Reset Functionality**: Implement complete state and DOM cleanup for reset buttons

Example pattern from Mini Cactpot:
```javascript
class ToolCalculator {
    constructor() {
        this.state = {}; // Tool-specific state
        this.elements = {
            // Cache frequently accessed DOM elements
            grid: document.getElementById('tool-grid'),
            result: document.getElementById('result-display')
        };
        this.initializeEvents();
    }
    
    initializeEvents() {
        // Use named methods for removable event handlers
        this.handleClick = (e) => { /* handler logic */ };
        this.elements.grid.addEventListener('click', this.handleClick);
    }
}

### Adding New Tools
1. Create directory under `tools/[tool-name]/`
2. Copy HTML structure from existing tool, update title/descriptions
3. Import shared CSS/JS: `../../assets/css/common.css` and `../../assets/js/common.js`
4. Follow the class-based JavaScript architecture pattern
5. Implement proper event handler management for reset functionality
6. Add tool card to main `index.html` with icon, title, description
7. Use established styling patterns and `FF14Utils` functions

### CSS Best Practices
- Use `!important` sparingly, only when overriding deeply nested styles
- Implement animations for enhanced user experience (see Mini Cactpot for examples)
- Use CSS custom properties for consistent theming
- Provide clear visual feedback for interactive elements
- Ensure proper contrast for accessibility

## Development Guidelines

- 總是使用繁體中文與台灣用語來撰寫文件

## UI Consistency Requirements

### Navigation Bar Structure
All tool pages must maintain consistent navigation:
```html
<header class="header">
    <div class="container">
        <a href="/" class="logo">FF14.tw</a>
        <nav class="nav">
            <a href="/">首頁</a>
            <a href="/#tools">工具</a>
            <a href="https://github.com/hydai/ff14.tw" target="_blank">GitHub</a>
        </nav>
    </div>
</header>
```

### Footer Structure
All pages must use identical footer with complete copyright notice:
```html
<footer class="footer">
    <div class="container">
        <p>&copy; 2024-2025 FF14.tw | 本站非官方網站，與 Square Enix 無關 | Made with ❤️ by hydai</p>
    </div>
</footer>
```

## Common Development Patterns

### Reset Functionality Implementation
When implementing reset buttons, ensure complete cleanup:
```javascript
function resetTool() {
    // Remove old event listeners
    if (calculator && calculator.handleEvents) {
        calculator.elements.container.removeEventListener('click', calculator.handleEvents);
    }
    
    // Clear all DOM states
    document.querySelectorAll('.interactive-element').forEach(el => {
        el.classList.remove('active', 'selected', 'highlighted');
        el.innerHTML = '';
    });
    
    // Reset display counters
    document.getElementById('status-display').textContent = 'initial-state';
    
    // Create new calculator instance
    calculator = new ToolCalculator();
}
```

### Visual Enhancement Patterns
- Use gradients and animations for important elements (best choices, results)
- Implement pulsing/glowing effects for highlighted items
- Add slide-in animations for result panels
- Ensure sufficient color contrast with `!important` when necessary

## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改產生一個 git commit
- 所有頁面的導航列都需保持一致的風格
- 所有頁面的頁尾都需與首頁風格一致