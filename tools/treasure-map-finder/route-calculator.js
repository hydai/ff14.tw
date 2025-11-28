/**
 * 路線計算器模組
 * 負責寶圖路線的最佳化計算
 */

class RouteCalculator {
    constructor() {
        this.aetherytes = null;
        this.loadAetherytes();
    }

    async loadAetherytes() {
        try {
            const response = await fetch('../../data/aetherytes.json');
            const data = await response.json();
            this.aetherytes = data.aetherytes;
        } catch (error) {
            console.error('載入傳送點資料失敗:', error);
        }
    }

    /**
     * 計算兩點之間的距離
     * @param {Object} from - 起點
     * @param {Object} to - 終點
     * @returns {number} 距離
     */
    calculateDistance(from, to) {
        // 跨地圖移動
        if (from.zoneId !== to.zoneId) {
            return 0;
        }

        // 任何點到傳送點：零成本
        if (to.isTeleport) {
            return 0;
        }

        // 傳送點到普通點或普通點到普通點：3D 歐幾里得距離
        return CoordinateUtils.calculate3DDistance(from.coords, to.coords);
    }

    /**
     * 主要路線計算
     * @param {Array} maps - 寶圖列表
     * @returns {Object} 路線結果
     */
    calculateRoute(maps) {
        console.log('=== 開始路線計算 ===');
        console.log('輸入地圖數量:', maps.length);

        if (!maps || maps.length === 0) return { summary: {}, route: [] };
        if (!this.aetherytes) {
            console.error('傳送點資料尚未載入');
            return { summary: {}, route: [] };
        }

        // 1. 找出起始地區（全域最近的寶圖-傳送點配對）
        const { startRegion, startMap } = this.findStartingRegion(maps);
        console.log('起始地區:', startRegion);

        // 2. 按地區分組
        const mapsByRegion = this.groupByZone(maps);
        console.log('地區分組結果:', Object.keys(mapsByRegion).map(k => `${k}: ${mapsByRegion[k].length}張`));

        // 3. 決定地區訪問順序（第一個已決定，其餘按數量）
        const regionOrder = this.getRegionOrder(mapsByRegion, startRegion);
        console.log('地區訪問順序:', regionOrder);

        // 4. 為每個地區規劃路線
        const route = [];
        let totalTeleports = 0;

        for (const region of regionOrder) {
            if (mapsByRegion[region]) {
                const regionRoute = this.planRegionRoute(mapsByRegion[region]);
                route.push(...regionRoute);

                // 計算傳送次數
                const regionTeleports = regionRoute.filter(step => step.type === 'teleport').length;
                totalTeleports += regionTeleports;
            }
        }

        // 獲取實際的地區名稱列表
        const regionsVisited = [];
        for (const regionId of regionOrder) {
            if (mapsByRegion[regionId] && mapsByRegion[regionId].length > 0) {
                if (!regionsVisited.includes(regionId)) {
                    regionsVisited.push(regionId);
                }
            }
        }

        console.log('=== 路線計算完成 ===');
        console.log('總傳送次數:', totalTeleports);

        return {
            summary: {
                totalMaps: maps.length,
                totalTeleports: totalTeleports,
                regionsVisited: regionsVisited
            },
            route: route
        };
    }

    /**
     * 找出全域最近的寶圖-傳送點配對
     * @param {Array} maps - 寶圖列表
     * @returns {Object} 起始地區和起始地圖
     */
    findStartingRegion(maps) {
        let minDistance = Infinity;
        let startRegion = null;
        let startMap = null;

        for (const map of maps) {
            const zoneId = this.getZoneId(map.zone) || map.zoneId;
            if (!zoneId) {
                continue;
            }

            const aetherytes = this.getRegionAetherytes(zoneId);

            for (const aetheryte of aetherytes) {
                const dist = this.calculateDistance(
                    { coords: map.coords, zoneId: zoneId },
                    { coords: aetheryte.coords, zoneId: zoneId, isTeleport: true }
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    startRegion = zoneId;
                    startMap = { ...map, zoneId: zoneId };
                }
            }
        }

        return { startRegion, startMap };
    }

