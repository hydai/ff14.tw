const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { classesOf, tagAttrs, sliceElementById, parseAttrs } = require('./helpers/html-fragment.js');
const { createPanelPage, PANEL_IDS } = require('./helpers/panel-page.js');
const { translationKeySet, translationValues } = require('./helpers/translation-parsers.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const TOOL_DIR = 'tools/treasure-map-finder';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/treasure-map-finder.js';

// ---------- 隊伍狀態的標記與樣式（讀原始檔） ----------
test('隊伍狀態的結構：代號列有 role=status 的同步狀態、三顆按鈕、成員一行有 aria-expanded 與 aria-controls、成員列表先藏起來；#listView 仍只有一顆 .btn-primary；舊的 #lastActivity、#roomTTL、#userNickname、#editNicknameBtn 都不在了', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const section = sliceElementById(html, 'roomSection');
    assert.match(section, /^<section\b/);
    const root = tagAttrs(html, 'roomSection');
    assert.deepEqual(classesOf(root), ['tm-team', 'hidden']);
    assert.deepEqual([root['aria-label'], root['data-i18n'], root['data-i18n-attr']], ['隊伍', 'treasure_map_party_label', 'aria-label']);

    // 三行：代號與同步狀態、按鈕、成員一行與成員列表
    const order = ['class="tm-team-row"', 'id="roomCode"', 'id="partySync"', 'id="partySyncNote"', 'class="tm-team-actions"', 'id="copyInviteBtn"',
        'id="copyRoomCodeBtn"', 'id="leaveRoomBtn"', 'id="membersToggle"', 'id="membersPanel"', 'id="membersList"'].map((s) => section.indexOf(s));
    assert.ok(!order.includes(-1), `隊伍狀態缺東西：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `隊伍狀態的順序：${order}`);

    // 同步狀態在代號列裡，role="status"，文字由 JavaScript 寫（只在狀態真的改變時才寫，不掛 data-i18n）；警告一行先藏起來
    const row = sliceElementById(html, 'partySync');
    assert.ok(sliceElementById(section, 'partySync') === row && section.indexOf(row) < section.indexOf('class="tm-team-actions"'));
    assert.equal(tagAttrs(html, 'partySync').role, 'status');
    assert.deepEqual(classesOf(tagAttrs(html, 'partySync')), ['tm-sync']);
    assert.match(row, /<span\b[^>]*\sid="partySyncText"/);
    assert.deepEqual(classesOf(tagAttrs(html, 'partySyncNote')), ['warning-message', 'tm-sync-note', 'hidden']);
    assert.equal(tagAttrs(html, 'partySyncNote')['data-i18n'], 'treasure_map_sync_note');

    // 三顆按鈕：複製邀請連結、複製代號、離開（靠右的文字按鈕）。離開鈕用自己的鍵值 treasure_map_party_leave（英日是短字，見切到英文的測試）
    const buttons = ['copyInviteBtn', 'copyRoomCodeBtn', 'leaveRoomBtn'].map((id) => tagAttrs(html, id));
    assert.deepEqual(buttons.map((attrs) => attrs.type), ['button', 'button', 'button']);
    assert.deepEqual(buttons.map(classesOf), [['btn', 'btn-sm'], ['btn', 'btn-sm'], ['btn', 'btn-sm', 'btn-ghost', 'tm-leave']]);
    assert.deepEqual(buttons.slice(1).map((attrs) => attrs['data-i18n']), ['treasure_map_copy_room_code', 'treasure_map_party_leave']);
    assert.match(sliceElementById(html, 'copyInviteBtn'), /<span class="btn-icon" aria-hidden="true">🔗<\/span> <span data-i18n="treasure_map_copy_invite">複製邀請連結<\/span>/);

    // 成員一行是按鈕：aria-expanded 與 aria-controls；列表在它指向的面板裡，先藏起來
    const toggle = tagAttrs(html, 'membersToggle');
    assert.deepEqual([toggle.type, toggle['aria-expanded'], toggle['aria-controls'], classesOf(toggle)], ['button', 'false', 'membersPanel', ['tm-members-toggle']]);
    assert.deepEqual(classesOf(tagAttrs(html, 'membersPanel')), ['tm-members', 'hidden']);
    assert.match(sliceElementById(html, 'membersPanel'), /<ul class="tm-member-list" id="membersList"><\/ul>/);
    assert.equal(tagAttrs(html, 'membersChevron')['aria-hidden'], 'true');
    // 帶隊伍、成員資料的字都由 JavaScript 依狀態與語言組出來，不掛 data-i18n（I18nManager 切換語言時會把它整個換掉）
    for (const id of ['roomCode', 'partySyncText', 'membersCount', 'membersNames', 'membersChevron', 'membersList']) {
        assert.equal(tagAttrs(html, id)['data-i18n'], undefined, id);
    }
    assert.match(section, /<p class="tm-team-note" data-i18n="treasure_map_party_ttl_note">/);

    // 清單頁仍然只有「生成路線」一顆主要按鈕；最後更新、剩餘時間、暱稱那一列拿掉了
    assert.equal((sliceElementById(html, 'listView').match(/class="[^"]*\bbtn-primary\b/g) || []).length, 1);
    for (const gone of ['roomStatus', 'roomMembers', 'lastActivity', 'roomTTL', 'userNickname', 'editNicknameBtn', 'roomMembersList']) {
        assert.ok(!html.includes(`id="${gone}"`), `#${gone} 還在`);
    }
});

test('index.html 的腳本順序：party-status.js 在 room-collaboration.js 前面（建構函式一開始就要建 PartyStatus）', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const at = (name) => html.indexOf(`<script src="${name}"></script>`);
    assert.notEqual(at('party-status.js'), -1);
    assert.ok(at('party-status.js') < at('room-collaboration.js'));
});

test('room-collaboration.js 不再有最後更新、剩餘時間與舊的成員列表；複製代號與邀請連結共用 copyText()', () => {
    const source = read(`${TOOL_DIR}/room-collaboration.js`);
    for (const gone of ['updateActivityTime', 'updateRoomTTL', 'updateMembersList', 'member-tag', 'member-remove-btn', 'lastActivityAt']) {
        assert.ok(!source.includes(gone), `room-collaboration.js 還有 ${gone}`);
    }
    assert.match(source, /copyText\(text, key, fallback\)/);
    assert.match(source, /fallbackCopy\(text, key, fallback\)/);
});

// 把 CSS 攤平成 [{ selectors, body }]（含 @media 裡的規則）；bodyOf(selector) 是某個選擇器所有規則的宣告合在一起
function cssRules(css) {
    const rules = [];
    const scan = (text) => {
        for (const m of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
            const head = m[1].trim();
            if (head.startsWith('@media')) scan(m[2]);
            else rules.push({ selectors: head.split(',').map((s) => s.trim()), body: m[2] });
        }
    };
    scan(css);
    return { rules, bodyOf: (selector) => rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join(';') };
}

// 一個對話框的按鈕列（那個 .dialog-actions 元素）的 class 清單：放不下就換行的按鈕列多一個共用的 .tm-dialog-actions-wrap
function actionRowClasses(html, id) {
    return classesOf({ class: sliceElementById(html, id).match(/<div class="([^"]*\bdialog-actions\b[^"]*)"/)[1] });
}

test('隊伍狀態的樣式：新規則寫在最後的 .hidden 前面，會被 .hidden 切換的元素 display 只設在單一 class 上；舊的 .room-*、.member-* 規則拿掉', () => {
    const css = stripComments(read(`${TOOL_DIR}/style.css`));
    const { rules, bodyOf } = cssRules(css);

    for (const selector of ['.tm-team', '.tm-team-row', '.tm-team-code', '.tm-sync', '.tm-sync-dot', '.tm-team-actions', '.tm-team-actions .tm-leave', '.tm-members-toggle',
        '.tm-members-names', '.tm-chevron', '.tm-members', '.tm-member-list', '.tm-member', '.tm-member-name', '.tm-member-meta', '.tm-team-note']) {
        assert.notEqual(bodyOf(selector), '', `${selector} 沒有規則`);
        assert.ok(css.indexOf(`${selector} {`) < css.lastIndexOf('\n.hidden {'), `${selector} 要寫在最後的 .hidden 前面`);
    }
    assert.match(bodyOf('.tm-team'), /display:\s*grid/);
    assert.match(bodyOf('.tm-members'), /display:\s*grid/);
    // 成員一行的名字不換行（省略號）：欄寬不鎖在容器的寬度，欄會被撐到整行名字的寬度，清單面板就出現橫向捲軸、右邊的按鈕被切掉（瀏覽器實測）
    assert.match(bodyOf('.tm-team'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // .tm-team（#roomSection）、.tm-members（#membersPanel）、.tm-sync-note（#partySyncNote）、.tm-team-intro（#teamActions）都用 .hidden 切換：
    // 有 display 的規則，選擇器只能是這個 class 本身，不然特異度比 .hidden 高，.hidden 就藏不起來
    for (const name of ['tm-team', 'tm-members', 'tm-sync-note', 'tm-team-intro']) {
        for (const rule of rules.filter((r) => /(?:^|[;\s])display\s*:/.test(r.body))) {
            for (const selector of rule.selectors.filter((s) => new RegExp(`\\.${name}(?![\\w-])`).test(s))) {
                assert.equal(selector, `.${name}`, `${selector} 讓 .hidden 失效`);
            }
        }
    }

    const old = /\.(?:room-section|room-status|room-info|room-label|user-label|members-label|room-stat|room-code|room-stats|stat-icon|room-user|user-nickname|room-members|members-list|member-tag|member-remove-btn)(?![\w-])/;
    assert.doesNotMatch(css, old);
    // 改名、離開也改寫成 .dialog-overlay > .dialog.tm-dialog 了，沒有對話框再用舊的 .modal 那一套：它的規則一起刪掉，只留代號欄用的 .input-uppercase
    assert.doesNotMatch(css, /(?<![\w-])\.modal(?:-content|-body|-footer)?(?![\w-])|\.input-field/, '舊的 .modal、.modal-content、.modal-body、.modal-footer、.input-field 規則還在');
    assert.match(bodyOf('.input-uppercase'), /text-transform:\s*uppercase/);
});

// ---------- 入口說明與建立隊伍對話框的標記與樣式（讀原始檔） ----------
test('入口說明：#teamActions 是一段說明加兩顆一般按鈕（class 是 btn、type 是 button），按鈕的字用共用的鍵值；#listView 仍然只有一顆主要按鈕', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const intro = sliceElementById(html, 'teamActions');
    // 容器留著 id 與 team-actions，多一個 tm-team-intro；updateRoomUI() 在隊伍裡時用 .hidden 把它藏起來
    assert.deepEqual(classesOf(tagAttrs(html, 'teamActions')), ['team-actions', 'tm-team-intro']);
    // 說明在上（標題、一行說明），按鈕在下（建立、加入）
    const order = ['class="tm-team-intro-text"', 'class="tm-team-intro-title"', 'class="tm-team-intro-hint"', 'class="tm-team-intro-actions"', 'id="createRoomBtn"', 'id="joinRoomBtn"']
        .map((s) => intro.indexOf(s));
    assert.ok(!order.includes(-1), `入口缺東西：${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `入口的順序：${order}`);
    assert.match(intro, /<p class="tm-team-intro-title" data-i18n="treasure_map_party_intro_title">和隊友共用一份清單<\/p>/);
    assert.match(intro, /<p class="tm-team-intro-hint" data-i18n="treasure_map_party_intro_hint">最多 8 人、8 張寶圖，每張都看得到是誰的。<\/p>/);
    // 圖示是裝飾（aria-hidden），字掛在裡面那一層：切換語言時 I18nManager 只換字，圖示不會被換掉
    for (const [id, icon, key, text] of [['createRoomBtn', '👥', 'treasure_map_create_room', '建立隊伍'], ['joinRoomBtn', '🔑', 'treasure_map_join_room', '加入隊伍']]) {
        const attrs = tagAttrs(html, id);
        assert.deepEqual([attrs.type, classesOf(attrs), attrs['data-i18n']], ['button', ['btn'], undefined], id);
        assert.match(sliceElementById(html, id), new RegExp(`<span class="btn-icon" aria-hidden="true">${icon}</span> <span data-i18n="${key}">${text}</span>`), id);
    }
    // 面板的主要按鈕留給底部的「生成路線」
    assert.doesNotMatch(intro, /\bbtn-primary\b/);
    assert.equal((sliceElementById(html, 'listView').match(/class="[^"]*\bbtn-primary\b/g) || []).length, 1);
});

test('建立隊伍對話框的標記：照頁內對話框的結構，說明、迷你清單、選項的字、提醒與錯誤由程式填；只有「帶進」預設勾；只有一顆主要按鈕', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'createPartyModal');
    const overlay = tagAttrs(html, 'createPartyModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'createPartyModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '改寫的對話框不用舊的 .modal 那一套');
    // 隊伍的對話框那一段：在清單面板後面（疊在它上面）、清空清單對話框前面；頁面替身照同一個順序掛
    assert.ok(html.indexOf('id="myListPanel"') < html.indexOf('id="createPartyModal"') && html.indexOf('id="createPartyModal"') < html.indexOf('id="clearListModal"'));
    assert.ok(PANEL_IDS.indexOf('myListPanel') < PANEL_IDS.indexOf('createPartyModal') && PANEL_IDS.indexOf('createPartyModal') < PANEL_IDS.indexOf('clearListModal'), 'PANEL_IDS 少了 createPartyModal');

    const title = tagAttrs(html, 'createPartyModal-title');
    assert.match(dialog, /<h3\b[^>]*\sid="createPartyModal-title"/);
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], 'treasure_map_create_title']);
    const close = tagAttrs(html, 'closeCreateModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);

    // 內文由上而下：說明、迷你清單、選項、提醒、錯誤。帶張數、會換字的都由程式填，不掛 data-i18n（I18nManager 切換語言時會把它整個換掉）
    const plain = (id, classes) => {
        const attrs = tagAttrs(html, id);
        assert.deepEqual([classesOf(attrs), attrs['data-i18n']], [classes, undefined], id);
        return attrs;
    };
    plain('createPartyLede', ['tm-dialog-lede']);
    plain('createPartyList', ['tm-mini-list']);
    plain('createPartyChoice', ['tm-choice']);
    assert.match(dialog, /<p\b[^>]*\sid="createPartyLede"/);
    assert.match(dialog, /<ul\b[^>]*\sid="createPartyList"/);
    assert.match(dialog, /<fieldset\b[^>]*\sid="createPartyChoice"/);
    // 提醒是狀態訊息、錯誤是警示：出現時被唸出來
    assert.equal(plain('createPartyNote', ['warning-message', 'hidden']).role, 'status');
    assert.equal(plain('createPartyError', ['error-message', 'hidden']).role, 'alert');
    const order = ['id="createPartyLede"', 'id="createPartyList"', 'id="createPartyChoice"', 'id="createPartyNote"', 'id="createPartyError"'].map((s) => dialog.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `內文的順序：${order}`);

    // 單選：fieldset 有 legend（只給螢幕閱讀器看），兩個 radio 同一組，只有「帶進」預設勾
    const legend = parseAttrs(dialog.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_choice_legend']);
    assert.equal((dialog.match(/class="form-check"/g) || []).length, 2);
    const labels = [...dialog.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    for (const [mode, checked] of [['Bring', true], ['Clear', false]]) {
        const radio = tagAttrs(html, `createMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'createMode', mode.toLowerCase(), ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="createMode${mode}"[^>]*\\schecked[\\s>]`).test(dialog), checked, `${mode} 的 checked`);
        assert.deepEqual(classesOf(labels.find((attrs) => attrs.for === `createMode${mode}`)), ['form-check-label'], mode);
        plain(`createMode${mode}Title`, ['tm-choice-title']);
        plain(`createMode${mode}Hint`, ['tm-choice-hint']);
    }

    // 取消與「建立隊伍」：這個對話框唯一的主要按鈕是「建立隊伍」
    const cancel = tagAttrs(html, 'cancelCreateBtn');
    const confirm = tagAttrs(html, 'confirmCreateBtn');
    assert.deepEqual([cancel.type, classesOf(cancel), cancel['data-i18n']], ['button', ['btn'], 'treasure_map_cancel']);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-primary'], 'treasure_map_create_room']);
    assert.equal((dialog.match(/\bbtn-primary\b/g) || []).length, 1);
});

test('加入隊伍對話框的標記：照頁內對話框的結構；label 對到代號欄，說明與錯誤接在欄下面（錯誤 role=alert、先藏起來），aria-describedby 兩個都指；「你的清單」那一塊用一個先藏起來的 div 包住；只有一顆主要按鈕；不再用 .modal 那一套', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'joinRoomModal');
    const overlay = tagAttrs(html, 'joinRoomModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'joinRoomModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '改寫的對話框不用舊的 .modal 那一套');
    // 隊伍的對話框那一段：建立隊伍之後、編輯暱稱之前，都在清空清單對話框前面（疊在清單面板上面）
    const order = ['id="myListPanel"', 'id="createPartyModal"', 'id="joinRoomModal"', 'id="editNicknameModal"', 'id="clearListModal"'].map((s) => html.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `對話框的順序：${order}`);

    const title = tagAttrs(html, 'joinRoomModal-title');
    assert.match(dialog, /<h3\b[^>]*\sid="joinRoomModal-title"/);
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], 'treasure_map_join_title']);
    const close = tagAttrs(html, 'closeJoinModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);

    // 代號欄：label 用 for 對到它；一般的 .form-control（再加轉大寫的 .input-uppercase）；說明與錯誤都接在它後面，aria-describedby 兩個都指
    const labels = [...dialog.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    const codeLabel = labels.find((attrs) => attrs.for === 'roomCodeInput');
    assert.deepEqual([classesOf(codeLabel), codeLabel['data-i18n']], [['form-label'], 'treasure_map_party_code']);
    const input = tagAttrs(html, 'roomCodeInput');
    assert.deepEqual([input.type, classesOf(input), input.maxlength, input.autocomplete, input.autocapitalize, input.spellcheck, input['aria-describedby']],
        ['text', ['form-control', 'input-uppercase'], '6', 'off', 'characters', 'false', 'roomCodeHint roomCodeError']);
    assert.deepEqual([input.placeholder, input['data-i18n'], input['data-i18n-attr']], ['例如：A3B7K9', 'treasure_map_code_placeholder', 'placeholder']);
    // 說明是固定的字（掛 data-i18n）；錯誤的字由程式依代號與伺服器的回應組出來，不掛 data-i18n，是 role="alert"，先藏起來
    assert.match(dialog, /<p class="form-text" id="roomCodeHint" data-i18n="treasure_map_code_hint">6 碼英文和數字，向隊長要。打開隊長貼的邀請連結就不用輸入。<\/p>/);
    const error = tagAttrs(html, 'roomCodeError');
    assert.deepEqual([classesOf(error), error.role, error['data-i18n']], [['form-text', 'tm-field-error', 'hidden'], 'alert', undefined]);
    assert.match(dialog, /<p class="form-text tm-field-error hidden" id="roomCodeError" role="alert"><\/p>/, '先是空的');

    // 「你的清單」那一塊：清單是空的時整塊藏起來，所以一個 div 包住說明、迷你清單、選項與提醒；程式填的字不掛 data-i18n
    const group = tagAttrs(html, 'joinPartyMaps');
    assert.deepEqual(classesOf(group), ['tm-dialog-group', 'hidden']);
    assert.match(dialog, /<div\b[^>]*\sid="joinPartyMaps"/);
    const groupHtml = sliceElementById(html, 'joinPartyMaps');
    const plain = (id, classes) => {
        const attrs = tagAttrs(html, id);
        assert.deepEqual([classesOf(attrs), attrs['data-i18n']], [classes, undefined], id);
        return attrs;
    };
    plain('joinPartyLede', ['tm-dialog-lede']);
    plain('joinPartyList', ['tm-mini-list']);
    plain('joinPartyChoice', ['tm-choice']);
    assert.match(groupHtml, /<p\b[^>]*\sid="joinPartyLede"/);
    assert.match(groupHtml, /<ul\b[^>]*\sid="joinPartyList"/);
    assert.match(groupHtml, /<fieldset\b[^>]*\sid="joinPartyChoice"/);
    assert.equal(plain('joinPartyNote', ['warning-message', 'hidden']).role, 'status');
    const body = ['<label', 'id="roomCodeInput"', 'id="roomCodeHint"', 'id="roomCodeError"', 'id="joinPartyMaps"', 'id="joinPartyLede"', 'id="joinPartyList"', 'id="joinPartyChoice"', 'id="joinPartyNote"']
        .map((s) => dialog.indexOf(s));
    assert.ok(!body.includes(-1) && body.every((at, index) => index === 0 || body[index - 1] < at), `內文的順序：${body}`);

    // 單選：和建立隊伍的對話框同一個寫法，name 是 joinMode，只有「帶進」預設勾
    const legend = parseAttrs(groupHtml.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_choice_legend']);
    assert.equal((groupHtml.match(/class="form-check"/g) || []).length, 2);
    for (const [mode, checked] of [['Bring', true], ['Clear', false]]) {
        const radio = tagAttrs(html, `joinMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'joinMode', mode.toLowerCase(), ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="joinMode${mode}"[^>]*\\schecked[\\s>]`).test(groupHtml), checked, `${mode} 的 checked`);
        assert.deepEqual(classesOf(labels.find((attrs) => attrs.for === `joinMode${mode}`)), ['form-check-label'], mode);
        plain(`joinMode${mode}Title`, ['tm-choice-title']);
        plain(`joinMode${mode}Hint`, ['tm-choice-hint']);
    }

    // 取消與「加入」：這個對話框唯一的主要按鈕是「加入」
    const cancel = tagAttrs(html, 'cancelJoinBtn');
    const confirm = tagAttrs(html, 'confirmJoinBtn');
    assert.deepEqual([cancel.type, classesOf(cancel), cancel['data-i18n']], ['button', ['btn'], 'treasure_map_cancel']);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-primary'], 'treasure_map_join']);
    assert.equal((dialog.match(/\bbtn-primary\b/g) || []).length, 1);
});

test('邀請連結對話框的標記：照頁內對話框的結構，放在加入隊伍對話框後面（頁面替身照同一個順序掛）；標題、摘要、名字、「你目前在隊伍 A」、選項、錯誤與「不用了／關閉」都由程式填（不掛 data-i18n）；「你的清單」那一塊用一個先藏起來的 div 包住；只有一顆主要按鈕「加入」', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'joinLinkModal');
    const overlay = tagAttrs(html, 'joinLinkModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'joinLinkModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '新的對話框不用舊的 .modal 那一套');
    // 隊伍的對話框那一段：加入隊伍對話框後面、改名對話框前面，都在清空清單對話框前面（疊在清單面板上面）；頁面替身照同一個順序掛
    const order = ['id="myListPanel"', 'id="joinRoomModal"', 'id="joinLinkModal"', 'id="editNicknameModal"', 'id="clearListModal"'].map((s) => html.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `對話框的順序：${order}`);
    assert.equal(PANEL_IDS.indexOf('joinLinkModal'), PANEL_IDS.indexOf('joinRoomModal') + 1, 'PANEL_IDS 少了 joinLinkModal，或順序和 index.html 不一樣');

    // 標題帶代號，由程式填、先是空的；✕ 和其他對話框一樣
    const title = tagAttrs(html, 'joinLinkModal-title');
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], undefined]);
    assert.match(dialog, /<h3 class="dialog-title" id="joinLinkModal-title"><\/h3>/);
    const close = tagAttrs(html, 'closeLinkModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);

    // 內文由上而下：摘要、名字、「你目前在隊伍 A」、「你的清單」那一塊、錯誤。帶代號、人數、名字、張數，都由程式填，不掛 data-i18n，先是空的
    const plain = (id, classes, tag) => {
        const attrs = tagAttrs(html, id);
        assert.deepEqual([classesOf(attrs), attrs['data-i18n']], [classes, undefined], id);
        assert.match(dialog, new RegExp(`<${tag}\\b[^>]*\\sid="${id}"`), `#${id} 是 <${tag}>`);
        return attrs;
    };
    plain('joinLinkSummary', ['tm-dialog-lede'], 'p');
    plain('joinLinkName', [], 'p');
    plain('joinLinkLeave', ['warning-message', 'hidden'], 'p');
    for (const id of ['joinLinkSummary', 'joinLinkName', 'joinLinkLeave']) assert.match(dialog, new RegExp(`id="${id}"[^>]*><\\/p>`), `#${id} 先是空的`);
    // 「你的清單」那一塊：清單是空的時整塊藏起來（同加入隊伍對話框的 #joinPartyMaps），說明、迷你清單、選項與提醒都在裡面
    plain('linkPartyMaps', ['tm-dialog-group', 'hidden'], 'div');
    const groupHtml = sliceElementById(html, 'linkPartyMaps');
    plain('linkPartyLede', ['tm-dialog-lede'], 'p');
    plain('linkPartyList', ['tm-mini-list'], 'ul');
    plain('linkPartyChoice', ['tm-choice'], 'fieldset');
    assert.equal(plain('linkPartyNote', ['warning-message', 'hidden'], 'p').role, 'status');
    for (const id of ['linkPartyLede', 'linkPartyList', 'linkPartyChoice', 'linkPartyNote']) assert.ok(groupHtml.includes(`id="${id}"`), `#${id} 在 #linkPartyMaps 裡面`);
    // 錯誤是警示：出現時被唸出來；不在「你的清單」那一塊裡（讀隊伍就失敗時那一塊藏著，錯誤要看得到）
    assert.equal(plain('joinLinkError', ['error-message', 'hidden'], 'p').role, 'alert');
    assert.match(dialog, /<p class="error-message hidden" id="joinLinkError" role="alert"><\/p>/, '先是空的');
    assert.ok(!groupHtml.includes('id="joinLinkError"'));
    const body = ['id="joinLinkSummary"', 'id="joinLinkName"', 'id="joinLinkLeave"', 'id="linkPartyMaps"', 'id="linkPartyLede"', 'id="linkPartyList"', 'id="linkPartyChoice"',
        'id="linkPartyNote"', 'id="joinLinkError"'].map((s) => dialog.indexOf(s));
    assert.ok(!body.includes(-1) && body.every((at, index) => index === 0 || body[index - 1] < at), `內文的順序：${body}`);

    // 單選：和建立、加入隊伍的對話框同一個寫法，name 是 linkMode，只有「帶進」預設勾
    const legend = parseAttrs(groupHtml.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_choice_legend']);
    assert.equal((groupHtml.match(/class="form-check"/g) || []).length, 2);
    const labels = [...groupHtml.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    for (const [mode, checked] of [['Bring', true], ['Clear', false]]) {
        const radio = tagAttrs(html, `linkMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'linkMode', mode.toLowerCase(), ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="linkMode${mode}"[^>]*\\schecked[\\s>]`).test(groupHtml), checked, `${mode} 的 checked`);
        assert.deepEqual(classesOf(labels.find((attrs) => attrs.for === `linkMode${mode}`)), ['form-check-label'], mode);
        plain(`linkMode${mode}Title`, ['tm-choice-title'], 'span');
        plain(`linkMode${mode}Hint`, ['tm-choice-hint'], 'span');
    }

    // 「不用了」（只剩錯誤時寫「關閉」）的字由程式填、先是空的；「加入」是固定的字，是這個對話框唯一的主要按鈕
    const dismiss = tagAttrs(html, 'dismissLinkBtn');
    const confirm = tagAttrs(html, 'confirmLinkBtn');
    assert.deepEqual([dismiss.type, classesOf(dismiss), dismiss['data-i18n']], ['button', ['btn'], undefined]);
    assert.match(dialog, /<button type="button" class="btn" id="dismissLinkBtn"><\/button>/);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-primary'], 'treasure_map_join']);
    assert.ok(dialog.indexOf('id="dismissLinkBtn"') < dialog.indexOf('id="confirmLinkBtn"'));
    assert.equal((dialog.match(/\bbtn-primary\b/g) || []).length, 1);
});

test('index.html 的腳本順序：room-dialogs.js 在 room-collaboration.js 前面（建構函式一開始就要建 RoomDialogs）；RoomCollaboration 不再有 handleCreateClick，建立隊伍鈕交給 dialogs.openCreate()', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const at = (name) => html.indexOf(`<script src="${name}"></script>`);
    assert.notEqual(at('room-dialogs.js'), -1);
    assert.ok(at('room-dialogs.js') < at('room-collaboration.js'));
    const source = read(`${TOOL_DIR}/room-collaboration.js`);
    assert.doesNotMatch(source, /handleCreateClick/);
    assert.match(source, /createRoomBtn\.addEventListener\('click', \(\) => this\.dialogs\.openCreate\(\)\)/);
    assert.match(read(`${TOOL_DIR}/room-dialogs.js`), /window\.RoomDialogs = RoomDialogs;/);
});

test('加入隊伍鈕交給 dialogs.openJoin()：room-collaboration.js 不再有舊的加入對話框（showJoinRoomDialog、confirmJoinRoom、代號欄的 Enter 監聽、三顆按鈕的監聽、modals.joinRoom）', () => {
    const source = read(`${TOOL_DIR}/room-collaboration.js`);
    assert.match(source, /joinRoomBtn\.addEventListener\('click', \(\) => this\.dialogs\.openJoin\(\)\)/);
    for (const gone of ['showJoinRoomDialog', 'confirmJoinRoom', 'roomCodeInput', 'closeJoinModalBtn', 'cancelJoinBtn', 'confirmJoinBtn', 'joinRoomModal', "'joinRoom'", 'joinRoom:']) {
        assert.ok(!source.includes(gone), `room-collaboration.js 還有 ${gone}`);
    }
    // 代號欄的 Enter 現在在 RoomDialogs：keydown（keypress 已經不建議用），輸入法選字時的 Enter 不算
    const dialogs = read(`${TOOL_DIR}/room-dialogs.js`);
    assert.match(dialogs, /roomCode\.addEventListener\('keydown'/);
    assert.doesNotMatch(dialogs, /keypress/);
    assert.match(dialogs, /isComposing/);
});

test('入口說明的樣式：.tm-team-intro 是單一 class（display: grid），舊的 .team-actions 規則換掉；新規則寫在最後的 .hidden 前面', () => {
    const css = stripComments(read(`${TOOL_DIR}/style.css`));
    const { bodyOf } = cssRules(css);
    for (const selector of ['.tm-team-intro', '.tm-team-intro-text p', '.tm-team-intro-title', '.tm-team-intro-hint', '.tm-team-intro-actions', '.tm-team-intro-actions .btn']) {
        assert.notEqual(bodyOf(selector), '', `${selector} 沒有規則`);
        assert.ok(css.indexOf(`${selector} {`) < css.lastIndexOf('\n.hidden {'), `${selector} 要寫在最後的 .hidden 前面`);
    }
    const intro = bodyOf('.tm-team-intro');
    assert.match(intro, /display:\s*grid/);
    assert.match(intro, /gap:\s*var\(--space-3\)/);
    assert.match(intro, /padding:\s*var\(--space-4\)/);
    // 面板裡這一塊和下面的清單之間的分隔線（原本寫在 .team-actions）
    assert.match(intro, /border-bottom:\s*1px solid var\(--color-border\)/);
    // 欄寬鎖在容器的寬度、按鈕列放不下就換行：日文的按鈕字比較長，320px 的面板裡兩顆並排放不下，
    // 不鎖欄寬、不換行的話欄會被撐寬，面板出現橫向捲軸、右邊的按鈕與說明被切掉（瀏覽器實測）
    assert.match(intro, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(bodyOf('.tm-team-intro-text p'), /margin:\s*0/);
    assert.match(bodyOf('.tm-team-intro-title'), /font-weight:\s*var\(--weight-semibold\)/);
    assert.match(bodyOf('.tm-team-intro-hint'), /color:\s*var\(--color-muted\)/);
    assert.match(bodyOf('.tm-team-intro-actions'), /display:\s*flex/);
    assert.match(bodyOf('.tm-team-intro-actions'), /flex-wrap:\s*wrap/);
    assert.match(bodyOf('.tm-team-intro-actions .btn'), /flex:\s*1/);
    // 不寫 .team-actions.tm-team-intro：特異度比最後的 .hidden 高，進了隊伍就藏不起來
    assert.doesNotMatch(css, /\.team-actions/, '原本的 .team-actions、.team-actions .btn 規則換掉了');
    // 建立隊伍對話框的按鈕列也一樣放不下就換行（日文「キャンセル」＋「パーティを作る」在 320px 會把取消鈕擠出左邊）：
    // 用共用的 .tm-dialog-actions-wrap，加在那個 .dialog-actions 元素上，不寫 #createPartyModal .dialog-actions 這種 id 規則
    // （離開隊伍對話框用同一個 class，沒有 id 規則的檢查在離開隊伍對話框那個樣式測試）；別的對話框的按鈕列不動
    assert.match(bodyOf('.tm-dialog-actions-wrap'), /flex-wrap:\s*wrap/);
    assert.ok(css.indexOf('.tm-dialog-actions-wrap {') < css.lastIndexOf('\n.hidden {'));
    assert.deepEqual(actionRowClasses(read(`${TOOL_DIR}/index.html`), 'createPartyModal'), ['dialog-actions', 'tm-dialog-actions-wrap']);
    assert.equal(bodyOf('.tm-dialog .dialog-actions'), '', '別的對話框的按鈕列不動');
});

test('加入隊伍對話框的樣式：代號欄的紅框用 id 規則（附原因的註解），錯誤字是 danger-text，「你的清單」那一塊是單一 class 的 grid；只用 token，寫在最後的 .hidden 前面', () => {
    const raw = read(`${TOOL_DIR}/style.css`);
    const css = stripComments(raw);
    const { rules, bodyOf } = cssRules(css);
    const tokens = new Set([...read('assets/css/tokens.css').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

    // common.css 的 input:not(…) 規則特異度是 (0,7,1)，蓋過 .form-control.is-invalid 的 (0,2,0)：紅框要靠 id 規則才出得來
    assert.match(bodyOf('#roomCodeInput.is-invalid'), /border-color:\s*var\(--color-danger\)/);
    // 聚焦時 common.css 的 input:not(…):focus 一樣蓋過 .form-control.is-invalid:focus 的紅色光圈（改成主色）：格式不對、找不到時焦點正好回到代號欄
    assert.match(bodyOf('#roomCodeInput.is-invalid:focus'), /box-shadow:\s*var\(--ring-danger\)/);
    assert.match(bodyOf('.tm-field-error'), /color:\s*var\(--color-danger-text\)/);
    const at = raw.indexOf('#roomCodeInput.is-invalid {');
    assert.notEqual(at, -1);
    assert.match(raw.slice(raw.lastIndexOf('/*', at), at), /input:not/, '規則前面的註解要寫明為什麼用 id');

    // 「你的清單」那一塊（#joinPartyMaps）清單是空的時用 .hidden 藏起來：display 只能設在單一 class 上，不然 .hidden 藏不起來；裡面的間距由 gap 決定
    assert.match(bodyOf('.tm-dialog-group'), /display:\s*grid/);
    assert.match(bodyOf('.tm-dialog-group'), /gap:\s*var\(--space-3\)/);
    assert.match(bodyOf('.tm-dialog-group > *'), /margin:\s*0/);
    for (const rule of rules.filter((r) => /(?:^|[;\s])display\s*:/.test(r.body))) {
        for (const selector of rule.selectors.filter((s) => /joinPartyMaps|tm-dialog-group/.test(s))) {
            assert.equal(selector, '.tm-dialog-group', `${selector} 讓 .hidden 失效`);
        }
    }

    // 只用 token：沒有色碼、rgb()、!important，var(--…) 都是 tokens.css 定義過的；新規則都在最後的 .hidden 前面
    for (const selector of ['#roomCodeInput.is-invalid', '#roomCodeInput.is-invalid:focus', '.tm-field-error', '.tm-dialog-group', '.tm-dialog-group > *']) {
        const body = bodyOf(selector);
        assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|!important/i, selector);
        for (const [, name] of body.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) assert.ok(tokens.has(name), `${selector} 用了 tokens.css 沒有的 ${name}`);
        assert.ok(css.indexOf(`${selector} {`) < css.lastIndexOf('\n.hidden {'), `${selector} 要寫在最後的 .hidden 前面`);
    }
});

// ---------- 離開、移出、改名對話框的標記與腳本（讀原始檔） ----------
test('離開隊伍對話框的標記：照頁內對話框的結構；說明由程式填，單選與兩段說明是固定的字（掛 data-i18n），錯誤 role=alert、先藏起來；只有一顆主要按鈕；不用 .modal 那一套，舊的兩顆離開鈕不在了', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'leaveRoomModal');
    const overlay = tagAttrs(html, 'leaveRoomModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'leaveRoomModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '改寫的對話框不用舊的 .modal 那一套');
    for (const gone of ['leaveKeepListBtn', 'leaveClearListBtn']) assert.ok(!html.includes(`id="${gone}"`), `#${gone} 還在`);

    const title = tagAttrs(html, 'leaveRoomModal-title');
    assert.match(dialog, /<h3\b[^>]*\sid="leaveRoomModal-title"/);
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], 'treasure_map_leave_title']);
    const close = tagAttrs(html, 'closeLeaveModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);

    // 內文由上而下：說明、單選、隊長的說明、最後一位的說明、錯誤。說明帶張數與代號，由程式填，不掛 data-i18n；兩段說明是固定的字；錯誤是警示
    const lede = tagAttrs(html, 'leaveLede');
    assert.deepEqual([classesOf(lede), lede['data-i18n']], [['tm-dialog-lede'], undefined]);
    assert.match(dialog, /<p\b[^>]*\sid="leaveLede"/);
    const choice = tagAttrs(html, 'leaveChoice');
    assert.deepEqual([classesOf(choice), choice['data-i18n']], [['tm-choice'], undefined]);
    assert.match(dialog, /<fieldset\b[^>]*\sid="leaveChoice"/);
    for (const [id, key] of [['leaveLeaderNote', 'treasure_map_leave_leader_note'], ['leaveLastNote', 'treasure_map_leave_last_note']]) {
        const note = tagAttrs(html, id);
        assert.deepEqual([classesOf(note), note['data-i18n']], [['form-text', 'hidden'], key], id);
        assert.match(dialog, new RegExp(`<p\\b[^>]*\\sid="${id}"`), id);
    }
    const error = tagAttrs(html, 'leaveError');
    assert.deepEqual([classesOf(error), error.role, error['data-i18n']], [['error-message', 'hidden'], 'alert', undefined]);
    assert.match(dialog, /<p class="error-message hidden" id="leaveError" role="alert"><\/p>/, '先是空的');
    const order = ['id="leaveLede"', 'id="leaveChoice"', 'id="leaveLeaderNote"', 'id="leaveLastNote"', 'id="leaveError"'].map((s) => dialog.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `內文的順序：${order}`);

    // 單選：fieldset 有 legend（只給螢幕閱讀器看），兩個 radio 同一組，只有「留在我的清單」預設勾；選項的標題與說明是固定的字
    const legend = parseAttrs(dialog.match(/<legend\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(legend), legend['data-i18n']], [['visually-hidden'], 'treasure_map_leave_choice']);
    const choiceHtml = sliceElementById(html, 'leaveChoice');
    assert.equal((choiceHtml.match(/class="form-check"/g) || []).length, 2);
    const labels = [...choiceHtml.matchAll(/<label\b[^>]*>/g)].map((m) => parseAttrs(m[0]));
    for (const [mode, value, checked, titleKey, hintKey] of [['Keep', 'keep', true, 'treasure_map_leave_keep', 'treasure_map_leave_keep_hint'],
        ['Clear', 'clear', false, 'treasure_map_leave_clear', 'treasure_map_leave_clear_hint']]) {
        const radio = tagAttrs(html, `leaveMode${mode}`);
        assert.deepEqual([radio.type, radio.name, radio.value, classesOf(radio)], ['radio', 'leaveMode', value, ['form-check-input']], mode);
        assert.equal(new RegExp(`<input\\b[^>]*id="leaveMode${mode}"[^>]*\\schecked[\\s>]`).test(choiceHtml), checked, `${mode} 的 checked`);
        assert.deepEqual(classesOf(labels.find((attrs) => attrs.for === `leaveMode${mode}`)), ['form-check-label'], mode);
        assert.match(choiceHtml, new RegExp(`<span class="tm-choice-title" data-i18n="${titleKey}">`), titleKey);
        assert.match(choiceHtml, new RegExp(`<span class="tm-choice-hint" data-i18n="${hintKey}">`), hintKey);
    }

    // 取消與「離開隊伍」：這個對話框唯一的主要按鈕是「離開隊伍」（預設選的是保留，所以不會清掉東西）
    const cancel = tagAttrs(html, 'cancelLeaveBtn');
    const confirm = tagAttrs(html, 'confirmLeaveBtn');
    assert.deepEqual([cancel.type, classesOf(cancel), cancel['data-i18n']], ['button', ['btn'], 'treasure_map_cancel']);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-primary'], 'treasure_map_leave_room']);
    assert.equal((dialog.match(/\bbtn-primary\b/g) || []).length, 1);
});

