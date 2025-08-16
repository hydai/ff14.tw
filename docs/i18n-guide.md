# i18n (Internationalization) Guide for FF14.tw

## Overview

FF14.tw now supports multiple languages:
- **zh-TW** (繁體中文) - Default
- **ja** (日本語) - Japanese
- **en** (English) - English

The i18n system is built with vanilla JavaScript and uses JSON files for translations.

## Project Structure

```
/assets/
├── js/
│   ├── i18n.js                    # Core i18n module
│   └── components/
│       └── language-switcher.js   # Language switcher UI component
├── css/
│   └── language-switcher.css      # Language switcher styles
└── i18n/
    ├── common.json                 # Shared translations (navigation, footer, buttons)
    ├── tools/
    │   ├── character-card.json    # Tool-specific translations
    │   ├── dungeon-database.json
    │   ├── faux-hollows-foxes.json
    │   ├── lodestone-lookup.json
    │   ├── mini-cactpot.json
    │   ├── treasure-map-finder.json
    │   ├── timed-gathering.json
    │   └── wondrous-tails.json
    └── pages/
        ├── index.json              # Homepage translations
        ├── about.json              # About page translations
        ├── changelog.json          # Changelog translations
        └── copyright.json          # Copyright page translations
```

## How to Use i18n in HTML

### 1. Include Required Scripts

```html
<!-- In <head> -->
<link rel="stylesheet" href="/assets/css/language-switcher.css">

<!-- Before </body> -->
<script src="/assets/js/i18n.js"></script>
<script src="/assets/js/components/language-switcher.js"></script>
<script>
    document.addEventListener('DOMContentLoaded', async () => {
        // Load translations (common is always loaded)
        await i18n.init(['common', 'tools/your-tool-name']);
        
        // Initialize language switcher
        new LanguageSwitcher('languageSwitcher', {
            style: 'buttons',
            showNativeName: true
        });
    });
</script>
```

### 2. Mark Text Elements for Translation

#### Static Text
```html
<h1 data-i18n="page.title">Page Title</h1>
<p data-i18n="page.description">Page description text</p>
```

#### Attributes (placeholder, title, alt)
```html
<input data-i18n="search.placeholder" data-i18n-attr="placeholder" placeholder="Search...">
<button data-i18n="button.tooltip" data-i18n-attr="title" title="Click me">Button</button>
```

#### HTML Content with Icons
```html
<button data-i18n-html="button.add">
    <span class="icon">➕</span> Add Item
</button>
```

### 3. Add Language Switcher

```html
<!-- In navigation -->
<div id="languageSwitcher" 
     class="language-switcher" 
     data-language-switcher 
     data-style="buttons" 
     data-show-native="true">
</div>
```

## How to Use i18n in JavaScript

### Get Translated Text
```javascript
// Simple text
const text = i18n.t('message.loading');

// With template parameters
const message = i18n.t('items.found', { count: 10 });
// Output: "Found 10 items"
```

### Listen for Language Changes
```javascript
// Register observer
i18n.observe((newLang) => {
    console.log('Language changed to:', newLang);
    // Update dynamic content here
});

// Or use custom event
document.addEventListener('i18n:languageChanged', (e) => {
    console.log('Language changed to:', e.detail.language);
});
```

### Format Dates and Numbers
```javascript
// Format date
const formattedDate = i18n.formatDate(new Date(), 'long');

// Format number
const formattedNumber = i18n.formatNumber(1234567.89);
```

## Translation File Format

### Structure
```json
{
  "zh-TW": {
    "section": {
      "key": "繁體中文文字",
      "nested": {
        "key": "巢狀結構"
      }
    }
  },
  "ja": {
    "section": {
      "key": "日本語テキスト",
      "nested": {
        "key": "ネストされた構造"
      }
    }
  },
  "en": {
    "section": {
      "key": "English text",
      "nested": {
        "key": "Nested structure"
      }
    }
  }
}
```

### Template Variables
```json
{
  "en": {
    "message": {
      "itemsFound": "Found ${count} items in ${location}"
    }
  }
}
```

Usage:
```javascript
i18n.t('message.itemsFound', { count: 5, location: 'Limsa Lominsa' });
// Output: "Found 5 items in Limsa Lominsa"
```

## Adding a New Tool

### 1. Create Translation File
Create `/assets/i18n/tools/your-tool.json`:

```json
{
  "zh-TW": {
    "title": "工具標題",
    "description": "工具描述",
    "buttons": {
      "calculate": "計算",
      "reset": "重置"
    },
    "messages": {
      "result": "結果: ${value}"
    }
  },
  "ja": {
    "title": "ツールタイトル",
    "description": "ツールの説明",
    "buttons": {
      "calculate": "計算",
      "reset": "リセット"
    },
    "messages": {
      "result": "結果: ${value}"
    }
  },
  "en": {
    "title": "Tool Title",
    "description": "Tool description",
    "buttons": {
      "calculate": "Calculate",
      "reset": "Reset"
    },
    "messages": {
      "result": "Result: ${value}"
    }
  }
}
```

