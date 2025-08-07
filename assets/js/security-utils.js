/**
 * Security Utilities Module
 * Provides safe DOM manipulation and input validation functions
 * to prevent XSS and other security vulnerabilities
 */

class SecurityUtils {
    /**
     * Creates a text element safely without innerHTML
     * @param {string} tag - HTML tag name
     * @param {string} text - Text content
     * @param {string} className - Optional CSS class
     * @returns {HTMLElement}
     */
    static createTextElement(tag, text, className = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = text;
        return element;
    }

    /**
     * Creates a button with icon and text safely
     * @param {string} iconText - Icon emoji or text
     * @param {string} labelText - Button label
     * @param {string} className - Button CSS classes
     * @returns {HTMLButtonElement}
     */
    static createIconButton(iconText, labelText, className = '') {
        const button = document.createElement('button');
        if (className) button.className = className;
        
        if (iconText) {
            const icon = document.createElement('span');
            icon.className = 'btn-icon';
            icon.textContent = iconText;
            button.appendChild(icon);
            
            if (labelText) {
                button.appendChild(document.createTextNode(' ' + labelText));
            }
        } else if (labelText) {
            button.textContent = labelText;
        }
        
        return button;
    }

    /**
     * Updates button content safely
     * @param {HTMLButtonElement} button - Button to update
     * @param {string} iconText - Icon emoji or text
     * @param {string} labelText - Button label
     */
    static updateButtonContent(button, iconText, labelText) {
        // Clear existing content
        while (button.firstChild) {
            button.removeChild(button.firstChild);
        }
        
        if (iconText) {
            const icon = document.createElement('span');
            icon.className = 'btn-icon';
            icon.textContent = iconText;
            button.appendChild(icon);
            
            if (labelText) {
                button.appendChild(document.createTextNode(' ' + labelText));
            }
        } else if (labelText) {
            button.textContent = labelText;
        }
    }

