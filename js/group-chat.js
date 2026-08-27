/**
 * 多人聊天模块 group-chat.js
 * 功能：聊天室管理（新建/进入/删除/改名）、成员管理（添加/移除）、群聊界面状态管理
 *
 * 数据设计：
 *   - groupChats store：群组列表 [{ id, name, memberIds, createdAt }]（name 可选，存量无 name 显示「群聊」）
 *   - 群聊消息复用 messages store，contactId 用 "group_<id>" 隔离
 *   - 当前群聊 ID 持久化在 appState（key: currentGroupId），刷新后自动恢复
 *   - 删除聊天室时同时删除其全部消息（deleteByIndex('messages','contactId','group_xxx')）
 */

/* 内部状态 */
let currentGroupChatId = null;   // 当前群聊 ID（null = 未在群聊中）

/* 基础工具 */

/** 是否处于群聊模式 */
function isGroupChatMode() {
    return currentGroupChatId !== null;
}

/** 获取当前群聊 ID（'group_xxx' 形式的字符串，未在群聊返回 null） */
function getCurrentGroupStorageId() {
    return currentGroupChatId !== null ? 'group_' + currentGroupChatId : null;
}

/** 获取当前群聊对象（未在群聊返回 null） */
async function getCurrentGroupChat() {
    if (currentGroupChatId === null) return null;
    return await getGroupChatById(currentGroupChatId);
}

/** 获取当前群聊的成员联系人数组（过滤已删除的联系人） */
async function getCurrentGroupMembers() {
    const group = await getCurrentGroupChat();
    if (!group || !group.memberIds) return [];
    const members = [];
    for (const id of group.memberIds) {
        const contact = await getContactById(id);
        if (contact) members.push(contact);
    }
    return members;
}

/** 获取群聊显示名称（存量无 name 显示「群聊」） */
function getGroupName(group) {
    if (!group) return '群聊';
    return group.name && group.name.trim() ? group.name.trim() : '群聊';
}

/* 群聊消息辅助 */

/** 根据发送者 id 获取头像（senderId 为 'me' 或联系人 id） */
async function getGroupMessageAvatar(senderId) {
    if (senderId === 'me' || senderId === undefined || senderId === null) {
        return await getUserAvatar();
    }
    const contact = await getContactById(senderId);
    return contact ? contact.avatar : null;
}

/** 根据发送者 id 获取名字 */
async function getGroupSenderName(senderId) {
    if (senderId === 'me') return '我';
    const contact = await getContactById(senderId);
    return contact ? contact.name : '未知成员';
}

/** HTML 转义（名字防注入） */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* 群聊初始化 */

/** 启动时恢复群聊状态（在 start.js 中调用） */
async function restoreGroupChatOnStartup() {
    const savedId = await getCurrentGroupId();
    if (!savedId) return;

    const group = await getGroupChatById(savedId);
    if (!group) {
        // 群聊已不存在，清理状态
        await saveCurrentGroupId('');
        return;
    }

    // 保留全部成员 id（即使部分联系人已被删除也不清空，避免成员信息丢失）；
    // 界面展示时 getCurrentGroupMembers 会跳过已删除的联系人
    await enterGroupChat(group.id, false);
}

/* 新建聊天室弹窗 */

