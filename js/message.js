/**
 * 消息模块 message.js —— 负责聊天：发消息、显示消息、模拟对方回复
 * 功能：
 *   ① 发送 / 删除 / 引用消息；分页加载（每次 20 条）+ 日期分隔线 + 滚动加载更多
 *   ② 模拟对方回复（读取字卡 / 表情 / 引用，随机延迟，可排队）
 *   ③ 表情选择面板（含字卡库切换下拉）
 *   ④ 引用消息缓存（分页加载下仍能正确显示引用内容）
 */

/* 内部变量 */

let msg_area = null;              // 消息滚动区域
let msg_input = null;             // 消息输入框
let msg_typingIndicator = null;   // “对方正在输入”指示器

/* 消息状态管理 */

let allMessages = [];              // 已加载的消息（按时间正序）
let quotedMessage = null;          // 当前引用的消息
let isFirstLoadComplete = false;   // 首次加载是否已完成且稳定
let quotedExistsCache = {};        // 引用消息存在性缓存 { messageId: true/false }

/* 分页状态 */

let messageState = {
    contactId: null,               // 当前联系人 ID
    hasMore: true,                 // 是否还有更早的消息
    isLoadingMore: false,          // 是否正在加载更多
    limit: 20,                     // 每次加载条数
    earliestLoadedTimestamp: null, // 已加载消息中最早的时间戳（用于加载更早的消息）
    isInitialLoad: true            // 是否首次加载
};

/* 主动发送 */

let lastAutoSendTime = Date.now();
let autoSendTimer = null;
let isFirstLoadScrolling = false;

/* 常量 */
const QUOTE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

/* 工具函数 */

/** 根据设置判断是否显示时间戳（按当前模式读取单聊/群聊对应设置） */
function shouldShowTimestamp() {
    return getSettings().then(function (settings) {
        const isGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        const scope = isGroup ? settings.group : settings.single;
        return scope.timestampStyle !== 'none';
    });
}

function formatTime(timestamp) {
    const date = new Date(timestamp);    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');

    let period = '';
    if (hours >= 6 && hours < 11) period = '早上';
    else if (hours >= 11 && hours < 13) period = '中午';
    else if (hours >= 13 && hours < 18) period = '下午';
    else if (hours >= 18 && hours < 24) period = '晚上';
    else period = '凌晨';

    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;

    return period + ' ' + displayHours + ':' + minutes;
}

/**
 * 判断两条消息是否在同一天
 */