test('移出成員對話框的標記：標題的字由程式填（帶名字）；內文與錯誤（role=alert、先藏起來）；取消與危險的「移出」，沒有主要按鈕；放在離開對話框後面、清空清單對話框前面，頁面替身照同一個順序掛', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'removeMemberModal');
    const overlay = tagAttrs(html, 'removeMemberModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'removeMemberModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '新的對話框不用舊的 .modal 那一套');
    const order = ['id="leaveRoomModal"', 'id="removeMemberModal"', 'id="clearListModal"'].map((s) => html.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `對話框的順序：${order}`);
    assert.ok(PANEL_IDS.indexOf('leaveRoomModal') + 1 === PANEL_IDS.indexOf('removeMemberModal') && PANEL_IDS.indexOf('removeMemberModal') + 1 === PANEL_IDS.indexOf('clearListModal'),
        'PANEL_IDS 少了 removeMemberModal，或順序和 index.html 不一樣');

    // 標題帶名字、內文帶張數，都由程式填，不掛 data-i18n（I18nManager 切換語言時會把它整個換掉）；先是空的
    const title = tagAttrs(html, 'removeMemberModal-title');
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], undefined]);
    assert.match(dialog, /<h3 class="dialog-title" id="removeMemberModal-title"><\/h3>/);
    const close = tagAttrs(html, 'closeRemoveModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);
    assert.deepEqual([tagAttrs(html, 'removeMemberBody')['data-i18n'], tagAttrs(html, 'removeMemberError')['data-i18n']], [undefined, undefined]);
    assert.match(dialog, /<p id="removeMemberBody"><\/p>/);
    const error = tagAttrs(html, 'removeMemberError');
    assert.deepEqual([classesOf(error), error.role], [['error-message', 'hidden'], 'alert']);
    assert.match(dialog, /<p class="error-message hidden" id="removeMemberError" role="alert"><\/p>/, '先是空的');
    assert.ok(dialog.indexOf('id="removeMemberBody"') < dialog.indexOf('id="removeMemberError"'));

    // 取消與「移出」：「移出」是危險按鈕，這個對話框沒有主要按鈕
    const cancel = tagAttrs(html, 'cancelRemoveBtn');
    const confirm = tagAttrs(html, 'confirmRemoveBtn');
    assert.deepEqual([cancel.type, classesOf(cancel), cancel['data-i18n']], ['button', ['btn'], 'treasure_map_cancel']);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-danger'], 'treasure_map_remove_member']);
    assert.doesNotMatch(dialog, /\bbtn-primary\b/);
});

test('改名對話框的標記：照頁內對話框的結構；label 對到欄位，欄位沒有 placeholder，說明接在欄下面並由 aria-describedby 指到；固定的字都掛 data-i18n；只有一顆主要按鈕；不用 .modal 那一套', () => {
    const html = read(`${TOOL_DIR}/index.html`);
    const dialog = sliceElementById(html, 'editNicknameModal');
    const overlay = tagAttrs(html, 'editNicknameModal');
    assert.deepEqual([classesOf(overlay), overlay.role, overlay['aria-modal'], overlay['aria-labelledby']], [['dialog-overlay', 'hidden'], 'dialog', 'true', 'editNicknameModal-title']);
    assert.match(dialog, /<div class="dialog tm-dialog">/);
    assert.doesNotMatch(dialog, /class="[^"]*\b(?:modal|modal-content|modal-body|modal-footer|input-field)\b/, '改寫的對話框不用舊的 .modal 那一套');

    const title = tagAttrs(html, 'editNicknameModal-title');
    assert.match(dialog, /<h3\b[^>]*\sid="editNicknameModal-title"/);
    assert.deepEqual([classesOf(title), title['data-i18n']], [['dialog-title'], 'treasure_map_rename_title']);
    const close = tagAttrs(html, 'closeNicknameModalBtn');
    assert.deepEqual([close.type, classesOf(close), close['aria-label'], close['data-i18n'], close['data-i18n-attr']], ['button', ['btn', 'btn-close'], '關閉', 'treasure_map_close', 'aria-label']);

    // 名字欄：label 用 for 對到它；一般的 .form-control，最多 20 字、不自動完成、說明用 aria-describedby 指到；不放 placeholder（欄裡本來就是目前的名字）
    const label = parseAttrs(dialog.match(/<label\b[^>]*>/)[0]);
    assert.deepEqual([classesOf(label), label.for, label['data-i18n']], [['form-label'], 'nicknameInput', 'treasure_map_nickname_label']);
    const input = tagAttrs(html, 'nicknameInput');
    assert.deepEqual([input.type, classesOf(input), input.maxlength, input.autocomplete, input['aria-describedby']], ['text', ['form-control'], '20', 'off', 'nicknameHint']);
    for (const absent of ['placeholder', 'data-i18n', 'data-i18n-attr']) assert.equal(input[absent], undefined, `名字欄不該有 ${absent}`);
    const hint = tagAttrs(html, 'nicknameHint');
    assert.deepEqual([classesOf(hint), hint['data-i18n']], [['form-text'], 'treasure_map_nickname_hint']);
    assert.match(dialog, /<p\b[^>]*\sid="nicknameHint"/);
    const order = ['<label', 'id="nicknameInput"', 'id="nicknameHint"'].map((s) => dialog.indexOf(s));
    assert.ok(!order.includes(-1) && order.every((at, index) => index === 0 || order[index - 1] < at), `內文的順序：${order}`);

    const cancel = tagAttrs(html, 'cancelNicknameBtn');
    const confirm = tagAttrs(html, 'confirmNicknameBtn');
    assert.deepEqual([cancel.type, classesOf(cancel), cancel['data-i18n']], ['button', ['btn'], 'treasure_map_cancel']);
    assert.deepEqual([confirm.type, classesOf(confirm), confirm['data-i18n']], ['button', ['btn', 'btn-primary'], 'treasure_map_confirm']);
    assert.equal((dialog.match(/\bbtn-primary\b/g) || []).length, 1);
    // 整頁不再有舊的 .modal 那一套（以 class 為單位比：map-detail-modal 是另一個 class）
    assert.doesNotMatch(html, /class="(?:[^"]*\s)?(?:modal|modal-content|modal-body|modal-footer|input-field)(?:\s[^"]*)?"/);
});

test('離開與移出交給 RoomDialogs：離開鈕呼叫 dialogs.openLeave()、移出鈕呼叫 dialogs.openRemove(那位成員)；room-collaboration.js 不再有舊的離開對話框，modals 只剩 editNickname', () => {
    const source = read(`${TOOL_DIR}/room-collaboration.js`);
    assert.match(source, /showLeaveRoomDialog\(\) \{\s*this\.dialogs\.openLeave\(\);\s*\}/);
    for (const gone of ['leaveKeepListBtn', 'leaveClearListBtn', 'closeLeaveModalBtn', 'cancelLeaveBtn', 'leaveRoomModal', "'leaveRoom'", 'leaveRoom:']) {
        assert.ok(!source.includes(gone), `room-collaboration.js 還有 ${gone}`);
    }
    assert.match(source, /this\.modals = \{\s*editNickname: document\.getElementById\('editNicknameModal'\)\s*\};/);
    const status = read(`${TOOL_DIR}/party-status.js`);
    assert.match(status, /collaboration\.dialogs\.openRemove\(target\)/);
    assert.ok(!status.includes('removeMember'), 'party-status.js 不再直接呼叫 removeMember');
    // 離開與移出的對話框在 RoomDialogs
    const dialogs = read(`${TOOL_DIR}/room-dialogs.js`);
    for (const id of ['leaveRoomModal', 'removeMemberModal', 'confirmLeaveBtn', 'confirmRemoveBtn']) assert.match(dialogs, new RegExp(`'${id}'`), id);
});

test('離開隊伍對話框的按鈕列放不下就換行（日文「パーティを抜ける」比「キャンセル」還長，320px 會把取消鈕擠出左邊，瀏覽器實測）：和建立隊伍共用一個 .tm-dialog-actions-wrap，加在 .dialog-actions 上，不是每個對話框一條 #…Modal .dialog-actions 的 id 規則；清空、匯入、分享的按鈕列不加；也不替這三個對話框設 display（它們用 .hidden 切換）', () => {
    const css = stripComments(read(`${TOOL_DIR}/style.css`));
    const html = read(`${TOOL_DIR}/index.html`);
    const { rules, bodyOf } = cssRules(css);
    // 共用的 class：單一 class、只設 flex-wrap（不用 !important、色碼，也不碰 display），寫在最後的 .hidden 前面
    assert.match(bodyOf('.tm-dialog-actions-wrap'), /flex-wrap:\s*wrap/);
    assert.doesNotMatch(bodyOf('.tm-dialog-actions-wrap'), /!important|#[0-9a-f]{3,8}\b|display\s*:/i);
    assert.ok(css.indexOf('.tm-dialog-actions-wrap {') < css.lastIndexOf('\n.hidden {'));
    // 建立與離開隊伍對話框的按鈕列帶這個 class；清空、匯入、分享的按鈕字短、放得下，不加
    for (const id of ['createPartyModal', 'leaveRoomModal']) assert.deepEqual(actionRowClasses(html, id), ['dialog-actions', 'tm-dialog-actions-wrap'], id);
    for (const id of ['clearListModal', 'importListModal', 'shareMapsModal']) assert.deepEqual(actionRowClasses(html, id), ['dialog-actions'], id);
    // 沒有 id 規則：樣式裡沒有任何 #…Modal …… .dialog-actions 的選擇器；整排 .tm-dialog 的按鈕列也不設規則（那會讓清單的對話框一起換行）
    for (const rule of rules) {
        for (const selector of rule.selectors) assert.doesNotMatch(selector, /#\w+Modal\b.*\.dialog-actions/, `${selector} 是 id 規則，改用 .tm-dialog-actions-wrap`);
    }
    assert.equal(bodyOf('.tm-dialog .dialog-actions'), '', '別的對話框的按鈕列不動');
    // 離開、移出、改名對話框用 .hidden 切換：不能有比單一 class 更高特異度的 display
    for (const rule of rules.filter((r) => /(?:^|[;\s])display\s*:/.test(r.body))) {
        for (const selector of rule.selectors.filter((s) => /leaveRoomModal|removeMemberModal|editNicknameModal/.test(s))) {
            assert.fail(`${selector} 設了 display，.hidden 會失效`);
        }
    }
});

// ---------- 頁面：真的 RoomCollaboration 接在清單面板上 ----------
// createPanelPage({ party }) 建立真的 RoomCollaboration，伺服器的回應由 respond(path, { method, body, authenticated }) 給：
// 回傳值就是回應，丟出的錯誤就是失敗；toast 收在 page.toasts（{ message, type }）。
// realisticFocus：按鈕一停用就失去焦點，停用的與藏起來的拿不到焦點，「連線中焦點掉到 body」才會發生在測試裡
const TOKEN = 'a'.repeat(64);
const member = { id: 'creator', nickname: 'Creator', isCreator: true };
const newMember = { id: 'joiner', nickname: 'Joiner' };
const room = (maps = [], members = [member], revision = 0) => ({ roomCode: 'ABC123', creatorId: member.id, members, treasureMaps: maps, revision, lastActivityAt: new Date().toISOString() });
const roomError = (status, code) => Object.assign(new Error(code), { status, code });
const createAndLeave = (path, { method }) => {
    if (path === '/rooms' && method === 'POST') return { ...room(), memberId: member.id, memberToken: TOKEN };
    if (path === '/rooms/ABC123/leave' && method === 'POST') return { message: 'Left' };
    throw new Error(`unexpected ${method} ${path}`);
};
const joinable = (path, { method = 'GET' }) => {
    if (path === '/rooms/ABC123' && method === 'GET') return room();
    if (path === '/rooms/ABC123/join' && method === 'POST') return { room: room([], [member, newMember]), newMember, memberToken: TOKEN };
    throw new Error(`unexpected ${method} ${path}`);
};

// 頁面建好、init() 排好的工作（掛事件、讀網址的 ?room=）都跑完
const createParty = async (respond, options = {}) => {
    const page = await createPanelPage({ party: { respond }, realisticFocus: true, ...options });
    await page.settle();
    return page;
};
const messages = (page) => page.toasts.map(({ message }) => message);
// 焦點應該在 #id 上；比身分、訊息只寫 id（assert.equal 直接比節點，失敗時會把整頁的 DOM 展開成訊息）
function assertFocusOn(page, id, message) {
    const actual = page.focused();
    assert.ok(actual === page.$(id), `${message}：焦點在 ${actual.id ? `#${actual.id}` : `<${actual.tagName.toLowerCase()}>`}，應該在 #${id}`);
}
// 建立、加入回傳的是 vm 裡建出來的物件：原型和測試端不同，assert.deepEqual 會失敗，先轉成測試端的物件
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- 建立、加入、離開之後的焦點 ----------
test('清單是空的：按建立隊伍直接建立，不開對話框，焦點到複製邀請連結（連線中「建立隊伍」停用、焦點退回 body）', async () => {
    const page = await createParty(createAndLeave);
    page.finder.handleListEntry('team');
    assertFocusOn(page, 'createRoomBtn', '按「組隊」打開面板');
    page.$('createRoomBtn').click();
    assert.ok(page.focused() === page.dom.document.body, '連線中「建立隊伍」停用，焦點當場退回 body');
    await page.settle();
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.$('teamActions').classList.contains('hidden'), true);
    assertFocusOn(page, 'copyInviteBtn', '建立成功');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
    // 清單是空的沒有東西可問：對話框一次都沒打開過
    assert.equal(page.client.dialogs.opening, 0);
    assert.equal(page.$('createPartyModal').classList.contains('hidden'), true);
    assert.ok(!page.$('createPartyModal').style.display, 'ModalManager 沒有把它顯示出來過');
});

test('清單是空的、建立失敗：焦點回到「建立隊伍」，訊息跳 toast（不開對話框）', async () => {
    const page = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
    page.finder.handleListEntry('team');
    page.$('createRoomBtn').click();
    await page.settle();
    assert.equal(page.client.currentRoom, null);
    assertFocusOn(page, 'createRoomBtn', '建立失敗');
    assert.deepEqual(messages(page), ['連不上隊伍伺服器，請稍後再試。'], '失敗的訊息是 createRoom() 回傳的');
    assert.equal(page.toasts[0].type, 'error');
    assert.equal(page.client.dialogs.opening, 0);
});

test('加入隊伍成功：焦點移到「複製邀請連結」；失敗（找不到）：對話框不關，焦點在代號欄，訊息寫在欄下面、不跳 toast', async () => {
    const notFound = '找不到隊伍 ABC123。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。';
    for (const [respond, expected] of [[joinable, 'copyInviteBtn'], [() => { throw roomError(404, 'ROOM_NOT_FOUND'); }, 'roomCodeInput']]) {
        const page = await createParty(respond);
        page.$('roomCodeInput').select = () => {}; // fake-dom 的 input 沒有 select()
        page.finder.openListPanel();
        page.$('joinRoomBtn').focus();
        page.$('joinRoomBtn').click();
        assertFocusOn(page, 'roomCodeInput', '打開加入隊伍對話框');
        page.$('roomCodeInput').value = 'abc123';
        page.$('confirmJoinBtn').focus();
        page.$('confirmJoinBtn').click();
        await page.settle();
        const joined = expected === 'copyInviteBtn';
        assert.equal(page.client.currentRoom?.roomCode ?? null, joined ? 'ABC123' : null);
        assertFocusOn(page, expected, joined ? '加入成功' : '加入失敗');
        assert.deepEqual(messages(page), joined ? ['已加入隊伍 ABC123'] : []);
        assert.equal(page.client.dialogs.modalManager.activeModal === page.$('joinRoomModal'), !joined, joined ? '加入成功：對話框關掉' : '加入失敗：對話框還開著');
        assert.equal(page.$('roomCodeError').textContent, joined ? '' : notFound);
    }
});

test('createRoom()、joinRoom() 自己不移動焦點，也不跳錯誤訊息：結束後的焦點與訊息是呼叫的人的事', async () => {
    const created = await createParty(createAndLeave);
    created.finder.handleListEntry('team');
    assert.deepEqual(plain(await created.client.createRoom()), { success: true });
    assert.equal(created.client.currentRoom.roomCode, 'ABC123');
    assert.ok(created.focused() === created.dom.document.body, '成功了，焦點還在連線中退回的 body，沒有被移到「複製邀請連結」');
    assert.deepEqual(messages(created), ['隊伍 ABC123 建立成功！']);

    const failed = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
    failed.finder.handleListEntry('team');
    assert.equal((await failed.client.createRoom()).success, false);
    assert.ok(failed.focused() === failed.dom.document.body, '失敗了，焦點也沒有被放回「建立隊伍」');
    assert.deepEqual(failed.toasts, []);

    const missing = await createParty(() => { throw roomError(404, 'ROOM_NOT_FOUND'); });
    missing.finder.openListPanel();
    missing.$('joinRoomBtn').focus();
    assert.equal((await missing.client.joinRoom('ABC123')).kind, 'not_found');
    assert.ok(missing.focused() === missing.dom.document.body);
    assert.deepEqual(missing.toasts, []);
});

test('離開隊伍（保留或清空清單）：焦點回到又出現的「建立隊伍」，不是已經藏起來的離開鈕', async () => {
    for (const keepList of [true, false]) {
        const page = await createParty(createAndLeave);
        page.finder.handleListEntry('team');
        await page.client.createRoom();
        page.$('leaveRoomBtn').focus();
        page.$('leaveRoomBtn').click();
        // 對話框裡勾保留或清空（只看「清空」那顆），按確認鈕：它停用之前焦點先移到 ✕
        page.$('leaveModeClear').checked = !keepList;
        page.$('confirmLeaveBtn').focus();
        page.$('confirmLeaveBtn').click();
        await page.settle();
        assert.equal(page.client.currentRoom, null);
        assert.equal(page.$('leaveRoomModal').classList.contains('hidden'), true);
        assert.equal(page.$('roomSection').classList.contains('hidden'), true, '離開了：隊伍狀態藏起來');
        assertFocusOn(page, 'createRoomBtn', keepList ? '留在我的清單' : '清空');
    }
});

// 用網址 ?room= 打開的邀請連結（先問「加入隊伍 X？」，按加入之後打開清單面板）的焦點，在最後面「邀請連結」那一段

// ---------- 建立隊伍：清單是空的直接建立，不是空的先問帶不帶 ----------
// 清單裡放兩張目錄裡的寶圖（tm_017 科扎馬烏卡、tm_007 烏爾科帕恰）
const TWO = ['tm_017', 'tm_007'];
const isHidden = (page, id) => page.$(id).classList.contains('hidden');
// 伺服器替身：建立隊伍時把送來的 initialMaps 收進隊伍（addedBy 是自己），並記下每一次的請求
const echoCreates = () => {
    const requests = [];
    return {
        requests,
        respond: (path, options) => {
            requests.push({ path, ...options });
            if (path === '/rooms' && options.method === 'POST') {
                const maps = options.body.initialMaps.map((map) => ({ ...map, addedBy: member.id, addedAt: new Date().toISOString() }));
                return { ...room(maps), memberId: member.id, memberToken: TOKEN };
            }
            throw new Error(`unexpected ${options.method} ${path}`);
        }
    };
};
// 伺服器的回應卡住，直到 release()；sent 是每個送出的請求的 clientRequestId
const holdResponse = (respond) => {
    const sent = [];
    let release;
    const released = new Promise((resolve) => { release = resolve; });
    return { sent, release, respond: async (path, options) => { sent.push(options.body?.clientRequestId); await released; return respond(path, options); } };
};
// 建立隊伍的對話框現在開著嗎（ModalManager 認得它，而且看得到）
const createOpen = (page) => page.client.dialogs.modalManager.activeModal === page.$('createPartyModal') && !isHidden(page, 'createPartyModal');
// 打開面板、焦點在「建立隊伍」上、按下去
const pressCreate = (page) => {
    page.finder.openListPanel();
    page.$('createRoomBtn').focus();
    page.$('createRoomBtn').click();
};
// 選「帶進」或「不帶」：fake-dom 的 radio 不會互斥，兩顆都照瀏覽器設好，再在選到的那顆上送 change（prefix 是 'create' 或 'join'）
const chooseMode = (page, mode, prefix = 'create') => {
    page.$(`${prefix}ModeBring`).checked = mode === 'bring';
    page.$(`${prefix}ModeClear`).checked = mode === 'clear';
    page.$(`${prefix}Mode${mode === 'bring' ? 'Bring' : 'Clear'}`).dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
};
// 玩家按「建立隊伍」：焦點在那顆鈕上（連線中它停用，停用之前焦點先移到 ✕），等連線結束
const pressConfirm = async (page) => {
    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    await page.settle();
};
// 對話框裡會因為連線中而停用的控制項，依序是 [帶進, 不帶, 建立隊伍, 取消, ✕]：取消與 ✕ 連線中還能按
const CREATE_CONTROLS = ['createModeBring', 'createModeClear', 'confirmCreateBtn', 'cancelCreateBtn', 'closeCreateModalBtn'];
const disabledOf = (page) => CREATE_CONTROLS.map((id) => page.$(id).disabled);
const NETWORK_ERROR = '連不上隊伍伺服器，請稍後再試。';

test('清單 2 張：對話框寫「你的清單有 2 張寶圖：」、兩列迷你清單、預設勾帶進；按建立隊伍 → initialMaps 2 張、清單還在、對話框關掉、焦點到複製邀請連結', async () => {
    const server = echoCreates();
    const page = await createParty(server.respond);
    page.addMaps(TWO);
    assert.ok(page.client.dialogs instanceof page.dom.window.RoomDialogs, 'RoomCollaboration 建構時建立 RoomDialogs');
    pressCreate(page);

    assert.ok(createOpen(page), '清單不是空的：開對話框，還沒送出任何請求');
    assert.deepEqual(server.requests, []);
    const text = (id) => page.$(id).textContent;
    assert.equal(text('createPartyModal-title'), '建立隊伍');
    assert.equal(text('createPartyLede'), '你的清單有 2 張寶圖：');
    const rows = page.$('createPartyList').children;
    assert.deepEqual(rows.map((row) => row.className), ['tm-mini', 'tm-mini']);
    assert.deepEqual(rows.map((row) => row.textContent), ['G17 科扎馬烏卡 (20.0, 6.9)', 'G17 烏爾科帕恰 (13.7, 14.2)']);
    assert.equal(page.$('createPartyChoice').querySelector('legend').textContent, '你的寶圖要怎麼處理');
    assert.deepEqual(['createModeBringTitle', 'createModeBringHint', 'createModeClearTitle', 'createModeClearHint'].map(text),
        ['帶進隊伍清單', '隊友也看得到，會標成你的圖', '不帶，清空這 2 張', '隊伍清單從空的開始']);
    assert.deepEqual([page.$('createModeBring').checked, page.$('createModeClear').checked], [true, false], '預設帶進');
    assert.deepEqual([isHidden(page, 'createPartyNote'), isHidden(page, 'createPartyError')], [true, true]);
    assert.deepEqual(disabledOf(page), [false, false, false, false, false]);

    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    // 連線中：選項與確認鈕停用（取消與 ✕ 還能按），確認鈕轉圈；成功之前對話框不關
    assert.deepEqual(disabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmCreateBtn').classList.contains('btn-loading'), true);
    assert.ok(createOpen(page));
    // 停用拿著焦點的確認鈕，Chrome 當場把焦點退回 body；ModalManager 的焦點陷阱只在頭尾循環，這時按 Tab 會跑出對話框。所以停用之前先移到 ✕
    assertFocusOn(page, 'closeCreateModalBtn', '確認鈕停用之前焦點先移到 ✕');
    await page.settle();

    assert.equal(server.requests.length, 1);
    assert.deepEqual(plain(server.requests[0].body.initialMaps.map((map) => map.id)), TWO);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(plain(Array.from(page.finder.listManager.getList(), (map) => map.id)), TWO, '帶進去：清單還在');
    assert.equal(createOpen(page), false);
    assert.deepEqual([page.$('createPartyModal').classList.contains('hidden'), page.$('createPartyModal').style.display], [true, '']);
    assert.deepEqual(disabledOf(page), [false, false, false, false, false], '下次打開不會卡在連線中');
    assert.equal(page.$('confirmCreateBtn').classList.contains('btn-loading'), false);
    assertFocusOn(page, 'copyInviteBtn', '建立成功');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
    assert.equal(page.client.dialogs.opening, 2, '打開一次、關閉一次');
});

test('選不帶：initialMaps 是空的，建好後清單是空的（決定只看「不帶」那顆有沒有勾）', async () => {
    const server = echoCreates();
    const page = await createParty(server.respond);
    page.addMaps(TWO);
    pressCreate(page);
    // fake-dom 的 radio 不會互斥：只勾「不帶」，「帶進」那顆還勾著
    page.$('createModeClear').checked = true;
    page.$('createModeClear').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    await pressConfirm(page);

    assert.equal(server.requests.length, 1);
    assert.deepEqual(plain(server.requests[0].body.initialMaps), []);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.finder.listManager.getLength(), 0, '不帶：清單隨隊伍清單，是空的');
    assert.equal(createOpen(page), false);
    assertFocusOn(page, 'copyInviteBtn', '建立成功');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
});

test('清單 9 張：帶進停用、兩個都沒勾、說明顯示、建立隊伍停用；勾了不帶才能按（預設不能是不帶，那會清掉玩家的寶圖）；剛好 8 張還放得下', async () => {
    const server = echoCreates();
    const page = await createParty(server.respond);
    page.addMaps(page.finder.maps.slice(0, 9).map((map) => map.id));
    assert.equal(page.finder.listManager.getLength(), 9);
    pressCreate(page);

    assert.ok(createOpen(page));
    assert.equal(page.$('createPartyLede').textContent, '你的清單有 9 張寶圖：');
    assert.equal(page.$('createPartyList').children.length, 9);
    assert.deepEqual([page.$('createModeBring').disabled, page.$('createModeClear').disabled], [true, false]);
    assert.deepEqual([page.$('createModeBring').checked, page.$('createModeClear').checked], [false, false], '兩個都不預先勾');
    assert.equal(page.$('createModeClearTitle').textContent, '不帶，清空這 9 張');
    assert.equal(isHidden(page, 'createPartyNote'), false);
    assert.equal(page.$('createPartyNote').textContent, '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。');
    assert.equal(page.$('confirmCreateBtn').disabled, true);

    // 停用的確認鈕不接受：Enter 或程式直接呼叫也不會建立、不會動清單、不會冒出錯誤
    await page.client.dialogs.confirmCreate();
    assert.deepEqual(server.requests, []);
    assert.equal(page.finder.listManager.getLength(), 9);
    assert.equal(isHidden(page, 'createPartyError'), true);

    // 勾了不帶才能按；清單還是 9 張，帶進還是停用，提醒還在
    chooseMode(page, 'clear');
    assert.deepEqual([page.$('confirmCreateBtn').disabled, page.$('createModeBring').disabled, isHidden(page, 'createPartyNote')], [false, true, false]);
    await pressConfirm(page);
    assert.equal(server.requests.length, 1);
    assert.deepEqual(plain(server.requests[0].body.initialMaps), []);
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.equal(createOpen(page), false);
    assertFocusOn(page, 'copyInviteBtn', '勾了不帶之後建立成功');

    // 剛好 8 張：還不算超過，照常預設帶進
    const eight = await createParty(server.respond);
    eight.addMaps(eight.finder.maps.slice(0, 8).map((map) => map.id));
    pressCreate(eight);
    assert.deepEqual([eight.$('createModeBring').disabled, eight.$('createModeBring').checked, eight.$('createModeClear').checked,
        isHidden(eight, 'createPartyNote'), eight.$('confirmCreateBtn').disabled], [false, true, false, true, false]);
});

test('伺服器錯誤：對話框不關，錯誤寫在對話框裡（503 是連不上、400 是建立失敗），不跳 toast；選項與按鈕恢復，焦點回到「建立隊伍」鈕', async () => {
    for (const [status, message] of [[503, NETWORK_ERROR], [400, '建立失敗，請再試一次。']]) {
        const page = await createParty(() => { throw roomError(status, 'FAILED'); });
        page.addMaps(TWO);
        pressCreate(page);
        await pressConfirm(page);

        assert.ok(createOpen(page), `${status}：對話框不關`);
        assert.equal(isHidden(page, 'createPartyError'), false, status);
        assert.equal(page.$('createPartyError').textContent, message, status);
        assert.deepEqual(page.toasts, [], `${status}：錯誤在對話框裡，不跳 toast`);
        assert.equal(page.client.currentRoom, null, status);
        assert.deepEqual(disabledOf(page), [false, false, false, false, false], `${status}：可以再按`);
        assert.equal(page.$('confirmCreateBtn').classList.contains('btn-loading'), false, status);
        assertFocusOn(page, 'confirmCreateBtn', `${status}：連線中焦點在 ✕，失敗之後放回確認鈕`);
        assert.equal(page.finder.listManager.getLength(), 2, `${status}：清單沒動`);
    }
});

test('連線中玩家自己把焦點從 ✕ 移到「取消」：失敗之後焦點留在「取消」，不會被拉回確認鈕（焦點還停在 ✕ 時才放回去）', async () => {
    const held = holdResponse(() => { throw roomError(503, 'UNAVAILABLE'); });
    const page = await createParty(held.respond);
    page.addMaps(TWO);
    pressCreate(page);
    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    assertFocusOn(page, 'closeCreateModalBtn', '連線中焦點在 ✕');
    page.$('cancelCreateBtn').focus();
    held.release();
    await page.settle();

    assert.equal(page.$('createPartyError').textContent, NETWORK_ERROR);
    assertFocusOn(page, 'cancelCreateBtn', '玩家自己移開的焦點不動');
});

test('伺服器暫時連不上（503）：再按一次送同一個 clientRequestId，成功就進隊伍、錯誤收起來、對話框關掉', async () => {
    const server = echoCreates();
    const ids = [];
    const page = await createParty((path, options) => {
        ids.push(options.body.clientRequestId);
        if (ids.length === 1) throw roomError(503, 'UNAVAILABLE');
        return server.respond(path, options);
    });
    page.addMaps(TWO);
    pressCreate(page);
    await pressConfirm(page);
    assert.equal(page.$('createPartyError').textContent, NETWORK_ERROR);
    assert.ok(createOpen(page));

    await pressConfirm(page);
    assert.equal(ids.length, 2);
    assert.match(ids[0], /^[a-f0-9-]{36}$/);
    assert.equal(ids[1], ids[0], '重試帶同一個 clientRequestId：第一次可能已經成功、只是回應掉了');
    assert.equal(createOpen(page), false);
    assert.deepEqual([isHidden(page, 'createPartyError'), page.$('createPartyError').textContent], [true, ''], '成功之後沒有舊的錯誤留著');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
    assertFocusOn(page, 'copyInviteBtn', '重試成功');
});

test('連線途中自己關掉對話框：成功照樣進隊伍（不用再關一次），焦點到複製邀請連結；連線中再按建立隊伍只送一個請求', async () => {
    const server = echoCreates();
    const held = holdResponse(server.respond);
    const page = await createParty(held.respond);
    page.addMaps(TWO);
    pressCreate(page);
    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    page.$('confirmCreateBtn').click();
    assert.equal(held.sent.length, 1, '連線中確認鈕停用，再按不會再送一次');
    assert.deepEqual(disabledOf(page), [true, true, true, false, false]);

    page.key('Escape');
    assert.equal(createOpen(page), false, '連線中也關得掉');
    assert.equal(page.client.currentRoom, null, '還沒連上');
    held.release();
    await page.settle();

    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(createOpen(page), false);
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
    assertFocusOn(page, 'copyInviteBtn', '連線途中關掉對話框，成功之後');
    assert.deepEqual(disabledOf(page), [false, false, false, false, false], '關掉的對話框也恢復了');
    assert.equal(page.$('confirmCreateBtn').classList.contains('btn-loading'), false);
});

test('連線途中自己關掉對話框：失敗改成 toast（不寫進已經關掉的對話框），焦點回到「建立隊伍」', async () => {
    const held = holdResponse(() => { throw roomError(503, 'UNAVAILABLE'); });
    const page = await createParty(held.respond);
    page.addMaps(TWO);
    pressCreate(page);
    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    page.key('Escape');
    assert.equal(createOpen(page), false);
    held.release();
    await page.settle();

    assert.equal(page.client.currentRoom, null);
    assert.deepEqual(page.toasts, [{ message: NETWORK_ERROR, type: 'error' }]);
    assert.deepEqual([isHidden(page, 'createPartyError'), page.$('createPartyError').textContent], [true, ''], '關掉的對話框裡沒有錯誤');
    assert.equal(createOpen(page), false);
    assertFocusOn(page, 'createRoomBtn', '失敗，對話框早就關了');
    assert.deepEqual(disabledOf(page), [false, false, false, false, false]);
    assert.equal(page.finder.listManager.getLength(), 2, '清單沒動');
});

test('連線中切換語言：選項與確認鈕還是停用（重畫不能把它們解開，解開了就可以按第二次），連線結束後照常收尾', async () => {
    const server = echoCreates();
    const held = holdResponse(server.respond);
    const page = await createParty(held.respond);
    page.addMaps(TWO);
    pressCreate(page);
    page.$('confirmCreateBtn').focus();
    page.$('confirmCreateBtn').click();
    page.setLang('en');
    assert.deepEqual(disabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmCreateBtn').classList.contains('btn-loading'), true);
    held.release();
    await page.settle();
    assert.equal(held.sent.length, 1);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(createOpen(page), false);
    assert.deepEqual(disabledOf(page), [false, false, false, false, false]);
});

test('已經在隊伍裡、正在連線、或對話框已經開著時，openCreate() 什麼都不做；開著的對話框不會被重設', async () => {
    const page = await createParty(echoCreates().respond);
    page.addMaps(TWO);
    pressCreate(page);
    chooseMode(page, 'clear');
    await page.client.dialogs.openCreate();
    assert.deepEqual([page.$('createModeClear').checked, page.client.dialogs.opening], [true, 1], '玩家勾的選項還在，也沒有白白多算一次打開');
    page.key('Escape');

    page.client.isConnecting = true;
    await page.client.dialogs.openCreate();
    assert.equal(createOpen(page), false, '連線中不開');
    page.client.isConnecting = false;

    await page.client.createRoom();
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    const opening = page.client.dialogs.opening;
    await page.client.dialogs.openCreate();
    assert.deepEqual([createOpen(page), page.client.dialogs.opening], [false, opening], '已經在隊伍裡不開');
});

test('取消、✕、Escape 都關掉對話框：不建立、不動清單，焦點回到「建立隊伍」；再打開是乾淨的（預設帶進、沒有舊的錯誤）', async () => {
    const closers = {
        取消: (page) => page.$('cancelCreateBtn').click(),
        '✕': (page) => page.$('closeCreateModalBtn').click(),
        Escape: (page) => page.key('Escape')
    };
    for (const [label, close] of Object.entries(closers)) {
        const page = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
        page.addMaps(TWO);
        pressCreate(page);
        // 先弄髒：選不帶、按建立 → 失敗，錯誤留在對話框裡
        chooseMode(page, 'clear');
        await pressConfirm(page);
        assert.equal(isHidden(page, 'createPartyError'), false, label);

        close(page);
        assert.equal(createOpen(page), false, label);
        assert.deepEqual([page.$('createPartyModal').classList.contains('hidden'), page.$('createPartyModal').style.display], [true, ''], label);
        assertFocusOn(page, 'createRoomBtn', `${label}：焦點回到按下去的那一顆`);
        assert.equal(page.client.currentRoom, null, label);
        assert.equal(page.finder.listManager.getLength(), 2, label);

        page.$('createRoomBtn').click();
        assert.ok(createOpen(page), label);
        assert.deepEqual([page.$('createModeBring').checked, page.$('createModeClear').checked], [true, false], `${label}：預設帶進`);
        assert.deepEqual([isHidden(page, 'createPartyError'), page.$('createPartyError').textContent], [true, ''], `${label}：舊的錯誤不見了`);
        assert.equal(page.client.dialogs.opening, 3, label);
    }
});

test('清單裡有隊伍收不下的寶圖（以前匯入、id 有空白），選帶進：不送請求，錯誤寫在對話框裡；改選不帶，錯誤收起來，建得起來（Review Focus 4）', async () => {
    const server = echoCreates();
    const page = await createParty(server.respond);
    page.addMaps(['tm_017']);
    page.finder.listManager.add({ id: 'bad id', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } });
    pressCreate(page);
    assert.equal(page.$('createPartyLede').textContent, '你的清單有 2 張寶圖：');
    assert.equal(page.$('createPartyList').children[1].textContent, 'G8 Test (10.0, 20.0)');

    await pressConfirm(page);
    assert.deepEqual(server.requests, [], '帶進會被隊伍拒絕，所以一個請求都不送');
    assert.ok(createOpen(page));
    assert.equal(page.$('createPartyError').textContent, '你的清單裡有隊伍不支援的寶圖。選「不帶」，或先把它們刪掉。');
    assert.equal(isHidden(page, 'createPartyError'), false);
    assert.equal(page.finder.listManager.getLength(), 2);

    chooseMode(page, 'clear');
    assert.deepEqual([isHidden(page, 'createPartyError'), page.$('createPartyError').textContent], [true, ''], '照錯誤的建議改選不帶，舊的錯誤不再適用');
    await pressConfirm(page);
    assert.equal(server.requests.length, 1);
    assert.deepEqual(plain(server.requests[0].body.initialMaps), []);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.finder.listManager.getLength(), 0);
});

test('對話框開著時切到英文（Review Focus 5）：說明與兩個選項重畫成英文、迷你清單換地名、玩家勾的選項不動；顯示中的中文錯誤收起來；再按一次錯誤用英文重新產生', async () => {
    const page = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
    page.addMaps(TWO);
    pressCreate(page);
    chooseMode(page, 'clear');
    await pressConfirm(page);
    assert.equal(page.$('createPartyError').textContent, NETWORK_ERROR);
    assert.equal(isHidden(page, 'createPartyError'), false);
    const lede = page.$('createPartyLede').firstChild;
    const rows = [...page.$('createPartyList').children];

    page.setLang('en');
    assert.deepEqual([isHidden(page, 'createPartyError'), page.$('createPartyError').textContent], [true, ''], '中文的錯誤收起來');
    assert.equal(page.$('createPartyLede').textContent, 'Maps in your list: 2');
    assert.deepEqual(['createModeBringTitle', 'createModeBringHint', 'createModeClearTitle', 'createModeClearHint'].map((id) => page.$(id).textContent),
        ['Bring them into the party list', 'Your party sees them too, marked as yours', "Don't bring them — clear your list (2)", 'The party list starts empty']);
    assert.deepEqual(page.$('createPartyList').children.map((row) => row.textContent), ["G17 Kozama'uka (20.0, 6.9)", 'G17 Urqopacha (13.7, 14.2)']);
    assert.ok(page.$('createPartyList').children.every((row, index) => row !== rows[index]), '地名是語言的字，迷你清單重建');
    assert.equal(page.$('createPartyLede').firstChild !== lede, true);
    // 由 [data-i18n] 換的固定字也跟著換
    assert.deepEqual(['createPartyModal-title', 'confirmCreateBtn', 'cancelCreateBtn'].map((id) => page.$(id).textContent), ['Create a party', 'Create party', 'Cancel']);
    assert.equal(page.$('createPartyChoice').querySelector('legend').textContent, 'What to do with your maps');
    // 玩家已經勾的「不帶」不動，對話框還開著、可以按
    assert.deepEqual([page.$('createModeClear').checked, createOpen(page), page.$('confirmCreateBtn').disabled], [true, true, false]);
    // 內容沒變時重畫不重寫：同一個文字節點、同一批迷你清單的列
    const settled = { lede: page.$('createPartyLede').firstChild, rows: [...page.$('createPartyList').children] };
    page.client.dialogs.refresh();
    assert.ok(page.$('createPartyLede').firstChild === settled.lede);
    assert.ok(page.$('createPartyList').children.every((row, index) => row === settled.rows[index]));

    await pressConfirm(page);
    assert.equal(page.$('createPartyError').textContent, "Can't reach the party server. Please try again later.");
    page.setLang('ja');
    assert.equal(isHidden(page, 'createPartyError'), true);
    assert.equal(page.$('createPartyLede').textContent, 'あなたのリストには地図が 2 枚あります：');
    assert.deepEqual(['createModeBringTitle', 'createModeBringHint', 'createModeClearTitle', 'createModeClearHint'].map((id) => page.$(id).textContent),
        ['パーティリストに持ち込む', 'メンバーにも表示され、あなたの地図として表示されます', '持ち込まない（2 枚を消す）', 'パーティリストは空から始まります']);
    assert.equal(page.$('createModeClear').checked, true);
});

test('renderChoice 是建立、加入、邀請連結共用的：兩個選項的說明由呼叫的對話框給；清單是空的整塊藏起來；重畫時玩家勾的不動，只修「停用了還勾著」與「超過上限的兩個都沒勾、回到上限內」', async () => {
    const page = await createParty(echoCreates().respond);
    const { dialogs } = page.client;
    const render = (options) => dialogs.renderChoice('create', { bringHint: '帶進的說明', clearHint: '不帶的說明', overLimit: false, reset: false, ...options });
    const state = () => ({
        bring: [page.$('createModeBring').checked, page.$('createModeBring').disabled],
        clear: page.$('createModeClear').checked,
        confirmDisabled: page.$('confirmCreateBtn').disabled,
        noteHidden: isHidden(page, 'createPartyNote')
    });

    // 清單是空的：說明、迷你清單與單選整塊藏起來；有東西再顯示
    const blocks = () => ['createPartyLede', 'createPartyList', 'createPartyChoice'].map((id) => isHidden(page, id));
    render({ count: 0, reset: true });
    assert.deepEqual(blocks(), [true, true, true]);
    page.addMaps(TWO);
    render({ count: 2, reset: true });
    assert.deepEqual(blocks(), [false, false, false]);
    assert.deepEqual(['createModeBringHint', 'createModeClearHint'].map((id) => page.$(id).textContent), ['帶進的說明', '不帶的說明']);
    assert.deepEqual(state(), { bring: [true, false], clear: false, confirmDisabled: false, noteHidden: true });

    // 勾著「不帶」重畫：超過上限與否都留著；超過上限時「帶進」停用、提醒出現，確認鈕因為選了「不帶」可以按
    page.$('createModeClear').checked = true;
    page.$('createModeBring').checked = false;
    render({ count: 9, overLimit: true });
    assert.deepEqual(state(), { bring: [false, true], clear: true, confirmDisabled: false, noteHidden: false });
    render({ count: 2 });
    assert.deepEqual(state(), { bring: [false, false], clear: true, confirmDisabled: false, noteHidden: true });

    // 「帶進」勾著、清單變成超過上限：它不能停用了還勾著，確認鈕要等選了「不帶」
    page.$('createModeClear').checked = false;
    page.$('createModeBring').checked = true;
    render({ count: 9, overLimit: true });
    assert.deepEqual(state(), { bring: [false, true], clear: false, confirmDisabled: true, noteHidden: false });
    // 超過上限的兩個都沒勾，清單又縮回上限內：回到預設的「帶進」
    render({ count: 2 });
    assert.deepEqual(state(), { bring: [true, false], clear: false, confirmDisabled: false, noteHidden: true });
    // 剛打開（reset）：「不帶」勾著也回到預設
    page.$('createModeClear').checked = true;
    render({ count: 2, reset: true });
    assert.deepEqual(state(), { bring: [true, false], clear: false, confirmDisabled: false, noteHidden: true });
});

test('對話框關著時切換語言什麼都不做；之後打開就是目前語言的字', async () => {
    const page = await createParty(() => { throw new Error('不該送請求'); });
    page.addMaps(TWO);
    page.setLang('en');
    assert.equal(createOpen(page), false);
    assert.equal(page.$('createPartyLede').textContent, '', '沒開著的對話框不重畫');
    pressCreate(page);
    assert.equal(page.$('createPartyLede').textContent, 'Maps in your list: 2');
    assert.equal(page.$('createModeClearTitle').textContent, "Don't bring them — clear your list (2)");
    assert.equal(page.$('createPartyList').children[0].textContent, "G17 Kozama'uka (20.0, 6.9)");
});

// ---------- 隊伍狀態的畫面 ----------
// 隊員（joinedAt 決定其餘成員的順序）與隊伍裡的一張寶圖（addedBy 是誰加的）
const ME = { id: 'me', nickname: '光之戰士K7Q', joinedAt: '2026-10-17T00:00:00.000Z' };
const M4X = { id: 'm4x', nickname: '光之戰士M4X', joinedAt: '2026-10-17T00:01:00.000Z' };
const R6V = { id: 'r6v', nickname: '光之戰士R6V', joinedAt: '2026-10-17T00:02:00.000Z' };
const serverMap = (id, addedBy) => ({ id, type: 'g8', x: 10, y: 20, zone: 'Test', addedBy, addedAt: '2026-10-17T00:00:00.000Z' });

// 伺服器替身：建立時隊伍裡只有送來的名字那一位（自己，也是隊長）
const creates = (path, { method, body }) => {
    if (path === '/rooms' && method === 'POST') {
        const me = { ...ME, nickname: body.memberNickname };
        return { ...room([], [me]), creatorId: me.id, memberId: me.id, memberToken: TOKEN };
    }
    throw new Error(`unexpected ${method} ${path}`);
};
// 伺服器替身：已經有人的隊伍（隊長是 creatorId，不一定還在 members 裡）；加入時把送來的名字加成最後一位成員
const joinsParty = ({ creatorId, members, treasureMaps = [] }) => (path, { method = 'GET', body }) => {
    const base = { roomCode: 'ABC123', creatorId, treasureMaps, revision: 1, lastActivityAt: new Date().toISOString() };
    if (path === '/rooms/ABC123' && method === 'GET') return { ...base, members };
    if (path === '/rooms/ABC123/join' && method === 'POST') {
        const joined = { id: 'me', nickname: body.memberNickname, joinedAt: '2026-10-17T00:03:00.000Z' };
        return { room: { ...base, members: [...members, joined] }, newMember: joined, memberToken: TOKEN };
    }
    throw new Error(`unexpected ${method} ${path}`);
};
// 自己建立隊伍之後，隊友隨後的變動（加入、離開、改名、加圖）：換上新的隊伍資料，revision 加一，同輪詢收到新資料
const serverChanges = (page, changes) => {
    const { currentRoom } = page.client;
    page.client.mapSync.receive({ ...currentRoom, ...changes, revision: currentRoom.revision + 1 });
};
// respond 是伺服器替身（預設只會建立）；其餘的選項交給 createParty()
const createdParty = async ({ respond = creates, ...options } = {}) => {
    const page = await createParty(respond, { stored: { ff14tw_nickname_tag: 'K7Q' }, ...options });
    const result = await page.client.createRoom();
    assert.equal(result.success, true);
    return page;
};
// 自己是隊長、隊友 M4X 與 R6V 在隊伍裡：自己 2 張、M4X 1 張、R6V 0 張，還有 1 張是已經離開的人加的。面板打開
const crowdedParty = async (options) => {
    const page = await createdParty(options);
    page.finder.openListPanel();
    serverChanges(page, {
        members: [ME, M4X, R6V],
        treasureMaps: [serverMap('map_1', 'me'), serverMap('map_2', 'me'), serverMap('map_3', 'm4x'), serverMap('map_4', 'gone')]
    });
    return page;
};
const expand = (page) => page.$('membersToggle').click();
const rows = (page) => [...page.$('membersList').children];
const classNames = (element) => element.className.split(/\s+/).filter(Boolean);
const rowOf = (page, id) => rows(page).find((row) => row.dataset.memberId === id);
const buttonOf = (page, id, action) => rowOf(page, id).querySelector(`button[data-action="${action}"]`);
// 一列的內容：名字、隊長與你的標籤、張數、按鈕（class 與文字）
const describeRow = (row) => row.children.map((child) => `${classNames(child).filter((name) => name !== 'btn' && name !== 'btn-sm').join('.')}:${child.textContent}`);

test('建立之後：代號、「已同步」、「成員 1/8」與「光之戰士K7Q（你）」；#teamActions 藏起來', async () => {
    const page = await createParty(creates, { stored: { ff14tw_nickname_tag: 'K7Q' } });
    assert.equal(page.$('roomSection').classList.contains('hidden'), true, '還沒進隊伍');
    assert.equal(page.$('teamActions').classList.contains('hidden'), false);

    assert.equal((await page.client.createRoom()).success, true);
    assert.equal(page.$('roomSection').classList.contains('hidden'), false);
    assert.deepEqual(['roomCode', 'partySyncText', 'membersCount', 'membersNames'].map((id) => page.$(id).textContent),
        ['ABC123', '已同步', '成員 1/8', '光之戰士K7Q（你）']);
    assert.equal(page.$('partySyncNote').classList.contains('hidden'), true);
    assert.equal(page.$('teamActions').classList.contains('hidden'), true);
    // 成員先收合
    assert.deepEqual([page.$('membersToggle').getAttribute('aria-expanded'), page.$('membersChevron').textContent, page.$('membersPanel').classList.contains('hidden')],
        ['false', '▸', true]);
    // 固定的字（標籤、按鈕、說明）
    assert.equal(page.$('roomSection').querySelector('.tm-team-code').textContent, '隊伍代號 ABC123');
    assert.deepEqual(['copyInviteBtn', 'copyRoomCodeBtn', 'leaveRoomBtn'].map((id) => page.$(id).textContent.trim()), ['🔗 複製邀請連結', '複製代號', '離開隊伍']);
    assert.equal(page.$('roomSection').querySelector('.tm-team-note').textContent, '隊伍 24 小時沒有動靜會自動解散。');
    assert.equal(page.$('roomSection').getAttribute('aria-label'), '隊伍');
});

test('展開成員：每人一列，隊長／你標籤、addedBy 算出的張數、自己那列有改名、隊長才看得到別人那列的移出（名稱「把 光之戰士M4X 移出隊伍」）；展開時名字那一行是空的，收合時接著寫', async () => {
    const page = await crowdedParty();
    // 收合：成員一行寫名字，順序是隊長（自己）、其餘依加入時間；張數不含已經離開的人加的那張
    assert.deepEqual(['membersCount', 'membersNames'].map((id) => page.$(id).textContent), ['成員 3/8', '光之戰士K7Q（你）、光之戰士M4X、光之戰士R6V']);
    assert.equal(page.$('membersList').children.length, 0, '收合時不建列表');

    expand(page);
    assert.deepEqual([page.$('membersToggle').getAttribute('aria-expanded'), page.$('membersChevron').textContent, page.$('membersPanel').classList.contains('hidden'), page.$('membersNames').textContent],
        ['true', '▾', false, '']);
    assert.deepEqual(rows(page).map((row) => row.dataset.memberId), ['me', 'm4x', 'r6v']);
    assert.ok(rows(page).every((row) => row.tagName === 'LI' && classNames(row).includes('tm-member')));
    assert.deepEqual(rows(page).map((row) => classNames(row).includes('is-me')), [true, false, false]);
    assert.deepEqual(describeRow(rowOf(page, 'me')), ['tm-member-name:光之戰士K7Q', 'tag.tag-primary:隊長', 'tag:你', 'tm-member-meta:2 張', 'btn-ghost:改名']);
    assert.deepEqual(describeRow(rowOf(page, 'm4x')), ['tm-member-name:光之戰士M4X', 'tm-member-meta:1 張', 'btn-ghost:移出']);
    assert.deepEqual(describeRow(rowOf(page, 'r6v')), ['tm-member-name:光之戰士R6V', 'tm-member-meta:0 張', 'btn-ghost:移出']);

    const rename = buttonOf(page, 'me', 'rename');
    assert.deepEqual([rename.dataset.memberId, rename.getAttribute('type'), classNames(rename)], ['me', 'button', ['btn', 'btn-ghost', 'btn-sm']]);
    const remove = buttonOf(page, 'm4x', 'remove');
    assert.deepEqual([remove.dataset.memberId, remove.getAttribute('type'), classNames(remove), remove.getAttribute('aria-label')],
        ['m4x', 'button', ['btn', 'btn-ghost', 'btn-sm'], '把 光之戰士M4X 移出隊伍']);
    assert.equal(rowOf(page, 'me').querySelector('button[data-action="remove"]'), null, '不能移出自己');
    assert.equal(rowOf(page, 'm4x').querySelector('button[data-action="rename"]'), null, '只能改自己的名字');

    // 再按一次：收合，名字回到成員一行，列表收起來
    expand(page);
    assert.deepEqual([page.$('membersToggle').getAttribute('aria-expanded'), page.$('membersChevron').textContent, page.$('membersPanel').classList.contains('hidden'), page.$('membersNames').textContent],
        ['false', '▸', true, '光之戰士K7Q（你）、光之戰士M4X、光之戰士R6V']);
});

test('不是隊長：沒有人看得到移出；順序是隊長、自己、其餘依加入時間（成員資料的順序不算）；隊員的名字是純文字', async () => {
    const lead = { id: 'lead', nickname: '<b>隊長</b>', joinedAt: '2026-10-17T00:02:00.000Z' };
    const page = await createParty(joinsParty({ creatorId: 'lead', members: [R6V, lead, M4X], treasureMaps: [serverMap('map_1', 'lead'), serverMap('map_2', 'me')] }),
        { stored: { ff14tw_nickname_tag: 'K7Q' } });
    assert.equal((await page.client.joinRoom('ABC123')).success, true);
    expand(page);
    assert.deepEqual(rows(page).map((row) => row.dataset.memberId), ['lead', 'me', 'm4x', 'r6v']);
    assert.deepEqual(describeRow(rowOf(page, 'lead')), ['tm-member-name:<b>隊長</b>', 'tag.tag-primary:隊長', 'tm-member-meta:1 張']);
    assert.equal(rowOf(page, 'lead').children.length, 3, '名字是純文字，不會長出元素；隊長那一列沒有按鈕');
    assert.deepEqual(describeRow(rowOf(page, 'me')), ['tm-member-name:光之戰士K7Q', 'tag:你', 'tm-member-meta:1 張', 'btn-ghost:改名']);
    assert.equal(page.$('membersPanel').querySelectorAll('button[data-action="remove"]').length, 0);
    assert.equal(page.$('membersNames').textContent, '');
    expand(page);
    assert.equal(page.$('membersNames').textContent, '<b>隊長</b>、光之戰士K7Q（你）、光之戰士M4X、光之戰士R6V');
});

test('隊長已經離開（creatorId 不在成員裡）：沒有隊長標籤、沒有移出鈕，不丟例外（Review Focus 2）', async () => {
    const page = await createParty(joinsParty({ creatorId: 'gone', members: [M4X, R6V], treasureMaps: [serverMap('map_1', 'gone'), serverMap('map_2', 'm4x')] }),
        { stored: { ff14tw_nickname_tag: 'K7Q' } });
    const result = await page.client.joinRoom('ABC123');
    // 畫面是在連線的流程裡重畫的：重畫丟了例外，連線會被當成失敗
    assert.deepEqual(plain(result), { success: true });
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.$('roomSection').classList.contains('hidden'), false);
    assert.equal(page.$('membersCount').textContent, '成員 3/8');
    expand(page);
    // 自己排在最前面（沒有隊長），其餘依加入時間
    assert.deepEqual(rows(page).map((row) => row.dataset.memberId), ['me', 'm4x', 'r6v']);
    assert.equal(page.$('membersPanel').querySelectorAll('.tag-primary').length, 0, '沒有人有隊長標籤');
    assert.equal(page.$('membersPanel').querySelectorAll('button[data-action="remove"]').length, 0, '沒有人有移出鈕');
    assert.deepEqual(describeRow(rowOf(page, 'me')), ['tm-member-name:光之戰士K7Q', 'tag:你', 'tm-member-meta:0 張', 'btn-ghost:改名']);
    // 之後輪詢的重畫也不丟例外
    serverChanges(page, { members: [M4X, ME] });
    assert.deepEqual(rows(page).map((row) => row.dataset.memberId), ['me', 'm4x']);
});