/** 打开新建聊天室弹窗 */
async function openGroupChatModal() {
    const modal = document.getElementById('groupChatModal');
    if (!modal) return;

    const list = document.getElementById('groupChatContactList');
    const empty = document.getElementById('groupChatEmpty');
    const countEl = document.getElementById('groupChatCount');
    const startBtn = document.getElementById('groupChatStartBtn');
    const nameInput = document.getElementById('groupChatNameInput');

    // 重置名称输入
    if (nameInput) nameInput.value = '';

    // 渲染联系人列表
    const contacts = await getAllContacts();
    if (contacts.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        countEl.textContent = '已选 0 人';
        startBtn.disabled = true;
        modal.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    const selectedIds = new Set();
    list.innerHTML = '';

    contacts.forEach(function (contact) {
        const item = document.createElement('div');
        item.className = 'group-chat-contact-item';
        item.dataset.id = contact.id;

        const avatarHTML = contact.avatar
            ? `<img src="${contact.avatar}">`
            : defaultAvatarSVG;

        item.innerHTML = `
            <div class="contact-avatar">${avatarHTML}</div>
            <span class="contact-name">${escapeHtml(contact.name)}</span>
            <div class="group-chat-check">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"
                    stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        `;

        item.addEventListener('click', function () {
            const id = parseInt(this.dataset.id);
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
                this.classList.remove('selected');
            } else {
                selectedIds.add(id);
                this.classList.add('selected');
            }
            countEl.textContent = `已选 ${selectedIds.size} 人`;
            startBtn.disabled = selectedIds.size === 0;
        });

        list.appendChild(item);
    });

    countEl.textContent = '已选 0 人';
    startBtn.disabled = true;
    modal.classList.remove('hidden');
}

/** 关闭新建聊天室弹窗 */
function closeGroupChatModal() {
    const modal = document.getElementById('groupChatModal');
    if (modal) modal.classList.add('hidden');
}

/* 创建群聊 */

/** 创建群聊（memberIds 为联系人 id 数组），创建后返回聊天室管理弹窗 */
async function startGroupChat(memberIds) {
    if (!memberIds || memberIds.length === 0) {
        showToast('请至少选择一位联系人');
        return;
    }

    // 过滤无效成员
    const validMembers = memberIds.filter(function (id) { return contactExists(id); });
    if (validMembers.length === 0) {
        showToast('所选联系人已不存在');
        return;
    }

    // 读取名称输入（可选）
    const nameInput = document.getElementById('groupChatNameInput');
    const groupName = nameInput ? nameInput.value.trim() : '';

    // 创建群聊记录
    const groupId = Date.now();
    const group = {
        id: groupId,
        name: groupName,
        memberIds: validMembers,
        createdAt: Date.now()
    };
    await saveGroupChat(group);

    // 仅创建：关闭新建弹窗，返回聊天室管理弹窗（列表会重新渲染，新建的排最下方）
    closeGroupChatModal();
    await openGroupManageModal();
}

/**
 * 进入群聊：切换 UI 为群聊模式并加载群聊消息
 * @param {number} groupId - 群聊 ID
 * @param {boolean} isNew - 是否刚创建（不重置当前联系人，保留退出后返回的对象）
 */
async function enterGroupChat(groupId, isNew) {
    const group = await getGroupChatById(groupId);
    if (!group) return;

    // 保存状态
    currentGroupChatId = groupId;
    await saveCurrentGroupId(groupId);

    // 清空输入框引用，避免跨聊天残留
    if (typeof clearQuote === 'function') clearQuote();

    // 重置群聊回复状态
    if (typeof resetGroupReplyState === 'function') resetGroupReplyState();
    // 重置单聊回复锁（单聊→群聊切换后，锁状态不残留）
    if (typeof resetSingleReplyState === 'function') resetSingleReplyState();

    // 更新顶部栏：聊天室名称 + 成员卡片列表 + 管理/退出按钮
    await updateGroupHeaderUI(group);

    // 加载群聊消息（复用消息分页逻辑，contactId 用 group_xxx）
    await loadMessagesForContact('group_' + groupId);

    // 应用该聊天室的装扮（背景图 / 时间戳颜色 / 多人聊天名称颜色）
    if (typeof window.applyCurrentChatBackground === 'function') {
        window.applyCurrentChatBackground();
    }

    // 刷新“正在输入”指示器：单聊未回完的回复提示在群聊界面保留显示
    if (typeof syncTypingIndicator === 'function') syncTypingIndicator();
}

/* 顶部栏渲染 */