### 2. Update HTML
```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <title data-i18n="title">Tool Title</title>
    <link rel="stylesheet" href="../../assets/css/language-switcher.css">
</head>
<body>
    <header>
        <!-- Navigation with language switcher -->
        <div id="languageSwitcher" data-language-switcher></div>
    </header>
    
    <main>
        <h1 data-i18n="title">Tool Title</h1>
        <p data-i18n="description">Tool description</p>
        
        <button data-i18n="buttons.calculate">Calculate</button>
        <button data-i18n="buttons.reset">Reset</button>
        
        <div id="result"></div>
    </main>
    
    <script src="../../assets/js/i18n.js"></script>
    <script src="../../assets/js/components/language-switcher.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            // Initialize i18n
            await i18n.init(['common', 'tools/your-tool']);
            
            // Your tool logic here
            document.querySelector('[data-i18n="buttons.calculate"]').addEventListener('click', () => {
                const result = calculateSomething();
                document.getElementById('result').textContent = i18n.t('messages.result', { value: result });
            });
        });
    </script>
</body>
</html>
```

## Translation Guidelines

### Key Naming Convention
- Use hierarchical structure: `section.subsection.element`
- Be descriptive: `user.profile.editButton` not `btn1`
- Keep consistent across files

### Text Style Guide

#### Traditional Chinese (zh-TW)
- Use Taiwan terminology (資料 not 數據)
- Use Traditional characters
- Keep formal but friendly tone

#### Japanese (ja)
- Use appropriate honorifics
- Mix Kanji, Hiragana, and Katakana appropriately
- Use です/ます form for interface text

#### English (en)
- Use clear, concise language
- Avoid jargon unless necessary
- Keep consistent terminology with FF14 official translations

### Common Terms Reference

| English | 繁體中文 | 日本語 |
|---------|---------|--------|
| Dungeon | 副本 | ダンジョン |
| Character | 角色 | キャラクター |
| Level | 等級 | レベル |
| Item | 物品 | アイテム |
| Quest | 任務 | クエスト |
| Job | 職業 | ジョブ |
| Skill | 技能 | スキル |
| Equipment | 裝備 | 装備 |
| Party | 隊伍 | パーティー |
| Guild | 公會 | ギルド |

## Language Switcher Options

### Button Style (Default)
```javascript
new LanguageSwitcher('containerId', {
    style: 'buttons',
    showNativeName: true
});
```

### Dropdown Style
```javascript
new LanguageSwitcher('containerId', {
    style: 'dropdown',
    showNativeName: false
});
```

### Flag Style
```javascript
new LanguageSwitcher('containerId', {
    style: 'flags',
    showNativeName: true,
    showFlag: true
});
```

## Performance Considerations

### Lazy Loading
Translations are loaded on-demand and cached in localStorage:
```javascript
// Only load what you need
await i18n.init(['common', 'tools/specific-tool']);
```

### Cache Management
- Translations are cached with version control
- Cache is automatically invalidated when version changes
- Clear cache manually if needed:
```javascript
localStorage.removeItem('ff14tw_i18n_cache_common_1.0.0');
```

## Testing

### Manual Testing Checklist
- [ ] All text elements update when language changes
- [ ] Language preference persists after page reload
- [ ] Fallback to zh-TW for missing translations
- [ ] Dynamic content updates correctly
- [ ] Date and number formatting matches locale
- [ ] Language switcher works on mobile

### URL Parameter Testing
Test specific language by adding `?lang=` parameter:
- `http://localhost:8000/?lang=en`
- `http://localhost:8000/?lang=ja`
- `http://localhost:8000/?lang=zh-TW`

## Troubleshooting

### Translations Not Loading
1. Check browser console for errors
2. Verify JSON file syntax
3. Ensure file paths are correct
4. Check CORS if using local file://

### Missing Translations
- Check console for warnings about missing keys
- Verify key names match exactly
- Ensure all languages have the same keys

### Language Not Persisting
- Check localStorage is enabled
- Verify no errors in storing preferences
- Check for localStorage quota issues

## Contributing Translations

### For Developers
1. Fork the repository
2. Add/update translations in appropriate JSON files
3. Test thoroughly
4. Submit pull request

### For Non-Developers
1. Open an issue with translation suggestions
2. Use the translation template provided
3. Specify which tool/page needs translation

## Future Enhancements

- [ ] Add more languages (Korean, German, French)
- [ ] Implement pluralization rules
- [ ] Add context-specific translations
- [ ] Create translation management UI
- [ ] Add automatic translation validation
- [ ] Implement regional variations (en-US vs en-GB)

## Support

For i18n-related issues or questions:
- Open an issue on GitHub
- Tag with `i18n` or `translation`
- Include browser and language information