test('按鈕接線：離開 → 離開對話框，改名 → 改名對話框，移出 → 移出對話框 dialogs.openRemove(那位成員)，邀請連結與代號各自複製；成員一行展開、收合', async () => {
    const page = await crowdedParty();
    const calls = [];
    const { client } = page;
    client.showLeaveRoomDialog = () => calls.push('leave');
    client.showEditNicknameDialog = () => calls.push('rename');
    client.dialogs.openRemove = (target) => calls.push(`remove ${target.id} ${target.nickname}`);
    client.copyInviteLink = () => calls.push('invite');
    client.copyRoomCode = () => calls.push('code');
    expand(page);
    for (const button of [page.$('leaveRoomBtn'), page.$('copyInviteBtn'), page.$('copyRoomCodeBtn'), buttonOf(page, 'me', 'rename'),
        buttonOf(page, 'm4x', 'remove'), buttonOf(page, 'r6v', 'remove')]) button.click();
    assert.deepEqual(calls, ['leave', 'invite', 'code', 'rename', 'remove m4x 光之戰士M4X', 'remove r6v 光之戰士R6V']);
    // 列表裡按到按鈕以外的地方什麼都不做
    rowOf(page, 'm4x').click();
    page.$('membersList').click();
    assert.equal(calls.length, 6);
});


// ---------- 每兩秒的輪詢重畫：不搶焦點、不重唸（Review Focus 1） ----------
test('輪詢的隊伍資料沒變（只有 revision 變）：#membersList 裡的節點不重建、其他字不重寫、焦點留在改名鈕', async () => {
    const page = await crowdedParty();
    expand(page);
    const before = rows(page);
    const rename = buttonOf(page, 'me', 'rename');
    // 同樣的字不重寫：textContent 一寫就會換掉整個文字節點，螢幕閱讀器可能把它重唸一遍（#partySync 是 role="status"）
    const ids = ['roomCode', 'partySyncText', 'membersCount', 'membersChevron'];
    const texts = ids.map((id) => page.$(id).firstChild);
    assert.ok(texts.every((node) => node !== null));
    rename.focus();
    assert.ok(page.focused() === rename, '先確認前提：焦點在改名鈕上');

    serverChanges(page, {});
    serverChanges(page, {});
    assert.ok(rows(page).length === before.length && rows(page).every((row, index) => row === before[index]), '列沒有重建');
    assert.ok(buttonOf(page, 'me', 'rename') === rename, '改名鈕還是同一顆');
    assert.ok(page.focused() === rename, '焦點留在改名鈕');
    assert.ok(ids.every((id, index) => page.$(id).firstChild === texts[index]), '同樣的字不重寫');
});

test('成員改了名：重建後焦點回到同一個人的同一顆鈕；那個人被移出了：焦點到 #membersToggle；焦點不在成員列表裡時，重建不動焦點（Review Focus 1）', async () => {
    const page = await crowdedParty();
    expand(page);
    const renamedM4x = { ...M4X, nickname: '新名字' };

    // 隊長（自己）按著 M4X 那一列的「移出」，M4X 改了名：列重建了，焦點在新的那顆「移出」上，名稱是新名字
    const oldRemove = buttonOf(page, 'm4x', 'remove');
    oldRemove.focus();
    serverChanges(page, { members: [ME, renamedM4x, R6V] });
    const newRemove = buttonOf(page, 'm4x', 'remove');
    assert.ok(newRemove !== oldRemove, '列重建了');
    assert.ok(page.focused() === newRemove, '焦點回到同一個人的同一顆鈕');
    assert.equal(newRemove.getAttribute('aria-label'), '把 新名字 移出隊伍');
    assert.equal(rowOf(page, 'm4x').querySelector('.tm-member-name').textContent, '新名字');

    // 自己改名也一樣：焦點在自己的「改名」上，重建後還在新的那顆「改名」上
    const oldRename = buttonOf(page, 'me', 'rename');
    oldRename.focus();
    const renamedMe = { ...ME, nickname: '光之戰士Z9Z' };
    serverChanges(page, { members: [renamedMe, renamedM4x, R6V] });
    assert.ok(buttonOf(page, 'me', 'rename') !== oldRename, '列重建了');
    assert.ok(page.focused() === buttonOf(page, 'me', 'rename'), '焦點回到自己的「改名」');
    assert.equal(rowOf(page, 'me').querySelector('.tm-member-name').textContent, '光之戰士Z9Z');

    // 焦點不在成員列表裡（在「離開隊伍」、「成員」那一行）：隊友再改名、列重建了，焦點也不動
    for (const [id, nickname] of [['leaveRoomBtn', '甲'], ['membersToggle', '乙']]) {
        page.$(id).focus();
        const listBefore = rows(page);
        serverChanges(page, { members: [renamedMe, { ...renamedM4x, nickname }, R6V] });
        assert.ok(rows(page).every((row, index) => row !== listBefore[index]), '列重建了');
        assertFocusOn(page, id, '焦點不在成員列表裡');
    }

    // 那個人被移出了：他那一列的按鈕不在了，焦點到「成員」那一行（還在隊伍裡的人沒有變）
    buttonOf(page, 'm4x', 'remove').focus();
    serverChanges(page, { members: [renamedMe, R6V] });
    assert.equal(rowOf(page, 'm4x'), undefined);
    assertFocusOn(page, 'membersToggle', '被移出的那一列的按鈕不在了');
    assert.deepEqual(rows(page).map((row) => row.dataset.memberId), ['me', 'r6v']);
});

// 從列表裡的按鈕打開的對話框（改名）：ModalManager 記著那顆按鈕，關閉時把焦點還給它。
// 但列表會在對話框開著時重建（改名成功時先收到新名字、再關對話框；對話框開著時輪詢也可能帶來隊友的變動），原本那顆按鈕已經不在，
// ModalManager 就不還焦點了：焦點掉在已經藏起來的對話框裡。重建時要把它要還的那顆換成新的、同一個人的同一顆
// fake-dom 的元素沒有 select()（showEditNicknameDialog 開啟時會選取名字）：補一個空的
const stubSelect = (page) => { page.$('nicknameInput').select = () => {}; };
// 伺服器替身：建立隊伍（只有自己）之後，改名（PUT { nickname }）回傳改好名字、revision 加一的隊伍
const createsAndRenames = () => {
    let current = null;
    return (path, { method, body }) => {
        if (path === '/rooms' && method === 'POST') {
            const me = { ...ME, nickname: body.memberNickname };
            current = { ...room([], [me]), creatorId: me.id };
            return { ...current, memberId: me.id, memberToken: TOKEN };
        }
        if (path === '/rooms/ABC123' && method === 'PUT' && body.nickname) {
            current = { ...current, revision: current.revision + 1, members: current.members.map((item) => (item.id === 'me' ? { ...item, nickname: body.nickname } : item)) };
            return current;
        }
        throw new Error(`unexpected ${method} ${path}`);
    };
};

test('改名：從成員列表按「改名」、改好名字按確認，對話框關閉後焦點在新的那顆「改名」上（收到新名字時列表重建了，原本那顆已經不在）', async () => {
    const page = await createParty(createsAndRenames(), { stored: { ff14tw_nickname_tag: 'K7Q' } });
    assert.equal((await page.client.createRoom()).success, true);
    stubSelect(page);
    page.finder.openListPanel();
    expand(page);
    const oldRename = buttonOf(page, 'me', 'rename');
    oldRename.focus();
    oldRename.click();
    assertFocusOn(page, 'nicknameInput', '打開改名對話框');
    page.$('nicknameInput').value = '新名字';
    await page.client.confirmEditNickname();
    assert.equal(page.$('editNicknameModal').classList.contains('hidden'), true, '對話框關了');
    assert.equal(rowOf(page, 'me').querySelector('.tm-member-name').textContent, '新名字');
    const newRename = buttonOf(page, 'me', 'rename');
    assert.ok(newRename !== oldRename, '收到新名字時列表重建了');
    assert.ok(page.focused() === newRename, '焦點回到新的那顆「改名」，不是掉在已經藏起來的對話框裡');
});

test('改名對話框開著時輪詢重建了列表（隊友改名）：按取消、✕ 或 Escape 關掉之後，焦點在新的那顆「改名」上；列表沒重建時還是原本那顆', async () => {
    const closers = {
        取消: (page) => page.$('cancelNicknameBtn').click(),
        '✕': (page) => page.$('closeNicknameModalBtn').click(),
        Escape: (page) => page.key('Escape')
    };
    for (const [label, close] of Object.entries(closers)) {
        const page = await crowdedParty();
        stubSelect(page);
        expand(page);
        const open = () => {
            const rename = buttonOf(page, 'me', 'rename');
            rename.focus();
            rename.click();
            assertFocusOn(page, 'nicknameInput', `${label}：打開改名對話框`);
            return rename;
        };
        // 對照：對話框開著時列表沒變，關掉之後焦點回到原本那顆
        const same = open();
        close(page);
        assert.ok(page.focused() === same, `${label}：列表沒重建，焦點回到原本那顆`);

        // 對話框開著時隊友改名：列表重建了，關掉之後焦點在新的那顆
        const stale = open();
        serverChanges(page, { members: [ME, { ...M4X, nickname: '別名' }, R6V] });
        const fresh = buttonOf(page, 'me', 'rename');
        assert.ok(fresh !== stale, `${label}：列表重建了`);
        close(page);
        assert.equal(page.$('editNicknameModal').classList.contains('hidden'), true, `${label}：對話框關了`);
        assert.ok(page.focused() === fresh, `${label}：焦點回到新的那顆「改名」`);
    }
});

test('從別人那一列的按鈕打開的對話框（之後的移出確認一樣）：對話框開著時那個人離開了，關閉後焦點在 #membersToggle', async () => {
    const page = await crowdedParty();
    expand(page);
    // 焦點在 M4X 那一列的「移出」上時打開對話框（用現成的離開隊伍對話框代替）：ModalManager 記著那顆「移出」
    buttonOf(page, 'm4x', 'remove').focus();
    page.client.showLeaveRoomDialog();
    serverChanges(page, { members: [ME, R6V] });
    assert.equal(rowOf(page, 'm4x'), undefined, 'M4X 離開了，那顆「移出」不在了');
    page.$('cancelLeaveBtn').click();
    assert.equal(page.$('leaveRoomModal').classList.contains('hidden'), true);
    assertFocusOn(page, 'membersToggle', '要還的那顆不在了，焦點到成員一行');
});

test('張數、隊長、語言或展開狀態變了才重建：隊友加了圖、隊伍變成沒有隊長、切換語言，都重畫', async () => {
    const page = await crowdedParty();
    expand(page);
    let before = rows(page);
    const changed = () => {
        const now = rows(page);
        const differs = now.length !== before.length || now.some((row, index) => row !== before[index]);
        before = now;
        return differs;
    };
    // 張數變了
    serverChanges(page, { treasureMaps: [serverMap('map_1', 'me'), serverMap('map_2', 'me'), serverMap('map_3', 'm4x'), serverMap('map_5', 'm4x')] });
    assert.ok(changed());
    assert.equal(describeRow(rowOf(page, 'm4x')).at(-2), 'tm-member-meta:2 張');
    // 同一批圖換了人加：沒有人的張數變了，不重建
    serverChanges(page, { treasureMaps: [serverMap('map_6', 'me'), serverMap('map_7', 'me'), serverMap('map_8', 'm4x'), serverMap('map_9', 'm4x')] });
    assert.ok(!changed());
    // 隊長不在成員裡了（舊的標籤與移出鈕要消失）
    serverChanges(page, { creatorId: 'gone' });
    assert.ok(changed());
    assert.equal(page.$('membersList').querySelectorAll('.tag-primary').length, 0);
    assert.equal(page.$('membersList').querySelectorAll('button[data-action="remove"]').length, 0);
    // 語言
    page.setLang('en');
    assert.ok(changed());
    // 收合、再展開
    expand(page);
    assert.equal(rows(page).length, 0);
    expand(page);
    assert.ok(changed());
});

// ---------- 換語言 ----------
test('切到英文：Party code、Synced、Members 1/8；名字是加入時送出的字串不會變，只是後綴換成「光之戰士K7Q (you)」；再切日文', async () => {
    const page = await createdParty();
    const texts = () => ({
        label: page.$('roomSection').getAttribute('aria-label'),
        code: page.$('roomSection').querySelector('.tm-team-code').textContent,
        status: page.$('partySyncText').textContent,
        count: page.$('membersCount').textContent,
        names: page.$('membersNames').textContent,
        buttons: ['copyInviteBtn', 'copyRoomCodeBtn', 'leaveRoomBtn'].map((id) => page.$(id).textContent.trim()),
        note: page.$('roomSection').querySelector('.tm-team-note').textContent
    });
    // 英日的按鈕字是短的，隊伍狀態才維持三行：三顆按鈕加兩個間距，英文 315px、日文 309px，360px 寬的手機（這一行有 328px）與桌機的清單面板（368px）
    // 都排得進一行（瀏覽器實測）。原本的 Copy invite link／Leave party、招待リンクをコピー／パーティを抜ける 連桌機都會把離開鈕擠到下一行
    page.setLang('en');
    assert.deepEqual(texts(), {
        label: 'Party', code: 'Party code ABC123', status: 'Synced', count: 'Members 1/8', names: '光之戰士K7Q (you)',
        buttons: ['🔗 Invite link', 'Copy code', 'Leave'], note: 'A party ends after 24 hours without activity.'
    });
    page.setLang('ja');
    assert.deepEqual(texts(), {
        label: 'パーティ', code: 'パーティコード ABC123', status: '同期済み', count: 'メンバー 1/8', names: '光之戰士K7Q（あなた）',
        buttons: ['🔗 招待', 'コードをコピー', '抜ける'], note: 'パーティは 24 時間動きがないと自動的に解散します。'
    });
    assert.equal(page.client.currentUser.nickname, '光之戰士K7Q', '名字は加入時に送った文字列のまま');
    page.setLang('zh');
    assert.deepEqual([texts().status, texts().count, texts().names], ['已同步', '成員 1/8', '光之戰士K7Q（你）']);
});

test('展開著切換語言：每一列的標籤、張數與按鈕換成新語言，焦點留在同一顆鈕', async () => {
    const page = await crowdedParty();
    expand(page);
    buttonOf(page, 'm4x', 'remove').focus();
    page.setLang('en');
    assert.deepEqual(describeRow(rowOf(page, 'me')), ['tm-member-name:光之戰士K7Q', 'tag.tag-primary:Leader', 'tag:You', 'tm-member-meta:Maps: 2', 'btn-ghost:Rename']);
    assert.deepEqual(describeRow(rowOf(page, 'm4x')), ['tm-member-name:光之戰士M4X', 'tm-member-meta:Maps: 1', 'btn-ghost:Remove']);
    assert.equal(buttonOf(page, 'm4x', 'remove').getAttribute('aria-label'), 'Remove 光之戰士M4X from the party');
    assert.ok(page.focused() === buttonOf(page, 'm4x', 'remove'), '焦點回到同一顆「移出」');
    page.setLang('ja');
    assert.deepEqual(describeRow(rowOf(page, 'me')), ['tm-member-name:光之戰士K7Q', 'tag.tag-primary:リーダー', 'tag:あなた', 'tm-member-meta:2 枚', 'btn-ghost:名前を変更']);
    assert.deepEqual(describeRow(rowOf(page, 'r6v')), ['tm-member-name:光之戰士R6V', 'tm-member-meta:0 枚', 'btn-ghost:除名']);
    assert.equal(buttonOf(page, 'm4x', 'remove').getAttribute('aria-label'), '光之戰士M4X をパーティから除名');
});