/** 更新顶部标题栏为群聊模式 */
async function updateGroupHeaderUI(group) {
    const headerEl = document.getElementById('groupChatHeader');
    const infoEl = document.getElementById('partnerInfo');
    const nameEl = document.getElementById('groupChatName');
    const countEl = document.getElementById('groupChatMemberCount');
    const avatarsEl = document.getElementById('groupCapsuleAvatars');
    const actionsEl = document.querySelectorAll('.group-header-actions');
    const userInfoEl = document.querySelector('.user-info');

    const members = [];
    for (const id of group.memberIds) {
        const c = await getContactById(id);
        if (c) members.push(c);
    }

    // 群聊名称 + 人数（用户自己也算一名成员，徽章显示 "N 人"）
    if (nameEl) nameEl.textContent = getGroupName(group);
    if (countEl) countEl.textContent = `${members.length + 1} 人`;

    // 成员头像：用户自己永远第一个，全部成员单行不换行
    if (avatarsEl) {
        const myAvatar = await getUserAvatar();
        const me = { name: '我', avatar: myAvatar };
        avatarsEl.innerHTML = renderCapsuleAvatarsHTML([me].concat(members));
        // 动态让位：胶囊高度随成员数变化，消息区顶部跟随胶囊实际高度
        requestAnimationFrame(function () {
            const capsuleEl = document.querySelector('.group-chat-capsule');
            const containerEl = document.querySelector('.chat-container');
            if (capsuleEl && containerEl) {
                containerEl.style.setProperty('--group-capsule-h', capsuleEl.getBoundingClientRect().height + 'px');
            }
        });
    }

    // 显示群聊头部 + 左右操作按钮，隐藏单人区域 + 右侧用户信息
    if (headerEl) headerEl.classList.remove('hidden');
    if (infoEl) infoEl.classList.add('hidden');
    actionsEl.forEach(el => el.classList.remove('hidden'));
    if (userInfoEl) userInfoEl.classList.add('hidden');

    // 群聊悬浮模式：标题栏塌缩、胶囊悬浮在消息区上方
    const containerEl = document.querySelector('.chat-container');
    if (containerEl) containerEl.classList.add('group-mode');

    closePartnerDropdown();
}

/** 渲染胶囊头部成员头像 HTML（全部成员，单行不换行） */
function renderCapsuleAvatarsHTML(members) {
    if (!members || members.length === 0) {
        return '';
    }
    return members.map(function (member) {
        // 无头像时直接插入默认人头 SVG（和联系人管理窗口一致，灰色人头）
        const hasAvatar = !!member.avatar;
        const avatarHTML = hasAvatar
            ? '<img src="' + member.avatar + '" alt="">'
            : defaultAvatarSVG;
        return '<span class="group-capsule-ava' + (hasAvatar ? '' : ' no-avatar') + '" title="' + escapeHtml(member.name) + '">' + avatarHTML + '</span>';
    }).join('');
}

/* 退出群聊 */

/** 退出群聊界面：恢复单人聊天模式（不弹 toast，供退出/删除当前聊天室复用） */
async function leaveGroupChatUI() {
    // 恢复单人聊天模式
    currentGroupChatId = null;
    await saveCurrentGroupId('');

    // 清空引用，避免跨聊天残留
    if (typeof clearQuote === 'function') clearQuote();

    // 重置群聊回复状态
    if (typeof resetGroupReplyState === 'function') resetGroupReplyState();
    // 重置单聊回复锁（群聊→单聊切换后，锁状态不残留）
    if (typeof resetSingleReplyState === 'function') resetSingleReplyState();

    // 恢复顶部栏：隐藏群聊头部、显示单人区域
    const headerEl = document.getElementById('groupChatHeader');
    const infoEl = document.getElementById('partnerInfo');
    const actionsEl = document.querySelectorAll('.group-header-actions');
    const userInfoEl = document.querySelector('.user-info');
    if (headerEl) headerEl.classList.add('hidden');
    if (infoEl) infoEl.classList.remove('hidden');
    actionsEl.forEach(el => el.classList.add('hidden'));
    if (userInfoEl) userInfoEl.classList.remove('hidden');

    // 退出群聊悬浮模式：恢复标题栏、取消消息区顶部让位
    const containerEl = document.querySelector('.chat-container');
    if (containerEl) containerEl.classList.remove('group-mode');

    // 恢复当前联系人界面
    const contactId = await getCurrentContactId();
    if (contactId) {
        const contact = await getContactById(contactId);
        if (contact) {
            const nameEl = document.getElementById('contactName');
            if (nameEl) nameEl.textContent = contact.name;
            const avatarEl = document.getElementById('partnerAvatar');
            if (avatarEl) {
                avatarEl.innerHTML = contact.avatar
                    ? `<img src="${contact.avatar}">`
                    : defaultAvatarSVG;
            }
        }
        await loadMessagesForContact(contactId);
    } else {
        // 没有当前联系人：清空消息区
        const nameEl = document.getElementById('contactName');
        if (nameEl) nameEl.textContent = '联系人';
        if (typeof resetToEmptyChat === 'function') resetToEmptyChat();
    }

    // 应用联系人的装扮（背景图 / 时间戳颜色）
    if (typeof window.applyCurrentChatBackground === 'function') {
        window.applyCurrentChatBackground();
    }

    // 刷新“正在输入”指示器：群聊未回完的回复提示在单聊界面保留显示
    if (typeof syncTypingIndicator === 'function') syncTypingIndicator();
}

