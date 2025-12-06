/**
 * Macro Conversion Engine
 * Handles language detection, parsing, and translation of FF14 macros
 */
class ConversionEngine {
    // Action command variants in different languages
    static ACTION_COMMANDS = {
        zh: ['/ac', '/action', '/技能'],
        en: ['/ac', '/action'],
        ja: ['/ac', '/action', '/アクション']
    };

    // Language names for display
    static LANGUAGE_NAMES = {
        zh: '繁體中文',
        en: 'English',
        ja: '日本語'
    };

    constructor(mappings) {
        this.mappings = mappings;
        this.textCommandLookup = this.buildTextCommandLookup();
        this.craftActionLookup = this.buildCraftActionLookup();
    }

    /**
     * Build lookup tables for text commands by language
     */
    buildTextCommandLookup() {
        const lookup = { zh: {}, en: {}, ja: {} };

        for (const cmd of this.mappings.textCommands) {
            // Add base command (usually English)
            if (cmd.baseCommand) {
                const baseLower = cmd.baseCommand.toLowerCase();
                lookup.en[baseLower] = cmd;
            }

            // Add localized aliases
            for (const lang of ['zh', 'en', 'ja']) {
                const alias = cmd[lang]?.alias;
                const shortAlias = cmd[lang]?.shortAlias;

                if (alias) {
                    lookup[lang][alias.toLowerCase()] = cmd;
                }
                if (shortAlias && shortAlias.startsWith('/')) {
                    lookup[lang][shortAlias.toLowerCase()] = cmd;
                }
            }
        }

        return lookup;
    }

    /**
     * Build lookup tables for craft actions by language
     */
    buildCraftActionLookup() {
        const lookup = { zh: {}, en: {}, ja: {} };

        for (const action of this.mappings.craftActions) {
            for (const lang of ['zh', 'en', 'ja']) {
                const name = action[lang];
                if (name) {
                    lookup[lang][name.toLowerCase()] = action;
                }
            }
        }

        return lookup;
    }

    /**
     * Detect the language of a macro text
     * @param {string} text - The macro text to analyze
     * @returns {string} - Detected language code (zh, en, ja)
     */
    detectLanguage(text) {
        const scores = { zh: 0, en: 0, ja: 0 };
        const lines = text.split('\n').filter(line => line.trim());

        for (const line of lines) {
            // Check for Japanese-specific characters (hiragana/katakana)
            if (/[\u3040-\u309f\u30a0-\u30ff]/.test(line)) {
                scores.ja += 5;
            }
            // Check for CJK characters (could be zh or ja)
            else if (/[\u4e00-\u9fff]/.test(line)) {
                scores.zh += 3;
            }

            // Check for known commands and actions
            const parsed = this.parseLine(line);

            if (parsed.command) {
                const cmdLower = parsed.command.toLowerCase();
                for (const lang of ['zh', 'en', 'ja']) {
                    if (this.textCommandLookup[lang][cmdLower]) {
                        scores[lang] += 5;
                    }
                }
            }

            if (parsed.argument) {
                const argLower = parsed.argument.toLowerCase();
                for (const lang of ['zh', 'en', 'ja']) {
                    if (this.craftActionLookup[lang][argLower]) {
                        scores[lang] += 10;
                    }
                }
            }
        }

        // Return the language with highest score, default to en if tied
        const maxScore = Math.max(scores.zh, scores.en, scores.ja);
        if (maxScore === 0) return 'en';

        if (scores.ja === maxScore) return 'ja';
        if (scores.zh === maxScore) return 'zh';
        return 'en';
    }

