/**
 * 启动入口 start.js —— 页面一打开就运行这个文件
 * 负责：拿到页面元素、启动各功能模块、绑定全局事件
 */

/* 第1步：拿到页面上的各个元素 */
const messageArea = document.getElementById('messageArea');
const messageInput = document.getElementById('messageInput');
const typingIndicator = document.getElementById('typingIndicator');
const plusBtn = document.getElementById('plusBtn');
const functionPanel = document.getElementById('functionPanel');
const sendBtn = document.getElementById('sendBtn');
const contactName = document.getElementById('contactName');
const initModal = document.getElementById('initModal');
const initNameInput = document.getElementById('initNameInput');
const startBtn = document.getElementById('startBtn');
const partnerAvatar = document.getElementById('partnerAvatar');
const userAvatar = document.getElementById('userAvatar');

/* 第2步：启动各个功能模块 */
initMessageModule(messageArea, messageInput, typingIndicator);
initUIModule(plusBtn, functionPanel, messageArea, contactName, initModal);
bindUIEvents();
bindPartnerDropdownEvents();

// 初始化装扮模块（在页面加载完成后）
if (typeof initDressUp === 'function') {
    initDressUp();
}

document.getElementById('contactAddBtn')?.addEventListener('click', showAddContactRow);
document.getElementById('closeContactManagerBtn')?.addEventListener('click', closeContactManagerModal);

/* 第3步：加载联系人数据，等待欢迎界面完成后触发 */

/** 启动时检查联系人：有则恢复聊天界面，没有则显示创建联系人弹窗 */
async function checkContactsOnStartup() {
    const contacts = await getContacts();
    const hasContact = contacts && contacts.length > 0;

    if (hasContact) {
        window.onWelcomeComplete = async function () {
            // 1. 显示主界面
            hideInitModal();
            const name = await getCurrentContactName();
            updateContactNameUI(name);

            // 2. 恢复联系人
            let savedId = await getCurrentContactId();
            let targetContact = null;
            if (savedId) {
                targetContact = await getContactById(savedId);
            }
            if (!targetContact) {
                const all = await getAllContacts();
                if (all.length > 0) {
                    targetContact = all[0];
                    savedId = targetContact.id;
                }
            }
            if (targetContact) {
                await switchContact(targetContact.id);
                await saveCurrentContactId(targetContact.id);
            }

            const name2 = await getCurrentContactName();
            updateContactNameUI(name2);

            // 加载头像
            const partnerAvatarData = await getPartnerAvatar();
            const userAvatarData = await getUserAvatar();
            if (partnerAvatarData && partnerAvatar) {
                partnerAvatar.innerHTML = '<img src="' + partnerAvatarData + '">';
            }
            if (userAvatarData && userAvatar) {
                userAvatar.innerHTML = '<img src="' + userAvatarData + '">';
            }
            updateAllMessageAvatars();

            // 3. 加载消息（等待完成）
            const currentId = await getCurrentContactId();
            if (currentId) {
                await loadMessagesForContact(currentId);
            }

            // 4. 恢复群聊状态（如果上次在群聊中）
            if (typeof restoreGroupChatOnStartup === 'function') {
                await restoreGroupChatOnStartup();
            }

            // 注意：不再调用 completeLoading，由 welcome.js 统一控制进度条走完
            // window.onWelcomeComplete = null; // 不在这里清除
        };
    } else {
        // 没有联系人：显示创建联系人的弹窗
        window.onWelcomeComplete = function () {
            showInitModal();
            window.onWelcomeComplete = null;
        };
    }
}

// 启动联系人检测
checkContactsOnStartup();

/* 第4步：绑定各种点击/按键事件 */

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', function (e) {
    // Ctrl+Enter 发送
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendMessage();
    }
    // 单独的 Enter 键默认换行，不发送
});

