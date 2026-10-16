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
    assert.match(css, /\.modal\.hidden\s*\{\s*display:\s*none/, '舊的 .modal 還在用，它的 .hidden 規則留著');
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
    // 建立隊伍對話框的按鈕列也一樣放不下就換行（日文「キャンセル」＋「パーティを作る」在 320px 會把取消鈕擠出左邊）；只動這個對話框，其他對話框照舊
    assert.match(bodyOf('#createPartyModal .dialog-actions'), /flex-wrap:\s*wrap/);
    assert.ok(css.indexOf('#createPartyModal .dialog-actions {') < css.lastIndexOf('\n.hidden {'));
    assert.equal(bodyOf('.tm-dialog .dialog-actions'), '', '別的對話框的按鈕列不動');
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

test('加入隊伍成功：焦點移到「複製邀請連結」；失敗：焦點回到「加入隊伍」', async () => {
    for (const [respond, expected] of [[joinable, 'copyInviteBtn'], [() => { throw roomError(404, 'ROOM_NOT_FOUND'); }, 'joinRoomBtn']]) {
        const page = await createParty(respond);
        page.finder.openListPanel();
        page.$('joinRoomBtn').focus();
        page.$('joinRoomBtn').click();
        assertFocusOn(page, 'roomCodeInput', '打開加入隊伍對話框');
        page.$('roomCodeInput').value = 'abc123';
        await page.client.confirmJoinRoom();
        const joined = expected === 'copyInviteBtn';
        assert.equal(page.client.currentRoom?.roomCode ?? null, joined ? 'ABC123' : null);
        assertFocusOn(page, expected, joined ? '加入成功' : '加入失敗');
        assert.deepEqual(messages(page), joined ? ['成功加入隊伍 ABC123'] : ['找不到隊伍 ABC123。可能打錯了，或隊伍已經解散（24 小時沒有動靜就會解散）。']);
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
        const choice = keepList ? 'leaveKeepListBtn' : 'leaveClearListBtn';
        page.$(choice).focus();
        await page.client.leaveRoom(keepList);
        assert.equal(page.client.currentRoom, null);
        assert.equal(page.$('leaveRoomModal').classList.contains('hidden'), true);
        assert.equal(page.$('roomSection').classList.contains('hidden'), true, '離開了：隊伍狀態藏起來');
        assertFocusOn(page, 'createRoomBtn', choice);
    }
});

test('用網址 ?room= 在載入時自動加入：不移動焦點（面板關著；加入途中才打開面板也一樣）', async () => {
    const url = 'https://ff14.tw/tools/treasure-map-finder/?room=ABC123';
    // 伺服器的回應先卡在 gate 上：測試放好焦點（或打開面板）之後再放行，加入才在那之後結束
    const gated = () => {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        return { release, respond: async (path, options) => { await gate; return joinable(path, options); } };
    };

    const closed = gated();
    const closedPage = await createPanelPage({ url, party: { respond: closed.respond }, realisticFocus: true });
    const outside = closedPage.$('listEntryDesktop').querySelector('[data-entry="list"]');
    outside.focus();
    closed.release();
    await closedPage.client.ready;
    assert.equal(closedPage.client.currentRoom.roomCode, 'ABC123');
    assert.ok(closedPage.focused() === outside, '面板關著：焦點還在面板外的按鈕上');

    const opened = gated();
    const openedPage = await createPanelPage({ url, party: { respond: opened.respond }, realisticFocus: true });
    await openedPage.settle();
    openedPage.finder.openListPanel();
    assertFocusOn(openedPage, 'closePanelBtn', '加入途中打開面板');
    opened.release();
    await openedPage.client.ready;
    assert.equal(openedPage.client.currentRoom.roomCode, 'ABC123');
    assertFocusOn(openedPage, 'closePanelBtn', '加入途中打開面板，加入完成後');
});

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
// 選「帶進」或「不帶」：fake-dom 的 radio 不會互斥，兩顆都照瀏覽器設好，再在選到的那顆上送 change
const chooseMode = (page, mode) => {
    page.$('createModeBring').checked = mode === 'bring';
    page.$('createModeClear').checked = mode === 'clear';
    page.$(mode === 'bring' ? 'createModeBring' : 'createModeClear').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }));
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
const createdParty = async (options = {}) => {
    const page = await createParty(creates, { stored: { ff14tw_nickname_tag: 'K7Q' }, ...options });
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

test('按鈕接線：離開 → 離開對話框，改名 → 改名對話框，移出 → removeMember(那位成員)，邀請連結與代號各自複製；成員一行展開、收合', async () => {
    const page = await crowdedParty();
    const calls = [];
    const { client } = page;
    client.showLeaveRoomDialog = () => calls.push('leave');
    client.showEditNicknameDialog = () => calls.push('rename');
    client.removeMember = (target) => calls.push(`remove ${target.id} ${target.nickname}`);
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