/** 退出群聊：恢复单人聊天界面，回到退出前的联系人 */
async function exitGroupChat() {
    await leaveGroupChatUI();
    showToast('已退出群聊');
}

/* 聊天室管理弹窗 */

let _groupManageEscHandler = null;

/** 打开聊天室管理弹窗 */
async function openGroupManageModal() {
    const modal = document.getElementById('groupManageModal');
    if (!modal) return;

    await renderGroupChatRoomList();
    modal.classList.remove('hidden');

    // 注册 Escape 关闭（与联系人管理弹窗一致）
    if (!_groupManageEscHandler) {
        _groupManageEscHandler = function (e) {
            if (e.key === 'Escape') closeGroupManageModal();
        };
        document.addEventListener('keydown', _groupManageEscHandler);
    }
}

/** 关闭聊天室管理弹窗 */
function closeGroupManageModal() {
    const modal = document.getElementById('groupManageModal');
    if (!modal) return;
    modal.classList.add('hidden');

    if (_groupManageEscHandler) {
        document.removeEventListener('keydown', _groupManageEscHandler);
        _groupManageEscHandler = null;
    }
}

/** 渲染聊天室列表 */
/* 聊天室管理弹窗：列表缓存 + 拖拽排序状态 */
let _groupListCache = [];   // 渲染时排序后的内存数组，拖拽只改它，结束时统一保存
let grp_isDragging = false;

async function renderGroupChatRoomList() {
    const groups = await getGroupChats();
    // 排序：已拖拽过的按 order 升序；未设置 order 的（含新建的）排最后，内部按创建时间升序（新建在最下方）
    groups.sort(function (a, b) {
        const oa = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const ob = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });
    _groupListCache = groups;
    renderGroupChatRoomListFromArray(groups, null);
}