// ---------- 邀請連結與複製代號 ----------
// 備用複製（RoomCollaboration#fallbackCopy）要用 textarea.select() 與 document.execCommand('copy')，fake-dom 都沒有：補上，並記下複製的內容
const watchFallbackCopy = (page) => {
    const copied = [];
    const { document } = page.dom;
    const createElement = document.createElement.bind(document);
    document.createElement = (tag) => {
        const element = createElement(tag);
        if (tag === 'textarea') element.select = () => { element.selected = true; };
        return element;
    };
    document.execCommand = (command) => {
        copied.push([command, document.body.children.find((child) => child.tagName === 'TEXTAREA' && child.selected)?.value]);
        return true;
    };
    return copied;
};
const hasTextarea = (page) => page.dom.document.body.children.some((child) => child.tagName === 'TEXTAREA');

test('複製邀請連結：網址 https://ff14.tw/tools/treasure-map-finder/?grade=g17&zone=urqopacha&maps=tm_017#x 時剪貼簿是 https://ff14.tw/tools/treasure-map-finder/?room=ABC123，toast「已複製邀請連結」；剪貼簿被拒絕或沒有剪貼簿時走備用複製', async () => {
    const url = 'https://ff14.tw/tools/treasure-map-finder/?grade=g17&zone=urqopacha&maps=tm_017#x';
    const link = 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123';
    const page = await createdParty({ url });
    assert.equal(String(page.dom.window.location), 'https://ff14.tw/tools/treasure-map-finder/?grade=g17&zone=urqopacha&maps=tm_017&room=ABC123#x', '目前的網址帶著等級、地區、分享的寶圖與 hash');
    page.$('copyInviteBtn').click();
    await page.settle();
    assert.deepEqual(page.clipboardWrites, [link]);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製邀請連結', type: 'success' });

    // 剪貼簿拒絕寫入：備用複製（選取一個暫時的 textarea、execCommand），之後同一句 toast
    const denied = await createdParty({ url, clipboard: 'reject' });
    const deniedCopies = watchFallbackCopy(denied);
    denied.$('copyInviteBtn').click();
    await denied.settle();
    assert.deepEqual([denied.clipboardWrites, deniedCopies, hasTextarea(denied)], [[], [['copy', link]], false]);
    assert.deepEqual(denied.toasts.at(-1), { message: '已複製邀請連結', type: 'success' });

    // 沒有剪貼簿（不安全的環境）：直接走備用複製
    const bare = await createdParty({ url });
    bare.dom.window.navigator.clipboard = undefined;
    const bareCopies = watchFallbackCopy(bare);
    bare.$('copyInviteBtn').click();
    assert.deepEqual([bareCopies, hasTextarea(bare)], [[['copy', link]], false]);
    assert.deepEqual(bare.toasts.at(-1), { message: '已複製邀請連結', type: 'success' });
});

test('複製代號：剪貼簿是隊伍代號，toast「已複製隊伍代號」；剪貼簿被拒絕時走備用複製，同一句 toast', async () => {
    const page = await createdParty();
    page.$('copyRoomCodeBtn').click();
    await page.settle();
    assert.deepEqual(page.clipboardWrites, ['ABC123']);
    assert.deepEqual(page.toasts.at(-1), { message: '已複製隊伍代號', type: 'success' });

    const denied = await createdParty({ clipboard: 'reject' });
    const copies = watchFallbackCopy(denied);
    denied.$('copyRoomCodeBtn').click();
    await denied.settle();
    assert.deepEqual([denied.clipboardWrites, copies, hasTextarea(denied)], [[], [['copy', 'ABC123']], false]);
    assert.deepEqual(denied.toasts.at(-1), { message: '已複製隊伍代號', type: 'success' });
});

test('RoomCollaboration.inviteLink：只有網址的來源、路徑與 room，不帶等級、地區、maps 與 hash', async () => {
    const { RoomCollaboration } = (await createPanelPage()).dom.window;
    const base = 'https://ff14.tw/tools/treasure-map-finder/';
    assert.equal(RoomCollaboration.inviteLink(`${base}?grade=g17&zone=urqopacha&maps=tm_017#x`, 'ABC123'), `${base}?room=ABC123`);
    assert.equal(RoomCollaboration.inviteLink(`${base}?room=OLD111&grade=g17,g10`, 'ABC123'), `${base}?room=ABC123`);
    assert.equal(RoomCollaboration.inviteLink(base, 'ABC123'), `${base}?room=ABC123`);
    assert.equal(RoomCollaboration.inviteLink('http://localhost:8000/tools/treasure-map-finder/?maps=tm_017', 'XYZ789'), 'http://localhost:8000/tools/treasure-map-finder/?room=XYZ789');
});

// ---------- 加入隊伍：輸入代號，錯誤寫在代號欄下面 ----------
// 加入對話框現在開著嗎（ModalManager 認得它，而且看得到）
const joinOpen = (page) => page.client.dialogs.modalManager.activeModal === page.$('joinRoomModal') && !isHidden(page, 'joinRoomModal');
// 打開面板、焦點在「加入隊伍」上、按下去
const pressJoin = (page) => {
    page.finder.openListPanel();
    page.$('joinRoomBtn').focus();
    page.$('joinRoomBtn').click();
};
// 在代號欄打字：和瀏覽器一樣，值變了再送 input 事件
const typeCode = (page, value) => {
    page.$('roomCodeInput').value = value;
    page.$('roomCodeInput').dispatchEvent(new page.dom.window.Event('input', { bubbles: true }));
};
// fake-dom 的 input 沒有 select()：換上一個會記錄的，回傳的陣列是每次呼叫當下有焦點的元素
const spySelect = (page) => {
    const calls = [];
    page.$('roomCodeInput').select = () => { calls.push(page.focused()); };
    return calls;
};
// 玩家按「加入」：焦點在那顆鈕上（連線中它停用，停用之前焦點先移到 ✕），等連線結束
const pressJoinConfirm = async (page) => {
    page.$('confirmJoinBtn').focus();
    page.$('confirmJoinBtn').click();
    await page.settle();
};
// 對話框裡會因為連線中而停用的控制項，依序是 [帶進, 不帶, 加入, 取消, ✕]：取消與 ✕ 連線中還能按
const JOIN_CONTROLS = ['joinModeBring', 'joinModeClear', 'confirmJoinBtn', 'cancelJoinBtn', 'closeJoinModalBtn'];
const joinDisabledOf = (page) => JOIN_CONTROLS.map((id) => page.$(id).disabled);
// 代號欄的狀態：[錯誤的字, 錯誤顯示著, 說明顯示著, is-invalid, aria-invalid]
const codeState = (page) => [page.$('roomCodeError').textContent, !isHidden(page, 'roomCodeError'), !isHidden(page, 'roomCodeHint'),
    page.$('roomCodeInput').classList.contains('is-invalid'), page.$('roomCodeInput').getAttribute('aria-invalid')];
const NO_ERROR = ['', false, true, false, null];
const GET_ROOM = 'GET /rooms/ABC123';
const POST_JOIN = 'POST /rooms/ABC123/join';
// 隊伍 ABC123 裡已經有的 count 張寶圖（id 是 room_0、room_1…，目錄裡沒有）
const partyMaps = (count) => Array.from({ length: count }, (_, index) => serverMap(`room_${index}`, member.id));
// 伺服器替身：ABC123 已經有 members（預設只有隊長）和 treasureMaps；加入時把送來的 initialMaps 裡隊伍還沒有的收進去（addedBy 是自己）。
// requests 記下每一次的請求（method、path、body）
const joiningServer = ({ members = [member], treasureMaps = [] } = {}) => {
    const requests = [];
    return {
        requests,
        respond: (path, options) => {
            const method = options.method ?? 'GET';
            requests.push({ method, path, body: options.body });
            if (path === '/rooms/ABC123' && method === 'GET') return room(treasureMaps, members);
            if (path === '/rooms/ABC123/join' && method === 'POST') {
                const own = options.body.initialMaps.filter((map) => !treasureMaps.some((item) => item.id === map.id))
                    .map((map) => ({ ...map, addedBy: newMember.id, addedAt: new Date().toISOString() }));
                return { room: room([...treasureMaps, ...own], [...members, newMember]), newMember, memberToken: TOKEN };
            }
            throw new Error(`unexpected ${method} ${path}`);
        }
    };
};
const requestsOf = (server) => server.requests.map(({ method, path }) => `${method} ${path}`);
const listIds = (page) => plain(Array.from(page.finder.listManager.getList(), (map) => map.id));

test('清單是空的：打開加入對話框，焦點在代號欄、代號欄是空的、說明在、錯誤藏著、沒有「你的清單」那一塊；每次打開都從頭開始', async () => {
    const page = await createParty(joiningServer().respond);
    assert.equal(joinOpen(page), false);
    pressJoin(page);

    assert.ok(joinOpen(page));
    assertFocusOn(page, 'roomCodeInput', '打開時焦點在代號欄');
    assert.equal(page.$('joinRoomModal-title').textContent, '加入隊伍');
    assert.equal(page.$('roomCodeInput').value, '');
    assert.equal(page.$('roomCodeHint').textContent, '6 碼英文和數字，向隊長要。打開隊長貼的邀請連結就不用輸入。');
    assert.deepEqual(codeState(page), NO_ERROR);
    // 清單是空的沒有東西可問：整塊藏起來（說明、迷你清單、選項、提醒都在裡面）
    assert.equal(isHidden(page, 'joinPartyMaps'), true);
    assert.equal(isHidden(page, 'joinPartyNote'), true);
    assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.client.dialogs.opening, 1);
    assert.deepEqual(page.toasts, []);

    // 這一塊跟著清單走：有寶圖時打開就出現，清單清空之後再打開又整塊藏起來
    page.key('Escape');
    page.addMaps(TWO);
    page.$('joinRoomBtn').click();
    assert.equal(isHidden(page, 'joinPartyMaps'), false);
    page.key('Escape');
    page.finder.listManager.clear();
    page.$('joinRoomBtn').click();
    assert.ok(joinOpen(page));
    assert.equal(isHidden(page, 'joinPartyMaps'), true);
});

test('清單 2 張：對話框寫「你的清單有 2 張寶圖：」、兩列迷你清單、預設勾帶進、說明「只用隊伍清單」；加入 → initialMaps 2 張、合進隊伍清單、連線中選項與按鈕停用', async () => {
    const server = joiningServer({ treasureMaps: partyMaps(3) });
    const page = await createParty(server.respond);
    page.addMaps(TWO);
    pressJoin(page);

    assert.ok(joinOpen(page));
    assert.equal(isHidden(page, 'joinPartyMaps'), false);
    const text = (id) => page.$(id).textContent;
    assert.equal(text('joinPartyLede'), '你的清單有 2 張寶圖：');
    assert.deepEqual(page.$('joinPartyList').children.map((row) => row.className), ['tm-mini', 'tm-mini']);
    assert.deepEqual(page.$('joinPartyList').children.map((row) => row.textContent), ['G17 科扎馬烏卡 (20.0, 6.9)', 'G17 烏爾科帕恰 (13.7, 14.2)']);
    assert.equal(page.$('joinPartyChoice').querySelector('legend').textContent, '你的寶圖要怎麼處理');
    assert.deepEqual(['joinModeBringTitle', 'joinModeBringHint', 'joinModeClearTitle', 'joinModeClearHint'].map(text),
        ['帶進隊伍清單', '隊友也看得到，會標成你的圖', '不帶，清空這 2 張', '只用隊伍清單']);
    assert.deepEqual([page.$('joinModeBring').checked, page.$('joinModeClear').checked], [true, false], '預設帶進');
    assert.equal(isHidden(page, 'joinPartyNote'), true);
    assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false]);
    assert.equal(text('createPartyLede'), '', '建立隊伍的對話框是另一組元素，沒有被動到');

    typeCode(page, 'abc123');
    page.$('confirmJoinBtn').focus();
    page.$('confirmJoinBtn').click();
    // 連線中：選項與「加入」停用（取消與 ✕ 還能按），「加入」轉圈；代號欄不停用；成功之前對話框不關
    assert.deepEqual(joinDisabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmJoinBtn').classList.contains('btn-loading'), true);
    assert.equal(page.$('roomCodeInput').disabled === true, false);
    assert.ok(joinOpen(page));
    assertFocusOn(page, 'closeJoinModalBtn', '「加入」停用之前焦點先移到 ✕，不會掉到 body');
    await page.settle();

    // 代號去掉空白、轉大寫再用；先讀隊伍、再加入；沒有勾「不帶」，清單帶進去
    assert.deepEqual(requestsOf(server), [GET_ROOM, POST_JOIN]);
    assert.deepEqual(plain(server.requests[1].body.initialMaps.map((map) => map.id)), TWO);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(listIds(page), ['room_0', 'room_1', 'room_2', ...TWO], '帶進去的和隊伍原本的合成隊伍清單');
    assert.equal(joinOpen(page), false);
});

test('選不帶：initialMaps 是空的，加入後清單就是隊伍清單（決定只看「不帶」那顆有沒有勾）', async () => {
    const server = joiningServer({ treasureMaps: partyMaps(3) });
    const page = await createParty(server.respond);
    page.addMaps(TWO);
    pressJoin(page);
    typeCode(page, 'ABC123');
    // fake-dom 的 radio 不會互斥：只勾「不帶」，「帶進」那顆還勾著
    page.$('joinModeClear').checked = true;
    page.$('joinModeClear').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
    await pressJoinConfirm(page);

    assert.deepEqual(requestsOf(server), [GET_ROOM, POST_JOIN]);
    assert.deepEqual(plain(server.requests[1].body.initialMaps), []);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(listIds(page), ['room_0', 'room_1', 'room_2'], '不帶：清單只剩隊伍清單');
    assert.equal(joinOpen(page), false);
    assertFocusOn(page, 'copyInviteBtn', '加入成功');
});

test('代號格式不對：錯誤寫在代號欄下面（說明讓位）、代號欄 is-invalid 與 aria-invalid、焦點回到代號欄並選取內容；不送請求、不跳 toast、對話框不關、代號保留', async () => {
    for (const typed of ['', 'abc', 'AB-123', 'abc1234']) {
        const label = JSON.stringify(typed);
        const server = joiningServer();
        const page = await createParty(server.respond);
        const selected = spySelect(page);
        pressJoin(page);
        typeCode(page, typed);
        await pressJoinConfirm(page);

        assert.deepEqual(server.requests, [], `${label}：格式不對不送請求`);
        assert.ok(joinOpen(page), `${label}：對話框不關`);
        assert.deepEqual(codeState(page), ['代號是 6 碼英文和數字。', true, false, true, 'true'], label);
        assertFocusOn(page, 'roomCodeInput', `${label}：焦點回到代號欄`);
        assert.deepEqual(selected.map((element) => element.id), ['roomCodeInput'], `${label}：焦點到了代號欄才選取內容`);
        assert.equal(page.$('roomCodeInput').value, typed, `${label}：代號保留`);
        assert.deepEqual(page.toasts, [], `${label}：錯誤在對話框裡，不跳 toast`);
        assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false], `${label}：可以再按`);
        assert.equal(page.$('confirmJoinBtn').classList.contains('btn-loading'), false, label);

        // 再按一次同樣的錯誤：按下去就先收起上一次的（說明回來），結果出來再重新寫，role="alert" 才會再唸一次
        page.$('confirmJoinBtn').focus();
        page.$('confirmJoinBtn').click();
        assert.deepEqual(codeState(page), NO_ERROR, `${label}：按下去先收起上一次的錯誤`);
        await page.settle();
        assert.deepEqual(codeState(page), ['代號是 6 碼英文和數字。', true, false, true, 'true'], label);
    }
});

test('找不到（404）：「找不到隊伍 AB12CD。…」，對話框不關、代號還在、焦點回到代號欄並選取；再打字，錯誤收起來、說明回來、紅框拿掉', async () => {
    const paths = [];
    const page = await createParty((path) => { paths.push(path); throw roomError(404, 'ROOM_NOT_FOUND'); });
    const selected = spySelect(page);
    pressJoin(page);
    typeCode(page, ' ab12cd ');
    await pressJoinConfirm(page);

    assert.deepEqual(paths, ['/rooms/AB12CD'], '代號去掉頭尾空白、轉大寫，讀一次隊伍');
    assert.ok(joinOpen(page));
    assert.deepEqual(codeState(page), ['找不到隊伍 AB12CD。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。', true, false, true, 'true']);
    assertFocusOn(page, 'roomCodeInput', '找不到：焦點回到代號欄');
    assert.deepEqual(selected.map((element) => element.id), ['roomCodeInput']);
    assert.equal(page.$('roomCodeInput').value, ' ab12cd ', '代號還在');
    assert.deepEqual(page.toasts, []);
    assert.equal(page.client.currentRoom, null);

    typeCode(page, 'ab12c');
    assert.deepEqual(codeState(page), NO_ERROR);
    assert.ok(joinOpen(page));
    assertFocusOn(page, 'roomCodeInput', '打字不動焦點');
});

test('讀到成員已經 8 人：「隊伍 ABC123 已經滿 8 人了。」寫在代號欄下面，不送加入；不是代號打錯，焦點留在原處、不選取', async () => {
    const eight = Array.from({ length: 8 }, (_, index) => ({ id: `member_${index}`, nickname: `Member ${index}`, joinedAt: '2026-10-17T00:00:00.000Z' }));
    const server = joiningServer({ members: eight });
    const page = await createParty(server.respond);
    const selected = spySelect(page);
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.deepEqual(requestsOf(server), [GET_ROOM], '只讀了隊伍，沒有送加入');
    assert.ok(joinOpen(page));
    assert.deepEqual(codeState(page), ['隊伍 ABC123 已經滿 8 人了。', true, false, true, 'true']);
    assertFocusOn(page, 'confirmJoinBtn', '連線中焦點在 ✕，失敗之後放回「加入」');
    assert.equal(selected.length, 0);
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false]);
});

test('帶進會超過 8 張：訊息帶隊伍和自己的張數、不送加入；照建議改選不帶，錯誤收起來，再按加入 → initialMaps 是空的、加入成功、清單成了隊伍清單', async () => {
    const server = joiningServer({ treasureMaps: partyMaps(5) });
    const page = await createParty(server.respond);
    page.addMaps(page.finder.maps.slice(0, 4).map((map) => map.id));
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.deepEqual(requestsOf(server), [GET_ROOM], '合計超過 8 張，不送加入');
    assert.ok(joinOpen(page));
    assert.deepEqual(codeState(page), ['隊伍清單已經有 5 張，加上你的 4 張會超過 8 張。選「不帶」，或先刪掉幾張再加入。', true, false, true, 'true']);
    assertFocusOn(page, 'confirmJoinBtn', '失敗之後放回去');
    assert.equal(page.finder.listManager.getLength(), 4, '清單沒動');
    assert.deepEqual(page.toasts, []);

    chooseMode(page, 'clear', 'join');
    assert.deepEqual(codeState(page), NO_ERROR, '照建議改選不帶，舊的錯誤不再適用');
    await pressJoinConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_JOIN]);
    assert.deepEqual(plain(server.requests[2].body.initialMaps), []);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.finder.listManager.getLength(), 5, '本機清單成了隊伍清單');
    assert.equal(joinOpen(page), false);
    assertFocusOn(page, 'copyInviteBtn', '加入成功');
});

test('連不上：訊息寫在代號欄下面、焦點留在原處；再按一次送同一個 clientRequestId，成功就進隊伍、錯誤收起來、對話框關掉', async () => {
    const server = joiningServer();
    const ids = [];
    const page = await createParty((path, options) => {
        if (options.method === 'POST') {
            ids.push(options.body.clientRequestId);
            if (ids.length === 1) throw roomError(503, 'UNAVAILABLE');
        }
        return server.respond(path, options);
    });
    const selected = spySelect(page);
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.deepEqual(codeState(page), [NETWORK_ERROR, true, false, true, 'true']);
    assert.ok(joinOpen(page));
    assertFocusOn(page, 'confirmJoinBtn', '連不上：不是代號的問題，焦點留在原處');
    assert.equal(selected.length, 0);
    assert.deepEqual(page.toasts, []);

    await pressJoinConfirm(page);
    assert.equal(ids.length, 2);
    assert.match(ids[0], /^[a-f0-9-]{36}$/);
    assert.equal(ids[1], ids[0], '重試帶同一個 clientRequestId：第一次可能已經成功、只是回應掉了');
    assert.equal(joinOpen(page), false);
    assert.deepEqual(codeState(page), NO_ERROR, '成功之後沒有舊的錯誤留著');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(messages(page), ['已加入隊伍 ABC123']);
    assertFocusOn(page, 'copyInviteBtn', '重試成功');
});

test('其他錯誤（伺服器回 4xx）：「加入失敗，請再試一次。」寫在代號欄下面，焦點留在原處；對話框不關、清單沒動', async () => {
    const server = joiningServer();
    const page = await createParty((path, options) => {
        if (options.method === 'POST') throw roomError(409, 'REQUEST_ALREADY_COMPLETED');
        return server.respond(path, options);
    });
    page.addMaps(TWO);
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.deepEqual(codeState(page), ['加入失敗，請再試一次。', true, false, true, 'true']);
    assert.ok(joinOpen(page));
    assertFocusOn(page, 'confirmJoinBtn', '失敗之後放回去');
    assert.deepEqual(page.toasts, []);
    assert.deepEqual(listIds(page), TWO);
    assert.equal(page.client.currentRoom, null);
});

test('成功：對話框關掉（加回 .hidden、清掉 display）、toast「已加入隊伍 ABC123」、焦點到複製邀請連結；控制項恢復，下次打開不會卡在連線中', async () => {
    const page = await createParty(joiningServer().respond);
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(joinOpen(page), false);
    assert.deepEqual([page.$('joinRoomModal').classList.contains('hidden'), page.$('joinRoomModal').style.display], [true, '']);
    assert.deepEqual(page.toasts, [{ message: '已加入隊伍 ABC123', type: 'success' }]);
    assertFocusOn(page, 'copyInviteBtn', '加入成功');
    assert.equal(page.$('teamActions').classList.contains('hidden'), true);
    assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.$('confirmJoinBtn').classList.contains('btn-loading'), false);
    assert.equal(page.client.dialogs.opening, 2, '打開一次、關閉一次');
    assert.deepEqual(codeState(page), NO_ERROR);
});

test('在代號欄按 Enter 等於按「加入」；輸入法選字中的 Enter 不算；連線中再按 Enter 不會再送一次', async () => {
    const held = holdResponse(joiningServer().respond);
    const page = await createParty(held.respond);
    pressJoin(page);
    assertFocusOn(page, 'roomCodeInput', '打開時焦點在代號欄');
    typeCode(page, 'abc123');

    // 輸入法選字中的 Enter（keydown 的 isComposing 是 true）是選字，不是送出
    page.$('roomCodeInput').dispatchEvent(new page.dom.window.Event('keydown', { bubbles: true, cancelable: true, key: 'Enter', isComposing: true }));
    page.key('a');
    assert.equal(held.sent.length, 0, '選字中的 Enter 與別的鍵都不送出');

    page.key('Enter');
    assert.equal(held.sent.length, 1, 'Enter 開始連線（先讀隊伍）');
    assert.deepEqual(joinDisabledOf(page), [true, true, true, false, false]);
    assertFocusOn(page, 'roomCodeInput', '焦點本來就在不會停用的代號欄，留在原處');
    page.key('Enter');
    assert.equal(held.sent.length, 1, '連線中「加入」停用，Enter 不再送一次');

    held.release();
    await page.settle();
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(joinOpen(page), false);
    assert.deepEqual(messages(page), ['已加入隊伍 ABC123']);
    assertFocusOn(page, 'copyInviteBtn', 'Enter 加入成功');
});

test('清單有隊伍收不下的自訂寶圖（以前匯入、id 有空白），選帶進（Review Focus 4）：顯示「你的清單裡有隊伍不支援的寶圖…」、一個請求都不送；改選不帶，錯誤收起來，就能加入', async () => {
    const server = joiningServer({ treasureMaps: partyMaps(2) });
    const page = await createParty(server.respond);
    page.addMaps(['tm_017']);
    page.finder.listManager.add({ id: 'bad id', level: 'g8', zone: 'Test', coords: { x: 10, y: 20 } });
    pressJoin(page);
    assert.equal(page.$('joinPartyLede').textContent, '你的清單有 2 張寶圖：');
    assert.equal(page.$('joinPartyList').children[1].textContent, 'G8 Test (10.0, 20.0)');
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.deepEqual(server.requests, [], '帶進會被隊伍拒絕，所以一個請求都不送（連讀隊伍都不用）');
    assert.ok(joinOpen(page));
    assert.deepEqual(codeState(page), ['你的清單裡有隊伍不支援的寶圖。選「不帶」，或先把它們刪掉。', true, false, true, 'true']);
    assertFocusOn(page, 'confirmJoinBtn', '失敗之後放回去');
    assert.equal(page.finder.listManager.getLength(), 2);
    assert.deepEqual(page.toasts, []);

    chooseMode(page, 'clear', 'join');
    assert.deepEqual(codeState(page), NO_ERROR, '照錯誤的建議改選不帶，舊的錯誤不再適用');
    await pressJoinConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, POST_JOIN]);
    assert.deepEqual(plain(server.requests[1].body.initialMaps), []);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(listIds(page), ['room_0', 'room_1'], '本機清單成了隊伍清單');
    assert.equal(joinOpen(page), false);
});

test('清單 9 張：帶進停用、兩個都沒勾、提醒顯示、「加入」停用（代號欄按 Enter 也不送）；勾了不帶才能加入；剛好 8 張照常預設帶進', async () => {
    const server = joiningServer();
    const page = await createParty(server.respond);
    page.addMaps(page.finder.maps.slice(0, 9).map((map) => map.id));
    pressJoin(page);

    assert.ok(joinOpen(page));
    assert.equal(page.$('joinPartyLede').textContent, '你的清單有 9 張寶圖：');
    assert.equal(page.$('joinPartyList').children.length, 9);
    assert.deepEqual([page.$('joinModeBring').disabled, page.$('joinModeClear').disabled], [true, false]);
    assert.deepEqual([page.$('joinModeBring').checked, page.$('joinModeClear').checked], [false, false], '兩個都不預先勾');
    assert.equal(page.$('joinModeClearTitle').textContent, '不帶，清空這 9 張');
    assert.equal(isHidden(page, 'joinPartyNote'), false);
    assert.equal(page.$('joinPartyNote').textContent, '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。');
    assert.equal(page.$('confirmJoinBtn').disabled, true);

    // 停用的「加入」不接受：Enter 或程式直接呼叫也不會送、不會冒出錯誤
    typeCode(page, 'abc123');
    page.key('Enter');
    await page.client.dialogs.confirmJoin();
    await page.settle();
    assert.deepEqual(server.requests, []);
    assert.equal(page.finder.listManager.getLength(), 9);
    assert.deepEqual(codeState(page), NO_ERROR);

    // 勾了不帶才能加入；清單還是 9 張，帶進還是停用，提醒還在
    chooseMode(page, 'clear', 'join');
    assert.deepEqual([page.$('confirmJoinBtn').disabled, page.$('joinModeBring').disabled, isHidden(page, 'joinPartyNote')], [false, true, false]);
    await pressJoinConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, POST_JOIN]);
    assert.deepEqual(plain(server.requests[1].body.initialMaps), []);
    assert.equal(page.finder.listManager.getLength(), 0);
    assert.equal(joinOpen(page), false);
    assertFocusOn(page, 'copyInviteBtn', '勾了不帶之後加入成功');

    // 剛好 8 張：還不算超過，照常預設帶進
    const eight = await createParty(server.respond);
    eight.addMaps(eight.finder.maps.slice(0, 8).map((map) => map.id));
    pressJoin(eight);
    assert.deepEqual([eight.$('joinModeBring').disabled, eight.$('joinModeBring').checked, eight.$('joinModeClear').checked,
        isHidden(eight, 'joinPartyNote'), eight.$('confirmJoinBtn').disabled], [false, true, false, true, false]);
});

test('取消、✕、Escape 都關掉對話框：不加入、不動清單，焦點回到「加入隊伍」；再打開是乾淨的（代號清空、預設帶進、沒有舊的錯誤）', async () => {
    const closers = {
        取消: (page) => page.$('cancelJoinBtn').click(),
        '✕': (page) => page.$('closeJoinModalBtn').click(),
        Escape: (page) => page.key('Escape')
    };
    for (const [label, close] of Object.entries(closers)) {
        const page = await createParty(() => { throw roomError(404, 'ROOM_NOT_FOUND'); });
        spySelect(page);
        page.addMaps(TWO);
        pressJoin(page);
        // 先弄髒：打代號、選不帶、按加入 → 找不到，錯誤留在對話框裡
        typeCode(page, 'ab12cd');
        chooseMode(page, 'clear', 'join');
        await pressJoinConfirm(page);
        assert.equal(isHidden(page, 'roomCodeError'), false, label);

        close(page);
        assert.equal(joinOpen(page), false, label);
        assert.deepEqual([page.$('joinRoomModal').classList.contains('hidden'), page.$('joinRoomModal').style.display], [true, ''], label);
        assertFocusOn(page, 'joinRoomBtn', `${label}：焦點回到按下去的那一顆`);
        assert.equal(page.client.currentRoom, null, label);
        assert.deepEqual(listIds(page), TWO, label);

        page.$('joinRoomBtn').click();
        assert.ok(joinOpen(page), label);
        assert.equal(page.$('roomCodeInput').value, '', `${label}：代號清空`);
        assert.deepEqual(codeState(page), NO_ERROR, `${label}：舊的錯誤不見了`);
        assert.deepEqual([page.$('joinModeBring').checked, page.$('joinModeClear').checked], [true, false], `${label}：預設帶進`);
        assertFocusOn(page, 'roomCodeInput', `${label}：焦點又在代號欄`);
        assert.equal(page.client.dialogs.opening, 3, label);
    }
});

test('已經在隊伍裡：按加入隊伍只跳「你已經在隊伍裡了，請先離開目前的隊伍。」、不開對話框；連線中、對話框已經開著時 openJoin() 什麼都不做，開著的對話框不會被重設', async () => {
    const page = await createParty(joiningServer().respond);
    page.addMaps(TWO);
    pressJoin(page);
    typeCode(page, 'ab1');
    chooseMode(page, 'clear', 'join');
    page.client.dialogs.openJoin();
    assert.deepEqual([page.$('roomCodeInput').value, page.$('joinModeClear').checked, page.client.dialogs.opening], ['ab1', true, 1], '打的代號與勾的選項還在，也沒有白白多算一次打開');
    page.key('Escape');

    page.client.isConnecting = true;
    page.client.dialogs.openJoin();
    assert.equal(joinOpen(page), false, '連線中不開');
    page.client.isConnecting = false;

    assert.deepEqual(plain(await page.client.joinRoom('ABC123')), { success: true });
    const opening = page.client.dialogs.opening;
    page.client.dialogs.openJoin();
    assert.deepEqual([joinOpen(page), page.client.dialogs.opening], [false, opening], '已經在隊伍裡不開');
    assert.deepEqual(page.toasts, [
        { message: '已加入隊伍 ABC123', type: 'success' },
        { message: '你已經在隊伍裡了，請先離開目前的隊伍。', type: 'warning' }
    ]);
});

test('舊的唯讀隊伍：對話框關掉，寶圖留在本機，只有 recoverLegacyRoom() 的警告（不再寫進對話框），焦點回到「加入隊伍」', async () => {
    const page = await createParty(() => ({ ...room([serverMap('old_0', 'creator')]), readOnly: true }));
    page.addMaps(['tm_017']);
    pressJoin(page);
    typeCode(page, 'abc123');
    await pressJoinConfirm(page);

    assert.equal(joinOpen(page), false);
    assert.equal(page.client.currentRoom, null);
    assert.deepEqual(page.toasts, [{ message: '這個隊伍已轉為唯讀，寶圖已保留在你的清單，請建立新的隊伍。', type: 'warning' }]);
    assert.deepEqual(codeState(page), NO_ERROR);
    assert.deepEqual(listIds(page).sort(), ['old_0', 'tm_017'], '自己的和唯讀隊伍的寶圖都留在本機');
    assertFocusOn(page, 'joinRoomBtn', '舊隊伍：焦點回到「加入隊伍」');
});

