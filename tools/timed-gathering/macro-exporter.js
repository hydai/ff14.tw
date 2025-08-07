// 巨集匯出模組
class MacroExporter {
    static CONSTANTS = {
        MAX_MACRO_LINES: 15,  // FF14 單個巨集最多 15 行
        ALARM_FORMAT: '/alarm "{description}" et rp {time} 1 se04 mute',
        CLEAR_COMMAND: '/alarm clear',
        TIME_FORMAT_REGEX: /^(\d{2}):(\d{2})$/
    };

    constructor() {
        // 音效選項
        this.soundEffects = [
            { value: 'se01', label: 'Sound Effect 1' },
            { value: 'se02', label: 'Sound Effect 2' },
            { value: 'se03', label: 'Sound Effect 3' },
            { value: 'se04', label: 'Sound Effect 4' },
            { value: 'se05', label: 'Sound Effect 5' },
            { value: 'se06', label: 'Sound Effect 6' },
            { value: 'se07', label: 'Sound Effect 7' },
            { value: 'se08', label: 'Sound Effect 8' },
            { value: 'se09', label: 'Sound Effect 9' },
            { value: 'se10', label: 'Sound Effect 10' },
            { value: 'se11', label: 'Sound Effect 11' },
            { value: 'se12', label: 'Sound Effect 12' },
            { value: 'se13', label: 'Sound Effect 13' },
            { value: 'se14', label: 'Sound Effect 14' },
            { value: 'se15', label: 'Sound Effect 15' },
            { value: 'se16', label: 'Sound Effect 16' }
        ];
    }

    /**
     * 生成巨集
     * @param {Array} items - 採集物項目陣列
     * @param {Object} options - 選項設定
     * @returns {string} 巨集文字
     */
    generate(items, options = {}) {
        const {
            includeClear = true,
            sortByTime = true,
            soundEffect = 'se04',
            groupByTime = false,
            maxLines = MacroExporter.CONSTANTS.MAX_MACRO_LINES
        } = options;

        if (!items || items.length === 0) {
            return '';
        }

        let processedItems = [...items];

        // 按時間排序
        if (sortByTime) {
            processedItems.sort((a, b) => {
                const timeA = this.parseTime(a.time);
                const timeB = this.parseTime(b.time);
                return timeA - timeB;
            });
        }

        // 生成巨集指令
        let commands = [];

        // 加入清除指令
        if (includeClear) {
            commands.push(MacroExporter.CONSTANTS.CLEAR_COMMAND);
        }

        // 為每個項目生成鬧鐘指令
        for (const item of processedItems) {
            const command = this.generateAlarmCommand(item, soundEffect);
            if (command) {
                commands.push(command);
            }
        }

        // 如果超過最大行數，分組處理
        if (commands.length > maxLines) {
            return this.splitIntoMacros(commands, maxLines, includeClear);
        }

        return commands.join('\n');
    }

    /**
     * 生成單個鬧鐘指令
     * @param {Object} item - 採集物項目
     * @param {string} soundEffect - 音效
     * @returns {string} 鬧鐘指令
     */
    generateAlarmCommand(item, soundEffect = 'se04') {
        // 如果有 macroFormat，優先使用
        if (item.macroFormat) {
            const time = this.formatTimeForAlarm(item.time);
            return `/alarm "${item.macroFormat}" et rp ${time} 1 ${soundEffect} mute`;
        }

        // 否則使用標準格式
        const description = this.generateDescription(item);
        const time = this.formatTimeForAlarm(item.time);
        
        return `/alarm "${description}" et rp ${time} 1 ${soundEffect} mute`;
    }

    /**
     * 生成描述文字
     * @param {Object} item - 採集物項目
     * @returns {string} 描述文字
     */
    generateDescription(item) {
        const typePrefix = this.getTypePrefix(item.type);
        const level = item.level ? `Lv${item.level}` : '';
        const location = item.location || item.zone;
        
        // 格式：類型/等級/地點/名稱
        const parts = [typePrefix];
        
        if (level) {
            parts.push(level);
        }
        
        parts.push(location);
        parts.push(item.name);
        
        return parts.join('/');
    }

    /**
     * 取得類型前綴
     * @param {string} type - 採集類型
     * @returns {string} 類型前綴
     */
    getTypePrefix(type) {
        const prefixes = {
            'mining': '採',
            'botany': '園',
            'fishing': '釣'
        };
        return prefixes[type] || '？';
    }

    /**
     * 格式化時間為鬧鐘格式
     * @param {string} time - 時間字串 (HH:MM)
     * @returns {string} 格式化時間 (HHMM)
     */
    formatTimeForAlarm(time) {
        const match = time.match(MacroExporter.CONSTANTS.TIME_FORMAT_REGEX);
        if (match) {
            return match[1] + match[2];
        }
        // 如果格式不正確，嘗試移除冒號
        return time.replace(':', '');
    }