/** 从数组渲染列表（拖拽中传入正在拖拽的 id 以恢复高亮） */
function renderGroupChatRoomListFromArray(groups, dragId) {
    const listEl = document.getElementById('groupChatRoomList');
    const emptyEl = document.getElementById('groupChatRoomEmpty');
    if (!listEl) return;

    if (groups.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = groups.map(function (group, index) {
        const isCurrent = currentGroupChatId !== null && group.id === currentGroupChatId;
        const memberCount = Array.isArray(group.memberIds) ? group.memberIds.length : 0;
        const isDragging = dragId !== null && String(group.id) === String(dragId);
        // 当前聊天室：进入按钮置灰显示「当前」，避免重复进入
        const enterBtn = isCurrent
            ? '<button class="room-action-btn enter" data-action="enter" disabled>当前</button>'
            : '<button class="room-action-btn enter" data-action="enter">进入</button>';
        return `
            <div class="group-chat-room-item ${isCurrent ? 'current' : ''} ${isDragging ? 'dragging' : ''}" data-id="${group.id}" data-index="${index}">
                <div class="room-item-left">
                    <span class="drag-handle" draggable="true" title="拖动排序">⠿</span>
                    ${isCurrent ? '<span class="current-badge">●</span>' : ''}
                    <div class="room-info">
                        <div class="room-name">${escapeHtml(getGroupName(group))}</div>
                        <div class="room-meta">${memberCount} 位成员${isCurrent ? ' · 当前聊天室' : ''}</div>
                    </div>
                </div>
                <div class="room-actions">
                    ${enterBtn}
                    <button class="room-action-btn rename" data-action="rename">改名</button>
                    <button class="room-action-btn delete" data-action="delete">删除</button>
                </div>
            </div>
        `;
    }).join('');

    // 为每个拖拽把手绑定拖拽开始事件
    listEl.querySelectorAll('.group-chat-room-item .drag-handle').forEach(function (handle) {
        handle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            const row = handle.closest('.group-chat-room-item');
            if (row) grpStartDrag(parseInt(row.dataset.index), e.clientY, row);
        });
        handle.addEventListener('touchstart', function (e) {
            e.preventDefault();
            const touch = e.touches[0];
            const row = handle.closest('.group-chat-room-item');
            if (row) grpStartDrag(parseInt(row.dataset.index), touch.clientY, row);
        }, { passive: false });
    });
}

/** 开始拖拽：高亮当前行 */
function grpStartDrag(index, clientY, row) {
    if (grp_isDragging) return;
    grp_isDragging = true;
    row.classList.add('dragging');
}

/** 拖拽移动：根据鼠标位置计算目标索引并交换顺序（只改内存数组） */
function grpHandleDragMove(clientY) {
    const listEl = document.getElementById('groupChatRoomList');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.group-chat-room-item');
    if (!items.length) return;

    let targetIndex = -1;
    items.forEach(function (item) {
        const rect = item.getBoundingClientRect();
        if (clientY > rect.top + rect.height / 2) targetIndex = parseInt(item.dataset.index) + 1;
        else if (targetIndex === -1) targetIndex = parseInt(item.dataset.index);
    });
    if (targetIndex === -1) targetIndex = items.length;

    const dragItem = listEl.querySelector('.group-chat-room-item.dragging');
    if (!dragItem) return;
    const currentIndex = parseInt(dragItem.dataset.index);
    if (currentIndex !== targetIndex && targetIndex >= 0 && targetIndex < items.length + 1) {
        const dragId = dragItem.dataset.id;
        const item = _groupListCache.splice(currentIndex, 1)[0];
        _groupListCache.splice(targetIndex > currentIndex ? targetIndex - 1 : targetIndex, 0, item);
        renderGroupChatRoomListFromArray(_groupListCache, dragId);
    }
}

/** 拖拽结束：清除高亮，把顺序写回 order 并统一保存 */
async function grpHandleDragEnd() {
    if (!grp_isDragging) return;
    grp_isDragging = false;
    document.querySelectorAll('.group-chat-room-item.dragging').forEach(function (it) {
        it.classList.remove('dragging');
    });
    for (let i = 0; i < _groupListCache.length; i++) {
        _groupListCache[i].order = i;
        await saveGroupChat(_groupListCache[i]);
    }
}

document.addEventListener('mousemove', function (e) { if (grp_isDragging) grpHandleDragMove(e.clientY); });
document.addEventListener('mouseup', grpHandleDragEnd);
document.addEventListener('touchmove', function (e) { if (grp_isDragging) { const t = e.touches[0]; if (t) grpHandleDragMove(t.clientY); } }, { passive: false });
document.addEventListener('touchend', grpHandleDragEnd);

/** 删除聊天室（同时清理其消息） */
async function deleteGroupChatById(groupId) {
    // 删除群聊记录
    await deleteGroupChat(groupId);
    // 删除该群聊的所有消息
    await deleteByIndex('messages', 'contactId', 'group_' + groupId);
}

/* 管理群成员弹窗 */

/** 打开管理群成员弹窗（管理当前聊天室成员） */
async function openGroupMemberModal() {
    const modal = document.getElementById('groupMemberModal');
    if (!modal) return;

    const group = await getCurrentGroupChat();
    if (!group) {
        showToast('当前不在群聊中');
        return;
    }

    await renderGroupMemberList(group);
    modal.classList.remove('hidden');
}

