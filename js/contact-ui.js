/**
 * 联系人管理界面模块 contact-ui.js
 * 负责：联系人管理弹窗、列表、编辑、新建、删除、排序（界面层）
 * 所有数据操作均为异步（IndexedDB）
 */

let ui_isDragging = false;
let _contactModalClickHandler = null;
let _contactModalEscHandler = null;

/** 更新顶部栏显示当前联系人名字（异步） */
async function refreshContactNameUI() {
    // 群聊模式下不覆盖群聊标题
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        return;
    }
    const name = await getCurrentContactName();
    if (name) updateContactNameUI(name);
}

/* 联系人管理弹窗 */

// 打开联系人管理弹窗，渲染列表并绑定关闭事件
// 改前：直接移除 hidden 类打开弹窗
// 改后：如果弹窗已经打开，则关闭它（实现点击图标切换开关）
function openContactManagerModal() {
    const modal = document.getElementById('contactManagerModal');
    if (!modal) return;

    // 如果弹窗当前是显示状态，关闭它并返回
    if (!modal.classList.contains('hidden')) {
        closeContactManagerModal();
        return;
    }

    // 以下是原有的打开逻辑
    modal.classList.remove('hidden');
    (async function () {
        ui_selectedContactId = await getCurrentContactId();
        await renderContactList();
    })();

    if (_contactModalClickHandler) {
        modal.removeEventListener('click', _contactModalClickHandler);
        _contactModalClickHandler = null;
    }
    if (_contactModalEscHandler) {
        document.removeEventListener('keydown', _contactModalEscHandler);
        _contactModalEscHandler = null;
    }

    _contactModalEscHandler = function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeContactManagerModal();
        }
    };
    document.addEventListener('keydown', _contactModalEscHandler);
}

/** 关闭联系人管理弹窗，清理事件与新建行 */
function closeContactManagerModal() {
    const modal = document.getElementById('contactManagerModal');
    if (modal) {
        modal.classList.add('hidden');

        if (_contactModalClickHandler) {
            modal.removeEventListener('click', _contactModalClickHandler);
            _contactModalClickHandler = null;
        }
        if (_contactModalEscHandler) {
            document.removeEventListener('keydown', _contactModalEscHandler);
            _contactModalEscHandler = null;
        }

        const list = document.getElementById('contactList');
        if (list) {
            const addingRow = list.querySelector('.contact-item.adding');
            if (addingRow) addingRow.remove();
            const addBtn = document.getElementById('contactAddBtn');
            if (addBtn) addBtn.style.display = 'block';
        }
        ui_selectedContactId = null;
    }
}

/* 联系人列表渲染 */

/** 把当前所有联系人渲染到列表里 */
async function renderContactList() {
    const list = document.getElementById('contactList');
    if (!list) return;

    const contacts = await getAllContacts();
    const currentId = await getCurrentContactId();
    const addingRow = list.querySelector('.contact-item.adding');
    list.innerHTML = '';

    contacts.forEach((contact, index) => {
        const row = createContactRow(contact, index, contact.id === currentId, contact.id === ui_selectedContactId);
        list.appendChild(row);
    });

    if (addingRow) {
        list.appendChild(addingRow);
        const input = addingRow.querySelector('input');
        if (input) setTimeout(() => input.focus(), 50);
    }

    const addBtn = document.getElementById('contactAddBtn');
    if (addBtn) addBtn.style.display = addingRow ? 'none' : 'block';
}

/** 选中某一行并重新渲染 */
async function selectContactRow(id) {
    ui_selectedContactId = id;
    await renderContactList();
}