    /**
     * 解析時間為分鐘數
     * @param {string} time - 時間字串 (HH:MM)
     * @returns {number} 分鐘數
     */
    parseTime(time) {
        const match = time.match(MacroExporter.CONSTANTS.TIME_FORMAT_REGEX);
        if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            return hours * 60 + minutes;
        }
        return 0;
    }

    /**
     * 將指令分割成多個巨集
     * @param {Array} commands - 指令陣列
     * @param {number} maxLines - 每個巨集最大行數
     * @param {boolean} includeClear - 是否包含清除指令
     * @returns {string} 分組的巨集文字
     */
    splitIntoMacros(commands, maxLines, includeClear) {
        const macros = [];
        let currentMacro = [];
        let lineCount = 0;
        let macroNumber = 1;

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            
            // 如果是清除指令，只在第一個巨集中包含
            if (command === MacroExporter.CONSTANTS.CLEAR_COMMAND) {
                if (macroNumber === 1) {
                    currentMacro.push(command);
                    lineCount++;
                }
                continue;
            }

            // 如果當前巨集已滿，開始新巨集
            if (lineCount >= maxLines) {
                macros.push({
                    number: macroNumber,
                    commands: currentMacro.join('\n')
                });
                
                macroNumber++;
                currentMacro = [];
                lineCount = 0;
            }

            currentMacro.push(command);
            lineCount++;
        }

        // 加入最後一個巨集
        if (currentMacro.length > 0) {
            macros.push({
                number: macroNumber,
                commands: currentMacro.join('\n')
            });
        }

        // 格式化輸出
        return this.formatMacroGroups(macros);
    }

    /**
     * 格式化巨集分組
     * @param {Array} macros - 巨集陣列
     * @returns {string} 格式化的巨集文字
     */
    formatMacroGroups(macros) {
        let output = [];
        
        output.push('=== 巨集已分組（每組最多15行）===\n');
        
        for (const macro of macros) {
            output.push(`--- 巨集 ${macro.number} ---`);
            output.push(macro.commands);
            output.push('');
        }
        
        output.push('=== 請分別複製每個巨集到遊戲中 ===');
        
        return output.join('\n');
    }

    /**
     * 生成按地區分組的巨集
     * @param {Array} items - 採集物項目陣列
     * @param {Object} options - 選項設定
     * @returns {Object} 分組的巨集物件
     */
    generateByZone(items, options = {}) {
        const {
            includeClear = true,
            sortByTime = true,
            soundEffect = 'se04'
        } = options;

        // 按地區分組
        const zoneGroups = {};
        
        for (const item of items) {
            const zone = item.zone || '未知地區';
            if (!zoneGroups[zone]) {
                zoneGroups[zone] = [];
            }
            zoneGroups[zone].push(item);
        }

        // 為每個地區生成巨集
        const macrosByZone = {};
        
        for (const [zone, zoneItems] of Object.entries(zoneGroups)) {
            macrosByZone[zone] = this.generate(zoneItems, {
                includeClear,
                sortByTime,
                soundEffect
            });
        }

        return macrosByZone;
    }

    /**
     * 生成按資料片分組的巨集
     * @param {Array} items - 採集物項目陣列
     * @param {Object} options - 選項設定
     * @returns {Object} 分組的巨集物件
     */
    generateByExpansion(items, options = {}) {
        const {
            includeClear = true,
            sortByTime = true,
            soundEffect = 'se04'
        } = options;

        // 按資料片分組
        const expansionGroups = {};
        
        for (const item of items) {
            const expansion = item.expansion || '未知';
            if (!expansionGroups[expansion]) {
                expansionGroups[expansion] = [];
            }
            expansionGroups[expansion].push(item);
        }

        // 為每個資料片生成巨集
        const macrosByExpansion = {};
        
        for (const [expansion, expansionItems] of Object.entries(expansionGroups)) {
            macrosByExpansion[expansion] = this.generate(expansionItems, {
                includeClear,
                sortByTime,
                soundEffect
            });
        }

        return macrosByExpansion;
    }

    /**
     * 驗證巨集格式
     * @param {string} macro - 巨集文字
     * @returns {Object} 驗證結果
     */
    validateMacro(macro) {
        const lines = macro.split('\n').filter(line => line.trim());
        const errors = [];
        const warnings = [];
        
        // 檢查行數
        if (lines.length > MacroExporter.CONSTANTS.MAX_MACRO_LINES) {
            errors.push(`巨集超過 ${MacroExporter.CONSTANTS.MAX_MACRO_LINES} 行限制（目前 ${lines.length} 行）`);
        }
        
        // 檢查每行格式
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            
            // 檢查是否為有效指令
            if (!line.startsWith('/alarm')) {
                if (line !== MacroExporter.CONSTANTS.CLEAR_COMMAND) {
                    warnings.push(`第 ${lineNumber} 行：非標準鬧鐘指令`);
                }
            }
            
            // 檢查行長度（FF14 限制）
            if (line.length > 180) {
                errors.push(`第 ${lineNumber} 行：超過字元限制（180字元）`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            lineCount: lines.length
        };
    }

    /**
     * 生成簡化版巨集（不含描述）
     * @param {Array} items - 採集物項目陣列
     * @param {Object} options - 選項設定
     * @returns {string} 簡化巨集文字
     */
    generateSimplified(items, options = {}) {
        const {
            includeClear = true,
            sortByTime = true,
            soundEffect = 'se04'
        } = options;

        if (!items || items.length === 0) {
            return '';
        }

        let processedItems = [...items];

        // 按時間排序
        if (sortByTime) {
            processedItems.sort((a, b) => {
                const timeA = this.parseTime(a.time);
                const timeB = this.parseTime(b.time);
                return timeA - timeB;
            });
        }

        // 生成簡化指令
        let commands = [];

        if (includeClear) {
            commands.push(MacroExporter.CONSTANTS.CLEAR_COMMAND);
        }

        for (const item of processedItems) {
            const time = this.formatTimeForAlarm(item.time);
            const simpleName = item.name.substring(0, 10); // 限制名稱長度
            commands.push(`/alarm "${simpleName}" et rp ${time} 1 ${soundEffect} mute`);
        }

        return commands.join('\n');
    }
}