function isSameDay(timestamp1, timestamp2) {
    if (!timestamp1 || !timestamp2) return false;
    const d1 = new Date(timestamp1);
    const d2 = new Date(timestamp2);
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

/**
 * 格式化日期分隔线的显示文本
 * 规则：今天/昨天/星期X/月日/年月日
 */
function formatDateSeparator(timestamp) {
    const date = new Date(timestamp);        // 消息的日期
    const now = new Date();                  // 当前时间
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 今天0点
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // 消息那天0点

    // 计算消息日期距离今天有多少天（整数）
    const diffDays = Math.floor((today - targetDate) / (24 * 60 * 60 * 1000));

    // 1. 如果是今天（差0天） → 显示“今天”
    if (diffDays === 0) return '今天';

    // 2. 如果是昨天（差1天） → 显示“昨天”
    if (diffDays === 1) return '昨天';

    // 3. 改后：本周内的（2~6天前）不再显示“星期X”，统一走下面的“月日”逻辑
    // 原逻辑（已删除）：
    // if (diffDays >= 2 && diffDays <= 6) { const weekdays = [...]; return weekdays[date.getDay()]; }

    // 4. 如果是今年内 → 显示“X月X日”（现在包含本周内的日期了）
    if (date.getFullYear() === now.getFullYear()) {
        return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    }

    // 5. 如果不是今年（跨年了） → 显示“XXXX年X月X日”
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

/* 音效播放 */

/** 播放音效（发送 / 接收，读取设置后调用公共合成函数） */
function playSound(type) {
    getSettings().then(function (settings) {
        if (!settings.sound.enabled) return;
        const soundValue = type === 'send'
            ? (settings.sound.sendSound || 'crisp')
            : (settings.sound.receiveSound || 'crisp');
        playSynthSound(soundValue, settings.sound.volume / 100);
    }).catch(function () {
        // 设置读取失败时静默忽略
    });
}

/* 初始化 */

/** 重置消息分页状态（用已加载消息中最早的时间戳作为分页边界） */
function resetMessageState() {
    messageState = {
        contactId: null,
        hasMore: true,                 // 是否还有更早的消息
        isLoadingMore: false,          // 是否正在加载更多
        limit: 20,                     // 每次加载条数
        earliestLoadedTimestamp: null, // 已加载消息中最早的时间戳（用于加载更早的消息）
        isInitialLoad: true            // 是否首次加载
    };
}

/* 主动发送 */

/** 启动自动回复定时器（每分钟检查一次是否到自动回复时间） */
function startAutoSendTimer() {
    if (autoSendTimer) {
        clearInterval(autoSendTimer);
        autoSendTimer = null;
    }
    lastAutoSendTime = Date.now();
    autoSendTimer = setInterval(function () {
        checkAutoSend();
    }, 60000);
}

function checkAutoSend() {
    getSettings().then(function (settings) {
        // 按当前模式读取对应作用域：群聊用 group，单聊用 single
        const isGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        const scope = isGroup ? settings.group : settings.single;
        const autoSend = scope.messageInteraction.autoSend || false;
        const interval = scope.messageInteraction.autoSendInterval || 30;

        if (!autoSend) return;

        // 群聊模式下不需要当前联系人
        if (isGroup) {
            const elapsed = Date.now() - lastAutoSendTime;
            const intervalMs = interval * 60 * 1000;
            if (elapsed >= intervalMs) {
                lastAutoSendTime = Date.now();
                simulateReply();
            }
            return;
        }

        getCurrentContact().then(function (contact) {
            if (!contact) return;

            const elapsed = Date.now() - lastAutoSendTime;
            const intervalMs = interval * 60 * 1000;

            if (elapsed >= intervalMs) {
                lastAutoSendTime = Date.now();
                simulateReply();
            }
        });
    });
}

/* 消息ID生成 */

/** 生成唯一的消息 ID */
function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/* 引用管理 */

/** 设置引用消息（图片消息显示缩略图） */
function setQuote(id) {
    const msg = allMessages.find(m => m.id === id);
    if (!msg) return;
    (async function () {
        let senderName = '';
        if (msg.type === 'self') {
            senderName = '我';
        } else if (msg.senderName) {
            // 群聊消息：用消息自带的发送者名字
            senderName = msg.senderName;
        } else {
            senderName = await getCurrentContactName() || '对方';
        }

        // 判断是否为图片消息，如果是则用 img 标签显示缩略图
        let displayContent = msg.content;
        if (msg.isImage === true) {
            // 图片消息：用 img 标签显示小缩略图
            displayContent = `<img src="${msg.content}" style="max-height:32px; max-width:80px; border-radius:4px; vertical-align:middle; display:inline-block;">`;
        }

        quotedMessage = {
            id: msg.id,
            content: displayContent,
            sender: senderName,
            isImage: msg.isImage || false
        };
        renderQuoteBar();
        hideAllMessageActions();
    })();
}

/** 清除当前引用 */
function clearQuote() {
    quotedMessage = null;
    renderQuoteBar();
}

/** 渲染引用条（支持 HTML 内容，用于显示图片缩略图） */
function renderQuoteBar() {
    const bar = document.getElementById('quoteBar');
    const text = document.getElementById('quoteBarText');
    if (!bar || !text) return;

    if (quotedMessage) {
        bar.classList.remove('hidden');
        // 使用 innerHTML 以支持图片标签
        text.innerHTML = `<span class="quote-sender">${quotedMessage.sender}：</span> ${quotedMessage.content}`;
    } else {
        bar.classList.add('hidden');
    }
}

/* 引用缓存 */

/**
 * 刷新引用消息存在性缓存
 * 从 IndexedDB 全量查询被引用消息是否存在，避免分页加载导致的误判
 */
async function refreshQuotedCache() {
    const contactId = messageState.contactId;
    if (!contactId) return;

    const quoteIds = [];
    allMessages.forEach(function (msg) {
        if (msg.quoted && msg.quoted.id) {
            quoteIds.push(msg.quoted.id);
        }
    });

    if (quoteIds.length === 0) {
        quotedExistsCache = {};
        return;
    }

    const uniqueIds = [...new Set(quoteIds)];
    const allMessagesFromDB = await loadMessages(contactId);
    const messageIdSet = new Set();
    allMessagesFromDB.forEach(function (msg) {
        messageIdSet.add(msg.id);
    });

    quotedExistsCache = {};
    uniqueIds.forEach(function (id) {
        quotedExistsCache[id] = messageIdSet.has(id);
    });
}

/* 核心加载逻辑 */

/** 加载消息（对外接口）：首次加载最新 20 条，用时间戳分页；加载前清空旧数据防止残留 */
async function loadMessagesForContact(contactId) {
    if (!contactId) return;

    resetMessageState();
    messageState.contactId = contactId;
    messageState.isInitialLoad = true;
    isFirstLoadComplete = false;
    quotedExistsCache = {};

    // 清空内存数据并清空 DOM，防止删除消息后旧消息依然显示
    allMessages = [];
    await renderMessages();

    // 用 loadMessagesBefore 加载最新的 20 条
    await loadMoreMessages();
}

/**
 * 显示「已无更多历史记录」提示
 */
function showNoMoreMessages() {
    if (!msg_area) return;
    if (msg_area.querySelector('.no-more-messages')) return;
    const tip = document.createElement('div');
    tip.className = 'no-more-messages';
    tip.innerHTML = `
        <span class="line"></span>
        <span class="text">已无更多历史记录</span>
        <span class="line"></span>
    `;
    msg_area.insertBefore(tip, msg_area.firstChild);
}

/**
 * 加载更早的消息（滚动触发）
 * 用 earliestLoadedTimestamp 作为分页边界；首次加载后自动滚到底部
 */
async function loadMoreMessages() {
    // 首次加载判断：分页边界时间戳为空且处于初始状态
    const wasInitialLoad = messageState.isInitialLoad && messageState.earliestLoadedTimestamp === null;

    // 首次加载未稳定时，不触发加载更多
    if (!wasInitialLoad && !isFirstLoadComplete) {
        return;
    }

    if (messageState.isLoadingMore) return;
    if (!messageState.hasMore) return;
    if (!messageState.contactId) return;

    messageState.isLoadingMore = true;
    showLoadingIndicator();

    // ---- 必须在任何 await 之前记录滚动状态 ----
    // 否则 await 加载数据期间用户仍在滚动（平滑动画继续），
    // 数据返回后再记录锚点会与“触发加载瞬间”的视口不一致，
    // 恢复位置后视口内容跳变，表现为日期分隔线“闪一下又消失”
    const oldScrollTop = msg_area ? msg_area.scrollTop : 0;
    const oldScrollHeight = msg_area ? msg_area.scrollHeight : 0;
    let anchor = null;
    if (msg_area) {
        const items = msg_area.querySelectorAll('.message-item');
        for (const el of items) {
            // 第一条底部仍在视口内的消息，作为恢复位置的锚点
            if (el.offsetTop + el.offsetHeight > msg_area.scrollTop) {
                anchor = { id: el.dataset.id, relTop: el.offsetTop - msg_area.scrollTop };
                break;
            }
        }
    }

    try {
        const limit = messageState.limit;
        // 获取分页边界时间戳：首次加载传 null，后续传已加载消息中最早的时间戳
        const beforeTimestamp = messageState.earliestLoadedTimestamp;
        const newMessages = await loadMessagesBefore(messageState.contactId, beforeTimestamp, limit);

        if (newMessages.length === 0) {
            // 没有更早的消息了
            messageState.hasMore = false;

            // 如果是首次加载（比如删除消息后），需要重置状态并刷新界面
            if (wasInitialLoad) {
                allMessages = [];
                messageState.isInitialLoad = false;
                isFirstLoadComplete = true;
                await renderMessages();
                updateScrollListener();
            } else {
                showNoMoreMessages();
            }

            hideLoadingIndicator();
            messageState.isLoadingMore = false;
            return;
        }

        if (wasInitialLoad) {
            // 首次加载：直接替换 allMessages
            allMessages = newMessages;

            // 更新最早的时间戳（用于下次加载更早的消息）
            if (allMessages.length > 0) {
                messageState.earliestLoadedTimestamp = allMessages[0].timestamp;
            } else {
                messageState.earliestLoadedTimestamp = null;
            }

            await refreshQuotedCache();
            await renderMessages();

            // 首次加载：滚动到底部
            await scrollToBottomInstant();
            messageState.isInitialLoad = false;

        } else {
            // 加载更多：把新消息插到 allMessages 前面
            // （滚动状态 oldScrollTop/oldScrollHeight/anchor 已在函数开头 await 之前记录）

            hideLoadingIndicator();

            // 预取渲染数据（头像/时间戳），供下面循环里的消息复用
            await prepareRenderCache();

            // 原列表第一条消息的时间戳：用于增量判断日期分隔线（已有分隔线不动）
            const firstOldItem = msg_area ? msg_area.querySelector('.message-item') : null;
            const firstOldTs = firstOldItem ? Number(firstOldItem.dataset.timestamp) || null : null;

            // 构建要插入的 DOM 片段：日期分隔线按“跨天”增量生成（见 buildFragmentWithSeparators）——
            // 新加载消息之间跨天且该日期段尚未在原列表出现时才新增分隔线；
            // 已有分隔线一个都不动，因此视口内可见的分隔线不会被搬走（修复“闪一下又消失”）
            const fragment = buildFragmentWithSeparators(newMessages, firstOldTs);

            // 插入前预解码所有图片消息（表情包 dataURL）：
            // 解码完成前 img 高度为 0，若插入后再解码会撑高布局，导致位置恢复不准、内容“蠕动”
            await Promise.all(Array.from(fragment.querySelectorAll('.message-image')).map(function (img) {
                return img.decode().catch(function () { /* 解码失败忽略（浏览器仍会显示） */ });
            }));

            // ---- 同帧插入 + 恢复位置（根治闪烁）----
            // 以下步骤在同一个同步代码块内完成，中间不插任何 await：
            // 浏览器只在帧边界绘制，同步块执行期间不会渲染中间状态，
            // 因此“新消息已插入但 scrollTop 还是旧值”的画面永远不会出现在屏幕上
            const prevScrollBehavior = msg_area.style.scrollBehavior;
            msg_area.style.scrollBehavior = 'auto';

            // 插入到消息区域顶部（跳过「已无更多」提示）
            let insertBeforeNode = msg_area.firstChild;
            if (insertBeforeNode && insertBeforeNode.classList && insertBeforeNode.classList.contains('no-more-messages')) {
                insertBeforeNode = insertBeforeNode.nextSibling;
            }
            msg_area.insertBefore(fragment, insertBeforeNode || msg_area.firstChild);

            // 日期分隔线已在 fragment 中按“跨天”增量生成（buildFragmentWithSeparators），
            // 已有分隔线保持不变 → 视口内可见的分隔线不会被搬走，不再“闪一下又消失”

            // 加载到底：显示“已无更多”提示（必须在恢复位置前插入，使其高度计入布局，
            // 否则会在恢复后插入占位元素把内容往下推，再次造成闪烁）
            if (newMessages.length < limit) {
                messageState.hasMore = false;
                showNoMoreMessages();
            }

            // 恢复位置：读 offsetTop 会触发同步 reflow，此时布局已准确（图片已预解码）
            if (anchor) {
                const targetElement = msg_area.querySelector('.message-item[data-id="' + anchor.id + '"]');
                if (targetElement) {
                    msg_area.scrollTop = targetElement.offsetTop - anchor.relTop;
                } else {
                    // 找不到目标消息（极端情况），用高度差恢复
                    const newScrollHeight = msg_area.scrollHeight;
                    const heightDiff = newScrollHeight - oldScrollHeight;
                    msg_area.scrollTop = oldScrollTop + heightDiff;
                }
            } else {
                // 没有可见消息，用高度差恢复
                const newScrollHeight = msg_area.scrollHeight;
                const heightDiff = newScrollHeight - oldScrollHeight;
                msg_area.scrollTop = oldScrollTop + heightDiff;
            }

            // 恢复原有的滚动行为（CSS 中的 smooth）
            msg_area.style.scrollBehavior = prevScrollBehavior;

            // 更新 allMessages：新消息放在前面
            allMessages = newMessages.concat(allMessages);

            // 更新最早的时间戳（新消息的第一条比原来的更早）
            if (newMessages.length > 0) {
                messageState.earliestLoadedTimestamp = newMessages[0].timestamp;
            }

            // 刷新引用缓存（DOM 已稳定，此处的异步不再影响画面）
            await refreshQuotedCache();
        }

        updateScrollListener();

    } catch (e) {
        console.error('加载消息失败:', e);
    }

    hideLoadingIndicator();
    messageState.isLoadingMore = false;
}

/* 滚动监听 */

let scrollListenerAttached = false;
let scrollToBottomBtn = null;      // “回到底部”按钮（缓存，避免滚动时重复查询 DOM）

/** 更新滚动监听（先移除再添加，避免重复绑定） */
function updateScrollListener() {
    if (!msg_area) return;

    if (scrollListenerAttached) {
        msg_area.removeEventListener('scroll', handleScroll);
    }
    msg_area.addEventListener('scroll', handleScroll);
    scrollListenerAttached = true;
}

let lastLoadMoreTime = 0;

/** 滚动事件：控制“回到底部”按钮显示 + 触发加载更早消息 */
function handleScroll() {
    if (!msg_area) return;

    /* 1. 回到底部按钮的显示/隐藏（始终生效，不受 hasMore 影响） */
    if (scrollToBottomBtn) {
        // 按可视区高度的 60% 作为阈值，距离底部小于可视区 60% 时隐藏按钮
        // 也就是需要往上滚动超过半个屏幕多一些，按钮才出现
        const threshold = msg_area.clientHeight * 0.8;
        const isNearBottom = msg_area.scrollHeight - msg_area.scrollTop - msg_area.clientHeight < threshold;
        if (isNearBottom) {
            scrollToBottomBtn.classList.remove('show');
        } else {
            scrollToBottomBtn.classList.add('show');
        }
    }

    /* 2. 加载更多逻辑（受 hasMore 和 isLoadingMore 控制） */
    if (messageState.isLoadingMore) return;
    if (!messageState.hasMore) return;
    if (isFirstLoadScrolling) return;

    const now = Date.now();
    if (now - lastLoadMoreTime < 1000) return;

    if (msg_area.scrollTop < 100) {
        lastLoadMoreTime = now;
        loadMoreMessages();
    }
}

/* 渲染函数 */

/** 渲染数据缓存（批量渲染时复用，避免每条消息都读 IndexedDB） */
let avatarRenderCache = { self: null, partner: null, loaded: false };
let showTimestampCache = null; // null=未加载, true/false=是否显示时间戳

/** 预取渲染所需数据：双方头像 + 时间戳设置（任一项失败则保持未加载，走异步兜底） */
async function prepareRenderCache() {
    try {
        const [settings, selfAvatar, partnerAvatar] = await Promise.all([
            getSettings(),
            getUserAvatar(),
            getPartnerAvatar()
        ]);
        avatarRenderCache = { self: selfAvatar, partner: partnerAvatar, loaded: true };
        // 按当前模式读取单聊/群聊对应的时间戳设置
        const isGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        const scope = isGroup ? settings.group : settings.single;
        showTimestampCache = scope.timestampStyle !== 'none';
    } catch (e) {
        // 读取失败：保持未加载状态，createMessageElement 内部走异步兜底
    }
}

/** 渲染所有消息 + 日期分隔线（分隔线由 rebuildDateSeparators 统一生成，不重复不缺失） */
async function renderMessages() {
    if (!msg_area) return;

    await prepareRenderCache();

    msg_area.innerHTML = '';

    if (allMessages.length === 0) {
        updateScrollListener();
        return;
    }

    const fragment = document.createDocumentFragment();

    if (!messageState.hasMore) {
        const tip = document.createElement('div');
        tip.className = 'no-more-messages';
        tip.innerHTML = `
            <span class="line"></span>
            <span class="text">已无更多历史记录</span>
            <span class="line"></span>
        `;
        fragment.appendChild(tip);
    }

    allMessages.forEach(function (msg) {
        fragment.appendChild(createMessageElement(msg));
    });

    msg_area.appendChild(fragment);
    rebuildDateSeparators();
    updateScrollListener();
}

/** 创建日期分隔线 DOM */
function createDateSeparator(timestamp) {
    const div = document.createElement('div');
    div.className = 'date-separator';
    div.innerHTML = `
        <span class="line"></span>
        <span class="text">${formatDateSeparator(timestamp)}</span>
        <span class="line"></span>
    `;
    return div;
}

/**
 * 构建分页加载要插入的 DOM 片段（增量日期分隔线方案）：
 * 只在“新消息之间跨天”且“该日期段尚未在原列表第一条出现”时插入日期分隔线；
 * 已有分隔线一个都不动，因此视口内可见的分隔线不会被搬走（不会“闪一下又消失”）。
 *
 * 说明：
 * - 新消息按时间正序（早→晚），插在列表最顶部
 * - 列表最顶部的消息如果是新日期段（与原列表第一条不同日期）→ 加标签；
 *   若与原列表第一条同一天 → 不加（该日期标签已在原列表第一条前，重复加会出现两个同日期标签）
 * - 新消息之间跨天处：若跨天后是新日期段（与原列表第一条不同日期）→ 加标签；
 *   若与第一条同天 → 不加（标签已存在）
 *
 * @param {Array} newMessages - 新加载的消息（时间正序，早→晚）
 * @param {number|null} firstOldTs - 原列表第一条消息的时间戳；null 表示原列表为空
 */
function buildFragmentWithSeparators(newMessages, firstOldTs) {
    const fragment = document.createDocumentFragment();
    newMessages.forEach(function (msg, i) {
        const ts = Number(msg.timestamp) || 0;
        const isNewDay = firstOldTs === null || !isSameDay(ts, firstOldTs);
        if (i === 0) {
            // 列表最顶部：只有新日期段才加标签（同一天时标签已存在于原列表第一条前）
            if (isNewDay) {
                fragment.appendChild(createDateSeparator(ts));
            }
        } else if (!isSameDay(Number(newMessages[i - 1].timestamp) || 0, ts)) {
            // 新消息之间跨天：若该日期段与原列表第一条同天，标签已存在，避免重复
            if (isNewDay) {
                fragment.appendChild(createDateSeparator(ts));
            }
        }
        fragment.appendChild(createMessageElement(msg));
    });
    return fragment;
}

/**
 * 重建日期分隔线（幂等）：
 * 扫描消息区域中所有消息元素，按“相邻消息是否跨天”重新生成分隔线；
 * 先删光再重建，因此任何加载/渲染路径调用后，分隔线都不会重复或缺失
 * （根治分页交界处连续两个“8月3日”、旧分隔线文本错乱等问题）
 */
function rebuildDateSeparators() {
    if (!msg_area) return;

    // 1. 删除所有旧分隔线（不影响 no-more-messages 提示）
    msg_area.querySelectorAll('.date-separator').forEach(function (sep) {
        sep.remove();
    });

    // 2. 扫描消息元素（querySelectorAll 返回静态快照，遍历中插入不影响）
    //    第一条消息、或与上一条消息跨天时，在段首插入分隔线（显示本条消息的日期）
    let prevTimestamp = null;
    msg_area.querySelectorAll('.message-item').forEach(function (item) {
        const ts = Number(item.dataset.timestamp);
        if (!ts) return;
        if (prevTimestamp === null || !isSameDay(prevTimestamp, ts)) {
            const separator = createDateSeparator(ts);
            msg_area.insertBefore(separator, item);
        }
        prevTimestamp = ts;
    });
}

/** 瞬间滚动到底部（多次重试，确保图片加载完成后仍能到底） */
function scrollToBottomInstant() {
    return new Promise(function (resolve) {
        if (!msg_area) {
            isFirstLoadScrolling = false;
            isFirstLoadComplete = true;
            resolve();
            return;
        }

        isFirstLoadScrolling = true;

        // 临时禁用平滑滚动，确保立即跳到底部（不产生滚轮动画）
        const prevBehavior = msg_area.style.scrollBehavior;
        msg_area.style.scrollBehavior = 'auto';

        // 第一次滚动：立即执行
        function doScroll() {
            msg_area.scrollTop = msg_area.scrollHeight;
        }

        // 执行第一次滚动
        doScroll();

        // 300ms 后第二次滚动（部分图片可能已加载）
        setTimeout(function () {
            doScroll();

            // 再等 300ms 后第三次滚动（确保图片完全加载）
            setTimeout(function () {
                doScroll();

                // 恢复原有滚动行为
                msg_area.style.scrollBehavior = prevBehavior;

                // 完成
                isFirstLoadScrolling = false;
                isFirstLoadComplete = true;
                updateScrollListener();
                resolve();
            }, 300);
        }, 300);
    });
}

/* 加载指示器 */

let loadingIndicator = null;
let loadingIndicatorTimer = null; // 延迟显示计时器（加载很快时不出现在视觉里，不闪）

/**
 * 显示顶部加载指示器
 * 延迟 150ms 才真正创建：本地数据加载通常极快，避免 spinner 一闪而过造成闪烁；
 * 绝对定位挂在 .chat-body（消息区外层容器）顶部，不占文档流，
 * 插入/移除都不会推动消息内容，从根源上消除“闪一下”
 */
function showLoadingIndicator() {
    if (loadingIndicator && loadingIndicator.parentNode) return;

    clearTimeout(loadingIndicatorTimer);
    loadingIndicatorTimer = setTimeout(function () {
        const chatBody = msg_area ? msg_area.closest('.chat-body') : document.querySelector('.chat-body');
        if (!chatBody) return;
        if (loadingIndicator && loadingIndicator.parentNode) return;

        loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = `
            <div class="loading-spinner"></div>
        `;
        chatBody.appendChild(loadingIndicator);
    }, 150);
}

/** 隐藏顶部加载指示器 */
function hideLoadingIndicator() {
    clearTimeout(loadingIndicatorTimer);
    loadingIndicatorTimer = null;
    if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.remove();
    }
    loadingIndicator = null;
}

/* 消息持久化 */

/**
 * 将一条消息追加保存到 IndexedDB 并同步内存列表
 * 群聊模式存到群聊 storage（group_xxx），单人模式存到联系人 storage
 * 有 storage id 时读全量追加（带 id 防重），否则直接保存内存列表
 * @param {object} msgData - 消息数据对象
 */
async function persistMessage(msgData) {
    allMessages.push(msgData);
    let storageId = null;
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        storageId = getCurrentGroupStorageId();
    }
    if (!storageId) {
        storageId = await getCurrentContactId();
    }
    if (storageId) {
        const fullMessages = await loadMessages(storageId);
        const exists = fullMessages.some(m => m.id === msgData.id);
        if (!exists) {
            fullMessages.push(msgData);
            await saveMessages(storageId, fullMessages);
            allMessages = fullMessages;
        }
    } else {
        await saveCurrentMessages(allMessages);
    }
}