/** 生成一个联系人行的 DOM 并绑定事件 */
function createContactRow(contact, index, isCurrent, isSelected) {
    const row = document.createElement('div');
    let className = 'contact-item';
    if (isCurrent) className += ' current';
    if (isSelected) className += ' selected';
    row.className = className;
    row.dataset.index = index;
    row.dataset.id = contact.id;

    const avatarHTML = contact.avatar ? '<img src="' + contact.avatar + '">' : defaultAvatarSVG;
    const currentBadge = isCurrent ? '<span class="current-badge">●</span>' : '';

    row.innerHTML = `
        <div class="contact-item-left">
            <span class="drag-handle" draggable="true">⠿</span>
            ${currentBadge}
            <span class="contact-avatar">${avatarHTML}</span>
            <span class="contact-name">${contact.name}</span>
        </div>
        <div class="contact-item-right">
            <button class="contact-cardlib-btn">字卡库</button>
            <button class="contact-delete-btn">删除</button>
        </div>
    `;

    // 绑定各按钮与区域的点击事件
    row.querySelector('.contact-name').addEventListener('click', function (e) {
        e.stopPropagation();
        (async function () { await startEditContactName(contact.id); })();
    });

    row.querySelector('.contact-avatar').addEventListener('click', function (e) {
        e.stopPropagation();
        openContactAvatarUpload(contact.id);
    });

    row.querySelector('.contact-cardlib-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        (async function () {
            const libKey = 'contact_' + contact.id;
            await saveCurrentCardLib(libKey);
            if (typeof openCardModal === 'function') {
                openCardModal();
            }
        })();
    });

    row.querySelector('.contact-delete-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        (async function () { await confirmDeleteContact(contact.id); })();
    });

    row.addEventListener('click', async function (e) {
        if (e.target.closest('button') || e.target.closest('.contact-avatar') ||
            e.target.closest('.contact-name') || e.target.closest('.drag-handle')) {
            return;
        }
        ui_selectedContactId = contact.id;
        await renderContactList();
    });

    const handle = row.querySelector('.drag-handle');
    if (handle) {
        handle.addEventListener('mousedown', async function (e) {
            e.preventDefault();
            const id = parseInt(row.dataset.id);
            ui_selectedContactId = id;
            await renderContactList();
            const newRow = document.querySelector('.contact-item[data-id="' + id + '"]');
            if (newRow) await startDrag(index, e.clientY, newRow);
        });
        handle.addEventListener('touchstart', async function (e) {
            e.preventDefault();
            const touch = e.touches[0];
            const id = parseInt(row.dataset.id);
            ui_selectedContactId = id;
            await renderContactList();
            const newRow = document.querySelector('.contact-item[data-id="' + id + '"]');
            if (newRow) await startDrag(index, touch.clientY, newRow);
        }, { passive: false });
    }

    return row;
}

/* 联系人名字编辑 */

/** 进入名字编辑状态（显示输入框 + 保存/取消按钮） */
async function startEditContactName(id) {
    await selectContactRow(id);
    const contact = await getContactById(id);
    if (!contact) return;
    const row = document.querySelector(`.contact-item[data-id="${id}"]`);
    if (!row) return;
    const nameSpan = row.querySelector('.contact-name');
    if (!nameSpan || nameSpan.classList.contains('contact-name-editing')) return;

    const currentName = contact.name;
    nameSpan.classList.add('contact-name-editing');
    nameSpan.innerHTML = `
        <input type="text" class="contact-name-input" value="${currentName}" maxlength="20">
        <button class="contact-name-save" onclick="(async function(){await saveContactName(${id});})()">✔</button>
        <button class="contact-name-cancel" onclick="(async function(){await cancelContactName(${id});})()">✕</button>
    `;

    const input = nameSpan.querySelector('.contact-name-input');
    if (input) {
        // 阻止点击输入框内部时冒泡到父元素，避免重新触发编辑
        input.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        input.focus();
        input.select();
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); (async function () { await saveContactName(id); })(); }
            else if (e.key === 'Escape') { e.preventDefault(); (async function () { await cancelContactName(id); })(); }
        });
        input.addEventListener('blur', function () {
            setTimeout(() => {
                if (nameSpan.classList.contains('contact-name-editing')) {
                    (async function () { await cancelContactName(id); })();
                }
            }, 200);
        });
    }
}