    /**
     * 按地區分組
     * @param {Array} maps - 寶圖列表
     * @returns {Object} 分組結果
     */
    groupByZone(maps) {
        const groups = {};
        for (const map of maps) {
            const zoneId = map.zoneId || this.getZoneId(map.zone) || 'unknown';
            if (!groups[zoneId]) {
                groups[zoneId] = [];
            }
            groups[zoneId].push({
                ...map,
                zoneId: zoneId
            });
        }
        return groups;
    }

    /**
     * 將 zone 名稱轉換為 zoneId
     * @param {string} zoneName - 地區名稱
     * @returns {string|null} zoneId
     */
    getZoneId(zoneName) {
        const zoneMapping = {
            // 2.0 地區
            'La Noscea': 'la_noscea',
            'The Black Shroud': 'the_black_shroud',
            'Thanalan': 'thanalan',
            'Coerthas': 'coerthas',
            'Mor Dhona': 'mor_dhona',

            // 3.0 蒼天地區
            'Coerthas Western Highlands': 'coerthas',
            'The Dravanian Forelands': 'dravania',
            'The Churning Mists': 'dravania',
            'The Sea of Clouds': 'abalathia',
            'Abalathia': 'abalathia',
            'Dravania': 'dravania',

            // 4.0 紅蓮地區
            'The Fringes': 'gyr_abania',
            'The Peaks': 'gyr_abania',
            'The Lochs': 'gyr_abania',
            'The Ruby Sea': 'othard',
            'Yanxia': 'othard',
            'The Azim Steppe': 'othard',
            'Gyr Abania': 'gyr_abania',
            'Othard': 'othard',

            // 5.0 漆黑地區
            'Lakeland': 'norvrandt',
            'Kholusia': 'norvrandt',
            'Amh Araeng': 'norvrandt',
            'Il Mheg': 'norvrandt',
            'The Rak\'tika Greatwood': 'norvrandt',
            'The Tempest': 'norvrandt',
            'Norvrandt': 'norvrandt',

            // 6.0 曉月地區
            'Labyrinthos': 'ilsabard',
            'Thavnair': 'ilsabard',
            'Garlemald': 'ilsabard',
            'Mare Lamentorum': 'ilsabard',
            'Elpis': 'elpis',
            'Ultima Thule': 'ilsabard',
            'Ilsabard': 'ilsabard',

            // 7.0 黃金地區
            'Urqopacha': 'tural',
            'Kozama\'uka': 'tural',
            'Yak T\'el': 'tural',
            'Shaaloani': 'tural',
            'Heritage Found': 'tural',
            'Living Memory': 'tural',
            'Tural': 'tural'
        };

        return zoneMapping[zoneName] || null;
    }

    /**
     * 決定地區訪問順序
     * @param {Object} mapsByRegion - 按地區分組的寶圖
     * @param {string} startRegion - 起始地區
     * @returns {Array} 地區訪問順序
     */
    getRegionOrder(mapsByRegion, startRegion) {
        const regions = Object.keys(mapsByRegion);
        const otherRegions = regions.filter(r => r !== startRegion);

        // 其餘地區按寶圖數量排序（多的優先）
        otherRegions.sort((a, b) =>
            mapsByRegion[b].length - mapsByRegion[a].length
        );

        return [startRegion, ...otherRegions];
    }

