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
     * Find a command in all languages
     * @param {string} command - The command to find
     * @returns {{ sourceLang: string, entry: object } | null}
     */
    findCommandInAllLanguages(command) {
        const cmdLower = command.toLowerCase();
        for (const lang of ['zh', 'en', 'ja']) {
            if (this.textCommandLookup[lang][cmdLower]) {
                return {
                    sourceLang: lang,
                    entry: this.textCommandLookup[lang][cmdLower]
                };
            }
        }
        return null;
    }

    /**
     * Find a craft action in all languages
     * @param {string} actionName - The action name to find
     * @returns {{ sourceLang: string, entry: object } | null}
     */
    findCraftActionInAllLanguages(actionName) {
        const nameLower = actionName.toLowerCase();
        for (const lang of ['zh', 'en', 'ja']) {
            if (this.craftActionLookup[lang][nameLower]) {
                return {
                    sourceLang: lang,
                    entry: this.craftActionLookup[lang][nameLower]
                };
            }
        }
        return null;
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
     * Check if a command is an action command (/ac, /action, etc.) in any language
     * @param {string} command - The command to check
     * @returns {boolean}
     */
    isActionCommand(command) {
        const cmdLower = command.toLowerCase();
        const allActionCmds = [
            ...ConversionEngine.ACTION_COMMANDS.zh,
            ...ConversionEngine.ACTION_COMMANDS.en,
            ...ConversionEngine.ACTION_COMMANDS.ja
        ];
        return allActionCmds.includes(cmdLower);
    }

    /**
     * Translate a command to target language (auto-detect source language)
     * @param {string} command - The command to translate
     * @param {string} targetLang - Target language code
     * @returns {object} - { translated: string, found: boolean }
     */
    translateCommand(command, targetLang) {
        // Check if it's an action command - translate to /ac (universal)
        if (this.isActionCommand(command)) {
            return { translated: '/ac', found: true };
        }

        // Find the command in all languages
        const found = this.findCommandInAllLanguages(command);

        if (found) {
            // Get target language alias
            const targetAlias = found.entry[targetLang]?.alias;
            if (targetAlias) {
                return { translated: targetAlias, found: true };
            }

            // Fall back to base command
            if (found.entry.baseCommand) {
                return { translated: found.entry.baseCommand, found: true };
            }
        }

        // Not found - keep original
        return { translated: command, found: false };
    }

    /**
     * Translate a craft action name to target language (auto-detect source language)
     * @param {string} actionName - The action name to translate
     * @param {string} targetLang - Target language code
     * @returns {object} - { translated: string, found: boolean }
     */
    translateCraftAction(actionName, targetLang) {
        const found = this.findCraftActionInAllLanguages(actionName);

        if (found) {
            const targetName = found.entry[targetLang];
            if (targetName) {
                return { translated: targetName, found: true };
            }
        }

        // Not found - keep original
        return { translated: actionName, found: false };
    }

    /**
     * Translate a single line (auto-detect source language per token)
     * @param {string} line - The line to translate
     * @param {string} targetLang - Target language code
     * @returns {object} - { output: string, untranslatable: string[] }
     */
    translateLine(line, targetLang) {
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

        // Translate the command (auto-detect source language)
        const cmdResult = this.translateCommand(parsed.command, targetLang);
        translatedParts.push(cmdResult.translated);

        if (!cmdResult.found && parsed.command) {
            result.untranslatable.push(parsed.command);
        }

        // Translate the argument if it's an action command
        if (parsed.argument) {
            if (this.isActionCommand(parsed.command)) {
                const actionResult = this.translateCraftAction(parsed.argument, targetLang);
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
     * Convert a full macro text (auto-detect source language per line)
     * @param {string} text - The macro text to convert
     * @param {string} targetLang - Target language code
     * @returns {object[]} - Array of { output: string, untranslatable: string[] }
     */
    convert(text, targetLang) {
        const lines = text.split('\n');
        return lines.map(line => this.translateLine(line, targetLang));
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