/**
 * 将消息保存到指定联系人的消息库（不渲染、不影响当前 allMessages）
 * 用于单聊延迟回复时用户已切到群聊/其他联系人：回复仍保存，回到该联系人时能看到
 * @param {object} msgData - 消息数据对象
 * @param {number|string} contactId - 目标联系人 ID
 */
async function persistMessageToContact(msgData, contactId) {
    if (!contactId) return;
    const fullMessages = await loadMessages(contactId);
    const exists = fullMessages.some(m => m.id === msgData.id);
    if (!exists) {
        fullMessages.push(msgData);
        await saveMessages(contactId, fullMessages);
    }
}

/* 发送消息 */

/** 发送输入框中的文字消息（含引用），并触发对方回复 */
async function sendMessage() {
    const text = msg_input.value.trim();
    if (!text) return;

    const quoteData = quotedMessage ? {
        id: quotedMessage.id,
        content: quotedMessage.content,
        sender: quotedMessage.sender
    } : null;

    const msgData = {
        id: generateMessageId(),
        type: 'self',
        content: text,
        timestamp: Date.now(),
        quoted: quoteData
    };

    // 群聊模式：标记发送者为“我”
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        msgData.senderId = 'me';
        msgData.senderName = '我';
    }

    await persistMessage(msgData);

    addMessageDOM(msgData);
    msg_input.value = '';
    clearQuote();
    playSound('send');
    simulateReply();

    // 重置输入框高度
    if (msg_input) {
        msg_input.style.height = 'auto';
        msg_input.style.height = msg_input.scrollHeight + 'px';
        if (msg_input.scrollHeight > 120) {
            msg_input.style.overflowY = 'auto';
        } else {
            msg_input.style.overflowY = 'hidden';
        }
    }

}

/* 添加消息到 DOM */

/**
 * 添加一条消息（保存到 IndexedDB 并渲染）；对方消息时播放接收音效
 * @param {string} type - 'self' 或 'other'
 * @param {string} content - 消息内容（图片消息为 dataUrl）
 * @param {boolean} isImage - 是否为表情包图片
 * @param {object|null} quotedData - 引用数据
 * @param {string|null} senderId - 群聊模式发送者 id（'me' 或联系人 id）
 * @param {string|null} senderName - 群聊模式发送者名字
 */
function addMessage(type, content, isImage = false, quotedData = null, senderId = null, senderName = null) {
    const quoteData = quotedData || (quotedMessage ? {
        id: quotedMessage.id,
        content: quotedMessage.content,
        sender: quotedMessage.sender
    } : null);

    const msgData = {
        id: generateMessageId(),
        type: type,
        content: content,
        timestamp: Date.now(),
        quoted: quoteData,
        isImage: isImage
    };

    // 群聊模式：标记发送者
    if (senderId) {
        msgData.senderId = senderId;
        msgData.senderName = senderName || '成员';
    }

    persistMessage(msgData);
    addMessageDOM(msgData);

    if (type === 'other') {
        clearQuote();
        playSound('receive');
    }
}

/**
 * 在目标消息旁边显示一个指向气泡的箭头（0.5秒后自动消失）
 * @param {HTMLElement} targetEl - 目标消息的 DOM 元素
 */