/** 保存编辑后的名字 */
async function saveContactName(id) {
    const row = document.querySelector(`.contact-item[data-id="${id}"]`);
    if (!row) return;
    const nameSpan = row.querySelector('.contact-name');
    const input = nameSpan?.querySelector('.contact-name-input');
    if (!input) return;

    const newName = input.value.trim();
    if (!newName) { alert('名字不能为空'); return; }

    if (await updateContactName(id, newName)) {
        await renderContactList();
        await refreshContactNameUI();
    } else {
        await renderContactList();
    }
}

/** 取消编辑名字 */
async function cancelContactName(id) {
    await renderContactList();
}

/* 联系人头像上传 */

/** 打开头像编辑弹窗（先隐藏联系人管理弹窗，关闭后恢复） */
function openContactAvatarUpload(id) {
    const modal = document.getElementById('contactManagerModal');
    if (modal) modal.classList.add('hidden');
    openAvatarModal('partner', id, {
        onClose: function () {
            if (modal) modal.classList.remove('hidden');
            (async function () {
                await renderContactList();
                await refreshContactNameUI();
            })();
        }
    });
}

/* 删除联系人 */

/** 弹确认框删除联系人，成功后刷新列表 */
async function confirmDeleteContact(id) {
    const contact = await getContactById(id);
    if (!contact) return;
    await selectContactRow(id);
    showConfirmModal('确认操作',
        '确定要删除「' + contact.name + '」吗？删除后该联系人的所有字卡和聊天记录将不可恢复。',
        async function () {
            const name = (await getContactById(id))?.name || '';
            await deleteContact(id);
            await renderContactList();
            await refreshContactNameUI();
            showToast('已删除联系人<span class="toast-highlight">「' + name + '」</span>');
        }
    );
}

/* 新建联系人 */

/** 在列表末尾显示「新建联系人」输入行 */
function showAddContactRow() {
    const list = document.getElementById('contactList');
    if (!list || list.querySelector('.contact-item.adding')) return;

    const addBtn = document.getElementById('contactAddBtn');
    if (addBtn) addBtn.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'contact-item adding';
    row.innerHTML = `
        <div class="contact-item-left">
            <span class="drag-handle" style="opacity:0.3;">⠿</span>
            <span class="contact-avatar">${defaultAvatarSVG}</span>
            <input type="text" class="contact-name-input" placeholder="请输入名字" maxlength="20" spellcheck="false">
        </div>
        <div class="contact-item-right">
            <button class="contact-add-confirm">确定</button>
            <button class="contact-add-cancel">取消</button>
        </div>
    `;
    list.appendChild(row);

    const input = row.querySelector('input');
    if (input) {
        setTimeout(() => input.focus(), 50);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); (async function () { await confirmAddContact(); })(); }
            else if (e.key === 'Escape') { e.preventDefault(); (async function () { await cancelAddContact(); })(); }
        });
    }
    row.querySelector('.contact-add-confirm')?.addEventListener('click', async function () { await confirmAddContact(); });
    row.querySelector('.contact-add-cancel')?.addEventListener('click', async function () { await cancelAddContact(); });
}

/**
 * 确认新建：读取输入的名字并创建联系人
 * 创建成功后，在联系人管理弹窗中自动选中该联系人（高亮显示），
 * 并且将右侧滚动条自动滚动到底部，让新建的联系人可见。
 */
async function confirmAddContact() {
    const list = document.getElementById('contactList');
    const row = list?.querySelector('.contact-item.adding');
    const input = row?.querySelector('input');
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
        alert('请输入名字');
        input.focus();
        return;
    }

    const contact = await createContact(name);
    if (contact) {
        // 移除新建输入行，恢复“新建联系人”按钮
        row.remove();
        const addBtn = document.getElementById('contactAddBtn');
        if (addBtn) addBtn.style.display = 'block';

        // 在联系人管理弹窗中选中新建的联系人（高亮显示）
        // selectContactRow 内部会调用 renderContactList 刷新列表
        await selectContactRow(contact.id);

        // 将右侧滚动条滚动到底部，让新建的联系人出现在视野中
        // 因为新建的联系人默认追加在列表末尾
        const listContainer = document.getElementById('contactList');
        if (listContainer) {
            listContainer.scrollTop = listContainer.scrollHeight;
        }

        // 注意：不关闭弹窗，不切换到该联系人聊天
        // 用户继续留在联系人管理界面，可以继续管理其他联系人
    }
}

