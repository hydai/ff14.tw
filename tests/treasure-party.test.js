const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { classesOf, tagAttrs, sliceElementById } = require('./helpers/html-fragment.js');
const { createPanelPage } = require('./helpers/panel-page.js');
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

test('隊伍狀態的樣式：新規則寫在最後的 .hidden 前面，會被 .hidden 切換的元素 display 只設在單一 class 上；舊的 .room-*、.member-* 規則拿掉', () => {
    const css = stripComments(read(`${TOOL_DIR}/style.css`));
    // 攤平成 [{ selectors, body }]（含 @media 裡的規則）
    const rules = [];
    const scan = (text) => {
        for (const m of text.matchAll(/([^{}]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
            const head = m[1].trim();
            if (head.startsWith('@media')) scan(m[2]);
            else rules.push({ selectors: head.split(',').map((s) => s.trim()), body: m[2] });
        }
    };
    scan(css);
    const bodyOf = (selector) => rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join(';');

    for (const selector of ['.tm-team', '.tm-team-row', '.tm-team-code', '.tm-sync', '.tm-sync-dot', '.tm-team-actions', '.tm-team-actions .tm-leave', '.tm-members-toggle',
        '.tm-members-names', '.tm-chevron', '.tm-members', '.tm-member-list', '.tm-member', '.tm-member-name', '.tm-member-meta', '.tm-team-note']) {
        assert.notEqual(bodyOf(selector), '', `${selector} 沒有規則`);
        assert.ok(css.indexOf(`${selector} {`) < css.lastIndexOf('\n.hidden {'), `${selector} 要寫在最後的 .hidden 前面`);
    }
    assert.match(bodyOf('.tm-team'), /display:\s*grid/);
    assert.match(bodyOf('.tm-members'), /display:\s*grid/);
    // 成員一行的名字不換行（省略號）：欄寬不鎖在容器的寬度，欄會被撐到整行名字的寬度，清單面板就出現橫向捲軸、右邊的按鈕被切掉（瀏覽器實測）
    assert.match(bodyOf('.tm-team'), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // .tm-team（#roomSection）、.tm-members（#membersPanel）、.tm-sync-note（#partySyncNote）都用 .hidden 切換：
    // 有 display 的規則，選擇器只能是這個 class 本身，不然特異度比 .hidden 高，.hidden 就藏不起來
    for (const name of ['tm-team', 'tm-members', 'tm-sync-note']) {
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
test('建立組隊成功：焦點移到隊伍狀態的「複製邀請連結」（連線中「建立組隊」停用、焦點退回 body）', async () => {
    const page = await createParty(createAndLeave);
    page.finder.handleListEntry('team');
    assertFocusOn(page, 'createRoomBtn', '按「組隊」打開面板');
    const creating = page.client.handleCreateClick();
    assert.ok(page.focused() === page.dom.document.body, '連線中「建立組隊」停用，焦點當場退回 body');
    await creating;
    assert.equal(page.client.currentRoom.roomCode, 'ABC123');
    assert.equal(page.$('teamActions').classList.contains('hidden'), true);
    assertFocusOn(page, 'copyInviteBtn', '建立成功');
    assert.deepEqual(messages(page), ['隊伍 ABC123 建立成功！']);
});

test('建立組隊失敗：焦點回到「建立組隊」', async () => {
    const page = await createParty(() => { throw roomError(503, 'UNAVAILABLE'); });
    page.finder.handleListEntry('team');
    await page.client.handleCreateClick();
    assert.equal(page.client.currentRoom, null);
    assertFocusOn(page, 'createRoomBtn', '建立失敗');
    assert.deepEqual(messages(page), ['連不上隊伍伺服器，請稍後再試。'], '失敗的訊息是 createRoom() 回傳的');
    assert.equal(page.toasts[0].type, 'error');
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
    assert.ok(failed.focused() === failed.dom.document.body, '失敗了，焦點也沒有被放回「建立組隊」');
    assert.deepEqual(failed.toasts, []);

    const missing = await createParty(() => { throw roomError(404, 'ROOM_NOT_FOUND'); });
    missing.finder.openListPanel();
    missing.$('joinRoomBtn').focus();
    assert.equal((await missing.client.joinRoom('ABC123')).kind, 'not_found');
    assert.ok(missing.focused() === missing.dom.document.body);
    assert.deepEqual(missing.toasts, []);
});

test('離開隊伍（保留或清空清單）：焦點回到又出現的「建立組隊」，不是已經藏起來的離開鈕', async () => {
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
