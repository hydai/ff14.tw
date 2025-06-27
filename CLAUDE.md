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
- **CORS Limitation**: Tools with JSON data files (like dungeon-database) require local server due to browser CORS restrictions

**No package management, linting, or testing commands** - the project uses vanilla web technologies only.

**Testing Tools:**
- Open browser developer tools to check for JavaScript errors
- Test tool functionality manually by interacting with UI elements
- Verify responsive design by resizing browser window or using device simulation

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
- Favicon link: `<link rel="icon" type="image/x-icon" href="assets/images/ff14tw.ico">` (adjust path for subdirectories)
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
- **Real-time Updates**: Prefer automatic calculation over manual trigger buttons for better UX
- **Constants Organization**: Use static CONSTANTS object for configuration values with meaningful names
- **Performance Optimization**: Implement debouncing for search/filter operations
- **Data Separation**: Store data in JSON files for easy maintenance (see dungeon-database)
- **Code Quality**: Avoid magic numbers, extract reusable methods, maintain single responsibility principle

Example pattern from current tools:
```javascript
class ToolCalculator {
    // Constants definition at class level - avoid magic numbers
    static CONSTANTS = {
        BOARD_SIZE: 6,
        TOTAL_CELLS: 36,
        PERCENTAGE: 100,
        DEBOUNCE_DELAY: 300,
        CSS_CLASSES: {
            ACTIVE: 'active',
            FOCUSED: 'focused'
        },
        CELL_VALUES: {
            EMPTY: 0,
            OBSTACLE: 1,
            SWORD: 2,
            CHEST: 3,
            FOX_OR_EMPTY: 4
        }
    };

    constructor() {
        this.state = {}; // Tool-specific state
        this.elements = {
            // Cache frequently accessed DOM elements
            grid: document.getElementById('tool-grid'),
            result: document.getElementById('result-display')
        };
        this.debounceTimeout = null;
        this.initializeEvents();
    }
    
    initializeEvents() {
        // Use named methods for removable event handlers
        this.handleClick = (e) => { /* handler logic */ };
        this.elements.grid.addEventListener('click', this.handleClick);
    }
    
    // Extract common methods to reduce code duplication
    getMatchingData() {
        return this.data.filter(item => this.matchesCriteria(item));
    }
    
    debouncedOperation() {
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => {
            this.performOperation();
        }, ToolCalculator.CONSTANTS.DEBOUNCE_DELAY);
    }
    
    updateDisplay() {
        // Update UI elements
        // Trigger automatic calculations when state changes
        if (this.hasValidState()) {
            this.calculateResults();
        }
    }
}
```

### Adding New Tools
1. Create directory under `tools/[tool-name]/`
2. Copy HTML structure from existing tool, update title/descriptions
3. Import shared CSS/JS: `../../assets/css/common.css` and `../../assets/js/common.js`
4. Follow the class-based JavaScript architecture pattern
5. Implement proper event handler management for reset functionality
6. Add tool card to main `index.html` with icon, title, description
7. Use established styling patterns and `FF14Utils` functions
8. **Data Management**: For tools with external data, create JSON files with corresponding data-template.json and README.md
9. **Performance**: Implement debouncing for search/filter operations
10. **Accessibility**: Add keyboard navigation and focus management
11. **Code Quality**: Define constants for magic numbers, extract reusable methods, break down large functions
12. **Method Naming**: Use descriptive names like `handleTreasurePhaseClick()` instead of generic `onClick()`

### CSS Best Practices
- Use `!important` sparingly, only when overriding deeply nested styles
- Implement animations for enhanced user experience (see Mini Cactpot for examples)
- Use CSS custom properties for consistent theming
- Provide clear visual feedback for interactive elements
- Ensure proper contrast for accessibility
- **CSS Variables System**: Use comprehensive variable system for colors, spacing, borders, and transitions
- **Responsive Design**: Implement multi-breakpoint responsive design (1024px/768px/480px)
- **Design Tokens**: Standardize spacing (--spacing-xs to --spacing-2xl) and border radius (--border-radius-sm to --border-radius-xl)

## Development Guidelines

- 總是使用繁體中文與台灣用語來撰寫文件

## UI Consistency Requirements

### Navigation Bar Structure
All pages must maintain consistent navigation structure (4 items with dropdown):
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

**Navigation Design Principles:**
- Dropdown menu positioned at the rightmost to avoid visual disruption
- Four main navigation items: Home → Copyright → GitHub → About Site (dropdown)
- Dropdown integrates "About" and "Changelog" under "關於本站"
- Smooth animations with hover delay to improve UX
- Consistent across all pages and tools