function showArrowOnMessage(targetEl) {
    // 判断消息类型
    const isSelf = targetEl.classList.contains('self');

    // 找到气泡元素（文字消息用 .message-bubble，图片消息用 .message-image）
    let bubbleEl = targetEl.querySelector('.message-bubble');
    if (!bubbleEl) {
        bubbleEl = targetEl.querySelector('.message-image');
    }
    // 如果都找不到，用整个消息项作为备选
    if (!bubbleEl) {
        bubbleEl = targetEl;
    }

    // 获取气泡在视口中的位置
    const rect = bubbleEl.getBoundingClientRect();

    // 创建箭头容器
    const arrowWrapper = document.createElement('div');
    arrowWrapper.className = 'quote-arrow-wrapper';
    arrowWrapper.style.cssText = `
        position: fixed;
        z-index: 1000;
        font-size: 22px;
        color: #333;
        font-weight: bold;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease-out, transform 0.2s ease-out;
        line-height: 1;
        user-select: none;
    `;

    // 根据消息类型决定箭头位置和方向
    if (isSelf) {
        arrowWrapper.style.left = (rect.left - 30) + 'px';
        arrowWrapper.style.top = (rect.top + rect.height / 2 - 11) + 'px';
        arrowWrapper.textContent = '→';
    } else {
        arrowWrapper.style.left = (rect.right + 10) + 'px';
        arrowWrapper.style.top = (rect.top + rect.height / 2 - 11) + 'px';
        arrowWrapper.textContent = '←';
    }

    document.body.appendChild(arrowWrapper);

    // 立即显示
    requestAnimationFrame(function () {
        arrowWrapper.style.opacity = '1';
        arrowWrapper.style.transform = 'scale(1)';
    });

    // 0.5 秒后淡出并移除
    setTimeout(function () {
        arrowWrapper.style.opacity = '0';
        arrowWrapper.style.transform = 'scale(0.8)';
        setTimeout(function () {
            if (arrowWrapper.parentNode) {
                arrowWrapper.remove();
            }
        }, 300);
    }, 500);
}

/**
 * 滚动到目标消息，等滚动完全停止后显示箭头
 * 用 scrollend 事件监听滚动真正结束，位置永远准确
 * @param {HTMLElement} targetEl - 目标消息元素
 */
function scrollToMessageWithArrow(targetEl) {
    // 先滚动
    targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // 监听滚动结束
    function onScrollEnd() {
        msg_area.removeEventListener('scrollend', onScrollEnd);
        showArrowOnMessage(targetEl);
    }

    // 用 scrollend 事件（浏览器原生支持，滚动动画完全停止后触发）
    if (msg_area) {
        msg_area.addEventListener('scrollend', onScrollEnd, { once: true });

        // 降级方案：如果浏览器不支持 scrollend（极少见），10秒后强制显示
        setTimeout(function () {
            msg_area.removeEventListener('scrollend', onScrollEnd);
            showArrowOnMessage(targetEl);
        }, 10000);
    } else {
        // 极端情况：没有 msg_area，直接显示
        showArrowOnMessage(targetEl);
    }
}