    /**
     * 取得地區的傳送點
     * @param {string} zoneId - 地區 ID
     * @returns {Array} 傳送點列表
     */
    getRegionAetherytes(zoneId) {
        if (!this.aetherytes) {
            return [];
        }

        // 先嘗試直接查找
        if (this.aetherytes[zoneId]) {
            return this.aetherytes[zoneId].map(a => ({
                ...a,
                zoneId: zoneId,
                isTeleport: true
            }));
        }

        // 如果沒找到，可能是具體的地區 ID，需要找到它所屬的區域
        const regionId = zoneManager.getRegionId(zoneId);

        if (regionId && this.aetherytes[regionId]) {
            const zoneAetheryteIds = zoneManager.getZoneById(zoneId)?.aetherytes || [];

            return this.aetherytes[regionId]
                .filter(a => zoneAetheryteIds.includes(a.id))
                .map(a => ({
                    ...a,
                    zoneId: zoneId,
                    isTeleport: true
                }));
        }

        return [];
    }

    /**
     * 地區內路線規劃
     * @param {Array} regionMaps - 該地區的寶圖列表
     * @returns {Array} 路線步驟
     */
    planRegionRoute(regionMaps) {
        const normalMaps = regionMaps;
        const teleports = this.getRegionAetherytes(regionMaps[0].zoneId);
        const zoneName = regionMaps[0].zone;

        // 使用分組策略求解
        const result = this.solveWithTeleportGrouping(normalMaps, teleports);

        // 轉換為路線步驟格式
        const route = [];
        let lastWasTeleport = false;

        for (let i = 0; i < result.path.length; i++) {
            const point = result.path[i];

            if (point.isTeleport) {
                if (i === 0 || !lastWasTeleport) {
                    route.push({
                        type: 'teleport',
                        to: point.name,
                        zone: zoneName,
                        zoneId: point.zoneId,
                        coords: point.coords
                    });
                }
                lastWasTeleport = true;
            } else {
                route.push({
                    type: 'move',
                    mapId: point.id,
                    mapLevel: point.level || point.levelName,
                    zone: point.zone,
                    zoneId: point.zoneId,
                    coords: point.coords
                });
                lastWasTeleport = false;
            }
        }

        return route;
    }