// 欢迎窗里点「开始」→ 创建第一个联系人
startBtn.addEventListener('click', async function () {
    const name = initNameInput.value.trim();
    if (!name) {
        alert('请输入名字');
        return;
    }
    const contact = await createContact(name);
    if (contact) {
        await switchContact(contact.id);
        hideInitModal();
        const name2 = await getCurrentContactName();
        updateContactNameUI(name2);

        const partnerAvatarData = await getPartnerAvatar();
        const userAvatarData = await getUserAvatar();
        if (partnerAvatarData && partnerAvatar) {
            partnerAvatar.innerHTML = '<img src="' + partnerAvatarData + '">';
        }
        if (userAvatarData && userAvatar) {
            userAvatar.innerHTML = '<img src="' + userAvatarData + '">';
        }
        updateAllMessageAvatars();

        loadMessagesForContact(contact.id);
    }
});

// 设置头像上传（对方和自己的）
setupPartnerAvatarUpload(partnerAvatar);
setupUserAvatarUpload(userAvatar);

// 功能面板入口
document.querySelectorAll('.function-item').forEach(function (item) {
    const span = item.querySelector('span');
    if (span && span.textContent === '联系人管理') {
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            openContactManagerModal();
        });
    }
});

bindCardModalEntry();

// 装扮按钮：点击打开装扮弹窗
document.getElementById('dressUpBtn')?.addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof window.openDressUpModal === 'function') {
        window.openDressUpModal();
    }
});

document.querySelectorAll('.function-item').forEach(function (item) {
    const span = item.querySelector('span');
    if (span && span.textContent === '聊天设置') {
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.openSettingsModal === 'function') {
                window.openSettingsModal();
            }
        });
    }
});

document.querySelectorAll('.function-item').forEach(function (item) {
    const span = item.querySelector('span');
    if (span && span.textContent === '数据管理') {
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.openDataManagerModal === 'function') {
                window.openDataManagerModal();
            }
        });
    }
});

document.getElementById('quoteBarClose').addEventListener('click', clearQuote);

if (typeof window.openSettingsModal !== 'function') {
    window.openSettingsModal = function () {
        console.warn('聊天设置模块未加载，请检查 chat-settings.js 是否正确引入');
    };
}

/* 表情按钮 → 打开/关闭表情选择面板 */
document.getElementById('emojiBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof window.toggleEmojiPicker === 'function') {
        window.toggleEmojiPicker();
    }
});

/* 表情选择面板的切换按钮 */
document.getElementById('emojiPickerSwitch').addEventListener('click', function (e) {
    e.stopPropagation();
    if (typeof toggleEmojiPickerDropdown === 'function') {
        toggleEmojiPickerDropdown();
    }
});


/* ============================================================
   弹窗拖拽移动功能 —— 拖动标题栏自由移动弹窗
   支持鼠标和触屏，有边界保护
   拖拽位置和弹窗大小保存在 localStorage，刷新后自动恢复
   ============================================================ */

/* 弹窗位置/大小的本地存储 key */
var MODAL_STATE_KEY = 'modalWindowState';

