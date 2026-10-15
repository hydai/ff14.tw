/**
 * 路線計算器模組
 * 負責寶圖路線的最佳化計算
 */

class RouteCalculator {
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
     * 第一次排序：寶圖多的地區先跑，張數一樣照該地區的寶圖在清單裡第一次出現的順序；
     * 同一個地區裡照 planRegionRoute() 的算法（分給最近的傳送點、傳送點組依張數多到少、組內最近鄰居），
     * 只取寶圖、不取傳送步驟
     * @param {Array} maps - 寶圖列表
     * @returns {Array<string>} 站序（寶圖 id）
     */
    firstOrder(maps) {
        const mapsByRegion = this.groupByZone(maps);
        const order = [];

        for (const region of this.getRegionOrder(mapsByRegion)) {
            for (const step of this.planRegionRoute(mapsByRegion[region])) {
                if (step.type === 'move') {
                    order.push(step.mapId);
                }
            }
        }

        return order;
    }

    /**
     * 跑到一半清單變了：不重排。還在清單裡的寶圖照原本的順序留下，新的寶圖依清單的順序一張一張插入：
     * 插在同一組（同地區、同最近傳送點）的最後一站後面；沒有同一組就插在同地區的最後一站後面；
     * 地區也是新的就排在最後。這樣傳送點組保持連在一起，傳送次數不會變多
     * @param {Array<string>} prevOrder - 原本的站序（寶圖 id）
     * @param {Array} maps - 目前的寶圖列表
     * @returns {Array<string>} 新的站序（寶圖 id）
     */
    mergeOrder(prevOrder, maps) {
        // 每張寶圖屬於哪一組，只算一次
        const groupById = new Map();
        for (const map of maps) {
            groupById.set(map.id, {
                zoneId: this.resolveZoneId(map),
                aetheryteId: this.nearestAetheryteId(map)
            });
        }

        const order = [];
        const placed = new Set();
        for (const id of prevOrder) {
            if (groupById.has(id) && !placed.has(id)) {
                order.push(id);
                placed.add(id);
            }
        }

        for (const map of maps) {
            if (placed.has(map.id)) {
                continue;
            }

            const { zoneId, aetheryteId } = groupById.get(map.id);
            let lastInZone = -1;
            let lastInGroup = -1;
            for (let i = 0; i < order.length; i++) {
                const other = groupById.get(order[i]);
                if (other.zoneId !== zoneId) {
                    continue;
                }
                lastInZone = i;
                if (other.aetheryteId === aetheryteId) {
                    lastInGroup = i;
                }
            }

            const after = lastInGroup !== -1 ? lastInGroup : lastInZone;
            if (after === -1) {
                order.push(map.id);
            } else {
                order.splice(after + 1, 0, map.id);
            }
            placed.add(map.id);
        }

        return order;
    }

    /**
     * 把站序展開成每一站的資訊與摘要。「傳送」標在一組（地區 + 最近傳送點）的第一站：
     * 這一站有傳送點，而且是第一站或和前一站不同組
     * @param {Array<string>} order - 站序（寶圖 id），不在 maps 裡的 id 略過
     * @param {Array} maps - 寶圖列表
     * @returns {Object} { stops: [{ mapId, zoneId, aetheryteId, teleport }], summary: { maps, zones, teleports } }
     */
    describeOrder(order, maps) {
        const mapsById = new Map(maps.map(map => [map.id, map]));
        const stops = [];

        for (const id of order) {
            const map = mapsById.get(id);
            if (!map) {
                continue;
            }

            const zoneId = this.resolveZoneId(map);
            const aetheryteId = this.nearestAetheryteId(map);
            const previous = stops[stops.length - 1];
            const sameGroup = Boolean(previous) && previous.zoneId === zoneId && previous.aetheryteId === aetheryteId;
            stops.push({ mapId: id, zoneId, aetheryteId, teleport: aetheryteId !== null && !sameGroup });
        }

        return {
            stops,
            summary: {
                maps: stops.length,
                zones: new Set(stops.map(stop => stop.zoneId)).size,
                teleports: stops.filter(stop => stop.teleport).length
            }
        };
    }

    /**
     * 寶圖所在的地區 ID。匯入的清單沒有 zoneId，改用地區名稱從 ZoneManager 查
     * @param {Object} map - 寶圖
     * @returns {string} 地區 ID
     */
    resolveZoneId(map) {
        return map.zoneId || zoneManager.getZoneIdByName(map.zone) || 'unknown';
    }

    /**
     * 這張寶圖最近的傳送點（和卡片的「最近」是同一個函式）
     * @param {Object} map - 寶圖
     * @returns {string|null} 傳送點 ID，地區沒有傳送點時是 null
     */
    nearestAetheryteId(map) {
        return zoneManager.findNearestAetheryte(this.resolveZoneId(map), map.coords)?.aetheryte.id ?? null;
    }

    /**
     * 按地區分組
     * @param {Array} maps - 寶圖列表
     * @returns {Object} 分組結果（key 的順序就是各地區的寶圖第一次出現的順序）
     */
    groupByZone(maps) {
        const groups = {};
        for (const map of maps) {
            const zoneId = this.resolveZoneId(map);
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
     * 決定地區訪問順序：寶圖多的地區先跑，張數一樣照第一次出現的順序（穩定排序）
     * @param {Object} mapsByRegion - 按地區分組的寶圖
     * @returns {Array} 地區訪問順序
     */
    getRegionOrder(mapsByRegion) {
        return Object.keys(mapsByRegion).sort((a, b) =>
            mapsByRegion[b].length - mapsByRegion[a].length
        );
    }

    /**
     * 取得地區的傳送點（資料來自 ZoneManager，和卡片、詳細地圖是同一份）
     * @param {string} zoneId - 地區 ID
     * @returns {Array} 傳送點列表
     */
    getRegionAetherytes(zoneId) {
        return zoneManager.getAetherytes(zoneId).map(a => ({
            ...a,
            zoneId: zoneId,
            isTeleport: true
        }));
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
