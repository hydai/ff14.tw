#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Zone 到 zoneId 的映射
const zoneToZoneId = {
    // Tural 地區
    'Urqopacha': 'urqopacha',
    'Kozama\'uka': 'kozamauka',
    'Yak T\'el': 'yaktel',
    'Shaaloani': 'shaaloani',
    'Heritage Found': 'heritage_found',
    
    // Ilsabard 地區
    'Elpis': 'elpis',
    'Labyrinthos': 'labyrinthos',
    'Thavnair': 'thavnair',
    'Garlemald': 'garlemald',
    'Mare Lamentorum': 'mare_lamentorum',
    'Ultima Thule': 'ultima_thule',
    
    // Gyr Abania 地區
    'The Fringes': 'the_fringes',
    'The Peaks': 'the_peaks',
    'The Lochs': 'the_lochs',
    
    // Othard 地區
    'The Ruby Sea': 'the_ruby_sea',
    'Yanxia': 'yanxia',
    'The Azim Steppe': 'the_azim_steppe',
    
    // Coerthas 地區
    'Coerthas Western Highlands': 'coerthas_western_highlands',
    
    // Dravania 地區
    'The Dravanian Forelands': 'the_dravanian_forelands',
    'The Churning Mists': 'the_churning_mists',
    
    // Abalathia 地區
    'The Sea of Clouds': 'the_sea_of_clouds',
    
    // Norvrandt 地區
    'Lakeland': 'lakeland',
    'Kholusia': 'kholusia',
    'Amh Araeng': 'amh_araeng',
    'Il Mheg': 'il_mheg',
    'The Rak\'tika Greatwood': 'the_raktika_greatwood',
    'The Tempest': 'the_tempest'
};

function migrateData() {
    console.log('開始數據轉換...');
    
    // 讀取原始數據
    const inputPath = path.join(__dirname, '../../data/treasure-maps.json');
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(rawData);
    
    // 建立每個地區的寶圖索引計數器
    const zoneIndexCounters = {};
    
    // 轉換後的數據結構
    const convertedMaps = data.maps.map(item => {
        const zone = item.zone;
        const zoneId = zoneToZoneId[zone];
        
        if (!zoneId) {
            console.warn(`警告: 找不到 zone "${zone}" 的對應 zoneId，跳過此項目`);
            return null;
        }
        
        // 為每個地區建立索引計數器
        if (!zoneIndexCounters[zoneId]) {
            zoneIndexCounters[zoneId] = 0;
        }
        zoneIndexCounters[zoneId]++;
        
        // 回傳簡化後的結構
        return {
            id: item.id,
            level: item.level,
            zoneId: zoneId,
            index: zoneIndexCounters[zoneId],
            coords: item.coords
        };
    }).filter(item => item !== null); // 移除 null 項目
    
    // 建立新的數據結構
    const newData = {
        mapLevels: data.mapLevels,
        zones: data.zones,
        maps: convertedMaps
    };
    
    // 輸出轉換後的資料
    const outputPath = path.join(__dirname, '../../data/treasure-maps-new.json');
    fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2), 'utf8');
    
    console.log('轉換完成！');
    console.log(`原始數據: ${data.maps.length} 個寶圖`);
    console.log(`轉換後數據: ${convertedMaps.length} 個寶圖`);
    console.log(`輸出文件: ${outputPath}`);
    
    // 顯示每個地區的寶圖數量
    console.log('\n各地區寶圖數量:');
    const zoneStats = {};
    convertedMaps.forEach(item => {
        if (!zoneStats[item.zoneId]) {
            zoneStats[item.zoneId] = { count: 0, level: item.level };
        }
        zoneStats[item.zoneId].count++;
    });
    
    Object.entries(zoneStats).forEach(([zoneId, stats]) => {
        console.log(`${zoneId}: ${stats.count} 個 (${stats.level})`);
    });
    
    // 驗證數據完整性
    console.log('\n數據完整性檢查:');
    const originalZones = new Set(data.maps.map(item => item.zone));
    const convertedZones = new Set(convertedMaps.map(item => item.zoneId));
    
    console.log(`原始地區數: ${originalZones.size}`);
    console.log(`轉換後地區數: ${convertedZones.size}`);
    
    // 檢查是否有遺漏的地區
    const missedZones = [];
    data.maps.forEach(item => {
        if (!zoneToZoneId[item.zone]) {
            missedZones.push(item.zone);
        }
    });
    
    if (missedZones.length > 0) {
        console.log(`警告: 以下地區沒有對應的 zoneId: ${[...new Set(missedZones)].join(', ')}`);
    } else {
        console.log('所有地區都已正確轉換');
    }
}

// 執行轉換
if (require.main === module) {
    migrateData();
}

module.exports = { migrateData, zoneToZoneId };