test('連線途中自己關掉對話框：成功照樣進隊伍（不用再關一次），焦點到複製邀請連結；失敗改跳 toast（不寫進已經關掉的對話框），焦點回到「加入隊伍」', async () => {
    const held = holdResponse(joiningServer().respond);
    const succeeded = await createParty(held.respond);
    pressJoin(succeeded);
    typeCode(succeeded, 'abc123');
    succeeded.$('confirmJoinBtn').focus();
    succeeded.$('confirmJoinBtn').click();
    succeeded.$('confirmJoinBtn').click();
    assert.equal(held.sent.length, 1, '連線中「加入」停用，再按不會再送一次');
    succeeded.key('Escape');
    assert.equal(joinOpen(succeeded), false, '連線中也關得掉');
    assert.equal(succeeded.client.currentRoom, null, '還沒連上');
    held.release();
    await succeeded.settle();
    assert.equal(succeeded.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(messages(succeeded), ['已加入隊伍 ABC123']);
    assertFocusOn(succeeded, 'copyInviteBtn', '連線途中關掉對話框，成功之後');
    assert.deepEqual(joinDisabledOf(succeeded), [false, false, false, false, false], '關掉的對話框也恢復了');

    const heldFailure = holdResponse(() => { throw roomError(503, 'UNAVAILABLE'); });
    const failed = await createParty(heldFailure.respond);
    spySelect(failed);
    pressJoin(failed);
    typeCode(failed, 'abc123');
    failed.$('confirmJoinBtn').focus();
    failed.$('confirmJoinBtn').click();
    failed.key('Escape');
    heldFailure.release();
    await failed.settle();
    assert.equal(failed.client.currentRoom, null);
    assert.deepEqual(failed.toasts, [{ message: NETWORK_ERROR, type: 'error' }]);
    assert.deepEqual(codeState(failed), NO_ERROR, '關掉的對話框裡沒有錯誤');
    assert.equal(joinOpen(failed), false);
    assertFocusOn(failed, 'joinRoomBtn', '失敗，對話框早就關了');
    assert.deepEqual(joinDisabledOf(failed), [false, false, false, false, false]);
});

test('對話框開著時切到英文（Review Focus 5）：說明與兩個選項重畫成英文、迷你清單換地名、玩家打的代號與勾的選項不動；顯示中的中文錯誤收起來，說明用新語言回來；再按一次錯誤用英文重新產生', async () => {
    const page = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
    page.addMaps(TWO);
    pressJoin(page);
    typeCode(page, 'abc123');
    chooseMode(page, 'clear', 'join');
    await pressJoinConfirm(page);
    assert.deepEqual(codeState(page), [NETWORK_ERROR, true, false, true, 'true']);
    const lede = page.$('joinPartyLede').firstChild;
    const rows = [...page.$('joinPartyList').children];

    page.setLang('en');
    assert.deepEqual(codeState(page), ['', false, true, false, null], '中文的錯誤收起來，說明回來');
    assert.equal(page.$('roomCodeHint').textContent, "6 letters and numbers — ask your party leader. No need to type it if you open the leader's invite link.");
    assert.equal(page.$('joinPartyLede').textContent, 'Maps in your list: 2');
    assert.deepEqual(['joinModeBringTitle', 'joinModeBringHint', 'joinModeClearTitle', 'joinModeClearHint'].map((id) => page.$(id).textContent),
        ['Bring them into the party list', 'Your party sees them too, marked as yours', "Don't bring them — clear your list (2)", 'Use only the party list']);
    assert.deepEqual(page.$('joinPartyList').children.map((row) => row.textContent), ["G17 Kozama'uka (20.0, 6.9)", 'G17 Urqopacha (13.7, 14.2)']);
    assert.ok(page.$('joinPartyList').children.every((row, index) => row !== rows[index]), '地名是語言的字，迷你清單重建');
    assert.equal(page.$('joinPartyLede').firstChild !== lede, true);
    // 由 [data-i18n] 換的固定字也跟著換
    assert.deepEqual(['joinRoomModal-title', 'confirmJoinBtn', 'cancelJoinBtn'].map((id) => page.$(id).textContent), ['Join a party', 'Join', 'Cancel']);
    assert.equal(page.$('roomCodeInput').getAttribute('placeholder'), 'e.g., A3B7K9');
    // 玩家打的代號、已經勾的「不帶」不動，對話框還開著、可以按
    assert.deepEqual([page.$('roomCodeInput').value, page.$('joinModeClear').checked, joinOpen(page), page.$('confirmJoinBtn').disabled], ['abc123', true, true, false]);
    // 內容沒變時重畫不重寫：同一個文字節點、同一批迷你清單的列
    const settled = { lede: page.$('joinPartyLede').firstChild, rows: [...page.$('joinPartyList').children] };
    page.client.dialogs.refresh();
    assert.ok(page.$('joinPartyLede').firstChild === settled.lede);
    assert.ok(page.$('joinPartyList').children.every((row, index) => row === settled.rows[index]));

    await pressJoinConfirm(page);
    assert.equal(page.$('roomCodeError').textContent, "Can't reach the party server. Please try again later.");
    page.setLang('ja');
    assert.deepEqual(codeState(page), ['', false, true, false, null]);
    assert.equal(page.$('roomCodeHint').textContent, '英数字 6 文字。リーダーに聞いてください。リーダーの招待リンクを開けば入力は不要です。');
    assert.equal(page.$('joinPartyLede').textContent, 'あなたのリストには地図が 2 枚あります：');
    assert.deepEqual(['joinModeBringTitle', 'joinModeBringHint', 'joinModeClearTitle', 'joinModeClearHint'].map((id) => page.$(id).textContent),
        ['パーティリストに持ち込む', 'メンバーにも表示され、あなたの地図として表示されます', '持ち込まない（2 枚を消す）', 'パーティリストだけを使う']);
    assert.deepEqual(['joinRoomModal-title', 'confirmJoinBtn'].map((id) => page.$(id).textContent), ['パーティに参加', '参加']);
    assert.equal(page.$('joinModeClear').checked, true);
});

test('連線中切換語言：選項與「加入」還是停用（重畫不能把它們解開），連線結束後照常收尾；對話框關著時切換語言什麼都不做', async () => {
    const held = holdResponse(joiningServer().respond);
    const page = await createParty(held.respond);
    page.addMaps(TWO);
    page.setLang('en');
    assert.equal(page.$('joinPartyLede').textContent, '', '沒開著的對話框不重畫');
    page.setLang('zh');
    pressJoin(page);
    typeCode(page, 'abc123');
    page.$('confirmJoinBtn').focus();
    page.$('confirmJoinBtn').click();
    page.setLang('en');
    assert.deepEqual(joinDisabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmJoinBtn').classList.contains('btn-loading'), true);
    held.release();
    await page.settle();
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(joinOpen(page), false);
    assert.deepEqual(joinDisabledOf(page), [false, false, false, false, false]);
});

// ---------- 離開隊伍：留在我的清單或清空，進行中、失敗與輪詢都寫在對話框裡 ----------
const ISO = '2026-10-17T00:00:00.000Z';
// 伺服器替身：建立隊伍（initialMaps 收進去，addedBy 是自己，隊長也是自己）、離開、移出成員、送出變更，並記下每一次的請求。
// leave、removeMember、update、read（輪詢讀隊伍）是函式（收到 options；回傳值是回應，丟出的錯誤是失敗），沒給的請求一律丟錯
const partyServer = ({ leave = () => ({ message: 'Left' }), removeMember = () => { throw new Error('unexpected remove-member'); },
    update = () => { throw new Error('unexpected PUT'); }, read = null } = {}) => {
    const requests = [];
    return {
        requests,
        respond: (path, options) => {
            const method = options.method ?? 'GET';
            requests.push({ method, path, body: options.body, authenticated: options.authenticated });
            if (path === '/rooms' && method === 'POST') {
                const me = { ...ME, nickname: options.body.memberNickname };
                const maps = options.body.initialMaps.map((map) => ({ ...map, addedBy: me.id, addedAt: ISO }));
                return { ...room(maps, [me]), creatorId: me.id, memberId: me.id, memberToken: TOKEN };
            }
            if (path === '/rooms/ABC123/leave' && method === 'POST') return leave(options);
            if (path === '/rooms/ABC123/remove-member' && method === 'POST') return removeMember(options);
            if (path === '/rooms/ABC123' && method === 'PUT') return update(options);
            if (path === '/rooms/ABC123' && method === 'GET' && read) return read(options);
            throw new Error(`unexpected ${method} ${path}`);
        }
    };
};
const leaveRequests = (server) => server.requests.filter((request) => request.path === '/rooms/ABC123/leave');
// 隊伍清單裡放 count 張寶圖（自己加的，id 是 map_1、map_2…）：用輪詢收到新資料的方式放進去，不經過伺服器
const putMaps = (page, count) => serverChanges(page, { treasureMaps: Array.from({ length: count }, (_, index) => serverMap(`map_${index + 1}`, 'me')) });
// 離開對話框現在開著嗎（ModalManager 認得它，而且看得到）
const leaveOpen = (page) => page.client.dialogs.modalManager.activeModal === page.$('leaveRoomModal') && !isHidden(page, 'leaveRoomModal');
// 打開面板、焦點在「離開隊伍」上、按下去
const pressLeave = (page) => {
    page.finder.openListPanel();
    page.$('leaveRoomBtn').focus();
    page.$('leaveRoomBtn').click();
};
// 玩家按對話框的「離開隊伍」：焦點在那顆鈕上（進行中它停用，停用之前焦點先移到 ✕），等結束
const pressLeaveConfirm = async (page) => {
    page.$('confirmLeaveBtn').focus();
    page.$('confirmLeaveBtn').click();
    await page.settle();
};
// 對話框裡會因為進行中而停用的控制項，依序是 [留在我的清單, 清空, 離開隊伍, 取消, ✕]：取消與 ✕ 進行中還能按
const LEAVE_CONTROLS = ['leaveModeKeep', 'leaveModeClear', 'confirmLeaveBtn', 'cancelLeaveBtn', 'closeLeaveModalBtn'];
const leaveDisabledOf = (page) => LEAVE_CONTROLS.map((id) => page.$(id).disabled);
const LEADER_NOTE = '你是隊長。離開後沒有人能移出成員（隊長不會轉給別人）。';
const LAST_NOTE = '你是最後一位成員，離開後隊伍就解散了。';
const LEAVE_FAILED = '離開失敗，請稍後再試。';
const SYNC_FAILED = '你的變更還沒送出，請稍後再試。';
// [隊長的說明, 解散的說明] 現在顯示著嗎
const notesShown = (page) => [!isHidden(page, 'leaveLeaderNote'), !isHidden(page, 'leaveLastNote')];

test('離開對話框：預設勾留在我的清單；確認 → POST leave、清單還在、對話框關掉、toast「已離開隊伍」、焦點到建立隊伍', async () => {
    const server = partyServer();
    const page = await createdParty({ respond: server.respond });
    putMaps(page, 2);
    pressLeave(page);

    assert.ok(leaveOpen(page));
    const text = (id) => page.$(id).textContent;
    assert.equal(text('leaveRoomModal-title'), '離開隊伍');
    assert.equal(text('leaveLede'), '隊伍清單的 2 張寶圖：');
    assert.equal(isHidden(page, 'leaveChoice'), false);
    assert.equal(page.$('leaveChoice').querySelector('legend').textContent, '隊伍清單的寶圖要怎麼處理');
    assert.deepEqual(page.$('leaveChoice').querySelectorAll('.tm-choice-title').map((element) => element.textContent), ['留在我的清單', '清空']);
    assert.deepEqual(page.$('leaveChoice').querySelectorAll('.tm-choice-hint').map((element) => element.textContent), ['離開後還是可以照這份清單跑', '清單從空的開始']);
    assert.deepEqual([page.$('leaveModeKeep').checked, page.$('leaveModeClear').checked], [true, false], '預設留在我的清單');
    assert.equal(isHidden(page, 'leaveError'), true);
    assert.deepEqual(leaveDisabledOf(page), [false, false, false, false, false]);
    assert.equal(text('confirmLeaveBtn'), '離開隊伍');
    assert.deepEqual(leaveRequests(server), [], '還沒按確認，不送任何請求');

    await pressLeaveConfirm(page);
    assert.equal(leaveRequests(server).length, 1);
    assert.equal(leaveRequests(server)[0].authenticated, true);
    assert.match(leaveRequests(server)[0].body.clientRequestId, /^[a-f0-9-]{36}$/);
    assert.equal(page.client.currentRoom, null);
    assert.deepEqual(listIds(page), ['map_1', 'map_2'], '留在我的清單：離開之後清單還在');
    assert.equal(leaveOpen(page), false);
    assert.deepEqual([page.$('leaveRoomModal').classList.contains('hidden'), page.$('leaveRoomModal').style.display], [true, '']);
    assert.equal(isHidden(page, 'roomSection'), true, '離開了：隊伍狀態藏起來');
    assert.equal(isHidden(page, 'teamActions'), false);
    assert.deepEqual(page.toasts.slice(1), [{ message: '已離開隊伍', type: 'success' }]);
    assertFocusOn(page, 'createRoomBtn', '離開成功');
    assert.deepEqual(leaveDisabledOf(page), [false, false, false, false, false], '下次打開不會卡在進行中');
    assert.equal(page.$('confirmLeaveBtn').classList.contains('btn-loading'), false);
    assert.equal(page.client.dialogs.opening, 2, '打開一次、關閉一次（隊伍沒了時的關閉也算）');
});

test('離開進行中：選項與離開鈕停用、離開鈕轉圈（取消與 ✕ 還能按）、對話框不關；再按只送一個請求；結束後恢復', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const server = partyServer({ leave: async () => { await gate; return { message: 'Left' }; } });
    const page = await createdParty({ respond: server.respond });
    pressLeave(page);
    page.$('confirmLeaveBtn').focus();
    page.$('confirmLeaveBtn').click();
    page.$('confirmLeaveBtn').click();
    assert.deepEqual(leaveDisabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmLeaveBtn').classList.contains('btn-loading'), true);
    assert.ok(leaveOpen(page), '成功之前對話框不關');
    assertFocusOn(page, 'closeLeaveModalBtn', '離開鈕停用之前焦點先移到 ✕，不會掉到 body');

    // 回應還沒回來：再按一次也不會讓它提早恢復、不會冒出錯誤（停用的確認鈕不接受，程式直接呼叫也一樣）
    await page.client.dialogs.confirmLeave();
    await page.settle();
    assert.deepEqual(leaveDisabledOf(page), [true, true, true, false, false], '回應回來之前還是進行中');
    assert.equal(isHidden(page, 'leaveError'), true);
    assert.equal(leaveRequests(server).length, 1);

    release();
    await page.settle();
    assert.equal(leaveRequests(server).length, 1, '進行中離開鈕停用，再按不會再送一次');
    assert.equal(page.client.currentRoom, null);
    assert.equal(leaveOpen(page), false);
    assert.deepEqual(leaveDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.$('confirmLeaveBtn').classList.contains('btn-loading'), false);
    assertFocusOn(page, 'createRoomBtn', '離開成功');
});

test('選清空 → 清單是空的（決定只看「清空」那顆有沒有勾），隊伍沒了、焦點到建立隊伍', async () => {
    const server = partyServer();
    const page = await createdParty({ respond: server.respond });
    putMaps(page, 2);
    pressLeave(page);
    // fake-dom 的 radio 不會互斥：只勾「清空」，「留在我的清單」那顆還勾著
    page.$('leaveModeClear').checked = true;
    await pressLeaveConfirm(page);

    assert.equal(leaveRequests(server).length, 1);
    assert.equal(page.client.currentRoom, null);
    assert.equal(page.finder.listManager.getLength(), 0, '清空：離開之後清單是空的');
    assert.equal(leaveOpen(page), false);
    assert.equal(page.toasts.at(-1).message, '已離開隊伍');
    assertFocusOn(page, 'createRoomBtn', '清空離開');
});

test('每次打開都從頭開始：預設留在我的清單、沒有舊的錯誤；取消、✕、Escape 都只關對話框（不送請求、不動清單），焦點回到「離開隊伍」', async () => {
    const server = partyServer();
    const page = await createdParty({ respond: server.respond });
    putMaps(page, 2);
    const closers = {
        取消: () => page.$('cancelLeaveBtn').click(),
        '✕': () => page.$('closeLeaveModalBtn').click(),
        Escape: () => page.key('Escape')
    };
    for (const [label, close] of Object.entries(closers)) {
        pressLeave(page);
        assert.ok(leaveOpen(page), label);
        // 勾了清空、寫上一個錯誤，關掉
        page.$('leaveModeClear').checked = true;
        page.$('leaveModeKeep').checked = false;
        page.client.dialogs.showLeaveError('舊的錯誤');
        close();
        assert.equal(leaveOpen(page), false, `${label}：對話框關了`);
        assert.deepEqual([page.$('leaveRoomModal').classList.contains('hidden'), page.$('leaveRoomModal').style.display], [true, ''], label);
        assertFocusOn(page, 'leaveRoomBtn', `${label}：焦點還給按下去的「離開隊伍」`);
        assert.equal(page.client.currentRoom.roomCode, 'ABC123', `${label}：還在隊伍裡`);
        assert.equal(page.finder.listManager.getLength(), 2, `${label}：清單沒動`);
    }
    assert.deepEqual(leaveRequests(server), []);

    // 再打開是乾淨的
    pressLeave(page);
    assert.deepEqual([page.$('leaveModeKeep').checked, page.$('leaveModeClear').checked], [true, false]);
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [true, '']);
});

test('自己是隊長而且還有別人：顯示隊長的說明；只剩自己：顯示解散的說明（這時不顯示隊長的說明）；隊友進出時跟著換', async () => {
    const page = await crowdedParty({ respond: partyServer().respond });
    pressLeave(page);
    assert.deepEqual(notesShown(page), [true, false]);
    assert.equal(page.$('leaveLeaderNote').textContent, LEADER_NOTE);

    // 隊友都離開了（輪詢）：換成解散的說明，隊長的說明收起來
    serverChanges(page, { members: [ME] });
    assert.deepEqual(notesShown(page), [false, true]);
    assert.equal(page.$('leaveLastNote').textContent, LAST_NOTE);

    // 隊友又加入：換回來
    serverChanges(page, { members: [ME, M4X] });
    assert.deepEqual(notesShown(page), [true, false]);

    // 不是隊長、隊裡還有別人：兩個說明都不顯示
    const lead = { id: 'lead', nickname: '光之戰士T8W', joinedAt: '2026-10-17T00:00:30.000Z' };
    const member = await createParty(joinsParty({ creatorId: 'lead', members: [lead, M4X] }), { stored: { ff14tw_nickname_tag: 'K7Q' } });
    assert.equal((await member.client.joinRoom('ABC123')).success, true);
    pressLeave(member);
    assert.ok(leaveOpen(member));
    assert.deepEqual(notesShown(member), [false, false]);
});

test('隊長已經離開（creatorId 不在成員裡）：兩個說明都不顯示，不丟例外（Review Focus 2）；只剩自己時才寫解散的說明', async () => {
    const page = await createParty(joinsParty({ creatorId: 'gone', members: [M4X, R6V], treasureMaps: [serverMap('map_1', 'gone'), serverMap('map_2', 'm4x')] }),
        { stored: { ff14tw_nickname_tag: 'K7Q' } });
    const result = await page.client.joinRoom('ABC123');
    assert.deepEqual(plain(result), { success: true });
    pressLeave(page);
    assert.ok(leaveOpen(page));
    assert.deepEqual(notesShown(page), [false, false], '沒有隊長可以說，隊裡也還有別人');
    assert.equal(page.$('leaveLede').textContent, '隊伍清單的 2 張寶圖：');

    // 其他人也都離開了、隊長還是不在：只剩自己，寫解散的說明；輪詢的重畫不丟例外
    serverChanges(page, { members: [ME] });
    assert.deepEqual(notesShown(page), [false, true]);
});

test('隊伍清單是空的：沒有選項，寫「確定要離開隊伍 ABC123？」；按離開照樣離開；之後清單多了寶圖，選項回來', async () => {
    const server = partyServer();
    const page = await createdParty({ respond: server.respond });
    pressLeave(page);
    assert.equal(page.$('leaveLede').textContent, '確定要離開隊伍 ABC123？');
    assert.equal(isHidden(page, 'leaveChoice'), true);
    assert.equal(isHidden(page, 'leaveError'), true);

    // 隊友加了一張圖：換成有選項的樣子
    putMaps(page, 1);
    assert.equal(page.$('leaveLede').textContent, '隊伍清單的 1 張寶圖：');
    assert.equal(isHidden(page, 'leaveChoice'), false);
    serverChanges(page, { treasureMaps: [] });
    assert.equal(page.$('leaveLede').textContent, '確定要離開隊伍 ABC123？');
    assert.equal(isHidden(page, 'leaveChoice'), true);

    await pressLeaveConfirm(page);
    assert.equal(leaveRequests(server).length, 1);
    assert.equal(page.client.currentRoom, null);
    assert.equal(leaveOpen(page), false);
    assertFocusOn(page, 'createRoomBtn', '空清單離開');
});

test('對話框開著時輪詢改了張數：說明跟著換，沒變的字不重寫，玩家勾的選項不動；焦點在選項上而選項整組藏起來時，焦點移到取消', async () => {
    const page = await createdParty({ respond: partyServer().respond });
    putMaps(page, 2);
    pressLeave(page);
    page.$('leaveModeClear').checked = true;
    assert.equal(page.$('leaveLede').textContent, '隊伍清單的 2 張寶圖：');

    putMaps(page, 3);
    assert.equal(page.$('leaveLede').textContent, '隊伍清單的 3 張寶圖：');
    assert.equal(page.$('leaveModeClear').checked, true, '玩家勾的選項不動');

    // 只有 revision 變：同樣的字不重寫（輪詢每兩秒來一次，螢幕閱讀器不該一直重唸）
    const lede = page.$('leaveLede').firstChild;
    const note = page.$('leaveLastNote').firstChild;
    serverChanges(page, {});
    serverChanges(page, {});
    assert.ok(page.$('leaveLede').firstChild === lede && page.$('leaveLastNote').firstChild === note, '同樣的字不重寫');

    // 焦點在選項上時，隊友把清單清空：整組選項藏起來，焦點不能掉到 body
    page.$('leaveModeClear').focus();
    assertFocusOn(page, 'leaveModeClear', '前提');
    serverChanges(page, { treasureMaps: [] });
    assert.equal(isHidden(page, 'leaveChoice'), true);
    assertFocusOn(page, 'cancelLeaveBtn', '選項藏起來了，焦點移到取消');
    assert.ok(leaveOpen(page));
});

test('變更還沒送完：錯誤寫在對話框裡（你的變更還沒送出…）、人還在隊伍裡、沒有送離開的請求、不跳離開失敗的 toast；送出去之後再按就離開了', async () => {
    let sendable = false;
    let page;
    const server = partyServer({
        update: ({ body }) => {
            if (!sendable) throw new TypeError('Failed to fetch');
            const current = page.client.currentRoom;
            return { ...current, revision: current.revision + 1,
                treasureMaps: [...current.treasureMaps, ...body.operations.filter((operation) => operation.type === 'add').map((operation) => ({ ...operation.map, addedBy: 'me', addedAt: ISO }))] };
        }
    });
    page = await createdParty({ respond: server.respond });
    // 一筆還沒送出的變更（隊友還看不到）
    page.client.mapSync.pending.push({ clientRequestId: 'pending-1', operations: [{ type: 'add', map: serverMap('map_9', 'me') }] });
    pressLeave(page);
    await pressLeaveConfirm(page);

    assert.ok(leaveOpen(page), '失敗：對話框不關');
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [false, SYNC_FAILED]);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123', '還在隊伍裡');
    assert.deepEqual(leaveRequests(server), [], '變更沒送完，離開的請求還沒送');
    assert.ok(messages(page).every((message) => !message.includes('還沒送出') && message !== '已離開隊伍'), `錯誤在對話框裡，不跳 toast：${messages(page)}`);
    assert.deepEqual(leaveDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.$('confirmLeaveBtn').classList.contains('btn-loading'), false);
    assertFocusOn(page, 'confirmLeaveBtn', '進行中焦點在 ✕，失敗之後放回離開鈕');
    assert.equal(page.client.mapSync.pending.length, 1, '那筆變更還在，等著重送');

    // 網路好了：再按一次，先把變更送完，再離開
    sendable = true;
    await pressLeaveConfirm(page);
    assert.deepEqual(server.requests.map(({ method, path }) => `${method} ${path}`).slice(-2), ['PUT /rooms/ABC123', 'POST /rooms/ABC123/leave']);
    assert.equal(page.client.currentRoom, null);
    assert.equal(leaveOpen(page), false);
    assert.equal(page.toasts.at(-1).message, '已離開隊伍');
    assertFocusOn(page, 'createRoomBtn', '重試成功');
});

test('離開請求失敗（連不上）：錯誤寫在對話框裡、不跳 toast、還在隊伍裡；輪詢重畫不會把錯誤收起來；再按一次錯誤先收起來，成功就離開了', async () => {
    let failing = true;
    const server = partyServer({ leave: () => { if (failing) throw roomError(503, 'UNAVAILABLE'); return { message: 'Left' }; } });
    const page = await createdParty({ respond: server.respond });
    putMaps(page, 2);
    pressLeave(page);
    await pressLeaveConfirm(page);

    assert.ok(leaveOpen(page), '失敗：對話框不關');
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [false, LEAVE_FAILED]);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！'], '錯誤寫在對話框裡，不跳 toast');
    assert.deepEqual(leaveDisabledOf(page), [false, false, false, false, false]);
    assertFocusOn(page, 'confirmLeaveBtn', '失敗之後放回離開鈕');
    assert.equal(page.finder.listManager.getLength(), 2, '清單沒動');

    // 輪詢每兩秒重畫一次：錯誤要留著，不然玩家還沒讀完就不見了
    serverChanges(page, {});
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [false, LEAVE_FAILED]);

    failing = false;
    page.$('confirmLeaveBtn').focus();
    page.$('confirmLeaveBtn').click();
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [true, ''], '再按一次先收起舊的錯誤');
    await page.settle();
    assert.equal(leaveRequests(server).length, 2);
    assert.equal(page.client.currentRoom, null);
    assert.equal(leaveOpen(page), false);
    assertFocusOn(page, 'createRoomBtn', '重試成功');
});

test('離開時伺服器已經不認得我（401、403、404）：當作已經離開了，照常關對話框、跳「已離開隊伍」、焦點到建立隊伍', async () => {
    for (const status of [401, 403, 404]) {
        const server = partyServer({ leave: () => { throw roomError(status, 'GONE'); } });
        const page = await createdParty({ respond: server.respond });
        pressLeave(page);
        await pressLeaveConfirm(page);
        assert.equal(page.client.currentRoom, null, status);
        assert.equal(leaveOpen(page), false, status);
        assert.equal(page.toasts.at(-1).message, '已離開隊伍', status);
        assertFocusOn(page, 'createRoomBtn', `${status}`);
    }
});

test('離開途中自己按 Escape 關掉對話框：成功照樣離開（焦點到建立隊伍）；失敗改跳 toast，不寫進已經關掉的對話框', async () => {
    for (const succeed of [true, false]) {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const server = partyServer({ leave: async () => { await gate; if (!succeed) throw roomError(503, 'UNAVAILABLE'); return { message: 'Left' }; } });
        const page = await createdParty({ respond: server.respond });
        pressLeave(page);
        page.$('confirmLeaveBtn').focus();
        page.$('confirmLeaveBtn').click();
        page.key('Escape');
        assert.equal(leaveOpen(page), false, '進行中玩家自己關掉了');
        assertFocusOn(page, 'leaveRoomBtn', 'Escape 把焦點還給按下去的「離開隊伍」');

        release();
        await page.settle();
        if (succeed) {
            assert.equal(page.client.currentRoom, null);
            assert.equal(page.toasts.at(-1).message, '已離開隊伍');
            assertFocusOn(page, 'createRoomBtn', '成功');
        } else {
            assert.equal(page.client.currentRoom.roomCode, 'ABC123', '失敗：還在隊伍裡');
            assert.deepEqual(page.toasts.at(-1), { message: LEAVE_FAILED, type: 'error' });
            assert.equal(isHidden(page, 'leaveError'), true, '沒有東西寫進已經關掉的對話框');
            assert.equal(leaveOpen(page), false);
        }
    }
});

test('離開對話框開著時切到英文（Review Focus 5）：說明與隊長的說明換成英文，單選的固定字也是英文；顯示中的中文錯誤收起來，再按一次用英文重新產生', async () => {
    let failing = true;
    const server = partyServer({ leave: () => { if (failing) throw roomError(503, 'UNAVAILABLE'); return { message: 'Left' }; } });
    const page = await crowdedParty({ respond: server.respond });
    pressLeave(page);
    page.$('leaveModeClear').checked = true;
    await pressLeaveConfirm(page);
    assert.equal(page.$('leaveError').textContent, LEAVE_FAILED);

    page.setLang('en');
    assert.equal(page.$('leaveRoomModal-title').textContent, 'Leave the party');
    assert.equal(page.$('leaveLede').textContent, 'Maps in the party list: 4');
    assert.equal(page.$('leaveLeaderNote').textContent, 'You\'re the leader. After you leave, no one can remove members (leadership isn\'t passed on).');
    assert.equal(page.$('leaveChoice').querySelector('legend').textContent, 'What to do with the party list\'s maps');
    assert.deepEqual(page.$('leaveChoice').querySelectorAll('.tm-choice-title').map((element) => element.textContent), ['Keep them in my list', 'Clear them']);
    assert.equal(page.$('confirmLeaveBtn').textContent, 'Leave party');
    assert.deepEqual([isHidden(page, 'leaveError'), page.$('leaveError').textContent], [true, ''], '舊語言的錯誤收起來');
    assert.equal(page.$('leaveModeClear').checked, true, '玩家勾的選項不動');

    await pressLeaveConfirm(page);
    assert.equal(page.$('leaveError').textContent, 'Couldn\'t leave the party. Please try again later.', '再按一次，錯誤用英文重新產生');

    // 日文，最後一位成員的說明
    page.setLang('ja');
    serverChanges(page, { members: [ME] });
    assert.equal(page.$('leaveLede').textContent, 'パーティリストの地図 4 枚：');
    assert.equal(page.$('leaveLastNote').textContent, 'あなたが最後のメンバーです。抜けるとパーティは解散します。');
    assert.equal(page.$('leaveRoomModal-title').textContent, 'パーティを抜ける');
});

test('離開與移出的對話框關著時切換語言什麼都不做；openLeave() 不在隊伍裡、對話框已經開著時什麼都不做（不重設玩家勾的選項）', async () => {
    const page = await createdParty({ respond: partyServer().respond });
    page.setLang('en');
    assert.deepEqual(['leaveLede', 'removeMemberModal-title', 'removeMemberBody'].map((id) => page.$(id).textContent), ['', '', ''], '關著的對話框不畫');
    page.setLang('zh');

    pressLeave(page);
    page.$('leaveModeClear').checked = true;
    page.$('leaveModeKeep').checked = false;
    page.client.showLeaveRoomDialog();
    assert.deepEqual([page.$('leaveModeKeep').checked, page.$('leaveModeClear').checked], [false, true], '已經開著：不重設');
    assert.equal(page.client.dialogs.opening, 1, '沒有再開一次');

    page.client.dialogs.close(page.$('leaveRoomModal'));
    page.client.forceLeaveRoom();
    page.client.showLeaveRoomDialog();
    assert.equal(leaveOpen(page), false, '不在隊伍裡：沒有東西可開');
});

// ---------- 隊伍沒了：只在隊伍裡才有意義的對話框一起關掉 ----------
test('隊伍沒了（輪詢發現自己不在成員裡）：開著的離開、移出、改名對話框一起關掉，不留一顆按了也沒用的確認鈕；toast 說得出原因，焦點到又出現的「建立隊伍」', async () => {
    const SESSION_EXPIRED = '隊伍連線已失效，可能是被移出了隊伍。寶圖留在你的清單；要回去可以再點一次邀請連結，或輸入隊伍代號。';
    const dialogs = {
        離開: { modal: 'leaveRoomModal', open: (page) => pressLeave(page) },
        移出: { modal: 'removeMemberModal', open: (page) => pressRemove(page, 'm4x') },
        改名: { modal: 'editNicknameModal', open: (page) => { stubSelect(page); expand(page); const button = buttonOf(page, 'me', 'rename'); button.focus(); button.click(); } }
    };
    for (const [label, { modal, open }] of Object.entries(dialogs)) {
        const page = await crowdedParty();
        open(page);
        assert.equal(isHidden(page, modal), false, `${label}：前提，對話框開著`);
        const managers = [page.client.modalManager, page.client.dialogs.modalManager];
        assert.ok(managers.some((manager) => manager.activeModal === page.$(modal)), `${label}：前提，ModalManager 認得它`);

        // 隊長把自己移出了（成員裡沒有自己）
        serverChanges(page, { members: [M4X, R6V] });
        assert.equal(page.client.currentRoom, null, label);
        assert.deepEqual([page.$(modal).classList.contains('hidden'), page.$(modal).style.display], [true, ''], `${label}：對話框關了`);
        assert.ok(managers.every((manager) => manager.activeModal === null), `${label}：ModalManager 也放掉了`);
        assert.deepEqual(page.toasts.at(-1), { message: SESSION_EXPIRED, type: 'warning' }, label);
        assert.equal(isHidden(page, 'roomSection'), true, label);
        assertFocusOn(page, 'createRoomBtn', `${label}：隊伍沒了，焦點到又出現的「建立隊伍」`);
    }
});

test('forceLeaveRoom() 只關離開、移出、改名的對話框，不關建立與加入隊伍的（邀請連結的對話框也一樣：切換隊伍時離開 A 之後它還要留著）', async () => {
    const joining = await createParty(creates);
    pressJoin(joining);
    assert.ok(joinOpen(joining));
    joining.client.forceLeaveRoom();
    assert.ok(joinOpen(joining), '加入隊伍的對話框還開著');

    const creating = await createParty(creates);
    creating.addMaps(TWO);
    pressCreate(creating);
    assert.ok(createOpen(creating));
    creating.client.forceLeaveRoom();
    assert.ok(createOpen(creating), '建立隊伍的對話框還開著');
});

// ---------- 移出成員 ----------
// 移出對話框現在開著嗎（ModalManager 認得它，而且看得到）
const removeOpen = (page) => page.client.dialogs.modalManager.activeModal === page.$('removeMemberModal') && !isHidden(page, 'removeMemberModal');
// 展開成員列表（還沒展開的話）、焦點在那位成員的「移出」上、按下去
const pressRemove = (page, id) => {
    if (page.$('membersToggle').getAttribute('aria-expanded') !== 'true') expand(page);
    const button = buttonOf(page, id, 'remove');
    button.focus();
    button.click();
    return button;
};
// 對話框裡會因為進行中而停用的控制項，依序是 [移出, 取消, ✕]
const REMOVE_CONTROLS = ['confirmRemoveBtn', 'cancelRemoveBtn', 'closeRemoveModalBtn'];
const removeDisabledOf = (page) => REMOVE_CONTROLS.map((id) => page.$(id).disabled);
const REMOVE_FAILED = '移出失敗，請稍後再試。';
const REJOIN = '對方之後還是可以用代號或邀請連結重新加入。';
// 伺服器收下移出：回傳少了那位成員的隊伍（revision 加一）。page 在建好之後才有，所以用函式拿
const removing = (getPage) => ({ body }) => {
    const current = getPage().client.currentRoom;
    return { ...current, members: current.members.filter((item) => item.id !== body.targetMemberId), revision: current.revision + 1 };
};

test('隊長按移出：標題「把 光之戰士M4X 移出隊伍？」、內文帶他加的張數；確認 → POST remove-member、對話框關掉、toast、焦點到成員那一行', async () => {
    let page;
    const server = partyServer({ removeMember: removing(() => page) });
    page = await crowdedParty({ respond: server.respond });
    const removeRequests = () => server.requests.filter((request) => request.path === '/rooms/ABC123/remove-member');
    pressRemove(page, 'm4x');

    assert.ok(removeOpen(page));
    assert.equal(page.$('removeMemberModal-title').textContent, '把 光之戰士M4X 移出隊伍？');
    assert.equal(page.$('removeMemberBody').textContent, `對方加的 1 張寶圖會留在隊伍清單。${REJOIN}`);
    assert.equal(page.client.dialogs.removing, 'm4x');
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('confirmRemoveBtn').textContent, page.$('cancelRemoveBtn').textContent], [true, '移出', '取消']);
    assert.deepEqual(removeDisabledOf(page), [false, false, false]);
    assert.deepEqual(removeRequests(), [], '還沒按確認，不送任何請求（也沒有跳瀏覽器的確認視窗：頁面替身的 confirm() 一被呼叫就丟錯）');

    page.$('confirmRemoveBtn').focus();
    page.$('confirmRemoveBtn').click();
    page.$('confirmRemoveBtn').click();
    // 進行中：移出鈕停用且轉圈，取消與 ✕ 還能按，成功之前對話框不關；停用的移出鈕不接受再按一次
    assert.deepEqual(removeDisabledOf(page), [true, false, false]);
    assert.equal(page.$('confirmRemoveBtn').classList.contains('btn-loading'), true);
    assert.ok(removeOpen(page));
    assertFocusOn(page, 'closeRemoveModalBtn', '移出鈕停用之前焦點先移到 ✕，不會掉到 body');
    await page.settle();

    assert.equal(removeRequests().length, 1, '只送一個請求');
    assert.equal(messages(page).filter((message) => message.startsWith('已將')).length, 1, '只跳一次 toast');
    assert.deepEqual([removeRequests()[0].body.targetMemberId, removeRequests()[0].authenticated], ['m4x', true]);
    assert.match(removeRequests()[0].body.clientRequestId, /^[a-f0-9-]{36}$/);
    assert.equal(removeOpen(page), false);
    assert.deepEqual([page.$('removeMemberModal').classList.contains('hidden'), page.$('removeMemberModal').style.display], [true, '']);
    assert.deepEqual(removeDisabledOf(page), [false, false, false], '下次打開不會卡在進行中');
    assert.equal(page.$('confirmRemoveBtn').classList.contains('btn-loading'), false);
    assert.equal(rowOf(page, 'm4x'), undefined, '那位成員不在了');
    assert.equal(page.$('membersCount').textContent, '成員 2/8');
    assert.deepEqual(page.toasts.at(-1), { message: '已將 光之戰士M4X 移出隊伍', type: 'success' });
    assertFocusOn(page, 'membersToggle', '被移出那一列的按鈕已經不在了，焦點到成員那一行');
    assert.equal(page.client.dialogs.removing, null);
    assert.equal(page.client.dialogs.opening, 2, '打開一次、關閉一次');
});

test('移出失敗：錯誤寫在對話框裡（移出失敗，請稍後再試。）、不跳 toast、對話框不關、人還在隊伍裡、焦點回到「移出」；輪詢重畫不會把錯誤收起來；再按一次成功就移出了', async () => {
    let failing = true;
    let page;
    const removeMember = removing(() => page);
    const server = partyServer({ removeMember: (options) => { if (failing) throw roomError(503, 'UNAVAILABLE'); return removeMember(options); } });
    page = await crowdedParty({ respond: server.respond });
    pressRemove(page, 'm4x');
    const toastsBefore = messages(page).length;
    page.$('confirmRemoveBtn').focus();
    page.$('confirmRemoveBtn').click();
    await page.settle();

    assert.ok(removeOpen(page), '失敗：對話框不關');
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('removeMemberError').textContent], [false, REMOVE_FAILED]);
    assert.equal(messages(page).length, toastsBefore, '錯誤寫在對話框裡，不跳 toast');
    assert.ok(rowOf(page, 'm4x'), '他還在隊伍裡');
    assert.deepEqual(removeDisabledOf(page), [false, false, false]);
    assert.equal(page.$('confirmRemoveBtn').classList.contains('btn-loading'), false);
    assertFocusOn(page, 'confirmRemoveBtn', '進行中焦點在 ✕，失敗之後放回移出鈕');

    // 輪詢每兩秒重畫一次：錯誤要留著
    serverChanges(page, {});
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('removeMemberError').textContent], [false, REMOVE_FAILED]);

    failing = false;
    page.$('confirmRemoveBtn').focus();
    page.$('confirmRemoveBtn').click();
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('removeMemberError').textContent], [true, ''], '再按一次先收起舊的錯誤');
    await page.settle();
    assert.equal(removeOpen(page), false);
    assert.equal(rowOf(page, 'm4x'), undefined);
    assert.equal(page.toasts.at(-1).message, '已將 光之戰士M4X 移出隊伍');
    assertFocusOn(page, 'membersToggle', '重試成功');
});

test('對話框開著時那個人已經被輪詢拿掉（自己離開了）：對話框關掉、焦點到成員那一行，不送請求、不跳 toast', async () => {
    const server = partyServer();
    const page = await crowdedParty({ respond: server.respond });
    pressRemove(page, 'm4x');
    assert.ok(removeOpen(page));
    const toastsBefore = messages(page).length;

    serverChanges(page, { members: [ME, R6V] });
    assert.equal(removeOpen(page), false);
    assert.deepEqual([page.$('removeMemberModal').classList.contains('hidden'), page.$('removeMemberModal').style.display], [true, '']);
    assertFocusOn(page, 'membersToggle', '那位成員的按鈕不在了');
    assert.equal(messages(page).length, toastsBefore);
    assert.deepEqual(server.requests.filter((request) => request.path.endsWith('/remove-member')), []);
    assert.equal(page.client.dialogs.removing, null);
    // 其他人還在，隊伍照常
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.ok(rowOf(page, 'r6v'));
});