/** 关闭管理群成员弹窗 */
function closeGroupMemberModal() {
    const modal = document.getElementById('groupMemberModal');
    if (modal) modal.classList.add('hidden');
}

/** 渲染管理群成员列表（已加入：群聊中+移除；未加入：可勾选添加） */
async function renderGroupMemberList(group) {
    const listEl = document.getElementById('groupMemberContactList');
    const emptyEl = document.getElementById('groupMemberEmpty');
    const countEl = document.getElementById('groupMemberCount');
    const addBtn = document.getElementById('groupMemberAddBtn');
    if (!listEl) return;

    const contacts = await getAllContacts();
    if (contacts.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (countEl) countEl.textContent = '已选 0 人';
        if (addBtn) { addBtn.textContent = '添加(0)'; addBtn.disabled = true; }
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const memberSet = new Set(group.memberIds || []);
    const selectedIds = new Set();
    listEl.innerHTML = '';

    contacts.forEach(function (contact) {
        const isInGroup = memberSet.has(contact.id);
        const item = document.createElement('div');
        item.className = 'group-chat-contact-item' + (isInGroup ? ' in-group' : '');
        item.dataset.id = contact.id;

        const avatarHTML = contact.avatar
            ? `<img src="${contact.avatar}">`
            : defaultAvatarSVG;

        if (isInGroup) {
            item.innerHTML = `
                <div class="contact-avatar">${avatarHTML}</div>
                <span class="contact-name">${escapeHtml(contact.name)}</span>
                <span class="in-group-tag">群聊中</span>
                <button class="remove-btn" data-id="${contact.id}">移除</button>
            `;
        } else {
            item.innerHTML = `
                <div class="contact-avatar">${avatarHTML}</div>
                <span class="contact-name">${escapeHtml(contact.name)}</span>
                <div class="group-chat-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"
                        stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
            `;
            item.addEventListener('click', function () {
                const id = parseInt(this.dataset.id);
                if (selectedIds.has(id)) {
                    selectedIds.delete(id);
                    this.classList.remove('selected');
                } else {
                    selectedIds.add(id);
                    this.classList.add('selected');
                }
                if (countEl) countEl.textContent = `已选 ${selectedIds.size} 人`;
                if (addBtn) {
                    addBtn.textContent = `添加(${selectedIds.size})`;
                    addBtn.disabled = selectedIds.size === 0;
                }
            });
        }

        listEl.appendChild(item);
    });

    // 移除按钮事件（委托）
    listEl.querySelectorAll('.remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeMemberFromGroup(parseInt(this.dataset.id));
        });
    });

    if (countEl) countEl.textContent = '已选 0 人';
    if (addBtn) { addBtn.textContent = '添加(0)'; addBtn.disabled = true; }
}

/** 添加选中的联系人到当前群聊 */
async function addSelectedMembersToGroup() {
    const group = await getCurrentGroupChat();
    if (!group) return;

    const selected = document.querySelectorAll('#groupMemberContactList .group-chat-contact-item.selected');
    if (selected.length === 0) return;

    const memberSet = new Set(group.memberIds || []);
    let addedCount = 0;
    selected.forEach(function (item) {
        const id = parseInt(item.dataset.id);
        if (!memberSet.has(id)) {
            memberSet.add(id);
            addedCount++;
        }
    });

    group.memberIds = Array.from(memberSet);
    await saveGroupChat(group);

    closeGroupMemberModal();
    await updateGroupHeaderUI(group);
    if (addedCount > 0) showToast(`已添加 ${addedCount} 位成员`);
}

/** 将成员移出当前群聊 */
async function removeMemberFromGroup(memberId) {
    const group = await getCurrentGroupChat();
    if (!group) return;

    const memberSet = new Set(group.memberIds || []);
    if (!memberSet.has(memberId)) return;
    memberSet.delete(memberId);
    group.memberIds = Array.from(memberSet);
    await saveGroupChat(group);

    const contact = await getContactById(memberId);
    const name = contact ? contact.name : '该成员';
    showToast(`已将 ${name} 移出群聊`);

    // 刷新顶部栏 + 管理弹窗
    await updateGroupHeaderUI(group);
    await renderGroupMemberList(group);
}

