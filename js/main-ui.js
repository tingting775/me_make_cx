/**
 * 主界面 UI 模块 main-ui.js
 * 功能：+ 号功能面板、欢迎弹窗、顶部名字、下拉切换联系人、确认弹窗和提示弹窗
 */

let ui_plusBtn = null, ui_functionPanel = null;
let ui_messageArea = null, ui_contactNameEl = null;
let ui_initModal = null;
/** 联系人管理弹窗里当前选中谁（高亮用，跟聊天无关） */
let ui_selectedContactId = null;

/* 初始化 */

/** 保存各元素引用，供其他函数使用 */
function initUIModule(plus, panel, area, contactName, initModal) {
    ui_plusBtn = plus;
    ui_functionPanel = panel;
    ui_messageArea = area;
    ui_contactNameEl = contactName;
    ui_initModal = initModal;
}

/* + 号功能面板 */

/**
 * 切换功能面板的展开/收起
 * 原理：给 .chat-body 添加或移除 .show 类，
 *       由 CSS 控制 .function-panel 的 max-height 和 .message-area 的 flex 收缩；
 *       展开后自动滚动到聊天区域底部，确保最新消息可见
 */
function toggleFunctionPanel() {
    const panel = ui_functionPanel;
    const chatBody = document.querySelector('.chat-body');
    const messageArea = document.getElementById('messageArea');
    if (!panel || !chatBody || !messageArea) return;

    const isOpen = chatBody.classList.contains('show');

    if (isOpen) {
        chatBody.classList.remove('show');
    } else {
        chatBody.classList.add('show');
        messageArea.scrollTop = messageArea.scrollHeight;
    }
}

/** 点击消息区域时关闭功能面板（如果开着的话） */
function closeFunctionPanelOnMessageClick() {
    const chatBody = document.querySelector('.chat-body');
    if (chatBody && chatBody.classList.contains('show')) {
        chatBody.classList.remove('show');
    }
}

/** 绑定功能面板相关事件 */
function bindUIEvents() {
    ui_plusBtn.addEventListener('click', toggleFunctionPanel);
    ui_messageArea.addEventListener('click', closeFunctionPanelOnMessageClick);
}

/* 欢迎弹窗（首次使用） */

/** 隐藏欢迎弹窗 */
function hideInitModal() { if (ui_initModal) ui_initModal.classList.add('hidden'); }

/** 显示欢迎弹窗 */
function showInitModal() { if (ui_initModal) ui_initModal.classList.remove('hidden'); }

/* 更新顶部联系人的名字 */

/** 更新顶部联系人名字文字 */
function updateContactNameUI(name) { if (ui_contactNameEl) ui_contactNameEl.textContent = name; }

/** 弹出「确认操作」对话框——点确定才执行，点取消就关掉 */
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    if (!modal) { if (confirm(message)) onConfirm(); return; }

    titleEl.textContent = title;
    messageEl.textContent = message;

    // 用 cloneNode 替换旧按钮来清除之前绑定的点击事件
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', function () {
        modal.classList.add('hidden');
        onConfirm();
    });
    newCancel.addEventListener('click', function () {
        modal.classList.add('hidden');
    });
    modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
}


/* 顶部联系人下拉列表（切换聊天对象） */

/** 打开/关闭下拉列表 */
async function togglePartnerDropdown() {
    const dropdown = document.getElementById('partnerDropdown');
    const btn = document.getElementById('partnerSwitchBtn');
    if (!dropdown || !btn) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        await renderPartnerDropdownList();
        dropdown.classList.remove('hidden');
        btn.classList.add('active');
    } else {
        dropdown.classList.add('hidden');
        btn.classList.remove('active');
    }
}

/** 关掉下拉列表 */
function closePartnerDropdown() {
    const dropdown = document.getElementById('partnerDropdown');
    const btn = document.getElementById('partnerSwitchBtn');
    if (dropdown) dropdown.classList.add('hidden');
    if (btn) btn.classList.remove('active');
}

/** 把联系人列表渲染到下拉菜单里 */
async function renderPartnerDropdownList() {
    const list = document.getElementById('partnerDropdownList');
    if (!list) return;

    const contacts = await getAllContacts();
    const currentId = await getCurrentContactId();

    list.innerHTML = '';
    if (contacts.length === 0) {
        list.innerHTML = '<div class="partner-dropdown-empty">暂无联系人</div>';
        return;
    }

    contacts.forEach((contact) => {
        const isCurrent = contact.id === currentId;
        const item = document.createElement('div');
        item.className = 'partner-dropdown-item' + (isCurrent ? ' current' : '');
        item.dataset.id = contact.id;

        const avatarHTML = contact.avatar
            ? `<img src="${contact.avatar}">`
            : defaultAvatarSVG;

        const badgeHTML = isCurrent ? '<span class="item-badge">●</span>' : '';

        item.innerHTML = `
            <div class="item-avatar">${avatarHTML}</div>
            <span class="item-name">${contact.name}</span>
            ${badgeHTML}
        `;

        // 点谁就跟谁聊天
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            const id = parseInt(this.dataset.id);
            (async function() {
                if (id !== await getCurrentContactId()) {
                    await switchContact(id);   // 内部已切换联系人并同步头像缓存
                    await refreshContactNameUI();
                    // 加载该联系人的消息
                    loadMessagesForContact(id);
                    // 更新顶部头像
                    const contact = await getCurrentContact();
                    if (contact) {
                        const avatarEl = document.getElementById('partnerAvatar');
                        if (avatarEl) {
                            avatarEl.innerHTML = contact.avatar
                                ? `<img src="${contact.avatar}">`
                                : defaultAvatarSVG;
                        }
                        updateAllMessageAvatars();
                    }
                }
                closePartnerDropdown();
            })();
        });

        list.appendChild(item);
    });
}

/** 绑定下拉列表的开关事件（按钮点、点外面、按ESC） */
function bindPartnerDropdownEvents() {
    const btn = document.getElementById('partnerSwitchBtn');
    const dropdown = document.getElementById('partnerDropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePartnerDropdown();
    });

    document.addEventListener('click', function (e) {
        if (!dropdown.classList.contains('hidden')) {
            if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                closePartnerDropdown();
            }
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !dropdown.classList.contains('hidden')) {
            closePartnerDropdown();
        }
    });
}


/**
 * 显示轻提示（自动消失）
 * 在聊天区域上方显示一个气泡，3 秒后自动消失；
 * 提示内容可包含「字卡库」链接，点击跳转到字卡库弹窗
 */
function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // 移除之前残留的提示
    const oldToast = container.querySelector('.toast-message');
    if (oldToast) oldToast.remove();

    // 创建新的提示
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.innerHTML = message;
    container.appendChild(toast);

    // 触发显示动画（用 requestAnimationFrame 确保 DOM 已渲染）
    requestAnimationFrame(function () {
        toast.classList.add('show');
    });

    // 绑定「字卡库」点击事件 — 跳转到字卡库
    const link = toast.querySelector('#toastToCard');
    if (link) {
        link.addEventListener('click', function (e) {
            e.stopPropagation();
            // 关闭轻提示
            toast.classList.remove('show');
            setTimeout(function () {
                toast.remove();
            }, 350);
            // 打开字卡库弹窗
            if (typeof openCardModal === 'function') {
                openCardModal();
            }
        });
    }

    // 3秒后自动消失
    setTimeout(function () {
        if (toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(function () {
                if (toast.parentNode) toast.remove();
            }, 350);
        }
    }, 3000);
}