/** 创建消息 DOM 元素（头像、气泡/图片、引用、时间戳、操作按钮） */
function createMessageElement(msgData) {
    const msgItem = document.createElement('div');
    msgItem.className = `message-item ${msgData.type}`;
    msgItem.dataset.id = msgData.id;
    // 记录时间戳供 rebuildDateSeparators 判断跨天（避免查 allMessages）
    msgItem.dataset.timestamp = msgData.timestamp;

    // 群聊消息：添加 group-msg 标识（senderId 存在即群聊消息）
    const isGroupMsg = !!msgData.senderId;
    if (isGroupMsg) {
        msgItem.classList.add('group-msg');
        if (msgData.senderId) {
            msgItem.dataset.senderId = msgData.senderId;
        }
    }

    // 按当前聊天对象取装扮颜色（每个联系人/聊天室可独立设置）
    const dressTimestampColor = (typeof window.getCurrentTimestampColor === 'function') ? window.getCurrentTimestampColor() : null;
    const dressGroupNameColor = (typeof window.getCurrentGroupNameColor === 'function') ? window.getCurrentGroupNameColor() : null;

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
        <button class="action-btn quote-btn" title="引用">${QUOTE_ICON}</button>
        <button class="action-btn delete-btn" title="删除">${DELETE_ICON}</button>
    `;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (isGroupMsg && msgData.type === 'other') {
        // 群聊对方消息：按发送者 id 取头像（异步读取并填充）
        (async function () {
            const avatarData = await getGroupMessageAvatar(msgData.senderId);
            avatar.innerHTML = avatarData ? `<img src="${avatarData}">` : defaultAvatarSVG;
        })();
    } else if (avatarRenderCache.loaded) {
        // 缓存已就绪：同步设置（批量渲染时复用，避免每条消息读 IndexedDB）
        const src = msgData.type === 'self' ? avatarRenderCache.self : avatarRenderCache.partner;
        avatar.innerHTML = src ? `<img src="${src}">` : defaultAvatarSVG;
    } else {
        // 缓存未就绪（如单条消息直发）：异步读取并填充
        (async function () {
            if (msgData.type === 'self') {
                const userAvatar = await getUserAvatar();
                avatar.innerHTML = userAvatar ? `<img src="${userAvatar}">` : defaultAvatarSVG;
            } else {
                const partnerAvatar = await getPartnerAvatar();
                avatar.innerHTML = partnerAvatar ? `<img src="${partnerAvatar}">` : defaultAvatarSVG;
            }
        })();
    }

    // 头像 + 名字包进同一个容器（群聊对方消息：名字在头像正下方）
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'message-avatar-wrap';
    avatarWrap.appendChild(avatar);
    if (isGroupMsg && msgData.type === 'other' && msgData.senderName) {
        const sender = document.createElement('div');
        sender.className = 'message-sender';
        sender.textContent = msgData.senderName;
        if (dressGroupNameColor) sender.style.color = dressGroupNameColor;
        avatarWrap.appendChild(sender);
    }

    msgItem.appendChild(actions);
    msgItem.appendChild(avatarWrap);

    // 群聊对方消息：把气泡/图片、引用、时间戳包进纵向容器，
    // 避免头像+名字撑高 flex 行导致时间戳与气泡之间悬空一大段
    let msgContent = null;
    if (isGroupMsg && msgData.type === 'other') {
        msgContent = document.createElement('div');
        msgContent.className = 'msg-content';
        msgItem.appendChild(msgContent);
    }

    // ---- 消息内容 ----
    if (msgData.isImage) {
        // 表情包：直接显示图片，不需要气泡
        const img = document.createElement('img');
        img.src = msgData.content;
        img.className = 'message-image';
        img.style.maxWidth = '180px';
        img.style.borderRadius = '10px';
        img.style.display = 'block';
        // 点击表情包 → 大图预览
        img.style.cursor = 'zoom-in';
        img.title = '点击查看大图';
        img.addEventListener('click', function (e) {
            e.stopPropagation();
            openImagePreview(img.src);
        });
        (msgContent || msgItem).appendChild(img);
    } else {
        // 文字消息：保留气泡
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        const contentSpan = document.createElement('span');
        contentSpan.textContent = msgData.content;
        bubble.appendChild(contentSpan);
        (msgContent || msgItem).appendChild(bubble);
    }

    // ---- 引用区域 ----
    if (msgData.quoted) {
        const quoteDiv = document.createElement('div');
        quoteDiv.className = 'message-quote';
        // 用缓存判断引用消息是否已被删除
        const isDeleted = quotedExistsCache[msgData.quoted.id] === false;
        const quotedContent = isDeleted
            ? '消息已被删除'
            : `<span class="quote-sender">${msgData.quoted.sender}：</span>${msgData.quoted.content}`;
        const contentSpan = document.createElement('span');
        contentSpan.className = 'quote-content' + (isDeleted ? ' quote-deleted' : '');
        contentSpan.innerHTML = quotedContent;
        quoteDiv.appendChild(contentSpan);
        (msgContent || msgItem).appendChild(quoteDiv);

        quoteDiv.style.cursor = 'pointer';
        quoteDiv.title = '点击跳转到原消息';
        // 点击跳转：DOM 中找不到时，从 IndexedDB 加载目标所在页到最新页
        quoteDiv.addEventListener('click', async function (e) {
            e.stopPropagation();
            const targetId = msgData.quoted.id;

            // 先在 DOM 里找
            let targetEl = document.querySelector(`.message-item[data-id="${targetId}"]`);

            // 情况1：在 DOM 中找到了，直接跳转，显示箭头
            if (targetEl) {
                scrollToMessageWithArrow(targetEl);
                return;
            }

            // 情况2：DOM 中找不到，先查缓存确认消息是否还存在
            if (quotedExistsCache[targetId] === false) {
                showToast('原消息已被删除');
                return;
            }

            // 情况3：从 IndexedDB 加载「从目标所在页到最新页」
            const contactId = messageState.contactId;
            if (!contactId) {
                showToast('原消息已被删除');
                return;
            }

            // 使用新函数加载从目标所在页到最新的所有消息
            const loadedMessages = await loadMessagesFromTargetToLatest(contactId, targetId, 20);

            if (loadedMessages.length === 0) {
                showToast('原消息已被删除');
                return;
            }

            // 检查目标消息是否在加载的结果中
            const targetFound = loadedMessages.some(function (m) { return m.id === targetId; });
            if (!targetFound) {
                showToast('原消息已被删除');
                return;
            }

            // 替换 allMessages
            allMessages = loadedMessages;

            // 判断是否还有更早的消息：如果加载结果包含了最早的消息，则 hasMore = false
            // 否则用户可以继续向上滚动加载更早的消息
            const allMsgsFromDB = await loadMessages(contactId);
            if (allMsgsFromDB.length > 0 && loadedMessages.length > 0) {
                // 如果加载的第一条消息就是整个对话的第一条，说明没有更早的了
                const earliestMsg = allMsgsFromDB[0];
                if (loadedMessages[0].id === earliestMsg.id) {
                    messageState.hasMore = false;
                } else {
                    // 还有更早的消息，保留加载能力
                    messageState.hasMore = true;
                    // 更新最早时间戳，以便向上滚动加载更早消息
                    messageState.earliestLoadedTimestamp = loadedMessages[0].timestamp;
                }
            } else {
                messageState.hasMore = false;
            }

            // 重新渲染
            await renderMessages();

            // 滚动到目标消息
            // 等待浏览器完成布局后再滚动
            setTimeout(function () {
                const newTargetEl = document.querySelector(`.message-item[data-id="${targetId}"]`);
                if (newTargetEl) {
                    scrollToMessageWithArrow(newTargetEl);
                } else {
                    showToast('原消息已被删除');
                }
            }, 100);
        });
    }

    // ---- 时间戳 ----
    if (showTimestampCache === null) {
        // 缓存未就绪：异步读取设置
        shouldShowTimestamp().then(function (show) {
            if (show) {
                const timestampSpan = document.createElement('div');
                timestampSpan.className = 'message-timestamp';
                timestampSpan.textContent = formatTime(msgData.timestamp || Date.now());
                if (dressTimestampColor) timestampSpan.style.color = dressTimestampColor;
                (msgContent || msgItem).appendChild(timestampSpan);
            }
        });
    } else if (showTimestampCache) {
        const timestampSpan = document.createElement('div');
        timestampSpan.className = 'message-timestamp';
        timestampSpan.textContent = formatTime(msgData.timestamp || Date.now());
        if (dressTimestampColor) timestampSpan.style.color = dressTimestampColor;
        (msgContent || msgItem).appendChild(timestampSpan);
    }

    // ---- 绑定按钮事件 ----
    const quoteBtn = actions.querySelector('.quote-btn');
    const deleteBtn = actions.querySelector('.delete-btn');

    quoteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setQuote(msgData.id);
    });

    deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        (async function () { await deleteMessage(msgData.id); })();
    });

    setupLongPress(msgItem, msgData.id);

    msgItem.addEventListener('mouseenter', function () {
        document.querySelectorAll('.message-item.touch-show').forEach(el => {
            if (el !== msgItem) el.classList.remove('touch-show');
        });
    });

    return msgItem;
}

/* 表情包大图预览 */

/** 打开表情包大图预览 */
function openImagePreview(src) {
    const modal = document.getElementById('imgPreviewModal');
    const img = document.getElementById('imgPreviewImg');
    if (!modal || !img) return;
    img.src = src;
    modal.classList.remove('hidden');
}

/** 关闭表情包大图预览 */
function closeImagePreview() {
    const modal = document.getElementById('imgPreviewModal');
    if (modal) modal.classList.add('hidden');
}

/* 预览弹窗事件绑定（点击遮罩/关闭按钮/ESC 关闭） */
(function bindImagePreviewEvents() {
    const modal = document.getElementById('imgPreviewModal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeImagePreview();
    });
    const closeBtn = document.getElementById('imgPreviewCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeImagePreview();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeImagePreview();
        }
    });
})();

/** 判断用户当前是否在消息区底部附近（新消息到达时是否自动跟随滚动） */
function isNearBottom() {
    if (!msg_area) return true;
    // 与 handleScroll 中“回到底部”按钮的阈值保持一致：距底部不足一个可视区高度的 80% 视为在底部
    const threshold = msg_area.clientHeight * 0.8;
    return msg_area.scrollHeight - msg_area.scrollTop - msg_area.clientHeight < threshold;
}

/** 添加单条消息到 DOM（发送新消息时使用；日期分隔线按“跨天”增量判断，不动已有分隔线） */
function addMessageDOM(msgData) {
    const msgItem = createMessageElement(msgData);
    if (!msg_area) return;
    msg_area.appendChild(msgItem);

    // 增量生成日期分隔线：新消息加在列表末尾，只判断它与“上一条消息”是否跨天——
    // 跨天/是第一条 → 在它前面插入日期标签；同一天 → 不加。
    // 已有分隔线一个都不动，因此翻历史时收到新消息，视口内的分隔线不会被搬走
    let prevItem = msgItem.previousElementSibling;
    while (prevItem && !prevItem.classList.contains('message-item')) {
        prevItem = prevItem.previousElementSibling;
    }
    const prevTs = prevItem ? Number(prevItem.dataset.timestamp) || 0 : 0;
    const ts = Number(msgData.timestamp) || 0;
    if (!prevItem || !isSameDay(prevTs, ts)) {
        const separator = createDateSeparator(ts);
        msg_area.insertBefore(separator, msgItem);
    }

    const scrollBtn = document.getElementById('scrollToBottomBtn');

    // 自己发的消息：始终滚到底部，让用户看到刚发的消息；
    // 对方回复：只有用户本来就在底部附近时才跟随滚动；
    // 用户正在翻历史时绝不打扰滚动位置，只显示“回到底部”按钮
    if (msgData.type === 'self' || isNearBottom()) {
        msg_area.scrollTop = msg_area.scrollHeight;
        if (scrollBtn) {
            scrollBtn.classList.remove('show');
        }
    } else if (scrollBtn) {
        scrollBtn.classList.add('show');
    }
}

/* 隐藏操作按钮 */

/** 隐藏所有消息的操作按钮（引用/删除） */
function hideAllMessageActions() {
    document.querySelectorAll('.message-item.touch-show').forEach(el => {
        el.classList.remove('touch-show');
    });
    document.querySelectorAll('.message-actions.visible').forEach(el => {
        el.classList.remove('visible');
    });
}

/* 删除消息 */

/**
 * 渲染清空 DOM 后恢复滚动位置（删除消息等场景用）
 * 优先用“第一个可见消息 + 相对视口偏移”精确定位，找不到时用高度差兑底；
 * 同步执行：渲染完成后必须立即调用（同一任务内），避免浏览器渲染中间帧造成闪烁
 * @param {number} oldScrollTop - 渲染前的 scrollTop
 * @param {number} oldScrollHeight - 渲染前的 scrollHeight
 * @param {object|null} anchor - 渲染前记录的锚点 { id, relTop }（relTop = 元素 offsetTop - scrollTop）
 */
function restoreScrollPositionAfterRender(oldScrollTop, oldScrollHeight, anchor) {
    if (!msg_area) return;

    const prevBehavior = msg_area.style.scrollBehavior;
    msg_area.style.scrollBehavior = 'auto';

    if (anchor) {
        const target = msg_area.querySelector('.message-item[data-id="' + anchor.id + '"]');
        if (target) {
            // 让锚点消息保持在渲染前相同的视口位置
            msg_area.scrollTop = target.offsetTop - anchor.relTop;
            msg_area.style.scrollBehavior = prevBehavior;
            return;
        }
    }

    // 锚点不可用（如正好删掉了锚点消息），用高度差恢复
    const newScrollHeight = msg_area.scrollHeight;
    const heightDiff = newScrollHeight - oldScrollHeight;
    msg_area.scrollTop = oldScrollTop + heightDiff;

    msg_area.style.scrollBehavior = prevBehavior;
}

/** 删除消息（弹确认框，删除后刷新引用缓存并更新引用显示） */
async function deleteMessage(id) {
    showConfirmModal('确认操作', '确定要删除这条消息吗？',
        async function () {
            // 群聊模式用群聊 storage id，单人模式用当前联系人 id
            let contactId = null;
            if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
                contactId = getCurrentGroupStorageId();
            }
            if (!contactId) {
                contactId = await getCurrentContactId();
            }
            if (!contactId) return;

            // 渲染前记录滚动位置与第一个可见消息（渲染清空 DOM 后用于恢复）
            const oldScrollTop = msg_area ? msg_area.scrollTop : 0;
            const oldScrollHeight = msg_area ? msg_area.scrollHeight : 0;
            let anchor = null;
            if (msg_area) {
                const items = msg_area.querySelectorAll('.message-item');
                for (const el of items) {
                    // 第一条底部仍在视口内的消息，作为锚点（其下方被删消息会导致高度变化）
                    if (el.offsetTop + el.offsetHeight > msg_area.scrollTop) {
                        anchor = { id: el.dataset.id, relTop: el.offsetTop - msg_area.scrollTop };
                        break;
                    }
                }
            }

            const fullMessages = await loadMessages(contactId);
            const index = fullMessages.findIndex(m => m.id === id);
            if (index !== -1) {
                fullMessages.splice(index, 1);
                await saveMessages(contactId, fullMessages);
                allMessages = fullMessages;
                await renderMessages();
                // 渲染后立即同步恢复位置（不插 await），避免浏览器渲染中间帧
                restoreScrollPositionAfterRender(oldScrollTop, oldScrollHeight, anchor);
                await refreshQuotedCache();
                updateQuotedMessages();
                showToast('消息已删除');
                hideAllMessageActions();
            }
        }
    );
}

/** 更新所有引用块的显示（删除消息后将被引用消息标为已删除） */
function updateQuotedMessages() {
    document.querySelectorAll('.message-quote').forEach(function (q) {
        const parent = q.closest('.message-item');
        if (!parent) return;
        const msgId = parent.dataset.id;
        const msg = allMessages.find(m => m.id === msgId);
        if (!msg || !msg.quoted) return;
        const isDeleted = quotedExistsCache[msg.quoted.id] === false;
        const contentSpan = q.querySelector('.quote-content');
        if (contentSpan) {
            if (isDeleted) {
                contentSpan.textContent = '消息已被删除';
                contentSpan.className = 'quote-content quote-deleted';
            } else {
                const sender = msg.quoted.sender || '对方';
                contentSpan.innerHTML = `<span class="quote-sender">${sender}：</span>${msg.quoted.content}`;
                contentSpan.className = 'quote-content';
            }
        }
    });
}

/* 长按检测 */

let longPressTimer = null;
let longPressTarget = null;

/** 长按消息 500ms 显示操作按钮（移动端） */
function setupLongPress(element, messageId) {
    element.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        longPressTarget = { element: element, id: messageId };
        longPressTimer = setTimeout(function () {
            document.querySelectorAll('.message-item.touch-show').forEach(el => {
                if (el !== element) el.classList.remove('touch-show');
            });
            element.classList.add('touch-show');
            if (navigator.vibrate) navigator.vibrate(20);
            longPressTarget = null;
        }, 500);
    }, { passive: true });

    element.addEventListener('touchmove', function () {
        clearTimeout(longPressTimer);
        longPressTarget = null;
    }, { passive: true });

    element.addEventListener('touchend', function () {
        clearTimeout(longPressTimer);
        longPressTarget = null;
    }, { passive: true });

    element.addEventListener('touchcancel', function () {
        clearTimeout(longPressTimer);
        longPressTarget = null;
    }, { passive: true });
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.message-item')) {
        hideAllMessageActions();
    }
});

/* 模拟对方回复 */

// 单聊回复锁：锁定期内（设置 messageInteraction.replyLockSeconds，默认 10 秒，可调 1~60 秒）用户连发的消息只回一次
let singleReplyInProgress = false;  // 锁状态：true 时丢弃新消息，不排队（与群聊一致）
let singleReplyLockTimer = null;    // 解锁定时器句柄
let singleReplyToken = 0;           // 每轮回复递增的令牌

// 单聊进行中的“正在输入”状态：按联系人 id 分别保存
// （切换联系人只隐藏不丢失，切回时若还没回完则重新出现，回复发完才删除）
// 每条目 { name, avatar, token }：token 用于防止同联系人旧轮收尾误删新轮的 typing
let singleTypingMap = {};   // { [contactId]: { name, avatar, token } }

/** 渲染单聊样式的“正在输入”指示器（头像 + 名字 + 正在输入） */
function renderSingleTyping(info) {
    if (!msg_typingIndicator) return;
    const typingAvatarEl = msg_typingIndicator.querySelector('.typing-avatar');
    if (typingAvatarEl) {
        typingAvatarEl.innerHTML = '<span class="avatar-item">' + (info.avatar ? '<img src="' + info.avatar + '">' : defaultAvatarSVG) + '</span>';
    }
    const typingNameEl = document.getElementById('typingName');
    if (typingNameEl) {
        typingNameEl.style.display = '';
        typingNameEl.textContent = info.name || '';
    }
    const typingTextEl = document.getElementById('typingText');
    if (typingTextEl) typingTextEl.textContent = '正在输入';
    msg_typingIndicator.classList.add('show');
}

/**
 * 统一调度“正在输入”指示器：只显示当前聊天界面的输入方。
 * 切换界面时输入框隐藏，但 pending 状态保留（singleTypingMap / groupTypingMembers 不清），
 * 切回原界面时若还没回完，输入框重新出现；回复发完后状态才清空。
 */
function syncTypingIndicator() {
    const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
    if (!inGroup) {
        // 单聊界面：只显示当前联系人的输入提示（每个联系人的 pending 状态独立保存）
        const currentId = (typeof window.getCurrentContactIdSync === 'function') ? window.getCurrentContactIdSync() : null;
        const info = currentId != null ? singleTypingMap[currentId] : null;
        if (info) {
            renderSingleTyping(info);
        } else if (msg_typingIndicator) {
            msg_typingIndicator.classList.remove('show');
        }
    } else {
        // 群聊界面：只显示群聊成员的输入提示
        if (groupTypingMembers.length > 0) {
            renderTypingIndicator(groupTypingMembers);
        } else if (msg_typingIndicator) {
            msg_typingIndicator.classList.remove('show');
        }
    }
}
window.syncTypingIndicator = syncTypingIndicator;

/**
 * 删除联系人时清理其残留的“正在输入”状态：
 * - 单聊 pending（singleTypingMap[contactId]）
 * - 群聊成员列表（groupTypingMembers 中该成员——删除后它不再属于任何群聊）
 * 删除的是当前联系人时由后续 switchContact 再刷新一次，其余情况这里直接刷新显示。
 */
function cleanupTypingForContact(contactId) {
    if (singleTypingMap && singleTypingMap[contactId]) {
        delete singleTypingMap[contactId];
    }
    if (groupTypingMembers && groupTypingMembers.length) {
        groupTypingMembers = groupTypingMembers.filter(function (m) { return m.id !== contactId; });
    }
    if (typeof syncTypingIndicator === 'function') syncTypingIndicator();
}
window.cleanupTypingForContact = cleanupTypingForContact;

/** 重置单聊回复锁状态（切换联系人 / 进入或退出群聊时调用） */
function resetSingleReplyState() {
    singleReplyInProgress = false;
    if (singleReplyLockTimer) {
        clearTimeout(singleReplyLockTimer);
        singleReplyLockTimer = null;
    }
    // 不清 token / 不隐藏“正在输入”：切换聊天后未回完的回复仍在排队，
    // 提示框由 syncTypingIndicator 统一调度，回复发完后旧轮收尾会自行清理
}
window.resetSingleReplyState = resetSingleReplyState;

/** 模拟对方回复：读取字卡/表情，随机延迟逐条发送；锁定期内连发只回一次 */
async function simulateReply() {
    // 群聊模式：所有成员各自用自己的字卡库回复
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        simulateGroupReply();
        return;
    }

    const settings = await getSettings();
    const scope = settings.single;
    const readNoReply = scope.messageInteraction.readNoReply || false;
    const readNoReplyRate = scope.messageInteraction.readNoReplyRate || 10;

    if (readNoReply && Math.random() * 100 < readNoReplyRate) {
        return;
    }

    // 回复锁：锁定期内直接丢弃新消息，不排队
    if (singleReplyInProgress) return;
    singleReplyInProgress = true;

    // 本轮回复令牌：新一轮开始后，旧轮的收尾不允许删除新轮的 typing 条目
    const myToken = ++singleReplyToken;

    const contact = await getCurrentContact();
    if (!contact) {
        singleReplyInProgress = false;
        return;
    }

    // 记录本轮回复所属的单聊联系人，发送前校验会话未变
    // （防止排队中的延迟回复在用户切到群聊/其他联系人后仍发送，导致消息串台）
    const replyContactId = contact.id;

    // 校验当前是否仍在同一单聊会话中
    function stillInSingleChat() {
        if (typeof isGroupChatMode === 'function' && isGroupChatMode()) return false;
        if (typeof window.getCurrentContactIdSync === 'function') {
            return window.getCurrentContactIdSync() === replyContactId;
        }
        return true;
    }

    const globalData = await getGlobalCardData();
    const contactData = await getCardData(contact.id);

    let allTextCards = [];

    if (globalData && globalData.text && Array.isArray(globalData.text.cards)) {
        const globalGroups = normalizeGroups(globalData.text.groups || []);
        const blockedGlobalGroups = globalGroups.filter(function (g) { return g.blocked === true; }).map(function (g) { return g.name; });
        const globalCards = globalData.text.cards.filter(function (card) {
            return card.blocked !== true && !blockedGlobalGroups.includes(card.group);
        });
        allTextCards = allTextCards.concat(globalCards);
    }

    if (contactData && contactData.text && Array.isArray(contactData.text.cards)) {
        const contactGroups = normalizeGroups(contactData.text.groups || []);
        const blockedContactGroups = contactGroups.filter(function (g) { return g.blocked === true; }).map(function (g) { return g.name; });
        const contactCards = contactData.text.cards.filter(function (card) {
            return card.blocked !== true && !blockedContactGroups.includes(card.group);
        });
        allTextCards = allTextCards.concat(contactCards);
    }

    if (allTextCards.length === 0) {
        showToast('当前联系人暂无可用字卡，请前往 <span class="toast-link" id="toastToCard">字卡库</span> 添加');
        singleReplyInProgress = false;
        return;
    }

    let allStickers = [];
    if (globalData && globalData.sticker && Array.isArray(globalData.sticker.cards)) {
        allStickers = allStickers.concat(globalData.sticker.cards.filter(function (c) { return c.blocked !== true; }));
    }
    if (contactData && contactData.sticker && Array.isArray(contactData.sticker.cards)) {
        allStickers = allStickers.concat(contactData.sticker.cards.filter(function (c) { return c.blocked !== true; }));
    }

    let allEmojis = [];
    if (globalData && globalData.emoji && Array.isArray(globalData.emoji.cards)) {
        allEmojis = allEmojis.concat(globalData.emoji.cards.filter(function (c) { return c.blocked !== true; }));
    }
    if (contactData && contactData.emoji && Array.isArray(contactData.emoji.cards)) {
        allEmojis = allEmojis.concat(contactData.emoji.cards.filter(function (c) { return c.blocked !== true; }));
    }

    const minWait = scope.replySpeed.minWait || 3;
    const maxWait = scope.replySpeed.maxWait || 1;
    const minCount = scope.replyCount.min || 1;
    const maxCount = scope.replyCount.max || 3;
    const combineCards = scope.replyContent.combineCards || false;
    const combineMin = scope.replyContent.combineMin || 2;
    const combineMax = scope.replyContent.combineMax || 4;
    const mixSticker = scope.replyContent.mixSticker || false;
    const mixEmoji = scope.replyContent.mixEmoji || false;
    const quoteReply = scope.messageInteraction.quoteReply || false;
    const quoteRate = scope.messageInteraction.quoteRate || 30;

    const delayMs = (minWait + Math.random() * (maxWait * 60 - minWait)) * 1000;
    const replyCount = Math.floor(minCount + Math.random() * (maxCount - minCount + 1));

    // 记录单聊“正在输入”状态：切换聊天后提示框保留（由 syncTypingIndicator 统一调度显示）
    const partnerAvatar = await getPartnerAvatar();
    const contactName = await getCurrentContactName();
    singleTypingMap[replyContactId] = { name: contactName || '', avatar: partnerAvatar || null, token: myToken };
    syncTypingIndicator();

    function sendNext(remaining) {
        if (remaining <= 0) {
            if (singleTypingMap[replyContactId] && singleTypingMap[replyContactId].token === myToken) {
                delete singleTypingMap[replyContactId];
                syncTypingIndicator();
            }
            return;
        }

        // 用户已切换到群聊或其他联系人：消息仍保存到原联系人的消息库（回来看得到），但不渲染到当前界面；
        // “正在输入”提示保留到本轮回复全部发完（由收尾清理），不因切换而消失
        const inChat = stillInSingleChat();

        let textContent = '';

        if (combineCards && allTextCards.length > 1) {
            let count = Math.floor(combineMin + Math.random() * (combineMax - combineMin + 1));
            if (count > allTextCards.length) count = allTextCards.length;
            const shuffled = [...allTextCards].sort(function () { return Math.random() - 0.5; });
            const selected = shuffled.slice(0, count);
            textContent = selected.map(function (c) { return c.text; }).join('，');
        } else {
            const randomIndex = Math.floor(Math.random() * allTextCards.length);
            textContent = allTextCards[randomIndex].text || '……';
        }

        let quotedData = null;
        if (inChat && quoteReply && Math.random() * 100 < quoteRate) {
            const userMessages = allMessages.filter(function (msg) { return msg.type === 'self'; }).slice(-10);
            if (userMessages.length > 0) {
                const randomMsg = userMessages[Math.floor(Math.random() * userMessages.length)];
                const senderName = '我';
                let contentDisplay = randomMsg.isImage ? '[图片]' : randomMsg.content;
                quotedData = { id: randomMsg.id, content: contentDisplay, sender: senderName };
            }
        }

        if (mixEmoji && allEmojis.length > 0 && Math.random() < 0.2) {
            const emoji = allEmojis[Math.floor(Math.random() * allEmojis.length)].emoji;
            if (Math.random() > 0.5) {
                textContent = emoji + textContent;
            } else {
                textContent = textContent + emoji;
            }
        }

        sendSingleReply(textContent, false, quotedData);

        let stickerDelay = 0;
        if (mixSticker && allStickers.length > 0 && Math.random() < 0.2) {
            stickerDelay = 500 + Math.random() * 1000;
            setTimeout(function () {
                const sticker = allStickers[Math.floor(Math.random() * allStickers.length)];
                sendSingleReply(sticker.dataUrl, true, null);
            }, stickerDelay);
        }

        if (remaining > 1) {
            const nextDelay = 1000 + Math.random() * 1000 + stickerDelay;
            setTimeout(function () { sendNext(remaining - 1); }, nextDelay);
        } else {
            const finalDelay = 300 + stickerDelay;
            setTimeout(function () {
                if (singleTypingMap[replyContactId] && singleTypingMap[replyContactId].token === myToken) {
                    delete singleTypingMap[replyContactId];
                    syncTypingIndicator();
                }
            }, finalDelay);
        }
    }

    // 发送单聊回复：仍在单聊会话中则正常渲染；用户已切走则仅保存到原联系人消息库（回来看得到）
    function sendSingleReply(content, isImage, quoted) {
        if (stillInSingleChat()) {
            addMessage('other', content, isImage, quoted);
            return;
        }
        // 用户已切走：消息保存到原联系人消息库（回来看得到），不渲染到当前界面
        persistMessageToContact({
            id: generateMessageId(),
            type: 'other',
            content: content,
            timestamp: Date.now(),
            quoted: quoted || null,
            isImage: !!isImage
        }, replyContactId);
    }

    // 锁从触发时刻开始计时，到时自动解锁（锁定期内新消息全部丢弃）
    const replyLockSeconds = scope.messageInteraction.replyLockSeconds || 10;
    singleReplyLockTimer = setTimeout(function () {
        singleReplyInProgress = false;
        singleReplyLockTimer = null;
    }, replyLockSeconds * 1000);

    setTimeout(function () {
        if (replyCount <= 0) {
            if (singleTypingMap[replyContactId] && singleTypingMap[replyContactId].token === myToken) {
                delete singleTypingMap[replyContactId];
                syncTypingIndicator();
            }
            return;
        }
        sendNext(replyCount);
    }, delayMs);
}

/* 群聊回复：所有成员各自用自己的字卡库回复 */

let groupReplyInProgress = false; // 防止群聊回复并发混乱
let groupTypingMembers = [];      // 正在“输入中”的成员列表 [{id, name, avatar}]

/** 重置群聊回复锁状态（进入/退出群聊时调用） */
function resetGroupReplyState() {
    groupReplyInProgress = false;
    // 不清 groupTypingMembers / 不隐藏“正在输入”：切换聊天后未回完的群聊回复仍在排队，
    // 提示框由 syncTypingIndicator 统一调度，成员回复发完后会自行移除
}
window.resetGroupReplyState = resetGroupReplyState;

/** 渲染“正在输入”胶囊：单人显示名字，多人堆叠头像并显示人数 */
function renderTypingIndicator(members) {
    if (!msg_typingIndicator) return;

    if (!members || members.length === 0) {
        msg_typingIndicator.classList.remove('show');
        return;
    }

    // 头像堆叠（显示所有正在输入的成员，后面的盖住前面的）
    const avatarEl = msg_typingIndicator.querySelector('.typing-avatar');
    if (avatarEl) {
        const shown = members;
        avatarEl.innerHTML = shown.map(function (m) {
            const inner = m.avatar ? '<img src="' + m.avatar + '">' : defaultAvatarSVG;
            return '<span class="avatar-item">' + inner + '</span>';
        }).join('');
    }

    const nameEl = document.getElementById('typingName');
    const textEl = document.getElementById('typingText');
    if (members.length === 1) {
        if (nameEl) {
            nameEl.style.display = '';
            nameEl.textContent = members[0].name || '';
        }
        if (textEl) textEl.textContent = '正在输入';
    } else {
        if (nameEl) nameEl.style.display = 'none';
        if (textEl) textEl.textContent = members.length + ' 人正在输入';
    }
    msg_typingIndicator.classList.add('show');
}

/** 群聊：某个成员开始输入 */
function addGroupTypingMember(member) {
    if (!groupTypingMembers.some(function (m) { return m.id === member.id; })) {
        groupTypingMembers.push({ id: member.id, name: member.name, avatar: member.avatar });
    }
    syncTypingIndicator();
}

/** 群聊：某个成员结束输入 */
function removeGroupTypingMember(memberId) {
    groupTypingMembers = groupTypingMembers.filter(function (m) { return m.id !== memberId; });
    syncTypingIndicator();
}

/** 模拟群聊：遍历所有成员，每个成员用「通用字卡库 + 自己的专属字卡库」随机延迟回复 */
async function simulateGroupReply() {
    const settings = await getSettings();
    const scope = settings.group;
    const readNoReply = scope.messageInteraction.readNoReply || false;
    const readNoReplyRate = scope.messageInteraction.readNoReplyRate || 10;

    if (readNoReply && Math.random() * 100 < readNoReplyRate) {
        return;
    }

    if (groupReplyInProgress) return;
    groupReplyInProgress = true;

    // 记录本次回复所属的群聊，回复执行前校验用户仍在该群聊中
    const replyGroupStorageId = getCurrentGroupStorageId();
    const members = await getCurrentGroupMembers();
    if (members.length === 0) {
        groupReplyInProgress = false;
        return;
    }

    const minWait = scope.replySpeed.minWait || 3;
    const maxWait = scope.replySpeed.maxWait || 1;
    const minCount = scope.replyCount.min || 1;
    const maxCount = scope.replyCount.max || 3;
    const combineCards = scope.replyContent.combineCards || false;
    const combineMin = scope.replyContent.combineMin || 2;
    const combineMax = scope.replyContent.combineMax || 4;
    const mixSticker = scope.replyContent.mixSticker || false;
    const mixEmoji = scope.replyContent.mixEmoji || false;

    // 每个成员独立读取自己的字卡库并安排回复
    members.forEach(function (member) {
        (async function () {
            try {
                const globalData = await getGlobalCardData();
                const contactData = await getCardData(member.id);

                let allTextCards = [];

                if (globalData && globalData.text && Array.isArray(globalData.text.cards)) {
                    const globalGroups = normalizeGroups(globalData.text.groups || []);
                    const blockedGlobalGroups = globalGroups.filter(function (g) { return g.blocked === true; }).map(function (g) { return g.name; });
                    const globalCards = globalData.text.cards.filter(function (card) {
                        return card.blocked !== true && !blockedGlobalGroups.includes(card.group);
                    });
                    allTextCards = allTextCards.concat(globalCards);
                }

                if (contactData && contactData.text && Array.isArray(contactData.text.cards)) {
                    const contactGroups = normalizeGroups(contactData.text.groups || []);
                    const blockedContactGroups = contactGroups.filter(function (g) { return g.blocked === true; }).map(function (g) { return g.name; });
                    const contactCards = contactData.text.cards.filter(function (card) {
                        return card.blocked !== true && !blockedContactGroups.includes(card.group);
                    });
                    allTextCards = allTextCards.concat(contactCards);
                }

                if (allTextCards.length === 0) return; // 该成员没有可用字卡，跳过

                // 与单聊一致：该成员确认会回复后，立即进入“正在输入”状态（发完消息马上显示胶囊）
                addGroupTypingMember(member);

                let allStickers = [];
                if (globalData && globalData.sticker && Array.isArray(globalData.sticker.cards)) {
                    allStickers = allStickers.concat(globalData.sticker.cards.filter(function (c) { return c.blocked !== true; }));
                }
                if (contactData && contactData.sticker && Array.isArray(contactData.sticker.cards)) {
                    allStickers = allStickers.concat(contactData.sticker.cards.filter(function (c) { return c.blocked !== true; }));
                }

                let allEmojis = [];
                if (globalData && globalData.emoji && Array.isArray(globalData.emoji.cards)) {
                    allEmojis = allEmojis.concat(globalData.emoji.cards.filter(function (c) { return c.blocked !== true; }));
                }
                if (contactData && contactData.emoji && Array.isArray(contactData.emoji.cards)) {
                    allEmojis = allEmojis.concat(contactData.emoji.cards.filter(function (c) { return c.blocked !== true; }));
                }

                const delayMs = (minWait + Math.random() * (maxWait * 60 - minWait)) * 1000 + Math.random() * 2000;
                const replyCount = Math.floor(minCount + Math.random() * (maxCount - minCount + 1));
                const quoteReply = scope.messageInteraction.quoteReply || false;
                const quoteRate = scope.messageInteraction.quoteRate || 30;

                setTimeout(function () {
                    (async function () {
                        // 用户是否仍在该群聊中（渲染到群聊界面）
                        const stillInGroup = isGroupChatMode() && getCurrentGroupStorageId() === replyGroupStorageId;

                        // 群聊回复发送：仍在原群聊则正常渲染；用户已切走则仅保存到原群聊消息库（回来看得到，不污染当前界面）
                        function sendGroupReply(content, isImage, quoted) {
                            if (isGroupChatMode() && getCurrentGroupStorageId() === replyGroupStorageId) {
                                addMessage('other', content, isImage, quoted, member.id, member.name);
                            } else {
                                persistMessageToContact({
                                    id: generateMessageId(),
                                    type: 'other',
                                    content: content,
                                    timestamp: Date.now(),
                                    quoted: quoted || null,
                                    isImage: !!isImage,
                                    senderId: member.id,
                                    senderName: member.name
                                }, replyGroupStorageId);
                            }
                        }

                        if (stillInGroup) {
                            // 模拟“正在输入”：先打 1.2~2 秒的字再发第一条消息，让胶囊可见
                            await new Promise(function (resolve) {
                                setTimeout(resolve, 1200 + Math.random() * 800);
                            });
                        }

                        for (let i = 0; i < replyCount; i++) {
                            let textContent = '';

                            if (combineCards && allTextCards.length > 1) {
                                let count = Math.floor(combineMin + Math.random() * (combineMax - combineMin + 1));
                                if (count > allTextCards.length) count = allTextCards.length;
                                const shuffled = [...allTextCards].sort(function () { return Math.random() - 0.5; });
                                const selected = shuffled.slice(0, count);
                                textContent = selected.map(function (c) { return c.text; }).join('，');
                            } else {
                                const randomIndex = Math.floor(Math.random() * allTextCards.length);
                                textContent = allTextCards[randomIndex].text || '……';
                            }

                            // 群聊引用：只引用用户自己发的消息（近 10 条）；已切走时不生成（避免引用错当前界面的消息）
                            let quotedData = null;
                            if (stillInGroup && quoteReply && Math.random() * 100 < quoteRate) {
                                const userMessages = allMessages.filter(function (msg) { return msg.type === 'self'; }).slice(-10);
                                if (userMessages.length > 0) {
                                    const randomMsg = userMessages[Math.floor(Math.random() * userMessages.length)];
                                    const contentDisplay = randomMsg.isImage ? '[图片]' : randomMsg.content;
                                    quotedData = { id: randomMsg.id, content: contentDisplay, sender: '我' };
                                }
                            }

                            if (mixEmoji && allEmojis.length > 0 && Math.random() < 0.2) {
                                const emoji = allEmojis[Math.floor(Math.random() * allEmojis.length)].emoji;
                                if (Math.random() > 0.5) {
                                    textContent = emoji + textContent;
                                } else {
                                    textContent = textContent + emoji;
                                }
                            }

                            // 群聊回复：带发送者信息（渲染或保存到原群聊）
                            sendGroupReply(textContent, false, quotedData);

                            // 表情包（贴纸）回复
                            let stickerDelay = 0;
                            if (mixSticker && allStickers.length > 0 && Math.random() < 0.2) {
                                stickerDelay = 500 + Math.random() * 1000;
                                setTimeout(function () {
                                    const sticker = allStickers[Math.floor(Math.random() * allStickers.length)];
                                    sendGroupReply(sticker.dataUrl, true, null);
                                }, stickerDelay);
                            }

                            if (i < replyCount - 1) {
                                await new Promise(function (resolve) {
                                    setTimeout(resolve, 1000 + Math.random() * 1000 + stickerDelay);
                                });
                            }
                        }

                        // 该成员回复完毕：延迟片刻再移除（“正在输入”提示此时才消失）
                        await new Promise(function (resolve) {
                            setTimeout(resolve, 800 + Math.random() * 400);
                        });
                        removeGroupTypingMember(member.id);
                    })();
                }, delayMs);
            } catch (e) {
                console.error('群聊回复失败:', e);
            }
        })();
    });

    // 全部回复安排完毕后释放锁（锁定期结束后允许用户再次发消息触发新一轮回复）
    const groupReplyLockSeconds = scope.messageInteraction.replyLockSeconds || 10;
    setTimeout(function () {
        groupReplyInProgress = false;
    }, groupReplyLockSeconds * 1000);
}

window.resetAutoSendTimer = function () {
    lastAutoSendTime = Date.now();
};

/* 表情选择面板 */

/** 打开/关闭表情选择面板 */
function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (!picker) return;
    const isOpen = picker.classList.contains('open');
    if (isOpen) {
        picker.classList.remove('open');
        closeEmojiPickerDropdown();
    } else {
        picker.classList.add('open');
        renderEmojiPickerGrid();
        (async function () {
            await updateEmojiPickerSwitchLabel(await getCurrentCardLib());
        })();
    }
}

/** 关闭表情选择面板 */
function closeEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.remove('open');
    closeEmojiPickerDropdown();
}

/** 渲染表情选择面板的网格（图片懒加载） */
async function renderEmojiPickerGrid() {
    const grid = document.getElementById('emojiPickerGrid');
    if (!grid) return;

    const cardData = await getCurrentCardData();
    if (!cardData) {
        grid.innerHTML = '<div class="sticker-empty">请先创建联系人</div>';
        return;
    }

    const stickers = cardData.sticker?.cards || [];
    if (stickers.length === 0) {
        grid.innerHTML = `
            <div class="sticker-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <circle cx="15.5" cy="8.5" r="1.5" />
                    <path d="M8 15s1.5 2 4 2 4-2 4-2" />
                </svg>
                <div class="empty-text">还没有表情包</div>
                <div class="empty-hint">请前往字卡库添加</div>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    stickers.forEach(function (sticker) {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        const img = document.createElement('img');
        img.src = sticker.dataUrl;
        img.alt = sticker.name || '表情包';
        img.loading = 'lazy';  // 懒加载
        item.appendChild(img);

        item.addEventListener('click', function () {
            sendStickerFromPicker(sticker.dataUrl);
        });

        grid.appendChild(item);
    });
}

