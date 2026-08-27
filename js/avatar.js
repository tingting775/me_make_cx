/**
 * 头像模块 avatar.js —— 上传头像、裁剪成圆形、保存（IndexedDB）
 */

/* 页面上的各个部件（启动时赋值） */
let avatarModal = null;
let avatarModalTitle = null;
let avatarFileInput = null;
let selectAvatarBtn = null;
let avatarCanvas = null;
let avatarCancelBtn = null;
let avatarConfirmBtn = null;

/* 当前弹窗的所有状态 */
let avatarState = {
    type: null,
    img: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    hasImage: false,
    canvasSize: 180,
    cropSize: 180,
};

let _pendingContactId = null;
let _avatarCallbacks = null;

/** 画布占位底色：跟随主题色（读取 --primary-rgb），取不到时回退浅蓝 */
function getAvatarPlaceholderColor() {
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--primary-rgb').trim();
    return rgb ? 'rgba(' + rgb + ', 0.22)' : '#b0c4d8';
}

/** 初始化头像模块：绑定 DOM 元素与事件 */
function initAvatarModule() {
    avatarModal = document.querySelector('.avatar-modal');
    avatarModalTitle = document.querySelector('.avatar-modal-title');
    avatarFileInput = document.getElementById('avatar-file-input');
    selectAvatarBtn = document.querySelector('.select-avatar-btn');
    avatarCanvas = document.getElementById('avatar-canvas');
    avatarCancelBtn = document.querySelector('.avatar-cancel-btn');
    avatarConfirmBtn = document.querySelector('.avatar-confirm-btn');

    if (!selectAvatarBtn || !avatarFileInput) return;

    setupModalEvents();
    setupCanvasSize();
    initCanvasInteractions();
}

/** 绑定弹窗事件：选择文件、确认/取消、点遮罩/ESC 关闭 */
function setupModalEvents() {
    selectAvatarBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        loadImageToCanvas(file);
    });

    if (avatarConfirmBtn) avatarConfirmBtn.addEventListener('click', confirmAvatar);
    if (avatarCancelBtn) avatarCancelBtn.addEventListener('click', cancelAvatar);

    if (avatarModal) {
        avatarModal.addEventListener('click', function (e) {
            if (e.target === avatarModal) cancelAvatar();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && avatarModal && !avatarModal.classList.contains('hidden')) {
            cancelAvatar();
        }
    });
}

/** 绘制画布：无图时显示提示文字，有图时圆形裁剪（不带白色描边） */
function drawAvatarCanvas() {
    const canvas = avatarCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = avatarState.canvasSize;
    const radius = size / 2;

    ctx.clearRect(0, 0, size, size);

    if (!avatarState.hasImage || !avatarState.img) {
        ctx.fillStyle = getAvatarPlaceholderColor();
        ctx.font = '16px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('请选择图片', size / 2, size / 2);
        return;
    }

    const img = avatarState.img;
    const sw = img.width * avatarState.scale;
    const sh = img.height * avatarState.scale;
    const x = (size - sw) / 2 + avatarState.offsetX;
    const y = (size - sh) / 2 + avatarState.offsetY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, sw, sh);
    ctx.restore();
}