/** 取消新建：移除输入行 */
async function cancelAddContact() {
    const list = document.getElementById('contactList');
    const row = list?.querySelector('.contact-item.adding');
    if (row) row.remove();
    const addBtn = document.getElementById('contactAddBtn');
    if (addBtn) addBtn.style.display = 'block';
}

/* 拖拽排序 */

/** 开始拖拽：标记拖拽状态并高亮当前行 */
async function startDrag(index, clientY, row) {
    if (ui_isDragging) return;
    const contactId = parseInt(row.dataset.id);
    ui_selectedContactId = contactId;
    await renderContactList();
    const newRow = document.querySelector(`.contact-item[data-id="${contactId}"]`);
    if (!newRow) return;
    ui_isDragging = true;
    newRow.classList.add('dragging');
}

/** 拖拽移动：根据鼠标位置计算目标索引并交换顺序（只改内存，结束时统一保存） */
function handleDragMove(clientY) {
    const list = document.getElementById('contactList');
    if (!list) return;
    const items = list.querySelectorAll('.contact-item:not(.adding)');
    if (!items.length) return;

    let targetIndex = -1;
    items.forEach(function (item) {
        const rect = item.getBoundingClientRect();
        if (clientY > rect.top + rect.height / 2) targetIndex = parseInt(item.dataset.index) + 1;
        else if (targetIndex === -1) targetIndex = parseInt(item.dataset.index);
    });
    if (targetIndex === -1) targetIndex = items.length;

    const currentDragItem = document.querySelector('.contact-item.dragging');
    if (!currentDragItem) return;
    const currentIndex = parseInt(currentDragItem.dataset.index);
    if (currentIndex !== targetIndex && targetIndex >= 0 && targetIndex < items.length + 1) {
        // 只移动内存数组并重渲染（不写 IndexedDB，避免高频写入）
        const contacts = getAllContacts();
        const item = contacts.splice(currentIndex, 1)[0];
        contacts.splice(targetIndex > currentIndex ? targetIndex - 1 : targetIndex, 0, item);
        renderContactList().then(() => {
            const dragId = currentDragItem.dataset.id;
            list.querySelectorAll('.contact-item:not(.adding)').forEach(it => {
                if (it.dataset.id === dragId) it.classList.add('dragging');
            });
        });
    }
}

/** 拖拽结束：清除拖拽状态、统一保存一次并重新渲染 */
async function handleDragEnd() {
    if (!ui_isDragging) return;
    ui_isDragging = false;
    document.querySelector('.contact-item.dragging')?.classList.remove('dragging');
    await saveContactsToStorage();
    await renderContactList();
}

document.addEventListener('mousemove', e => { if (ui_isDragging) handleDragMove(e.clientY); });
document.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchmove', e => { if (ui_isDragging) { const t = e.touches[0]; if (t) handleDragMove(t.clientY); } }, { passive: false });
document.addEventListener('touchend', handleDragEnd);

/* 暴露给全局的函数 */
window.renderContactList = renderContactList;
window.refreshContactNameUI = refreshContactNameUI;
window.openContactManagerModal = openContactManagerModal;
window.closeContactManagerModal = closeContactManagerModal;
window.showAddContactRow = showAddContactRow;
window.confirmAddContact = confirmAddContact;
window.cancelAddContact = cancelAddContact;
window.startEditContactName = startEditContactName;
window.saveContactName = saveContactName;
window.cancelContactName = cancelContactName;
window.confirmDeleteContact = confirmDeleteContact;
window.openContactAvatarUpload = openContactAvatarUpload;
