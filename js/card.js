/**
 * 字卡库模块 card.js —— 字卡库弹窗、分组管理、字卡增删改查、搜索、屏蔽
 * 所有数据操作均为异步（IndexedDB）
 */

/* 状态 */

let cardCurrentTab = 'text';        // 当前标签页：text / sticker / emoji
let cardSelectedGroup = '全部';     // 当前选中的分组
let cardSearchKeyword = '';         // 当前搜索关键字
let isManageMode = false;           // 是否处于批量管理模式（表情包/Emoji）
let selectedItems = [];             // 批量管理中选中的索引列表
let currentManageType = '';         // 当前批量管理的类型：sticker / emoji

/* 管理分组批量模式状态 */

let isManageGroupBatchMode = false; // 是否处于管理分组批量模式
let selectedGroupNames = [];        // 批量模式中选中的分组名列表

/* 分块渲染（大量字卡时避免阻塞 UI） */

let _renderToken = 0;

/**
 * 分块渲染：数据多时分帧插入 DOM，弹窗打开不卡顿
 * @param {HTMLElement} container 目标容器
 * @param {Array} items 数据数组
 * @param {Function} createFn (item, index) => HTMLElement
 * @returns {Promise} 渲染完成时 resolve
 */
function renderChunked(container, items, createFn) {
    _renderToken++;
    const token = _renderToken;
    return new Promise(function (resolve) {
        if (!container) { resolve(); return; }
        if (items.length <= 200) {
            // 少量：一次性批量插入
            const fragment = document.createDocumentFragment();
            items.forEach(function (item, i) {
                const el = createFn(item, i);
                if (el && el.nodeType) fragment.appendChild(el);
            });
            container.innerHTML = '';
            container.appendChild(fragment);
            resolve();
            return;
        }
        // 大量：先显示加载占位，再分帧渲染（每帧 60 个，UI 保持流畅）
        container.innerHTML = '<div class="card-empty">加载中…</div>';
        const CHUNK = 60;
        const fragment = document.createDocumentFragment();
        let i = 0;
        function renderChunk() {
            if (token !== _renderToken) { resolve(); return; } // 已有新渲染，放弃本次
            const end = Math.min(i + CHUNK, items.length);
            for (; i < end; i++) {
                const el = createFn(items[i], i);
                if (el && el.nodeType) fragment.appendChild(el);
            }
            if (i < items.length) {
                requestAnimationFrame(renderChunk);
            } else {
                container.innerHTML = '';
                container.appendChild(fragment);
                resolve();
            }
        }
        requestAnimationFrame(renderChunk);
    });
}

/* 无限滚动（增量渲染）—— 字卡多时列表秒开，滚到接近底部再追加 */

let _cardObserver = null;   // 当前字卡列表的 IntersectionObserver
let _cardLoadToken = 0;     // 加载令牌：渲染被切换时让旧回调失效

const CARD_PAGE_SIZE = 150;    // 首批渲染数量
const CARD_LOAD_BATCH = 100;   // 每次滚动追加的数量

/** 断开无限滚动的 observer 并移除残留哨兵（重渲染/空列表时调用） */
function resetCardIncremental(container) {
    if (_cardObserver) { _cardObserver.disconnect(); _cardObserver = null; }
    if (container) {
        const oldSentinel = container.querySelector('.card-list-sentinel');
        if (oldSentinel) oldSentinel.remove();
    }
}

/**
 * 无限滚动渲染：首批渲染 CARD_PAGE_SIZE 张，滚动接近底部时再追加 CARD_LOAD_BATCH 张
 * @param {HTMLElement} container 目标容器
 * @param {Array} items 全部数据
 * @param {Function} createFn (item, index) => HTMLElement
 * @returns {Promise} 首批渲染完成时 resolve
 */
function renderIncremental(container, items, createFn) {
    // 清理上一次的 observer 与残留哨兵（切换分组/搜索/标签页时会走到这里）
    resetCardIncremental(container);
    _cardLoadToken++;
    const token = _cardLoadToken;
    const total = items.length;

    // 数量不多：直接走原有分块渲染，无需无限滚动
    if (total <= CARD_PAGE_SIZE) {
        return renderChunked(container, items, createFn);
    }

    // 首批：只渲染前 CARD_PAGE_SIZE 张（秒开）
    const first = items.slice(0, CARD_PAGE_SIZE);
    return renderChunked(container, first, createFn).then(function () {
        if (token !== _cardLoadToken) return;             // 已被新渲染取代
        if (container.querySelector('.card-empty')) return; // 内容已被清空/替换

        // 追加底部哨兵，观察它来触发加载更多
        const sentinel = document.createElement('div');
        sentinel.className = 'card-list-sentinel';
        container.appendChild(sentinel);

        let loaded = CARD_PAGE_SIZE;

        const observer = new IntersectionObserver(function (entries) {
            if (token !== _cardLoadToken) { observer.disconnect(); return; }
            if (!entries.some(function (en) { return en.isIntersecting; })) return;

            // 追加下一批到哨兵之前
            const end = Math.min(loaded + CARD_LOAD_BATCH, total);
            const fragment = document.createDocumentFragment();
            for (let i = loaded; i < end; i++) {
                const el = createFn(items[i], i);
                if (el && el.nodeType) fragment.appendChild(el);
            }
            container.insertBefore(fragment, sentinel);
            loaded = end;

            // 全部加载完：断开观察并移除哨兵
            if (loaded >= total) {
                observer.disconnect();
                sentinel.remove();
            }
        }, { root: container, rootMargin: '300px 0px' });

        _cardObserver = observer;
        observer.observe(sentinel);
    });
}

/* 常量 */

const GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
</svg>`;

const BLOCK_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;

const BATCH_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
</svg>`;

/* 打开 / 关闭弹窗 */

// 打开字卡库弹窗：加载当前字卡库、重置筛选并渲染
// 改前：直接移除 hidden 类打开弹窗
// 改后：如果弹窗已经打开，则关闭它（实现点击图标切换开关）
async function openCardModal() {
    const modal = document.getElementById('cardModal');
    if (!modal) return;

    // 如果弹窗当前是显示状态，关闭它并返回
    if (!modal.classList.contains('hidden')) {
        closeCardModal();
        return;
    }

    // 以下是原有的打开逻辑
    modal.classList.remove('hidden');

    let currentLib = await getCurrentCardLib();
    if (currentLib !== 'global') {
        const contactId = parseInt(currentLib.replace('contact_', ''));
        const contact = await getContactById(contactId);
        if (!contact) {
            await saveCurrentCardLib('global');
            currentLib = 'global';
        }
    }

    await updateCardLibSwitchLabel(currentLib);
    cardSelectedGroup = '全部';
    cardSearchKeyword = '';
    const searchInput = document.getElementById('cardSearchInput');
    if (searchInput) searchInput.value = '';

    cardCurrentTab = 'text';
    renderCardTabs();
    await renderCardGroups();
    await renderCardList();
}

/** 关闭字卡库弹窗 */
function closeCardModal() {
    // 管理分组弹窗若还开着（批量模式下直接关字卡库时）一并关闭，内部会退出批量模式
    const mgModal = document.getElementById('manageGroupModal');
    if (mgModal && !mgModal.classList.contains('hidden')) {
        closeManageGroupModal();
    } else if (isManageGroupBatchMode) {
        // 弹窗已关但批量模式残留的边界情况，直接退出
        exitManageBatchMode();
    }
    // 退出表情包/Emoji 批量管理模式（防止 batchDeleteBar 底部操作栏残留）
    if (isManageMode) {
        exitManageMode();
    }
    const modal = document.getElementById('cardModal');
    if (modal) modal.classList.add('hidden');
}

/* 标签页切换 */

/** 切换标签页高亮（文字字卡 / 表情包 / Emoji） */
function renderCardTabs() {
    document.querySelectorAll('.card-tab').forEach(tab =>
        tab.classList.toggle('active', tab.dataset.type === cardCurrentTab));
}

/** 绑定标签页点击事件：切换后重置分组/搜索并重新渲染 */
function bindCardTabs() {
    const container = document.getElementById('cardTabs');
    if (!container) return;
    container.addEventListener('click', async function (e) {
        const tab = e.target.closest('.card-tab');
        if (!tab) return;
        cardCurrentTab = tab.dataset.type;
        cardSelectedGroup = '全部';
        cardSearchKeyword = '';
        document.getElementById('cardSearchInput').value = '';
        renderCardTabs();
        await renderCardGroups();
        await renderCardList();
    });
}

/* 左侧分组列表 */

/** 渲染左侧分组列表（含字卡数量统计，未分组置顶） */
async function renderCardGroups() {
    const list = document.getElementById('cardGroupsList');
    if (!list) return;
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    let groupsData = cardData[cardCurrentTab].groups || [];
    groupsData = await normalizeCardGroups(cardData, cardCurrentTab);

    const groups = groupsData.length > 0 ? groupsData : [{ name: '未分组', blocked: false }];
    const cards = cardData[cardCurrentTab].cards || [];

    const ungroupedIdx = groups.findIndex(g => g.name === '未分组');
    if (ungroupedIdx > 0) {
        const ungrouped = groups.splice(ungroupedIdx, 1)[0];
        groups.unshift(ungrouped);
        cardData[cardCurrentTab].groups = groups;
        await saveCurrentCardData(cardData);
    } else if (groups.length > 0 && groups[0].name !== '未分组') {
        const defaultGroup = { name: '未分组', blocked: false };
        groups.unshift(defaultGroup);
        cardData[cardCurrentTab].groups = groups;
        await saveCurrentCardData(cardData);
    }

    // 一次遍历统计各分组字卡数量（避免 O(分组数 × 字卡数) 的重复扫描）
    const groupCounts = {};
    cards.forEach(function (c) {
        const g = (c.group && c.group.trim()) || '未分组';
        groupCounts[g] = (groupCounts[g] || 0) + 1;
    });

    const fragment = document.createDocumentFragment();
    fragment.appendChild(createGroupItem('全部', cards.length, cardSelectedGroup === '全部'));
    groups.forEach(g => {
        const groupName = g.name || g;
        const count = groupCounts[groupName] || 0;
        fragment.appendChild(createGroupItem(g, count, cardSelectedGroup === groupName));
    });
    list.innerHTML = '';
    list.appendChild(fragment);
}

/** 创建左侧分组列表项（长名称自动换行，最多 15 字） */
function createGroupItem(group, count, isActive) {
    const groupName = group.name || group;
    const isBlocked = group.blocked || false;

    const div = document.createElement('div');
    div.className = 'card-group-item' + (isActive ? ' active' : '') + (isBlocked ? ' blocked' : '');
    div.dataset.groupName = groupName;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name-text';
    // 每行最多5个字，最多3行（15个字）
    let displayName = groupName;
    if (groupName.length > 5) {
        const lines = [];
        for (let i = 0; i < groupName.length; i += 5) {
            lines.push(groupName.slice(i, i + 5));
            if (lines.length >= 3) break; // 最多3行
        }
        displayName = lines.join('\n');
    }
    nameSpan.textContent = displayName;

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = count;

    div.appendChild(nameSpan);
    div.appendChild(countSpan);

    div.onclick = function (e) {
        if (e.target.closest('.group-block-btn')) return;
        if (isActive && groupName !== '未分组') startEditGroupNameInline(div, groupName);
        else {
            cardSelectedGroup = groupName;
            renderCardGroups();
            renderCardList();
        }
    };

    return div;
}

/** 点击分组名进入内联编辑（重新命名分组，左侧分组列表用多行输入） */
function startEditGroupNameInline(container, currentName) {
    if (container.querySelector('.group-inline-editor')) return;
    const nameSpan = container.querySelector('.group-name-text');
    const countSpan = container.querySelector('.group-count');
    const originalName = currentName;
    nameSpan.style.display = 'none';
    countSpan.style.display = 'none';

    createInlineEditor(container, {
        value: currentName,
        textareaMode: true,
        insertBeforeEl: countSpan,
        wrapStyle: 'display:flex; flex-direction:column; align-items:center; gap:6px; width:100%;',
        inputStyle: 'width:100%; height:auto; min-height:36px; padding:4px 6px; border:2px solid var(--primary-color); border-radius:6px; background:rgba(255,255,255,0.6); font-size:14px; color:var(--text-main); outline:none; font-family:inherit; line-height:1.5; box-sizing:border-box;',
        btnStyle: 'width:22px;height:22px;border:none;border-radius:50%;cursor:pointer;font-size:12px;font-weight:bold;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:var(--transition-fast);',
        confirmBtnStyle: 'background:var(--primary-light);color:var(--text-main);',
        cancelBtnStyle: 'background:rgba(200,200,200,0.3);color:#999;',
        onConfirm: async function (newName) {
            const cardData = await getCurrentCardData();
            if (!cardData) return false;
            const groups = cardData[cardCurrentTab].groups || [];
            if (groups.some(g => g.name === newName && g.name !== originalName)) {
                alert('分组名称已存在');
                return false;
            }
            await renameGroup(originalName, newName);
            nameSpan.style.display = 'inline';
            countSpan.style.display = 'inline';
            nameSpan.textContent = newName;
            container.dataset.groupName = newName;
            cardSelectedGroup = newName;
            await renderCardGroups();
            await renderCardList();
            return true;
        },
        onCancel: function () {
            nameSpan.style.display = 'inline';
            countSpan.style.display = 'inline';
        }
    });
}

/** 重命名分组（同步更新组内所有字卡的分组名） */
async function renameGroup(oldName, newName) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const groups = cardData[cardCurrentTab].groups || [{ name: '未分组', blocked: false }];
    const idx = groups.findIndex(g => g.name === oldName);
    if (idx !== -1) {
        groups[idx].name = newName;
    }
    (cardData[cardCurrentTab].cards || []).forEach(c => {
        if (c.group === oldName) c.group = newName;
    });
    await saveCurrentCardData(cardData);
}

/** 屏蔽 / 取消屏蔽分组（乐观更新 UI，后台保存） */
async function toggleGroupBlock(groupName) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const groups = cardData[cardCurrentTab].groups || [];
    const target = groups.find(function (g) { return g.name === groupName; });
    if (!target) return;
    target.blocked = !target.blocked;

    /* 乐观更新 UI：不等待保存，立即在 DOM 中反映状态 */

    // 1. 更新管理分组弹窗列表中的对应项
    const list = document.getElementById('manageGroupList');
    if (list) {
        const items = list.querySelectorAll('.manage-group-item');
        for (let item of items) {
            if (item.dataset.group === groupName) {
                item.classList.toggle('blocked', target.blocked);
                const blockBtn = item.querySelector('.group-block-btn');
                if (blockBtn) {
                    blockBtn.title = target.blocked ? '取消屏蔽' : '屏蔽该分组';
                }
                break;
            }
        }
    }

    // 2. 更新字卡库弹窗左侧分组列表（如果打开的话）
    const groupItems = document.querySelectorAll('.card-group-item');
    for (let gi of groupItems) {
        if (gi.dataset.groupName === groupName) {
            gi.classList.toggle('blocked', target.blocked);
            break;
        }
    }

    /* 后台保存到 IndexedDB（不阻塞 UI） */
    await saveCurrentCardData(cardData);

    const status = target.blocked ? '已屏蔽' : '已取消屏蔽';
    showToast('分组<span class="toast-highlight">「' + groupName + '」</span>' + status);
}
/* 字卡列表渲染 */

