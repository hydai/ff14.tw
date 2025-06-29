# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FF14.tw is a multi-tool website for Final Fantasy XIV players in Taiwan, providing various utilities like character card generators, dungeon database, and game calculators. The project uses a vanilla web stack with a modular architecture where each tool is self-contained within the `tools/` directory.

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
- Use a local server: `python3 -m http.server` or `npx serve .`
- **CORS Limitation**: Tools with JSON data files require local server due to browser CORS restrictions

**No package management, linting, or testing commands** - the project uses vanilla web technologies only.

## Core Patterns

### Tool JavaScript Architecture
Each tool uses a consistent class-based pattern:

```javascript
class ToolCalculator {
    // Constants definition at class level
    static CONSTANTS = {
        DEBOUNCE_DELAY: 300,
        CSS_CLASSES: {
            ACTIVE: 'active',
            FOCUSED: 'focused'
        }
    };

    constructor() {
        this.state = {};
        this.elements = {
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
```

### Multi-Select Tag Filtering Pattern
Modern tools implement multi-select filtering with tag buttons:

```javascript
// State management with Sets
this.selectedTypes = new Set();
this.selectedExpansions = new Set();

// Toggle method pattern
toggleTypeTag(tagElement) {
    const type = tagElement.dataset.type;
    if (this.selectedTypes.has(type)) {
        this.selectedTypes.delete(type);
        tagElement.classList.remove('active');
    } else {
        this.selectedTypes.add(type);
        tagElement.classList.add('active');
    }
    this.applyFilters();
}

// Matching logic - empty set means show all
matchesTypes(item) {
    if (this.selectedTypes.size === 0) return true;
    return this.selectedTypes.has(item.type);
}
```

HTML Structure:
```html
<div class="filter-group type-filter-group">
    <label>類型過濾：</label>
    <div class="type-tags" id="typeTags">
        <button class="type-tag" data-type="四人迷宮">四人迷宮</button>
        <button class="type-tag" data-type="公會令">公會令</button>
    </div>
</div>
```

### Adding New Tools
1. Create directory under `tools/[tool-name]/`
2. Copy HTML structure from existing tool, update title/descriptions
3. Import shared CSS/JS: `../../assets/css/common.css` and `../../assets/js/common.js`
4. Follow the class-based JavaScript architecture pattern
5. Add tool card to main `index.html`

## UI Consistency Requirements

### Navigation Structure
All pages must maintain consistent navigation with dropdown:
```html
<header class="header">
    <div class="container">
        <a href="/" class="logo">FF14.tw</a>
        <nav class="nav">
            <a href="/">首頁</a>
            <a href="/copyright.html">版權聲明</a>
            <a href="https://github.com/hydai/ff14.tw" target="_blank">GitHub</a>
            <div class="nav-dropdown">
                <a href="#">關於本站</a>
                <div class="nav-dropdown-content">
                    <a href="/about.html">關於</a>
                    <a href="/changelog.html">修改紀錄</a>
                </div>
            </div>
        </nav>
    </div>
</header>
```

### Footer Structure
```html
<footer class="footer">
    <div class="container">
        <p>&copy; 2024-2025 FF14.tw | 本站非官方網站，與 Square Enix 無關 | Made with ❤️ by hydai</p>
    </div>
</footer>
```

## Advanced Patterns

### Animation Standards
```css
/* Glow effect for important elements */
@keyframes glow {
    0%, 100% {
        box-shadow: 0 0 15px rgba(74, 144, 226, 0.8);
        transform: scale(1);
    }
    50% {
        box-shadow: 0 0 25px rgba(74, 144, 226, 1);
        transform: scale(1.05);
    }
}

.best-choice {
    animation: glow 2s ease-in-out infinite;
}
```

### Phase-Based Interactions
For complex tools with multiple interaction modes:
```javascript
handleCellClick(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    
    if (this.phase === 'obstacle') {
        this.placeObstacle(cell);
    } else if (this.phase === 'treasure') {
        this.showTreasurePopup(cell);
    }
}
```

### Data Management
Tools with external data follow this structure:
- Main data file: `/data/[tool-name].json`
- Data template: `data-template.json` with documentation
- Loading pattern with error handling:

```javascript
async loadData() {
    this.showLoading(true);
    try {
        const response = await fetch('../../data/dungeons.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.processData(data);
    } catch (error) {
        console.error('Data loading failed:', error);
        this.showError('載入資料失敗，請重新整理頁面再試。');
    } finally {
        this.showLoading(false);
    }
}
```

## Development Guidelines

### Language Standards
- 使用繁體中文與台灣用語
- 「資料」而非「數據」
- 「智慧」而非「智能」

### Git Commit Standards
```
功能類別：簡短描述主要變更

- 詳細變更項目1
- 詳細變更項目2

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Performance Guidelines
- Debounce search/filter operations at 300ms
- Use CSS transforms for animations (GPU acceleration)
- Implement lazy loading for images
- Early returns in filter functions

### Accessibility Standards
- Keyboard navigation for interactive elements
- Focus indicators with proper contrast
- ARIA labels for screen readers
- Focus trapping in modals

## FF14-Specific Standards

### Content Classifications
- **四人迷宮**: Standard 4-person dungeons
- **8人大型任務**: 8-person raids (Bahamut, Alexander, Omega, Eden, Pandaemonium, Arcadion)
- **8人討伐殲滅戰**: 8-person trials
- **24人大型任務**: 24-person alliance raids
- **絕境戰**: Ultimate difficulty
- **幻巧戰**: Unreal trials
- **公會令**: Guildhest content

### Asset Management
- Job icons: `assets/images/se/FFXIVJobIcons/{category}/{type}/{JobName}.png`
- Tool images: `images/{id}.jpg` with 2:1 aspect ratio
- Fallback handling for missing assets

## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改，對 changelog 進行更新以後，再產生一個 git commit
- 所有頁面的導航列都需保持一致的風格，包含版權聲明連結
- 所有頁面的頁尾都需與首頁風格一致
- 當我呼叫 Update 時，請更新 README.md 與 CLAUDE.md

## Current Tools

1. **Character Card Generator** (`character-card/`): Customizable FF14 character cards
2. **Dungeon Database** (`dungeon-database/`): 804 dungeons with multi-select filtering
3. **Mini Cactpot Calculator** (`mini-cactpot/`): 3x3 lottery probability calculator
4. **Wondrous Tails Predictor** (`wondrous-tails/`): 4x4 bingo probability calculator
5. **Faux Hollows Foxes** (`faux-hollows-foxes/`): 6x6 treasure hunting puzzle solver