/* 聊天室改名 */

/** 打开改名弹窗 */
function openRenameGroupModal(groupId) {
    const modal = document.getElementById('groupRenameModal');
    if (!modal) return;

    const input = document.getElementById('groupRenameInput');
    if (input) {
        input.value = '';
        getGroupChatById(groupId).then(function (group) {
            if (group && input) input.value = getGroupName(group);
            setTimeout(function () { if (input) input.focus(); }, 50);
        });
    }
    modal.dataset.renameId = groupId;
    modal.classList.remove('hidden');
}

/** 关闭改名弹窗 */
function closeGroupRenameModal() {
    const modal = document.getElementById('groupRenameModal');
    if (modal) modal.classList.add('hidden');
}

/** 确认改名 */
async function confirmRenameGroup() {
    const modal = document.getElementById('groupRenameModal');
    const input = document.getElementById('groupRenameInput');
    if (!modal || !input) return;

    const groupId = parseInt(modal.dataset.renameId || '0');
    const newName = input.value.trim();

    const group = await getGroupChatById(groupId);
    if (!group) {
        closeGroupRenameModal();
        return;
    }

    if (!newName) {
        showToast('聊天室名称不能为空');
        return;
    }

    group.name = newName;
    await saveGroupChat(group);
    closeGroupRenameModal();

    // 如果是当前聊天室，刷新顶部栏
    if (currentGroupChatId === groupId) {
        await updateGroupHeaderUI(group);
    }
    // 刷新管理列表
    await renderGroupChatRoomList();
    showToast('聊天室名称已修改');
}

/* 事件绑定 */