/** 从表情面板发送表情包（存为图片消息） */
function sendStickerFromPicker(dataUrl) {
    const msgData = {
        id: generateMessageId(),
        type: 'self',
        content: dataUrl,
        timestamp: Date.now(),
        isImage: true,
        quoted: null
    };

    // 群聊模式：标记发送者为“我”（与 sendMessage 保持一致，否则消息会被当作单聊消息渲染）
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        msgData.senderId = 'me';
        msgData.senderName = '我';
    }

    persistMessage(msgData);
    addMessageDOM(msgData); // addMessageDOM 内部已处理“自己发消息始终滚到底部”
    playSound('send');
    simulateReply();
}

/* 表情面板字卡库切换下拉（复用通用下拉工厂 createLibDropdown） */

/** 表情面板字卡库切换下拉实例 */
const emojiLibDropdown = createLibDropdown({
    dropdownId: 'emojiPickerDropdown',
    listId: 'emojiPickerDropdownList',
    switchBtnId: 'emojiPickerSwitch',
    labelId: 'emojiPickerSwitchLabel',
    itemClass: 'emoji-picker-dropdown-item',
    dividerStyle: 'height:1px; background:rgba(var(--primary-rgb),0.12); margin:4px 12px;',
    onPick: async function (newLib) {
        await saveCurrentCardLib(newLib);
        await updateEmojiPickerSwitchLabel(newLib);
        await renderEmojiPickerGrid();
        if (typeof updateManageGroupLibLabel === 'function') {
            await updateManageGroupLibLabel(newLib);
        }
    }
});

