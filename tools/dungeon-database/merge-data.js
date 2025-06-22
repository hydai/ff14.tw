#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// 所有要合併的檔案，按照等級順序
const jsonFiles = [
    'processed-level-10-19.json',
    'processed-level-20-29.json', 
    'processed-level-30-39.json',
    'processed-level-40-49.json',
    'processed-level-50-59-part1.json',
    'processed-level-50-59-part2.json',
    'processed-level-50-59-part3.json',
    'processed-level-50-59-part4.json',
    'processed-level-60-69-part1.json',
    'processed-level-60-69-part2.json',
    'processed-level-60-69-part3.json',
    'processed-level-70-79-part1.json',
    'processed-level-70-79-part2.json',
    'processed-level-70-79-part3.json',
    'processed-level-80-89-part1.json',
    'processed-level-80-89-part2.json',
    'processed-level-80-89-part3.json',
    'processed-level-90-99-part1.json',
    'processed-level-90-99-part2.json',
    'processed-level-90-99-part3.json',
    'processed-level-100-plus.json'
];

// 初始化最終資料結構
const finalData = {
    "metadata": {
        "version": "1.0.0",
        "lastUpdated": new Date().toISOString(),
        "totalDungeons": 0,
        "description": "FF14.tw 副本資料庫 - 完整的Final Fantasy XIV副本資訊",
        "categories": {
            "四人迷宮": "標準4人副本",
            "8人討伐殲滅戰": "8人戰鬥副本",
            "24人大型任務": "大型團隊副本",
            "公會令": "公會任務",
            "誅滅戰": "蠻神討伐戰",
            "絕境戰": "極限難度挑戰"
        },
        "expansions": {
            "2.x": "重生之境",
            "3.x": "蒼穹之禁城",
            "4.x": "紅蓮之狂潮",
            "5.x": "暗影之逆焰",
            "6.x": "曉月之終途",
            "7.x": "黃金之遺產"
        }
    },
    "dungeons": []
};

console.log('開始合併副本資料...');

// 讀取並合併所有JSON檔案
jsonFiles.forEach((filename, index) => {
    try {
        console.log(`處理檔案 ${index + 1}/${jsonFiles.length}: ${filename}`);
        
        const filePath = path.join(__dirname, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (data.dungeons && Array.isArray(data.dungeons)) {
            finalData.dungeons.push(...data.dungeons);
            console.log(`  - 新增 ${data.dungeons.length} 個副本`);
        } else {
            console.warn(`  - 警告：${filename} 檔案格式不正確`);
        }
    } catch (error) {
        console.error(`  - 錯誤：無法處理 ${filename}: ${error.message}`);
    }
});

// 更新總數
finalData.metadata.totalDungeons = finalData.dungeons.length;

// 統計各類型副本數量
const typeStats = {};
const expansionStats = {};

finalData.dungeons.forEach(dungeon => {
    // 統計類型
    typeStats[dungeon.type] = (typeStats[dungeon.type] || 0) + 1;
    
    // 統計版本
    expansionStats[dungeon.expansion] = (expansionStats[dungeon.expansion] || 0) + 1;
});

finalData.metadata.statistics = {
    byType: typeStats,
    byExpansion: expansionStats
};

// 驗證ID唯一性
const idSet = new Set();
const duplicateIds = [];

finalData.dungeons.forEach(dungeon => {
    if (idSet.has(dungeon.id)) {
        duplicateIds.push(dungeon.id);
    } else {
        idSet.add(dungeon.id);
    }
});

if (duplicateIds.length > 0) {
    console.warn('警告：發現重複的ID:', duplicateIds);
}

// 按ID排序
finalData.dungeons.sort((a, b) => a.id - b.id);

// 寫入最終檔案
const outputPath = path.join(__dirname, 'dungeon-database.json');
fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2), 'utf8');

console.log('\n合併完成！');
console.log(`總共合併了 ${finalData.metadata.totalDungeons} 個副本`);
console.log(`輸出檔案：${outputPath}`);
console.log('\n統計資訊：');
console.log('副本類型分布：');
Object.entries(typeStats).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} 個`);
});
console.log('\n版本分布：');
Object.entries(expansionStats).forEach(([expansion, count]) => {
    const versionName = finalData.metadata.expansions[expansion] || expansion;
    console.log(`  ${expansion} (${versionName}): ${count} 個`);
});

console.log('\n副本ID範圍：', 
    Math.min(...finalData.dungeons.map(d => d.id)), 
    '-', 
    Math.max(...finalData.dungeons.map(d => d.id))
);