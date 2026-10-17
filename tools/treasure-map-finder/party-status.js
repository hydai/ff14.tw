// 隊伍狀態（清單面板上方的 #roomSection，在隊伍裡時顯示）：隊伍代號與同步狀態、複製邀請連結／複製代號／離開隊伍，
// 以及成員一行（按鈕）與展開後每人一列的成員列表。標記在 index.html，由 RoomCollaboration 建立、接事件、在隊伍變動時呼叫 render()。
// 代號、同步狀態、成員一行與每一列都帶隊伍資料，也要跟著語言換字，由這裡依狀態組出來、不掛 data-i18n：
// I18nManager 切換語言時會把 [data-i18n] 的文字整個換掉。
// 隊伍每兩秒輪詢一次，每次都會重畫：沒變的字不重寫、沒變的成員列表不重建，焦點與螢幕閱讀器的閱讀位置才不會被打斷
class PartyStatus {
    // 字不一樣才寫：textContent 一寫就會換掉整個文字節點，螢幕閱讀器的閱讀位置可能跟著跑掉（#partySync 是 role="status"，寫了就會唸）
    static setText(element, text) {
        if (element.textContent !== text) element.textContent = text;
    }

    // 成員的順序：隊長（creatorId）、自己、其餘依加入時間。隊長已經離開（creatorId 不在成員裡）時沒有人排在隊長那一格；
    // 沒有 joinedAt 的成員保持原本的順序
    static orderMembers(room, meId) {
        const rank = member => (member.id === room.creatorId ? 0 : member.id === meId ? 1 : 2);
        return [...room.members].sort((a, b) => rank(a) - rank(b) || (Date.parse(a.joinedAt) - Date.parse(b.joinedAt)) || 0);
    }

    // collaboration 是 RoomCollaboration：隊伍資料（currentRoom、currentUser、mapSync）與按鈕的動作都在它那裡。
    // 只抓元素，不掛事件（init() 才掛）
    constructor(collaboration) {
        this.collaboration = collaboration;
        // 成員列表展開了沒：只記在這個頁面，不存
        this.expanded = false;
        // 上一次畫在 #membersList 裡的內容（描述成員、張數、自己、隊長、語言的 key；收合時是空字串），null 是還沒畫過
        this.listKey = null;
        const byId = id => document.getElementById(id);
        this.elements = {
            section: byId('roomSection'),
            code: byId('roomCode'),
            sync: byId('partySync'),
            syncText: byId('partySyncText'),
            syncNote: byId('partySyncNote'),
            copyInvite: byId('copyInviteBtn'),
            copyCode: byId('copyRoomCodeBtn'),
            leave: byId('leaveRoomBtn'),
            toggle: byId('membersToggle'),
            count: byId('membersCount'),
            names: byId('membersNames'),
            chevron: byId('membersChevron'),
            panel: byId('membersPanel'),
            list: byId('membersList')
        };
    }

    // 由 RoomCollaboration#setupEventListeners() 呼叫：接上三顆按鈕、成員一行，以及成員列表裡的「改名」與「移出」
    init() {
        const { elements, collaboration } = this;
        elements.copyInvite.addEventListener('click', () => collaboration.copyInviteLink());
        elements.copyCode.addEventListener('click', () => collaboration.copyRoomCode());
        elements.leave.addEventListener('click', () => collaboration.showLeaveRoomDialog());
        elements.toggle.addEventListener('click', () => this.toggleMembers());
        // 成員列表重建時整批按鈕都會換掉：事件掛在列表上，由按鈕的 data-action 與 data-member-id 分辨
        elements.list.addEventListener('click', event => this.handleListClick(event));
    }

    handleListClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const { collaboration } = this;
        if (button.dataset.action === 'rename') {
            collaboration.showEditNicknameDialog();
        } else if (button.dataset.action === 'remove') {
            // 移出要先問一次：開頁內的確認對話框（RoomDialogs），玩家按了確認才真的移出
            const target = collaboration.currentRoom?.members.find(member => member.id === button.dataset.memberId);
            if (target) collaboration.dialogs.openRemove(target);
        }
    }

    // 展開、收合成員列表
    toggleMembers() {
        this.expanded = !this.expanded;
        this.render();
    }

    // 依 collaboration.currentRoom 與 currentUser 重畫：不在隊伍裡就把整個區塊藏起來（只動這一個元素），在隊伍裡就顯示並更新每一處。
    // 隊伍變動（輪詢、本機改了清單）、切換語言、展開收合都會來
    render() {
        const { collaboration, elements } = this;
        const room = collaboration.currentRoom;
        if (!room) {
            elements.section.classList.add('hidden');
            return;
        }
        elements.section.classList.remove('hidden');
        PartyStatus.setText(elements.code, room.roomCode);
        this.setSync('ok');
        this.renderMembers(room);
    }

    // 同步狀態（#partySync，role="status"）：這一版只有 'ok'（已同步）。文字只在真的變了才寫
    setSync(state) {
        if (state !== 'ok') return;
        PartyStatus.setText(this.elements.syncText, FF14Utils.getI18nText('treasure_map_sync_ok', '已同步'));
        this.elements.syncNote.classList.add('hidden');
    }

    // 成員一行（「成員 3/8」與收合時的名字）與展開後的列表。每個人的張數算隊伍的寶圖（mapSync.getMaps()，
    // 含還沒送出的變更，和清單面板看到的一致）裡 addedBy 是他的
    renderMembers(room) {
        const { collaboration, elements, expanded } = this;
        const meId = collaboration.currentUser?.id;
        const members = PartyStatus.orderMembers(room, meId);
        const counts = new Map();
        for (const map of collaboration.mapSync.getMaps()) counts.set(map.addedBy, (counts.get(map.addedBy) ?? 0) + 1);

        PartyStatus.setText(elements.count, FF14Utils.getI18nText('treasure_map_members_count', '成員 {count}/{max}',
            { count: members.length, max: RoomCollaboration.CONSTANTS.MAX_MEMBERS }));
        // 收合時名字寫在成員一行裡（自己加「（你）」），展開時列表已經每人一列，這一行是空的
        PartyStatus.setText(elements.names, expanded ? '' : members.map(member => (member.id === meId
            ? FF14Utils.getI18nText('treasure_map_member_you_suffix', '{name}（你）', { name: member.nickname })
            : member.nickname)).join(FF14Utils.getI18nText('treasure_map_list_separator', '、')));
        PartyStatus.setText(elements.chevron, expanded ? '▾' : '▸');
        if (elements.toggle.getAttribute('aria-expanded') !== String(expanded)) elements.toggle.setAttribute('aria-expanded', String(expanded));
        elements.panel.classList.toggle('hidden', !expanded);

        // 列表只在展開時畫；內容（誰、張數、自己、隊長、語言）和上一次一樣就不動
        const key = expanded
            ? JSON.stringify([window.i18n.getCurrentLanguage(), meId, room.creatorId, members.map(member => [member.id, member.nickname, counts.get(member.id) ?? 0])])
            : '';
        if (key !== this.listKey) this.renderList(members, counts, room.creatorId, meId, key);
    }

    // 重建成員列表。重建之前有兩個地方記著列表裡的某一顆按鈕（哪一個人的哪一個動作：data-member-id、data-action），
    // 重建後都要接到新的那一顆，那個人不在了（被移出）就接到成員一行，不讓焦點掉到 body：
    // - 焦點：焦點在列表裡的按鈕上時，重建後放回同一顆；焦點在別處就不動
    // - 從列表裡的按鈕打開的對話框（改名）：ModalManager 記著那顆按鈕（previousFocus），關閉時把焦點還給它，已經不在文件裡就不還。
    //   改名成功時先收到新名字（列表重建）再關對話框，對話框開著時輪詢也可能帶來隊友的變動，原本那顆都已經不在，
    //   所以重建時把它要還的那顆換成新的
    renderList(members, counts, creatorId, meId, key) {
        const { list, toggle } = this.elements;
        const buttonId = element => (list.contains(element) && element.dataset.action ? { memberId: element.dataset.memberId, action: element.dataset.action } : null);
        const dialog = ModalManager.topmost();
        const focused = buttonId(document.activeElement);
        const opener = dialog ? buttonId(dialog.previousFocus) : null;
        this.listKey = key;
        SecurityUtils.clearElement(list);
        if (key !== '') {
            for (const member of members) list.appendChild(this.createRow(member, counts.get(member.id) ?? 0, creatorId, meId));
        }
        const buttonFor = ({ memberId, action }) => [...list.querySelectorAll('button')]
            .find(button => button.dataset.memberId === memberId && button.dataset.action === action) ?? toggle;
        if (opener) dialog.previousFocus = buttonFor(opener);
        if (focused) buttonFor(focused).focus();
    }

    // 一位成員一列：名字、隊長與「你」的標籤、張數，右邊一顆按鈕——自己那列「改名」，自己是隊長時別人那列「移出」
    createRow(member, count, creatorId, meId) {
        const isMe = member.id === meId;
        const row = document.createElement('li');
        row.className = isMe ? 'tm-member is-me' : 'tm-member';
        row.dataset.memberId = member.id;
        row.appendChild(PartyStatus.createSpan('tm-member-name', member.nickname));
        if (member.id === creatorId) row.appendChild(PartyStatus.createSpan('tag tag-primary', FF14Utils.getI18nText('treasure_map_room_leader', '隊長')));
        if (isMe) row.appendChild(PartyStatus.createSpan('tag', FF14Utils.getI18nText('treasure_map_member_you', '你')));
        row.appendChild(PartyStatus.createSpan('tm-member-meta', FF14Utils.getI18nText('treasure_map_member_maps', '{count} 張', { count })));
        if (isMe) {
            row.appendChild(PartyStatus.createButton('rename', member, FF14Utils.getI18nText('treasure_map_rename', '改名')));
        } else if (meId === creatorId) {
            const remove = PartyStatus.createButton('remove', member, FF14Utils.getI18nText('treasure_map_remove_member', '移出'));
            remove.setAttribute('aria-label', FF14Utils.getI18nText('treasure_map_remove_member_label', '把 {nickname} 移出隊伍', { nickname: member.nickname }));
            row.appendChild(remove);
        }
        return row;
    }

    static createSpan(className, text) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    static createButton(action, member, text) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost btn-sm';
        button.dataset.action = action;
        button.dataset.memberId = member.id;
        button.textContent = text;
        return button;
    }
}

window.PartyStatus = PartyStatus;