### Mobile Navigation (Hamburger Menu)
For screens ≤768px width:
- **Hamburger Button**: Three-line icon with animation to X on active
- **Slide-out Menu**: Right-side panel with semi-transparent overlay
- **Touch-friendly**: Dropdown menus convert to click-to-expand on mobile
- **Body Scroll Lock**: Prevents background scrolling when menu is open
- **Auto-close**: Menu closes on overlay click or window resize
- **Implementation**: Dynamically created via JavaScript in common.js

### Dynamic Logo for Tool Pages
Tool pages automatically display tool name in navigation:
- **Format**: `FF14.tw | Tool Name`
- **Implementation**: JavaScript detects `/tools/` URL and updates logo
- **Visual Optimization**: Original h1 title hidden to save vertical space
- **Responsive**: Font sizes adjust for mobile displays
- **CSS Classes**: `.logo-main`, `.logo-separator`, `.logo-tool` for styling

### Footer Structure
All pages must use identical footer with complete copyright notice:
```html
<footer class="footer">
    <div class="container">
        <p>&copy; 2024-2025 FF14.tw | 本站非官方網站，與 Square Enix 無關 | Made with ❤️ by hydai</p>
    </div>
</footer>
```

## Data Management Patterns

### JSON Data Architecture
Tools with external data (like dungeon-database) follow this structure:
- **Main Data File**: `[tool-name].json` containing the actual data
- **Data Template**: `data-template.json` with format documentation and examples
- **Developer Guide**: `README.md` explaining data structure and update procedures
- **CORS Handling**: Implement error handling for local development vs production

### Data Loading Pattern
```javascript
async loadData() {
    this.showLoading(true);
    try {
        const response = await fetch('data.json');
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

## User Experience Patterns

### Real-time Calculation Preference
- Prefer automatic calculation over manual trigger buttons
- Update results immediately when user interacts with tool inputs
- Avoid unnecessary toast notifications for routine operations
- Only show toast messages for important feedback (errors, copy operations)

### Probability and Gaming Tools
- Use percentage displays with color coding (high/medium/low probability)
- Provide actionable recommendations based on calculated results
- Implement combination algorithms for complex probability calculations
- Support grid-based interactions for game mechanics (4x4, 3x3, 6x6 layouts)

### Grid-Based Puzzle Tools (e.g., Faux Hollows Foxes)
- **Direct Click Operations**: Implement phase-specific click behavior (direct obstacle placement vs popup selection)
- **Auto-Fill Logic**: Analyze matching board patterns to auto-complete guaranteed positions
- **Probability Calculations**: Real-time probability updates based on remaining matching board configurations
- **State Management**: Implement multiple cell states (empty, obstacle, sword, chest, fox, empty-marked)
- **Visual State Differentiation**: Use FF14 official colors with distinct gradients for each cell type
- **Phase-Based UX**: Different interaction patterns for obstacle phase (direct click) vs treasure phase (popup menu)
- **Error Tolerance**: Allow overwriting filled cells without penalty in treasure phase
- **Smart Click Counting**: Only increment clicks for new placements, not modifications

### Advanced UX Features
- **Keyboard Navigation**: Implement arrow key navigation for card-based tools (up/down arrows, Enter to select, Escape to clear)
- **Search Highlighting**: Highlight search terms in results with visual markers
- **Loading States**: Provide visual feedback during data loading with animations
- **Focus Management**: Clear visual indicators for focused elements with proper contrast
- **Viewport Optimization**: Dynamic sizing calculations (e.g., `max-width: min(100%, calc(100vh - 400px))`) for full-screen visibility
- **Responsive Typography**: Use `clamp()` for fluid font sizing across devices

## Data Processing and Import Workflows

### CSV to JSON Data Processing
For tools requiring external data import (like dungeon-database), follow this systematic approach:
1. **Data Splitting**: Use bash/awk to split large CSV files by logical groups (e.g., level ranges)
2. **Progressive Processing**: Process data in chunks to manage memory and maintain quality
3. **Translation Pipeline**: Implement consistent Traditional Chinese translation with Taiwan terminology
4. **Data Merging**: Use Node.js scripts to combine processed chunks with validation
5. **Metadata Generation**: Include statistics, categories, and version information in final output

### Data Import Commands
```bash
# Split CSV by level ranges (example from dungeon-database)
awk -F',' 'NR==1 {header=$0; next} $4>=10 && $4<=19 {print header > "ff14-level-10-19.csv"; print > "ff14-level-10-19.csv"}' source.csv

