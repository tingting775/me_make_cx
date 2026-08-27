/**
 * 联系人模块 contact.js —— 管理所有联系人（新增、改名、删除、切换、排序）
 *
 * 只负责数据层，不负责界面；界面更新由其他文件负责。
 * 所有操作均为异步（IndexedDB）。
 */

/* 内部状态 */
let contacts = [];
let currentContactId = null;

/* 初始化 */

/** 从 IndexedDB 加载联系人列表并排序（不设置当前联系人） */
async function loadContactsFromStorage() {
    contacts = await getContacts();
    contacts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return contacts.length > 0;
}

/** 把联系人和当前聊天对象保存到 IndexedDB */
async function saveContactsToStorage() {
    await saveContacts(contacts);
    if (currentContactId !== null) {
        await saveCurrentContactId(currentContactId);
    }
}

/* 读操作 */

/** 获取全部联系人数组 */
function getAllContacts() { return contacts; }

/** 获取当前正在聊天的联系人 */
async function getCurrentContact() {
    if (currentContactId === null) return null;
    return contacts.find(c => c.id === currentContactId) || null;
}

/** 获取当前联系人名字 */
async function getCurrentContactName() {
    const c = await getCurrentContact();
    return c ? c.name : '';
}

/** 按 id 查找联系人 */
async function getContactById(id) {
    return contacts.find(c => c.id === id) || null;
}

/** 判断联系人是否存在 */
function contactExists(id) {
    return contacts.some(c => c.id === id);
}

/** 判断名字是否已被其他联系人占用 */
async function isNameTaken(name, excludeId) {
    return contacts.some(c => c.id !== excludeId && c.name === name.trim());
}

/* 写操作 */

/** 切换到另一个联系人聊天，并同步其头像到聊天界面 */
async function switchContact(id) {
    if (!contactExists(id)) return false;
    // 切换联系人时重置单聊回复锁，避免上一个联系人的锁状态残留
    if (typeof resetSingleReplyState === 'function') resetSingleReplyState();
    currentContactId = id;
    await saveContacts(contacts);
    await saveCurrentContactId(id);
    const contact = await getCurrentContact();
    if (contact?.avatar) {
        await savePartnerAvatar(contact.avatar);
    } else {
        // 清空头像缓存
        await savePartnerAvatar(null);
    }
    // 应用该联系人的装扮（背景图 / 时间戳颜色）
    if (typeof window.applyCurrentChatBackground === 'function') {
        window.applyCurrentChatBackground();
    }
    // 切换联系人：刷新“正在输入”指示器（只展示当前联系人的输入状态；
    // 原联系人的 pending 状态保留，切回时若还没回完则重新出现）
    if (typeof syncTypingIndicator === 'function') syncTypingIndicator();
    return true;
}

/** 新建联系人（自动去重名、排序、持久化），失败返回 null */
async function createContact(name) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('请输入名字');
        return null;
    }
    if (await isNameTaken(trimmedName)) {
        alert('已存在同名联系人');
        return null;
    }

    const contact = { id: Date.now(), name: trimmedName, avatar: '', createdAt: Date.now() };
    contacts.push(contact);
    contacts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    await saveContactsToStorage();
    return contact;
}

/** 删除联系人：同时清理其字卡库、聊天记录，若删的是当前联系人则自动切换到第一个 */
async function deleteContact(id) {
    const contact = await getContactById(id);
    if (!contact) return false;

    // 删除字卡库
    await saveCardData(id, null);
    // 字卡库已变更，使缓存失效
    if (typeof invalidateCardDataCache === 'function') {
        invalidateCardDataCache();
    }
    // 删除聊天记录
    await clearMessagesStorage(id);

    // 从所有群聊中移除该成员引用（避免残留失效 ID，影响备份导出）
    if (typeof getGroupChats === 'function') {
        var groupChats = await getGroupChats();
        for (var gi = 0; gi < groupChats.length; gi++) {
            var g = groupChats[gi];
            if (g.memberIds && g.memberIds.indexOf(id) !== -1) {
                g.memberIds = g.memberIds.filter(function (m) { return m !== id; });
                await saveGroupChat(g);
            }
        }
    }

    contacts = contacts.filter(c => c.id !== id);

    // 清理该联系人在“正在输入”状态中的残留（单聊 pending + 群聊成员列表）
    if (typeof window.cleanupTypingForContact === 'function') {
        window.cleanupTypingForContact(id);
    }

    if (currentContactId === id) {
        if (contacts.length > 0) {
            await switchContact(contacts[0].id);
        } else {
            currentContactId = null;
            await savePartnerAvatar(null);
        }
    }

    await saveContactsToStorage();
    return true;
}

/** 修改联系人名字（去重名校验） */
async function updateContactName(id, newName) {
    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert('名字不能为空');
        return false;
    }
    const contact = await getContactById(id);
    if (!contact) return false;
    if (await isNameTaken(trimmedName, id)) {
        alert('已存在同名联系人');
        return false;
    }

    contact.name = trimmedName;
    await saveContactsToStorage();
    return true;
}

/** 更新联系人头像 */
async function updateContactAvatar(id, dataUrl) {
    const contact = await getContactById(id);
    if (!contact) return false;

    contact.avatar = dataUrl;
    await saveContactsToStorage();
    if (currentContactId === id) {
        await savePartnerAvatar(dataUrl);
    }
    return true;
}

/** 拖动排序：把 fromIndex 的联系人移动到 toIndex */
async function moveContactOrder(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= contacts.length) return false;
    if (toIndex < 0 || toIndex >= contacts.length) return false;
    if (fromIndex === toIndex) return false;

    const item = contacts.splice(fromIndex, 1)[0];
    contacts.splice(toIndex, 0, item);
    await saveContactsToStorage();
    return true;
}

/* 暴露给全局：只暴露业务函数，不暴露数据读取函数，避免覆盖 data.js */
window.loadContactsFromStorage = loadContactsFromStorage;
window.saveContactsToStorage = saveContactsToStorage;
window.switchContact = switchContact;
window.createContact = createContact;
window.deleteContact = deleteContact;
window.updateContactName = updateContactName;
window.updateContactAvatar = updateContactAvatar;
window.moveContactOrder = moveContactOrder;
// 同步取当前联系人 id（供装扮模块在渲染消息时读取）
window.getCurrentContactIdSync = function () { return currentContactId; };