/** 渲染字卡列表（按当前标签页显示对应内容，状态未变时跳过重建 DOM） */
async function renderCardList() {
    const list = document.getElementById('cardList');
    const grid = document.getElementById('stickerGrid');
    const emojiGrid = document.getElementById('emojiGrid');
    const header = document.querySelector('.card-list-header');
    const addBtn = document.getElementById('cardAddBtn');
    const addGroupBtn = document.getElementById('cardLibAddGroupBtn');
    const manageGroupBtn = document.getElementById('cardManageGroupBtn');
    const manageBtn = document.getElementById('cardManageBtn');

    const groupsWrap = document.querySelector('.card-groups-wrap');
    const searchWrap = document.querySelector('.card-search-wrap');

    if (cardCurrentTab === 'sticker') {
        if (groupsWrap) groupsWrap.style.display = 'none';
        if (searchWrap) searchWrap.style.display = 'none';
        if (header) header.style.display = 'none';
        if (list) list.style.display = 'none';
        if (emojiGrid) emojiGrid.style.display = 'none';
        if (addGroupBtn) addGroupBtn.style.display = 'none';
        if (manageGroupBtn) manageGroupBtn.style.display = 'none';
        if (addBtn) {
            addBtn.textContent = '+ 新增表情包';
            addBtn.style.display = 'flex';
        }
        if (manageBtn) {
            manageBtn.style.display = 'flex';
        }
        updateManageBtnVisibility('sticker');
        if (grid) {
            grid.style.display = 'grid';
            await renderStickerGrid();
        }
        return;
    }

    if (cardCurrentTab === 'emoji') {
        if (groupsWrap) groupsWrap.style.display = 'none';
        if (searchWrap) searchWrap.style.display = 'none';
        if (header) header.style.display = 'none';
        if (list) list.style.display = 'none';
        if (grid) grid.style.display = 'none';
        if (addGroupBtn) addGroupBtn.style.display = 'none';
        if (manageGroupBtn) manageGroupBtn.style.display = 'none';
        if (addBtn) {
            addBtn.textContent = '+ 新增 Emoji';
            addBtn.style.display = 'flex';
        }
        if (manageBtn) {
            manageBtn.style.display = 'flex';
        }
        updateManageBtnVisibility('emoji');
        if (emojiGrid) {
            emojiGrid.style.display = 'grid';
            await renderEmojiGrid();
        }
        return;
    }

    if (groupsWrap) groupsWrap.style.display = 'flex';
    if (searchWrap) searchWrap.style.display = 'flex';
    if (header) header.style.display = 'flex';
    if (list) list.style.display = 'flex';
    if (grid) grid.style.display = 'none';
    if (emojiGrid) emojiGrid.style.display = 'none';

    if (addGroupBtn) addGroupBtn.style.display = 'flex';
    if (manageGroupBtn) manageGroupBtn.style.display = 'flex';

    if (addBtn) {
        const groupName = cardSelectedGroup === '全部' ? '' : cardSelectedGroup;
        addBtn.textContent = groupName ? '+ 添加【' + groupName + '】字卡' : '+ 添加字卡';
        addBtn.style.display = 'flex';
    }

    if (manageBtn) {
        manageBtn.style.display = 'none';
    }
    updateManageBtnVisibility(null);

    if (!list) return;

    // 状态（标签页/分组/关键字/字卡库）+ 数据版本号都没变时，跳过重建 DOM（第二次打开弹窗秒开）
    // 字卡库必须纳入缓存 key：切换字卡库（saveCurrentCardLib）不会递增 cardDataVersion，
    // 若分组/搜索/标签都不变，旧缓存会把上一个字卡库的字卡误留在界面上
    const currentLib = await getCurrentCardLib();
    const stateKey = cardCurrentTab + '|' + cardSelectedGroup + '|' + cardSearchKeyword + '|' + currentLib;
    const version = (window.getCardDataVersion ? window.getCardDataVersion() : 0);
    const hasContent = list.children.length > 0 && !(list.children.length === 1 && list.querySelector('.card-empty'));
    if (hasContent && list.dataset.renderedState === stateKey + '|v' + version) {
        return;
    }

    const cardData = await getCurrentCardData();
    if (!cardData) {
        list.innerHTML = '<div class="card-empty">请先创建联系人</div>';
        updateAddBtnText();
        return;
    }

    const cards = cardData[cardCurrentTab].cards || [];
    const keyword = cardSearchKeyword.trim().toLowerCase();

    let filtered = cards;
    if (cardSelectedGroup !== '全部') {
        filtered = filtered.filter(function (c) { return c.group === cardSelectedGroup; });
    }

    if (keyword) {
        if (cardCurrentTab === 'text') {
            filtered = filtered.filter(function (c) { return c.text.toLowerCase().includes(keyword); });
        }
    }

    if (filtered.length === 0) {
        resetCardIncremental(list);
        list.innerHTML = '<div class="card-empty">暂无字卡</div>';
        updateAddBtnText();
        return;
    }

    // 预建索引映射，避免 cards.indexOf 的 O(n²) 查找（字卡数量多时是主要卡顿来源）
    const indexMap = new Map();
    cards.forEach(function (c, i) { indexMap.set(c, i); });

    // 无限滚动渲染：先渲染前 150 张秒开，滚动接近底部再追加（字卡多时不卡顿）
    await renderIncremental(list, filtered, function (card, filterIndex) {
        const realIndex = indexMap.has(card) ? indexMap.get(card) : filterIndex;
        return createCardItem(card, filterIndex, realIndex);
    });

    // 记录本次渲染状态，供下次打开弹窗时判断是否可跳过重建
    list.dataset.renderedState = stateKey + '|v' + version;
    updateAddBtnText();
}

/** 创建单个字卡条目（内容 + 编辑/移动/屏蔽/删除按钮） */
function createCardItem(card, filterIndex, realIndex) {
    if (!card || typeof card !== 'object') return document.createElement('div');
    const div = document.createElement('div');
    div.className = 'card-item' + (card.blocked ? ' blocked' : '');
    div.dataset.index = filterIndex;
    div.dataset.realIndex = realIndex; // 供事件委托读取：操作按钮用的真实数据索引

    let contentHTML = '';
    if (cardCurrentTab === 'text') contentHTML = card.text || '';
    else if (cardCurrentTab === 'emoji') contentHTML = card.emoji || '';
    else if (cardCurrentTab === 'sticker') contentHTML = card.dataUrl ? `<img src="${card.dataUrl}">` : (card.name || '');

    div.innerHTML = `
        <span class="card-content">${contentHTML}</span>
        <div class="card-actions">
            <button class="card-edit-btn" title="修改字卡"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
            <button class="card-move-btn" title="修改分组"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
            <button class="card-block-btn" title="${card.blocked ? '取消屏蔽' : '屏蔽'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>
            <button class="card-delete-btn" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
        </div>
    `;

    return div;
}

/** 事件委托：字卡列表卡片上的操作按钮（编辑/改分组/屏蔽/删除）
 * 只绑定一次，由点击事件冒泡到 #cardList 统一分发，避免每张卡片各绑 4 个监听器
 */
function bindCardListEvents() {
    const list = document.getElementById('cardList');
    if (!list) return;
    list.addEventListener('click', function (e) {
        const item = e.target.closest('.card-item');
        if (!item) return;
        const realIndex = parseInt(item.dataset.realIndex, 10);
        if (isNaN(realIndex)) return;

        if (e.target.closest('.card-edit-btn')) {
            openEditCardModal(realIndex);
        } else if (e.target.closest('.card-move-btn')) {
            openEditGroupModal(realIndex);
        } else if (e.target.closest('.card-block-btn')) {
            (async function () { await toggleCardBlock(realIndex); })();
        } else if (e.target.closest('.card-delete-btn')) {
            (async function () { await deleteCard(realIndex); })();
        }
    });
}

/** 更新“添加字卡”按钮文案（按当前分组显示） */
function updateAddBtnText() {
    const btn = document.getElementById('cardAddBtn');
    if (!btn) return;
    const g = cardSelectedGroup === '全部' ? '' : cardSelectedGroup;
    btn.textContent = g ? '+ 添加【' + g + '】字卡' : '+ 添加字卡';
}

/* 字卡操作 */

/** 屏蔽 / 取消屏蔽单张字卡 */
async function toggleCardBlock(index) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const cards = cardData[cardCurrentTab].cards || [];
    if (index < 0 || index >= cards.length) return;
    cards[index].blocked = !cards[index].blocked;
    await saveCurrentCardData(cardData);
    await renderCardList();
}

/** 删除单张字卡（弹确认框，删除后刷新列表和分组） */
async function deleteCard(index) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const cards = cardData[cardCurrentTab].cards || [];
    if (index < 0 || index >= cards.length) return;
    showConfirmModal('确认操作', '确定要删除这张字卡吗？删除后不可恢复',
        async function () {
            cards.splice(index, 1);
            await saveCurrentCardData(cardData);
            await renderCardList();
            await renderCardGroups();
        }
    );
}

/* 修改字卡内容 */

let _editingCardIndex = -1;   // 正在编辑的字卡索引

/** 打开修改字卡弹窗，预填当前内容 */
function openEditCardModal(index) {
    (async function () {
        const cardData = await getCurrentCardData();
        if (!cardData) return;
        const cards = cardData[cardCurrentTab].cards || [];
        if (index < 0 || index >= cards.length) return;
        _editingCardIndex = index;
        const card = cards[index];
        const input = document.getElementById('editCardInput');
        let content = '';
        if (cardCurrentTab === 'text') content = card.text || '';
        else if (cardCurrentTab === 'emoji') content = card.emoji || '';
        else if (cardCurrentTab === 'sticker') content = card.name || '';
        input.value = content;
        document.getElementById('editCardModal').classList.remove('hidden');
        setTimeout(() => { input.focus(); input.select(); }, 50);
    })();
}

/** 关闭修改字卡弹窗 */
function closeEditCardModal() {
    document.getElementById('editCardModal').classList.add('hidden');
    _editingCardIndex = -1;
}

/** 确认修改字卡内容（校验非空与重复） */
async function confirmEditCard() {
    const input = document.getElementById('editCardInput');
    const newContent = input.value.trim();
    if (!newContent) { alert('请输入字卡内容'); return; }
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const cards = cardData[cardCurrentTab].cards || [];
    if (_editingCardIndex < 0 || _editingCardIndex >= cards.length) return;
    const card = cards[_editingCardIndex];
    const field = cardCurrentTab === 'text' ? 'text' : (cardCurrentTab === 'emoji' ? 'emoji' : 'name');
    if (cards.some((c, i) => i !== _editingCardIndex && c[field] === newContent)) { alert('已存在相同的字卡内容'); return; }
    card[field] = newContent;
    await saveCurrentCardData(cardData);
    closeEditCardModal();
    await renderCardList();
    await renderCardGroups();
}

/* 修改字卡分组 */

let _editingGroupCardIndex = -1;   // 正在修改分组的字卡索引

/** 打开修改分组弹窗，列出所有分组供选择 */
function openEditGroupModal(index) {
    (async function () {
        const cardData = await getCurrentCardData();
        if (!cardData) return;
        const cards = cardData[cardCurrentTab].cards || [];
        if (index < 0 || index >= cards.length) return;
        _editingGroupCardIndex = index;
        const card = cards[index];
        const select = document.getElementById('editGroupSelect');
        const modal = document.getElementById('editGroupModal');

        let groups = await normalizeCardGroups(cardData, cardCurrentTab);
        if (groups.length === 0) groups = [{ name: '未分组', blocked: false }];
        const groupNames = groups.map(g => g.name);
        if (!groupNames.includes('未分组')) groupNames.unshift('未分组');

        select.innerHTML = '';
        groupNames.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; select.appendChild(o); });

        let curGroup = (card.group || '').trim() || '未分组';
        if (!groupNames.includes(curGroup)) {
            const o = document.createElement('option');
            o.value = curGroup;
            o.textContent = curGroup;
            select.appendChild(o);
        }
        select.value = curGroup;
        modal.classList.remove('hidden');
    })();
}

/** 关闭修改分组弹窗 */
function closeEditGroupModal() {
    document.getElementById('editGroupModal').classList.add('hidden');
    _editingGroupCardIndex = -1;
}

/** 确认修改字卡分组 */
async function confirmEditGroup() {
    const newGroup = document.getElementById('editGroupSelect').value.trim().replace(/\s+/g, ' ');
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const cards = cardData[cardCurrentTab].cards || [];
    if (_editingGroupCardIndex < 0 || _editingGroupCardIndex >= cards.length) return;
    cards[_editingGroupCardIndex].group = newGroup;
    await saveCurrentCardData(cardData);
    closeEditGroupModal();
    await renderCardList();
    await renderCardGroups();
}

/* 新增分组 */

/**
 * 在容器内创建内联编辑器（输入框 + 确认/取消按钮 + 回车/ESC/失焦处理）
 * 供「新增分组」「改名分组」等场景复用，避免重复的内联输入框代码
 * @param {HTMLElement} container - 插入目标容器
 * @param {object} options
 * @param {string} [options.value] - 初始值
 * @param {string} [options.placeholder] - 占位提示
 * @param {boolean} [options.textareaMode] - 是否使用多行 textarea
 * @param {HTMLElement} [options.insertBeforeEl] - 插入到该元素之前（缺省追加到末尾）
 * @param {string} [options.wrapStyle] - 外层容器内联样式
 * @param {string} [options.inputStyle] - 输入框内联样式
 * @param {string} [options.btnStyle] - 按钮基础内联样式（不含背景/颜色）
 * @param {string} [options.confirmBtnStyle] - 确认按钮附加样式（背景/文字色）
 * @param {string} [options.cancelBtnStyle] - 取消按钮附加样式（背景/文字色）
 * @param {string} [options.emptyMsg] - 名称为空时的 Toast 提示（缺省用 alert）
 * @param {string} [options.longMsg] - 名称超长时的 Toast 提示（缺省用 alert）
 * @param {boolean} [options.blurCancel] - 失焦直接取消（缺省：有值则确认，空则取消）
 * @param {function} [options.onCancel] - 取消后回调（用于恢复被隐藏的元素）
 * @param {function} options.onConfirm - async (value) => boolean：返回 true 由框架移除编辑器，false 保持并聚焦
 */
function createInlineEditor(container, options) {
    const wrap = document.createElement('div');
    wrap.className = 'group-inline-editor';
    wrap.style.cssText = options.wrapStyle;

    const field = document.createElement(options.textareaMode ? 'textarea' : 'input');
    if (!options.textareaMode) field.type = 'text';
    field.value = options.value || '';
    field.placeholder = options.placeholder || '';
    field.maxLength = 15;
    field.spellcheck = false;
    field.style.cssText = options.inputStyle;

    // textarea 自动调整高度
    if (options.textareaMode) {
        field.rows = 2;
        function autoResize() {
            field.style.height = 'auto';
            field.style.height = field.scrollHeight + 'px';
        }
        field.addEventListener('input', autoResize);
        setTimeout(autoResize, 50);
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; align-items:center; gap:4px; flex-shrink:0;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✔';
    saveBtn.style.cssText = options.btnStyle + options.confirmBtnStyle;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕';
    cancelBtn.style.cssText = options.btnStyle + options.cancelBtnStyle;

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);

    wrap.appendChild(field);
    wrap.appendChild(btnRow);
    if (options.insertBeforeEl) {
        container.insertBefore(wrap, options.insertBeforeEl);
    } else {
        container.appendChild(wrap);
    }

    setTimeout(function () { field.focus(); field.select(); }, 50);

    let isConfirming = false;

    /** 确认：校验名称后委托业务回调，成功由框架移除编辑器 */
    async function doConfirm() {
        if (isConfirming) return;
        const val = field.value.trim().replace(/\s+/g, ' ');
        if (!val) {
            if (options.emptyMsg) showToast(options.emptyMsg);
            else alert('分组名称不能为空');
            field.focus();
            return;
        }
        if (val.length > 15) {
            if (options.longMsg) showToast(options.longMsg);
            else alert('分组名称不能超过15个字');
            field.focus();
            return;
        }
        isConfirming = true;
        try {
            const ok = await options.onConfirm(val);
            if (ok !== false) {
                wrap.remove();
            } else {
                isConfirming = false;
                field.focus();
            }
        } catch (e) {
            isConfirming = false;
            field.focus();
        }
    }

    /** 取消：移除编辑器并恢复被隐藏的元素 */
    function doCancel() {
        if (isConfirming) return;
        wrap.remove();
        if (typeof options.onCancel === 'function') options.onCancel();
    }

    saveBtn.addEventListener('click', function (e) { e.stopPropagation(); doConfirm(); });
    cancelBtn.addEventListener('click', function (e) { e.stopPropagation(); doCancel(); });

    field.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (!options.textareaMode || !e.shiftKey)) {
            e.preventDefault();
            doConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            doCancel();
        }
    });

    field.addEventListener('blur', function () {
        if (isConfirming) return;
        setTimeout(function () {
            if (!wrap.parentNode) return;
            if (options.blurCancel) {
                doCancel();
            } else {
                const val = field.value.trim();
                if (val) doConfirm(); else doCancel();
            }
        }, 200);
    });
}

/** 新增分组核心逻辑（校验名称、防重复，成功后刷新界面） */
async function confirmAddGroupCore(name, onSuccess, onFail) {
    if (!name) {
        if (typeof onFail === 'function') onFail();
        return;
    }

    const cardData = await getCurrentCardData();
    if (!cardData) {
        showToast('请先创建联系人');
        if (typeof onFail === 'function') onFail();
        return;
    }

    const groups = cardData[cardCurrentTab].groups || [{ name: '未分组', blocked: false }];
    if (groups.some(g => g.name === name)) {
        showToast('分组名称已存在');
        if (typeof onFail === 'function') onFail();
        return;
    }

    groups.push({ name: name, blocked: false });
    const uIdx = groups.findIndex(g => g.name === '未分组');
    if (uIdx > 0) {
        groups.splice(uIdx, 1);
        groups.unshift({ name: '未分组', blocked: false });
    }
    cardData[cardCurrentTab].groups = groups;
    await saveCurrentCardData(cardData);

    if (typeof onSuccess === 'function') onSuccess();

    cardSelectedGroup = name;
    await renderCardGroups();
    await renderCardList();

    const manageModal = document.getElementById('manageGroupModal');
    if (manageModal && !manageModal.classList.contains('hidden')) {
        await renderManageGroupList();
        setTimeout(function () {
            const ml = document.getElementById('manageGroupList');
            if (!ml) return;
            const items = ml.querySelectorAll('.manage-group-item');
            if (items.length) {
                items[items.length - 1].scrollIntoView({ block: 'end', behavior: 'smooth' });
            }
        }, 150);
    }

    showToast('已创建分组<span class="toast-highlight">「' + name + '」</span>');
}

/** 确认新增分组（从弹窗输入框读取名称，复用核心逻辑） */
async function confirmAddGroup() {
    const input = document.getElementById('addGroupInput');
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) {
        showToast('请输入分组名称');
        input.focus();
        return;
    }
    if (name.length > 15) {
        showToast('分组名称不能超过15个字');
        input.focus();
        return;
    }
    await confirmAddGroupCore(name, function () {
        document.getElementById('addGroupModal').classList.add('hidden');
    }, function () {
        input.focus();
    });
}

/* 管理分组弹窗 */

