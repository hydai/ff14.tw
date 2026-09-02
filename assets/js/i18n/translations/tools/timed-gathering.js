/**
 * FF14.tw 特殊採集時間管理器翻譯檔
 */
window.TimedGatheringTranslations = {
    zh: {
        // 頁面標題和標頭
        pageTitle: '特殊採集時間管理器',
        pageDescription: 'FF14 特殊採集時間管理工具，支援搜尋、多清單管理、巨集匯出功能',
        
        // 時間顯示
        localTimeLabel: '本地時間 (LT)',
        eorzeaTimeLabel: '艾歐爾傑亞時間 (ET)',
        dayTime: '白天',
        nightTime: '夜晚',
        
        // 搜尋和篩選
        searchPlaceholder: '搜尋採集物名稱、地點...', 
        clearButton: '清除',
        filterType: '類型：',
        filterExpansion: '資料片：',
        filterVersion: '版本：',
        typeMining: '採礦',
        typeBotany: '園藝',
        typeFishing: '釣魚',
        
        // 主要按鈕
        newListButton: '新增清單',
        importButton: '匯入',
        exportButton: '匯出',
        
        // 面板標題
        itemsListTitle: '採集物列表',
        loadingItems: '載入採集物資料中...',
        noItemsFound: '沒有符合條件的採集物',
        
        // 清單管理
        defaultListName: '預設清單',
        renameListTooltip: '重新命名',
        deleteListTooltip: '刪除清單',
        clearListTooltip: '清空清單',
        emptyListMessage: '清單為空',
        emptyListHint: '從左側點擊「加入清單」按鈕來新增採集物',
        
        // 項目卡片
        addToListButton: '加入清單',
        addedToListButton: '已加入',
        removeFromList: '移除',
        
        // 巨集匯出
        macroSectionTitle: '巨集匯出',
        generateMacroButton: '生成巨集',
        includeClearOption: '包含清除指令',
        sortByTimeOption: '按時間排序',
        copyMacroButton: '複製到剪貼簿',
        copiedButton: '已複製！',
        
        // 對話框
        newListDialogTitle: '新增清單',
        renameListDialogTitle: '重新命名清單',
        deleteListDialogTitle: '刪除清單',
        clearListDialogTitle: '清空清單',
        importDialogTitle: '匯入清單',
        
        listNameLabel: '清單名稱：',
        newNameLabel: '新名稱：',
        enterListNamePlaceholder: '輸入清單名稱',
        
        confirmDeleteList: '確定要刪除清單「{name}」嗎？',
        confirmClearList: '確定要清空清單「{name}」嗎？',
        operationCannotUndo: '此操作無法復原！',
        willRemoveItems: '將移除 {count} 個採集物',

        selectFileLabel: '選擇檔案：',
        selectJsonFileHint: '請選擇之前匯出的 JSON 檔案',

        cancelButton: '取消',
        confirmButton: '確認',

        // 通知訊息
        addedToListNotification: '已加入清單',
        removedFromListNotification: '已從清單移除',
        listCreatedNotification: '清單已建立',
        listRenamedNotification: '清單已重新命名',
        listDeletedNotification: '清單已刪除',
        listClearedNotification: '清單已清空',
        listsExportedNotification: '清單已匯出',
        listsImportedNotification: '成功匯入 {count} 個清單',
        macroCopiedNotification: '巨集已複製到剪貼簿',

        // 錯誤訊息
        initFailedError: '初始化失敗，請重新整理頁面',
        dataLoadFailedError: '載入採集物資料失敗，請重新整理頁面再試',
        maxListsWarning: '最多只能建立 {max} 個清單',
        atLeastOneListWarning: '至少需要保留一個清單',
        listAlreadyEmptyInfo: '清單已經是空的',
        emptyListNoMacroWarning: '清單為空，無法生成巨集',
        noMacroToCopyWarning: '沒有巨集可複製',
        copyFailedError: '複製失敗，請手動選取複製',
        invalidListNameError: '清單名稱長度不符合要求',
        fileFormatError: '檔案格式錯誤',

        // 時間相關
        timeFormat: '時間',
        level: 'Lv.',

        // list-manager 專用訊息
        listNameEmpty: '清單名稱不能為空',
        listNameTooLong: '清單名稱不能超過 {max} 個字元',
        listNameExists: '清單名稱已存在',
        maxListsReached: '已達到最大清單數限制',
        itemAlreadyInList: '項目已在清單中',
        itemsAlreadyInList: '以下項目已在清單中',
        listMaxItemsReached: '清單已達到最大項目數限制',
        incompatibleDataVersion: '匯入資料版本不相容',
        invalidImportFormat: '匯入的資料格式不正確',
        listCreatedSuccess: '清單建立成功',
        listNotExist: '清單不存在',
        listRenamedSuccess: '清單重新命名成功',
        listDeletedSuccess: '清單刪除成功',
        listClearedSuccess: '清單已清空',
        itemAddedSuccess: '項目新增成功',
        itemNotInList: '項目不在清單中',
        itemRemovedSuccess: '項目移除成功',
        indexOutOfRange: '索引超出範圍',
        itemOrderUpdated: '項目順序已更新',
        invalidImportData: '無效的匯入資料',
        incompatibleFileVersion: '檔案版本不相容',
        successImportedLists: '成功匯入 {count} 個清單',
        sourceListNotExist: '來源清單不存在',
        listCopiedSuccess: '清單複製成功',
        addedItemsToList: '已新增 {count} 個項目到目標清單',
        listMaxItems: '清單最多只能包含 {max} 個項目',
        itemAlreadyInListSimple: '此採集物已在清單中',
        
        // 通知功能
        notificationLabel: '採集提醒',
        notificationToggleLabel: '啟用採集通知提醒',
        notificationDisabled: '已停用',
        notificationEnabled: '已啟用',
        notificationPermissionDenied: '通知權限被拒絕',
        notificationNotSupported: '瀏覽器不支援通知',
        notificationHint: '採集時間到達時發送瀏覽器通知提醒',
        notificationTitle: 'FF14 採集提醒',
        notificationBodyTemplate: '{itemName} 現在可以採集了！\n地點：{zone} {location}\n座標：{coordinates}',
        testNotificationButton: '🔔 測試',
        testNotificationButtonShort: '測試通知',

        // 視覺通知文字
        visualNotificationTitle: '🔔 採集提醒',
        visualNotificationBody: '{itemName} 現在可以採集了！',
        visualNotificationTime: '時間',
        visualNotificationLocation: '地點',
        testItemName: '測試物品',
        testZoneName: '測試地區',
        testNotificationBody: '這是一個測試通知，請確認您是否看到了'
    },
    ja: {
        // 頁面標題和標頭
        pageTitle: 'タイムド採集管理ツール',
        pageDescription: 'FF14 タイムド採集管理ツール、検索、複数リスト管理、マクロエクスポート機能対応',
        
        // 時間顯示
        localTimeLabel: 'ローカル時間 (LT)',
        eorzeaTimeLabel: 'エオルゼア時間 (ET)',
        dayTime: '昼',
        nightTime: '夜',
        
        // 搜尋和篩選
        searchPlaceholder: 'アイテム名、場所を検索...', 
        clearButton: 'クリア',
        filterType: 'タイプ：',
        filterExpansion: 'パッチ：',
        filterVersion: 'バージョン：',
        typeMining: '採掘',
        typeBotany: '園芸',
        typeFishing: '釣り',
        
        // 主要按鈕
        newListButton: 'リスト追加',
        importButton: 'インポート',
        exportButton: 'エクスポート',
        
        // 面板標題
        itemsListTitle: 'アイテムリスト',
        loadingItems: 'アイテムデータを読み込み中...',
        noItemsFound: '条件に一致するアイテムがありません',
        
        // 清單管理
        defaultListName: 'デフォルトリスト',
        renameListTooltip: '名前を変更',
        deleteListTooltip: 'リストを削除',
        clearListTooltip: 'リストをクリア',
        emptyListMessage: 'リストは空です',
        emptyListHint: '左側の「リストに追加」ボタンをクリックしてアイテムを追加',
        
        // 項目卡片
        addToListButton: 'リストに追加',
        addedToListButton: '追加済み',
        removeFromList: '削除',
        
        // 巨集匯出
        macroSectionTitle: 'マクロエクスポート',
        generateMacroButton: 'マクロ生成',
        includeClearOption: 'クリアコマンドを含む',
        sortByTimeOption: '時間順にソート',
        copyMacroButton: 'クリップボードにコピー',
        copiedButton: 'コピー完了！',
        
        // 對話框
        newListDialogTitle: '新規リスト',
        renameListDialogTitle: 'リスト名を変更',
        deleteListDialogTitle: 'リストを削除',
        clearListDialogTitle: 'リストをクリア',
        importDialogTitle: 'リストをインポート',
        
        listNameLabel: 'リスト名：',
        newNameLabel: '新しい名前：',
        enterListNamePlaceholder: 'リスト名を入力',
        
        confirmDeleteList: 'リスト「{0}」を削除してもよろしいですか',
        confirmClearList: 'リスト「{0}」をクリアしてもよろしいですか',
        operationCannotUndo: 'この操作は取り消せません！',
        willRemoveItems: '削除されるアイテム：{0} 個',
        
        selectFileLabel: 'ファイルを選択：',
        selectJsonFileHint: '以前エクスポートしたJSONファイルを選択してください',
        
        cancelButton: 'キャンセル',
        confirmButton: '確認',
        
        // 通知訊息
        addedToListNotification: 'リストに追加しました',
        removedFromListNotification: 'リストから削除しました',
        listCreatedNotification: 'リストを作成しました',
        listRenamedNotification: 'リスト名を変更しました',
        listDeletedNotification: 'リストを削除しました',
        listClearedNotification: 'リストをクリアしました',
        listsExportedNotification: 'リストをエクスポートしました',
        listsImportedNotification: 'インポート成功：{0} 個のリスト',
        macroCopiedNotification: 'マクロをクリップボードにコピーしました',
        
        // 錯誤訊息
        initFailedError: '初期化に失敗しました。ページを更新してください',
        dataLoadFailedError: 'アイテムデータの読み込みに失敗しました。ページを更新して再試行してください',
        maxListsWarning: '最大 {0} 個のリストまで作成可能です',
        atLeastOneListWarning: '少なくとも1つのリストを保持する必要があります',
        listAlreadyEmptyInfo: 'リストは既に空です',
        emptyListNoMacroWarning: 'リストが空のため、マクロを生成できません',
        noMacroToCopyWarning: 'コピーするマクロがありません',
        copyFailedError: 'コピーに失敗しました。手動で選択してコピーしてください',
        invalidListNameError: 'リスト名の長さが要件を満たしていません',
        fileFormatError: 'ファイル形式エラー',
        
        // 時間相關
        timeFormat: '時間',
        level: 'Lv.',
        
        // list-manager 專用訊息
        listNameEmpty: 'リスト名を入力してください',
        listNameTooLong: 'リスト名は {0} 文字以内にしてください',
        listNameExists: 'リスト名は既に存在します',
        maxListsReached: '最大リスト数に達しました',
        itemAlreadyInList: 'アイテムは既にリストに存在します',
        itemsAlreadyInList: '以下のアイテムは既にリストに存在します',
        listMaxItemsReached: 'リストの最大アイテム数に達しました',
        incompatibleDataVersion: 'インポートデータのバージョンが互換性がありません',
        invalidImportFormat: 'インポートデータの形式が正しくありません',
        listCreatedSuccess: 'リストを作成しました',
        listNotExist: 'リストが存在しません',
        listRenamedSuccess: 'リスト名を変更しました',
        listDeletedSuccess: 'リストを削除しました',
        listClearedSuccess: 'リストをクリアしました',
        itemAddedSuccess: 'アイテムを追加しました',
        itemNotInList: 'アイテムはリストにありません',
        itemRemovedSuccess: 'アイテムを削除しました',
        indexOutOfRange: 'インデックスが範囲外です',
        itemOrderUpdated: 'アイテムの順序を更新しました',
        invalidImportData: '無効なインポートデータ',
        incompatibleFileVersion: 'ファイルバージョンが互換性がありません',
        successImportedLists: 'インポート成功：{0} 個のリスト',
        sourceListNotExist: 'ソースリストが存在しません',
        listCopiedSuccess: 'リストをコピーしました',
        addedItemsToList: '追加しました：{0} 個のアイテム',
        listMaxItems: 'リストには最大 {0} 個のアイテムまで',
        itemAlreadyInListSimple: 'このアイテムは既にリストに存在します',
        
        // 通知機能
        notificationLabel: '採集リマインダー',
        notificationToggleLabel: '採集通知リマインダーを有効にする',
        notificationDisabled: '無効',
        notificationEnabled: '有効',
        notificationPermissionDenied: '通知の許可が拒否されました',
        notificationNotSupported: 'ブラウザは通知をサポートしていません',
        notificationHint: '採集時間になったらブラウザ通知でお知らせします',
        notificationTitle: 'FF14 採集リマインダー',
        notificationBodyTemplate: '{itemName} が採集可能になりました！\n場所：{zone} {location}\n座標：{coordinates}',
        testNotificationButton: '🔔 テスト',
        testNotificationButtonShort: '通知テスト',

        // ビジュアル通知テキスト
        visualNotificationTitle: '🔔 採集リマインダー',
        visualNotificationBody: '{itemName} が採集可能になりました！',
        visualNotificationTime: '時間',
        visualNotificationLocation: '場所',
        testItemName: 'テストアイテム',
        testZoneName: 'テストエリア',
        testNotificationBody: 'これはテスト通知です。表示されたかご確認ください'
    },
    en: {
        // Page title and header
        pageTitle: 'Timed Gathering Manager',
        pageDescription: 'FF14 timed gathering management tool with search, multi-list management, and macro export',

        // Time display
        localTimeLabel: 'Local Time (LT)',
        eorzeaTimeLabel: 'Eorzea Time (ET)',
        dayTime: 'Day',
        nightTime: 'Night',

        // Search and filter
        searchPlaceholder: 'Search item name, location...', 
        clearButton: 'Clear',
        filterType: 'Type:',
        filterExpansion: 'Expansion:',
        filterVersion: 'Version:',
        typeMining: 'Mining',
        typeBotany: 'Botany',
        typeFishing: 'Fishing',

        // Main buttons
        newListButton: 'New List',
        importButton: 'Import',
        exportButton: 'Export',

        // Panel titles
        itemsListTitle: 'Item List',
        loadingItems: 'Loading item data...', 
        noItemsFound: 'No items match the criteria',

        // List management
        defaultListName: 'Default List',
        renameListTooltip: 'Rename',
        deleteListTooltip: 'Delete List',
        clearListTooltip: 'Clear List',
        emptyListMessage: 'List is empty',
        emptyListHint: 'Click "Add to List" button on the left to add items',

        // Item cards
        addToListButton: 'Add to List',
        addedToListButton: 'Added',
        removeFromList: 'Remove',

        // Macro export
        macroSectionTitle: 'Macro Export',
        generateMacroButton: 'Generate Macro',
        includeClearOption: 'Include clear command',
        sortByTimeOption: 'Sort by time',
        copyMacroButton: 'Copy to Clipboard',
        copiedButton: 'Copied!',

        // Dialogs
        newListDialogTitle: 'New List',
        renameListDialogTitle: 'Rename List',
        deleteListDialogTitle: 'Delete List',
        clearListDialogTitle: 'Clear List',
        importDialogTitle: 'Import List',

        listNameLabel: 'List Name:',
        newNameLabel: 'New Name:',
        enterListNamePlaceholder: 'Enter list name',

        confirmDeleteList: 'Are you sure you want to delete the list "{0}"?',
        confirmClearList: 'Are you sure you want to clear the list "{0}"?',
        operationCannotUndo: 'This operation cannot be undone!',
        willRemoveItems: 'Will remove {0} items',

        selectFileLabel: 'Select File:',
        selectJsonFileHint: 'Select a previously exported JSON file',

        cancelButton: 'Cancel',
        confirmButton: 'Confirm',

        // Notifications
        addedToListNotification: 'Added to list',
        removedFromListNotification: 'Removed from list',
        listCreatedNotification: 'List created',
        listRenamedNotification: 'List renamed',
        listDeletedNotification: 'List deleted',
        listClearedNotification: 'List cleared',
        listsExportedNotification: 'Lists exported',
        listsImportedNotification: 'Successfully imported {0} lists',
        macroCopiedNotification: 'Macro copied to clipboard',

        // Error messages
        initFailedError: 'Initialization failed, please refresh the page',
        dataLoadFailedError: 'Failed to load item data, please refresh and try again',
        maxListsWarning: 'Maximum of {0} lists allowed',
        atLeastOneListWarning: 'At least one list must be kept',
        listAlreadyEmptyInfo: 'List is already empty',
        emptyListNoMacroWarning: 'List is empty, cannot generate macro',
        noMacroToCopyWarning: 'No macro to copy',
        copyFailedError: 'Copy failed, please select and copy manually',
        invalidListNameError: 'List name length does not meet requirements',
        fileFormatError: 'File format error',

        // Time related
        timeFormat: 'Time',
        level: 'Lv.',

        // list-manager specific messages
        listNameEmpty: 'List name cannot be empty',
        listNameTooLong: 'List name cannot exceed {0} characters',
        listNameExists: 'List name already exists',
        maxListsReached: 'Maximum list limit reached',
        itemAlreadyInList: 'Item is already in the list',
        itemsAlreadyInList: 'The following items are already in the list',
        listMaxItemsReached: 'List has reached maximum item limit',
        incompatibleDataVersion: 'Import data version is incompatible',
        invalidImportFormat: 'Import data format is incorrect',
        listCreatedSuccess: 'List created successfully',
        listNotExist: 'List does not exist',
        listRenamedSuccess: 'List renamed successfully',
        listDeletedSuccess: 'List deleted successfully',
        listClearedSuccess: 'List cleared',
        itemAddedSuccess: 'Item added successfully',
        itemNotInList: 'Item is not in the list',
        itemRemovedSuccess: 'Item removed successfully',
        indexOutOfRange: 'Index out of range',
        itemOrderUpdated: 'Item order updated',
        invalidImportData: 'Invalid import data',
        incompatibleFileVersion: 'File version is incompatible',
        successImportedLists: 'Successfully imported {0} lists',
        sourceListNotExist: 'Source list does not exist',
        listCopiedSuccess: 'List copied successfully',
        addedItemsToList: 'Added {0} items to target list',
        listMaxItems: 'List can contain maximum of {0} items',
        itemAlreadyInListSimple: 'This item is already in the list',

        // Notification function
        notificationLabel: 'Gathering Reminder',
        notificationToggleLabel: 'Enable gathering notification reminder',
        notificationDisabled: 'Disabled',
        notificationEnabled: 'Enabled',
        notificationPermissionDenied: 'Notification permission denied',
        notificationNotSupported: 'Browser does not support notifications',
        notificationHint: 'Send browser notification when gathering time arrives',
        notificationTitle: 'FF14 Gathering Reminder',
        notificationBodyTemplate: '{itemName} is now available for gathering!\nLocation: {zone} {location}\nCoordinates: {coordinates}',
        testNotificationButton: '🔔 Test',
        testNotificationButtonShort: 'Test Notification',

        // Visual notification text
        visualNotificationTitle: '🔔 Gathering Reminder',
        visualNotificationBody: '{itemName} is now available for gathering!',
        visualNotificationTime: 'Time',
        visualNotificationLocation: 'Location',
        testItemName: 'Test Item',
        testZoneName: 'Test Zone',
        testNotificationBody: 'This is a test notification, please confirm you can see it'
    }
};

// 載入翻譯到全域 i18n
if (window.i18n) {
    window.i18n.loadTranslations('timed-gathering', window.TimedGatheringTranslations);
}