/** 读取本地图片文件到画布（自动适配初始缩放） */
function loadImageToCanvas(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const crop = avatarState.cropSize;
            const initScale = Math.max(crop / img.width, crop / img.height) * 1.03;

            avatarState.img = img;
            avatarState.scale = initScale;
            avatarState.offsetX = 0;
            avatarState.offsetY = 0;
            avatarState.hasImage = true;

            drawAvatarCanvas();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/** 打开头像编辑弹窗：type 为 partner（对方）或 user（自己） */
function openAvatarModal(type, contactId, callbacks) {
    if (!avatarModal) return;

    _pendingContactId = contactId || null;
    _avatarCallbacks = callbacks || null;

    avatarState.type = type;
    avatarState.img = null;
    avatarState.scale = 1;
    avatarState.offsetX = 0;
    avatarState.offsetY = 0;
    avatarState.hasImage = false;

    avatarModalTitle.textContent = type === 'partner' ? '上传对方的头像' : '上传我的头像';

    if (avatarFileInput) avatarFileInput.value = '';
    const ctx = avatarCanvas.getContext('2d');
    ctx.clearRect(0, 0, avatarState.canvasSize, avatarState.canvasSize);
    ctx.fillStyle = getAvatarPlaceholderColor();
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('请选择图片', avatarState.canvasSize / 2, avatarState.canvasSize / 2);

    // 若已有头像，则异步读回并预载到画布
    if (contactId) {
        (async function() {
            const contact = await getContactById(contactId);
            if (contact && contact.avatar) {
                try {
                    const response = await fetch(contact.avatar);
                    const blob = await response.blob();
                    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
                    loadImageToCanvas(file);
                } catch (e) {}
            }
        })();
    } else {
        (async function() {
            let savedAvatar = null;
            if (type === 'partner') {
                savedAvatar = await getPartnerAvatar();
            } else {
                savedAvatar = await getUserAvatar();
            }
            if (savedAvatar) {
                try {
                    const response = await fetch(savedAvatar);
                    const blob = await response.blob();
                    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
                    loadImageToCanvas(file);
                } catch (e) {}
            }
        })();
    }

    avatarModal.classList.remove('hidden');
    setupCanvasSize();
}

function closeAvatarModal() {
    if (avatarModal) avatarModal.classList.add('hidden');
    avatarState.img = null;
    avatarState.hasImage = false;

    if (_avatarCallbacks && typeof _avatarCallbacks.onClose === 'function') {
        _avatarCallbacks.onClose();
    }
    _avatarCallbacks = null;
    _pendingContactId = null;
}

/** 设置画布尺寸（与裁剪尺寸一致） */
function setupCanvasSize() {
    if (!avatarCanvas) return;
    const size = avatarState.canvasSize;
    avatarCanvas.width = size;
    avatarCanvas.height = size;
    avatarCanvas.style.width = size + 'px';
    avatarCanvas.style.height = size + 'px';
}

/** 绑定画布的鼠标/触屏交互：拖动平移、滚轮/双指缩放 */
function initCanvasInteractions() {
    if (!avatarCanvas) return;

    avatarCanvas.addEventListener('mousedown', function (e) {
        if (!avatarState.hasImage) return;
        const rect = avatarCanvas.getBoundingClientRect();
        avatarState.isDragging = true;
        avatarState.dragStartX = e.clientX - rect.left;
        avatarState.dragStartY = e.clientY - rect.top;
        avatarState.startOffsetX = avatarState.offsetX;
        avatarState.startOffsetY = avatarState.offsetY;
        avatarCanvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', function (e) {
        if (!avatarState.isDragging || !avatarState.hasImage) return;
        const rect = avatarCanvas.getBoundingClientRect();
        avatarState.offsetX = avatarState.startOffsetX + (e.clientX - rect.left - avatarState.dragStartX);
        avatarState.offsetY = avatarState.startOffsetY + (e.clientY - rect.top - avatarState.dragStartY);
        drawAvatarCanvas();
    });

    window.addEventListener('mouseup', function () {
        if (avatarState.isDragging) {
            avatarState.isDragging = false;
            if (avatarCanvas) avatarCanvas.style.cursor = 'grab';
        }
    });

    avatarCanvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (!avatarState.hasImage) return;
        // 缩放系数极小：鼠标滚轮每格约 0.5%，方便用户精细微调（只缩放画布内图片，画布框不变）
        avatarState.scale = Math.max(0.1, Math.min(5, avatarState.scale - e.deltaY * 0.00005));
        drawAvatarCanvas();
    }, { passive: false });

    let touchStartX = 0, touchStartY = 0;
    let touchStartOffsetX = 0, touchStartOffsetY = 0;
    let lastTouchDist = 0, isTouching = false;

    avatarCanvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (!avatarState.hasImage || e.touches.length === 0) return;

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = avatarCanvas.getBoundingClientRect();
            isTouching = true;
            touchStartX = touch.clientX - rect.left;
            touchStartY = touch.clientY - rect.top;
            touchStartOffsetX = avatarState.offsetX;
            touchStartOffsetY = avatarState.offsetY;
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0], t2 = e.touches[1];
            lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    }, { passive: false });

    avatarCanvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        if (!avatarState.hasImage) return;

        if (e.touches.length === 1 && isTouching) {
            const touch = e.touches[0];
            const rect = avatarCanvas.getBoundingClientRect();
            avatarState.offsetX = touchStartOffsetX + (touch.clientX - rect.left - touchStartX);
            avatarState.offsetY = touchStartOffsetY + (touch.clientY - rect.top - touchStartY);
            drawAvatarCanvas();
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0], t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            avatarState.scale = Math.max(0.1, Math.min(5, avatarState.scale + (dist - lastTouchDist) / 6000));
            lastTouchDist = dist;
            drawAvatarCanvas();
        }
    }, { passive: false });

    avatarCanvas.addEventListener('touchend', function () { isTouching = false; });
    avatarCanvas.style.cursor = 'grab';
}