# Merge processed JSON files
node merge-data.js

# Validate final output
wc -l dungeons.json  # Check line count for completeness
```

### Data Quality Standards
- Use Traditional Chinese with Taiwan gaming terminology consistently
- FF14 expansion mapping: 2.x-7.x corresponding to game versions
- Maintain consistent ID numbering across datasets
- Include proper data source attribution (e.g., 灰機Wiki references)

### FF14-Specific Classification Standards
For dungeon-database and similar FF14 content tools, follow official game classifications:
- **四人迷宮**: Standard 4-person dungeons
- **8人大型任務**: 8-person team raids (Bahamut, Alexander, Omega, Eden, Pandaemonium, Arcadion series)
- **8人討伐殲滅戰**: 8-person battle content (primal fights,殲滅戰, 殲殛戰, 狂想作戰, 終極之戰, 博茲雅堡壘追憶戰, 詩魂戰, etc.)
- **24人大型任務**: 24-person alliance raids
- **誅滅戰**: Primal elimination battles
- **絕境戰**: Ultimate difficulty challenges  
- **幻巧戰**: Special phantom battle content
- **公會令**: Guild directive content

### Image Asset Management
For tools with visual content:
- Use ID-based naming: `images/{id}.jpg` format
- Implement graceful fallback for missing images
- Standard aspect ratio: 2:1 (width:height) recommended
- File size optimization: <200KB per image
- Error handling with `onerror` and `onload` attributes

## Legal and Copyright Requirements

### Copyright Page Integration
- All navigation bars must include `/copyright.html` link with text "版權聲明"
- Copyright page contains specific legal disclaimers for SQUARE ENIX content usage
- Non-commercial fan site status declaration required for all FF14-related content
- Data source attribution required for external sources (e.g., 灰機Wiki)

### Content Guidelines
- Always use Traditional Chinese with Taiwan gaming terminology
- Include proper attribution for external data sources
- Follow FF14 official terminology and classification standards
- Maintain non-commercial educational use stance for all game content

## Faux Hollows Foxes Patterns

6x6 grid puzzle with 252 board configurations.
Constants-driven design, phase-based interactions.


## AI Command Memories

- 當我呼叫 GitCommit 請幫我根據目前修改，對 changelog 進行更新以後，再產生一個 git commit
- 所有頁面的導航列都需保持一致的風格，包含版權聲明連結
- 所有頁面的頁尾都需與首頁風格一致
- 當我呼叫 Update 時，請更新 README.md 與 CLAUDE.md

### Language and Terminology
- 使用台灣用語：「資料」而非「數據」
- 使用台灣用語：「智慧」而非「智能」
- 所有內容必須使用繁體中文與台灣慣用詞彙
- 避免中國用語，確保在地化品質

## Git Operations

### Commit Message Standards
When creating commits, use descriptive Traditional Chinese messages following this pattern:
```
功能類別：簡短描述主要變更

- 詳細變更項目1
- 詳細變更項目2
- 其他重要資訊

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Common Git Workflows
- Use `git status` and `git diff` to review changes before committing
- Stage specific files rather than using `git add .`
- Always include meaningful commit messages in Traditional Chinese
- Check recent commit history with `git log --oneline -5` for message style consistency

## Assets and Resources

### Site Favicon
- **Location**: `assets/images/ff14tw.ico`
- **Usage**: Include in all HTML pages with `<link rel="icon" type="image/x-icon" href="/assets/images/ff14tw.ico">`
- **Format**: ICO file format for maximum browser compatibility

### Official FF14 Assets
The project includes Square Enix official assets in `assets/images/se/FFXIVJobIcons/`:
- **45 job icons** organized by role (Tank/Healer/DPS/Crafter/Gatherer/Limited)
- **Proper attribution**: All assets from Square Enix Official Fankit
- **Usage guidelines**: Non-commercial educational use only
- **File structure**: Organized by job categories (00_ROLE through 06_LIMITED)

### Asset Management Patterns
- Job icons follow path pattern: `assets/images/se/FFXIVJobIcons/{category}/{type}/{JobName}.png`
- Use relative paths from tool directories: `../../assets/images/se/...`
- Implement fallback mechanisms for missing assets
- Optimize images for web delivery (<200KB recommended)

## Changelog Management

### Changelog Tags
- `tag-new`: 新功能 (綠)
- `tag-improved`: 改進 (藍)  
- `tag-fixed`: 修正 (橙)
- `tag-info`: 資訊 (紫)