/** 读取所有弹窗的保存状态 */
function loadModalStates() {
  try {
    return JSON.parse(localStorage.getItem(MODAL_STATE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

/** 保存某个弹窗的状态（位置偏移 dx/dy、尺寸 width/height） */
function saveModalState(id, partial) {
  var states = loadModalStates();
  states[id] = Object.assign({}, states[id], partial);
  try {
    localStorage.setItem(MODAL_STATE_KEY, JSON.stringify(states));
  } catch (e) {
    /* 存储失败（隐私模式等）时静默忽略 */
  }
}

function initDragToMove(modalSelector, headerSelector, cardSelector) {
  var modal = document.querySelector(modalSelector);
  if (!modal) return;

  var header = modal.querySelector(headerSelector);
  if (!header) return;

  var card = modal.querySelector(cardSelector);
  if (!card) return;

  /* 页面加载时恢复上次保存的弹窗大小（像素值覆盖 CSS 的百分比尺寸） */
  var savedState = loadModalStates()[modal.id];
  if (savedState && savedState.width > 0 && savedState.height > 0) {
    var savedW = Math.min(savedState.width, window.innerWidth - 24);
    var savedH = Math.min(savedState.height, window.innerHeight - 24);
    if (savedW >= 200 && savedH >= 100) {
      card.style.width = savedW + 'px';
      card.style.height = savedH + 'px';
    }
  }

  var isDragging = false;
  var startX = 0, startY = 0;
  var currentDx = 0, currentDy = 0;
  var startDx = 0, startDy = 0;

  /**
   * 把期望的 translate 偏移 (dx, dy) 限制到安全范围：
   * 保证弹窗标题栏始终完整留在视口内（可被抓住拖回），
   * 而不是简单限制偏移量（弹窗较大时偏移一小段标题栏就可能出屏）。
   * 返回修正后的 [dx, dy]。
   */
  function clampToViewport(dx, dy) {
    var rect = card.getBoundingClientRect();
    var headerH = header.offsetHeight || 44;
    var margin = 24; // 水平方向标题栏至少保留的可见宽度

    // 垂直：标题栏完整可见（顶部 >= 0，底部 <= 视口高度）
    var minTop = 0;
    var maxTop = Math.max(0, window.innerHeight - headerH);
    // 水平：标题栏至少留 margin 宽可见（可点到）
    var minLeft = margin - rect.width;
    var maxLeft = window.innerWidth - margin;

    var targetLeft = rect.left + (dx - currentDx);
    var targetTop = rect.top + (dy - currentDy);

    var clampedLeft = Math.max(minLeft, Math.min(maxLeft, targetLeft));
    var clampedTop = Math.max(minTop, Math.min(maxTop, targetTop));

    var newDx = currentDx + (clampedLeft - rect.left);
    var newDy = currentDy + (clampedTop - rect.top);
    return [newDx, newDy];
  }

  /** 应用限制后的偏移到盒子上 */
  function applyTransform(dx, dy) {
    currentDx = dx;
    currentDy = dy;
    card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  }

  function onStart(e) {
    // 点击按钮、下拉切换、输入框等不触发拖拽
    if (e.target.closest('button') ||
        e.target.closest('.card-lib-switch') ||
        e.target.closest('.emoji-lib-switch') ||
        e.target.closest('input') ||
        e.target.closest('textarea') ||
        e.target.closest('select')) {
      return;
    }

    var point = e.touches ? e.touches[0] : e;
    isDragging = true;
    startX = point.clientX;
    startY = point.clientY;

    // 获取当前的 transform 偏移量（如果有的话）
    var transform = card.style.transform;
    var match = transform && transform.match(/translate\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    if (match) {
      currentDx = parseFloat(match[1]) || 0;
      currentDy = parseFloat(match[2]) || 0;
    } else {
      currentDx = 0;
      currentDy = 0;
    }
    startDx = currentDx;
    startDy = currentDy;

    // 拖拽时改变光标样式，让用户知道正在拖拽
    card.style.cursor = 'grabbing';
    card.style.userSelect = 'none';
    e.preventDefault();
  }

  function onMove(e) {
    if (!isDragging) return;
    var point = e.touches ? e.touches[0] : e;
    var dx = point.clientX - startX;
    var dy = point.clientY - startY;

    var newDx = startDx + dx;
    var newDy = startDy + dy;

    // 边界保护：保证标题栏始终留在屏幕内（可抓住拖回）
    var clamped = clampToViewport(newDx, newDy);
    applyTransform(clamped[0], clamped[1]);
    e.preventDefault();
  }

  function onEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    card.style.cursor = '';
    card.style.userSelect = '';
    // 拖拽结束后保存位置，刷新后恢复
    saveModalState(modal.id, { dx: currentDx, dy: currentDy });
    e.preventDefault();
  }

  // 监听弹窗显示/隐藏：弹窗打开时，恢复上次拖拽的位置；没有保存过则回到屏幕中央
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // 当弹窗从隐藏变为显示时，恢复或重置 transform
        if (!modal.classList.contains('hidden')) {
          var state = loadModalStates()[modal.id];
          if (state && typeof state.dx === 'number') {
            // 手机小屏（≤600px）不恢复拖拽位置：避免桌面残留偏移导致弹窗贴边/出屏，始终居中
            if (window.innerWidth <= 600) {
              card.style.transform = '';
              currentDx = 0;
              currentDy = 0;
            } else {
              // 恢复保存的位置，但再次限制在屏幕内（窗口大小变化后可能出屏）
              card.style.transform = 'translate(' + state.dx + 'px, ' + state.dy + 'px)';
              currentDx = state.dx;
              currentDy = state.dy;
              var clamped = clampToViewport(state.dx, state.dy);
              applyTransform(clamped[0], clamped[1]);
            }
          } else {
            card.style.transform = '';
            currentDx = 0;
            currentDy = 0;
          }
        }
      }
    });
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

  // 弹窗可见时，每次鼠标松开都检查并保存当前大小
  // （只有尺寸真的变化时才写入，避免频繁读写 localStorage）
  document.addEventListener('mouseup', function () {
    if (modal.classList.contains('hidden')) return;
    var w = card.offsetWidth;
    var h = card.offsetHeight;
    if (w > 0 && h > 0) {
      var prev = loadModalStates()[modal.id] || {};
      if (prev.width !== w || prev.height !== h) {
        saveModalState(modal.id, { width: w, height: h });
      }
    }
  });

  // ===== 自定义右下角手柄改尺寸（替代 CSS 原生 resize，便于精确控制并保存） =====
  var handle = document.createElement('div');
  handle.className = 'modal-resize-handle';
  handle.title = '拖动调整大小';
  card.appendChild(handle);

  var resizing = false;
  var rStartX = 0, rStartY = 0, rStartW = 0, rStartH = 0, rMinW = 200, rMinH = 120;

  function resizeStart(x, y) {
    resizing = true;
    rStartX = x;
    rStartY = y;
    rStartW = card.offsetWidth;
    rStartH = card.offsetHeight;
    var cs = getComputedStyle(card);
    rMinW = parseFloat(cs.minWidth) || 200;
    rMinH = parseFloat(cs.minHeight) || 120;
  }

  function resizeMove(x, y) {
    if (!resizing) return;
    var w = rStartW + (x - rStartX);
    var h = rStartH + (y - rStartY);
    var maxW = window.innerWidth - 40;
    var maxH = window.innerHeight - 40;
    w = Math.max(rMinW, Math.min(maxW, w));
    h = Math.max(rMinH, Math.min(maxH, h));
    card.style.width = w + 'px';
    card.style.height = h + 'px';
  }

  function resizeEnd() {
    if (!resizing) return;
    resizing = false;
    var w = card.offsetWidth;
    var h = card.offsetHeight;
    if (w > 0 && h > 0) {
      saveModalState(modal.id, { width: w, height: h });
    }
  }

  handle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    resizeStart(e.clientX, e.clientY);
  });
  handle.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.touches[0];
    resizeStart(t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('mousemove', function (e) {
    resizeMove(e.clientX, e.clientY);
  });
  document.addEventListener('touchmove', function (e) {
    if (!resizing) return;
    e.preventDefault();
    var t = e.touches[0];
    resizeMove(t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('mouseup', resizeEnd);
  document.addEventListener('touchend', resizeEnd);

  // 绑定事件
  header.addEventListener('mousedown', onStart);
  header.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
}

// 为五个弹窗分别绑定拖拽功能
// 参数说明：(弹窗容器ID, 标题栏选择器, 卡片内容选择器)
initDragToMove('#cardModal', '.card-modal-header', '.card-modal-box');
initDragToMove('#contactManagerModal', '.contact-manager-header', '.contact-manager-box');
initDragToMove('#settingsModal', '.settings-modal-header', '.settings-modal-box');
initDragToMove('#dataManagerModal', '.settings-modal-header', '.settings-modal-box');
initDragToMove('#dressUpModal', '.settings-modal-header', '.settings-modal-box');
// 聊天室管理弹窗：与联系人管理弹窗一致的拖拽/缩放体验
initDragToMove('#groupManageModal', '.card-sub-header', '.card-sub-box');