    /**
     * Parse a single macro line
     * @param {string} line - The line to parse
     * @returns {object} - Parsed line components
     */
    parseLine(line) {
        const result = {
            type: 'unknown',
            command: null,
            argument: null,
            waitTime: null,
            rawLine: line,
            prefix: '',
            suffix: ''
        };

        const trimmedLine = line.trim();
        if (!trimmedLine) {
            result.type = 'empty';
            return result;
        }

        // Check if it's a comment
        if (trimmedLine.startsWith('#')) {
            result.type = 'comment';
            return result;
        }

        // Check if it starts with a command
        if (!trimmedLine.startsWith('/')) {
            result.type = 'text';
            return result;
        }

        // Extract wait time from end: <wait.N> or <wait>
        let workingLine = trimmedLine;
        const waitMatch = workingLine.match(/<wait(?:\.(\d+(?:\.\d+)?))?>/i);
        if (waitMatch) {
            result.waitTime = waitMatch[0];
            workingLine = workingLine.replace(waitMatch[0], '').trim();
        }

        // Match command pattern: /command "argument" or /command argument
        // Handle quoted arguments with double quotes
        const cmdMatch = workingLine.match(/^(\/[^\s"]+)(?:\s+"([^"]+)"|\s+([^\s<]+))?(.*)$/);

        if (cmdMatch) {
            result.type = 'command';
            result.command = cmdMatch[1];
            result.argument = cmdMatch[2] || cmdMatch[3] || null;
            result.suffix = (cmdMatch[4] || '').trim();
        }

        return result;
    }

    /**
     * Check if a command is an action command (/ac, /action, etc.)
     * @param {string} command - The command to check
     * @param {string} lang - The language code
     * @returns {boolean}
     */
    isActionCommand(command, lang) {
        const cmdLower = command.toLowerCase();
        const allActionCmds = [
            ...ConversionEngine.ACTION_COMMANDS.zh,
            ...ConversionEngine.ACTION_COMMANDS.en,
            ...ConversionEngine.ACTION_COMMANDS.ja
        ];
        return allActionCmds.includes(cmdLower);
    }

    /**
     * Translate a command to target language
     * @param {string} command - The command to translate
     * @param {string} sourceLang - Source language code
     * @param {string} targetLang - Target language code
     * @returns {object} - { translated: string, found: boolean }
     */
    translateCommand(command, sourceLang, targetLang) {
        const cmdLower = command.toLowerCase();

        // Check if it's an action command - translate to target's /ac
        if (this.isActionCommand(command, sourceLang)) {
            // Use /ac for all languages (it's universal)
            return { translated: '/ac', found: true };
        }

        // Look up in text command table
        const cmdEntry = this.textCommandLookup[sourceLang][cmdLower];

        if (cmdEntry) {
            // Get target language alias
            const targetAlias = cmdEntry[targetLang]?.alias;
            if (targetAlias) {
                return { translated: targetAlias, found: true };
            }

            // Fall back to base command
            if (cmdEntry.baseCommand) {
                return { translated: cmdEntry.baseCommand, found: true };
            }
        }

        // Not found
        return { translated: command, found: false };
    }

    /**
     * Translate a craft action name to target language
     * @param {string} actionName - The action name to translate
     * @param {string} sourceLang - Source language code
     * @param {string} targetLang - Target language code
     * @returns {object} - { translated: string, found: boolean }
     */
    translateCraftAction(actionName, sourceLang, targetLang) {
        const nameLower = actionName.toLowerCase();
        const actionEntry = this.craftActionLookup[sourceLang][nameLower];

        if (actionEntry) {
            const targetName = actionEntry[targetLang];
            if (targetName) {
                return { translated: targetName, found: true };
            }
        }

        // Not found
        return { translated: actionName, found: false };
    }

    /**
     * Translate a single line
     * @param {string} line - The line to translate
     * @param {string} sourceLang - Source language code
     * @param {string} targetLang - Target language code
     * @returns {object} - { output: string, untranslatable: string[] }
     */
    translateLine(line, sourceLang, targetLang) {
        const result = {
            output: line,
            untranslatable: []
        };

        const parsed = this.parseLine(line);

        // Skip non-command lines
        if (parsed.type !== 'command') {
            return result;
        }

        // Build the translated line
        let translatedParts = [];

        // Translate the command
        const cmdResult = this.translateCommand(parsed.command, sourceLang, targetLang);
        translatedParts.push(cmdResult.translated);

        if (!cmdResult.found && parsed.command) {
            result.untranslatable.push(parsed.command);
        }

        // Translate the argument if it's an action command
        if (parsed.argument) {
            if (this.isActionCommand(parsed.command, sourceLang)) {
                const actionResult = this.translateCraftAction(parsed.argument, sourceLang, targetLang);
                translatedParts.push(`"${actionResult.translated}"`);

                if (!actionResult.found) {
                    result.untranslatable.push(parsed.argument);
                }
            } else {
                // Non-action command argument - keep as is
                translatedParts.push(`"${parsed.argument}"`);
            }
        }

        // Add suffix if any
        if (parsed.suffix) {
            translatedParts.push(parsed.suffix);
        }

        // Add wait time if any
        if (parsed.waitTime) {
            translatedParts.push(parsed.waitTime);
        }

        result.output = translatedParts.join(' ');
        return result;
    }

    /**
     * Convert a full macro text
     * @param {string} text - The macro text to convert
     * @param {string} sourceLang - Source language code
     * @param {string} targetLang - Target language code
     * @returns {object[]} - Array of { output: string, untranslatable: string[] }
     */
    convert(text, sourceLang, targetLang) {
        const lines = text.split('\n');
        const results = [];

        for (const line of lines) {
            const result = this.translateLine(line, sourceLang, targetLang);
            results.push(result);
        }

        return results;
    }

    /**
     * Get the display name for a language code
     * @param {string} langCode - Language code (zh, en, ja)
     * @returns {string} - Display name
     */
    getLanguageName(langCode) {
        return ConversionEngine.LANGUAGE_NAMES[langCode] || langCode;
    }
}

// Export for use in other modules
window.ConversionEngine = ConversionEngine;
