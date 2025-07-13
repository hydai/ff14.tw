// 座標處理工具模組
class CoordinateUtils {
    // 座標系統常數
    static CONSTANTS = {
        GAME_COORD_MIN: 1,
        GAME_COORD_MAX: 42,
        GAME_COORD_RANGE: 41,
        DEFAULT_Z: 0,
        MAX_COORD_VALUE: 50,
        MIN_COORD_VALUE: 0
    };

    /**
     * 將遊戲座標轉換為圖片座標
     * @param {number} gameX - 遊戲 X 座標 (1-42)
     * @param {number} gameY - 遊戲 Y 座標 (1-42)
     * @param {number} imageWidth - 圖片寬度
     * @param {number} imageHeight - 圖片高度
     * @returns {{x: number, y: number}} 圖片座標
     */
    static gameToImageCoords(gameX, gameY, imageWidth, imageHeight) {
        // 遊戲座標系統：左上角(1,1) 右下角(42,42)
        // 圖片座標系統：左上角(0,0) 右下角(imageWidth, imageHeight)
        
        // 將遊戲座標從 1-42 轉換為 0-1 的比例
        const normalizedX = (gameX - this.CONSTANTS.GAME_COORD_MIN) / this.CONSTANTS.GAME_COORD_RANGE;
        const normalizedY = (gameY - this.CONSTANTS.GAME_COORD_MIN) / this.CONSTANTS.GAME_COORD_RANGE;
        
        // 轉換為圖片座標
        const imageX = normalizedX * imageWidth;
        const imageY = normalizedY * imageHeight;
        
        return { x: imageX, y: imageY };
    }

    /**
     * 格式化座標為遊戲指令
     * @param {Object} coords - 座標物件 {x, y, z}
     * @returns {string} 格式化的座標指令
     */
    static formatCoordinatesAsCommand(coords) {
        const z = coords.z || this.CONSTANTS.DEFAULT_Z;
        return `/pos ${coords.x} ${coords.y} ${z}`;
    }

    /**
     * 格式化座標為顯示文字
     * @param {Object} coords - 座標物件 {x, y, z}
     * @param {boolean} includeZ - 是否包含 Z 座標
     * @returns {string} 格式化的座標文字
     */
    static formatCoordinatesForDisplay(coords, includeZ = true) {
        if (includeZ) {
            const z = coords.z || this.CONSTANTS.DEFAULT_Z;
            return `X: ${coords.x} Y: ${coords.y} Z: ${z}`;
        }
        return `X: ${coords.x} Y: ${coords.y}`;
    }

    /**
     * 格式化座標為簡短文字
     * @param {Object} coords - 座標物件 {x, y, z}
     * @returns {string} 簡短的座標文字
     */
    static formatCoordinatesShort(coords) {
        const z = coords.z || this.CONSTANTS.DEFAULT_Z;
        return `(${coords.x}, ${coords.y}, ${z})`;
    }

    /**
     * 驗證座標是否有效
     * @param {Object} coords - 座標物件
     * @returns {boolean} 是否有效
     */
    static validateCoordinates(coords) {
        if (!coords || typeof coords !== 'object') return false;
        if (typeof coords.x !== 'number' || typeof coords.y !== 'number') return false;
        if (coords.x < this.CONSTANTS.MIN_COORD_VALUE || 
            coords.x > this.CONSTANTS.MAX_COORD_VALUE || 
            coords.y < this.CONSTANTS.MIN_COORD_VALUE || 
            coords.y > this.CONSTANTS.MAX_COORD_VALUE) {
            return false;
        }
        if (coords.z !== undefined && typeof coords.z !== 'number') return false;
        return true;
    }

    /**
     * 標準化座標物件
     * @param {Object} coords - 原始座標物件
     * @returns {Object} 標準化的座標物件
     */
    static normalizeCoordinates(coords) {
        return {
            x: Number(coords.x),
            y: Number(coords.y),
            z: coords.z !== undefined ? Number(coords.z) : this.CONSTANTS.DEFAULT_Z
        };
    }

    /**
     * 計算兩個座標之間的距離（忽略 Z 軸）
     * @param {Object} coord1 - 第一個座標
     * @param {Object} coord2 - 第二個座標
     * @returns {number} 距離
     */
    static calculateDistance(coord1, coord2) {
        const dx = coord2.x - coord1.x;
        const dy = coord2.y - coord1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 計算兩個座標之間的 3D 距離
     * @param {Object} coord1 - 第一個座標
     * @param {Object} coord2 - 第二個座標
     * @returns {number} 3D 距離
     */
    static calculate3DDistance(coord1, coord2) {
        const dx = coord2.x - coord1.x;
        const dy = coord2.y - coord1.y;
        const dz = (coord2.z || 0) - (coord1.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * 複製座標到剪貼簿
     * @param {Object} coords - 座標物件
     * @returns {Promise<void>}
     */
    static async copyCoordinatesToClipboard(coords) {
        const command = this.formatCoordinatesAsCommand(coords);
        await navigator.clipboard.writeText(command);
    }

    /**
     * 解析座標字串
     * @param {string} coordString - 座標字串，例如 "12.5, 23.7" 或 "X: 12.5 Y: 23.7"
     * @returns {Object|null} 座標物件或 null
     */
    static parseCoordinateString(coordString) {
        // 嘗試解析不同格式
        let match;
        
        // 格式 1: "X: 12.5 Y: 23.7 Z: 10"
        match = coordString.match(/X:\s*([\d.]+)\s*Y:\s*([\d.]+)(?:\s*Z:\s*([\d.]+))?/i);
        if (match) {
            return {
                x: parseFloat(match[1]),
                y: parseFloat(match[2]),
                z: match[3] ? parseFloat(match[3]) : this.CONSTANTS.DEFAULT_Z
            };
        }
        
        // 格式 2: "(12.5, 23.7, 10)" 或 "(12.5, 23.7)"
        match = coordString.match(/\(\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (match) {
            return {
                x: parseFloat(match[1]),
                y: parseFloat(match[2]),
                z: match[3] ? parseFloat(match[3]) : this.CONSTANTS.DEFAULT_Z
            };
        }
        
        // 格式 3: "12.5, 23.7" 或 "12.5 23.7"
        match = coordString.match(/([\d.]+)\s*[,\s]\s*([\d.]+)/);
        if (match) {
            return {
                x: parseFloat(match[1]),
                y: parseFloat(match[2]),
                z: this.CONSTANTS.DEFAULT_Z
            };
        }
        
        return null;
    }

    /**
     * 取得座標的中心點
     * @param {Array<Object>} coordinates - 座標陣列
     * @returns {Object} 中心點座標
     */
    static getCenterPoint(coordinates) {
        if (!coordinates || coordinates.length === 0) {
            return { x: 0, y: 0, z: 0 };
        }

        const sum = coordinates.reduce((acc, coord) => ({
            x: acc.x + coord.x,
            y: acc.y + coord.y,
            z: acc.z + (coord.z || 0)
        }), { x: 0, y: 0, z: 0 });

        return {
            x: sum.x / coordinates.length,
            y: sum.y / coordinates.length,
            z: sum.z / coordinates.length
        };
    }

    /**
     * 檢查座標是否在邊界內
     * @param {Object} coord - 座標
     * @param {Object} bounds - 邊界 {minX, maxX, minY, maxY}
     * @returns {boolean}
     */
    static isWithinBounds(coord, bounds) {
        return coord.x >= bounds.minX && 
               coord.x <= bounds.maxX && 
               coord.y >= bounds.minY && 
               coord.y <= bounds.maxY;
    }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoordinateUtils;
}