test('他沒有加寶圖：內文用沒有張數的那一句；對話框開著時他改名、加了圖，標題與內文跟著換', async () => {
    const page = await crowdedParty({ respond: partyServer().respond });
    pressRemove(page, 'r6v');
    assert.equal(page.$('removeMemberModal-title').textContent, '把 光之戰士R6V 移出隊伍？');
    assert.equal(page.$('removeMemberBody').textContent, REJOIN);

    // 輪詢：他改了名、加了 2 張圖
    serverChanges(page, {
        members: [ME, M4X, { ...R6V, nickname: '新名字' }],
        treasureMaps: [serverMap('map_1', 'me'), serverMap('map_3', 'm4x'), serverMap('map_5', 'r6v'), serverMap('map_6', 'r6v')]
    });
    assert.equal(removeOpen(page), true);
    assert.equal(page.$('removeMemberModal-title').textContent, '把 新名字 移出隊伍？');
    assert.equal(page.$('removeMemberBody').textContent, `對方加的 2 張寶圖會留在隊伍清單。${REJOIN}`);

    // 沒變的字不重寫
    const title = page.$('removeMemberModal-title').firstChild;
    const body = page.$('removeMemberBody').firstChild;
    serverChanges(page, {});
    assert.ok(page.$('removeMemberModal-title').firstChild === title && page.$('removeMemberBody').firstChild === body);
});

test('取消、✕、Escape 都只關對話框：不送請求，焦點回到那位成員的「移出」；再打開是乾淨的（沒有舊的錯誤）', async () => {
    const server = partyServer();
    const page = await crowdedParty({ respond: server.respond });
    const closers = {
        取消: () => page.$('cancelRemoveBtn').click(),
        '✕': () => page.$('closeRemoveModalBtn').click(),
        Escape: () => page.key('Escape')
    };
    for (const [label, close] of Object.entries(closers)) {
        pressRemove(page, 'm4x');
        assert.ok(removeOpen(page), label);
        page.client.dialogs.showRemoveError('舊的錯誤');
        close();
        assert.equal(removeOpen(page), false, label);
        assert.ok(page.focused() === buttonOf(page, 'm4x', 'remove'), `${label}：焦點還給 M4X 那一列的「移出」`);
        assert.ok(rowOf(page, 'm4x'), `${label}：他還在隊伍裡`);
    }
    assert.deepEqual(server.requests.filter((request) => request.path.endsWith('/remove-member')), []);
    pressRemove(page, 'm4x');
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('removeMemberError').textContent], [true, '']);
});

test('移出進行中隊長自己按 Escape 關掉對話框：成功照樣移出了（toast 照跳）；隊長接著開了另一位成員的對話框，舊的結果不會把它關掉；失敗改跳 toast，不寫進新開的對話框', async () => {
    for (const succeed of [true, false]) {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        let page;
        const removeMember = removing(() => page);
        const server = partyServer({ removeMember: async (options) => { await gate; if (!succeed) throw roomError(503, 'UNAVAILABLE'); return removeMember(options); } });
        page = await crowdedParty({ respond: server.respond });
        pressRemove(page, 'm4x');
        page.$('confirmRemoveBtn').focus();
        page.$('confirmRemoveBtn').click();
        page.key('Escape');
        assert.equal(removeOpen(page), false, `${succeed}：進行中隊長自己關掉了`);

        // 隊長接著開了 R6V 的對話框（M4X 那一次還沒回來）
        pressRemove(page, 'r6v');
        assert.ok(removeOpen(page));
        assert.equal(page.client.dialogs.removing, 'r6v');
        // 移出鈕是兩個人共用的那一顆，M4X 那一次還沒回來時它還停用著：R6V 的不能先按，不會有兩個移出疊在一起
        const removeRequests = () => server.requests.filter((request) => request.path === '/rooms/ABC123/remove-member');
        assert.deepEqual(removeDisabledOf(page), [true, false, false], `${succeed}：M4X 那一次還沒回來，移出鈕還停用著`);
        page.$('confirmRemoveBtn').click();
        await page.client.dialogs.confirmRemove();
        assert.equal(removeRequests().length, 1, `${succeed}：還不能移出 R6V`);

        release();
        await page.settle();
        assert.ok(removeOpen(page), `${succeed}：M4X 那一次的結果不會把新開的對話框關掉`);
        assert.equal(page.client.dialogs.removing, 'r6v');
        assert.deepEqual(removeDisabledOf(page), [false, false, false], `${succeed}：M4X 那一次結束了，確認鈕恢復`);
        assert.equal(page.$('removeMemberModal-title').textContent, '把 光之戰士R6V 移出隊伍？');
        if (succeed) {
            assert.equal(rowOf(page, 'm4x'), undefined);
            assert.equal(page.toasts.at(-1).message, '已將 光之戰士M4X 移出隊伍');
        } else {
            assert.ok(rowOf(page, 'm4x'), '失敗：他還在隊伍裡');
            assert.deepEqual(page.toasts.at(-1), { message: REMOVE_FAILED, type: 'error' });
            assert.equal(isHidden(page, 'removeMemberError'), true, '沒有東西寫進新開的對話框');
        }

        // M4X 那一次結束了才能移出 R6V；連按兩下只送一個請求（第一下就停用了）
        page.$('confirmRemoveBtn').focus();
        page.$('confirmRemoveBtn').click();
        page.$('confirmRemoveBtn').click();
        await page.settle();
        assert.deepEqual(removeRequests().map((request) => request.body.targetMemberId), ['m4x', 'r6v'], `${succeed}：每個人只送一次`);
    }
});

test('移出對話框開著時切到英文（Review Focus 5）：標題與內文換成英文，固定的按鈕字也是英文；顯示中的中文錯誤收起來', async () => {
    const server = partyServer({ removeMember: () => { throw roomError(503, 'UNAVAILABLE'); } });
    const page = await crowdedParty({ respond: server.respond });
    pressRemove(page, 'm4x');
    page.$('confirmRemoveBtn').focus();
    page.$('confirmRemoveBtn').click();
    await page.settle();
    assert.equal(page.$('removeMemberError').textContent, REMOVE_FAILED);

    page.setLang('en');
    assert.equal(page.$('removeMemberModal-title').textContent, 'Remove 光之戰士M4X from the party?');
    assert.equal(page.$('removeMemberBody').textContent, 'Their maps (1) stay in the party list. They can rejoin later with the code or the invite link.');
    assert.deepEqual([page.$('confirmRemoveBtn').textContent, page.$('cancelRemoveBtn').textContent], ['Remove', 'Cancel']);
    assert.deepEqual([isHidden(page, 'removeMemberError'), page.$('removeMemberError').textContent], [true, '']);

    page.setLang('ja');
    assert.equal(page.$('removeMemberModal-title').textContent, '光之戰士M4X をパーティから除名しますか？');
    assert.equal(page.$('removeMemberBody').textContent, '相手が追加した地図 1 枚はパーティリストに残ります。相手は後からコードや招待リンクで再参加できます。');
    assert.equal(removeOpen(page), true);
});

// ---------- 改名 ----------
test('改名對話框：標題「改名」、欄位「名字」（欄裡是目前的名字，沒有 placeholder）、說明「隊友看到的名字」；改好按確認 → toast「已改名」；英文與日文也是新的字；不再有 .modal-content', async () => {
    const page = await createParty(createsAndRenames(), { stored: { ff14tw_nickname_tag: 'K7Q' } });
    assert.equal((await page.client.createRoom()).success, true);
    stubSelect(page);
    page.finder.openListPanel();
    expand(page);
    const rename = buttonOf(page, 'me', 'rename');
    rename.focus();
    rename.click();

    const dialog = page.$('editNicknameModal');
    assert.equal(isHidden(page, 'editNicknameModal'), false);
    assert.equal(page.$('editNicknameModal-title').textContent, '改名');
    assert.equal(dialog.querySelector('label').textContent, '名字');
    assert.equal(page.$('nicknameHint').textContent, '隊友看到的名字');
    assert.equal(page.$('nicknameInput').value, '光之戰士K7Q');
    assert.equal(page.$('nicknameInput').getAttribute('placeholder'), null);
    assert.equal(page.$('nicknameInput').getAttribute('aria-describedby'), 'nicknameHint');
    assert.equal(dialog.querySelector('.modal-content'), null);
    assert.equal(dialog.querySelector('.dialog.tm-dialog') !== null, true);
    assert.deepEqual([page.$('cancelNicknameBtn').textContent, page.$('confirmNicknameBtn').textContent], ['取消', '確認']);

    page.setLang('en');
    assert.deepEqual([page.$('editNicknameModal-title'), dialog.querySelector('label'), page.$('nicknameHint')].map((element) => element.textContent), ['Rename', 'Name', 'The name your party sees']);
    page.setLang('ja');
    assert.deepEqual([page.$('editNicknameModal-title'), dialog.querySelector('label'), page.$('nicknameHint')].map((element) => element.textContent), ['名前を変更', '名前', 'パーティに表示される名前']);
    page.setLang('zh');

    page.$('nicknameInput').value = '新名字';
    page.$('confirmNicknameBtn').click();
    await page.settle();
    assert.equal(isHidden(page, 'editNicknameModal'), true);
    assert.deepEqual(page.toasts.at(-1), { message: '已改名', type: 'success' });
    assert.equal(page.client.currentUser.nickname, '新名字');
    assert.ok(page.focused() === buttonOf(page, 'me', 'rename'), '焦點回到新的那顆「改名」');
});

// ---------- 邀請連結（打開 ?room= 的連結）：先讀隊伍，讀完才問「加入隊伍 X？」 ----------
// 連結的隊伍 B 是 ABC123（隊長 K7Q）。情況 d 的「另一隊 A」是 AAA111：自己（T8W）是隊長，隊裡還有 M4X。這台機器的字串是 T8W。
// client.ready 要等對話框有答案才完成：測試不 await 它（答案不對就會一直等下去，node --test 沒有逾時），
// 一律先確認對話框開著（或根本沒開），回答之後 settle()，再看 watchReady() 記下的結果
const LINK_URL = 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123';
const PAGE_URL = 'https://ff14.tw/tools/treasure-map-finder/';
const A_CODE = 'AAA111';
const POST_LEAVE_A = `POST /rooms/${A_CODE}/leave`;
const K7Q = { id: 'k7q', nickname: '光之戰士K7Q', joinedAt: ISO };
const T8W = { id: 'me', nickname: '光之戰士T8W', joinedAt: ISO };
const partyB = ({ members = [K7Q], treasureMaps = [], creatorId = K7Q.id } = {}) => ({ roomCode: 'ABC123', creatorId, members, treasureMaps, revision: 1, lastActivityAt: ISO });
const fullB = () => partyB({ members: Array.from({ length: 8 }, (_, index) => ({ id: `m${index}`, nickname: `M${index}`, joinedAt: ISO })) });
// 存著的連線紀錄（ff14tw_current_room 的字串）：過得了 isRoomValid()，沒有還沒送出的變更。treasureMaps 是隊伍清單：
// 真的使用時這台裝置的清單就是上次同步下來的隊伍清單（接回 A 時清單會照紀錄重新同步），清單裡有寶圖的測試要給一樣的那幾張（roomMapsOf()）
const recordOf = (roomCode = A_CODE, treasureMaps = []) => JSON.stringify({
    roomCode, creatorId: T8W.id, members: [T8W, M4X], treasureMaps, revision: 3, lastActivityAt: ISO,
    currentUser: T8W, memberToken: TOKEN, pendingMapOperations: [], knownMembers: { me: T8W.nickname, m4x: M4X.nickname },
    lastSyncAt: new Date().toISOString()
});
// storedList() 存下來的清單換成隊伍資料裡的寶圖（同 TreasureMapFinder#toRoomMap()，都是自己加的）
const roomMapsOf = (stored) => JSON.parse(stored.ff14tw_treasure_map_list).maps
    .map((item) => ({ id: item.id, type: item.level, x: item.coords.x, y: item.coords.y, zone: item.zone, addedBy: T8W.id, addedAt: ISO }));
// 伺服器替身：B 的 GET 依序回 reads 裡的回應（用完了一直用最後一個）：隊伍資料，或是丟出錯誤的函式（失敗）。
// B 的 POST join 回 join(body, joined)：預設是 joined(body)——送來的名字成為最後一位成員 me，帶進來的寶圖裡隊伍還沒有的收進去（addedBy 是 me）。
// A 的 POST leave 回 leave()，PUT（送出還沒送出的變更）回 update()。requests 記下每一次的請求（method、path、body、authenticated）
const linkServer = ({ reads = [partyB()], join = (body, joined) => joined(body), leave = () => ({ message: 'Left' }),
    update = () => { throw new Error('unexpected PUT'); } } = {}) => {
    const requests = [];
    let count = 0;
    let latest = null;
    const joined = (body) => {
        const me = { ...T8W, nickname: body.memberNickname };
        const own = body.initialMaps.filter((map) => !latest.treasureMaps.some((item) => item.id === map.id)).map((map) => ({ ...map, addedBy: me.id, addedAt: ISO }));
        return { room: { ...latest, members: [...latest.members, me], treasureMaps: [...latest.treasureMaps, ...own], revision: latest.revision + 1 }, newMember: me, memberToken: TOKEN };
    };
    return {
        requests,
        respond: (path, options) => {
            const method = options.method ?? 'GET';
            requests.push({ method, path, body: options.body, authenticated: options.authenticated });
            if (path === '/rooms/ABC123' && method === 'GET') {
                const next = reads[Math.min(count++, reads.length - 1)];
                if (typeof next === 'function') return next();
                latest = next;
                return next;
            }
            if (path === '/rooms/ABC123/join' && method === 'POST') return join(options.body, joined);
            if (path === `/rooms/${A_CODE}/leave` && method === 'POST') return leave(options);
            if (path === `/rooms/${A_CODE}` && method === 'PUT') return update(options);
            throw new Error(`unexpected ${method} ${path}`);
        }
    };
};
// 打開連結的頁面（這台機器的字串是 T8W；stored 是其餘的 localStorage：存著的紀錄、清單）：init() 排好的工作都跑完了（讀隊伍、打開對話框）
const openLinkPage = (respond, { url = LINK_URL, stored = {}, ...options } = {}) => createParty(respond, { url, stored: { ff14tw_nickname_tag: 'T8W', ...stored }, ...options });
// 清單裡已經有 ids 這幾張的 localStorage（用真的 toggleMapInList() 存下來）：讀隊伍、畫對話框在頁面建好時就做完了，那之後才加寶圖來不及
const storedList = async (ids) => {
    const page = await createPanelPage();
    page.addMaps(ids);
    return { ff14tw_treasure_map_list: page.storage.get('ff14tw_treasure_map_list') };
};
// 連結對話框現在開著嗎（ModalManager 認得它，而且看得到）
const linkOpen = (page) => page.client.dialogs.modalManager.activeModal === page.$('joinLinkModal') && !isHidden(page, 'joinLinkModal');
// client.ready 完成了沒（不 await 它，見上面）
const watchReady = (page) => {
    const state = { settled: false };
    page.client.ready.then(() => { state.settled = true; });
    return state;
};
// 開始輪詢換成記次數的替身（createPanelPage 的 party.polling 是 false 時，原本就換成什麼都不做的函式）
const pollsOf = (page) => {
    const polls = { count: 0 };
    page.client.startPolling = () => { polls.count += 1; };
    return polls;
};
const text = (page, id) => page.$(id).textContent;
const currentUrl = (page) => String(page.dom.window.location);
const savedRoom = (page) => (page.storage.has('ff14tw_current_room') ? JSON.parse(page.storage.get('ff14tw_current_room')) : null);
// 對話框裡的 [摘要, 名字, 「你目前在隊伍 A」, 「你的清單」那一塊, 錯誤, 「加入」] 各自顯示著嗎
const LINK_PARTS = ['joinLinkSummary', 'joinLinkName', 'joinLinkLeave', 'linkPartyMaps', 'joinLinkError', 'confirmLinkBtn'];
const linkParts = (page) => LINK_PARTS.map((id) => !isHidden(page, id));
// 會因為進行中而停用的控制項，依序是 [帶進, 不帶, 加入, 不用了, ✕]：不用了與 ✕ 進行中還能按
const LINK_CONTROLS = ['linkModeBring', 'linkModeClear', 'confirmLinkBtn', 'dismissLinkBtn', 'closeLinkModalBtn'];
const linkDisabledOf = (page) => LINK_CONTROLS.map((id) => page.$(id).disabled);
const LINK_CHOICE = ['linkModeBringTitle', 'linkModeBringHint', 'linkModeClearTitle', 'linkModeClearHint'];
// 玩家按「加入」：焦點在那顆鈕上（進行中它停用，停用之前焦點先移到 ✕），等結束
const pressLinkConfirm = async (page) => {
    page.$('confirmLinkBtn').focus();
    page.$('confirmLinkBtn').click();
    await page.settle();
};
const pressLinkDismiss = async (page) => {
    page.$('dismissLinkBtn').click();
    await page.settle();
};
const LEAVE_LINE = '你目前在隊伍 AAA111。加入 ABC123 會先離開 AAA111，AAA111 的寶圖會留在你的清單。';
const FULL_B = '隊伍 ABC123 已經滿 8 人了。';

test('沒有紀錄打開 ?room=ABC123：讀完隊伍才打開對話框，寫「加入隊伍 ABC123？」、「光之戰士K7Q 的隊伍 · 1/8 人 · 隊伍清單 0/8 張」、「你會叫「光之戰士T8W」…」；ready 還沒完成；按加入 → 進行中選項與加入停用，POST join 的名字是光之戰士T8W，成功後對話框關掉、面板打開、ready 完成', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const server = linkServer({ join: async (body, joined) => { await gate; return joined(body); } });
    const page = await openLinkPage(server.respond);
    assert.ok(linkOpen(page), '讀完隊伍就打開');
    assert.deepEqual(requestsOf(server), [GET_ROOM]);
    assert.equal(text(page, 'joinLinkModal-title'), '加入隊伍 ABC123？');
    assert.equal(text(page, 'joinLinkSummary'), '光之戰士K7Q 的隊伍 · 1/8 人 · 隊伍清單 0/8 張');
    assert.equal(text(page, 'joinLinkName'), '你會叫「光之戰士T8W」，加入後可以改名。');
    // 沒有 A：沒有「你目前在隊伍」那一行；清單是空的：沒有「你的清單」那一塊；沒有錯誤
    assert.deepEqual(linkParts(page), [true, true, false, false, false, true]);
    assert.deepEqual([text(page, 'dismissLinkBtn'), text(page, 'confirmLinkBtn')], ['不用了', '加入']);
    assert.deepEqual(linkDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.client.currentRoom, null, '還沒問完：沒有加入');
    assert.deepEqual(page.toasts, []);
    const ready = watchReady(page);
    await page.settle();
    assert.equal(ready.settled, false, 'ready 等對話框有答案');

    page.$('confirmLinkBtn').focus();
    page.$('confirmLinkBtn').click();
    await page.settle();
    // 進行中：選項與「加入」停用、「加入」轉圈（不用了與 ✕ 還能按），對話框不關
    assert.deepEqual(linkDisabledOf(page), [true, true, true, false, false]);
    assert.equal(page.$('confirmLinkBtn').classList.contains('btn-loading'), true);
    assert.ok(linkOpen(page));
    assertFocusOn(page, 'closeLinkModalBtn', '「加入」停用之前焦點先移到 ✕（不是「不用了」），不會掉到 body');
    assert.equal(ready.settled, false);
    release();
    await page.settle();

    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_JOIN], '加入時照常先讀隊伍再加入');
    assert.equal(server.requests[2].body.memberNickname, '光之戰士T8W', '送出去的就是對話框裡寫的名字');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(linkOpen(page), false);
    assert.deepEqual([isHidden(page, 'joinLinkModal'), page.$('joinLinkModal').style.display], [true, '']);
    assert.ok(page.finder.modalManager.activeModal === page.$('myListPanel'), '加入成功：打開清單面板');
    assert.deepEqual(messages(page), ['已加入隊伍 ABC123']);
    assert.equal(currentUrl(page), LINK_URL);
    assert.deepEqual(linkDisabledOf(page), [false, false, false, false, false]);
    assert.equal(page.$('confirmLinkBtn').classList.contains('btn-loading'), false);
    assert.equal(ready.settled, true);
});

test('按不用了：不送加入、網址只拿掉 room（grade、maps 還在）、ready 完成，接著才打開分享寶圖的對話框', async () => {
    const server = linkServer();
    const page = await openLinkPage(server.respond, { url: `${PAGE_URL}?grade=g17&room=ABC123&maps=tm_017` });
    // 同 script.js 最後的 DOMContentLoaded：寶圖資料與隊伍都 ready 之後才處理分享連結（createPanelPage 不跑那一段）
    const order = [];
    Promise.allSettled([page.finder.ready, page.client.ready]).then(() => {
        order.push(linkOpen(page) ? '加入的對話框還開著' : '加入的對話框關掉了');
        page.finder.handleSharedMaps();
    });
    await page.settle();
    assert.ok(linkOpen(page));
    assert.equal(isHidden(page, 'shareMapsModal'), true, '加入的對話框還開著：分享的對話框還沒打開');
    assert.deepEqual(order, []);

    await pressLinkDismiss(page);
    assert.equal(linkOpen(page), false);
    assert.deepEqual(requestsOf(server), [GET_ROOM], '不送加入');
    assert.equal(page.client.currentRoom, null);
    assert.equal(currentUrl(page), `${PAGE_URL}?grade=g17&maps=tm_017`);
    assert.deepEqual(order, ['加入的對話框關掉了'], 'ready 在對話框關掉之後才完成');
    assert.ok(page.finder.listDialogs.modalManager.activeModal === page.$('shareMapsModal') && !isHidden(page, 'shareMapsModal'), '接著打開分享寶圖的對話框');
    assert.deepEqual(page.toasts, []);
});

test('讀隊伍就失敗：只剩錯誤與「關閉」，沒有加入鈕——找不到（404）、成員已經 8 人、連不上；標題照樣是「加入隊伍 ABC123？」；按關閉 → 網址拿掉 room、ready 完成', async () => {
    const cases = [
        ['找不到', () => { throw roomError(404, 'ROOM_NOT_FOUND'); }, '找不到隊伍 ABC123。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。'],
        ['成員已經 8 人', fullB(), FULL_B],
        ['連不上', () => { throw roomError(503, 'UNAVAILABLE'); }, NETWORK_ERROR]
    ];
    for (const [label, read, message] of cases) {
        const server = linkServer({ reads: [read] });
        const page = await openLinkPage(server.respond);
        assert.ok(linkOpen(page), `${label}：讀完照樣打開`);
        assert.equal(text(page, 'joinLinkModal-title'), '加入隊伍 ABC123？', label);
        assert.deepEqual(linkParts(page), [false, false, false, false, true, false], `${label}：只剩錯誤，沒有加入鈕`);
        assert.equal(text(page, 'joinLinkError'), message, label);
        assert.equal(text(page, 'dismissLinkBtn'), '關閉', label);
        assert.deepEqual(page.toasts, [], `${label}：不跳 toast`);
        const ready = watchReady(page);
        await pressLinkDismiss(page);
        assert.equal(linkOpen(page), false, label);
        assert.equal(currentUrl(page), PAGE_URL, label);
        assert.deepEqual(requestsOf(server), [GET_ROOM], label);
        assert.equal(page.client.currentRoom, null, label);
        assert.equal(ready.settled, true, label);
    }
});

test('清單 2 張：「你的清單有 2 張寶圖：」、迷你清單、預設帶進，帶進的說明是以 id 去重後的「隊伍清單會變成 3/8 張」；去重後超過 8：帶進停用、兩個都沒勾、提醒顯示、加入停用，選了不帶才能加入', async () => {
    const stored = await storedList(TWO);
    const server = linkServer({ reads: [partyB({ treasureMaps: [serverMap('tm_017', K7Q.id), serverMap('room_0', K7Q.id)] })] });
    const page = await openLinkPage(server.respond, { stored });
    assert.ok(linkOpen(page));
    assert.equal(text(page, 'joinLinkSummary'), '光之戰士K7Q 的隊伍 · 1/8 人 · 隊伍清單 2/8 張');
    assert.equal(isHidden(page, 'linkPartyMaps'), false);
    assert.equal(text(page, 'linkPartyLede'), '你的清單有 2 張寶圖：');
    assert.deepEqual(page.$('linkPartyList').children.map((row) => row.textContent), ['G17 科扎馬烏卡 (20.0, 6.9)', 'G17 烏爾科帕恰 (13.7, 14.2)']);
    assert.deepEqual(LINK_CHOICE.map((id) => text(page, id)), ['帶進隊伍清單', '隊伍清單會變成 3/8 張', '不帶，清空這 2 張', '只用隊伍清單']);
    assert.deepEqual([page.$('linkModeBring').checked, page.$('linkModeClear').checked], [true, false], '預設帶進');
    assert.equal(isHidden(page, 'linkPartyNote'), true);
    assert.equal(page.$('confirmLinkBtn').disabled, false);
    assert.equal(text(page, 'joinPartyLede'), '', '加入隊伍的對話框是另一組元素，沒有被動到');

    const crowdedServer = linkServer({ reads: [partyB({ treasureMaps: partyMaps(7) })] });
    const crowded = await openLinkPage(crowdedServer.respond, { stored });
    assert.equal(text(crowded, 'linkModeBringHint'), '隊伍清單會變成 9/8 張');
    assert.deepEqual([crowded.$('linkModeBring').disabled, crowded.$('linkModeBring').checked, crowded.$('linkModeClear').checked], [true, false, false], '帶進停用、兩個都沒勾');
    assert.equal(isHidden(crowded, 'linkPartyNote'), false);
    assert.equal(text(crowded, 'linkPartyNote'), '隊伍清單最多 8 張：先把清單刪到 8 張以內，或選「不帶」。');
    assert.equal(crowded.$('confirmLinkBtn').disabled, true);
    chooseMode(crowded, 'clear', 'link');
    assert.equal(crowded.$('confirmLinkBtn').disabled, false, '選了不帶才能加入');
    await pressLinkConfirm(crowded);
    assert.deepEqual(plain(crowdedServer.requests.at(-1).body.initialMaps), [], '不帶');
    assert.equal(crowded.client.currentRoom.roomCode, 'ABC123');
    assert.deepEqual(listIds(crowded), partyMaps(7).map((map) => map.id), '清單就是隊伍清單');
});

test('加入時伺服器回 ROOM_FULL：錯誤寫在對話框裡（隊伍 ABC123 已經滿 8 人了。）、不關、不跳 toast；選項與加入恢復，焦點回到加入；ready 還沒完成；改了選項錯誤就收起來', async () => {
    const stored = await storedList(TWO);
    const server = linkServer({ join: () => { throw roomError(409, 'ROOM_FULL'); } });
    const page = await openLinkPage(server.respond, { stored });
    const ready = watchReady(page);
    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_JOIN]);
    assert.ok(linkOpen(page), '對話框不關');
    assert.deepEqual(linkParts(page), [true, true, false, true, true, true]);
    assert.equal(text(page, 'joinLinkError'), FULL_B);
    assert.equal(text(page, 'dismissLinkBtn'), '不用了', '加入失敗不是「只剩錯誤」的樣子');
    assert.deepEqual(page.toasts, []);
    assert.equal(page.client.currentRoom, null);
    assert.deepEqual(listIds(page), TWO, '清單沒動');
    assert.deepEqual(linkDisabledOf(page), [false, false, false, false, false]);
    assertFocusOn(page, 'confirmLinkBtn', '失敗：焦點回到加入，可以直接再按一次');
    await page.settle();
    assert.equal(ready.settled, false);
    chooseMode(page, 'clear', 'link');
    assert.deepEqual([text(page, 'joinLinkError'), isHidden(page, 'joinLinkError')], ['', true], '改了選項：錯誤收起來');
});

test('隊長已經不在（creatorId 不在成員裡）：摘要不寫是誰的隊伍，只寫人數與張數（英文、日文也一樣）；不丟例外（Review Focus 2）', async () => {
    const server = linkServer({ reads: [partyB({ members: [M4X, R6V], creatorId: K7Q.id })] });
    const page = await openLinkPage(server.respond);
    assert.ok(linkOpen(page));
    assert.equal(text(page, 'joinLinkSummary'), '2/8 人 · 隊伍清單 0/8 張');
    page.setLang('en');
    assert.equal(text(page, 'joinLinkSummary'), 'Members 2/8 · Party list 0/8');
    page.setLang('ja');
    assert.equal(text(page, 'joinLinkSummary'), '2/8 人 · パーティリスト 0/8 枚');
    // 有隊長時才寫是誰的隊伍
    const led = await openLinkPage(linkServer({ reads: [partyB({ members: [M4X, K7Q] })] }).respond);
    assert.equal(text(led, 'joinLinkSummary'), '光之戰士K7Q 的隊伍 · 2/8 人 · 隊伍清單 0/8 張');
});

test('有同一隊（ABC123）的有效紀錄：直接接回，不開對話框、不讀隊伍；ready 完成', async () => {
    const server = linkServer();
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf('ABC123') } });
    const ready = watchReady(page);
    assert.equal(page.client.currentRoom?.roomCode, 'ABC123');
    assert.equal(linkOpen(page), false);
    assert.equal(page.client.dialogs.opening, 0, '對話框一次都沒打開過');
    assert.deepEqual(server.requests, []);
    assert.equal(currentUrl(page), LINK_URL);
    await page.settle();
    assert.equal(ready.settled, true);
});

test('紀錄已經失效（上次同步超過 24 小時）打開 ?room=ABC123：先清掉紀錄，網址的 room 留到回答——對話框開著時重新整理（照當時的網址與 localStorage 重開）還是問同一個邀請，按不用了才拿掉 room；失效的是 A 或同一隊 ABC123 都一樣', async () => {
    const expired = (roomCode) => JSON.stringify({ ...JSON.parse(recordOf(roomCode)), lastSyncAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    for (const roomCode of [A_CODE, 'ABC123']) {
        const server = linkServer();
        const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: expired(roomCode) } });
        assert.ok(linkOpen(page), roomCode);
        assert.equal(savedRoom(page), null, `${roomCode}：失效的紀錄清掉了`);
        assert.deepEqual(linkParts(page), [true, true, false, false, false, true], `${roomCode}：當作沒有紀錄，沒有「你目前在隊伍」那一行`);
        assert.equal(currentUrl(page), LINK_URL, `${roomCode}：對話框開著時網址的 room 還在`);

        const reloaded = await openLinkPage(server.respond, { url: currentUrl(page), stored: Object.fromEntries(page.storage) });
        assert.ok(linkOpen(reloaded), `${roomCode}：重新整理之後照樣問`);
        assert.equal(text(reloaded, 'joinLinkModal-title'), '加入隊伍 ABC123？');

        await pressLinkDismiss(page);
        assert.equal(currentUrl(page), PAGE_URL, `${roomCode}：按不用了才拿掉 room`);
        assert.equal(page.client.currentRoom, null);
        assert.deepEqual(page.toasts, []);
    }
});

test('有另一隊 A（AAA111）的有效紀錄、連結是 B：先不接回 A，對話框多一行「你目前在隊伍 AAA111。…」；按不用了 → 接回 A、開始輪詢、網址換成 ?room=AAA111，ready 完成', async () => {
    const server = linkServer();
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    assert.ok(linkOpen(page));
    assert.equal(page.client.currentRoom, null, '對話框開著時 A 沒有接回、也不輪詢');
    assert.deepEqual(linkParts(page), [true, true, true, false, false, true]);
    assert.equal(text(page, 'joinLinkLeave'), LEAVE_LINE);
    assert.equal(text(page, 'joinLinkName'), '你會叫「光之戰士T8W」，加入後可以改名。');
    assert.deepEqual(requestsOf(server), [GET_ROOM]);
    const ready = watchReady(page);

    await pressLinkDismiss(page);
    assert.equal(linkOpen(page), false);
    assert.equal(page.client.currentRoom.roomCode, A_CODE, '接回 A');
    assert.equal(polls.count, 1, '開始輪詢');
    assert.equal(currentUrl(page), `${PAGE_URL}?room=${A_CODE}`);
    assert.equal(savedRoom(page).roomCode, A_CODE);
    assert.deepEqual(requestsOf(server), [GET_ROOM], '沒有送離開或加入');
    assert.deepEqual(page.toasts, []);
    assert.equal(ready.settled, true);
});

test('情況 d 按加入：先再讀一次 B，再 POST /rooms/AAA111/leave（帶 A 的憑證），離開了才加入 B；最後存的是 B 的紀錄、網址 ?room=ABC123、面板打開；離開 A 不跳「已離開隊伍」、接回 A 去離開時不輪詢', async () => {
    const server = linkServer();
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    const ready = watchReady(page);
    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_LEAVE_A, GET_ROOM, POST_JOIN]);
    assert.equal(server.requests[2].authenticated, true, '離開 A 帶 A 的憑證');
    assert.equal(server.requests[4].body.memberNickname, '光之戰士T8W');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    const saved = savedRoom(page);
    assert.deepEqual([saved.roomCode, saved.currentUser.id, saved.memberToken], ['ABC123', 'me', TOKEN], '最後存的是 B 的紀錄');
    assert.equal(currentUrl(page), LINK_URL);
    assert.equal(linkOpen(page), false);
    assert.ok(page.finder.modalManager.activeModal === page.$('myListPanel'), '加入成功：打開清單面板');
    assert.deepEqual(messages(page), ['已加入隊伍 ABC123'], '離開 A 是安靜的');
    assert.equal(polls.count, 1, '只有加入 B 之後開始輪詢');
    assert.equal(ready.settled, true);
});

test('情況 d 再讀 B 時滿了：錯誤寫在對話框裡、沒有送離開 A 的請求、A 完全沒動（沒有接回、紀錄還在、「你目前在隊伍 A」那一行還在）；按不用了照樣接回 A', async () => {
    const server = linkServer({ reads: [partyB(), fullB()] });
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM], '沒有送離開 A');
    assert.ok(linkOpen(page));
    assert.equal(text(page, 'joinLinkError'), FULL_B);
    assert.deepEqual(linkParts(page), [true, true, true, false, true, true]);
    assert.equal(page.client.currentRoom, null);
    assert.equal(savedRoom(page).roomCode, A_CODE, 'A 的紀錄還在');
    assert.equal(polls.count, 0);
    assert.deepEqual(page.toasts, []);

    await pressLinkDismiss(page);
    assert.equal(page.client.currentRoom.roomCode, A_CODE);
    assert.equal(polls.count, 1);
    assert.equal(currentUrl(page), `${PAGE_URL}?room=${A_CODE}`);
});

test('情況 d 離開 A 連不上：錯誤「還沒離開隊伍 AAA111：離開失敗，請稍後再試。」、人還在 A（還沒輪詢）、沒有加入 B；按不用了 → A 開始輪詢、網址 ?room=AAA111', async () => {
    const server = linkServer({ leave: () => { throw roomError(503, 'UNAVAILABLE'); } });
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    const ready = watchReady(page);
    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_LEAVE_A], '沒有加入 B');
    assert.ok(linkOpen(page));
    assert.equal(text(page, 'joinLinkError'), '還沒離開隊伍 AAA111：離開失敗，請稍後再試。');
    assert.deepEqual(linkParts(page), [true, true, true, false, true, true], '還在 A：「你目前在隊伍 A」那一行還在');
    assert.equal(page.client.currentRoom.roomCode, A_CODE, '人還在 A');
    assert.equal(savedRoom(page).roomCode, A_CODE);
    assert.equal(polls.count, 0, '對話框開著時還不輪詢');
    assert.deepEqual(page.toasts, []);
    assert.equal(ready.settled, false);

    await pressLinkDismiss(page);
    assert.equal(linkOpen(page), false);
    assert.equal(page.client.currentRoom.roomCode, A_CODE);
    assert.equal(polls.count, 1, '按不用了：A 開始輪詢');
    assert.equal(currentUrl(page), `${PAGE_URL}?room=${A_CODE}`);
    assert.equal(ready.settled, true);
});

test('情況 d 離開 A 成功、加入 B 失敗：「你目前在隊伍 A」那一行不見了（換成情況 c 的樣子）、錯誤顯示；按不用了 → 沒有隊伍、網址拿掉 room、不接回 A', async () => {
    const server = linkServer({ join: () => { throw roomError(409, 'ROOM_FULL'); } });
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    const ready = watchReady(page);
    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_LEAVE_A, GET_ROOM, POST_JOIN]);
    assert.ok(linkOpen(page));
    assert.deepEqual(linkParts(page), [true, true, false, false, true, true], '「你目前在隊伍 A」那一行不見了');
    assert.equal(text(page, 'joinLinkError'), FULL_B);
    assert.equal(page.client.currentRoom, null, '已經離開 A，沒有隊伍');
    assert.equal(savedRoom(page), null);
    assert.deepEqual(page.toasts, []);

    await pressLinkDismiss(page);
    assert.equal(linkOpen(page), false);
    assert.equal(page.client.currentRoom, null);
    assert.equal(polls.count, 0, '不接回 A');
    assert.equal(currentUrl(page), PAGE_URL);
    assert.equal(ready.settled, true);
});