    /**
     * 基於傳送點分組的求解策略
     * @param {Array} normalPoints - 普通點（寶圖）
     * @param {Array} teleportPoints - 傳送點
     * @returns {Object} 路徑和距離
     */
    solveWithTeleportGrouping(normalPoints, teleportPoints) {
        if (normalPoints.length === 0) {
            return { path: [], distance: 0 };
        }

        if (teleportPoints.length === 0) {
            return this.solvePureTSP(normalPoints);
        }

        // 1. 為每個寶圖分配最近的傳送點
        const mapGroups = new Map();

        for (const map of normalPoints) {
            let closestTeleport = null;
            let minDistance = Infinity;

            for (const teleport of teleportPoints) {
                const dist = this.calculateDistance(
                    teleport,
                    { coords: map.coords, zoneId: map.zoneId }
                );

                if (dist < minDistance) {
                    minDistance = dist;
                    closestTeleport = teleport;
                }
            }

            const teleportId = closestTeleport.id;
            if (!mapGroups.has(teleportId)) {
                mapGroups.set(teleportId, {
                    teleport: closestTeleport,
                    maps: []
                });
            }
            mapGroups.get(teleportId).maps.push(map);
        }

        // 2. 對每個傳送點組內的寶圖進行TSP求解
        const groupRoutes = [];
        for (const [teleportId, group] of mapGroups) {
            if (group.maps.length === 1) {
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: group.maps,
                    distance: this.calculateDistance(
                        group.teleport,
                        { coords: group.maps[0].coords, zoneId: group.maps[0].zoneId }
                    )
                });
            } else {
                const localTSP = this.solveTSPFromTeleport(group.teleport, group.maps);
                groupRoutes.push({
                    teleport: group.teleport,
                    maps: localTSP.path,
                    distance: localTSP.distance
                });
            }
        }

        // 3. 決定傳送點組的訪問順序（按寶圖數量降序）
        groupRoutes.sort((a, b) => b.maps.length - a.maps.length);

        // 4. 構建最終路徑
        const finalPath = [];
        let totalDistance = 0;

        for (const group of groupRoutes) {
            finalPath.push(group.teleport);
            finalPath.push(...group.maps);
            totalDistance += group.distance;
        }

        return {
            path: finalPath,
            distance: totalDistance
        };
    }

    /**
     * 從傳送點開始的TSP求解
     * @param {Object} teleport - 傳送點
     * @param {Array} maps - 寶圖列表
     * @returns {Object} 路徑和距離
     */
    solveTSPFromTeleport(teleport, maps) {
        if (maps.length === 1) {
            return {
                path: maps,
                distance: this.calculateDistance(
                    teleport,
                    { coords: maps[0].coords, zoneId: maps[0].zoneId }
                )
            };
        }

        // 使用最近鄰居法，從傳送點開始
        const visited = new Array(maps.length).fill(false);
        const path = [];
        let totalDistance = 0;

        // 找到離傳送點最近的寶圖作為起點
        let nearestIdx = -1;
        let nearestDistance = Infinity;

        for (let i = 0; i < maps.length; i++) {
            const dist = this.calculateDistance(
                teleport,
                { coords: maps[i].coords, zoneId: maps[i].zoneId }
            );
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestIdx = i;
            }
        }

        visited[nearestIdx] = true;
        path.push(maps[nearestIdx]);
        totalDistance += nearestDistance;
        let currentIdx = nearestIdx;

        // 繼續訪問剩餘的寶圖
        for (let i = 1; i < maps.length; i++) {
            nearestIdx = -1;
            nearestDistance = Infinity;

            for (let j = 0; j < maps.length; j++) {
                if (!visited[j]) {
                    const dist = this.calculateDistance(
                        { coords: maps[currentIdx].coords, zoneId: maps[currentIdx].zoneId },
                        { coords: maps[j].coords, zoneId: maps[j].zoneId }
                    );
                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestIdx = j;
                    }
                }
            }

            if (nearestIdx !== -1) {
                visited[nearestIdx] = true;
                path.push(maps[nearestIdx]);
                totalDistance += nearestDistance;
                currentIdx = nearestIdx;
            }
        }

        return { path, distance: totalDistance };
    }

    /**
     * 純TSP求解（貪婪最近鄰居法）
     * @param {Array} points - 點列表
     * @returns {Object} 最佳路徑和距離
     */
    solvePureTSP(points) {
        if (points.length <= 1) {
            return { path: points, distance: 0 };
        }

        let bestDistance = Infinity;
        let bestPath = [];

        // 嘗試每個起點
        for (let start = 0; start < points.length; start++) {
            const visited = new Array(points.length).fill(false);
            const path = [points[start]];
            visited[start] = true;
            let totalDistance = 0;
            let currentIdx = start;

            // 貪婪選擇最近的未訪問點
            for (let i = 1; i < points.length; i++) {
                let nearestIdx = -1;
                let nearestDistance = Infinity;

                for (let j = 0; j < points.length; j++) {
                    if (!visited[j]) {
                        const distance = this.calculateDistance(
                            { coords: points[currentIdx].coords, zoneId: points[currentIdx].zoneId },
                            { coords: points[j].coords, zoneId: points[j].zoneId }
                        );
                        if (distance < nearestDistance) {
                            nearestDistance = distance;
                            nearestIdx = j;
                        }
                    }
                }

                if (nearestIdx !== -1) {
                    visited[nearestIdx] = true;
                    path.push(points[nearestIdx]);
                    totalDistance += nearestDistance;
                    currentIdx = nearestIdx;
                }
            }

            if (totalDistance < bestDistance) {
                bestDistance = totalDistance;
                bestPath = path;
            }
        }

        return { path: bestPath, distance: bestDistance };
    }
}

// 全域匯出
window.RouteCalculator = RouteCalculator;