/** 刷新所有老消息的头像（异步读取已保存的头像） */
function updateAllMessageAvatars() {
    document.querySelectorAll('.message-item').forEach(function(item) {
        const avatarDiv = item.querySelector('.message-avatar');
        if (!avatarDiv) return;

        const isSelf = item.classList.contains('self');
        // 群聊消息：按发送者 id 取头像
        if (item.classList.contains('group-msg') && !isSelf) {
            const senderId = item.dataset.senderId;
            if (typeof getGroupMessageAvatar === 'function' && senderId) {
                getGroupMessageAvatar(senderId).then(function (avatarData) {
                    avatarDiv.innerHTML = '';
                    if (avatarData) {
                        const img = document.createElement('img');
                        img.src = avatarData;
                        avatarDiv.appendChild(img);
                    } else {
                        avatarDiv.innerHTML = defaultAvatarSVG;
                    }
                });
                return;
            }
        }

        (async function() {
            const avatarData = isSelf ? await getUserAvatar() : await getPartnerAvatar();
            avatarDiv.innerHTML = '';
            if (avatarData) {
                const img = document.createElement('img');
                img.src = avatarData;
                avatarDiv.appendChild(img);
            } else {
                avatarDiv.innerHTML = defaultAvatarSVG;
            }
        })();
    });
}

/**
 * 点「确定」：把裁剪好的圆形图片保存下来
 * 自己的头像保存后立即刷新界面；对方头像保存后刷新顶部与历史消息
 */
async function confirmAvatar() {
    if (!avatarState.hasImage || !avatarState.img) {
        alert('你还未选择头像');
        return;
    }

    const crop = avatarState.cropSize;
    const radius = crop / 2;
    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = crop;
    saveCanvas.height = crop;
    const ctx = saveCanvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.clip();

    const img = avatarState.img;
    ctx.drawImage(img,
        (crop - img.width * avatarState.scale) / 2 + avatarState.offsetX,
        (crop - img.height * avatarState.scale) / 2 + avatarState.offsetY,
        img.width * avatarState.scale,
        img.height * avatarState.scale
    );

    const dataUrl = saveCanvas.toDataURL('image/png');

    if (avatarState.type === 'user') {
        await saveUserAvatar(dataUrl);

        const userAvatarEl = document.querySelector('.user-avatar');
        if (userAvatarEl) userAvatarEl.innerHTML = '<img src="' + dataUrl + '">';

        document.querySelectorAll('.message-item.self .message-avatar').forEach(function(el) {
            el.innerHTML = '<img src="' + dataUrl + '">';
        });

        // 群聊模式下刷新顶部成员列表（用户自己作为第一个成员的头像）
        if (typeof window.refreshGroupHeaderUI === 'function') {
            await window.refreshGroupHeaderUI();
        }

        closeAvatarModal();
        return;
    }

    let targetContactId = _pendingContactId || (await getCurrentContact())?.id || null;
    _pendingContactId = null;
    if (!targetContactId) { closeAvatarModal(); return; }

    const currentContactId = await getCurrentContactId();
    const isEditingCurrent = (targetContactId === currentContactId);

    await updateContactAvatar(targetContactId, dataUrl);

    if (isEditingCurrent) {
        const el = document.getElementById('partnerAvatar');
        if (el) el.innerHTML = '<img src="' + dataUrl + '">';
        await savePartnerAvatar(dataUrl);
        await updateAllMessageAvatars();
    } else {
        const currentContact = await getCurrentContact();
        const el = document.getElementById('partnerAvatar');
        if (el) {
            el.innerHTML = currentContact?.avatar
                ? '<img src="' + currentContact.avatar + '">'
                : defaultAvatarSVG;
        }
        if (currentContact?.avatar) {
            await savePartnerAvatar(currentContact.avatar);
        } else {
            await savePartnerAvatar(null);
        }
         await updateAllMessageAvatars();
    }

    closeAvatarModal();
}

function cancelAvatar() {
    closeAvatarModal();
}

/** 页面打开时加载之前保存的头像并刷新消息头像 */
async function loadAvatars(partnerAvatarEl, userAvatarEl) {
    const savedPartner = await getPartnerAvatar();
    if (savedPartner && partnerAvatarEl) partnerAvatarEl.innerHTML = '<img src="' + savedPartner + '">';

    const savedUser = await getUserAvatar();
    if (savedUser && userAvatarEl) userAvatarEl.innerHTML = '<img src="' + savedUser + '">';

    await updateAllMessageAvatars();
}

/** 绑定对方头像点击 → 打开头像编辑弹窗 */
function setupPartnerAvatarUpload(avatarElement) {
    if (!avatarElement) return;
    avatarElement.addEventListener('click', function (e) {
        e.stopPropagation();
        openAvatarModal('partner');
    });
}

/** 绑定自己头像点击 → 打开头像编辑弹窗 */
function setupUserAvatarUpload(avatarElement) {
    if (!avatarElement) return;
    avatarElement.addEventListener('click', function (e) {
        e.stopPropagation();
        openAvatarModal('user');
    });
}

document.addEventListener('DOMContentLoaded', function () {
    initAvatarModule();
});

// 暴露函数
window.updateAllMessageAvatars = updateAllMessageAvatars;
window.loadAvatars = loadAvatars;
window.setupPartnerAvatarUpload = setupPartnerAvatarUpload;
window.setupUserAvatarUpload = setupUserAvatarUpload;
window.openAvatarModal = openAvatarModal;