test('情況 d 離開 A 途中 A 的連線就失效了（A 還沒送出的變更被拒絕）：leaveRoom 回空的訊息，當作已經不在 A，照情況 c 加入 B；不寫「還沒離開隊伍」', async () => {
    // A 的紀錄裡有一筆還沒送出的變更（建立或加入時的補救批次，被拒絕就結束連線、保留本機清單）
    const map = { id: 'tm_017', type: 'g17', x: 20, y: 6.9, zone: "Kozama'uka", addedBy: T8W.id, addedAt: ISO };
    const record = JSON.stringify({ ...JSON.parse(recordOf()), pendingMapOperations: [{ clientRequestId: 'pending-1', operations: [{ type: 'add', map }], preserveLocalOnRejection: true }] });
    const server = linkServer({ update: () => { throw roomError(400, 'INVALID_REQUEST'); } });
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: record } });
    const ready = watchReady(page);
    await pressLinkConfirm(page);
    // 送變更時連線就失效了：離開的請求不用再送，接著加入 B
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, `PUT /rooms/${A_CODE}`, GET_ROOM, POST_JOIN]);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(linkOpen(page), false);
    assert.equal(savedRoom(page).roomCode, 'ABC123');
    assert.ok(!messages(page).some((message) => message.startsWith('還沒離開隊伍')), '不寫沒有原因的「還沒離開隊伍 A：」');
    assert.equal(messages(page).at(-1), '已加入隊伍 ABC123');
    assert.equal(ready.settled, true);
});

test('舊的唯讀隊伍不開對話框：沒有紀錄照 recoverLegacyRoom() 把它的寶圖留在本機、跳警告、網址拿掉 room；有 A 的紀錄就接回 A；ready 都完成', async () => {
    const legacy = () => ({ ...partyB({ treasureMaps: [serverMap('old_1', K7Q.id)] }), readOnly: true, legacy: true });
    const page = await openLinkPage(linkServer({ reads: [legacy()] }).respond);
    const ready = watchReady(page);
    assert.equal(linkOpen(page), false);
    assert.equal(page.client.dialogs.opening, 0, '對話框一次都沒打開過');
    assert.deepEqual(listIds(page), ['old_1'], '唯讀隊伍的寶圖留在本機');
    assert.deepEqual(page.toasts, [{ message: '這個隊伍已轉為唯讀，寶圖已保留在你的清單，請建立新的隊伍。', type: 'warning' }]);
    assert.equal(page.client.currentRoom, null);
    assert.equal(currentUrl(page), PAGE_URL);
    await page.settle();
    assert.equal(ready.settled, true);

    const server = linkServer({ reads: [legacy()] });
    const inA = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const readyInA = watchReady(inA);
    assert.equal(linkOpen(inA), false);
    assert.equal(inA.client.currentRoom?.roomCode, A_CODE, '情況 d：接回 A');
    assert.equal(currentUrl(inA), `${PAGE_URL}?room=${A_CODE}`);
    assert.deepEqual(listIds(inA), [], '唯讀隊伍的寶圖不會混進 A 的清單');
    assert.deepEqual(requestsOf(server), [GET_ROOM]);
    await inA.settle();
    assert.equal(readyInA.settled, true);
});

test('網址的代號先轉大寫：?room=abc123 也認得（沒有紀錄問 ABC123，有 ABC123 的紀錄直接接回）；?room=xyz 跳格式錯誤的提示、只拿掉 room、不讀隊伍也不開對話框（有 A 的紀錄時照樣接回 A）', async () => {
    const lower = linkServer();
    const asked = await openLinkPage(lower.respond, { url: `${PAGE_URL}?room=abc123` });
    assert.ok(linkOpen(asked));
    assert.equal(text(asked, 'joinLinkModal-title'), '加入隊伍 ABC123？');
    assert.deepEqual(requestsOf(lower), [GET_ROOM]);

    const restored = await openLinkPage(linkServer().respond, { url: `${PAGE_URL}?room=abc123`, stored: { ff14tw_current_room: recordOf('ABC123') } });
    assert.equal(restored.client.currentRoom?.roomCode, 'ABC123', '同一隊：直接接回');
    assert.equal(linkOpen(restored), false);

    for (const stored of [{}, { ff14tw_current_room: recordOf() }]) {
        const server = linkServer();
        const page = await openLinkPage(server.respond, { url: `${PAGE_URL}?grade=g17&room=xyz&maps=tm_017`, stored });
        const ready = watchReady(page);
        const label = stored.ff14tw_current_room ? '有 A 的紀錄' : '沒有紀錄';
        assert.deepEqual(page.toasts, [{ message: '代號是 6 碼英文和數字。', type: 'error' }], label);
        assert.equal(linkOpen(page), false, label);
        assert.equal(page.client.dialogs.opening, 0, label);
        assert.deepEqual(server.requests, [], `${label}：不讀隊伍`);
        if (stored.ff14tw_current_room) {
            assert.equal(page.client.currentRoom?.roomCode, A_CODE, '代號不能用：照沒有 room 的網址，接回 A');
            assert.equal(currentUrl(page), `${PAGE_URL}?grade=g17&maps=tm_017&room=${A_CODE}`);
        } else {
            assert.equal(page.client.currentRoom, null);
            assert.equal(currentUrl(page), `${PAGE_URL}?grade=g17&maps=tm_017`, '只拿掉 room');
        }
        await page.settle();
        assert.equal(ready.settled, true, label);
    }
});

test('整個流程沒有 pushState：情況 c 加入、不用了，情況 d 不用了、加入，網址的變更都是 replaceState', async () => {
    const flows = [
        ['c 加入', {}, pressLinkConfirm],
        ['c 不用了', {}, pressLinkDismiss],
        ['d 不用了', { ff14tw_current_room: recordOf() }, pressLinkDismiss],
        ['d 加入', { ff14tw_current_room: recordOf() }, pressLinkConfirm]
    ];
    for (const [label, stored, answer] of flows) {
        const page = await openLinkPage(linkServer().respond, { stored });
        assert.ok(linkOpen(page), label);
        await answer(page);
        assert.equal(linkOpen(page), false, label);
        assert.ok(page.historyCalls.length > 0, `${label}：網址有變`);
        assert.deepEqual(page.historyCalls.map((call) => call.method), page.historyCalls.map(() => 'replaceState'), label);
    }
});

test('連結對話框開著時切到英文（Review Focus 5）：標題、摘要、名字那一行、「你目前在隊伍 A」、選項與「不用了」換成英文，迷你清單換地名；顯示中的中文錯誤收起來；名字換成 Warrior of Light T8W，按加入送出的就是它', async () => {
    const list = await storedList(TWO);
    const stored = { ...list, ff14tw_current_room: recordOf(A_CODE, roomMapsOf(list)) };
    // 第一次再讀 B 時連不上（寫出中文的錯誤，A 沒動），之後就能加入
    const withOne = partyB({ treasureMaps: [serverMap('tm_017', K7Q.id)] });
    const server = linkServer({ reads: [withOne, () => { throw roomError(503, 'UNAVAILABLE'); }, withOne] });
    const page = await openLinkPage(server.respond, { stored });
    await pressLinkConfirm(page);
    assert.equal(text(page, 'joinLinkError'), NETWORK_ERROR);
    assert.equal(page.client.currentRoom, null, '前提：A 沒動');
    const rows = [...page.$('linkPartyList').children];

    page.setLang('en');
    assert.deepEqual([text(page, 'joinLinkError'), isHidden(page, 'joinLinkError')], ['', true], '中文的錯誤收起來');
    assert.equal(text(page, 'joinLinkModal-title'), 'Join party ABC123?');
    assert.equal(text(page, 'joinLinkSummary'), "光之戰士K7Q's party · Members 1/8 · Party list 1/8");
    assert.equal(text(page, 'joinLinkName'), 'You\'ll appear as "Warrior of Light T8W". You can rename after joining.');
    assert.equal(text(page, 'joinLinkLeave'), "You're in party AAA111. Joining ABC123 leaves AAA111 first; its maps stay in your list.");
    assert.equal(text(page, 'linkPartyLede'), 'Maps in your list: 2');
    assert.deepEqual(LINK_CHOICE.map((id) => text(page, id)),
        ['Bring them into the party list', 'The party list becomes 2/8', "Don't bring them — clear your list (2)", 'Use only the party list']);
    assert.deepEqual(page.$('linkPartyList').children.map((row) => row.textContent), ["G17 Kozama'uka (20.0, 6.9)", 'G17 Urqopacha (13.7, 14.2)']);
    assert.ok(page.$('linkPartyList').children.every((row, index) => row !== rows[index]), '地名是語言的字，迷你清單重建');
    assert.deepEqual([text(page, 'dismissLinkBtn'), text(page, 'confirmLinkBtn')], ['No thanks', 'Join']);
    assert.ok(linkOpen(page));

    await pressLinkConfirm(page);
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, GET_ROOM, POST_LEAVE_A, GET_ROOM, POST_JOIN]);
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(server.requests.at(-1).body.memberNickname, 'Warrior of Light T8W', '送出去的就是對話框裡寫的名字');
    assert.deepEqual(plain(server.requests.at(-1).body.initialMaps.map((map) => map.id)), TWO, '預設帶進');
});

test('只剩錯誤的樣子切換語言：錯誤用新語言重寫（不收起來，不然對話框就空了），「關閉」也換字；情況 d 按關閉照樣接回 A', async () => {
    const server = linkServer({ reads: [() => { throw roomError(404, 'ROOM_NOT_FOUND'); }] });
    const page = await openLinkPage(server.respond, { stored: { ff14tw_current_room: recordOf() } });
    const polls = pollsOf(page);
    assert.deepEqual(linkParts(page), [false, false, false, false, true, false], '只剩錯誤：「你目前在隊伍 A」那一行也不寫');
    page.setLang('en');
    assert.equal(text(page, 'joinLinkModal-title'), 'Join party ABC123?');
    assert.equal(text(page, 'joinLinkError'), "Party ABC123 wasn't found. The code may be mistyped, or the party has ended (parties end after 24 hours without activity).");
    assert.equal(isHidden(page, 'joinLinkError'), false);
    assert.equal(text(page, 'dismissLinkBtn'), 'Close');
    page.setLang('ja');
    assert.equal(text(page, 'joinLinkModal-title'), 'パーティ ABC123 に参加しますか？');
    assert.equal(text(page, 'dismissLinkBtn'), '閉じる');

    await pressLinkDismiss(page);
    assert.equal(page.client.currentRoom.roomCode, A_CODE, '情況 d：關閉也是接回 A');
    assert.equal(polls.count, 1);
});

test('對話框按加入之後面板打開，焦點照面板自己的規則（第一個按鈕）；讀隊伍途中自己先打開了面板：對話框疊在面板上，加入之後焦點回到面板裡原本的地方', async () => {
    const page = await openLinkPage(linkServer().respond);
    assert.ok(linkOpen(page));
    assertFocusOn(page, 'closeLinkModalBtn', '載入時自己打開的對話框：焦點照 ModalManager 的預設（第一個可以按的 ✕）');
    await pressLinkConfirm(page);
    assert.ok(page.finder.modalManager.activeModal === page.$('myListPanel'));
    assertFocusOn(page, 'closePanelBtn', '用連結加入成功：打開清單面板，焦點照面板自己的規則');

    // 讀隊伍的回應卡住：這段時間玩家自己打開了清單面板
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const server = linkServer();
    const opened = await openLinkPage(async (path, options) => { await gate; return server.respond(path, options); });
    opened.finder.openListPanel();
    assertFocusOn(opened, 'closePanelBtn', '讀隊伍途中打開面板');
    release();
    await opened.settle();
    assert.ok(linkOpen(opened), '讀完隊伍：對話框疊在面板上');
    await pressLinkConfirm(opened);
    assert.equal(opened.client.currentRoom.roomCode, 'ABC123');
    assert.ok(opened.finder.modalManager.activeModal === opened.$('myListPanel'), '面板還開著');
    assertFocusOn(opened, 'closePanelBtn', '加入之後焦點回到面板裡原本的地方');
});

test('讀隊伍途中打開了寶圖的詳細檢視（卡片的縮圖沒有停用）：讀完先關掉它，再打開「加入隊伍 X？」——詳細檢視疊得比對話框高，不關會蓋住對話框，Escape 與點遮罩卻關掉看不到的對話框、把邀請丟掉；之後 Escape、點遮罩關的就是看得到的對話框，網址的 room 留到玩家回答', async () => {
    for (const [label, answer] of [['Escape', (page) => page.key('Escape')], ['點遮罩', (page) => page.$('joinLinkModal').click()]]) {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const server = linkServer();
        // 網址帶著等級：結果格有卡片。載入時讀 B 的回應卡住，直到 release()
        const page = await openLinkPage(async (path, options) => {
            if (path === '/rooms/ABC123') await gate;
            return server.respond(path, options);
        }, { url: `${PAGE_URL}?grade=g17&room=ABC123` });
        const ready = watchReady(page);
        const detail = page.$('mapDetailModal');
        const detailOpen = () => page.finder.uiDialogManager.modalManager.activeModal === detail;
        assert.equal(page.client.isConnecting, true, `${label}：前提，還在讀隊伍`);
        const thumb = page.$('treasureGrid').querySelector('.tm-thumb');
        thumb.click();
        assert.ok(detailOpen(), `${label}：讀隊伍途中打得開詳細檢視`);

        release();
        await page.settle();
        assert.equal(detailOpen(), false, `${label}：讀完先關掉詳細檢視`);
        assert.deepEqual([detail.classList.contains('active'), page.finder.uiDialogManager.activeDialog], [false, null], label);
        assert.ok(linkOpen(page), `${label}：對話框打開了`);
        assert.ok(page.dom.window.ModalManager.topmost() === page.client.dialogs.modalManager, `${label}：看得到的對話框就是最上層（收得到 Escape）`);
        assert.ok(page.$('joinLinkModal').contains(page.focused()), `${label}：焦點在對話框裡`);
        assert.equal(currentUrl(page), `${PAGE_URL}?grade=g17&room=ABC123`, `${label}：還沒回答，網址的 room 還在`);
        assert.equal(ready.settled, false, label);

        answer(page);
        await page.settle();
        assert.equal(linkOpen(page), false, `${label}：關掉的是看得到的對話框`);
        assert.equal(detailOpen(), false, `${label}：詳細檢視沒有再出現`);
        assert.equal(page.dom.window.ModalManager.topmost(), null, `${label}：什麼都沒開著`);
        assert.ok(page.focused() === thumb, `${label}：焦點回到那張卡片的縮圖`);
        assert.equal(currentUrl(page), `${PAGE_URL}?grade=g17`, `${label}：回答了（不加入）才拿掉 room`);
        assert.deepEqual(requestsOf(server), [GET_ROOM], `${label}：沒有加入`);
        assert.equal(ready.settled, true, label);
    }
});

// 沒有留著的請求時（還沒按過加入、再讀 B 就失敗、請求被明確拒絕），名字照舊用目前的語言重算：見上面「連結對話框開著時切到英文」的測試
test('加入的 POST 連不上（5xx）之後切換語言：名字那一行寫的是重試時送出去的那一個（第一次的名字），不是用新語言重算的預設名字——重試照樣帶第一次的請求（connectionRequest()）', async () => {
    let posts = 0;
    const server = linkServer({
        join: (body, joined) => {
            posts += 1;
            if (posts === 1) throw roomError(503, 'UNAVAILABLE');
            return joined(body);
        }
    });
    const page = await openLinkPage(server.respond);
    assert.equal(text(page, 'joinLinkName'), '你會叫「光之戰士T8W」，加入後可以改名。');
    await pressLinkConfirm(page);
    assert.equal(text(page, 'joinLinkError'), NETWORK_ERROR);
    assert.equal(page.client.currentRoom, null, '前提：沒有加入');
    assert.equal(page.client.connectionAttempt?.key, 'join:ABC123', '前提：連不上的加入留著，重試要帶同一個請求');

    page.setLang('en');
    const shown = text(page, 'joinLinkName');
    assert.equal(shown, 'You\'ll appear as "光之戰士T8W". You can rename after joining.', '不是用英文重算的 Warrior of Light T8W');

    await pressLinkConfirm(page);
    const [first, retry] = server.requests.filter((request) => `${request.method} ${request.path}` === POST_JOIN);
    assert.equal(shown, `You'll appear as "${retry.body.memberNickname}". You can rename after joining.`, '寫的就是重試送出去的名字');
    assert.equal(retry.body.clientRequestId, first.body.clientRequestId, '重試是同一個請求');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.client.currentUser.nickname, '光之戰士T8W');
});

test('加入進行中自己關掉對話框（不用了、Escape）：結果照常處理——成功就在隊伍 B（不開面板），失敗改跳 toast、網址拿掉 room；ready 等加入結束才完成', async () => {
    for (const [label, join, close] of [
        ['成功、按不用了', (body, joined) => joined(body), (page) => page.$('dismissLinkBtn').click()],
        ['失敗、按 Escape', () => { throw roomError(409, 'ROOM_FULL'); }, (page) => page.key('Escape')]
    ]) {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const server = linkServer({ join: async (body, joined) => { await gate; return join(body, joined); } });
        const page = await openLinkPage(server.respond);
        const ready = watchReady(page);
        assert.ok(linkOpen(page), `${label}：前提，對話框開著`);
        page.$('confirmLinkBtn').focus();
        page.$('confirmLinkBtn').click();
        await page.settle();
        assert.deepEqual(linkDisabledOf(page), [true, true, true, false, false], `${label}：加入進行中，不用了與 ✕ 還能按`);
        close(page);
        await page.settle();
        assert.equal(linkOpen(page), false, `${label}：對話框關掉了`);
        assert.equal(ready.settled, false, `${label}：加入還沒結束，ready 還沒完成`);
        release();
        await page.settle();
        assert.equal(ready.settled, true, label);
        if (label.startsWith('成功')) {
            assert.equal(page.client.currentRoom.roomCode, 'ABC123', label);
            assert.equal(currentUrl(page), LINK_URL, label);
            assert.deepEqual(messages(page), ['已加入隊伍 ABC123'], label);
            assert.equal(page.finder.modalManager.activeModal, null, `${label}：對話框早就關了，不再打開面板`);
        } else {
            assert.equal(page.client.currentRoom, null, label);
            assert.equal(currentUrl(page), PAGE_URL, label);
            assert.deepEqual(page.toasts, [{ message: FULL_B, type: 'error' }], `${label}：錯誤改跳 toast`);
            assert.deepEqual([text(page, 'joinLinkError'), isHidden(page, 'joinLinkError')], ['', true], `${label}：不寫進已經關掉的對話框`);
        }
    }
});

test('讀隊伍（打開對話框之前）的這段時間當作連線中（同以前載入時自動加入）：建立隊伍、加入隊伍與清單的按鈕停用，建立、加入隊伍不開也不送請求，清單改不了；讀完照常問——情況 c 按加入就加入 B，情況 d 按不用了接回 A（A 的紀錄沒有被別的隊伍蓋掉）', async () => {
    for (const [label, stored, answer] of [['c', {}, pressLinkConfirm], ['d', { ff14tw_current_room: recordOf() }, pressLinkDismiss]]) {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const server = linkServer();
        let first = true;
        const page = await openLinkPage(async (path, options) => {
            // 建立隊伍的請求照樣回一個隊伍 XYZ789：沒擋住的話，這段時間就真的建起另一個隊伍
            if (path === '/rooms' && options.method === 'POST') {
                server.requests.push({ method: 'POST', path });
                return { roomCode: 'XYZ789', creatorId: T8W.id, members: [T8W], treasureMaps: [], revision: 0, lastActivityAt: ISO, memberId: T8W.id, memberToken: TOKEN };
            }
            // 載入時讀 B 的回應卡住，直到 release()
            if (first && path === '/rooms/ABC123') {
                first = false;
                await gate;
            }
            return server.respond(path, options);
        }, { stored });
        page.finder.openListPanel();
        assert.equal(linkOpen(page), false, `${label}：還在讀隊伍，對話框還沒開`);
        assert.equal(page.client.isConnecting, true, `${label}：讀隊伍的這段時間是連線中`);
        assert.deepEqual(['createRoomBtn', 'joinRoomBtn', 'clearAllBtn', 'importListBtn'].map((id) => page.$(id).disabled), [true, true, true, true], `${label}：組隊與清單的按鈕停用`);
        // 不只是按鈕停用：建立、加入隊伍的入口本身也不開，清單也改不了
        await page.client.dialogs.openCreate();
        page.client.dialogs.openJoin();
        page.addMaps(['tm_017']);
        await page.settle();
        assert.equal(page.client.currentRoom, null, `${label}：沒有建立別的隊伍`);
        assert.equal(joinOpen(page), false, `${label}：加入隊伍的對話框沒開`);
        assert.deepEqual(listIds(page), [], `${label}：清單沒變`);
        assert.deepEqual(requestsOf(server), [], `${label}：沒有送建立隊伍的請求`);
        assert.deepEqual(page.toasts, [{ message: '正在連上隊伍，請稍候再修改清單。', type: 'info' }], label);

        release();
        await page.settle();
        assert.ok(linkOpen(page), `${label}：讀完照常問`);
        assert.equal(page.client.isConnecting, false, `${label}：讀完就不是連線中`);
        assert.deepEqual(['createRoomBtn', 'joinRoomBtn', 'clearAllBtn', 'importListBtn'].map((id) => page.$(id).disabled), [false, false, false, false], `${label}：按鈕恢復`);
        await answer(page);
        const expected = label === 'c' ? 'ABC123' : A_CODE;
        assert.equal(page.client.currentRoom?.roomCode, expected, label);
        assert.equal(savedRoom(page).roomCode, expected, `${label}：存著的是 ${expected} 的紀錄`);
        assert.equal(currentUrl(page), `${PAGE_URL}?room=${expected}`, label);
    }
});

test('情況 d 按加入之後再讀 B 的這段時間也當作連線中：這時按 Escape 關掉對話框、頁面又能操作了，建立隊伍與清單照樣改不了；讀完照常離開 A、加入 B，ready 才完成', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const server = linkServer();
    let reads = 0;
    // 第二次讀 B（按加入之後再讀一次）的回應卡住，直到 release()
    const page = await openLinkPage(async (path, options) => {
        if (path === '/rooms/ABC123' && (options.method ?? 'GET') === 'GET' && ++reads === 2) await gate;
        return server.respond(path, options);
    }, { stored: { ff14tw_current_room: recordOf() } });
    const ready = watchReady(page);
    assert.ok(linkOpen(page));
    page.$('confirmLinkBtn').focus();
    page.$('confirmLinkBtn').click();
    await page.settle();
    page.key('Escape');
    await page.settle();
    assert.equal(linkOpen(page), false, '對話框關掉了');
    page.finder.openListPanel();
    assert.equal(page.client.isConnecting, true, '再讀 B 的這段時間是連線中');
    assert.equal(page.$('createRoomBtn').disabled, true);
    await page.client.dialogs.openCreate();
    page.addMaps(['tm_017']);
    await page.settle();
    assert.equal(page.client.currentRoom, null, '沒有建立別的隊伍');
    assert.deepEqual(listIds(page), [], '清單沒變');
    assert.equal(ready.settled, false);

    release();
    await page.settle();
    assert.deepEqual(requestsOf(server), [GET_ROOM, GET_ROOM, POST_LEAVE_A, GET_ROOM, POST_JOIN], '照常離開 A、加入 B');
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(savedRoom(page).roomCode, 'ABC123');
    assert.equal(ready.settled, true);
});

test('防呆：問完之前已經在別的隊伍 XYZ789 裡（讀隊伍時入口都停用了，正常不會發生；這裡直接接上）——不用了不接回 A、不拿掉網址的 room；情況 d 按加入不接回 A、不離開 A、不加入 B，XYZ789 照舊', async () => {
    const X = { roomCode: 'XYZ789', creatorId: T8W.id, members: [T8W], treasureMaps: [], revision: 0, lastActivityAt: ISO };
    for (const [label, stored, answer] of [['c 不用了', {}, pressLinkDismiss], ['d 不用了', { ff14tw_current_room: recordOf() }, pressLinkDismiss],
        ['d 加入', { ff14tw_current_room: recordOf() }, pressLinkConfirm]]) {
        const server = linkServer();
        const page = await openLinkPage(server.respond, { stored });
        assert.ok(linkOpen(page), label);
        page.client.adoptSession(X, T8W, TOKEN);
        assert.equal(currentUrl(page), `${PAGE_URL}?room=XYZ789`, `${label}：前提，在 XYZ789 裡`);
        await answer(page);
        assert.equal(page.client.currentRoom?.roomCode, 'XYZ789', `${label}：還在 XYZ789`);
        assert.equal(savedRoom(page).roomCode, 'XYZ789', `${label}：存著的還是 XYZ789 的紀錄`);
        assert.equal(currentUrl(page), `${PAGE_URL}?room=XYZ789`, `${label}：網址的 room 不拿掉`);
        assert.ok(!requestsOf(server).includes(POST_LEAVE_A) && !requestsOf(server).includes(POST_JOIN), `${label}：不離開 A、不加入 B`);
    }
});

// ---------- 同步狀態：連不上時一直顯示，不重複跳 toast ----------
// 連續 3 次傳輸失敗（讀不到隊伍、送不出變更；沒有 status、5xx、429）#partySync 才換成「連不上，重試中」：
// 警告色（is-warn）、警告那一行出現，沒有 toast；有一次成功才回到「已同步」：一筆變更送出去了，或一次輪詢讀得到隊伍、排著的變更也送完了
// （只讀得到隊伍不算：變更一直送不出去時每次輪詢的 GET 都成功，不能把送出失敗的次數洗掉）。伺服器拒絕一筆變更（其他 4xx）不是連不上，各有一句 toast
// #partySync 現在顯示的：[文字, 警告色（is-warn）, 警告那一行有沒有顯示]
const syncShown = (page) => [page.$('partySyncText').textContent, page.$('partySync').classList.contains('is-warn'), !isHidden(page, 'partySyncNote')];
const SYNCED = ['已同步', false, false];
const FAILING = ['連不上，重試中', true, true];
const CREATED_TOAST = ['隊伍 ABC123 建立成功！'];
const REJECTED_LIMIT = '隊伍清單最多 8 張，剛剛加的寶圖沒有加進去。';
const REJECTED = '有一筆變更沒有送進隊伍，清單已換成隊伍目前的樣子。';
const SESSION_EXPIRED_TOAST = '隊伍連線已失效，可能是被移出了隊伍。寶圖留在你的清單；要回去可以再點一次邀請連結，或輸入隊伍代號。';
const offline = () => new TypeError('Failed to fetch');
// 輪詢讀到隊伍：目前的隊伍（revision 加一）
const reads = (page) => () => ({ ...page.client.currentRoom, revision: page.client.currentRoom.revision + 1 });
// 伺服器收下送出的變更：add 的寶圖進隊伍清單（addedBy 是自己），revision 加一
const acknowledges = (page) => ({ body }) => {
    const current = page.client.currentRoom;
    return { ...current, revision: current.revision + 1,
        treasureMaps: [...current.treasureMaps, ...body.operations.filter((operation) => operation.type === 'add').map((operation) => ({ ...operation.map, addedBy: 'me', addedAt: ISO }))] };
};
// 連續輪詢 times 次（每一次等結束）
const pollTimes = async (page, times) => {
    for (let index = 0; index < times; index += 1) await page.client.poll();
};
// 這個元素的 textContent 被寫了幾次：在元素自己身上包一層 setter，getter 照原本的（PartyStatus.setText() 靠它判斷字有沒有變）
const countTextWrites = (element) => {
    let prototype = Object.getPrototypeOf(element);
    while (!Object.getOwnPropertyDescriptor(prototype, 'textContent')) prototype = Object.getPrototypeOf(prototype);
    const original = Object.getOwnPropertyDescriptor(prototype, 'textContent');
    const counter = { writes: 0 };
    Object.defineProperty(element, 'textContent', {
        configurable: true,
        get() { return original.get.call(this); },
        set(value) { counter.writes += 1; original.set.call(this, value); }
    });
    return counter;
};

test('連續 3 次輪詢失敗：「連不上，重試中」、警告色、警告那一行出現，沒有 toast；下一次讀得到：「已同步」、警告那一行藏起來；失敗要連續才算', async () => {
    let up = false;
    let page;
    const server = partyServer({ read: () => { if (!up) throw offline(); return reads(page)(); } });
    page = await createdParty({ respond: server.respond });
    assert.deepEqual(syncShown(page), SYNCED, '建立之後');
    assert.equal(page.$('partySync').getAttribute('role'), 'status');

    // 連續才算：失敗兩次、讀到一次、再失敗兩次，一直是已同步
    await pollTimes(page, 2);
    assert.deepEqual(syncShown(page), SYNCED, '失敗 2 次還不算');
    up = true;
    await pollTimes(page, 1);
    up = false;
    await pollTimes(page, 2);
    assert.deepEqual(syncShown(page), SYNCED, '讀到一次之後重新數：再失敗 2 次還不算');

    await pollTimes(page, 1);
    assert.deepEqual(syncShown(page), FAILING, '連續第 3 次');
    assert.deepEqual(messages(page), CREATED_TOAST, '連不上由同步狀態說，不跳 toast');

    // 還是讀不到：維持連不上，照樣沒有 toast（以前每失敗 3 次就跳一次「同步失敗」）
    await pollTimes(page, 6);
    assert.deepEqual([syncShown(page), messages(page)], [FAILING, CREATED_TOAST]);

    up = true;
    await pollTimes(page, 1);
    assert.deepEqual(syncShown(page), SYNCED, '讀得到了');
    assert.deepEqual(messages(page), CREATED_TOAST);
    assert.deepEqual([page.client.syncState, page.client.transportFailures], ['ok', 0]);
});

test('送出變更的傳輸失敗也算（fetch 失敗、5xx、429 都一樣）：連續 3 次送不出去才是「連不上」，沒有 toast；連不上時再改清單，重畫不把它蓋回「已同步」；送出成功就歸零，要再連續 3 次才又是「連不上」', async () => {
    const queue = [];   // 接下來送出的變更依序丟出這些錯誤；用完了就成功
    let page;
    const server = partyServer({ update: (options) => { if (queue.length) throw queue.shift(); return acknowledges(page)(options); } });
    page = await createdParty({ respond: server.respond });
    const puts = () => server.requests.filter((request) => request.method === 'PUT');
    // 這個測試直接呼叫 mapSync.flush() 重送；每次輪詢先讀隊伍再重送的節奏，在下一個測試
    queue.push(offline(), roomError(503, 'UNAVAILABLE'), roomError(429, 'TOO_MANY_REQUESTS'));

    page.addMaps(['tm_017']);
    await page.settle();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [1, SYNCED], '第 1 次送不出去（fetch 失敗）');
    await page.client.mapSync.flush();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [2, SYNCED], '第 2 次（503）');
    await page.client.mapSync.flush();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [3, FAILING], '第 3 次（429）');
    assert.deepEqual(messages(page), CREATED_TOAST, '沒有 toast');
    assert.equal(page.client.mapSync.pending.length, 1, '那一筆還留著，等著重送');
    assert.equal(puts().length, 3);

    // 連不上時再改清單：這筆排進佇列、清單與入口重畫，同步狀態不能被蓋回「已同步」；這一次也送不出去
    queue.push(roomError(503, 'UNAVAILABLE'));
    page.addMaps(['tm_007']);
    await page.settle();
    assert.deepEqual(syncShown(page), FAILING, '重畫之後還是連不上');
    assert.equal(page.client.mapSync.pending.length, 2);

    // 連上了：送出成功就歸零，兩筆都送完
    await page.client.mapSync.flush();
    assert.deepEqual(syncShown(page), SYNCED, '送出成功');
    assert.deepEqual([page.client.syncState, page.client.transportFailures, page.client.mapSync.pending.length], ['ok', 0, 0]);
    assert.deepEqual(messages(page), CREATED_TOAST);

    // 歸零之後重新數：只失敗 2 次，還是已同步
    queue.push(roomError(503, 'UNAVAILABLE'), roomError(503, 'UNAVAILABLE'));
    page.addMaps(['tm_007']);
    await page.settle();
    await page.client.mapSync.flush();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [2, SYNCED], '歸零之後只失敗 2 次');
});

test('真的輪詢的節奏（每次輪詢先讀隊伍、再重送排著的變更）：讀得到、但變更一直送不出去，連續 3 次輪詢之後是「連不上，重試中」，不能一直停在「已同步」；之後一次輪詢送得出去才回到「已同步」', async () => {
    let putUp = false;
    let page;
    const server = partyServer({
        read: () => reads(page)(),
        update: (options) => { if (!putUp) throw roomError(503, 'UNAVAILABLE'); return acknowledges(page)(options); }
    });
    page = await createdParty({ respond: server.respond });
    const sent = (method) => server.requests.filter((request) => request.method === method);
    // 一筆排著、還沒送出去的變更（隊友還看不到）：之後每次輪詢 GET 都讀得到、PUT 都回 503
    page.client.mapSync.pending.push({ clientRequestId: 'pending-1', operations: [{ type: 'add', map: serverMap('map_9', 'me') }] });

    await pollTimes(page, 2);
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [2, SYNCED], '輪詢 2 次：讀得到、變更送不出去，還不算');
    await pollTimes(page, 1);
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [3, FAILING], '連續第 3 次輪詢：變更一直送不出去，不能停在已同步');
    assert.deepEqual(messages(page), CREATED_TOAST, '不跳 toast');
    assert.equal(page.client.mapSync.pending.length, 1, '那一筆還留著，等著重送');
    assert.equal(sent('GET').length, 3, '三次輪詢都讀得到隊伍');
    assert.deepEqual(sent('PUT').map((request) => request.body.clientRequestId), ['pending-1', 'pending-1', 'pending-1'], '每次輪詢重送的都是同一筆');

    // 還是送不出去：維持連不上，照樣沒有 toast
    await pollTimes(page, 3);
    assert.deepEqual([syncShown(page), messages(page)], [FAILING, CREATED_TOAST]);

    // 送得出去了：這次輪詢讀得到隊伍、排著的變更也送完，才回到已同步
    putUp = true;
    await pollTimes(page, 1);
    assert.deepEqual(syncShown(page), SYNCED);
    assert.deepEqual([page.client.syncState, page.client.transportFailures, page.client.mapSync.pending.length], ['ok', 0, 0]);
    assert.deepEqual(messages(page), CREATED_TOAST);
});

test('已經是連不上時再失敗、再重畫：#partySyncText 不再被寫入，焦點留在成員列的按鈕上；重畫也不把「連不上」蓋回「已同步」（Review Focus 1）', async () => {
    let up = false;
    let page;
    const server = partyServer({
        read: () => { if (!up) throw offline(); return reads(page)(); },
        update: (options) => { if (!up) throw roomError(503, 'UNAVAILABLE'); return acknowledges(page)(options); }
    });
    page = await createdParty({ respond: server.respond });
    const text = countTextWrites(page.$('partySyncText'));

    await pollTimes(page, 3);
    assert.deepEqual(syncShown(page), FAILING);
    assert.equal(text.writes, 1, '變成連不上的那一次寫一次');

    // 再失敗幾次、隊伍資料的各種重畫（輪詢帶回資料、展開再收合、本機改清單又送不出去）：一個字都不再寫
    await pollTimes(page, 2);
    serverChanges(page, {});
    expand(page);
    expand(page);
    page.addMaps(['tm_017']);
    await page.settle();
    await page.client.mapSync.flush();
    assert.deepEqual(syncShown(page), FAILING, '重畫之後還是連不上');
    assert.equal(text.writes, 1, '已經是連不上：再失敗、再重畫都不重寫（螢幕閱讀器不重唸）');

    // 焦點在成員列的改名鈕上時（面板關著的時候整個面板是 inert，拿不到焦點，所以先打開），隊友加入又改名、成員列表重建：
    // 焦點跟到同一個人的新鈕，同步狀態的字一樣不重寫
    page.finder.openListPanel();
    expand(page);
    const rename = buttonOf(page, 'me', 'rename');
    rename.focus();
    assert.ok(page.focused() === rename, '先確認前提：焦點在改名鈕上');
    serverChanges(page, { members: [ME, M4X] });
    serverChanges(page, { members: [ME, { ...M4X, nickname: '新名字' }] });
    serverChanges(page, {});
    await pollTimes(page, 2);
    assert.ok(page.focused() === buttonOf(page, 'me', 'rename'), '焦點留在同一個人的改名鈕');
    assert.deepEqual(syncShown(page), FAILING);
    assert.equal(text.writes, 1, '成員列表重建、再失敗，同步狀態的字還是沒重寫');
    assert.deepEqual(messages(page), CREATED_TOAST);

    // 連上了（讀得到、送得出去）：「已同步」寫一次；之後的重畫也不重寫
    up = true;
    await pollTimes(page, 1);
    assert.deepEqual(syncShown(page), SYNCED);
    assert.equal(text.writes, 2, '回到已同步那一次寫一次');
    serverChanges(page, {});
    await pollTimes(page, 2);
    assert.equal(text.writes, 2, '已同步之後再重畫也不重寫');
});

test('連不上時切換語言：文字與警告那一行換成新語言，照樣是連不上；切回來也一樣', async () => {
    const server = partyServer({ read: () => { throw offline(); } });
    const page = await createdParty({ respond: server.respond });
    await pollTimes(page, 3);
    assert.deepEqual(syncShown(page), FAILING);

    page.setLang('en');
    assert.deepEqual(syncShown(page), ["Can't connect — retrying", true, true]);
    assert.equal(page.$('partySyncNote').textContent, "The list may be out of date. Your changes will be sent once you're connected.");
    page.setLang('ja');
    assert.deepEqual(syncShown(page), ['接続できません・再試行中', true, true]);
    assert.equal(page.$('partySyncNote').textContent, 'リストが最新でない可能性があります。変更は接続後に送信されます。');
    page.setLang('zh');
    assert.deepEqual(syncShown(page), FAILING);
    assert.equal(page.$('partySyncNote').textContent, '清單可能不是最新的。你的變更會在連上之後送出。');
});