    /**
     * Creates a form group with label and input
     * @param {Object} config - Configuration object
     * @returns {HTMLElement}
     */
    static createFormGroup(config) {
        const group = document.createElement('div');
        group.className = 'form-group';
        
        if (config.label) {
            const label = document.createElement('label');
            if (config.inputId) {
                label.setAttribute('for', config.inputId);
            }
            label.textContent = config.label;
            group.appendChild(label);
        }
        
        if (config.inputType === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.className = config.inputClass || 'form-control';
            if (config.inputId) textarea.id = config.inputId;
            if (config.placeholder) textarea.placeholder = config.placeholder;
            if (config.rows) textarea.rows = config.rows;
            if (config.readonly) textarea.readOnly = true;
            if (config.value) textarea.value = config.value;
            group.appendChild(textarea);
        } else if (config.inputType === 'select') {
            const select = document.createElement('select');
            select.className = config.inputClass || 'form-control';
            if (config.inputId) select.id = config.inputId;
            if (config.options) {
                config.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    if (opt.selected) option.selected = true;
                    select.appendChild(option);
                });
            }
            group.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.type = config.inputType || 'text';
            input.className = config.inputClass || 'form-control';
            if (config.inputId) input.id = config.inputId;
            if (config.placeholder) input.placeholder = config.placeholder;
            if (config.maxLength) input.maxLength = config.maxLength;
            if (config.value) input.value = config.value;
            if (config.accept) input.accept = config.accept;
            group.appendChild(input);
        }
        
        if (config.helpText) {
            const small = document.createElement('small');
            small.className = 'form-text';
            small.textContent = config.helpText;
            group.appendChild(small);
        }
        
        return group;
    }

    /**
     * Sanitizes text input to prevent XSS
     * @param {string} text - Text to sanitize
     * @returns {string}
     */
    static sanitizeInput(text) {
        if (typeof text !== 'string') return '';
        
        // HTML entity encoding for dangerous characters
        return text.replace(/[<>\"'&]/g, (char) => {
            const entities = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '&': '&amp;'
            };
            return entities[char];
        });
    }

    /**
     * Validates text length with min/max constraints
     * @param {string} text - Text to validate
     * @param {number} minLength - Minimum length
     * @param {number} maxLength - Maximum length
     * @returns {boolean}
     */
    static validateTextLength(text, minLength = 0, maxLength = Infinity) {
        if (typeof text !== 'string') return false;
        const length = text.trim().length;
        return length >= minLength && length <= maxLength;
    }

    /**
     * Validates that a value is a safe filename
     * @param {string} filename - Filename to validate
     * @returns {boolean}
     */
    static isValidFilename(filename) {
        if (typeof filename !== 'string') return false;
        
        // Check for directory traversal attempts
        if (filename.includes('../') || filename.includes('..\\')) return false;
        
        // Check for null bytes
        if (filename.includes('\0')) return false;
        
        // Allow only safe characters in filenames
        const safePattern = /^[a-zA-Z0-9_\-\.]+$/;
        return safePattern.test(filename);
    }

    /**
     * Validates JSON structure against a simple schema
     * @param {Object} data - Data to validate
     * @param {Object} schema - Schema definition
     * @returns {Object} - {valid: boolean, errors: string[]}
     */
    static validateJSONSchema(data, schema) {
        const errors = [];
        
        if (!data || typeof data !== 'object') {
            return { valid: false, errors: ['Data must be an object'] };
        }
        
        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in data)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }
        
        // Check field types
        if (schema.properties) {
            for (const [field, rules] of Object.entries(schema.properties)) {
                if (field in data) {
                    const value = data[field];
                    
                    // Check type
                    if (rules.type) {
                        const actualType = Array.isArray(value) ? 'array' : typeof value;
                        if (actualType !== rules.type) {
                            errors.push(`Field ${field} must be of type ${rules.type}`);
                        }
                    }
                    
                    // Check string constraints
                    if (rules.type === 'string' && typeof value === 'string') {
                        if (rules.minLength && value.length < rules.minLength) {
                            errors.push(`Field ${field} must be at least ${rules.minLength} characters`);
                        }
                        if (rules.maxLength && value.length > rules.maxLength) {
                            errors.push(`Field ${field} must be at most ${rules.maxLength} characters`);
                        }
                        if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
                            errors.push(`Field ${field} does not match required pattern`);
                        }
                    }
                    
                    // Check number constraints
                    if (rules.type === 'number' && typeof value === 'number') {
                        if (rules.min !== undefined && value < rules.min) {
                            errors.push(`Field ${field} must be at least ${rules.min}`);
                        }
                        if (rules.max !== undefined && value > rules.max) {
                            errors.push(`Field ${field} must be at most ${rules.max}`);
                        }
                    }
                    
                    // Check array constraints
                    if (rules.type === 'array' && Array.isArray(value)) {
                        if (rules.minItems && value.length < rules.minItems) {
                            errors.push(`Field ${field} must have at least ${rules.minItems} items`);
                        }
                        if (rules.maxItems && value.length > rules.maxItems) {
                            errors.push(`Field ${field} must have at most ${rules.maxItems} items`);
                        }
                    }
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Safely parses JSON with error handling
     * @param {string} jsonString - JSON string to parse
     * @param {Object} schema - Optional schema to validate against
     * @returns {Object} - {success: boolean, data: any, error: string}
     */
    static safeJSONParse(jsonString, schema = null) {
        try {
            const data = JSON.parse(jsonString);
            
            // If schema provided, validate the data
            if (schema) {
                const validation = this.validateJSONSchema(data, schema);
                if (!validation.valid) {
                    return {
                        success: false,
                        data: null,
                        error: '資料格式驗證失敗: ' + validation.errors.join(', ')
                    };
                }
            }
            
            return {
                success: true,
                data: data,
                error: null
            };
        } catch (e) {
            return {
                success: false,
                data: null,
                error: '無效的 JSON 格式'
            };
        }
    }

    /**
     * Creates a safe empty message element
     * @param {string} mainText - Main message text
     * @param {string} subText - Sub message text
     * @returns {HTMLElement}
     */
    static createEmptyMessage(mainText, subText = '') {
        const container = document.createElement('div');
        container.className = 'empty-list-message';
        
        const mainPara = document.createElement('p');
        mainPara.textContent = mainText;
        container.appendChild(mainPara);
        
        if (subText) {
            const small = document.createElement('small');
            small.textContent = subText;
            container.appendChild(small);
        }
        
        return container;
    }

    /**
     * Creates a warning/confirmation message
     * @param {string} message - Warning message
     * @param {string} details - Additional details
     * @returns {HTMLElement}
     */
    static createWarningMessage(message, details = '') {
        const container = document.createElement('div');
        
        const para = document.createElement('p');
        para.textContent = message;
        container.appendChild(para);
        
        if (details) {
            const small = document.createElement('small');
            small.textContent = details;
            container.appendChild(small);
        }
        
        return container;
    }

    /**
     * Clears all children from an element safely
     * @param {HTMLElement} element - Element to clear
     */
    static clearElement(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    /**
     * Creates a complex card element with title and content sections
     * @param {Object} config - Configuration for the card
     * @returns {HTMLElement}
     */
    static createCard(config) {
        const card = document.createElement('div');
        card.className = config.className || 'card';
        
        if (config.title) {
            const titleDiv = document.createElement('div');
            titleDiv.className = config.titleClass || 'card-title';
            
            const strong = document.createElement('strong');
            strong.textContent = config.title;
            titleDiv.appendChild(strong);
            card.appendChild(titleDiv);
        }
        
        if (config.value) {
            const valueDiv = document.createElement('div');
            valueDiv.className = config.valueClass || 'card-value';
            valueDiv.textContent = config.value;
            card.appendChild(valueDiv);
        }
        
        if (config.range) {
            const rangeDiv = document.createElement('div');
            rangeDiv.className = config.rangeClass || 'card-range';
            rangeDiv.textContent = config.range;
            card.appendChild(rangeDiv);
        }
        
        if (config.items) {
            config.items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = item.className || '';
                itemDiv.textContent = item.text;
                card.appendChild(itemDiv);
            });
        }
        
        return card;
    }

    /**
     * Safely builds a URL with encoded parameters
     * @param {string} baseURL - Base URL
     * @param {Object} params - URL parameters
     * @returns {string}
     */
    static buildSafeURL(baseURL, params = {}) {
        try {
            const url = new URL(baseURL);
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    url.searchParams.append(key, String(value));
                }
            });
            return url.toString();
        } catch (error) {
            console.error('Invalid URL:', error);
            return baseURL;
        }
    }

    /**
     * Validates and retrieves data from localStorage
     * @param {string} key - Storage key
     * @param {Object} schema - Expected data schema
     * @returns {any|null}
     */
    static getValidatedStorageData(key, schema = null) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            
            const parsed = this.safeJSONParse(data, schema);
            if (!parsed.success) {
                console.warn(`Invalid storage data for key ${key}:`, parsed.error);
                return null;
            }
            
            return parsed.data;
        } catch (error) {
            console.error('Storage access error:', error);
            return null;
        }
    }

    /**
     * Safely sets data in localStorage
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     * @returns {boolean}
     */
    static setStorageData(key, value) {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
            return true;
        } catch (error) {
            console.error('Storage write error:', error);
            return false;
        }
    }

    /**
     * Creates a list item with icon and actions
     * @param {Object} config - Configuration object
     * @returns {HTMLElement}
     */
    static createListItem(config) {
        const item = document.createElement('div');
        item.className = config.className || 'list-item';
        
        const content = document.createElement('div');
        content.className = 'list-item-content';
        
        if (config.icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'list-item-icon';
            iconSpan.textContent = config.icon;
            content.appendChild(iconSpan);
        }
        
        if (config.title) {
            const titleSpan = document.createElement('span');
            titleSpan.className = 'list-item-title';
            titleSpan.textContent = config.title;
            content.appendChild(titleSpan);
        }
        
        if (config.subtitle) {
            const subtitleSpan = document.createElement('span');
            subtitleSpan.className = 'list-item-subtitle';
            subtitleSpan.textContent = config.subtitle;
            content.appendChild(subtitleSpan);
        }
        
        item.appendChild(content);
        
        if (config.actions) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'list-item-actions';
            
            config.actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = action.className || 'btn';
                btn.textContent = action.text;
                if (action.onClick) {
                    btn.addEventListener('click', action.onClick);
                }
                actionsDiv.appendChild(btn);
            });
            
            item.appendChild(actionsDiv);
        }
        
        return item;
    }

    /**
     * Encodes a string for safe HTML attribute usage
     * @param {string} str - String to encode
     * @returns {string}
     */
    static encodeHTMLAttribute(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, (char) => {
            const entities = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return entities[char];
        });
    }
}

// Export for use in other modules
window.SecurityUtils = SecurityUtils;