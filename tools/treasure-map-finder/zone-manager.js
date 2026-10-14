class ZoneManager {
    constructor() {
        this.zones = null;
        this.mappings = null;
        this.aetherytes = null;
        this.loaded = false;
    }

    // 地區（zones.json）與傳送點（aetherytes.json）同時載入，兩份都成功才算載入完成；
    // 任一份失敗就丟出錯誤，由呼叫的一方（TreasureMapFinder#init）顯示載入失敗
    async init() {
        if (this.loaded) return;

        const fetchJson = async url => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} (${url})`);
            }
            return response.json();
        };

        try {
            const [zonesData, aetherytesData] = await Promise.all([
                fetchJson('../../data/zones.json'),
                fetchJson('../../data/aetherytes.json')
            ]);
            this.zones = zonesData.zones;
            this.mappings = zonesData.mappings;
            this.aetherytes = aetherytesData.aetherytes;
            this.loaded = true;
        } catch (error) {
            console.error('載入地區資料失敗:', error);
            this.zones = {};
            this.mappings = { zoneNameToId: {}, zoneIdToRegion: {}, filePrefixToZoneId: {} };
            this.aetherytes = {};
            // 不能只靠一半的資料繼續：沒有地區資料時地名會變成 id、縮圖路徑會錯，沒有傳送點時路線排不出來
            throw error;
        }
    }

    // 根據地區名稱獲取地區ID
    getZoneIdByName(zoneName) {
        if (!this.loaded) {
            console.warn('ZoneManager 尚未初始化');
            return zoneName;
        }
        
        return this.mappings.zoneNameToId[zoneName] || zoneName.toLowerCase().replace(/[\s'-]/g, '');
    }

    // 根據地區ID獲取地區資訊
    getZoneById(zoneId) {
        if (!this.loaded) return null;
        
        for (const region of Object.values(this.zones)) {
            const subZone = region.subZones.find(zone => zone.id === zoneId);
            if (subZone) {
                return {
                    ...subZone,
                    regionId: region.id,
                    regionName: region.names,
                    expansion: region.expansion
                };
            }
        }
        return null;
    }

    // 根據地區ID獲取中文名稱
    getZoneNameZh(zoneId) {
        const zone = this.getZoneById(zoneId);
        return zone ? zone.names.zh : zoneId;
    }

    // 根據地區ID獲取英文名稱
    getZoneNameEn(zoneId) {
        const zone = this.getZoneById(zoneId);
        return zone ? zone.names.en : zoneId;
    }

    // 根據地區ID獲取日文名稱
    getZoneNameJa(zoneId) {
        const zone = this.getZoneById(zoneId);
        return zone ? zone.names.ja : zoneId;
    }

    // 根據地區ID獲取多語言名稱
    getZoneNames(zoneId) {
        const zone = this.getZoneById(zoneId);
        return zone ? zone.names : { zh: zoneId, en: zoneId, ja: zoneId };
    }

    // 根據地區ID獲取檔案前綴
    getFilePrefix(zoneId) {
        const zone = this.getZoneById(zoneId);
        return zone ? zone.filePrefix : zoneId;
    }

    // 根據地區ID獲取傳送點（aetherytes.json 的完整資料），順序依 zones.json 該地區列出的 id；
    // 卡片、詳細地圖與路線都從這裡取得傳送點，找不到的 id 和未知地區不會出現在結果裡
    getAetherytes(zoneId) {
        const zone = this.getZoneById(zoneId);
        if (!zone) return [];

        const regionAetherytes = this.aetherytes[this.getRegionId(zoneId)] || [];
        return zone.aetherytes
            .map(id => regionAetherytes.find(aetheryte => aetheryte.id === id))
            .filter(Boolean);
    }

    // 找出離座標最近的傳送點，回傳 { aetheryte, distance }，地區沒有傳送點時回傳 null；
    // 算法和路線分配傳送點（RouteCalculator.solveWithTeleportGrouping）相同：
    // 3D 直線距離，嚴格小於才換，同距離取先出現的
    findNearestAetheryte(zoneId, coords) {
        let nearest = null;
        for (const aetheryte of this.getAetherytes(zoneId)) {
            const distance = CoordinateUtils.calculate3DDistance(aetheryte.coords, coords);
            if (!nearest || distance < nearest.distance) {
                nearest = { aetheryte, distance };
            }
        }
        return nearest;
    }

    // 根據地區ID獲取地區分類
    getRegionId(zoneId) {
        return this.mappings.zoneIdToRegion[zoneId] || null;
    }

    // 獲取所有地區列表（用於過濾器）
    getAllZones() {
        if (!this.loaded) return [];
        
        const allZones = [];
        for (const region of Object.values(this.zones)) {
            for (const subZone of region.subZones) {
                allZones.push({
                    id: subZone.id,
                    names: subZone.names,
                    regionId: region.id,
                    regionName: region.names,
                    expansion: region.expansion
                });
            }
        }
        return allZones;
    }

    // 根據版本獲取地區列表
    getZonesByExpansion(expansion) {
        if (!this.loaded) return [];
        
        const zones = [];
        for (const region of Object.values(this.zones)) {
            if (region.expansion === expansion) {
                zones.push(...region.subZones.map(subZone => ({
                    id: subZone.id,
                    names: subZone.names,
                    regionId: region.id,
                    regionName: region.names,
                    expansion: region.expansion
                })));
            }
        }
        return zones;
    }

    // 根據地區分類獲取地區列表
    getZonesByRegion(regionId) {
        if (!this.loaded) return [];
        
        const region = this.zones[regionId];
        if (!region) return [];
        
        return region.subZones.map(subZone => ({
            id: subZone.id,
            names: subZone.names,
            regionId: region.id,
            regionName: region.names,
            expansion: region.expansion
        }));
    }

    // 生成寶圖圖片檔案名稱
    generateImageFileName(level, zoneId, index) {
        const filePrefix = this.getFilePrefix(zoneId);
        const paddedIndex = String(index).padStart(2, '0');
        return `${level}_${filePrefix}_${paddedIndex}.webp`;
    }

    // 生成寶圖完整圖片檔案名稱
    generateFullImageFileName(level, zoneId, index) {
        const filePrefix = this.getFilePrefix(zoneId);
        const paddedIndex = String(index).padStart(2, '0');
        return `${level}_${filePrefix}_${paddedIndex}_full_3x.webp`;
    }

    // 檢查地區是否存在
    isValidZone(zoneId) {
        return this.getZoneById(zoneId) !== null;
    }

    // 正規化地區名稱（向後相容性）
    normalizeZoneName(zoneName) {
        return zoneName.toLowerCase().replace(/[\s'-]/g, '');
    }

    // 根據檔案前綴獲取地區ID
    getZoneIdByFilePrefix(filePrefix) {
        return this.mappings.filePrefixToZoneId[filePrefix] || filePrefix;
    }

    // 獲取統計資訊
    getStats() {
        if (!this.loaded) return {};
        
        const stats = {
            totalRegions: Object.keys(this.zones).length,
            totalZones: 0,
            expansions: {},
            regions: {}
        };

        for (const [regionId, region] of Object.entries(this.zones)) {
            stats.totalZones += region.subZones.length;
            
            if (!stats.expansions[region.expansion]) {
                stats.expansions[region.expansion] = 0;
            }
            stats.expansions[region.expansion] += region.subZones.length;
            
            stats.regions[regionId] = {
                name: region.names.zh,
                zoneCount: region.subZones.length,
                expansion: region.expansion
            };
        }

        return stats;
    }
}

// 建立全域實例
window.zoneManager = new ZoneManager();