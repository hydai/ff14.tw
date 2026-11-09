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

    // Pre-computed list of all action commands for efficient lookup
    static ALL_ACTION_COMMANDS = [
        ...ConversionEngine.ACTION_COMMANDS.zh,
        ...ConversionEngine.ACTION_COMMANDS.en,
        ...ConversionEngine.ACTION_COMMANDS.ja
    ];

    // English short commands that macros use a lot: short command -> full command.
    // The game keeps them in a ShortCommand column that macro-mappings.json does not have, so they are listed here;
    // only the ones whose full command is in the data. The client of every language understands the English
    // commands, so a short command is kept as typed (like /ac).
    static SHORT_COMMANDS = Object.freeze({
        '/mlock': '/macrolock',
        '/merror': '/macroerror',
        '/micon': '/macroicon',
        '/e': '/echo',
        '/p': '/party',
        '/s': '/say',
        '/sh': '/shout',
        '/y': '/yell',
        '/t': '/tell',
        '/r': '/reply',
        '/a': '/alliance',
        '/fc': '/freecompany',
        '/em': '/emote',
        '/gs': '/gearset',
        '/l1': '/linkshell1',
        '/l2': '/linkshell2',
        '/l3': '/linkshell3',
        '/l4': '/linkshell4',
        '/l5': '/linkshell5',
        '/l6': '/linkshell6',
        '/l7': '/linkshell7',
        '/l8': '/linkshell8',
        '/cwl1': '/cwlinkshell1',
        '/cwl2': '/cwlinkshell2',
        '/cwl3': '/cwlinkshell3',
        '/cwl4': '/cwlinkshell4',
        '/cwl5': '/cwlinkshell5',
        '/cwl6': '/cwlinkshell6',
        '/cwl7': '/cwlinkshell7',
        '/cwl8': '/cwlinkshell8'
    });

    // Like /ac, the argument of this full command (its aliases and /micon too) is a craft action name.
    // Unlike /ac, a second argument can follow the name (/micon Manipulation action)
    static MACRO_ICON_COMMAND = '/macroicon';

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
        // Guides copied from the web often have a curly apostrophe (Byregot’s Blessing), the data has the straight one
        const nameLower = actionName.replace(/\u2019/g, "'").toLowerCase();
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
     * @returns {object} - { type, command, rest }: type is 'empty' (nothing but whitespace), 'text' (the first
     *   character is not /) or 'command'; rest is everything after the command (without the spaces between them)
     */
    parseLine(line) {
        const result = {
            type: 'unknown',
            command: null,
            rest: ''
        };

        const trimmedLine = line.trim();
        if (!trimmedLine) {
            result.type = 'empty';
            return result;
        }

        // Anything that does not start with / is chat text. FFXIV has no comment syntax, so a # line is text too
        if (!trimmedLine.startsWith('/')) {
            result.type = 'text';
            return result;
        }

        // Match command pattern: /command, then the rest of the line.
        // \s also matches the full-width space (U+3000) that Japanese guides put after the command.
        const cmdMatch = trimmedLine.match(/^(\/\S*)\s*([\s\S]*)$/);

        if (cmdMatch) {
            result.type = 'command';
            result.command = cmdMatch[1];
            result.rest = cmdMatch[2];
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
        return ConversionEngine.ALL_ACTION_COMMANDS.includes(cmdLower);
    }

    /**
     * Translate a command to target language (auto-detect source language)
     * @param {string} command - The command to translate
     * @param {string} targetLang - Target language code
     * @returns {object} - { translated: string, found: boolean, baseCommand: string|null }
     *   baseCommand is the full command in lower case, whichever way it was typed (null when not found)
     */
    translateCommand(command, targetLang) {
        // Check if it's an action command - translate to /ac (universal)
        if (this.isActionCommand(command)) {
            return { translated: '/ac', found: true, baseCommand: '/action' };
        }

        // A short command (/mlock, /e...) stays as typed, whatever the target language
        const cmdLower = command.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(ConversionEngine.SHORT_COMMANDS, cmdLower)) {
            return { translated: command, found: true, baseCommand: ConversionEngine.SHORT_COMMANDS[cmdLower] };
        }

        // Find the command in all languages
        const found = this.findCommandInAllLanguages(command);

        if (found) {
            const baseCommand = (found.entry.baseCommand || '').toLowerCase();

            // Get target language alias
            const targetAlias = found.entry[targetLang]?.alias;
            if (targetAlias) {
                return { translated: targetAlias, found: true, baseCommand };
            }

            // Fall back to base command
            if (found.entry.baseCommand) {
                return { translated: found.entry.baseCommand, found: true, baseCommand };
            }
        }

        // Not found - keep original
        return { translated: command, found: false, baseCommand: null };
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
     * Translate the craft action name in the part of a line after /ac or /macroicon.
     * The name may be quoted ("Muscle Memory") or not (Muscle Memory); whatever follows it
     * (a second argument like "action", <wait.3>, <se.1>...) stays as typed.
     * A name found is written with straight quotes; a name not found stays as typed, with the quotes it had.
     * @param {string} rest - Everything after the command
     * @param {string} targetLang - Target language code
     * @param {boolean} allowExtraWords - Whether an unquoted name may be followed by a second argument
     *   (/macroicon): the longest name that is found is used and the words left over stay as typed.
     *   When false (/ac) the whole segment up to the first <...> has to be the name, or it stays as typed
     * @returns {object} - { text: string, problems: Array<{ kind: 'action', text: string }> }
     */
    translateSkillArguments(rest, targetLang, allowExtraWords = false) {
        const join = (...parts) => parts.filter(Boolean).join(' ');

        // The game only understands straight quotes: “ ” „ -> "
        const body = rest.replace(/[\u201C\u201D\u201E]/g, '"').trim();

        // A quoted name: "Muscle Memory" <wait.3>
        const quoted = body.match(/^"([^"]+)"\s*([\s\S]*)$/);
        if (quoted) {
            const [, name, tail] = quoted;
            // Names copied from a web page may have a no-break space or a full-width space between the words, which look
            // like a normal space: the lookup collapses the whitespace, as the unquoted names below do (they split on it).
            // A name that is still not found stays exactly as typed
            const actionResult = this.translateCraftAction(name.replace(/\s+/g, ' ').trim(), targetLang);
            return {
                text: join(`"${actionResult.found ? actionResult.translated : name}"`, tail),
                problems: actionResult.found ? [] : [{ kind: 'action', text: name }]
            };
        }

        // No quotes: the name is the words up to the first <...> (<wait.3>, <se.1>)
        const bracket = body.indexOf('<');
        const segment = (bracket === -1 ? body : body.slice(0, bracket)).trim();
        const tail = bracket === -1 ? '' : body.slice(bracket);
        const words = segment ? segment.split(/\s+/) : [];

        // The whole segment is tried first. Only where a second argument can follow the name (/micon Manipulation
        // action) shorter names are tried too, one word less each time, and the words left over stay as typed.
        // /ac takes nothing but the name, so a segment that is not a name has to stay as typed and be reported:
        // Manipulation is in the data, Manipulation II is not, and must not turn into "掌握" II.
        const shortest = allowExtraWords ? 1 : words.length;
        for (let count = words.length; count >= 1 && count >= shortest; count--) {
            const actionResult = this.translateCraftAction(words.slice(0, count).join(' '), targetLang);
            if (actionResult.found) {
                return {
                    text: join(`"${actionResult.translated}"`, words.slice(count).join(' '), tail),
                    problems: []
                };
            }
        }

        // No name found: the whole segment stays as typed, without quotes
        return {
            text: join(segment, tail),
            problems: segment ? [{ kind: 'action', text: segment }] : []
        };
    }

    /**
     * Translate a single line (auto-detect source language per token)
     * @param {string} line - The line to translate
     * @param {string} targetLang - Target language code
     * @returns {object} - { output: string, problems: Array<{ kind: 'action'|'command'|'text', text: string }> }
     *   problems lists what could not be translated: a craft action not in the data, an unknown command, or a line
     *   that is not a command at all ('text': the game sends it to the chat; text is the line without the spaces around it)
     */
    translateLine(line, targetLang) {
        // convert() already splits on \r\n, \n and \r; a line handed in directly may still have a \r on it,
        // and a \r never belongs in the output
        const text = line.replace(/\r/g, '');
        const result = {
            output: text,
            problems: []
        };

        const parsed = this.parseLine(text);

        // A line that is not a command stays as typed, and is reported: in the game it would be sent to the chat
        // (a pasted title, a table number in front of a command, a # note). Blank lines are fine
        if (parsed.type === 'text') {
            result.problems.push({ kind: 'text', text: text.trim() });
            return result;
        }
        if (parsed.type !== 'command') {
            return result;
        }

        // Translate the command (auto-detect source language)
        const cmdResult = this.translateCommand(parsed.command, targetLang);

        // Unknown command - keep the whole line as typed
        if (!cmdResult.found) {
            result.output = text.trim();
            result.problems.push({ kind: 'command', text: parsed.command });
            return result;
        }

        // The rest of the line stays as typed, except the craft action name of /ac and /macroicon
        let rest = parsed.rest;
        const isMacroIcon = cmdResult.baseCommand === ConversionEngine.MACRO_ICON_COMMAND;
        if (this.isActionCommand(parsed.command) || isMacroIcon) {
            // Only /macroicon can have a second argument after the name
            const skill = this.translateSkillArguments(rest, targetLang, isMacroIcon);
            rest = skill.text;
            result.problems.push(...skill.problems);
        }

        result.output = rest ? `${cmdResult.translated} ${rest}` : cmdResult.translated;
        return result;
    }

    /**
     * Convert a full macro text (auto-detect source language per line)
     * @param {string} text - The macro text to convert
     * @param {string} targetLang - Target language code
     * @returns {object[]} - One { output, problems } per input line (\r\n, \n and a lone \r each end a line)
     */
    convert(text, targetLang) {
        // A lone \r (old Mac line break) is a line break too: translateLine takes every \r out of a line,
        // so two lines split only on \n would be glued together
        const lines = text.split(/\r\n|\r|\n/);
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