test('伺服器拒絕一筆變更（4xx）：MAP_LIMIT 跳「隊伍清單最多 8 張，剛剛加的寶圖沒有加進去。」，其他 4xx 跳通用的字；那一筆丟掉、清單換成隊伍目前的樣子、不重送；這不是連不上，同步狀態不變', async () => {
    const cases = [
        ['MAP_LIMIT', roomError(400, 'MAP_LIMIT'), REJECTED_LIMIT],
        ['INVALID_REQUEST', roomError(400, 'INVALID_REQUEST'), REJECTED],
        ['REQUEST_ID_REUSED（409）', roomError(409, 'REQUEST_ID_REUSED'), REJECTED]
    ];
    for (const [label, rejection, message] of cases) {
        const server = partyServer({ update: () => { throw rejection; } });
        const page = await createdParty({ respond: server.respond });
        page.addMaps(['tm_017']);
        await page.settle();
        assert.deepEqual(page.toasts.at(-1), { message, type: 'error' }, label);
        assert.equal(page.toasts.length, 2, `${label}：建立隊伍一個、拒絕一個`);
        assert.equal(page.client.mapSync.pending.length, 0, `${label}：那一筆已經丟掉`);
        assert.equal(page.finder.listManager.getLength(), 0, `${label}：清單換成隊伍目前的樣子`);
        await page.client.mapSync.flush();
        assert.equal(server.requests.filter((request) => request.method === 'PUT').length, 1, `${label}：不重送`);
        assert.deepEqual(syncShown(page), SYNCED, `${label}：伺服器回得出答案，不是連不上`);
        assert.deepEqual([page.client.syncState, page.client.transportFailures], ['ok', 0], label);
    }
});

test('被拒絕之前已經失敗過：伺服器回得出答案（明確拒絕）就是連得上，失敗次數歸零——失敗 2 次再被拒絕，之後只失敗 1 次不算連不上；已經是連不上時被拒絕，馬上回到「已同步」，不用等下一次輪詢', async () => {
    const queue = [];   // 接下來送出的變更依序丟出這些錯誤；用完了就成功
    let page;
    const server = partyServer({ update: (options) => { if (queue.length) throw queue.shift(); return acknowledges(page)(options); } });
    page = await createdParty({ respond: server.respond });

    // 送不出去 2 次（還不算連不上），第 3 次伺服器明確拒絕：那一筆丟掉、跳拒絕的 toast，失敗次數歸零
    queue.push(offline(), roomError(503, 'UNAVAILABLE'), roomError(400, 'INVALID_REQUEST'));
    page.addMaps(['tm_017']);
    await page.settle();
    await page.client.mapSync.flush();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [2, SYNCED], '先確認前提：失敗 2 次');
    await page.client.mapSync.flush();
    assert.deepEqual(page.toasts.at(-1), { message: REJECTED, type: 'error' });
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [0, SYNCED], '被拒絕：伺服器回得出答案，失敗次數歸零');

    // 之後只失敗 1 次：不是連不上
    queue.push(offline());
    page.addMaps(['tm_007']);
    await page.settle();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [1, SYNCED], '歸零之後只失敗 1 次');

    // 再失敗 2 次（連續 3 次，連不上），下一次被拒絕：馬上回到已同步
    queue.push(offline(), offline(), roomError(400, 'MAP_LIMIT'));
    await page.client.mapSync.flush();
    await page.client.mapSync.flush();
    assert.deepEqual([page.client.transportFailures, syncShown(page)], [3, FAILING], '先確認前提：連續 3 次');
    await page.client.mapSync.flush();
    assert.deepEqual(page.toasts.at(-1), { message: REJECTED_LIMIT, type: 'error' });
    assert.deepEqual([page.client.transportFailures, syncShown(page), page.client.mapSync.pending.length], [0, SYNCED, 0], '被拒絕：馬上回到已同步');
});

test('送出變更時伺服器不認得我（401、403、404）：照舊走連線失效——離開隊伍、跳連線失效的提示，不是拒絕的 toast，也不算連不上', async () => {
    for (const status of [401, 403, 404]) {
        const server = partyServer({ update: () => { throw roomError(status, 'UNAUTHORIZED'); } });
        const page = await createdParty({ respond: server.respond });
        page.addMaps(['tm_017']);
        await page.settle();
        assert.equal(page.client.currentRoom, null, `${status}：離開隊伍`);
        assert.deepEqual(page.toasts.slice(1), [{ message: SESSION_EXPIRED_TOAST, type: 'warning' }], `${status}：只有連線失效的提示`);
        assert.deepEqual([page.client.syncState, page.client.transportFailures], ['ok', 0], status);
    }
});

test('離開或被迫離開後回到 ok、失敗次數歸零：連不上的隊伍離開（自己離開、被移出、隊伍過期）之後，下一個隊伍從「已同步」開始', async () => {
    let mode = 'offline';
    let page;
    const server = partyServer({ read: () => { throw mode === 'offline' ? offline() : roomError(404, 'ROOM_NOT_FOUND'); } });
    const leaves = {
        自己離開: async () => { assert.deepEqual(plain(await page.client.leaveRoom(true)), { success: true }); },
        被移出: async () => { serverChanges(page, { members: [M4X, R6V] }); },
        隊伍過期: async () => { mode = 'gone'; await pollTimes(page, 1); }
    };
    for (const [label, leave] of Object.entries(leaves)) {
        mode = 'offline';
        page = await createdParty({ respond: server.respond });
        await pollTimes(page, 3);
        assert.deepEqual(syncShown(page), FAILING, `${label}：前提，連不上`);

        await leave();
        assert.equal(page.client.currentRoom, null, label);
        assert.deepEqual([page.client.syncState, page.client.transportFailures], ['ok', 0], `${label}：回到 ok、次數歸零`);

        // 再建立一個隊伍：從「已同步」開始，不帶著上一個隊伍的連不上；再失敗 2 次也還不算（次數真的歸零了）
        assert.equal((await page.client.createRoom()).success, true, label);
        assert.deepEqual(syncShown(page), SYNCED, `${label}：下一個隊伍`);
        mode = 'offline';
        await pollTimes(page, 2);
        assert.deepEqual([page.client.transportFailures, syncShown(page)], [2, SYNCED], `${label}：失敗次數重新數`);
    }
});

test('同步狀態的樣式：連不上時 #partySync 加的 is-warn 有規則（文字與圓點換成警告色），只用 token，寫在最後的 .hidden 前面', () => {
    const css = stripComments(read(`${TOOL_DIR}/style.css`));
    const { bodyOf } = cssRules(css);
    assert.match(bodyOf('.tm-sync.is-warn'), /color:\s*var\(--color-warning-text\)/);
    assert.match(bodyOf('.tm-sync.is-warn .tm-sync-dot'), /background:\s*var\(--color-warning\)/);
    for (const selector of ['.tm-sync.is-warn', '.tm-sync.is-warn .tm-sync-dot']) {
        assert.ok(css.indexOf(`${selector} {`) < css.lastIndexOf('\n.hidden {'), `${selector} 要寫在最後的 .hidden 前面`);
    }
    assert.ok(read(`${TOOL_DIR}/party-status.js`).includes("'is-warn'"), 'PartyStatus 真的會加 is-warn');
});

// ---------- 三語的字 ----------
test('隊伍狀態的鍵值：新增與改寫的三語都照設計寫；舊的最後更新、剩餘時間、暱稱列的鍵值三語都刪掉，頁面與程式裡也不留；新字沒有舊用語', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_party_label: ['隊伍', 'Party', 'パーティ'],
        treasure_map_party_code: ['隊伍代號', 'Party code', 'パーティコード'],
        treasure_map_sync_ok: ['已同步', 'Synced', '同期済み'],
        treasure_map_sync_note: ['清單可能不是最新的。你的變更會在連上之後送出。', "The list may be out of date. Your changes will be sent once you're connected.",
            'リストが最新でない可能性があります。変更は接続後に送信されます。'],
        treasure_map_copy_invite: ['複製邀請連結', 'Invite link', '招待'],
        treasure_map_invite_copied: ['已複製邀請連結', 'Invite link copied', '招待リンクをコピーしました'],
        treasure_map_copy_room_code: ['複製代號', 'Copy code', 'コードをコピー'],
        treasure_map_room_code_copied: ['已複製隊伍代號', 'Party code copied', 'パーティコードをコピーしました'],
        treasure_map_party_leave: ['離開隊伍', 'Leave', '抜ける'],
        treasure_map_leave_room: ['離開隊伍', 'Leave party', 'パーティを抜ける'],
        treasure_map_members_count: ['成員 {count}/{max}', 'Members {count}/{max}', 'メンバー {count}/{max}'],
        treasure_map_member_you_suffix: ['{name}（你）', '{name} (you)', '{name}（あなた）'],
        treasure_map_member_you: ['你', 'You', 'あなた'],
        treasure_map_member_maps: ['{count} 張', 'Maps: {count}', '{count} 枚'],
        treasure_map_rename: ['改名', 'Rename', '名前を変更'],
        treasure_map_remove_member: ['移出', 'Remove', '除名'],
        treasure_map_remove_member_label: ['把 {nickname} 移出隊伍', 'Remove {nickname} from the party', '{nickname} をパーティから除名'],
        treasure_map_party_ttl_note: ['隊伍 24 小時沒有動靜會自動解散。', 'A party ends after 24 hours without activity.', 'パーティは 24 時間動きがないと自動的に解散します。']
    };
    const removed = [
        'treasure_map_room_code', 'treasure_map_last_update', 'treasure_map_room_ttl', 'treasure_map_your_nickname', 'treasure_map_team_members',
        'treasure_map_member_count', 'treasure_map_remove_member_tooltip', 'treasure_map_just_now', 'treasure_map_minutes_ago', 'treasure_map_hours_ago',
        'treasure_map_more_than_a_day_ago', 'treasure_map_ttl_expired', 'treasure_map_ttl_hours_minutes', 'treasure_map_ttl_minutes'
    ];
    // {count}、{nickname} 這些是參數名稱，不是字：掃用語之前先拿掉 {…}
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
    });

    // 頁面與程式（含註解）裡不留舊的鍵值；treasure_map_room_code 是 treasure_map_room_code_copied 的開頭，所以比的是整個詞
    const sources = [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((name) => name.endsWith('.js')).map((name) => `${TOOL_DIR}/${name}`)];
    for (const file of sources) {
        for (const key of removed) assert.doesNotMatch(read(file), new RegExp(`\\b${key}\\b`), `${file} 還有 ${key}`);
    }
});

test('入口與建立隊伍的鍵值：新增與改寫的三語都照設計寫；新字沒有舊用語，英文帶張數的句子把數字放在最後，1 張時也讀得通', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_party_intro_title: ['和隊友共用一份清單', 'Share one list with your party', 'パーティで 1 つのリストを共有'],
        treasure_map_party_intro_hint: ['最多 8 人、8 張寶圖，每張都看得到是誰的。', 'Up to 8 members and 8 maps, and every map shows whose it is.',
            '最大 8 人・8 枚まで。どの地図も誰のものか分かります。'],
        treasure_map_create_room: ['建立隊伍', 'Create party', 'パーティを作る'],
        treasure_map_join_room: ['加入隊伍', 'Join party', 'パーティに参加'],
        treasure_map_create_title: ['建立隊伍', 'Create a party', 'パーティを作る'],
        treasure_map_choice_legend: ['你的寶圖要怎麼處理', 'What to do with your maps', 'あなたの地図をどうするか'],
        treasure_map_party_your_maps: ['你的清單有 {count} 張寶圖：', 'Maps in your list: {count}', 'あなたのリストには地図が {count} 枚あります：'],
        treasure_map_choice_bring: ['帶進隊伍清單', 'Bring them into the party list', 'パーティリストに持ち込む'],
        treasure_map_choice_bring_hint: ['隊友也看得到，會標成你的圖', 'Your party sees them too, marked as yours', 'メンバーにも表示され、あなたの地図として表示されます'],
        treasure_map_choice_clear: ['不帶，清空這 {count} 張', "Don't bring them — clear your list ({count})", '持ち込まない（{count} 枚を消す）'],
        treasure_map_choice_clear_hint_create: ['隊伍清單從空的開始', 'The party list starts empty', 'パーティリストは空から始まります']
    };
    // {count} 是參數名稱，不是字：掃用語之前先拿掉 {…}
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
    });
    // 英文帶張數的句子：數字放在最後（Maps in your list: {count}、({count})），不用 map(s)、is/are 這種會隨單複數變的寫法
    const en = translationValues(TRANSLATIONS, 'en');
    for (const key of ['treasure_map_party_your_maps', 'treasure_map_choice_clear']) {
        assert.match(en.get(key), /\{count\}\)?$/, key);
        assert.doesNotMatch(en.get(key), /\bmaps? (?:are|is)\b|\(s\)/i, key);
    }
});

test('加入隊伍的鍵值：改寫與新增的三語都照設計寫；舊的 treasure_map_enter_code 三語都刪掉，頁面與程式裡也不留；新字沒有舊用語', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_join_title: ['加入隊伍', 'Join a party', 'パーティに参加'],
        treasure_map_code_hint: ['6 碼英文和數字，向隊長要。打開隊長貼的邀請連結就不用輸入。',
            "6 letters and numbers — ask your party leader. No need to type it if you open the leader's invite link.",
            '英数字 6 文字。リーダーに聞いてください。リーダーの招待リンクを開けば入力は不要です。'],
        treasure_map_choice_clear_hint_join: ['只用隊伍清單', 'Use only the party list', 'パーティリストだけを使う']
    };
    const removed = ['treasure_map_enter_code'];
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index], oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
        // 沒有改寫的鍵值照用：代號欄的 placeholder、取消、加入、關閉
        for (const key of ['treasure_map_code_placeholder', 'treasure_map_cancel', 'treasure_map_join', 'treasure_map_close']) assert.ok(keys.has(key), `${lang} 少了 ${key}`);
    });

    // 頁面與程式（含註解）裡不留舊的鍵值
    const sources = [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((name) => name.endsWith('.js')).map((name) => `${TOOL_DIR}/${name}`)];
    for (const file of sources) {
        for (const key of removed) assert.doesNotMatch(read(file), new RegExp(`\\b${key}\\b`), `${file} 還有 ${key}`);
    }
    // 新的說明鍵值有人用：加入對話框的「不帶」說明
    assert.match(read(`${TOOL_DIR}/room-dialogs.js`), /'treasure_map_choice_clear_hint_join'/);
});

test('離開、移出、改名的鍵值：新增與改寫的三語都照設計寫；舊的 confirm、保留清單、暱稱欄鍵值三語都刪掉，頁面與程式裡也不留；程式裡的預設文字就是中文；新字沒有舊用語，英文帶張數的句子把數字放在最後', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_leave_title: ['離開隊伍', 'Leave the party', 'パーティを抜ける'],
        treasure_map_leave_choice: ['隊伍清單的寶圖要怎麼處理', "What to do with the party list's maps", 'パーティリストの地図をどうするか'],
        treasure_map_leave_lede: ['隊伍清單的 {count} 張寶圖：', 'Maps in the party list: {count}', 'パーティリストの地図 {count} 枚：'],
        treasure_map_leave_lede_empty: ['確定要離開隊伍 {code}？', 'Leave party {code}?', 'パーティ {code} を抜けますか？'],
        treasure_map_leave_keep: ['留在我的清單', 'Keep them in my list', '自分のリストに残す'],
        treasure_map_leave_keep_hint: ['離開後還是可以照這份清單跑', 'You can still follow this list after leaving', '抜けた後もこのリストで回れます'],
        treasure_map_leave_clear: ['清空', 'Clear them', '消す'],
        treasure_map_leave_clear_hint: ['清單從空的開始', 'Your list starts empty', 'リストは空から始まります'],
        treasure_map_leave_leader_note: ['你是隊長。離開後沒有人能移出成員（隊長不會轉給別人）。',
            "You're the leader. After you leave, no one can remove members (leadership isn't passed on).",
            'あなたはリーダーです。抜けると、誰もメンバーを除名できなくなります（リーダーは引き継がれません）。'],
        treasure_map_leave_last_note: ['你是最後一位成員，離開後隊伍就解散了。', "You're the last member. The party ends when you leave.", 'あなたが最後のメンバーです。抜けるとパーティは解散します。'],
        treasure_map_leave_room_sync_failed: ['你的變更還沒送出，請稍後再試。', "Your changes haven't been sent yet. Please try again shortly.",
            '変更がまだ送信されていません。しばらくしてからもう一度お試しください。'],
        treasure_map_leave_room_failed_retry: ['離開失敗，請稍後再試。', "Couldn't leave the party. Please try again later.", 'パーティを抜けられませんでした。しばらくしてからもう一度お試しください。'],
        treasure_map_left_room: ['已離開隊伍', 'You left the party', 'パーティを抜けました'],
        treasure_map_remove_title: ['把 {nickname} 移出隊伍？', 'Remove {nickname} from the party?', '{nickname} をパーティから除名しますか？'],
        treasure_map_remove_body: ['對方加的 {count} 張寶圖會留在隊伍清單。對方之後還是可以用代號或邀請連結重新加入。',
            'Their maps ({count}) stay in the party list. They can rejoin later with the code or the invite link.',
            '相手が追加した地図 {count} 枚はパーティリストに残ります。相手は後からコードや招待リンクで再参加できます。'],
        treasure_map_remove_body_none: ['對方之後還是可以用代號或邀請連結重新加入。', 'They can rejoin later with the code or the invite link.', '相手は後からコードや招待リンクで再参加できます。'],
        treasure_map_remove_member_failed_retry: ['移出失敗，請稍後再試。', "Couldn't remove the member. Please try again later.", '除名できませんでした。しばらくしてからもう一度お試しください。'],
        treasure_map_member_removed: ['已將 {nickname} 移出隊伍', 'Removed {nickname} from the party', '{nickname} をパーティから除名しました'],
        treasure_map_rename_title: ['改名', 'Rename', '名前を変更'],
        treasure_map_nickname_label: ['名字', 'Name', '名前'],
        treasure_map_nickname_hint: ['隊友看到的名字', 'The name your party sees', 'パーティに表示される名前'],
        treasure_map_nickname_updated: ['已改名', 'Name changed', '名前を変更しました'],
        treasure_map_session_expired: ['隊伍連線已失效，可能是被移出了隊伍。寶圖留在你的清單；要回去可以再點一次邀請連結，或輸入隊伍代號。',
            'Your party connection is no longer valid — you may have been removed. Your maps are kept in your list; to go back, open the invite link again or enter the party code.',
            'パーティとの接続が無効になりました。除名された可能性があります。地図はあなたのリストに残っています。戻るには招待リンクをもう一度開くか、パーティコードを入力してください。']
    };
    const removed = ['treasure_map_leave_confirm', 'treasure_map_keep_list_question', 'treasure_map_keep_and_leave', 'treasure_map_clear_and_leave',
        'treasure_map_remove_member_confirm', 'treasure_map_edit_nickname', 'treasure_map_nickname_placeholder'];
    // {count}、{code}、{nickname} 這些是參數名稱，不是字：掃用語之前先拿掉 {…}
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
        // 沒有改寫的鍵值照用：取消、確認、關閉、離開隊伍（確認鈕）、移出（確認鈕）
        for (const key of ['treasure_map_cancel', 'treasure_map_confirm', 'treasure_map_close', 'treasure_map_leave_room', 'treasure_map_remove_member']) {
            assert.ok(keys.has(key), `${lang} 少了 ${key}`);
        }
    });
    // 英文帶張數的句子：數字放在最後（Maps in the party list: {count}），不用 map(s)、is/are 這種會隨單複數變的寫法
    const en = translationValues(TRANSLATIONS, 'en');
    assert.match(en.get('treasure_map_leave_lede'), /\{count\}$/);
    for (const key of ['treasure_map_leave_lede', 'treasure_map_remove_body']) assert.doesNotMatch(en.get(key), /\bmaps? (?:are|is)\b|\(s\)/i, key);

    // 頁面與程式（含註解）裡不留舊的鍵值；每個新的鍵值都有人用；程式裡的預設文字（沒有翻譯時用）就是中文那一句
    const sources = [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((name) => name.endsWith('.js')).map((name) => `${TOOL_DIR}/${name}`)];
    const all = sources.map((file) => read(file)).join('\n');
    for (const file of sources) {
        for (const key of removed) assert.doesNotMatch(read(file), new RegExp(`\\b${key}\\b`), `${file} 還有 ${key}`);
    }
    for (const [key, texts] of Object.entries(written)) {
        assert.ok(all.includes(`'${key}'`) || all.includes(`"${key}"`), `沒有人用 ${key}`);
        for (const [, fallback] of all.matchAll(new RegExp(`getI18nText\\(\\s*'${key}',\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))) {
            assert.equal(fallback.replace(/\\(.)/g, '$1'), texts[0], `${key} 的預設文字不是中文那一句`);
        }
    }
});

test('邀請連結的鍵值：八個新鍵值三語都照設計寫；新字沒有舊用語，英文帶張數的句子寫成「x/8」不受單複數影響；程式裡的預設文字就是中文；每個都由 room-dialogs.js 用到', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_link_title: ['加入隊伍 {code}？', 'Join party {code}?', 'パーティ {code} に参加しますか？'],
        treasure_map_link_summary: ['{leader} 的隊伍 · {members}/{max} 人 · 隊伍清單 {maps}/{max} 張', "{leader}'s party · Members {members}/{max} · Party list {maps}/{max}",
            '{leader} のパーティ · {members}/{max} 人 · パーティリスト {maps}/{max} 枚'],
        treasure_map_link_summary_no_leader: ['{members}/{max} 人 · 隊伍清單 {maps}/{max} 張', 'Members {members}/{max} · Party list {maps}/{max}', '{members}/{max} 人 · パーティリスト {maps}/{max} 枚'],
        treasure_map_link_name: ['你會叫「{name}」，加入後可以改名。', 'You\'ll appear as "{name}". You can rename after joining.', 'あなたの名前は「{name}」になります。参加後に変更できます。'],
        treasure_map_link_leave_current: ['你目前在隊伍 {current}。加入 {code} 會先離開 {current}，{current} 的寶圖會留在你的清單。',
            "You're in party {current}. Joining {code} leaves {current} first; its maps stay in your list.",
            '現在パーティ {current} に参加中です。{code} に参加すると先に {current} を抜けます。{current} の地図はあなたのリストに残ります。'],
        treasure_map_link_leave_failed: ['還沒離開隊伍 {current}：{reason}', "You're still in party {current}: {reason}", 'まだパーティ {current} を抜けていません：{reason}'],
        treasure_map_choice_bring_hint_total: ['隊伍清單會變成 {total}/{max} 張', 'The party list becomes {total}/{max}', 'パーティリストは {total}/{max} 枚になります'],
        // 「不用了」自己一個鍵值：不借分享對話框的 treasure_map_share_dismiss（它的日文「追加しない」是「不加入寶圖」）
        treasure_map_link_dismiss: ['不用了', 'No thanks', '参加しない']
    };
    // {code}、{current} 這些是參數名稱，不是字：掃用語之前先拿掉 {…}
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        // 照用的鍵值：「關閉」（只剩錯誤時）、「加入」、「不帶」的說明
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of ['treasure_map_close', 'treasure_map_join', 'treasure_map_choice_clear_hint_join']) assert.ok(keys.has(key), `${lang} 少了 ${key}`);
    });
    // 英文帶人數、張數的句子：數字寫成「x/8」，不用 map(s)、is/are 這種會隨單複數變的寫法
    const en = translationValues(TRANSLATIONS, 'en');
    for (const key of ['treasure_map_link_summary', 'treasure_map_link_summary_no_leader', 'treasure_map_choice_bring_hint_total']) {
        assert.doesNotMatch(en.get(key), /\bmaps? (?:are|is)\b|\(s\)|\bmembers? (?:are|is)\b/i, key);
    }

    // 每個新的鍵值都由 room-dialogs.js 用到；程式裡的預設文字（沒有翻譯時用）就是中文那一句
    const source = read(`${TOOL_DIR}/room-dialogs.js`);
    for (const [key, texts] of Object.entries(written)) {
        assert.ok(source.includes(`'${key}'`), `room-dialogs.js 沒有用 ${key}`);
        const fallbacks = [...source.matchAll(new RegExp(`getI18nText\\(\\s*'${key}',\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))];
        assert.ok(fallbacks.length > 0, `${key} 沒有預設文字`);
        for (const [, fallback] of fallbacks) assert.equal(fallback.replace(/\\(.)/g, '$1'), texts[0], `${key} 的預設文字不是中文那一句`);
    }
});

test('同步狀態的鍵值：三個新鍵值三語都照設計寫；沒人用了的 treasure_map_sync_to_room_failed 三語都刪掉，頁面與程式裡也不留；舊紀錄（沒有 token）的分支還在用的 treasure_map_room_sync_failed_network 留著；程式裡的預設文字就是中文；新字沒有舊用語', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_sync_failing: ['連不上，重試中', "Can't connect — retrying", '接続できません・再試行中'],
        treasure_map_sync_rejected_limit: ['隊伍清單最多 8 張，剛剛加的寶圖沒有加進去。', "A party list holds up to 8 maps; the map you just added wasn't added.",
            'パーティリストは 8 枚までです。追加した地図は登録されませんでした。'],
        treasure_map_sync_rejected: ['有一筆變更沒有送進隊伍，清單已換成隊伍目前的樣子。', "A change couldn't be saved to the party; your list now matches the party's.",
            '変更の 1 つがパーティに反映されませんでした。リストはパーティの現在の内容に戻りました。']
    };
    const removed = ['treasure_map_sync_to_room_failed'];
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index], oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
        // 舊紀錄的分支（checkExistingRoom() 讀不到隊伍）還用它，字由之後的任務改寫
        assert.ok(keys.has('treasure_map_room_sync_failed_network'), `${lang} 少了 treasure_map_room_sync_failed_network`);
    });
    // 英文帶張數的句子不受單複數影響（8 是固定的上限）
    const en = translationValues(TRANSLATIONS, 'en');
    for (const key of ['treasure_map_sync_rejected_limit', 'treasure_map_sync_rejected']) assert.doesNotMatch(en.get(key), /\bmaps? (?:are|is)\b|\(s\)/i, key);

    // 頁面與程式（含註解）裡不留舊的鍵值；每個新的鍵值都有人用，程式裡的預設文字（沒有翻譯時用）就是中文那一句
    const sources = [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((name) => name.endsWith('.js')).map((name) => `${TOOL_DIR}/${name}`)];
    const all = sources.map((file) => read(file)).join('\n');
    for (const file of sources) {
        for (const key of removed) assert.doesNotMatch(read(file), new RegExp(`\\b${key}\\b`), `${file} 還有 ${key}`);
    }
    for (const [key, texts] of Object.entries(written)) {
        assert.ok(all.includes(`'${key}'`), `沒有人用 ${key}`);
        const fallbacks = [...all.matchAll(new RegExp(`getI18nText\\(\\s*'${key}',\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))];
        assert.ok(fallbacks.length > 0, `${key} 沒有預設文字`);
        for (const [, fallback] of fallbacks) assert.equal(fallback.replace(/\\(.)/g, '$1'), texts[0], `${key} 的預設文字不是中文那一句`);
    }
    assert.ok(read(`${TOOL_DIR}/room-collaboration.js`).includes("'treasure_map_room_sync_failed_network'"), '舊紀錄的分支還在用它');
});

// ---------- 用語統一（設計 6.1、目標 11） ----------
const toolSources = () => [`${TOOL_DIR}/index.html`, ...fs.readdirSync(path.join(ROOT, TOOL_DIR)).filter((name) => name.endsWith('.js')).map((name) => `${TOOL_DIR}/${name}`)];

test('用語：寶圖搜尋器翻譯檔的 en 值沒有 Room、Team（不分大小寫），ja 值沒有ルーム、チーム，zh 值沒有房間；工具目錄的 JS 與 index.html 沒有「房間」「建立組隊」', () => {
    // {room}、{mine}、{count} 這些是參數名稱，不是玩家看得到的字：掃用語之前先拿掉 {…}
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    const offenders = [];
    for (const lang of ['zh', 'en', 'ja']) {
        const values = translationValues(TRANSLATIONS, lang);
        // 解析器真的讀到了整份翻譯：讀不到東西的話，什麼都掃不出來
        assert.ok(values.size >= 200 && values.has('treasure_map_entry_room'), `${lang} 只讀到 ${values.size} 個鍵值`);
        for (const [key, text] of values) {
            if (oldWords[lang].test(text.replace(/\{\w+\}/g, ''))) offenders.push(`${lang} ${key}: ${text}`);
        }
    }

    // 程式與頁面（含註解）：中文一律「隊伍」，「組隊」只剩主頁面入口那顆按鈕（動詞），沒有「房間」「建立組隊」
    const leftovers = [];
    for (const file of toolSources()) {
        read(file).split('\n').forEach((line, index) => {
            for (const word of ['房間', '建立組隊']) if (line.includes(word)) leftovers.push(`${file}:${index + 1} ${word}`);
        });
    }
    // 兩邊合在一起報：一次看完所有還沒改的地方
    const found = [...offenders.map((entry) => `翻譯檔 ${entry}`), ...leftovers.map((entry) => `程式與頁面 ${entry}`)];
    assert.deepEqual(found, [], `還有舊用語：\n${found.join('\n')}`);
});

test('用語統一的鍵值：入口、清單標題、清空與分享的清單用字、各種 toast 與提示三語都照設計寫；程式裡的預設文字就是中文那一句；沒人用了的三個 *_failed 三語都刪掉；英文帶張數的句子不受單複數影響', () => {
    // key → [zh, en, ja]
    const written = {
        treasure_map_entry_room: ['👥 隊伍 {count}/{max}', '👥 Party {count}/{max}', '👥 パーティ {count}/{max}'],
        treasure_map_entry_team: ['組隊', 'Party up', 'パーティを組む'],
        treasure_map_team_list: ['隊伍清單', 'Party list', 'パーティリスト'],
        treasure_map_create_room_success: ['隊伍 {code} 建立成功！', 'Party {code} created!', 'パーティ {code} を作成しました！'],
        treasure_map_join_room_success: ['已加入隊伍 {code}', 'Joined party {code}', 'パーティ {code} に参加しました'],
        treasure_map_already_in_room: ['你已經在隊伍裡了，請先離開目前的隊伍。', "You're already in a party. Leave it first.",
            'すでにパーティに参加しています。先に今のパーティを抜けてください。'],
        treasure_map_room_connecting: ['正在連上隊伍，請稍候再修改清單。', 'Connecting to the party. Please wait before editing the list.',
            'パーティに接続しています。リストの編集は接続完了までお待ちください。'],
        treasure_map_room_expired: ['隊伍已經解散，寶圖留在你的清單。', 'The party has ended. Your maps are kept in your list.', 'パーティは解散しました。地図はあなたのリストに残っています。'],
        treasure_map_legacy_room: ['這個隊伍已轉為唯讀，寶圖已保留在你的清單，請建立新的隊伍。',
            'This party is now read-only. Your maps are kept in your list; please create a new party.',
            'このパーティは読み取り専用になりました。地図はあなたのリストに残っています。新しいパーティを作成してください。'],
        treasure_map_room_sync_failed_network: ['連不上隊伍伺服器，請檢查網路連線。', "Can't reach the party server. Check your connection.",
            'パーティのサーバーに接続できません。ネットワークを確認してください。'],
        treasure_map_clear_body_room: ['隊伍清單裡的 {count} 張寶圖都會移除，隊友的清單也會跟著清空。',
            "All maps in the party list will be removed ({count}), and your party's lists will be cleared too.",
            'パーティリストの地図 {count} 枚がすべて削除され、メンバーのリストも空になります。'],
        treasure_map_share_merge_room: ['加進隊伍清單', 'Add to the party list', 'パーティリストに追加'],
        treasure_map_share_replace_room: ['取代隊伍清單', 'Replace the party list', 'パーティリストを置き換える'],
        treasure_map_share_over_limit_merge: ['隊伍清單最多 {max} 張，加進去會變成 {total} 張', 'A party list holds up to {max} maps; adding these would make {total}',
            'パーティリストは {max} 枚までです。追加すると {total} 枚になります'],
        treasure_map_share_over_limit_replace: ['隊伍清單最多 {max} 張，這個連結有 {total} 張', 'A party list holds up to {max} maps; this link has {total}',
            'パーティリストは {max} 枚までです。このリンクには {total} 枚あります']
    };
    // 這三個鍵值的使用處在改成頁內對話框時就拿掉了（只剩 *_retry 的版本），其中離開那個還寫著「房間」
    const removed = ['treasure_map_update_nickname_failed', 'treasure_map_leave_room_failed', 'treasure_map_remove_member_failed'];
    const oldWords = { zh: /房間/, en: /\b(?:room|team)\b/i, ja: /ルーム|チーム/ };
    ['zh', 'en', 'ja'].forEach((lang, index) => {
        const values = translationValues(TRANSLATIONS, lang);
        for (const [key, texts] of Object.entries(written)) {
            assert.equal(values.get(key), texts[index], `${lang} ${key}`);
            assert.doesNotMatch(texts[index].replace(/\{\w+\}/g, ''), oldWords[lang], `${lang} ${key} 還有舊用語`);
        }
        const keys = translationKeySet(TRANSLATIONS, lang);
        for (const key of removed) assert.equal(keys.has(key), false, `${lang} 還有 ${key}`);
        // *_retry 的版本還在用
        for (const key of ['treasure_map_update_nickname_failed_retry', 'treasure_map_leave_room_failed_retry', 'treasure_map_remove_member_failed_retry']) assert.ok(keys.has(key), `${lang} 少了 ${key}`);
    });
    // 英文帶張數的句子不用 map(s)、is/are 這種會隨單複數變的寫法：數字放在括號裡或最後，1 張時也讀得通
    const en = translationValues(TRANSLATIONS, 'en');
    for (const key of ['treasure_map_clear_body_room', 'treasure_map_share_over_limit_merge', 'treasure_map_share_over_limit_replace']) {
        assert.doesNotMatch(en.get(key), /\bmaps? (?:are|is)\b|\(s\)/i, key);
    }

    // 頁面與程式（含註解）裡不留舊的鍵值（以整個詞比對：*_retry 的版本不算）；每個鍵值都有人用，程式裡的預設文字（沒有翻譯時用）就是中文那一句
    const all = toolSources().map((file) => read(file)).join('\n');
    for (const key of removed) assert.doesNotMatch(all, new RegExp(`\\b${key}\\b`), `程式或頁面還有 ${key}`);
    const fallbacksOf = (key) => [
        // getI18nText('key', '預設文字', …)、setText(元素, 'key', '預設文字')
        ...all.matchAll(new RegExp(`'${key}',\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g')),
        // ENTRY_LABELS 這種 key: '預設文字'
        ...all.matchAll(new RegExp(`^\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'gm')),
        // 頁面上掛 data-i18n 的元素，裡面寫的預設文字
        ...all.matchAll(new RegExp(`data-i18n="${key}"[^>]*>([^<]*)<`, 'g'))
    ].map((m) => m[1].replace(/\\(.)/g, '$1'));
    for (const [key, texts] of Object.entries(written)) {
        assert.ok(all.includes(`'${key}'`) || all.includes(`"${key}"`) || all.includes(`${key}:`), `沒有人用 ${key}`);
        const fallbacks = fallbacksOf(key);
        assert.ok(fallbacks.length > 0, `${key} 沒有預設文字`);
        for (const fallback of fallbacks) assert.equal(fallback, texts[0], `${key} 的預設文字不是中文那一句`);
    }
});

test('邀請連結對話框的「不用了」三語是 不用了／No thanks／参加しない：不借分享對話框的 treasure_map_share_dismiss（它的日文「追加しない」是「不加入寶圖」，用在加入隊伍上意思不對）；只剩錯誤時是「關閉」', async () => {
    const page = await openLinkPage(linkServer().respond);
    assert.ok(linkOpen(page));
    assert.equal(text(page, 'dismissLinkBtn'), '不用了');
    page.setLang('en');
    assert.equal(text(page, 'dismissLinkBtn'), 'No thanks');
    page.setLang('ja');
    assert.equal(text(page, 'dismissLinkBtn'), '参加しない');
    page.setLang('zh');
    assert.equal(text(page, 'dismissLinkBtn'), '不用了');

    // 只剩錯誤（讀隊伍就失敗）的樣子沒有「加入」，按鈕寫「關閉」（三語都是）
    const missing = linkServer({ reads: [() => { throw roomError(404, 'ROOM_NOT_FOUND'); }] });
    const failed = await openLinkPage(missing.respond);
    assert.equal(text(failed, 'dismissLinkBtn'), '關閉');
    failed.setLang('en');
    assert.equal(text(failed, 'dismissLinkBtn'), 'Close');
    failed.setLang('ja');
    assert.equal(text(failed, 'dismissLinkBtn'), '閉じる');

    // 分享寶圖的對話框（treasure_map_share_dismiss）不變：日文還是「追加しない」，連結對話框的程式不再用它
    assert.equal(translationValues(TRANSLATIONS, 'ja').get('treasure_map_share_dismiss'), '追加しない');
    assert.doesNotMatch(read(`${TOOL_DIR}/room-dialogs.js`), /treasure_map_share_dismiss/);
});