/** 打开管理分组弹窗（含内联新增分组输入框） */
async function openManageGroupModal() {
    var modal = document.getElementById('manageGroupModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    await updateManageGroupLibLabel(await getCurrentCardLib());
    await renderManageGroupList();

    if (!window._manageGroupLibEventsBound) {
        bindManageGroupLibSwitchEvents();
        window._manageGroupLibEventsBound = true;
    }

    var innerAddBtn = document.querySelector('#manageGroupModal .card-add-group-btn');
    if (innerAddBtn) {
        var newBtn = innerAddBtn.cloneNode(true);
        innerAddBtn.parentNode.replaceChild(newBtn, innerAddBtn);
        newBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var list = document.getElementById('manageGroupList');
            if (!list) return;

            createInlineEditor(list, {
                placeholder: '输入分组名称（最多15个字）',
                wrapStyle: 'display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:var(--radius-md); background:rgba(255,255,255,0.30); margin-top:4px;',
                inputStyle: 'flex:1; height:28px; padding:0 8px; border:2px solid var(--primary-color); border-radius:6px; background:rgba(255,255,255,0.6); font-size:14px; color:var(--text-main); outline:none; min-width:0;',
                btnStyle: 'width:24px;height:24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;',
                confirmBtnStyle: 'background:var(--primary-light);color:var(--text-main);',
                cancelBtnStyle: 'background:rgba(200,200,200,0.3);color:#999;',
                emptyMsg: '请输入分组名称',
                longMsg: '分组名称不能超过15个字',
                onConfirm: function (name) {
                    return new Promise(function (resolve) {
                        confirmAddGroupCore(name, function () { resolve(true); }, function () { resolve(false); });
                    });
                }
            });
        });
    }
}

/** 关闭管理分组弹窗（恢复标题栏、新增按钮，退出批量模式） */
function closeManageGroupModal() {
    // 恢复标题栏
    const header = document.querySelector('#manageGroupModal .card-sub-header');
    if (header) header.style.display = '';

    // 精确恢复管理分组弹窗中的新增分组按钮
    const addBtn = document.querySelector('#manageGroupModal .card-add-group-btn');
    if (addBtn) addBtn.style.display = '';

    var modal = document.getElementById('manageGroupModal');
    if (modal) modal.classList.add('hidden');
    document.querySelectorAll('.manage-group-item.dragging').forEach(function (el) {
        el.classList.remove('dragging');
    });
    closeManageGroupLibDropdown();
    if (isManageGroupBatchMode) {
        exitManageBatchMode();
    }
}

/** 渲染管理分组列表（排除未分组，同步批量选择状态） */
async function renderManageGroupList() {
    const list = document.getElementById('manageGroupList');
    if (!list) return;
    document.getElementById('manageGroupListContainer').style.display = 'block';
    document.getElementById('manageGroupOptionsContainer').style.display = 'none';
    const cardData = await getCurrentCardData();
    if (!cardData) { list.innerHTML = '<div style="text-align:center;color:var(--text-placeholder);padding:20px;">暂无分组</div>'; return; }

    let groups = await normalizeCardGroups(cardData, cardCurrentTab);
    if (groups.length === 0) groups = [{ name: '未分组', blocked: false }];

    const cards = cardData[cardCurrentTab].cards || [];
    // 单次遍历统计各分组卡片数（避免逐分组 filter 造成 O(分组数×卡片数)）
    const groupCounts = {};
    cards.forEach(function (c) { groupCounts[c.group] = (groupCounts[c.group] || 0) + 1; });

    list.innerHTML = '';
    groups.forEach(function (g) {
        if (g.name === '未分组') return;
        list.appendChild(createManageGroupItem(g, groupCounts[g.name] || 0));
    });
    setupManageGroupDrag();

    // 批量模式下的复选框状态同步
    if (isManageGroupBatchMode) {
        const items = list.querySelectorAll('.manage-group-item');
        items.forEach(function (item) {
            const groupName = item.dataset.group;
            const checkbox = item.querySelector('.group-checkbox');
            if (checkbox) {
                checkbox.checked = selectedGroupNames.includes(groupName);
            }
            item.classList.toggle('selected', selectedGroupNames.includes(groupName));
        });
    }
}

/** 创建管理分组列表项（复选框 + 拖拽手柄 + 屏蔽/清空/删除按钮） */
function createManageGroupItem(group, count) {
    const groupName = group.name || group;
    const isBlocked = group.blocked || false;

    const div = document.createElement('div');
    div.className = 'manage-group-item' + (isBlocked ? ' blocked' : '');
    if (isManageGroupBatchMode && selectedGroupNames.includes(groupName)) {
        div.classList.add('selected');
    }
    div.dataset.group = groupName;

    // 批量模式下的复选框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'group-checkbox';
    checkbox.style.cssText = 'margin-right:8px; width:16px; height:16px; cursor:pointer; flex-shrink:0;';
    checkbox.checked = isManageGroupBatchMode && selectedGroupNames.includes(groupName);
    checkbox.style.display = isManageGroupBatchMode ? 'inline-block' : 'none';
    checkbox.setAttribute('draggable', 'false');
    checkbox.addEventListener('dragstart', function (e) { e.preventDefault(); });
    checkbox.addEventListener('change', function (e) {
        e.stopPropagation();
        toggleManageGroupSelect(groupName);
    });

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.style.display = isManageGroupBatchMode ? 'none' : 'inline';
    handle.setAttribute('draggable', 'false');
    handle.addEventListener('dragstart', function (e) { e.preventDefault(); });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = groupName;
    nameSpan.style.cursor = 'pointer';
    nameSpan.onclick = function (e) {
        e.stopPropagation();
        if (isManageGroupBatchMode) {
            const cb = div.querySelector('.group-checkbox');
            if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        } else {
            startEditGroupNameInManage(div, groupName);
        }
    };

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = '字卡: ' + count;

    const actions = document.createElement('div');
    actions.className = 'group-actions';

    // 按钮1：屏蔽/取消屏蔽（切换）
    const blockBtn = document.createElement('button');
    blockBtn.className = 'group-block-btn';
    blockBtn.innerHTML = BLOCK_ICON;
    blockBtn.title = isBlocked ? '取消屏蔽' : '屏蔽该分组';
    blockBtn.style.cssText = 'width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);transition:var(--transition-fast);padding:0;';
    blockBtn.onclick = function (e) {
        e.stopPropagation();
        (async function () { await toggleGroupBlock(groupName); })();
    };

    // 按钮2：清空字卡（新增）
    const clearBtn = document.createElement('button');
    clearBtn.className = 'group-clear-btn';
    clearBtn.innerHTML = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;"><path d="M274.56 798.997333l19.434667-25.130666-33.792 68.565333a18.133333 18.133333 0 0 0 11.562666 25.536l59.733334 16a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.818667 35.626667-35.989333 45.290666-48.469333l19.456-25.130667-33.813333 68.565333a18.133333 18.133333 0 0 0 11.562667 25.536l84.48 22.634667a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.84 35.626667-35.989333 45.269333-48.469333l19.456-25.130667-33.813333 68.565333A18.133333 18.133333 0 0 0 535.530667 938.666667l72.106666 19.328a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.84 35.626667-36.010667 45.269334-48.490667l19.456-25.130667-33.813334 68.586667a18.133333 18.133333 0 0 0 11.584 25.514667l86.421334 23.338666 3.84-0.213333c13.269333-0.704 29.056-5.034667 43.84-12.8 29.781333-15.701333 48.170667-43.2 52.181333-78.250667 2.133333-18.517333 4.778667-38.549333 8.405333-63.530666 1.642667-11.221333 2.944-20.010667 6.229334-41.834667 11.050667-73.322667 14.634667-101.034667 17.130666-133.674667l0.938667-12.373333 2.837333-2.922667 12.330667-1.344a41.813333 41.813333 0 0 0 24.810667-11.221333c10.730667-10.24 14.805333-25.386667 11.093333-42.197333l-37.546667-171.584c-3.029333-13.696-11.264-27.946667-23.146666-39.829334-11.648-11.626667-25.92-20.138667-39.893334-23.893333L723.626667 331.306667l-2.261334-3.925334L774.250667 130.133333c8.32-31.061333-11.754667-63.744-44.970667-72.64l-79.509333-21.312c-33.194667-8.896-66.922667 9.365333-75.264 40.426667l-52.842667 197.269333-3.925333 2.261334-118.101334-31.637334c-13.994667-3.754667-30.634667-3.498667-46.506666 0.746667-16.256 4.352-30.506667 12.586667-39.957334 22.933333l-118.314666 129.792c-11.605333 12.714667-15.658667 27.84-11.52 42.090667 4.16 14.229333 15.850667 25.194667 32.896 30.528l13.610666 4.266667 2.133334 3.882666-3.626667 13.802667c-21.12 79.850667-52.885333 136.917333-85.717333 150.890667-47.530667 20.202667-72.938667 49.429333-78.421334 85.034666-5.034667 32.682667 9.28 67.114667 37.589334 91.541334l22.037333 8.341333 74.666667 20.010667a42.666667 42.666667 0 0 0 41.216-11.050667c15.274667-15.274667 26.88-28.032 34.837333-38.293333z m551.381333-396.565333c14.144 3.797333 29.952 19.2 32.768 32l34.56 157.781333a10.666667 10.666667 0 0 1-13.184 12.586667L240.64 433.493333a10.666667 10.666667 0 0 1-5.12-17.493333l108.8-119.36c8.832-9.685333 30.229333-15.146667 44.373333-11.349333l141.333334 37.866666a21.333333 21.333333 0 0 0 26.133333-15.082666l58.304-217.642667a21.333333 21.333333 0 0 1 26.133333-15.082667l77.056 20.650667a21.333333 21.333333 0 0 1 15.082667 26.133333l-58.325333 217.642667a21.333333 21.333333 0 0 0 15.082666 26.112l136.448 36.565333zM315.456 701.568c-33.664 45.141333-64.597333 79.082667-92.8 101.802667l-5.909333 4.778666-2.837334 0.597334-88.106666-24.106667-2.922667-3.2c-13.034667-14.165333-19.370667-31.04-16.981333-46.592 3.285333-21.333333 22.058667-39.338667 53.205333-52.586667 31.722667-13.482667 59.818667-47.104 82.922667-99.904 10.026667-22.954667 18.88-48.725333 26.389333-76.586666l3.882667-14.4 3.904-2.261334 566.165333 151.701334 2.346667 3.306666-0.789334 12.224c-1.984 30.592-30.336 229.397333-32.128 244.906667-2.346667 20.416-11.306667 34.986667-27.605333 44.394667a73.237333 73.237333 0 0 1-21.397333 8.106666l-5.013334 0.725334-60.373333-16.170667 11.242667-20.288c8.277333-14.976 22.656-43.84 43.093333-86.613333a21.12 21.12 0 0 0-9.962667-28.16l-3.136-1.493334a21.333333 21.333333 0 0 0-26.261333 6.485334c-33.642667 45.056-64.533333 78.912-92.672 101.546666l-5.909333 4.757334-2.837334 0.597333-52.544-14.08 11.114667-20.266667c3.562667-6.485333 7.04-13.013333 10.453333-19.626666 7.04-13.504 17.898667-35.797333 32.597334-66.816a21.290667 21.290667 0 0 0-9.984-28.309334l-3.029334-1.450666a21.333333 21.333333 0 0 0-26.368 6.442666c-33.6 45.013333-64.469333 78.826667-92.608 101.482667l-5.909333 4.757333-2.837333 0.597334-52.138667-13.973334 11.114667-20.266666c3.242667-5.888 6.72-12.416 10.453333-19.626667 6.997333-13.461333 17.962667-35.946667 32.896-67.434667a20.970667 20.970667 0 0 0-10.112-28.010666l-3.328-1.536a21.333333 21.333333 0 0 0-26.069333 6.613333c-33.642667 45.056-64.554667 78.976-92.778667 101.696l-5.909333 4.757333-2.837334 0.597334-32.64-8.746667 11.093334-20.245333c3.541333-6.506667 7.04-13.034667 10.453333-19.626667 6.976-13.482667 17.941333-35.968 32.874667-67.456a21.056 21.056 0 0 0-10.069334-28.074667l-3.242666-1.514666a21.333333 21.333333 0 0 0-26.154667 6.549333z" fill="currentColor"></path></svg>`;
    clearBtn.title = '清空该分组的所有字卡';
    clearBtn.style.cssText = 'width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);transition:var(--transition-fast);padding:0;';
    clearBtn.onclick = function (e) {
        e.stopPropagation();
        (async function () { await confirmClearGroupCards(groupName, count); })();
    };

    // 按钮3：删除分组
    const delBtn = document.createElement('button');
    delBtn.className = 'group-delete-btn';
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
    delBtn.title = '删除分组';
    delBtn.onclick = function (e) {
        e.stopPropagation();
        (async function () { await confirmDeleteGroup(groupName, count); })();
    };

    // 按顺序添加按钮：屏蔽 → 清空 → 删除
    actions.appendChild(blockBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(delBtn);

    if (isManageGroupBatchMode) {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'flex';
    }

    div.appendChild(checkbox);
    div.appendChild(handle);
    div.appendChild(nameSpan);
    div.appendChild(countSpan);
    div.appendChild(actions);

    return div;
}
/* 管理分组批量管理 */

/** 切换分组的选择状态 */
function toggleManageGroupSelect(groupName) {
    const idx = selectedGroupNames.indexOf(groupName);
    if (idx > -1) {
        selectedGroupNames.splice(idx, 1);
    } else {
        selectedGroupNames.push(groupName);
    }
    updateManageBatchUI();
    // 更新复选框和选中样式（重新渲染列表）
    renderManageGroupList();
}

/** 全选 / 取消全选分组 */
function toggleManageGroupSelectAll() {
    const list = document.getElementById('manageGroupList');
    if (!list) return;
    const items = list.querySelectorAll('.manage-group-item');
    const allNames = Array.from(items).map(el => el.dataset.group);
    if (selectedGroupNames.length === allNames.length) {
        selectedGroupNames = [];
    } else {
        selectedGroupNames = allNames.slice();
    }
    updateManageBatchUI();
    renderManageGroupList();
}

/** 更新批量操作栏按钮状态（全选/屏蔽/取消屏蔽/删除/清空） */
function updateManageBatchUI() {
    const countEl = document.getElementById('manageBatchCount');
    const selectAllBtn = document.getElementById('manageBatchSelectAll');
    const blockBtn = document.getElementById('manageBatchBlock');
    const unblockBtn = document.getElementById('manageBatchUnblock'); // 恢复取消屏蔽按钮
    const deleteBtn = document.getElementById('manageBatchDelete');
    const clearBtn = document.getElementById('manageBatchClear');
    const total = document.querySelectorAll('#manageGroupList .manage-group-item').length;
    if (countEl) countEl.textContent = '已选中 ' + selectedGroupNames.length + ' 个';
    if (selectAllBtn) {
        selectAllBtn.textContent = (selectedGroupNames.length === total && total > 0) ? '取消全选' : '全选';
    }

    // 检查选中的分组中是否有已屏蔽的
    const hasBlocked = selectedGroupNames.some(function (name) {
        const group = document.querySelector(`.manage-group-item[data-group="${name}"]`);
        return group && group.classList.contains('blocked');
    });

    // 屏蔽按钮：只要有选中即可点
    if (blockBtn) blockBtn.disabled = selectedGroupNames.length === 0;
    // 取消屏蔽按钮：只有选中的分组中有已屏蔽的才能点
    if (unblockBtn) unblockBtn.disabled = selectedGroupNames.length === 0 || !hasBlocked;
    if (deleteBtn) deleteBtn.disabled = selectedGroupNames.length === 0;
    if (clearBtn) clearBtn.disabled = selectedGroupNames.length === 0;
}

/** 进入批量管理模式（显示批量操作栏，隐藏新增分组按钮） */
function enterManageBatchMode() {
    isManageGroupBatchMode = true;
    selectedGroupNames = [];
    const btn = document.getElementById('manageBatchToggleBtn');
    btn.classList.add('active');
    btn.innerHTML = '✕ 退出批量';
    document.getElementById('manageBatchBar').classList.remove('hidden');
    // 精确隐藏管理分组弹窗中的新增分组按钮
    const addBtn = document.querySelector('#manageGroupModal .card-add-group-btn');
    if (addBtn) addBtn.style.display = 'none';
    renderManageGroupList();
    updateManageBatchUI();

    // 显示“清空”按钮（默认是隐藏的，在批量模式下显示）
    const clearBtn = document.getElementById('manageBatchClear');
    if (clearBtn) clearBtn.style.display = 'inline-block';
}

/** 退出批量管理模式（隐藏批量操作栏，恢复新增分组按钮） */
function exitManageBatchMode() {
    isManageGroupBatchMode = false;
    selectedGroupNames = [];
    const btn = document.getElementById('manageBatchToggleBtn');
    btn.classList.remove('active');
    btn.innerHTML = BATCH_ICON_SVG + ' 批量管理';
    document.getElementById('manageBatchBar').classList.add('hidden');
    // 精确恢复管理分组弹窗中的新增分组按钮
    const addBtn = document.querySelector('#manageGroupModal .card-add-group-btn');
    if (addBtn) addBtn.style.display = '';
    renderManageGroupList();

    // 隐藏“清空”按钮
    const clearBtn = document.getElementById('manageBatchClear');
    if (clearBtn) clearBtn.style.display = 'none';
}

/** 批量屏蔽选中的分组（先保存数量再退出批量模式） */
async function batchBlockGroups() {
    if (selectedGroupNames.length === 0) return;

    // 在调用 exitManageBatchMode 之前保存选中数量
    const count = selectedGroupNames.length;

    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const groups = cardData[cardCurrentTab].groups || [];
    selectedGroupNames.forEach(function (name) {
        const g = groups.find(function (group) { return group.name === name; });
        if (g) g.blocked = true;
    });
    await saveCurrentCardData(cardData);
    // 退出批量模式并刷新
    exitManageBatchMode();
    await renderManageGroupList();
    await renderCardGroups();
    await renderCardList();
    showToast('已屏蔽 <span class="toast-highlight">' + count + '</span> 个分组');
}

/** 批量取消屏蔽选中的分组 */
async function batchUnblockGroups() {
    if (selectedGroupNames.length === 0) return;

    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const groups = cardData[cardCurrentTab].groups || [];
    // 记录哪些分组被取消屏蔽了
    let unblockedCount = 0;

    selectedGroupNames.forEach(function (name) {
        const g = groups.find(function (group) { return group.name === name; });
        if (g && g.blocked === true) {
            g.blocked = false;
            unblockedCount++;
        }
    });

    if (unblockedCount === 0) {
        showToast('选中的分组均未屏蔽，无需取消');
        return;
    }

    await saveCurrentCardData(cardData);

    // 退出批量模式并刷新
    exitManageBatchMode();
    await renderManageGroupList();
    await renderCardGroups();
    await renderCardList();

    showToast('已取消屏蔽 <span class="toast-highlight">' + unblockedCount + '</span> 个分组');
}

/* 自定义确认弹窗 */

/** 按钮配置的公共样式（取消 / 危险 / 主要） */
const CONFIRM_CANCEL_BTN = {
    style: 'padding:8px 28px;border-radius:12px;font-size:14px;cursor:pointer;border:1px solid var(--border-soft);background:rgba(200,200,200,0.15);color:var(--text-main);transition:all 0.3s ease-out;font-weight:500;',
    baseBg: 'rgba(200,200,200,0.15)',
    hoverStyle: 'rgba(200,200,200,0.25)'
};
const CONFIRM_DANGER_BTN = {
    style: 'padding:8px 28px;border-radius:12px;font-size:14px;cursor:pointer;border:1px solid rgba(244,67,54,0.3);background:rgba(244,67,54,0.1);color:#d32f2f;transition:all 0.3s ease-out;font-weight:500;',
    baseBg: 'rgba(244,67,54,0.1)',
    hoverStyle: 'rgba(244,67,54,0.2)'
};
const CONFIRM_PRIMARY_BTN = {
    style: 'padding:8px 24px;border-radius:12px;font-size:14px;cursor:pointer;border:1px solid var(--border-soft);background:var(--primary-light);color:var(--text-main);transition:all 0.3s ease-out;font-weight:500;',
    baseBg: 'var(--primary-light)',
    hoverStyle: 'rgba(var(--primary-rgb),0.4)'
};

/**
 * 显示自定义确认弹窗（遮罩 + 卡片 + 标题 + 内容 + 按钮组，支持 Esc / 点遮罩关闭）
 * 供批量清空、批量删除、清空分组字卡等场景复用
 * @param {object} options
 * @param {string} options.modalClass - 弹窗额外类名（用于清理残留实例）
 * @param {number} [options.maxWidth] - 卡片最大宽度（默认 400）
 * @param {boolean} [options.closeBtn] - 是否显示右上角 ✕
 * @param {string} options.iconSVG - 标题图标 SVG（innerHTML）
 * @param {string} options.title - 标题文本
 * @param {function} [options.buildBody] - 自定义构建内容区（返回元素）
 * @param {string} [options.bodyHTML] - 内容区 HTML（buildBody 缺省时使用）
 * @param {string} [options.bodyStyle] - 内容区样式
 * @param {object} [options.confirmInput] - 强确认输入框（可选）：{ placeholder, matchText }
 *   输入内容与 matchText 完全匹配前，标记 requireInput: true 的按钮保持禁用
 * @param {Array<{text:string, style:string, baseBg:string, hoverStyle:string, onClick:function, requireInput?:boolean}>} options.buttons - 按钮配置（点击后自动关闭弹窗）
 */
function showCustomConfirm(options) {
    // 移除可能残留的旧弹窗
    const existingModal = document.querySelector('.' + options.modalClass);
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'confirm-modal ' + options.modalClass;
    // 遮罩层样式由 .confirm-modal 类提供（position/背景/blur/flex/z-index 等）

    const box = document.createElement('div');
    box.className = 'confirm-box';
    // 卡片基础样式由 .confirm-box 类提供，仅动态 max-width 用内联覆盖
    box.style.cssText = 'max-width:' + (options.maxWidth || 400) + 'px;';

    // 标题区（带 ✕ 时标题行更高）
    if (options.closeBtn) {
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;position:relative;margin-bottom:2px;min-height:36px;';
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'position:absolute;top:-6px;right:-4px;width:32px;height:32px;border:none;border-radius:50%;background:transparent;font-size:20px;cursor:pointer;color:var(--text-secondary);transition:all 0.2s ease-out;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;flex-shrink:0;z-index:1;';
        closeBtn.textContent = '✕';
        closeBtn.onmouseover = function () { this.style.background = 'rgba(200,200,200,0.2)'; };
        closeBtn.onmouseout = function () { this.style.background = 'transparent'; };
        headerRow.appendChild(closeBtn);
        const title = document.createElement('span');
        title.style.cssText = 'display:inline-flex;align-items:center;gap:8px;font-size:18px;font-weight:600;color:var(--text-main);padding-top:10px;';
        title.innerHTML = options.iconSVG + options.title;
        headerRow.appendChild(title);
        box.appendChild(headerRow);
    } else {
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;';
        header.innerHTML = options.iconSVG + '<span style="font-size:20px;font-weight:600;color:var(--text-main);">' + options.title + '</span>';
        box.appendChild(header);
    }

    // 内容区
    if (typeof options.buildBody === 'function') {
        box.appendChild(options.buildBody());
    } else if (options.bodyHTML) {
        const content = document.createElement('div');
        content.style.cssText = options.bodyStyle || 'margin:10px 0 8px 0;';
        content.innerHTML = options.bodyHTML;
        box.appendChild(content);
    }

    // 按钮组（样式由 .confirm-btns 类提供）
    const btnGroup = document.createElement('div');
    btnGroup.className = 'confirm-btns';
    const requireInputBtns = [];
    options.buttons.forEach(function (btn) {
        const el = document.createElement('button');
        el.textContent = btn.text;
        el.style.cssText = btn.style;
        // 强确认按钮：初始禁用，输入框内容匹配后才启用
        if (btn.requireInput) {
            requireInputBtns.push(el);
            el.disabled = true;
            el.style.opacity = '0.4';
            el.style.cursor = 'not-allowed';
            el.style.pointerEvents = 'none';
        }
        el.onmouseover = function () { this.style.background = btn.hoverStyle; };
        el.onmouseout = function () { this.style.background = btn.baseBg; };
        el.addEventListener('click', function () { closeModal(); btn.onClick(); });
        btnGroup.appendChild(el);
    });

    // 强确认输入框（可选）：输入与 matchText 完全匹配前禁用 requireInput 按钮
    // 插入在内容区与按钮组之间
    if (options.confirmInput) {
        const inputWrap = document.createElement('div');
        inputWrap.style.cssText = 'margin:10px 0 8px 0;';
        const confirmInput = document.createElement('input');
        confirmInput.type = 'text';
        confirmInput.className = 'confirm-input';
        confirmInput.placeholder = options.confirmInput.placeholder || '';
        confirmInput.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border-soft);border-radius:10px;background:rgba(255,255,255,0.6);font-size:14px;color:var(--text-main);outline:none;box-sizing:border-box;font-family:inherit;transition:border-color 0.2s ease-out;';
        confirmInput.addEventListener('input', function () {
            const matched = confirmInput.value === options.confirmInput.matchText;
            requireInputBtns.forEach(function (b) {
                b.disabled = !matched;
                b.style.opacity = matched ? '' : '0.4';
                b.style.cursor = matched ? 'pointer' : 'not-allowed';
                b.style.pointerEvents = matched ? '' : 'none';
            });
        });
        confirmInput.addEventListener('focus', function () { this.style.borderColor = 'var(--primary-color)'; });
        confirmInput.addEventListener('blur', function () { this.style.borderColor = 'var(--border-soft)'; });
        inputWrap.appendChild(confirmInput);
        box.appendChild(inputWrap);
    }

    box.appendChild(btnGroup);

    modal.appendChild(box);
    document.body.appendChild(modal);

    // ===== 新增修复：确保动态创建的弹窗层级高于所有现有弹窗 =====
    // 调用 modal-focus.js 的 bringModalToFront 提升 z-index
    if (typeof window.bringModalToFront === 'function') {
        window.bringModalToFront(modal);
    }

    /** 关闭弹窗并解绑 Esc 监听 */
    function closeModal() {
        if (modal.parentNode) modal.remove();
        document.removeEventListener('keydown', escHandler);
    }

    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });

    function escHandler(e) {
        if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', escHandler);
}