/** 渲染表情面板字卡库切换下拉 */
function renderEmojiPickerDropdown() {
    emojiLibDropdown.render();
}

/** 更新切换按钮上的字卡库名称 */
async function updateEmojiPickerSwitchLabel(libKey) {
    await emojiLibDropdown.updateLabel(libKey);
}

/** 打开/关闭字卡库切换下拉 */
function toggleEmojiPickerDropdown() {
    emojiLibDropdown.toggle();
}

/** 关闭字卡库切换下拉 */
function closeEmojiPickerDropdown() {
    emojiLibDropdown.close();
}

document.addEventListener('click', function (e) {
    const picker = document.getElementById('emojiPicker');
    const btn = document.getElementById('emojiBtn');
    if (!picker || !btn) return;
    if (!picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeEmojiPicker();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeEmojiPicker();
    }
});

/* 初始化 */

/** 初始化消息模块（绑定输入框自动调整高度、回到底部按钮等） */
function initMessageModule(area, input, indicator) {
    msg_area = area;
    msg_input = input;
    msg_typingIndicator = indicator;
    allMessages = [];
    quotedMessage = null;
    quotedExistsCache = {};
    resetMessageState();
    startAutoSendTimer();

    // 自动调整 textarea 高度
    function autoResizeTextarea() {
        if (!msg_input) return;
        msg_input.style.height = 'auto';
        msg_input.style.height = msg_input.scrollHeight + 'px';
        if (msg_input.scrollHeight > 120) {
            msg_input.style.overflowY = 'auto';
        } else {
            msg_input.style.overflowY = 'hidden';
        }
    }

    msg_input.addEventListener('input', autoResizeTextarea);

    // 监听输入框内容变化，控制右下角快捷键提示的显示/隐藏
    const inputHint = document.getElementById('inputHint');
    if (inputHint) {
        msg_input.addEventListener('input', function () {
            if (this.value.trim().length > 0) {
                inputHint.classList.add('hidden');
            } else {
                inputHint.classList.remove('hidden');
            }
        });
        // 初始化状态
        if (msg_input.value.trim().length === 0) {
            inputHint.classList.remove('hidden');
        } else {
            inputHint.classList.add('hidden');
        }
    }

    // 页面加载完成后执行一次，确保初始高度正确
    setTimeout(autoResizeTextarea, 50);

    // 缓存“回到底部”按钮（供滚动事件复用）
    scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    if (scrollToBottomBtn) {
        scrollToBottomBtn.addEventListener('click', function () {
            if (!msg_area) return;
            msg_area.scrollTo({
                top: msg_area.scrollHeight,
                behavior: 'smooth'
            });
        });
    }
}

/* 暴露函数 */

window.initMessageModule = initMessageModule;
window.sendMessage = sendMessage;
window.loadMessagesForContact = loadMessagesForContact;
window.simulateReply = simulateReply;
window.clearQuote = clearQuote;
window.toggleEmojiPicker = toggleEmojiPicker;
window.toggleEmojiPickerDropdown = toggleEmojiPickerDropdown;
window.closeEmojiPickerDropdown = closeEmojiPickerDropdown;
window.updateEmojiPickerSwitchLabel = updateEmojiPickerSwitchLabel;
window.renderEmojiPickerGrid = renderEmojiPickerGrid;
window.addMessage = addMessage;
window.addMessageDOM = addMessageDOM;