/** 绑定多人聊天相关事件 */
function bindGroupChatEvents() {
    const groupChatBtn = document.getElementById('groupChatBtn');
    const closeNewBtn = document.getElementById('closeGroupChatModalBtn');
    const startBtn = document.getElementById('groupChatStartBtn');
    const newModal = document.getElementById('groupChatModal');

    const closeManageBtn = document.getElementById('closeGroupManageModalBtn');
    const createNewBtn = document.getElementById('groupCreateNewBtn');
    const roomListEl = document.getElementById('groupChatRoomList');

    const manageMemberBtn = document.getElementById('groupManageBtn');
    const closeMemberBtn = document.getElementById('closeGroupMemberModalBtn');
    const memberModal = document.getElementById('groupMemberModal');
    const memberAddBtn = document.getElementById('groupMemberAddBtn');

    const exitBtn = document.getElementById('exitGroupBtn');
    const renameBtn = document.getElementById('groupRenameBtn');

    const renameModal = document.getElementById('groupRenameModal');
    const renameConfirmBtn = document.getElementById('groupRenameConfirmBtn');
    const renameCancelBtn = document.getElementById('groupRenameCancelBtn');
    const renameCloseBtn = document.getElementById('closeGroupRenameModalBtn');

    // 「多人聊天」按钮：开关切换聊天室管理弹窗（与联系人管理弹窗一致）
    if (groupChatBtn) {
        groupChatBtn.addEventListener('click', function () {
            const modal = document.getElementById('groupManageModal');
            if (modal && !modal.classList.contains('hidden')) {
                closeGroupManageModal();
                return;
            }
            // 如果新建聊天室弹窗还开着（从管理弹窗进入的），先关掉
            const newModal = document.getElementById('groupChatModal');
            if (newModal && !newModal.classList.contains('hidden')) {
                closeGroupChatModal();
            }
            openGroupManageModal();
        });
    }

    // 新建聊天室弹窗
    if (closeNewBtn) {
        closeNewBtn.addEventListener('click', function () {
            closeGroupChatModal();
            openGroupManageModal();
        });
    }
    if (startBtn) {
        startBtn.addEventListener('click', function () {
            const selected = document.querySelectorAll('#groupChatContactList .group-chat-contact-item.selected');
            const ids = [];
            selected.forEach(function (item) {
                ids.push(parseInt(item.dataset.id));
            });
            startGroupChat(ids);
        });
    }
    if (newModal) {
        newModal.addEventListener('click', function (e) {
            if (e.target === newModal) {
                closeGroupChatModal();
                openGroupManageModal();
            }
        });
    }

    // 聊天室管理弹窗
    if (closeManageBtn) closeManageBtn.addEventListener('click', closeGroupManageModal);
    if (createNewBtn) {
        createNewBtn.addEventListener('click', function () {
            closeGroupManageModal();
            openGroupChatModal();
        });
    }
    if (roomListEl) {
        roomListEl.addEventListener('click', function (e) {
            const btn = e.target.closest('.room-action-btn');
            if (!btn) return;
            const item = e.target.closest('.group-chat-room-item');
            if (!item) return;
            const groupId = parseInt(item.dataset.id);
            const action = btn.dataset.action;

            if (action === 'enter') {
                closeGroupManageModal();
                enterGroupChat(groupId, false);
            } else if (action === 'rename') {
                openRenameGroupModal(groupId);
            } else if (action === 'delete') {
                // 确认删除
                showConfirmModal('删除聊天室', '确定要删除这个聊天室吗？删除后该聊天室的所有聊天记录也会一并删除，且无法恢复。',
                    async function () {
                        await deleteGroupChatById(groupId);
                        // 如果删除的是当前聊天室，退出群聊模式
                        if (currentGroupChatId === groupId) {
                            await leaveGroupChatUI();
                        }
                        await renderGroupChatRoomList();
                        showToast('聊天室已删除');
                    }
                );
            }
        });
    }

    // 管理群成员弹窗
    if (manageMemberBtn) manageMemberBtn.addEventListener('click', openGroupMemberModal);
    if (closeMemberBtn) closeMemberBtn.addEventListener('click', closeGroupMemberModal);
    if (memberAddBtn) memberAddBtn.addEventListener('click', addSelectedMembersToGroup);
    if (memberModal) {
        memberModal.addEventListener('click', function (e) {
            if (e.target === memberModal) closeGroupMemberModal();
        });
    }

    // 退出群聊
    if (exitBtn) exitBtn.addEventListener('click', exitGroupChat);

    // 头部改名按钮
    if (renameBtn) {
        renameBtn.addEventListener('click', function () {
            if (currentGroupChatId !== null) openRenameGroupModal(currentGroupChatId);
        });
    }

    // 改名弹窗
    if (renameConfirmBtn) renameConfirmBtn.addEventListener('click', confirmRenameGroup);
    if (renameCancelBtn) renameCancelBtn.addEventListener('click', closeGroupRenameModal);
    if (renameCloseBtn) renameCloseBtn.addEventListener('click', closeGroupRenameModal);
    if (renameModal) {
        renameModal.addEventListener('click', function (e) {
            if (e.target === renameModal) closeGroupRenameModal();
        });
        // 回车确认
        const input = document.getElementById('groupRenameInput');
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') confirmRenameGroup();
            });
        }
    }
}

/* 全局暴露（供 message.js 调用） */
window.isGroupChatMode = isGroupChatMode;
window.getCurrentGroupStorageId = getCurrentGroupStorageId;
window.getCurrentGroupChat = getCurrentGroupChat;
window.getCurrentGroupMembers = getCurrentGroupMembers;
window.getGroupMessageAvatar = getGroupMessageAvatar;
window.getGroupSenderName = getGroupSenderName;
window.refreshGroupHeaderUI = async function () {
    const g = await getCurrentGroupChat();
    if (g) await updateGroupHeaderUI(g);
};
// 同步取当前聊天室 id（供装扮模块在渲染消息时读取，null = 未在群聊）
window.getCurrentGroupIdSync = function () { return currentGroupChatId; };

/* 页面加载后绑定事件 */
document.addEventListener('DOMContentLoaded', function () {
    bindGroupChatEvents();
});