/** 批量清空分组字卡（弹确认弹窗，显示分组列表和总数） */
async function batchClearGroups() {
    if (selectedGroupNames.length === 0) return;

    const namesToClear = selectedGroupNames.slice();
    const count = namesToClear.length;

    // 从 IndexedDB 读取当前字卡库数据
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const cards = cardData[cardCurrentTab].cards || [];

    // 收集每个选中分组的信息：分组名 + 字卡数量
    const groupInfos = [];
    let totalCardCount = 0;

    namesToClear.forEach(function (name) {
        const cardCount = cards.filter(function (c) { return c.group === name; }).length;
        groupInfos.push({ name: name, cardCount: cardCount });
        totalCardCount += cardCount;
    });

    // 如果所有分组都没有字卡，提示并返回
    if (totalCardCount === 0) {
        showToast('选中的分组没有字卡可清空');
        return;
    }

    showCustomConfirm({
        modalClass: 'batch-clear-confirm-modal',
        maxWidth: 400,
        iconSVG: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="8" y1="8" x2="16" y2="8" stroke-width="2.4"/>
                <line x1="8" y1="12" x2="16" y2="12" stroke-width="2.4"/>
                <line x1="8" y1="16" x2="12" y2="16" stroke-width="2.4"/>
            </svg>`,
        title: '批量清空字卡',
        buildBody: function () {
            const listContainer = document.createElement('div');
            listContainer.style.cssText = 'margin:10px 0 8px 0;text-align:left;';

            // 最多显示5个分组，超出显示省略
            const displayCount = Math.min(5, groupInfos.length);
            const hasMore = groupInfos.length > 5;

            for (let i = 0; i < displayCount; i++) {
                const info = groupInfos[i];
                const item = document.createElement('div');
                item.style.cssText = 'font-size:14px;color:var(--text-main);padding:3px 0;line-height:1.5;';
                item.textContent = '· ' + info.name + '（' + info.cardCount + ' 张字卡）';
                listContainer.appendChild(item);
            }

            if (hasMore) {
                const moreItem = document.createElement('div');
                moreItem.style.cssText = 'font-size:14px;color:var(--text-placeholder);padding:3px 0;line-height:1.5;font-style:italic;';
                moreItem.textContent = '…… 等 ' + (groupInfos.length - 5) + ' 个分组';
                listContainer.appendChild(moreItem);
            }

            const totalText = document.createElement('p');
            totalText.style.cssText = 'font-size:14px;color:var(--text-secondary);margin:4px 0 16px 0;text-align:center;';
            totalText.innerHTML = '共 <strong style="color:var(--text-main);">' + totalCardCount + '</strong> 张字卡将被清空';
            listContainer.appendChild(totalText);
            return listContainer;
        },
        buttons: [
            { text: '取消', style: CONFIRM_CANCEL_BTN.style, baseBg: CONFIRM_CANCEL_BTN.baseBg, hoverStyle: CONFIRM_CANCEL_BTN.hoverStyle, onClick: function () {} },
            {
                text: '确定清空',
                style: CONFIRM_DANGER_BTN.style,
                baseBg: CONFIRM_DANGER_BTN.baseBg,
                hoverStyle: CONFIRM_DANGER_BTN.hoverStyle,
                onClick: function () {
                    executeClearGroupCards(namesToClear).then(function () {
                        // 退出批量模式
                        exitManageBatchMode();
                        return renderManageGroupList().then(function () { return renderCardGroups(); }).then(function () { return renderCardList(); });
                    }).then(function () {
                        // 轻提示：已清空 N 个分组，共 X 张字卡
                        showToast('已清空 <span class="toast-highlight">' + count + '</span> 个分组，共 <span class="toast-highlight">' + totalCardCount + '</span> 张字卡');
                    });
                }
            }
        ]
    });
}


/** 批量删除分组（弹出自定义提示框，让用户选择“一同删除字卡”或“移至未分组”） */
async function batchDeleteGroups() {
    // 如果没有选中任何分组，直接返回
    if (selectedGroupNames.length === 0) return;

    // 复制一份选中列表，防止在操作过程中被修改
    const namesToDelete = selectedGroupNames.slice();
    const count = namesToDelete.length;

    // 从 IndexedDB 读取当前字卡库数据
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    // 获取当前 tab 的分组列表和字卡列表
    const groups = cardData[cardCurrentTab].groups || [];
    const cards = cardData[cardCurrentTab].cards || [];

    // 收集每个选中分组的信息：分组名 + 字卡数量
    const groupInfos = [];
    let totalCardCount = 0;

    namesToDelete.forEach(function (name) {
        // 统计该分组下的字卡数量
        const cardCount = cards.filter(function (c) { return c.group === name; }).length;
        groupInfos.push({ name: name, cardCount: cardCount });
        totalCardCount += cardCount;
    });

    showCustomConfirm({
        modalClass: 'batch-delete-confirm-modal',
        maxWidth: 420,
        closeBtn: true,
        iconSVG: `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.4"/>
                <circle cx="12" cy="16.5" r="1.4" fill="#f5a623" stroke="none"/>
            </svg>`,
        title: '即将批量删除分组',
        buildBody: function () {
            const wrapper = document.createElement('div');

            /* 副标题 */
            const subTitle = document.createElement('p');
            subTitle.style.cssText = 'font-size:14px;color:var(--text-secondary);margin:0 0 14px 0;text-align:center;';
            subTitle.textContent = '将删除以下 ' + count + ' 个分组，共 ' + totalCardCount + ' 张字卡：';
            wrapper.appendChild(subTitle);

            /* 卡片容器（包裹分组列表） */
            const cardWrapper = document.createElement('div');
            cardWrapper.style.cssText = 'background:rgba(255,255,255,0.20);border-radius:12px;padding:10px 14px;margin:0 0 14px 0;border:1px solid rgba(255,255,255,0.15);';

            /* 分组列表（两列网格，左对齐） */
            const gridContainer = document.createElement('div');
            gridContainer.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;text-align:left;';

            groupInfos.forEach(function (info) {
                const item = document.createElement('div');
                item.style.cssText = 'font-size:14px;color:var(--text-main);padding:3px 0;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                item.textContent = '· ' + info.name + '（' + info.cardCount + '张）';
                gridContainer.appendChild(item);
            });

            cardWrapper.appendChild(gridContainer);
            wrapper.appendChild(cardWrapper);

            /* 提示文字 */
            const tipText = document.createElement('p');
            tipText.style.cssText = 'font-size:14px;color:var(--text-secondary);margin:0 0 16px 0;text-align:center;';
            tipText.textContent = '请选择如何处理这些字卡？';
            wrapper.appendChild(tipText);
            return wrapper;
        },
        buttons: [
            {
                text: '一同删除字卡',
                style: CONFIRM_DANGER_BTN.style,
                baseBg: CONFIRM_DANGER_BTN.baseBg,
                hoverStyle: CONFIRM_DANGER_BTN.hoverStyle,
                onClick: function () {
                    executeBatchDeleteGroups(namesToDelete, true, totalCardCount);
                }
            },
            {
                text: '移至未分组',
                style: CONFIRM_PRIMARY_BTN.style,
                baseBg: CONFIRM_PRIMARY_BTN.baseBg,
                hoverStyle: CONFIRM_PRIMARY_BTN.hoverStyle,
                onClick: function () {
                    executeBatchDeleteGroups(namesToDelete, false, totalCardCount);
                }
            }
        ]
    });
}

/** 批量删除分组的执行函数（deleteCards=true 删除字卡，false 移至未分组） */
async function executeBatchDeleteGroups(namesToDelete, deleteCards, totalCardCount) {
    // 从 IndexedDB 读取当前字卡库数据
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    // 获取当前 tab 的分组列表和字卡列表
    let groups = cardData[cardCurrentTab].groups || [];
    const cards = cardData[cardCurrentTab].cards || [];

    // 遍历所有要删除的分组
    namesToDelete.forEach(function (name) {
        // 从分组列表中移除该分组
        const idx = groups.findIndex(function (g) { return g.name === name; });
        if (idx !== -1) groups.splice(idx, 1);

        if (deleteCards) {
            // 模式1：一同删除字卡 — 删除该分组下的所有字卡
            for (let i = cards.length - 1; i >= 0; i--) {
                if (cards[i].group === name) cards.splice(i, 1);
            }
        } else {
            // 模式2：移至未分组 — 将该分组下的所有字卡移到“未分组”
            cards.forEach(function (c) {
                if (c.group === name) c.group = '未分组';
            });
            // 确保“未分组”存在
            if (!groups.some(function (g) { return g.name === '未分组'; })) {
                groups.unshift({ name: '未分组', blocked: false });
            }
        }
    });

    // 保存更新后的数据
    cardData[cardCurrentTab].groups = groups;
    cardData[cardCurrentTab].cards = cards;
    await saveCurrentCardData(cardData);

    // 如果当前选中的分组被删除了，重置选中状态为“全部”
    if (cardSelectedGroup !== '全部' && namesToDelete.includes(cardSelectedGroup)) {
        cardSelectedGroup = '全部';
    }

    // 退出批量管理模式并刷新界面
    exitManageBatchMode();
    await renderManageGroupList();
    await renderCardGroups();
    await renderCardList();

    // 显示操作成功的轻提示
    // 分组数量用绿色（toast-highlight），操作描述用橙色（toast-action）
    const count = namesToDelete.length;
    const actionText = deleteCards
        ? '<span class="toast-action">' + totalCardCount + '张字卡一并删除</span>'
        : '<span class="toast-action">' + totalCardCount + '张字卡移至未分组</span>';
    // 数字前后加空格，显示为“已删除 2 个分组”
    showToast('已删除 <span class="toast-highlight">' + count + '</span> 个分组&nbsp;&nbsp;' + actionText);
}


/** 管理分组弹窗内的内联重命名输入框 */
/** 管理分组弹窗内联改名（单行输入，失焦直接取消） */
function startEditGroupNameInManage(container, currentName) {
    if (container.querySelector('.group-inline-editor')) return;
    const nameSpan = container.querySelector('.group-name');
    const countSpan = container.querySelector('.group-count');
    const actions = container.querySelector('.group-actions');
    const originalName = currentName;
    nameSpan.style.display = 'none'; countSpan.style.display = 'none'; actions.style.display = 'none';

    createInlineEditor(container, {
        value: currentName,
        insertBeforeEl: countSpan,
        wrapStyle: 'display:flex; align-items:center; gap:4px; flex:1;',
        inputStyle: 'flex:1; height:28px; padding:0 8px; border:1px solid var(--border-soft); border-radius:6px; font-size:14px; background:rgba(255,255,255,0.6); color:var(--text-main); outline:none; min-width:60px;',
        btnStyle: 'width:24px;height:24px;border:none;border-radius:50%;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:center;flex-shrink:0;',
        confirmBtnStyle: 'background:var(--primary-light);color:var(--text-main);',
        cancelBtnStyle: 'background:rgba(200,200,200,0.3);color:#999;',
        blurCancel: true,
        onConfirm: async function (newName) {
            const cardData = await getCurrentCardData();
            if (!cardData) return false;
            const groups = cardData[cardCurrentTab].groups || [];
            if (groups.some(g => g.name === newName && g.name !== originalName)) { alert('分组名称已存在'); return false; }
            await renameGroup(originalName, newName);
            nameSpan.style.display = 'inline';
            countSpan.style.display = 'inline';
            nameSpan.textContent = newName;
            container.dataset.group = newName;
            // 重新渲染管理分组列表
            await renderManageGroupList();
            // 重新渲染其他列表
            await renderCardGroups();
            await renderCardList();
            // 确保当前分组的操作按钮可见
            const updatedItem = document.querySelector(`.manage-group-item[data-group="${newName}"]`);
            if (updatedItem) {
                const actionsDiv = updatedItem.querySelector('.group-actions');
                if (actionsDiv) actionsDiv.style.display = 'flex';
            }
            return true;
        },
        onCancel: function () {
            nameSpan.style.display = 'inline';
            countSpan.style.display = 'inline';
            actions.style.display = 'flex';
        }
    });
}

/* 删除分组 */

/** 删除分组：在弹窗内切换选项界面，让用户选择字卡处理方式 */
async function confirmDeleteGroup(groupName, count) {
    const manageModalHeader = document.querySelector('#manageGroupModal .card-sub-header');
    const manageAddGroupBtn = document.querySelector('#manageGroupModal .card-add-group-btn');
    const manageGroupFooter = document.querySelector('#manageGroupModal .manage-group-footer');
    const optionsContainer = document.getElementById('manageGroupOptionsContainer');
    if (!optionsContainer) { alert('页面结构异常，请刷新后重试'); return; }
    const cardSubBody = document.querySelector('#manageGroupModal .card-sub-body');
    const cardSubFooter = document.querySelector('#manageGroupModal .card-sub-footer');
    const listContainer = document.getElementById('manageGroupListContainer');
    const cancelBtn = document.getElementById('manageGroupCancelBtn');
    const closeBtn = document.getElementById('manageGroupCloseBtn');

    // 保存原有的关闭按钮事件
    const originalCloseClick = closeBtn?.onclick;

    // 隐藏标题栏、新增分组按钮、底部操作栏
    if (manageModalHeader) manageModalHeader.style.display = 'none';
    if (manageAddGroupBtn) manageAddGroupBtn.style.display = 'none';
    if (manageGroupFooter) manageGroupFooter.style.display = 'none';
    if (cardSubBody) { cardSubBody.style.paddingLeft = '28px'; cardSubBody.style.paddingRight = '28px'; }
    if (cardSubFooter) cardSubFooter.style.paddingTop = '4px';
    if (listContainer) listContainer.style.display = 'none';

    optionsContainer.innerHTML = '';
    optionsContainer.style.display = 'block';

    // 取消操作函数（恢复所有状态）
    function restoreHeader() {
        if (manageModalHeader) manageModalHeader.style.display = '';
        if (manageAddGroupBtn) manageAddGroupBtn.style.display = '';
        if (manageGroupFooter) manageGroupFooter.style.display = '';
        if (cardSubBody) { cardSubBody.style.paddingLeft = ''; cardSubBody.style.paddingRight = ''; }
        if (cardSubFooter) cardSubFooter.style.paddingTop = '';
        if (listContainer) listContainer.style.display = 'block';
        optionsContainer.style.display = 'none';
        optionsContainer.innerHTML = '';
        // 恢复右上角关闭按钮
        if (closeBtn && originalCloseClick) {
            closeBtn.onclick = originalCloseClick;
        }
        // 移除遮罩点击监听
        const modal = document.getElementById('manageGroupModal');
        if (modal && window._confirmDeleteHandler) {
            modal.removeEventListener('click', window._confirmDeleteHandler, true);
            window._confirmDeleteHandler = null;
        }
        // 恢复取消按钮
        if (cancelBtn && savedOnClick) {
            cancelBtn.onclick = savedOnClick;
        }
    }

    // 保存取消按钮的原始事件
    const savedOnClick = cancelBtn?.onclick;
    if (cancelBtn) {
        cancelBtn.onclick = function () {
            restoreHeader();
        };
    }

    // 修改右上角关闭按钮行为：执行取消操作
    if (closeBtn) {
        closeBtn.onclick = function (e) {
            e.stopPropagation();
            restoreHeader();
        };
    }

    // 添加捕获阶段点击事件：点击遮罩时执行取消操作
    const modal = document.getElementById('manageGroupModal');
    if (modal) {
        // 移除旧的监听器（如果有）
        if (window._confirmDeleteHandler) {
            modal.removeEventListener('click', window._confirmDeleteHandler, true);
        }
        // 创建新的监听器
        window._confirmDeleteHandler = function (e) {
            // 如果点击的是弹窗本身（遮罩），执行取消操作
            if (e.target === modal) {
                e.stopPropagation();
                restoreHeader();
            }
        };
        modal.addEventListener('click', window._confirmDeleteHandler, true);
    }

    // 构建确认内容
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:140px;';
    wrapper.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;padding-top:4px;">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.4"/>
            <circle cx="12" cy="16.5" r="1.4" fill="#f5a623" stroke="none"/>
        </svg>
        <span style="font-size:18px;font-weight:700;color:var(--text-main);">确认</span>
    </div>
    <p style="font-size:15px;color:var(--text-secondary);line-height:1.6;text-align:center;margin:4px 0 16px 0;">
        即将删除分组「<span style="color:var(--primary-color);font-weight:600;">${groupName}</span>」，该分组内有 <span style="color:var(--primary-color);font-weight:600;">${count}</span> 张字卡，请选择如何处理？
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;width:100%;">
        <button class="delete-option-btn" data-action="delete" style="padding:8px 24px;border-radius:12px;font-size:14px;cursor:pointer;border:1px solid rgba(244,67,54,0.3);background:rgba(244,67,54,0.1);color:#d32f2f;transition:all 0.3s ease-out;font-weight:500;">一同删除字卡</button>
        <button class="delete-option-btn" data-action="move" style="padding:8px 24px;border-radius:12px;font-size:14px;cursor:pointer;border:1px solid var(--border-soft);background:var(--primary-light);color:var(--text-main);transition:all 0.3s ease-out;font-weight:500;">移至未分组</button>
    </div>
`;
    optionsContainer.appendChild(wrapper);

    optionsContainer.querySelectorAll('.delete-option-btn').forEach(btn => {
        btn.onclick = async function () {
            // 先恢复界面
            restoreHeader();
            const action = this.dataset.action === 'delete';
            await deleteGroupWithCards(groupName, action);
            const message = action
                ? '已删除分组<span class="toast-highlight">「' + groupName + '」</span>&nbsp;&nbsp;<span class="toast-action">' + count + ' 张字卡一并删除</span>'
                : '已删除分组<span class="toast-highlight">「' + groupName + '」</span>&nbsp;&nbsp;<span class="toast-action">' + count + ' 张字卡移至未分组</span>';
            showToast(message);
        };
    });
}

/** 删除分组并处理其字卡（deleteCards=true 一并删除，false 移至未分组） */
async function deleteGroupWithCards(groupName, deleteCards) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const groups = cardData[cardCurrentTab].groups || [{ name: '未分组', blocked: false }];
    const cards = cardData[cardCurrentTab].cards || [];

    const gi = groups.findIndex(g => g.name === groupName);
    if (gi === -1) return;
    groups.splice(gi, 1);

    if (deleteCards) {
        cardData[cardCurrentTab].cards = cards.filter(c => c.group !== groupName);
    } else {
        cards.forEach(c => { if (c.group === groupName) c.group = '未分组'; });
        if (!groups.some(g => g.name === '未分组')) {
            groups.unshift({ name: '未分组', blocked: false });
        }
    }
    await saveCurrentCardData(cardData);
    if (cardSelectedGroup === groupName) cardSelectedGroup = '全部';
    await renderManageGroupList();
    await renderCardGroups();
    await renderCardList();

    const modal = document.getElementById('manageGroupModal');
    if (modal && !modal.classList.contains('hidden')) {
        document.getElementById('manageGroupListContainer').style.display = 'block';
        document.getElementById('manageGroupOptionsContainer').style.display = 'none';
        document.getElementById('manageGroupOptionsContainer').innerHTML = '';
    }
}

/* 清空分组字卡 */

/** 清空分组字卡的确认弹窗（单个分组） */
async function confirmClearGroupCards(groupName, count) {
    // 如果该分组没有字卡，提示并返回
    if (count === 0) {
        showToast('「' + groupName + '」没有字卡可清空');
        return;
    }

    // 创建自定义确认弹窗
    showCustomConfirm({
        modalClass: 'clear-cards-confirm-modal',
        maxWidth: 380,
        iconSVG: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="8" y1="8" x2="16" y2="8" stroke-width="2.4"/>
                <line x1="8" y1="12" x2="16" y2="12" stroke-width="2.4"/>
                <line x1="8" y1="16" x2="12" y2="16" stroke-width="2.4"/>
            </svg>`,
        title: '清空字卡',
        bodyStyle: 'font-size:15px;color:var(--text-secondary);margin:16px 0 24px 0;line-height:1.6;',
        bodyHTML: '确定要清空分组「<span style="color:var(--primary-color);font-weight:600;">' + groupName + '</span>」里的 <span style="color:var(--primary-color);font-weight:600;">' + count + '</span> 张字卡吗？',
        buttons: [
            { text: '取消', style: CONFIRM_CANCEL_BTN.style, baseBg: CONFIRM_CANCEL_BTN.baseBg, hoverStyle: CONFIRM_CANCEL_BTN.hoverStyle, onClick: function () {} },
            {
                text: '确定清空',
                style: CONFIRM_DANGER_BTN.style,
                baseBg: CONFIRM_DANGER_BTN.baseBg,
                hoverStyle: CONFIRM_DANGER_BTN.hoverStyle,
                onClick: function () {
                    executeClearGroupCards([groupName]).then(function () {
                        // 轻提示：已清空「分组名」的 X 张字卡
                        showToast('已清空<span class="toast-highlight">「' + groupName + '」</span>的 <span class="toast-highlight">' + count + '</span> 张字卡');
                    });
                }
            }
        ]
    });
}

/** 执行清空分组字卡（删除指定分组下的所有字卡，保留分组本身） */
async function executeClearGroupCards(groupNames) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const cards = cardData[cardCurrentTab].cards || [];

    // 遍历所有要清空的分组，删除该分组下的所有字卡
    groupNames.forEach(function (name) {
        for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i].group === name) cards.splice(i, 1);
        }
    });

    cardData[cardCurrentTab].cards = cards;
    await saveCurrentCardData(cardData);

    // 刷新界面
    await renderManageGroupList();
    await renderCardGroups();
    await renderCardList();
}

/* 管理分组拖拽排序 */

/** 设置管理分组列表的拖拽排序（批量模式下禁用） */
function setupManageGroupDrag() {
    // 批量模式下禁止拖拽
    if (isManageGroupBatchMode) return;

    const list = document.getElementById('manageGroupList');
    if (!list) return;

    let dragItem = null;

    list.querySelectorAll('.manage-group-item').forEach(item => {
        item.draggable = true;

        item.ondragstart = function (e) {
            dragItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
            setTimeout(() => { if (dragItem) dragItem.style.opacity = '0.5'; }, 0);
        };

        item.ondragend = function () {
            this.classList.remove('dragging');
            this.style.opacity = '1';
            list.querySelectorAll('.manage-group-item').forEach(el => {
                el.style.borderTop = 'none';
                el.style.borderBottom = 'none';
            });
            dragItem = null;
        };

        item.ondragover = function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (this === dragItem) return;
            const midY = this.getBoundingClientRect().top + this.offsetHeight / 2;
            list.querySelectorAll('.manage-group-item').forEach(el => {
                el.style.borderTop = 'none';
                el.style.borderBottom = 'none';
            });
            this.style[e.clientY < midY ? 'borderTop' : 'borderBottom'] = '2px solid var(--primary-color)';
        };

        item.ondrop = async function (e) {
            e.preventDefault();
            // 保存拖拽元素的引用，防止在异步过程中被清空
            const dragged = dragItem;
            if (!dragged || dragged === this) return;

            const cardData = await getCurrentCardData();
            if (!cardData) return;

            const groups = cardData[cardCurrentTab].groups || [{ name: '未分组', blocked: false }];
            const fromIdx = groups.findIndex(g => g.name === dragged.dataset.group);
            const toIdx = groups.findIndex(g => g.name === this.dataset.group);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

            const it = groups.splice(fromIdx, 1)[0];
            groups.splice(toIdx, 0, it);
            await saveCurrentCardData(cardData);
            await renderManageGroupList();
            await renderCardGroups();
        };
    });
}

/* 表情包网格 */

/** 渲染表情包网格（图片懒加载 + 分块渲染） */
async function renderStickerGrid() {
    const grid = document.getElementById('stickerGrid');
    if (!grid) return;

    const cardData = await getCurrentCardData();
    if (!cardData) {
        grid.innerHTML = '';
        return;
    }

    const stickers = cardData.sticker.cards || [];

    if (stickers.length === 0) {
        grid.innerHTML = `
            <div class="sticker-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <circle cx="15.5" cy="8.5" r="1.5" />
                    <path d="M8 15s1.5 2 4 2 4-2 4-2" />
                </svg>
                <div class="empty-text">暂无表情包</div>
                <div class="empty-hint">请点击下方「新增表情包」按钮添加</div>
            </div>
        `;
        return;
    }

    // 保存滚动位置：重建会清空容器内容，浏览器会把滚动条顶回顶部（用户会看到“滑动条自己往上走”)
    const prevScrollTop = grid.scrollTop;
    await renderChunked(grid, stickers, function (sticker, index) {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        if (isManageMode && currentManageType === 'sticker') {
            item.classList.add('manage-mode');
        }
        item.dataset.index = index;

        const checkbox = document.createElement('div');
        checkbox.className = 'item-checkbox' + (selectedItems.includes(index) ? ' checked' : '');
        checkbox.dataset.index = index;

        const img = document.createElement('img');
        img.src = sticker.dataUrl;
        img.alt = sticker.name || '表情包';
        img.loading = 'lazy';  // 懒加载：滚动到可视区域时才加载图片

        const delBtn = document.createElement('button');
        delBtn.className = 'sticker-delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = '删除该表情';

        delBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (isManageMode) return;
            showConfirmModal('确认删除', '确定要删除该表情包吗？', async function () {
                await deleteSticker(index);
            });
        });

        item.appendChild(checkbox);
        item.appendChild(img);
        item.appendChild(delBtn);

        item.addEventListener('click', function (e) {
            if (!isManageMode || currentManageType !== 'sticker') return;
            if (e.target.closest('.sticker-delete-btn')) return;
            toggleSelectItem(index, 'sticker');
        });
        return item;
    });
    grid.scrollTop = prevScrollTop; // 恢复滚动位置

    updateManageUI('sticker');
    updateSelectAllButton();
}

/** 删除单个表情包 */
async function deleteSticker(index) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const stickers = cardData.sticker.cards || [];
    if (index < 0 || index >= stickers.length) return;

    stickers.splice(index, 1);
    await saveCurrentCardData(cardData);
    await renderStickerGrid();
}

/* Emoji 网格 */

/** 渲染 Emoji 网格（分块渲染） */
async function renderEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;

    const cardData = await getCurrentCardData();
    if (!cardData) {
        grid.innerHTML = '';
        return;
    }

    const emojis = cardData.emoji.cards || [];

    if (emojis.length === 0) {
        grid.innerHTML = `
            <div class="sticker-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L15.5 8.5L22 12L15.5 15.5L12 22L8.5 15.5L2 12L8.5 8.5Z" />
                </svg>
                <div class="empty-text">暂无EMOJI</div>
                <div class="empty-hint">请点击下方「新增 Emoji」按钮添加</div>
            </div>
        `;
        return;
    }

    // 保存滚动位置：重建会清空容器内容，浏览器会把滚动条顶回顶部（用户会看到“滑动条自己往上走”)
    const prevScrollTop = grid.scrollTop;
    await renderChunked(grid, emojis, function (emoji, index) {
        const item = document.createElement('div');
        item.className = 'sticker-item emoji-item';
        if (isManageMode && currentManageType === 'emoji') {
            item.classList.add('manage-mode');
        }
        item.dataset.index = index;

        const checkbox = document.createElement('div');
        checkbox.className = 'item-checkbox' + (selectedItems.includes(index) ? ' checked' : '');
        checkbox.dataset.index = index;

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'emoji-char';
        emojiSpan.textContent = emoji.emoji || '😊';
        emojiSpan.style.cssText = 'font-size:30px; line-height:1; display:flex; align-items:center; justify-content:center; width:100%; height:100%;';

        const delBtn = document.createElement('button');
        delBtn.className = 'sticker-delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = '删除该 Emoji';

        delBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (isManageMode) return;
            showConfirmModal('确认删除', '确定要删除该 Emoji 吗？', async function () {
                await deleteEmoji(index);
            });
        });

        item.appendChild(checkbox);
        item.appendChild(emojiSpan);
        item.appendChild(delBtn);

        item.addEventListener('click', function (e) {
            if (!isManageMode || currentManageType !== 'emoji') return;
            if (e.target.closest('.sticker-delete-btn')) return;
            toggleSelectItem(index, 'emoji');
        });
        return item;
    });
    grid.scrollTop = prevScrollTop; // 恢复滚动位置

    updateManageUI('emoji');
    updateSelectAllButton();
}

/** 删除单个 Emoji */
async function deleteEmoji(index) {
    const cardData = await getCurrentCardData();
    if (!cardData) return;
    const emojis = cardData.emoji.cards || [];
    if (index < 0 || index >= emojis.length) return;

    emojis.splice(index, 1);
    await saveCurrentCardData(cardData);
    await renderEmojiGrid();
}

/** 判断字符是否为 Emoji */
function isEmojiCharacter(char) {
    const emojiRegex = /\p{Emoji}/u;
    return emojiRegex.test(char);
}

/* 批量删除功能（表情包 / Emoji） */

/** 更新“管理”按钮的显示状态 */
function updateManageBtnVisibility(type) {
    const manageBtn = document.getElementById('cardManageBtn');
    if (!manageBtn) return;

    if (type === 'sticker' || type === 'emoji') {
        if (isManageMode && currentManageType === type) {
            manageBtn.classList.add('active');
            manageBtn.textContent = '✕ 退出管理';
        } else {
            manageBtn.classList.remove('active');
            manageBtn.innerHTML = GEAR_ICON + ' 管理';
        }
    }
}

/** 进入 / 退出批量管理模式（表情包 / Emoji） */
function toggleManageMode(type) {
    if (!type) return;

    if (isManageMode && currentManageType === type) {
        exitManageMode();
        return;
    }

    if (isManageMode) {
        exitManageMode();
    }

    isManageMode = true;
    currentManageType = type;
    selectedItems = [];

    // 进入管理：只切换网格管理样式，不重建 DOM（重建会清空容器导致滚动条被顶回顶部）
    applyManageModeToGrid(type);

    const bar = document.getElementById('batchDeleteBar');
    if (bar) bar.classList.remove('hidden');
    updateBatchDeleteCount();
    updateSelectAllButton();
    updateManageUI(type);
}

/** 进入/退出管理模式时切换网格的管理样式（不重建 DOM，避免滚动条跳动） */
function applyManageModeToGrid(type) {
    const grid = document.getElementById(type === 'sticker' ? 'stickerGrid' : 'emojiGrid');
    if (!grid) return;
    const inManage = isManageMode && currentManageType === type;
    const children = grid.children;
    for (let i = 0; i < children.length; i++) {
        const item = children[i];
        if (!item.classList.contains('sticker-item')) continue;
        if (inManage) {
            item.classList.add('manage-mode');
            item.classList.toggle('selected', selectedItems.includes(i));
        } else {
            item.classList.remove('manage-mode', 'selected');
        }
        const checkbox = item.querySelector('.item-checkbox');
        if (checkbox) {
            checkbox.classList.toggle('checked', inManage && selectedItems.includes(i));
        }
    }
}

/** 点选单个条目时只更新其视觉状态（不重建网格） */
function updateItemSelection(index, type) {
    const grid = document.getElementById(type === 'sticker' ? 'stickerGrid' : 'emojiGrid');
    if (!grid) return;
    const item = grid.children[index];
    if (!item) return;
    const checked = selectedItems.includes(index);
    item.classList.toggle('selected', checked);
    const checkbox = item.querySelector('.item-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', checked);
}

/** 退出批量管理模式 */
function exitManageMode() {
    const prevType = currentManageType;
    isManageMode = false;
    selectedItems = [];
    currentManageType = '';

    const bar = document.getElementById('batchDeleteBar');
    if (bar) bar.classList.add('hidden');

    if (prevType === 'sticker' || prevType === 'emoji') {
        // 退出管理：只移除网格管理样式，不重建 DOM（避免滚动条跳动）
        applyManageModeToGrid(prevType);
        updateManageBtnVisibility(prevType);
    }
}

/** 切换单个条目的选中状态 */
function toggleSelectItem(index, type) {
    if (!isManageMode || currentManageType !== type) return;

    const idx = selectedItems.indexOf(index);
    if (idx > -1) {
        selectedItems.splice(idx, 1);
    } else {
        selectedItems.push(index);
    }

    // 只切换该条目的视觉状态，不重建整个网格
    updateItemSelection(index, type);

    updateBatchDeleteCount();
    updateSelectAllButton();
}

/** 更新批量删除计数与确认按钮状态 */
function updateBatchDeleteCount() {
    const countEl = document.getElementById('batchDeleteCount');
    const confirmBtn = document.getElementById('batchDeleteConfirm');
    if (countEl) {
        countEl.textContent = '已选中 ' + selectedItems.length + ' 个';
    }
    if (confirmBtn) {
        confirmBtn.disabled = selectedItems.length === 0;
    }
}

/** 更新批量管理模式 UI（按钮、操作栏） */
function updateManageUI(type) {
    updateManageBtnVisibility(type);
    if (isManageMode && currentManageType === type) {
        const bar = document.getElementById('batchDeleteBar');
        if (bar) bar.classList.remove('hidden');
        updateBatchDeleteCount();
    }
}

/** 确认批量删除（弹确认框） */
function confirmBatchDelete() {
    if (selectedItems.length === 0) return;

    const type = currentManageType;
    const count = selectedItems.length;
    const label = type === 'sticker' ? '表情包' : 'Emoji';

    showConfirmModal('确认批量删除',
        '确定要删除选中的 ' + count + ' 个' + label + '吗？此操作不可恢复。',
        async function () {
            await executeBatchDelete();
        }
    );
}

/** 全选 / 取消全选 */
function toggleSelectAll() {
    if (!isManageMode) return;
    (async function () {
        const cardData = await getCurrentCardData();
        if (!cardData) return;
        const cards = cardData[currentManageType]?.cards || [];
        const total = cards.length;
        if (total === 0) return;

        if (selectedItems.length === total) {
            selectedItems = [];
        } else {
            selectedItems = cards.map(function (_, index) { return index; });
        }

        applyManageModeToGrid(currentManageType);
        updateBatchDeleteCount();
        updateSelectAllButton();
    })();
}

/** 更新全选按钮的文字与可用状态 */
function updateSelectAllButton() {
    const btn = document.getElementById('batchSelectAll');
    if (!btn) return;
    (async function () {
        const cardData = await getCurrentCardData();
        if (!cardData) return;
        const cards = cardData[currentManageType]?.cards || [];
        const total = cards.length;
        if (total === 0) {
            btn.textContent = '全选';
            btn.disabled = true;
        } else {
            btn.textContent = (selectedItems.length === total) ? '取消全选' : '全选';
            btn.disabled = false;
        }
    })();
}

/** 执行批量删除（按索引倒序删除，避免错位） */
async function executeBatchDelete() {
    const type = currentManageType;
    if (!type) return;

    const cardData = await getCurrentCardData();
    if (!cardData) return;

    const sortedIndexes = selectedItems.slice().sort(function (a, b) { return b - a; });
    const cards = cardData[type].cards || [];

    sortedIndexes.forEach(function (index) {
        cards.splice(index, 1);
    });

    await saveCurrentCardData(cardData);

    selectedItems = [];
    exitManageMode();

    await renderCardList();
}

/** 绑定批量删除相关事件（管理按钮、全选、取消、确认、Esc） */
function bindBatchDeleteEvents() {
    const manageBtn = document.getElementById('cardManageBtn');
    if (manageBtn) {
        manageBtn.addEventListener('click', function () {
            const type = cardCurrentTab === 'sticker' ? 'sticker' : (cardCurrentTab === 'emoji' ? 'emoji' : null);
            if (!type) return;
            toggleManageMode(type);
        });
    }

    const selectAllBtn = document.getElementById('batchSelectAll');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', toggleSelectAll);
    }

    const cancelBtn = document.getElementById('batchDeleteCancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
            exitManageMode();
        });
    }

    const confirmBtn = document.getElementById('batchDeleteConfirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
            confirmBatchDelete();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isManageMode) {
            exitManageMode();
        }
    });
}

/** 打开新增分组弹窗 */
function openAddGroupModal() {
    document.getElementById('addGroupModal').classList.remove('hidden');
    const inp = document.getElementById('addGroupInput');
    inp.value = '';
    inp.focus();
}

/** 关闭新增分组弹窗 */
function closeAddGroupModal() {
    document.getElementById('addGroupModal').classList.add('hidden');
}

/* 字卡库下拉切换 */

/** 字卡库切换下拉实例（复用通用下拉工厂 createLibDropdown） */
const cardLibDropdown = createLibDropdown({
    dropdownId: 'cardLibDropdown',
    listId: 'cardLibDropdownList',
    switchBtnId: 'cardLibSwitch',
    labelId: 'cardLibSwitchLabel',
    itemClass: 'card-lib-dropdown-item',
    onPick: switchCardLib
});

/** 渲染字卡库切换下拉列表（通用 + 各联系人） */
function renderCardLibDropdown() {
    cardLibDropdown.render();
}

/** 切换字卡库：保存并刷新相关界面 */
async function switchCardLib(libKey) {
    await saveCurrentCardLib(libKey);

    cardSelectedGroup = '全部';
    cardSearchKeyword = '';
    var searchInput = document.getElementById('cardSearchInput');
    if (searchInput) searchInput.value = '';

    await updateCardLibSwitchLabel(libKey);
    await updateManageGroupLibLabel(libKey);

    await renderCardGroups();
    await renderCardList();

    var manageModal = document.getElementById('manageGroupModal');
    if (manageModal && !manageModal.classList.contains('hidden')) {
        await renderManageGroupList();
    }

    closeManageGroupLibDropdown();
}

/** 更新字卡库切换按钮上的名称 */
async function updateCardLibSwitchLabel(libKey) {
    await cardLibDropdown.updateLabel(libKey);
}

/** 打开 / 关闭字卡库切换下拉 */
function toggleCardLibDropdown() {
    cardLibDropdown.toggle();
}

/** 关闭字卡库切换下拉 */
function closeCardLibDropdown() {
    cardLibDropdown.close();
}

/** 绑定字卡库切换事件（点击、外部点击、Esc） */
function bindCardLibSwitchEvents() {
    cardLibDropdown.bind();
}

/* 管理分组弹窗下拉切换 */

/** 管理分组弹窗的字卡库切换下拉实例 */
const manageGroupLibDropdown = createLibDropdown({
    dropdownId: 'manageGroupLibDropdown',
    listId: 'manageGroupLibDropdownList',
    switchBtnId: 'manageGroupLibSwitch',
    labelId: 'manageGroupLibLabel',
    itemClass: 'card-lib-dropdown-item',
    onPick: switchCardLib
});

/** 渲染管理分组弹窗的字卡库切换下拉 */
function renderManageGroupLibDropdown() {
    manageGroupLibDropdown.render();
}

/** 打开 / 关闭管理分组弹窗的字卡库切换下拉 */
function toggleManageGroupLibDropdown() {
    manageGroupLibDropdown.toggle();
}

/** 关闭管理分组弹窗的字卡库切换下拉 */
function closeManageGroupLibDropdown() {
    manageGroupLibDropdown.close();
}

/** 更新管理分组弹窗的当前字卡库名称 */
async function updateManageGroupLibLabel(libKey) {
    await manageGroupLibDropdown.updateLabel(libKey);
}

/** 绑定管理分组弹窗字卡库切换事件 */
function bindManageGroupLibSwitchEvents() {
    manageGroupLibDropdown.bind();
}

/* 新增字卡 */

let addCardSelectedFiles = [];   // 新增表情包时选择的文件列表

/* 表情包上传压缩 */

// 压缩阈值与参数：超过 200KB 的静态图才压缩；最长边限制 400px；WebP 质量 0.8
const STICKER_COMPRESS_SIZE_THRESHOLD = 200 * 1024;
const STICKER_MAX_EDGE = 400;
const STICKER_COMPRESS_QUALITY = 0.8;

/**
 * 表情包图片压缩：GIF 动图 / 小图（≤200KB）原样保存，其余缩放 + WebP 压缩
 * @param {File} file - 用户选择的图片文件
 * @returns {Promise<string>} 处理后的 dataUrl
 */
function compressStickerImage(file) {
    return new Promise(function (resolve) {
        // GIF 动图不压缩（保留动画）
        if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
            const reader = new FileReader();
            reader.onload = function (ev) { resolve(ev.target.result); };
            reader.readAsDataURL(file);
            return;
        }
        // 小图不压缩（避免二次损伤）
        if (file.size <= STICKER_COMPRESS_SIZE_THRESHOLD) {
            const reader = new FileReader();
            reader.onload = function (ev) { resolve(ev.target.result); };
            reader.readAsDataURL(file);
            return;
        }
        // 大图：读取 → 缩放 → 导出
        const reader = new FileReader();
        reader.onload = function (ev) {
            const originalDataUrl = ev.target.result;
            const img = new Image();
            img.onload = function () {
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                // 最长边限制在 STICKER_MAX_EDGE，等比缩放
                if (w > STICKER_MAX_EDGE || h > STICKER_MAX_EDGE) {
                    const scale = STICKER_MAX_EDGE / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                // 仅当原图是 PNG 时检查透明通道（JPEG 无透明）
                let hasAlpha = false;
                if (file.type === 'image/png') {
                    try {
                        const imageData = ctx.getImageData(0, 0, w, h);
                        const d = imageData.data;
                        for (let i = 3; i < d.length; i += 4) {
                            if (d[i] < 255) { hasAlpha = true; break; }
                        }
                    } catch (e) { }
                }
                // 有透明 → PNG（保留透明），否则 WebP（体积更小）
                const mime = hasAlpha ? 'image/png' : 'image/webp';
                const compressed = canvas.toDataURL(mime, STICKER_COMPRESS_QUALITY);
                // 若压缩后反而更大（极小概率），退回原图
                resolve(compressed.length < originalDataUrl.length ? compressed : originalDataUrl);
            };
            img.onerror = function () {
                // 图片加载失败则原样保存
                resolve(originalDataUrl);
            };
            img.src = originalDataUrl;
        };
        reader.readAsDataURL(file);
    });
}

/** 打开新增字卡弹窗（表情包直接触发文件选择） */
function openAddCardModal() {
    /* 表情包 */
    if (cardCurrentTab === 'sticker') {
        const tempInput = document.createElement('input');
        tempInput.type = 'file';
        tempInput.accept = 'image/png,image/jpg,image/jpeg,image/gif,image/webp';
        tempInput.multiple = true;
        tempInput.style.display = 'none';
        document.body.appendChild(tempInput);

        tempInput.click();

        tempInput.onchange = async function (e) {
            const files = e.target.files;
            if (!files || files.length === 0) {
                tempInput.remove();
                return;
            }

            const cardData = await getCurrentCardData();
            if (!cardData) {
                alert('请先创建联系人');
                tempInput.remove();
                return;
            }

            const cards = cardData[cardCurrentTab].cards || [];
            const group = '未分组';

            const results = await Promise.all(Array.from(files).map(async function (file) {
                const dataUrl = await compressStickerImage(file);
                return {
                    dataUrl: dataUrl,
                    name: file.name,
                    group: group,
                    blocked: false
                };
            }));

            results.forEach(function (r) {
                cards.push(r);
            });
            await saveCurrentCardData(cardData);
            await renderStickerGrid();
            await renderCardGroups();
            showToast('成功添加 <span class="toast-highlight">' + results.length + '</span> 张表情包');
            tempInput.remove();
        };

        tempInput.oncancel = function () {
            tempInput.remove();
        };

        return;
    }

    /* 文字字卡 / Emoji */
    const modal = document.getElementById('addCardModal');
    if (!modal) return;
    const title = document.getElementById('addCardTitle');
    const typeMap = { text: '字卡', sticker: '表情包', emoji: 'Emoji' };
    title.textContent = '新增' + typeMap[cardCurrentTab];

    const select = document.getElementById('addCardGroupSelect');
    (async function () {
        const cardData = await getCurrentCardData();
        if (!cardData) {
            alert('请先创建联系人');
            return;
        }

        let groups = cardData[cardCurrentTab].groups || [{ name: '未分组', blocked: false }];
        groups = await normalizeCardGroups(cardData, cardCurrentTab);
        if (groups.length === 0) groups = [{ name: '未分组', blocked: false }];

        select.innerHTML = '';
        groups.forEach(function (g) {
            const groupName = g.name || g;
            const o = document.createElement('option');
            o.value = groupName;
            o.textContent = groupName;
            if (groupName === cardSelectedGroup || (cardSelectedGroup === '全部' && groupName === '未分组')) {
                o.selected = true;
            }
            select.appendChild(o);
        });
    })();

    const textarea = document.getElementById('addCardTextarea');
    const fileInput = document.getElementById('addCardFileInput');
    const fileBtn = document.getElementById('addCardFileBtn');
    const filePreview = document.getElementById('addCardFilePreview');
    const emojiInput = document.getElementById('addCardEmojiInput');
    const contentLabel = document.getElementById('addCardContentLabel');

    textarea.value = '';
    emojiInput.value = '';
    fileInput.value = '';
    filePreview.innerHTML = '';
    addCardSelectedFiles = [];

    textarea.style.display = 'none';
    fileInput.style.display = 'none';
    fileBtn.style.display = 'none';
    filePreview.style.display = 'none';
    emojiInput.style.display = 'none';

    if (cardCurrentTab === 'text') {
        textarea.style.display = 'block';
        contentLabel.textContent = '字卡内容（每行一条）';
        textarea.rows = 4;
    } else if (cardCurrentTab === 'emoji') {
        emojiInput.style.display = 'block';
        contentLabel.textContent = 'Emoji（输入一个或多个 Emoji，不用换行）';
        const groupLabel = document.querySelector('#addCardModal .card-sub-body label:first-child');
        const groupSelect = document.getElementById('addCardGroupSelect');
        if (groupLabel) groupLabel.style.display = 'none';
        if (groupSelect) groupSelect.style.display = 'none';
    }

    modal.classList.remove('hidden');
}

/** 关闭新增字卡弹窗 */
function closeAddCardModal() {
    document.getElementById('addCardModal').classList.add('hidden');
    addCardSelectedFiles = [];
}

/** 确认新增字卡（文字去重 / Emoji 识别 / 表情包读取，成功后刷新并轻提示） */
async function confirmAddCard() {
    const currentLib = await getCurrentCardLib();
    const isGlobal = (currentLib === 'global');

    let cardData;
    if (isGlobal) {
        cardData = await getGlobalCardData();
    } else {
        const contactId = parseInt(currentLib.replace('contact_', ''));
        const contact = await getContactById(contactId);
        if (!contact) {
            showToast('联系人不存在');
            return;
        }
        cardData = await getCardData(contactId);
    }

    if (!cardData) {
        showToast('数据加载失败');
        return;
    }

    const group = document.getElementById('addCardGroupSelect').value.trim().replace(/\s+/g, ' ');
    const cards = cardData[cardCurrentTab].cards || [];

    /* 文字字卡 */
    if (cardCurrentTab === 'text') {
        const lines = document.getElementById('addCardTextarea').value.split('\n').map(s => s.trim()).filter(s => s);
        if (!lines.length) {
            showToast('请输入字卡内容');
            return;
        }

        let globalTexts = [];
        if (!isGlobal) {
            const globalData = await getGlobalCardData();
            if (globalData && globalData.text && globalData.text.cards) {
                globalTexts = globalData.text.cards.map(function (c) { return c.text; });
            }
        }

        const existingTexts = cards.map(function (c) { return c.text; });
        const duplicateList = [];
        const validLines = [];

        lines.forEach(function (text) {
            if (existingTexts.includes(text)) {
                return;
            }
            if (!isGlobal && globalTexts.includes(text)) {
                duplicateList.push(text);
                return;
            }
            validLines.push(text);
        });

        if (duplicateList.length > 0) {
            const msg = '字卡<span class="toast-highlight">「' + duplicateList.join('」「') + '」</span>已在通用字卡库';
            showToast(msg);
        }

        validLines.forEach(function (text) {
            cards.push({ text: text, group: group, blocked: false });
        });

        if (validLines.length === 0 && duplicateList.length > 0) {
            await saveCurrentCardData(cardData);
            closeAddCardModal();
            await renderCardList();
            await renderCardGroups();
            return;
        }
        if (validLines.length === 0) {
            showToast('没有新增的字卡（全部已存在）');
            return;
        }

        await saveCurrentCardData(cardData);
        closeAddCardModal();
        await renderCardList();
        await renderCardGroups();
        showToast('成功添加 <span class="toast-highlight">' + validLines.length + '</span> 张字卡');
        return;
    }

    /* Emoji */
    if (cardCurrentTab === 'emoji') {
        const inputText = document.getElementById('addCardEmojiInput').value || '';
        if (!inputText) {
            showToast('请输入至少一个 Emoji');
            return;
        }
        const chars = Array.from(inputText);
        const emojiChars = [];
        chars.forEach(function (char) {
            if (isEmojiCharacter(char)) {
                emojiChars.push(char);
            }
        });
        if (emojiChars.length === 0) {
            showToast('未检测到有效的 Emoji 字符，请重新输入');
            return;
        }
        const existing = cards.map(function (c) { return c.emoji; });
        let addedCount = 0;
        emojiChars.forEach(function (emoji) {
            if (!existing.includes(emoji)) {
                cards.push({ emoji: emoji, group: '未分组', blocked: false });
                existing.push(emoji);
                addedCount++;
            }
        });
        if (addedCount === 0) {
            showToast('所有 Emoji 都已存在，没有新增');
            return;
        }

        await saveCurrentCardData(cardData);
        closeAddCardModal();
        await renderCardList();
        await renderCardGroups();
        showToast('成功添加 <span class="toast-highlight">' + addedCount + '</span> 个 Emoji');
        return;
    }

    /* 表情包 */
    if (cardCurrentTab === 'sticker') {
        if (!addCardSelectedFiles.length) {
            showToast('请选择图片');
            return;
        }
        const results = [];
        let loaded = 0;
        addCardSelectedFiles.forEach(async function (file) {
            const dataUrl = await compressStickerImage(file);
            results.push({ dataUrl: dataUrl, name: file.name });
            loaded++;
            if (loaded === addCardSelectedFiles.length) {
                results.forEach(function (r) {
                    cards.push({ dataUrl: r.dataUrl, name: r.name, group: group, blocked: false });
                });
                (async function () {
                    await saveCurrentCardData(cardData);
                    closeAddCardModal();
                    await renderCardList();
                    await renderCardGroups();
                    showToast('成功添加 <span class="toast-highlight">' + results.length + '</span> 张表情包');
                })();
            }
        });
        return;
    }

    await saveCurrentCardData(cardData);
    closeAddCardModal();
    await renderCardList();
    await renderCardGroups();
}

/** 绑定表情包文件上传（点击按钮触发选择，预览图片） */
function setupCardFileUpload() {
    const fileInput = document.getElementById('addCardFileInput');
    const fileBtn = document.getElementById('addCardFileBtn');
    const preview = document.getElementById('addCardFilePreview');
    if (!fileInput || !fileBtn) return;
    fileBtn.onclick = () => fileInput.click();
    fileInput.onchange = function (e) {
        const files = e.target.files;
        if (!files.length) return;
        addCardSelectedFiles = Array.from(files);
        preview.innerHTML = '';
        addCardSelectedFiles.forEach(f => {
            const r = new FileReader();
            r.onload = ev => { const img = document.createElement('img'); img.src = ev.target.result; preview.appendChild(img); };
            r.readAsDataURL(f);
        });
    };
}

/* 搜索 */

/** 绑定搜索框：输入时实时过滤字卡列表 */
function bindCardSearch() {
    const input = document.getElementById('cardSearchInput');
    if (!input) return;
    input.addEventListener('input', function () {
        cardSearchKeyword = this.value;
        renderCardList();
    });
}

/* 字卡库导入 / 导出 */

/** 获取当前字卡库的显示名称（通用 / 联系人名） */
async function getCurrentCardLibName() {
    const lib = await getCurrentCardLib();
    if (lib === 'global') return '通用';
    const id = parseInt(lib.replace('contact_', ''));
    const contact = await getContactById(id);
    return contact ? contact.name : '通用';
}

/** 统计某类型字卡数量 */
function countCardLibType(cardData, type) {
    return (cardData && cardData[type] && cardData[type].cards) ? cardData[type].cards.length : 0;
}

/** 导出字卡库：弹出范围选择确认弹窗 */
async function exportCardLib() {
    const cardData = await getCurrentCardData();
    if (!cardData) { showToast('❌ 字卡库数据读取失败'); return; }

    const libName = await getCurrentCardLibName();
    const textCount = countCardLibType(cardData, 'text');
    const emojiCount = countCardLibType(cardData, 'emoji');
    const stickerCount = countCardLibType(cardData, 'sticker');
    if (textCount + emojiCount + stickerCount === 0) {
        showToast('当前字卡库是空的，没有内容可导出');
        return;
    }

    // 闭包变量：radio 变更时同步，onClick 时弹窗已移除，不能再查询 DOM
    let selectedScope = 'all';

    showCustomConfirm({
        modalClass: 'cardlib-export-confirm-modal',
        maxWidth: 400,
        iconSVG: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        title: '导出字卡库',
        buildBody: function () {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin:10px 0 8px 0;';

            const info = document.createElement('div');
            info.style.cssText = 'font-size:13px;color:var(--text-secondary);text-align:center;margin-bottom:10px;line-height:1.7;';
            info.innerHTML = '字卡库：<strong style="color:var(--text-main);">' + libName + '</strong><br>' +
                '字卡 ' + textCount + ' 张 · 表情包 ' + stickerCount + ' 张 · Emoji ' + emojiCount + ' 个';
            wrap.appendChild(info);

            const group = document.createElement('div');
            group.className = 'clear-scope-group';

            const options = [
                { value: 'all', label: '全部（字卡 + 表情包 + Emoji）', checked: true },
                { value: 'text', label: '仅字卡' },
                { value: 'sticker', label: '仅表情包' },
                { value: 'emoji', label: '仅Emoji' }
            ];
            options.forEach(function (opt) {
                const label = document.createElement('label');
                label.className = 'clear-scope-option';
                label.style.fontSize = '13px';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'cardlibExportScope';
                radio.value = opt.value;
                radio.checked = !!opt.checked;
                radio.addEventListener('change', function () {
                    if (radio.checked) selectedScope = opt.value;
                });
                const span = document.createElement('span');
                span.textContent = opt.label;
                label.appendChild(radio);
                label.appendChild(span);
                group.appendChild(label);
            });

            wrap.appendChild(group);
            return wrap;
        },
        buttons: [
            Object.assign({}, CONFIRM_CANCEL_BTN, { text: '取消', onClick: function () {} }),
            Object.assign({}, CONFIRM_PRIMARY_BTN, { text: '导出', onClick: function () {
                doExportCardLib(selectedScope);
            } })
        ]
    });
}

/** 执行导出：按范围生成 JSON 文件并下载 */
async function doExportCardLib(scope) {
    const cardData = await getCurrentCardData();
    if (!cardData) { showToast('❌ 字卡库数据读取失败'); return; }
    const lib = await getCurrentCardLib();
    const libName = await getCurrentCardLibName();

    const types = scope === 'all' ? ['text', 'emoji', 'sticker'] : [scope];
    const data = {};
    types.forEach(function (t) {
        data[t] = cardData[t] || { groups: [{ name: '未分组', blocked: false }], cards: [] };
    });

    const now = new Date();
    const pad = function (n) { return n.toString().padStart(2, '0'); };
    const exportedAt = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' +
        pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

    const payload = {
        app: '梦角字卡传讯网站',
        type: 'cardLib',
        version: 1,
        sourceLib: lib,
        sourceLibName: libName,
        exportedAt: exportedAt,
        scope: scope,
        data: data
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const filename = '字卡库_' + libName + '_' + exportedAt.replace(/[: ]/g, '').slice(0, 14) + '.json';
    downloadFile(blob, filename, 'application/json');
    showToast('✅ 已导出 <span class="toast-highlight">' + filename + '</span>');
}

/* 从字卡库导出 Word (.docx) 文档 */

/**
 * 导出 Word：统计可导出的分组/字卡 → 确认弹窗 → 生成 docx 下载
 * 格式（与用户模板一致）：分组名称=小一(24pt)矢车菊蓝黑体，字卡=小四(12pt)黑色黑体，分组之间空三行
 */
async function exportCardLibToDocx() {
    const cardData = await getCurrentCardData();
    if (!cardData) { showToast('❌ 字卡库数据读取失败'); return; }
    const libName = await getCurrentCardLibName();
    const textData = cardData.text;
    if (!textData || !textData.cards || textData.cards.length === 0) {
        showToast('当前字卡库没有可导出的字卡（Word 仅支持字卡）');
        return;
    }

    // 只导出有字卡的分组（空分组不导出），字卡按分组内原顺序
    const groups = [];
    textData.groups.forEach(function (g) {
        const cards = textData.cards
            .filter(function (c) { return c.group === g.name; })
            .map(function (c) { return c.text; });
        if (cards.length > 0) {
            groups.push({ name: g.name, cards: cards });
        }
    });
    const totalCards = groups.reduce(function (s, g) { return s + g.cards.length; }, 0);
    if (totalCards === 0) { showToast('当前字卡库没有可导出的字卡'); return; }

    showCustomConfirm({
        modalClass: 'cardlib-export-docx-confirm-modal',
        maxWidth: 400,
        iconSVG: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
        title: '导出为 Word',
        buildBody: function () {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin:10px 0 8px 0;text-align:left;';

            const info = document.createElement('div');
            info.style.cssText = 'font-size:13px;color:var(--text-secondary);text-align:center;line-height:1.8;margin-bottom:10px;';
            info.innerHTML = '将导出 <strong style="color:var(--text-main);">' + groups.length + '</strong> 个分组、' +
                '<strong style="color:var(--text-main);">' + totalCards + '</strong> 张字卡<br>' +
                '字卡库：<strong style="color:var(--primary-color);">' + libName + '</strong>';
            wrap.appendChild(info);

            const note = document.createElement('div');
            note.style.cssText = 'font-size:12px;color:var(--text-placeholder);text-align:center;line-height:1.8;';
            note.innerHTML = '分组名称 = 小一 · 矢车菊蓝 · 黑体<br>字卡内容 = 小四 · 黑色 · 黑体<br>分组之间空三行 · 空分组不导出';
            wrap.appendChild(note);
            return wrap;
        },
        buttons: [
            Object.assign({}, CONFIRM_CANCEL_BTN, { text: '取消', onClick: function () {} }),
            Object.assign({}, CONFIRM_PRIMARY_BTN, { text: '导出', onClick: function () {
                doExportCardLibToDocx(groups, libName);
            } })
        ]
    });
}

/** 执行 Word 导出：构建 docx 包并下载 */
async function doExportCardLibToDocx(groups, libName) {
    try {
        const docXml = buildCardLibDocxXml(groups);
        const zip = new JSZip();
        zip.file('[Content_Types].xml', DOCX_CONTENT_TYPES);
        zip.file('_rels/.rels', DOCX_ROOT_RELS);
        zip.file('word/document.xml', docXml);
        zip.file('word/_rels/document.xml.rels', DOCX_DOC_RELS);
        const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const now = new Date();
        const pad = function (n) { return n.toString().padStart(2, '0'); };
        const timestamp = '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
            pad(now.getHours()) + pad(now.getMinutes());
        const filename = '字卡库_' + libName + '_' + timestamp + '.docx';
        downloadFile(blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        showToast('✅ 已导出 <span class="toast-highlight">' + filename + '</span>');
    } catch (err) {
        showToast('❌ Word 导出失败：' + err.message);
    }
}

/* ---- docx 包常量与 XML 生成 ---- */

const DOCX_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

const DOCX_ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

const DOCX_DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/** XML 文本转义 */
function escapeXmlText(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 生成 word/document.xml
 * 分组名：sz=48(小一) · 矢车菊蓝 6495ED · 黑体
 * 字卡：sz=24(小四) · 黑色 000000 · 黑体
 * 分组之间空三行（空段落）
 */
function buildCardLibDocxXml(groups) {
    const paragraphs = [];

    groups.forEach(function (group, gi) {
        // 分组名称段落
        paragraphs.push(
            '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>' +
            '<w:r><w:rPr><w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体"/>' +
            '<w:color w:val="6495ED"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr>' +
            '<w:t xml:space="preserve">' + escapeXmlText(group.name) + '</w:t></w:r></w:p>'
        );
        // 字卡段落（文本内换行用 <w:br/> 处理）
        group.cards.forEach(function (text) {
            const lines = String(text).split('\n');
            const runs = lines.map(function (line, li) {
                const t = (li > 0 ? '<w:br/>' : '') +
                    '<w:t xml:space="preserve">' + escapeXmlText(line) + '</w:t>';
                return '<w:r><w:rPr><w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体"/>' +
                    '<w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>' + t + '</w:r>';
            }).join('');
            paragraphs.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>' + runs + '</w:p>');
        });
        // 分组之间空三行（最后一个分组后不加）
        if (gi < groups.length - 1) {
            paragraphs.push('<w:p/><w:p/><w:p/>');
        }
    });

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' + paragraphs.join('') +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
        '</w:body></w:document>';
}

/** 导入字卡库：选择 JSON 文件 → 校验 → 覆盖确认 → 写库刷新 */
function importCardLib() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            (async function () {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data || data.type !== 'cardLib' || !data.data || typeof data.data !== 'object') {
                        showToast('❌ 不是有效的字卡库备份文件');
                        return;
                    }

                    const types = ['text', 'emoji', 'sticker'].filter(function (t) {
                        return data.data[t] && Array.isArray(data.data[t].cards);
                    });
                    if (types.length === 0) {
                        showToast('❌ 备份文件里没有可导入的字卡数据');
                        return;
                    }

                    const srcName = data.sourceLibName || '未知来源';
                    const counts = {};
                    types.forEach(function (t) { counts[t] = data.data[t].cards.length; });
                    const targetLibName = await getCurrentCardLibName();

                    showCustomConfirm({
                        modalClass: 'cardlib-import-confirm-modal',
                        maxWidth: 400,
                        iconSVG: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
                        title: '导入字卡库',
                        buildBody: function () {
                            const wrap = document.createElement('div');
                            wrap.style.cssText = 'margin:10px 0 8px 0;';
                            const info = document.createElement('div');
                            info.style.cssText = 'font-size:13px;color:var(--text-secondary);text-align:center;line-height:1.8;';
                            info.innerHTML = '来源：<strong style="color:var(--text-main);">' + srcName + '</strong><br>' +
                                '字卡 ' + (counts.text || 0) + ' 张 · 表情包 ' + (counts.sticker || 0) + ' 张 · Emoji ' + (counts.emoji || 0) + ' 个<br><br>' +
                                '将导入到字卡库：<strong style="color:var(--primary-color);">' + targetLibName + '</strong><br>' +
                                '同名类型的内容会被覆盖';
                            wrap.appendChild(info);
                            return wrap;
                        },
                        buttons: [
                            Object.assign({}, CONFIRM_CANCEL_BTN, { text: '取消', onClick: function () {} }),
                            Object.assign({}, CONFIRM_PRIMARY_BTN, { text: '导入', onClick: function () { doImportCardLib(data); } })
                        ]
                    });
                } catch (err) {
                    showToast('❌ 文件解析失败：' + err.message);
                }
            })();
        };
        reader.readAsText(file);
    };
    input.click();
}

/** 执行导入：按文件内容覆盖对应类型并刷新界面 */
async function doImportCardLib(data) {
    const cardData = await getCurrentCardData();
    if (!cardData) { showToast('❌ 字卡库数据读取失败'); return; }

    ['text', 'emoji', 'sticker'].forEach(function (t) {
        if (data.data[t] && Array.isArray(data.data[t].cards)) {
            cardData[t] = data.data[t];
        }
    });

    await saveCurrentCardData(cardData);

    // 刷新弹窗界面（分组 + 列表），管理分组弹窗若开着也同步刷新
    await renderCardGroups();
    await renderCardList();
    const mgModal = document.getElementById('manageGroupModal');
    if (mgModal && !mgModal.classList.contains('hidden') && typeof renderManageGroupList === 'function') {
        await renderManageGroupList();
    }

    const libName = await getCurrentCardLibName();
    showToast('✅ 导入成功！已合并到字卡库 <span class="toast-highlight">' + libName + '</span>');
}

/* 从 Word (.docx) 导入字卡 */

/** 导入 Word 文档：选择 .docx 文件 → 解析 → 预览确认 → 写库刷新 */
function importCardLibFromDocx() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx';
    input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            (async function () {
                try {
                    const zip = new JSZip();
                    const zipData = await zip.loadAsync(e.target.result);
                    const docFile = zipData.file('word/document.xml');
                    if (!docFile) {
                        showToast('❌ 不是有效的 Word 文档（缺少 document.xml）');
                        return;
                    }
                    const xml = await docFile.async('string');
                    const parsed = parseDocxCardLib(xml);
                    if (!parsed || parsed.groups.length === 0 || parsed.totalCards === 0) {
                        showToast('❌ 文档中没有解析到字卡内容（需小一=分组名、小四=字卡）');
                        return;
                    }
                    showDocxImportConfirm(parsed);
                } catch (err) {
                    showToast('❌ Word 解析失败：' + err.message);
                }
            })();
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

/**
 * 解析 docx 的 document.xml，提取分组与字卡
 * 规则：小一（sz=48，24pt）= 分组名；小四（sz=24，12pt）= 字卡
 * @param {string} xml - word/document.xml 内容
 * @returns {{groups: Array<{name: string, cards: string[]}>, totalCards: number} | null}
 */
function parseDocxCardLib(xml) {
    const groups = [];
    let currentGroup = null;
    let totalCards = 0;
    const seenGroups = new Set();

    // 按段落切分
    const paraRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let paraMatch;
    while ((paraMatch = paraRegex.exec(xml)) !== null) {
        const paraXml = paraMatch[0];
        // 该段落内的所有 run：合并文本，取第一个有效字号
        const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
        let runMatch;
        let firstSize = null;
        let text = '';

        while ((runMatch = runRegex.exec(paraXml)) !== null) {
            const runXml = runMatch[0];
            // 字号：优先 sz，其次 szCs（部分编辑器只写 szCs）
            const szMatch = runXml.match(/<w:sz w:val="(\d+)"/);
            const szCsMatch = runXml.match(/<w:szCs w:val="(\d+)"/);
            const sizeVal = szMatch ? parseInt(szMatch[1], 10) : (szCsMatch ? parseInt(szCsMatch[1], 10) : null);
            // 提取文本（可能有多个 w:t）
            const textMatches = runXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
            const runText = textMatches.map(function (t) {
                return t.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
            }).join('');

            if (!runText && sizeVal === null) continue; // 空 run（如格式标记）

            if (firstSize === null && sizeVal !== null) firstSize = sizeVal;
            text += runText;
        }

        text = text.trim();
        if (!text) continue; // 空段落

        if (firstSize === 48) {
            // 小一：分组名（去重：同名分组合并）
            if (!seenGroups.has(text)) {
                seenGroups.add(text);
                currentGroup = { name: text, cards: [] };
                groups.push(currentGroup);
            } else {
                // 同名分组：继续使用已存在的
                currentGroup = groups.find(function (g) { return g.name === text; });
            }
        } else if (firstSize === 24) {
            // 小四：字卡
            if (!currentGroup) {
                // 未出现分组名时归入"未分组"
                currentGroup = { name: '未分组', cards: [] };
                seenGroups.add('未分组');
                groups.push(currentGroup);
            }
            currentGroup.cards.push(text);
            totalCards++;
        }
        // 其他字号：忽略（如页眉页脚等）
    }

    if (groups.length === 0) return null;
    return { groups: groups, totalCards: totalCards };
}

/** 显示 Word 导入预览确认弹窗 */
async function showDocxImportConfirm(parsed) {
    const targetLibName = await getCurrentCardLibName();
    const groupCount = parsed.groups.length;
    const totalCards = parsed.totalCards;

    // 预览前几个分组
    const previewGroups = parsed.groups.slice(0, 5);
    const hasMore = groupCount > 5;

    showCustomConfirm({
        modalClass: 'cardlib-docx-import-confirm-modal',
        maxWidth: 420,
        iconSVG: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
        title: '从 Word 导入字卡',
        buildBody: function () {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin:10px 0 8px 0;text-align:left;';

            const info = document.createElement('div');
            info.style.cssText = 'font-size:13px;color:var(--text-secondary);text-align:center;line-height:1.8;margin-bottom:10px;';
            info.innerHTML = '解析到 <strong style="color:var(--text-main);">' + groupCount + '</strong> 个分组、' +
                '<strong style="color:var(--text-main);">' + totalCards + '</strong> 张字卡<br>' +
                '将导入到字卡库：<strong style="color:var(--primary-color);">' + targetLibName + '</strong><br>' +
                '同名分组自动合并，同名分组内的字卡会追加';
            wrap.appendChild(info);

            const list = document.createElement('div');
            list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
            previewGroups.forEach(function (g) {
                const item = document.createElement('div');
                item.style.cssText = 'font-size:13px;color:var(--text-main);display:flex;justify-content:space-between;';
                const name = document.createElement('span');
                name.textContent = '· ' + g.name;
                name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                const count = document.createElement('span');
                count.textContent = g.cards.length + ' 张';
                count.style.cssText = 'color:var(--text-secondary);flex-shrink:0;margin-left:8px;';
                item.appendChild(name);
                item.appendChild(count);
                list.appendChild(item);
            });
            if (hasMore) {
                const more = document.createElement('div');
                more.style.cssText = 'font-size:12px;color:var(--text-placeholder);font-style:italic;';
                more.textContent = '…… 等 ' + (groupCount - 5) + ' 个分组';
                list.appendChild(more);
            }
            wrap.appendChild(list);
            return wrap;
        },
        buttons: [
            Object.assign({}, CONFIRM_CANCEL_BTN, { text: '取消', onClick: function () {} }),
            Object.assign({}, CONFIRM_PRIMARY_BTN, { text: '导入', onClick: function () {
                doImportCardLibFromDocx(parsed);
            } })
        ]
    });
}

/** 执行 Word 导入：合并分组与字卡到当前库并刷新界面 */
async function doImportCardLibFromDocx(parsed) {
    const cardData = await getCurrentCardData();
    if (!cardData) { showToast('❌ 字卡库数据读取失败'); return; }

    const textData = cardData.text || { groups: [{ name: '未分组', blocked: false }], cards: [] };
    // 已有分组名映射
    const groupNameSet = new Set(textData.groups.map(function (g) { return g.name; }));
    let added = 0;

    parsed.groups.forEach(function (docGroup) {
        // 分组不存在则追加
        if (!groupNameSet.has(docGroup.name)) {
            textData.groups.push({ name: docGroup.name, blocked: false });
            groupNameSet.add(docGroup.name);
        }
        // 追加字卡（原样保留文本）
        docGroup.cards.forEach(function (cardText) {
            textData.cards.push({ text: cardText, group: docGroup.name, blocked: false });
            added++;
        });
    });

    cardData.text = textData;
    await saveCurrentCardData(cardData);

    // 刷新界面
    await renderCardGroups();
    await renderCardList();
    const mgModal = document.getElementById('manageGroupModal');
    if (mgModal && !mgModal.classList.contains('hidden') && typeof renderManageGroupList === 'function') {
        await renderManageGroupList();
    }

    const libName = await getCurrentCardLibName();
    showToast('✅ 已从 Word 导入 <span class="toast-highlight">' + added + '</span> 张字卡到「' + libName + '」');
}

/* 字卡库导入方式下拉菜单 */

/** 切换导入下拉菜单显隐 */
function toggleCardLibImportDropdown() {
    const dd = document.getElementById('cardLibImportDropdown');
    if (!dd) return;
    dd.classList.toggle('hidden');
}

/** 关闭导入下拉菜单 */
function closeCardLibImportDropdown() {
    const dd = document.getElementById('cardLibImportDropdown');
    if (dd) dd.classList.add('hidden');
}

/** 点击导入按钮：切换下拉菜单 */
function importCardLibMenu() {
    toggleCardLibImportDropdown();
}

/* 字卡库导出方式下拉菜单 */

/** 切换导出下拉菜单显隐 */
function toggleCardLibExportDropdown() {
    const dd = document.getElementById('cardLibExportDropdown');
    if (!dd) return;
    dd.classList.toggle('hidden');
}

/** 关闭导出下拉菜单 */
function closeCardLibExportDropdown() {
    const dd = document.getElementById('cardLibExportDropdown');
    if (dd) dd.classList.add('hidden');
}

/** 点击导出按钮：切换下拉菜单 */
function exportCardLibMenu() {
    toggleCardLibExportDropdown();
}

/* 绑定字卡库入口 */

/** 绑定字卡库弹窗的所有入口与按钮事件 */
function bindCardModalEntry() {
    document.querySelectorAll('.function-item').forEach(function (item) {
        const span = item.querySelector('span');
        if (span?.textContent === '字卡库') {
            item.addEventListener('click', function (e) {
                e.stopPropagation();
                openCardModal();
            });
        }
    });

    const modal = document.getElementById('cardModal');
    document.getElementById('cardModalCloseBtn')?.addEventListener('click', closeCardModal);

    document.getElementById('cardLibExportBtn')?.addEventListener('click', exportCardLibMenu);
    document.getElementById('cardLibImportBtn')?.addEventListener('click', importCardLibMenu);

    // 导出下拉菜单：选项点击 → 对应导出方式
    const exportDropdown = document.getElementById('cardLibExportDropdown');
    exportDropdown?.addEventListener('click', function (e) {
        const option = e.target.closest('.card-lib-import-option');
        if (!option) return;
        closeCardLibExportDropdown();
        const source = option.dataset.source;
        if (source === 'docx') {
            exportCardLibToDocx();
        } else {
            exportCardLib();
        }
    });

    // 导入下拉菜单：选项点击 → 对应导入方式
    const importDropdown = document.getElementById('cardLibImportDropdown');
    importDropdown?.addEventListener('click', function (e) {
        const option = e.target.closest('.card-lib-import-option');
        if (!option) return;
        closeCardLibImportDropdown();
        const source = option.dataset.source;
        if (source === 'docx') {
            importCardLibFromDocx();
        } else {
            importCardLib();
        }
    });

    // 点击弹窗其他区域关闭下拉
    modal?.addEventListener('click', function (e) {
        const exportBtn = document.getElementById('cardLibExportBtn');
        const importBtn = document.getElementById('cardLibImportBtn');
        const inExport = exportBtn && (exportBtn.contains(e.target) || e.target.closest('#cardLibExportDropdown'));
        const inImport = importBtn && (importBtn.contains(e.target) || e.target.closest('#cardLibImportDropdown'));
        if (!inExport) closeCardLibExportDropdown();
        if (!inImport) closeCardLibImportDropdown();
    });

    document.getElementById('cardLibAddGroupBtn')?.addEventListener('click', openAddGroupModal);
    document.getElementById('addGroupConfirmBtn')?.addEventListener('click', confirmAddGroup);
    document.getElementById('addGroupCancelBtn')?.addEventListener('click', closeAddGroupModal);
    document.getElementById('addGroupCloseBtn')?.addEventListener('click', closeAddGroupModal);
    document.getElementById('addGroupInput')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirmAddGroup();
    });

    document.getElementById('cardManageGroupBtn')?.addEventListener('click', openManageGroupModal);
    document.getElementById('manageGroupCloseBtn')?.addEventListener('click', closeManageGroupModal);
    const manageModal = document.getElementById('manageGroupModal');
    manageModal?.addEventListener('click', function (e) {
        // 如果点击的是遮罩（弹窗本身）且处于批量模式，不关闭弹窗
        if (e.target === manageModal && isManageGroupBatchMode) {
            return;
        }
        if (e.target === manageModal) closeManageGroupModal();
    });

    document.getElementById('cardAddBtn')?.addEventListener('click', openAddCardModal);
    document.getElementById('addCardCancelBtn')?.addEventListener('click', closeAddCardModal);
    document.getElementById('addCardCloseBtn')?.addEventListener('click', closeAddCardModal);
    document.getElementById('addCardConfirmBtn')?.addEventListener('click', confirmAddCard);

    document.getElementById('editCardCancelBtn')?.addEventListener('click', closeEditCardModal);
    document.getElementById('editCardCloseBtn')?.addEventListener('click', closeEditCardModal);
    document.getElementById('editCardConfirmBtn')?.addEventListener('click', confirmEditCard);
    document.getElementById('editCardInput')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirmEditCard();
        if (e.key === 'Escape') closeEditCardModal();
    });

    document.getElementById('editGroupCancelBtn')?.addEventListener('click', closeEditGroupModal);
    document.getElementById('editGroupCloseBtn')?.addEventListener('click', closeEditGroupModal);
    document.getElementById('editGroupConfirmBtn')?.addEventListener('click', confirmEditGroup);
    document.getElementById('editGroupSelect')?.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeEditGroupModal(); });

    setupCardFileUpload();
    bindCardSearch();
    bindCardTabs();
    bindCardListEvents();
    bindBatchDeleteEvents();
    bindCardLibSwitchEvents();

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modals = [
            ['editCardModal', closeEditCardModal],
            ['editGroupModal', closeEditGroupModal],
            ['addCardModal', closeAddCardModal],
            ['cardModal', closeCardModal]
        ];
        for (const [id, closeFn] of modals) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) { closeFn(); return; }
        }
    });

    // 管理分组批量管理事件
    document.getElementById('manageBatchToggleBtn')?.addEventListener('click', function () {
        if (isManageGroupBatchMode) {
            exitManageBatchMode();
        } else {
            enterManageBatchMode();
        }
    });

    document.getElementById('manageBatchSelectAll')?.addEventListener('click', toggleManageGroupSelectAll);
    // 注意：不再绑定 manageBatchCancel，因为“取消”按钮已被删除
    // 屏蔽和取消屏蔽各自独立
    document.getElementById('manageBatchBlock')?.addEventListener('click', batchBlockGroups);
    document.getElementById('manageBatchUnblock')?.addEventListener('click', batchUnblockGroups);
    document.getElementById('manageBatchDelete')?.addEventListener('click', batchDeleteGroups);
    document.getElementById('manageBatchClear')?.addEventListener('click', batchClearGroups);
}

/* 暴露函数 */

window.openCardModal = openCardModal;
window.closeCardModal = closeCardModal;
window.renderCardGroups = renderCardGroups;
window.renderCardList = renderCardList;
window.bindCardModalEntry = bindCardModalEntry;
