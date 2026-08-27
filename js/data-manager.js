/**
 * 数据管理模块 data-manager.js
 * 功能：存储空间统计、全量备份/恢复（ZIP）、联系人备份、删除聊天记录、重置数据
 * 所有数据操作均为异步（IndexedDB）
 * 存储空间接近上限时弹窗提醒（进入聊天界面时由 welcome.js 触发）
 */

/* DOM 元素缓存 */

var dataModal = document.getElementById('dataManagerModal');
var dataCloseBtn = document.getElementById('dataManagerCloseBtn');
var dataCloseFooterBtn = document.getElementById('dataManagerCloseFooterBtn');

var storageUsageText = document.getElementById('storageUsageText');
var storageProgressBar = document.getElementById('storageProgressBar');
var storagePercent = document.getElementById('storagePercent');
var storageContacts = document.getElementById('storageContacts');
var storageCards = document.getElementById('storageCards');
var storageMessages = document.getElementById('storageMessages');
var storageSettings = document.getElementById('storageSettings');

var fullBackupBtn = document.getElementById('fullBackupBtn');
var fullRestoreBtn = document.getElementById('fullRestoreBtn');
var fullBackupContacts = document.getElementById('fullBackupContacts');
var fullBackupCards = document.getElementById('fullBackupCards');
var fullBackupMessages = document.getElementById('fullBackupMessages');
var fullBackupGroups = document.getElementById('fullBackupGroups');

var contactBackupSelect = document.getElementById('contactBackupSelect');
var contactExportBtn = document.getElementById('contactExportBtn');
var contactImportBtn = document.getElementById('contactImportBtn');
var contactBackupInfo = document.getElementById('contactBackupInfo');
var contactBackupCards = document.getElementById('contactBackupCards');
var contactBackupMessages = document.getElementById('contactBackupMessages');

var deleteChatSelect = document.getElementById('deleteChatSelect');
var deleteChatBtn = document.getElementById('deleteChatBtn');

var resetDataBtn = document.getElementById('resetDataBtn');

var clearLibSelect = document.getElementById('clearLibSelect');
var clearCardLibBtn = document.getElementById('clearCardLibBtn');
var clearSelectedBtn = document.getElementById('clearSelectedBtn');

/* 工具函数 */

/** 字节数格式化为可读文本（KB / MB） */
function formatBytes(bytes) {
    if (bytes === 0) return '0MB';
    var kb = bytes / 1024;
    var mb = kb / 1024;
    if (mb >= 1) {
        return mb.toFixed(1) + 'MB';
    }
    return kb.toFixed(1) + 'KB';
}

/** 获取存储空间统计（按分类估算各仓库占用大小） */
async function getStorageStats() {
    var stats = {
        contacts: 0,
        cards: 0,
        messages: 0,
        settings: 0,
        total: 0
    };

    var counts = {
        contacts: 0,
        cards: 0,
        stickerCards: 0,
        messages: 0,
        groups: 0
    };

    // 使用浏览器 Storage API 获取总使用量
    try {
        const estimate = await navigator.storage.estimate();
        stats.total = estimate.usage || 0;
    } catch (e) {
        stats.total = 0;
    }

    // 获取各分类的粗略大小（通过读取各仓库的数据估算）
    try {
        const contacts = await getAllContacts();
        counts.contacts = contacts.length;
        stats.contacts = new Blob([JSON.stringify(contacts)]).size;
    } catch (e) { }

    try {
        const globalData = await getGlobalCardData();
        const allCardData = [globalData];
        const allStickerData = [];
        const contacts = await getAllContacts();
        for (var i = 0; i < contacts.length; i++) {
            var data = await getCardData(contacts[i].id);
            if (data) allCardData.push(data);
        }
        stats.cards = new Blob([JSON.stringify(allCardData)]).size;
        // 统计字卡数量（表情包单独收集：占用 + 数量）
        allCardData.forEach(function (d) {
            if (d && d.text && d.text.cards) counts.cards += d.text.cards.length;
            if (d && d.emoji && d.emoji.cards) counts.cards += d.emoji.cards.length;
            if (d && d.sticker && d.sticker.cards) {
                counts.cards += d.sticker.cards.length;
                counts.stickerCards += d.sticker.cards.length;
                allStickerData.push(d.sticker);
            }
        });
        // 表情包（sticker 图片）占用 = 所有字卡库中 sticker 部分序列化大小
        stats.cardsSticker = new Blob([JSON.stringify(allStickerData)]).size;
    } catch (e) { }

    try {
        const contacts = await getAllContacts();
        var allMessages = [];
        for (var j = 0; j < contacts.length; j++) {
            var msgs = await loadMessages(contacts[j].id);
            if (msgs) {
                allMessages = allMessages.concat(msgs);
                counts.messages += msgs.length;
            }
        }
        // 群聊消息也计入「聊天记录」统计
        if (typeof getGroupChats === 'function') {
            var groupChats = await getGroupChats();
            counts.groups = groupChats.length;
            for (var gj = 0; gj < groupChats.length; gj++) {
                var groupMsgs = await loadMessages('group_' + groupChats[gj].id);
                if (groupMsgs) {
                    allMessages = allMessages.concat(groupMsgs);
                    counts.messages += groupMsgs.length;
                }
            }
        }
        stats.messages = new Blob([JSON.stringify(allMessages)]).size;
    } catch (e) { }

    try {
        const settings = await getSettings();
        stats.settings = new Blob([JSON.stringify(settings)]).size;
    } catch (e) { }

    stats.counts = counts;

    // 如果 total 为 0，用各分类之和估算
    if (stats.total === 0) {
        stats.total = stats.contacts + stats.cards + stats.messages + stats.settings;
    }

    return stats;
}

/** 获取浏览器分配给本站的存储配额 */
async function getStorageQuota() {
    try {
        const estimate = await navigator.storage.estimate();
        return estimate.quota || 5 * 1024 * 1024;
    } catch (e) {
        return 5 * 1024 * 1024;
    }
}

/** 更新存储空间显示（进度条、分类占用、下拉列表） */
async function updateStorageDisplay() {
    var stats = await getStorageStats();
    var quota = await getStorageQuota();

    var totalBytes = quota;
    var usedBytes = stats.total;
    var percent = Math.min(100, (usedBytes / totalBytes) * 100);
    var usedDisplay = formatBytes(usedBytes);
    var totalDisplay = formatBytes(totalBytes);

    storageUsageText.textContent = '已用 ' + usedDisplay + ' / ' + totalDisplay;
    storageProgressBar.style.width = percent + '%';
    storagePercent.textContent = Math.round(percent) + '%';

    storageProgressBar.classList.remove('warning', 'danger');
    if (percent > 85) {
        storageProgressBar.classList.add('danger');
    } else if (percent > 60) {
        storageProgressBar.classList.add('warning');
    }

    storageContacts.textContent = '·联系人 ' + formatBytes(stats.contacts);
    storageCards.textContent = '·字卡库 ' + formatBytes(stats.cards) + '（表情包 ' + formatBytes(stats.cardsSticker || 0) + '）';
    storageMessages.textContent = '·聊天记录 ' + formatBytes(stats.messages);
    storageSettings.textContent = '·全局设置 ' + formatBytes(stats.settings);

    fullBackupContacts.textContent = '·联系人 ' + stats.counts.contacts + ' 个';
    fullBackupCards.textContent = '·字卡 ' + stats.counts.cards + ' 张';
    fullBackupMessages.textContent = '·聊天记录 ' + stats.counts.messages + ' 条';
    if (fullBackupGroups) fullBackupGroups.textContent = '·群聊 ' + (stats.counts.groups || 0) + ' 个';

    await populateSelects();
    // 清空字卡库下拉框同步刷新（含联系人增删后的动态更新）
    await populateClearLibSelect();
}

/** 填充「联系人/聊天室备份」和「删除聊天记录」的下拉列表 */
async function populateSelects() {
    var contacts = await getAllContacts();
    var groupChats = (typeof getGroupChats === 'function') ? await getGroupChats() : [];

    // 联系人/聊天室备份：联系人（c: 前缀）+ 群聊（g: 前缀），用 optgroup 分组
    var backupSelect = contactBackupSelect;
    var backupValue = backupSelect.value;
    backupSelect.innerHTML = '<option value="">请选择联系人或聊天室</option>';

    if (contacts.length > 0) {
        var backupContactGroup = document.createElement('optgroup');
        backupContactGroup.label = '联系人';
        contacts.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = 'c:' + c.id;
            opt.textContent = c.name;
            backupContactGroup.appendChild(opt);
        });
        backupSelect.appendChild(backupContactGroup);
    }

    if (groupChats.length > 0) {
        var backupGroupGroup = document.createElement('optgroup');
        backupGroupGroup.label = '聊天室';
        groupChats.forEach(function (g) {
            var opt = document.createElement('option');
            opt.value = 'g:' + g.id;
            opt.textContent = (typeof getGroupName === 'function') ? getGroupName(g) : (g.name || '聊天室');
            backupGroupGroup.appendChild(opt);
        });
        backupSelect.appendChild(backupGroupGroup);
    }

    if (backupValue && Array.prototype.some.call(backupSelect.options, function (o) { return o.value === backupValue; })) {
        backupSelect.value = backupValue;
    }
    await updateContactBackupInfo();

    // 删除聊天记录：联系人（c: 前缀）+ 群聊（g: 前缀），用 optgroup 分组
    var deleteSelect = deleteChatSelect;
    var deleteValue = deleteSelect.value;
    deleteSelect.innerHTML = '';

    if (contacts.length > 0) {
        var contactGroup = document.createElement('optgroup');
        contactGroup.label = '联系人';
        contacts.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = 'c:' + c.id;
            opt.textContent = c.name;
            contactGroup.appendChild(opt);
        });
        deleteSelect.appendChild(contactGroup);
    }

    if (groupChats.length > 0) {
        var groupGroup = document.createElement('optgroup');
        groupGroup.label = '群聊';
        groupChats.forEach(function (g) {
            var opt = document.createElement('option');
            opt.value = 'g:' + g.id;
            opt.textContent = (typeof getGroupName === 'function') ? getGroupName(g) : (g.name || '群聊');
            groupGroup.appendChild(opt);
        });
        deleteSelect.appendChild(groupGroup);
    }

    if (contacts.length === 0 && groupChats.length === 0) {
        var emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '暂无可备份或删除的数据';
        deleteSelect.appendChild(emptyOpt);
    }

    if (deleteValue && Array.prototype.some.call(deleteSelect.options, function (o) { return o.value === deleteValue; })) {
        deleteSelect.value = deleteValue;
    }
}

/** 更新联系人/聊天室备份区域显示的字卡/消息数量 */
async function updateContactBackupInfo() {
    var rawValue = contactBackupSelect.value;
    if (!rawValue) {
        contactBackupInfo.textContent = '·联系人信息';
        contactBackupCards.style.display = '';
        contactBackupCards.textContent = '·字卡库 0 张';
        contactBackupMessages.textContent = '·聊天记录 0 条';
        return;
    }

    // value 格式：联系人 'c:123' / 群聊 'g:456'
    var isGroup = rawValue.indexOf('g:') === 0;
    var id = parseInt(rawValue.slice(2));

    if (isGroup) {
        // 聊天室：无独立字卡库，隐藏字卡库条目，仅显示群聊信息 + 聊天记录
        contactBackupCards.style.display = 'none';
        var group = (typeof getGroupChatById === 'function') ? await getGroupChatById(id) : null;
        if (!group) {
            contactBackupInfo.textContent = '·聊天室信息';
            contactBackupMessages.textContent = '·聊天记录 0 条';
            return;
        }
        var groupMessages = await loadMessages('group_' + id);
        contactBackupInfo.textContent = '·聊天室信息';
        contactBackupMessages.textContent = '·聊天记录 ' + (groupMessages ? groupMessages.length : 0) + ' 条';
    } else {
        var cardData = await getCardData(id);
        var cardCount = 0;
        if (cardData) {
            if (cardData.text && cardData.text.cards) cardCount += cardData.text.cards.length;
            if (cardData.emoji && cardData.emoji.cards) cardCount += cardData.emoji.cards.length;
            if (cardData.sticker && cardData.sticker.cards) cardCount += cardData.sticker.cards.length;
        }
        var messages = await loadMessages(id);
        contactBackupInfo.textContent = '·联系人信息';
        contactBackupCards.style.display = '';
        contactBackupCards.textContent = '·字卡库 ' + cardCount + ' 张';
        contactBackupMessages.textContent = '·聊天记录 ' + (messages ? messages.length : 0) + ' 条';
    }
}

/* dataURL 转 Blob 与图片 MIME 工具 */

/** 把 dataURL 字符串转成 Blob（用于头像写入 ZIP） */
function dataURLToBlob(dataURL) {
    var parts = dataURL.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bstr = atob(parts[1]);
    var n = bstr.length;
    var u8arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * 判断 dataURL 是否为图片
 * 兼容被污染的 data:application/octet-stream 前缀（按 base64 魔数识别）
 * 魔数：JPEG /9j/、PNG iVBOR、GIF R0lGOD、WebP UklGR
 */
function isImageDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return false;
    if (dataUrl.startsWith('data:image')) return true;
    var b64 = dataUrl.split(',')[1] || '';
    return /^(\/9j\/|iVBORw0KGgo|R0lGOD|UklGR)/.test(b64);
}

/** 从 dataURL 判断图片扩展名（兼容被污染的 application/octet-stream 前缀，按魔数识别） */
function dataUrlImageExt(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 'png';
    var low = dataUrl.toLowerCase();
    if (low.indexOf('image/jpeg') !== -1 || low.indexOf('image/jpg') !== -1) return 'jpg';
    if (low.indexOf('image/webp') !== -1) return 'webp';
    if (low.indexOf('image/gif') !== -1) return 'gif';
    var b64 = dataUrl.split(',')[1] || '';
    if (/^\/9j\//.test(b64)) return 'jpg';
    if (/^R0lGOD/.test(b64)) return 'gif';
    if (/^UklGR/.test(b64)) return 'webp';
    return 'png';
}

/**
 * 修正被污染的图片 dataURL MIME（data:application/octet-stream → 正确图片 MIME）
 * base64 数据本身完整，只是前缀错误；非污染或非图片原样返回
 */
function fixImageDataUrlMime(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:application/octet-stream')) return dataUrl;
    var b64 = dataUrl.split(',')[1] || '';
    var mime = 'image/jpeg';
    if (/^iVBOR/.test(b64)) mime = 'image/png';
    else if (/^R0lGOD/.test(b64)) mime = 'image/gif';
    else if (/^UklGR/.test(b64)) mime = 'image/webp';
    return 'data:' + mime + ';base64,' + b64;
}

/**
 * 从 ZIP 文件读取并还原为带正确图片 MIME 的 dataURL
 * JSZip 的 blob 会丢失原始 MIME（默认 application/octet-stream），必须按扩展名手动构造
 */
async function zipFileToDataURL(file, path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    var mime = 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'webp') mime = 'image/webp';
    var blob = await file.async('blob');
    blob = new Blob([blob], { type: mime });
    var dataUrl = await blobToDataURL(blob);
    return fixImageDataUrlMime(dataUrl);
}

/** 触发浏览器下载文件 */
function downloadFile(blob, filename, mimeType) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 5000);
}

/* 全量备份 */

/** 收集所有数据（联系人、字卡、消息、设置、群聊、装扮设置）用于导出 */
async function collectAllData() {
    var contacts = await getAllContacts();
    var cardData = {};
    var messages = {};

    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        cardData['contact_' + c.id] = await getCardData(c.id);
        messages['contact_' + c.id] = await loadMessages(c.id);
    }

    cardData.global = await getGlobalCardData();

    // 群聊数据（v1.1 新增：群聊列表 + 群聊消息）
    var groupChats = (typeof getGroupChats === 'function') ? await getGroupChats() : [];
    for (var gi = 0; gi < groupChats.length; gi++) {
        messages['group_' + groupChats[gi].id] = await loadMessages('group_' + groupChats[gi].id);
    }

    // 装扮设置（v1.1 扩展：背景图、自定义色盘、时间戳/群名颜色、玻璃效果等）
    var dressUp = null;
    try {
        var dressUpRecord = await getFromStore('appState', 'dressUp');
        if (dressUpRecord && dressUpRecord.value) {
            dressUp = dressUpRecord.value;
        }
    } catch (e) {
        console.warn('读取装扮设置失败:', e);
    }

    return {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        type: 'full_backup',
        contacts: contacts,
        cardData: cardData,
        messages: messages,
        groupChats: groupChats,
        settings: await getSettings(),
        dressUp: dressUp
    };
}

/**
 * 将装扮设置中的背景图 dataURL 提取为 ZIP 独立文件，
 * data.json 中以 '__DRESSUP__:<路径>' 占位符存储，避免 JSON 过大
 */
function extractDressUpToZip(dressUp, zip) {
    if (!dressUp) return dressUp;
    var out = JSON.parse(JSON.stringify(dressUp));

    function dataUrlExt(dataUrl) {
        var mime = (dataUrl.split(';')[0] || '').split(':')[1] || 'image/png';
        return mime === 'image/jpeg' ? 'jpg' : 'png';
    }

    function replaceDataUrl(obj, tabName, key) {
        if (!obj) return;
        if (obj.backgroundImage && typeof obj.backgroundImage === 'string' && obj.backgroundImage.startsWith('data:image')) {
            var ext = dataUrlExt(obj.backgroundImage);
            var path = 'assets/dressup_' + tabName + '_' + key + '_bg.' + ext;
            try {
                zip.file(path, dataURLToBlob(obj.backgroundImage));
                obj.backgroundImage = '__DRESSUP__:' + path;
            } catch (e) { }
        }
        if (Array.isArray(obj.recentBackgrounds)) {
            for (var i = 0; i < obj.recentBackgrounds.length; i++) {
                var bg = obj.recentBackgrounds[i];
                if (typeof bg === 'string' && bg.startsWith('data:image')) {
                    var ext2 = dataUrlExt(bg);
                    var path2 = 'assets/dressup_' + tabName + '_' + key + '_recent' + i + '.' + ext2;
                    try {
                        zip.file(path2, dataURLToBlob(bg));
                        obj.recentBackgrounds[i] = '__DRESSUP__:' + path2;
                    } catch (e) { }
                }
            }
        }
    }

    // 单人 Tab：key 为 'common' 或 String(联系人ID)
    if (out.single && out.single.objects) {
        for (var k in out.single.objects) {
            replaceDataUrl(out.single.objects[k], 'single', k);
        }
    }
    // 群聊 Tab：key 为 'common' 或 String(群聊ID)
    if (out.group && out.group.objects) {
        for (var k2 in out.group.objects) {
            replaceDataUrl(out.group.objects[k2], 'group', k2);
        }
    }
    return out;
}

/** 从 ZIP 文件读取并还原为带正确图片 MIME 的 dataURL */
async function dressUpFileToDataURL(file, path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    var mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
    var blob = await file.async('blob');
    blob = new Blob([blob], { type: mime });
    return await blobToDataURL(blob);
}

/** 恢复装扮设置：从 ZIP 读取背景图回填 dataURL，联系人 key 按 idMap 映射，写回 appState 并应用 */
async function restoreDressUpFromZip(dressUpData, idMap, zipData) {
    if (!dressUpData) return false;
    var out = JSON.parse(JSON.stringify(dressUpData));
    var restored = 0;

    async function restoreObj(obj) {
        if (!obj) return;
        if (typeof obj.backgroundImage === 'string' && obj.backgroundImage.startsWith('__DRESSUP__:')) {
            var path = obj.backgroundImage.replace('__DRESSUP__:', '');
            var file = zipData ? zipData.file(path) : null;
            if (file) {
                try {
                    obj.backgroundImage = await dressUpFileToDataURL(file, path);
                    restored++;
                } catch (e) {
                    obj.backgroundImage = null;
                }
            } else {
                obj.backgroundImage = null;
            }
        }
        if (Array.isArray(obj.recentBackgrounds)) {
            for (var i = 0; i < obj.recentBackgrounds.length; i++) {
                var bg = obj.recentBackgrounds[i];
                if (typeof bg === 'string' && bg.startsWith('__DRESSUP__:')) {
                    var path2 = bg.replace('__DRESSUP__:', '');
                    var file2 = zipData ? zipData.file(path2) : null;
                    if (file2) {
                        try {
                            obj.recentBackgrounds[i] = await dressUpFileToDataURL(file2, path2);
                            restored++;
                        } catch (e) {
                            obj.recentBackgrounds.splice(i, 1);
                            i--;
                        }
                    } else {
                        obj.recentBackgrounds.splice(i, 1);
                        i--;
                    }
                }
            }
        }
    }

    // 单人 Tab 的 key 是联系人 ID（新增模式下会变化），按 idMap 映射
    if (out.single && out.single.objects && idMap) {
        var newSingleObjects = {};
        for (var k in out.single.objects) {
            var newKey = k;
            if (k !== 'common') {
                var numK = parseInt(k, 10);
                if (!isNaN(numK) && idMap[numK] !== undefined) {
                    newKey = String(idMap[numK]);
                }
            }
            newSingleObjects[newKey] = out.single.objects[k];
        }
        out.single.objects = newSingleObjects;
    }

    if (out.single && out.single.objects) {
        for (var k2 in out.single.objects) await restoreObj(out.single.objects[k2]);
    }
    if (out.group && out.group.objects) {
        for (var k3 in out.group.objects) await restoreObj(out.group.objects[k3]);
    }

    await putToStore('appState', { key: 'dressUp', value: out });

    // 应用装扮（函数存在于 dress-up.js，加载顺序在其后，运行时已定义）
    if (typeof loadDressUpSettings === 'function') {
        try {
            await loadDressUpSettings();
        } catch (e) {
            console.warn('应用装扮设置失败:', e);
        }
    }
    return restored > 0;
}

/** 全量备份：导出 ZIP（data.json + 头像资源 + 装扮背景图） */
function fullBackup() {
    (async function () {
        try {
            var data = await collectAllData();

            var zip = new JSZip();

            // 装扮设置中的背景图提取为独立文件，data.json 存占位符
            var dressUp = extractDressUpToZip(data.dressUp, zip);

            var jsonStr = JSON.stringify(Object.assign({}, data, { dressUp: dressUp }), null, 2);

            zip.file('data.json', jsonStr);

            var contacts = await getAllContacts();
            for (var i = 0; i < contacts.length; i++) {
                var c = contacts[i];
                // isImageDataUrl 兼容被污染的 data:application/octet-stream 前缀（按魔数识别）
                if (isImageDataUrl(c.avatar)) {
                    try {
                        var blob = dataURLToBlob(fixImageDataUrlMime(c.avatar));
                        var ext = dataUrlImageExt(c.avatar);
                        zip.file('assets/avatar_' + c.id + '.' + ext, blob);
                    } catch (e) { }
                }
            }

            var userAvatar = await getUserAvatar();
            if (isImageDataUrl(userAvatar)) {
                try {
                    var blob = dataURLToBlob(fixImageDataUrlMime(userAvatar));
                    var ext = dataUrlImageExt(userAvatar);
                    zip.file('assets/user_avatar.' + ext, blob);
                } catch (e) { }
            }

            zip.generateAsync({ type: 'blob' }).then(function (content) {
                var now = new Date();
                var year = now.getFullYear();
                var month = (now.getMonth() + 1).toString().padStart(2, '0');
                var day = now.getDate().toString().padStart(2, '0');
                var hours = now.getHours().toString().padStart(2, '0');
                var minutes = now.getMinutes().toString().padStart(2, '0');
                var filename = '完整备份_' + year + '年' + month + '月' + day + '日_' + hours + '点' + minutes + '分.zip';
                downloadFile(content, filename, 'application/zip');
                showToast('✅ 备份完成！已下载 <span class="toast-highlight">' + filename + '</span>');
            }).catch(function (err) {
                showToast('❌ 备份失败：' + err.message);
            });
        } catch (e) {
            showToast('❌ 备份失败：' + e.message);
        }
    })();
}

/* 全量恢复 */

/** 全量恢复：选择 ZIP 文件并解析后调用 doFullRestore */
function fullRestore() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) { input.remove(); return; }

        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var zip = new JSZip();
                zip.loadAsync(ev.target.result).then(function (zipData) {
                    var dataFile = zipData.file('data.json');
                    if (!dataFile) {
                        showToast('❌ 无效的备份文件：未找到 data.json');
                        input.remove();
                        return;
                    }
                    dataFile.async('string').then(function (jsonStr) {
                        var data = JSON.parse(jsonStr);
                        // 兼容 v1.0（无群聊字段）与 v1.1（含群聊字段）
                        if (data.version !== '1.0' && data.version !== '1.1') {
                            showToast('❌ 不兼容的备份版本：' + data.version);
                            input.remove();
                            return;
                        }
                        // 解析成功，执行恢复（zipData 用于恢复头像）
                        doFullRestore(data, null, zipData);
                        input.remove();
                    }).catch(function (err) {
                        showToast('❌ 解析失败：' + err.message);
                        input.remove();
                    });
                }).catch(function (err) {
                    showToast('❌ ZIP 解析失败：' + err.message);
                    input.remove();
                });
            } catch (e) {
                showToast('❌ 导入失败：' + e.message);
                input.remove();
            }
        };
        reader.readAsArrayBuffer(file);
    };

    input.click();
}


/**
 * 从 ZIP 备份中恢复头像
 * @param {JSZip} zipData - 解压后的 ZIP 数据
 * @param {Object} idMap - 新旧 ID 映射 { oldId: newId }
 * @param {string} mode - 'new' 或 'overwrite'
 */
async function restoreAvatarsFromZip(zipData, idMap, mode) {
    if (!zipData) return;

    var restoredCount = 0;

    // 1. 恢复用户自己的头像
    try {
        var userAvatarFile = zipData.file('assets/user_avatar.png') || zipData.file('assets/user_avatar.jpg') || zipData.file('assets/user_avatar.webp') || zipData.file('assets/user_avatar.gif');
        if (userAvatarFile) {
            var dataUrl = await zipFileToDataURL(userAvatarFile, userAvatarFile.name);
            await saveUserAvatar(dataUrl);
            restoredCount++;
        }
    } catch (e) {
        console.warn('恢复用户头像失败:', e);
    }

    // 2. 恢复所有联系人的头像
    var contacts = await getAllContacts();
    var extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

    for (var i = 0; i < contacts.length; i++) {
        var contact = contacts[i];
        // 通过 idMap 反向查找原始 ID
        var originalId = null;
        for (var oldId in idMap) {
            if (idMap[oldId] === contact.id) {
                originalId = oldId;
                break;
            }
        }
        // 如果没找到映射，用当前 ID 尝试
        var lookupId = originalId || contact.id;

        var found = false;
        for (var j = 0; j < extensions.length; j++) {
            var ext = extensions[j];
            var filePath = 'assets/avatar_' + lookupId + '.' + ext;
            var file = zipData.file(filePath);
            if (file) {
                try {
                    var dataUrl = await zipFileToDataURL(file, filePath);
                    await updateContactAvatar(contact.id, dataUrl);
                    found = true;
                    restoredCount++;
                    break;
                } catch (e) {
                    console.warn('恢复联系人头像失败:', contact.name, e);
                }
            }
        }
    }

    // 刷新界面
    var partnerAvatarEl = document.getElementById('partnerAvatar');
    var userAvatarEl = document.getElementById('userAvatar');
    if (typeof loadAvatars === 'function') {
        loadAvatars(partnerAvatarEl, userAvatarEl);
    }
    if (typeof updateAllMessageAvatars === 'function') {
        updateAllMessageAvatars();
    }
}

/**
 * 将 Blob 转换为 dataURL
 */
function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(blob);
    });
}

/** 执行全量恢复：处理冲突联系人，导入字卡与消息 */
async function doFullRestore(data, mode, zipData) {
    try {
        var imported = 0;
        var idMap = {};
        var rawContacts = data.contacts || [];

        var existingNames = (await getAllContacts()).map(function (c) { return c.name; });
        var conflictContacts = [];
        var newContacts = [];

        rawContacts.forEach(function (rawC) {
            var name = rawC.name ? rawC.name.trim() : '';
            if (name && existingNames.indexOf(name) !== -1) {
                conflictContacts.push(rawC);
            } else {
                newContacts.push(rawC);
            }
        });

        // ---- 处理冲突联系人 ----
        if (conflictContacts.length > 0) {
            var conflictData = {
                contacts: conflictContacts,
                type: 'full_conflict'
            };

            showConflictOptions(conflictData, 'full', async function (choice) {
                if (choice === null) { return; }
                var selectedMode = choice;

                for (var i = 0; i < conflictContacts.length; i++) {
                    var conflictC = conflictContacts[i];
                    if (selectedMode === 'new') {
                        var newName = conflictC.name;
                        var suffix = 1;
                        while (await isNameTaken(newName, null)) {
                            newName = conflictC.name + '(' + suffix + ')';
                            suffix++;
                        }
                        var oldId = conflictC.id;
                        var newId = Date.now() + Math.floor(Math.random() * 1000);
                        idMap[oldId] = newId;
                        conflictC.name = newName;
                        conflictC.id = newId;
                        var contactsList = await getAllContacts();
                        contactsList.push(conflictC);
                        await saveContacts(contactsList);
                        imported++;
                    } else {
                        var existing = await getContactById(conflictC.id);
                        if (existing) {
                            var contactsList = await getAllContacts();
                            contactsList = contactsList.filter(function (c) { return c.id !== conflictC.id; });
                            contactsList.push(conflictC);
                            await saveContacts(contactsList);
                            imported++;
                        } else {
                            var contactsList = await getAllContacts();
                            contactsList.push(conflictC);
                            await saveContacts(contactsList);
                            imported++;
                        }
                    }
                }

                for (var j = 0; j < newContacts.length; j++) {
                    var newC = newContacts[j];
                    var contactsList = await getAllContacts();
                    var exists = contactsList.some(function (c) { return c.id === newC.id; });
                    if (!exists) {
                        contactsList.push(newC);
                        await saveContacts(contactsList);
                        imported++;
                    }
                    idMap[newC.id] = newC.id;
                }

                await importCardDataAndMessages(data, idMap, selectedMode, imported);
                // 恢复装扮设置（背景图、自定义色盘等）
                await restoreDressUpFromZip(data.dressUp, idMap, zipData);
                // 恢复头像（从 ZIP 中按新旧 ID 映射查找）
                await restoreAvatarsFromZip(zipData, idMap, selectedMode);
            });

            return;
        }

        // ---- 没有冲突 ----
        for (var k = 0; k < rawContacts.length; k++) {
            var rawC = rawContacts[k];
            var contactsList = await getAllContacts();
            var exists = contactsList.some(function (c) { return c.id === rawC.id; });
            if (!exists) {
                contactsList.push(rawC);
                await saveContacts(contactsList);
                imported++;
            }
            idMap[rawC.id] = rawC.id;
        }

        await importCardDataAndMessages(data, idMap, 'new', imported);
        // 恢复装扮设置（背景图、自定义色盘等）
        await restoreDressUpFromZip(data.dressUp, idMap, zipData);
        // 恢复头像（从 ZIP 中按新旧 ID 映射查找）
        await restoreAvatarsFromZip(zipData, idMap, 'new');

    } catch (e) {
        showToast('❌ 恢复失败：' + e.message);
        console.error(e);
    }
}

/** 导入群聊列表（按 idMap 映射成员 ID；保留全部成员，不因联系人缺失而丢弃） */
async function importGroupChatData(data, idMap) {
    var groupChats = data.groupChats || [];
    for (var gi = 0; gi < groupChats.length; gi++) {
        var g = groupChats[gi];
        if (!g || typeof g.id === 'undefined') continue;

        // 成员 ID 映射：备份中的联系人 ID → 导入后的新 ID（新增模式下冲突联系人会获得新 ID）
        var mappedMembers = (g.memberIds || []).map(function (mid) {
            return idMap[mid] !== undefined ? idMap[mid] : mid;
        });

        // 去重（保留全部成员 id，即使对应联系人已删除也不丢弃，避免群聊成员信息丢失）
        var validMembers = [];
        var seen = {};
        for (var mi = 0; mi < mappedMembers.length; mi++) {
            var m = mappedMembers[mi];
            if (seen[m]) continue;
            seen[m] = true;
            validMembers.push(m);
        }
        g.memberIds = validMembers;

        await saveGroupChat(g);
    }
}

/** 导入字卡与消息（按 idMap 映射新 ID，支持覆盖/合并两种模式） */
async function importCardDataAndMessages(data, idMap, mode, imported) {
    try {
        var cardData = data.cardData || {};
        for (var key in cardData) {
            if (key === 'global') {
                if (mode === 'overwrite') {
                    await saveGlobalCardData(cardData.global);
                } else {
                    var existingGlobal = await getGlobalCardData();
                    var mergedGlobal = mergeCardData(existingGlobal, cardData.global);
                    await saveGlobalCardData(mergedGlobal);
                }
            } else if (key.startsWith('contact_')) {
                var oldId = parseInt(key.replace('contact_', ''));
                var targetId = idMap[oldId];
                if (targetId === undefined) {
                    continue;
                }
                if (mode === 'overwrite' || await getContactById(targetId)) {
                    if (mode === 'overwrite') {
                        await saveCardData(targetId, cardData[key]);
                    } else {
                        var existing = await getCardData(targetId);
                        var merged = mergeCardData(existing, cardData[key]);
                        await saveCardData(targetId, merged);
                    }
                }
            }
        }

        // 恢复群聊列表（在群聊消息之前，群聊本身要先存在）
        if (typeof importGroupChatData === 'function') {
            await importGroupChatData(data, idMap);
        }

        var messages = data.messages || {};
        for (var msgKey in messages) {
            if (msgKey.startsWith('contact_')) {
                var oldId = parseInt(msgKey.replace('contact_', ''));
                var targetId = idMap[oldId];
                if (targetId === undefined) continue;
                if (mode === 'overwrite' || await getContactById(targetId)) {
                    if (mode === 'overwrite') {
                        await saveMessages(targetId, messages[msgKey]);
                    } else {
                        var existingMsgs = await loadMessages(targetId);
                        var mergedMsgs = mergeMessages(existingMsgs, messages[msgKey]);
                        await saveMessages(targetId, mergedMsgs);
                    }
                }
            } else if (msgKey.indexOf('group_') === 0) {
                // 群聊消息：群聊 ID 不因导入变化，直接使用原 storageId（'group_<id>'）
                if (mode === 'overwrite') {
                    await saveMessages(msgKey, messages[msgKey]);
                } else {
                    var existingGroupMsgs = await loadMessages(msgKey);
                    var mergedGroupMsgs = mergeMessages(existingGroupMsgs, messages[msgKey]);
                    await saveMessages(msgKey, mergedGroupMsgs);
                }
            }
        }

        if (data.settings) {
            await saveSettings(data.settings);
        }

        if (mode === 'overwrite') {
            var rawContacts = data.contacts || [];
            if (rawContacts.length > 0) {
                var firstContactId = rawContacts[0].id;
                var targetFirstId = idMap[firstContactId] !== undefined ? idMap[firstContactId] : firstContactId;
                if (await getContactById(targetFirstId)) {
                    await switchContact(targetFirstId);
                } else {
                    var all = await getAllContacts();
                    if (all.length > 0) {
                        await switchContact(all[0].id);
                    }
                }
            }
        }

        await refreshAllData();
        var groupCount = (data.groupChats || []).length;
        if (mode === 'overwrite') {
            showToast('✅ 覆盖成功！联系人 <span class="toast-highlight">' + imported + '</span> 个 · 群聊 ' + groupCount + ' 个 · 字卡库/聊天记录已覆盖');
        } else {
            showToast('✅ 新增成功！联系人 <span class="toast-highlight">' + imported + '</span> 个 · 群聊 ' + groupCount + ' 个 · 字卡库/聊天记录已新增');
        }
        await updateStorageDisplay();
    } catch (e) {
        showToast('❌ 恢复失败：' + e.message);
        console.error(e);
    }
}

/** 合并两份字卡库（按分组名去重、按内容去重） */
function mergeCardData(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    var result = {
        text: { groups: [], cards: [] },
        emoji: { groups: [], cards: [] },
        sticker: { groups: [], cards: [] }
    };

    ['text', 'emoji', 'sticker'].forEach(function (type) {
        var existingGroups = existing[type] && existing[type].groups ? existing[type].groups : [{ name: '未分组', blocked: false }];
        var incomingGroups = incoming[type] && incoming[type].groups ? incoming[type].groups : [{ name: '未分组', blocked: false }];
        var mergedGroups = existingGroups.slice();
        incomingGroups.forEach(function (g) {
            if (!mergedGroups.some(function (mg) { return mg.name === g.name; })) {
                mergedGroups.push(g);
            }
        });
        result[type].groups = mergedGroups;

        var existingCards = existing[type] && existing[type].cards ? existing[type].cards : [];
        var incomingCards = incoming[type] && incoming[type].cards ? incoming[type].cards : [];
        var mergedCards = existingCards.slice();
        var field = type === 'text' ? 'text' : (type === 'emoji' ? 'emoji' : 'dataUrl');
        incomingCards.forEach(function (c) {
            var exists = mergedCards.some(function (mc) {
                return mc[field] === c[field];
            });
            if (!exists) {
                mergedCards.push(c);
            }
        });
        result[type].cards = mergedCards;
    });

    return result;
}

/** 合并两条消息列表（按消息 id 去重，按时间排序） */
function mergeMessages(existing, incoming) {
    if (!existing || existing.length === 0) return incoming || [];
    if (!incoming || incoming.length === 0) return existing;

    var idMap = {};
    var merged = [];
    existing.forEach(function (m) {
        if (!idMap[m.id]) {
            idMap[m.id] = true;
            merged.push(m);
        }
    });
    incoming.forEach(function (m) {
        if (!idMap[m.id]) {
            idMap[m.id] = true;
            merged.push(m);
        }
    });
    merged.sort(function (a, b) {
        return (a.timestamp || 0) - (b.timestamp || 0);
    });
    return merged;
}

/* 联系人/聊天室备份 */

/** 收集聊天室的成员联系人完整数据（含头像），用于单聊天室备份 v1.1 */
async function collectGroupMembers(group) {
    var members = [];
    if (group && group.memberIds) {
        for (var i = 0; i < group.memberIds.length; i++) {
            var contact = await getContactById(group.memberIds[i]);
            if (contact) members.push(contact);
        }
    }
    return members;
}

/** 导入聊天室成员联系人（缺失的才新增；保留原 id 以匹配消息 senderId；名字被占用则重命名） */
async function importGroupMembers(members) {
    var importedCount = 0;
    for (var i = 0; i < members.length; i++) {
        var m = members[i];
        if (!m || typeof m.id === 'undefined' || !m.name) continue;
        var existing = await getContactById(m.id);
        if (existing) continue; // 已存在则跳过，不覆盖现有数据
        var name = m.name;
        if (await isNameTaken(name, null)) {
            var newName = name;
            var suffix = 1;
            while (await isNameTaken(newName, null)) {
                newName = name + '(' + suffix + ')';
                suffix++;
            }
            m.name = newName;
        }
        var contactsList = await getAllContacts();
        contactsList.push(m);
        await saveContacts(contactsList);
        importedCount++;
    }
    return importedCount;
}

/** 导出单个联系人/聊天室（JSON 文件） */
function exportContact() {
    (async function () {
        var select = contactBackupSelect;
        var rawValue = select.value;
        if (!rawValue) {
            showToast('请先选择一个联系人或聊天室');
            return;
        }

        // value 格式：联系人 'c:123' / 群聊 'g:456'
        var isGroup = rawValue.indexOf('g:') === 0;
        var id = parseInt(rawValue.slice(2));
        var now = new Date();
        var year = now.getFullYear();
        var month = (now.getMonth() + 1).toString().padStart(2, '0');
        var day = now.getDate().toString().padStart(2, '0');
        var hours = now.getHours().toString().padStart(2, '0');
        var minutes = now.getMinutes().toString().padStart(2, '0');

        if (isGroup) {
            var group = (typeof getGroupChatById === 'function') ? await getGroupChatById(id) : null;
            if (!group) {
                showToast('聊天室不存在');
                return;
            }
            var groupName = (typeof getGroupName === 'function') ? getGroupName(group) : (group.name || '聊天室');
            var groupData = {
                version: '1.1',
                exportedAt: now.toISOString(),
                type: 'single_group',
                group: group,
                members: await collectGroupMembers(group),
                messages: await loadMessages('group_' + id)
            };
            var groupJsonStr = JSON.stringify(groupData, null, 2);
            var groupFilename = '聊天室_' + groupName + '_' + year + '年' + month + '月' + day + '日_' + hours + '点' + minutes + '分.json';
            var groupBlob = new Blob([groupJsonStr], { type: 'application/json' });
            downloadFile(groupBlob, groupFilename, 'application/json');
            showToast('✅ 已导出聊天室<span class="toast-highlight">「' + groupName + '」</span>');
            return;
        }

        var contact = await getContactById(id);
        if (!contact) {
            showToast('联系人不存在');
            return;
        }

        var data = {
            version: '1.0',
            exportedAt: now.toISOString(),
            type: 'single_contact',
            contact: contact,
            cardData: await getCardData(id),
            messages: await loadMessages(id)
        };

        var jsonStr = JSON.stringify(data, null, 2);

        var filename = '联系人_' + contact.name + '_' + year + '年' + month + '月' + day + '日_' + hours + '点' + minutes + '分.json';

        var blob = new Blob([jsonStr], { type: 'application/json' });
        downloadFile(blob, filename, 'application/json');
        showToast('✅ 已导出联系人<span class="toast-highlight">「' + contact.name + '」</span>');
    })();
}

/** 导入单个联系人/聊天室（选择 JSON 文件） */
function importContact() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) { input.remove(); return; }

        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (data.type !== 'single_contact' && data.type !== 'single_group') {
                    showToast('❌ 无效的备份文件：类型不匹配');
                    input.remove();
                    return;
                }
                if (data.version !== '1.0' && data.version !== '1.1') {
                    showToast('❌ 不兼容的版本：' + data.version);
                    input.remove();
                    return;
                }
                (async function () {
                    if (data.type === 'single_group') {
                        var existingGroup = (typeof getGroupChatById === 'function') ? await getGroupChatById(data.group.id) : null;
                        if (existingGroup) {
                            showConflictOptions(data, 'group', function (mode) {
                                if (mode) {
                                    (async function () { await doImportGroup(data, mode); })();
                                }
                                input.remove();
                            });
                        } else {
                            await doImportGroup(data, 'new');
                            input.remove();
                        }
                        return;
                    }
                    var existing = await getContactById(data.contact.id);
                    if (existing) {
                        showConflictOptions(data, 'single', function (mode) {
                            if (mode) {
                                (async function () { await doImportContact(data, mode); })();
                            }
                            input.remove();
                        });
                    } else {
                        await doImportContact(data, 'new');
                        input.remove();
                    }
                })();
            } catch (e) {
                showToast('❌ 解析失败：' + e.message);
                input.remove();
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

/** 执行单个聊天室导入（支持新增/覆盖两种模式） */
async function doImportGroup(data, mode) {
    try {
        var group = data.group;
        var targetId = group.id;
        var displayName = (typeof getGroupName === 'function') ? getGroupName(group) : (group.name || '聊天室');

        // 恢复成员联系人（v1.1 起备份包含 members；已存在则跳过不覆盖，缺失的按原 id 新增，
        // 保证群聊 memberIds 和消息 senderId 能匹配到联系人，头像/名字正常显示）
        var importedMembers = 0;
        if (data.members && data.members.length) {
            importedMembers = await importGroupMembers(data.members);
        }

        if (mode === 'new' || !await getGroupChatById(targetId)) {
            if (mode === 'new') {
                // 新增模式：聊天室重名则自动重命名（类似联系人），并分配新 ID 避免与现有聊天室冲突
                var groupChatsList = await getGroupChats();
                var nameTaken = groupChatsList.some(function (g) {
                    return (typeof getGroupName === 'function') ? getGroupName(g) === displayName : g.name === displayName;
                });
                if (nameTaken) {
                    var newName = displayName;
                    var suffix = 1;
                    while (groupChatsList.some(function (g) {
                        return (typeof getGroupName === 'function') ? getGroupName(g) === newName : g.name === newName;
                    })) {
                        newName = displayName + '(' + suffix + ')';
                        suffix++;
                    }
                    group.name = newName;
                    displayName = newName;
                }
                targetId = Date.now() + Math.floor(Math.random() * 1000);
                group.id = targetId;
                groupChatsList.push(group);
                await saveGroupChat(group);
            } else {
                // 覆盖模式且不存在：直接新增
                await saveGroupChat(group);
            }
        } else if (mode === 'overwrite') {
            await saveGroupChat(group);
        }

        // 保存群聊消息（复用 messages store，contactId 为 'group_<id>'）
        var storageId = 'group_' + targetId;
        if (mode === 'overwrite') {
            await saveMessages(storageId, data.messages || []);
        } else {
            var existingMsgs = await loadMessages(storageId);
            var mergedMsgs = mergeMessages(existingMsgs, data.messages || []);
            await saveMessages(storageId, mergedMsgs);
        }

        await refreshAllData();
        var memberToast = importedMembers > 0 ? ' · 新增成员 <span class="toast-highlight">' + importedMembers + '</span> 位' : '';
        if (mode === 'overwrite') {
            showToast('✅ 覆盖成功！聊天室<span class="toast-highlight">「' + displayName + '」</span>已覆盖 · 聊天记录已覆盖' + memberToast);
        } else {
            showToast('✅ 新增成功！聊天室<span class="toast-highlight">「' + displayName + '」</span>已新增 · 聊天记录已新增' + memberToast);
        }
        await updateStorageDisplay();
    } catch (e) {
        showToast('❌ 导入失败：' + e.message);
        console.error(e);
    }
}

/** 执行单个联系人导入（支持新增/覆盖两种模式） */
async function doImportContact(data, mode) {
    try {
        var contact = data.contact;
        var targetId = contact.id;

        if (mode === 'new' || !await getContactById(contact.id)) {
            if (await isNameTaken(contact.name, null)) {
                var newName = contact.name;
                var suffix = 1;
                while (await isNameTaken(newName, null)) {
                    newName = contact.name + '(' + suffix + ')';
                    suffix++;
                }
                contact.name = newName;
                targetId = Date.now() + Math.floor(Math.random() * 1000);
                contact.id = targetId;
            }
            var contactsList = await getAllContacts();
            contactsList.push(contact);
            await saveContacts(contactsList);
        } else if (mode === 'overwrite') {
            var contactsList = await getAllContacts();
            var idx = contactsList.findIndex(function (c) { return c.id === contact.id; });
            if (idx !== -1) {
                contactsList[idx] = contact;
                await saveContacts(contactsList);
            } else {
                contactsList.push(contact);
                await saveContacts(contactsList);
            }
        }

        if (mode === 'overwrite') {
            await saveCardData(targetId, data.cardData);
            await saveMessages(targetId, data.messages);
        } else {
            var existingCards = await getCardData(targetId);
            var merged = mergeCardData(existingCards, data.cardData);
            await saveCardData(targetId, merged);

            var existingMsgs = await loadMessages(targetId);
            var mergedMsgs = mergeMessages(existingMsgs, data.messages);
            await saveMessages(targetId, mergedMsgs);
        }

        await refreshAllData();
        if (mode === 'overwrite') {
            showToast('✅ 覆盖成功！联系人<span class="toast-highlight">「' + contact.name + '」</span>已覆盖 · 字卡库已覆盖 · 聊天记录已覆盖');
        } else {
            showToast('✅ 新增成功！联系人<span class="toast-highlight">「' + contact.name + '」</span>已新增 · 字卡库已新增 · 聊天记录已新增');
        }
        await updateStorageDisplay();
    } catch (e) {
        showToast('❌ 导入失败：' + e.message);
        console.error(e);
    }
}

/* 删除聊天记录 */

/** 删除选中联系人/聊天室的全部聊天记录 */
function deleteChatHistory() {
    (async function () {
        var select = deleteChatSelect;
        var rawValue = select.value;
        if (!rawValue) {
            showToast('请先选择联系人或聊天室');
            return;
        }

        // value 格式：联系人 'c:123' / 群聊 'g:456'
        var isGroup = rawValue.indexOf('g:') === 0;
        var id = parseInt(rawValue.slice(2));
        var storageId = isGroup ? 'group_' + id : id;
        var label = isGroup ? '聊天室' : '联系人';

        // 校验对象存在并取显示名
        var displayName = '';
        if (isGroup) {
            var group = (typeof getGroupChatById === 'function') ? await getGroupChatById(id) : null;
            if (!group) {
                showToast('聊天室不存在');
                return;
            }
            displayName = (typeof getGroupName === 'function') ? getGroupName(group) : (group.name || '群聊');
        } else {
            var contact = await getContactById(id);
            if (!contact) {
                showToast('联系人不存在');
                return;
            }
            displayName = contact.name;
        }

        showConfirmModal('确认删除',
            '确定要删除' + label + '「' + displayName + '」的所有聊天记录吗？此操作不可恢复。',
            async function () {
                try {
                    await clearMessagesStorage(storageId);

                    // 若删除的是当前正在查看的会话，立即刷新消息区
                    if (!isGroup) {
                        if (await getCurrentContactId() === id && typeof loadMessagesForContact === 'function') {
                            await loadMessagesForContact(id);
                        }
                    } else if (typeof currentGroupChatId !== 'undefined' && currentGroupChatId === id && typeof loadMessagesForContact === 'function') {
                        await loadMessagesForContact(storageId);
                    }

                    await refreshAllData();
                    await updateStorageDisplay();
                    showToast('✅ 已清空' + label + '「' + displayName + '」的聊天记录');
                } catch (e) {
                    showToast('❌ 删除失败：' + e.message);
                }
            }
        );
    })();
}

/* 重置数据 */

/** 重置所有数据（联系人、字卡、消息、设置、头像），完成后刷新页面 */
function resetAllData() {
    showConfirmModal('⚠️ 警告',
        '确定要重置所有数据吗？这将删除所有联系人、字卡库、聊天记录、设置和装扮设置，此操作不可恢复！',
        async function () {
            try {
                var contacts = await getAllContacts();
                for (var i = 0; i < contacts.length; i++) {
                    await saveCardData(contacts[i].id, null);
                    await clearMessagesStorage(contacts[i].id);
                }
                await saveContacts([]);
                // 重新加载内存中的联系人列表
                var contactsLoaded = await loadContactsFromStorage();

                var defaultCardData = getDefaultCardData();
                await saveGlobalCardData(defaultCardData);
                await saveSettings(getDefaultSettings());
                await saveUserAvatar(null);
                await savePartnerAvatar(null);
                await saveCurrentContactId(null);

                // 重置装扮设置（主题色、背景、玻璃、自选颜色等）
                if (typeof deleteFromStore === 'function') {
                    await deleteFromStore('appState', 'dressUp');
                }
                // 重置当前字卡库选择回通用库
                if (typeof saveCurrentCardLib === 'function') {
                    await saveCurrentCardLib('global');
                }

                // 清理 localStorage 界面记忆（弹窗拖拽位置/大小、装扮面板手风琴状态、存储空间警告时间）
                try {
                    localStorage.removeItem('modalWindowState');
                    localStorage.removeItem('dressupAccordionState');
                    localStorage.removeItem('lastStorageWarningTime');
                } catch (e) { /* 忽略存储异常 */ }

                // 清理群聊数据（群聊记录 + 群聊消息 + 当前群聊状态）
                if (typeof getGroupChats === 'function') {
                    var groupChats = await getGroupChats();
                    for (var gi = 0; gi < groupChats.length; gi++) {
                        await clearMessagesStorage('group_' + groupChats[gi].id);
                        await deleteGroupChat(groupChats[gi].id);
                    }
                }
                if (typeof saveCurrentGroupId === 'function') {
                    await saveCurrentGroupId('');
                }

                await refreshAllData();
                await updateStorageDisplay();
                showToast('✅ 所有数据已重置');

                setTimeout(function () {
                    location.reload();
                }, 1500);
            } catch (e) {
                showToast('❌ 重置失败：' + e.message);
            }
        }
    );
}

/* 冲突选项界面 */

/** 显示「新增 / 覆盖」冲突选择弹窗，选择后回调 mode（type: 'single' | 'group'） */
function showConflictOptions(data, type, callback) {
    var isGroup = type === 'group';
    var targetName = '';
    if (isGroup) {
        if (data.group) {
            targetName = (typeof getGroupName === 'function') ? getGroupName(data.group) : (data.group.name || '聊天室');
        }
        if (!targetName) targetName = '聊天室';
    } else {
        if (data.contacts && Array.isArray(data.contacts) && data.contacts.length > 0) {
            targetName = data.contacts.map(function (c) { return c.name; }).join('、');
        } else if (data.contact) {
            targetName = data.contact.name;
        }
        if (!targetName) targetName = '联系人';
    }

    var modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="confirm-box" style="max-width:420px;">
            <div class="confirm-header">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f5a623" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.4"/>
                    <circle cx="12" cy="16.5" r="1.4" fill="#f5a623" stroke="none"/>
                </svg>
                <h4 class="confirm-title">检测到${isGroup ? '聊天室' : '联系人'}${targetName}已存在</h4>
            </div>
            <p style="font-size:14px;color:var(--text-secondary);margin:4px 0 12px;text-align:center;">
                请选择导入方式
            </p>
            <div style="text-align:left;padding:0 8px;">
                <label style="display:block;margin-bottom:8px;cursor:pointer;font-size:16px;color:var(--text-main);">
                    <input type="radio" name="importMode" value="new" checked style="margin-right:6px;">
                    新增模式
                    <span style="display:block;font-size:12px;color:var(--text-secondary);padding-left:24px;">
                        导入数据作为全新数据添加，联系人已存在则自动重命名
                    </span>
                </label>
                <label style="display:block;margin-bottom:8px;cursor:pointer;font-size:16px;color:var(--text-main);">
                    <input type="radio" name="importMode" value="overwrite" style="margin-right:6px;">
                    覆盖模式
                    <span style="display:block;font-size:12px;color:var(--text-secondary);padding-left:24px;">
                        用导入数据替换本地同名数据，字卡库和聊天记录将完全替换
                    </span>
                </label>
            </div>
            <div class="confirm-btns" style="margin-top:12px;">
                <button class="confirm-cancel" id="conflictCancelBtn">取消</button>
                <button class="confirm-ok" id="conflictConfirmBtn" style="background:var(--primary-light);color:var(--text-main);border:1px solid var(--border-soft);">确认导入</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 置顶冲突选择弹窗
    // 说明：该弹窗是动态创建的，modal-focus.js 的 MutationObserver 只监听初始存在的弹窗，
    // 不会自动把它置顶；若不手动提升层级，它会被已打开的数据管理弹窗（内联 z-index）遮罩盖住，
    // 导致显示在下一层、按钮点击无反应。
    if (typeof window.bringModalToFront === 'function') {
        window.bringModalToFront(modal);
    }

    // 弹窗内任意位置按下时保持置顶（capture 阶段先于 document 层的点击穿透逻辑执行），
    // 避免点击遮罩空白区域时把下层的数据管理弹窗提到前面盖住本弹窗。
    modal.addEventListener('mousedown', function () {
        if (typeof window.bringModalToFront === 'function') {
            window.bringModalToFront(modal);
        }
    }, true);

    document.getElementById('conflictCancelBtn').addEventListener('click', function () {
        modal.remove();
        if (typeof callback === 'function') callback(null);
    });

    document.getElementById('conflictConfirmBtn').addEventListener('click', function () {
        var selected = document.querySelector('input[name="importMode"]:checked');
        var mode = selected ? selected.value : 'new';
        modal.remove();
        if (typeof callback === 'function') callback(mode);
    });

    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.remove();
            if (typeof callback === 'function') callback(null);
        }
    });
}

/** 刷新所有数据（缓存失效、头像、消息、列表等） */
async function refreshAllData() {
    // 数据已变更（导入/重置/清空等），使字卡数据缓存失效
    if (typeof invalidateCardDataCache === 'function') {
        invalidateCardDataCache();
    }
    var currentId = await getCurrentContactId();

    if (currentId) {
        var contact = await getContactById(currentId);
        if (contact && contact.avatar) {
            await savePartnerAvatar(contact.avatar);
        } else {
            await savePartnerAvatar(null);
        }

        if (typeof loadMessagesForContact === 'function') {
            await loadMessagesForContact(currentId);
        }
    }

    // 若当前处于群聊模式，刷新群聊消息（导入/重置后群聊数据可能已变化）
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        var groupStorageId = (typeof getCurrentGroupStorageId === 'function') ? getCurrentGroupStorageId() : null;
        if (groupStorageId && typeof loadMessagesForContact === 'function') {
            await loadMessagesForContact(groupStorageId);
        }
    }

    if (typeof renderContactList === 'function') {
        var modal = document.getElementById('contactManagerModal');
        if (modal && !modal.classList.contains('hidden')) {
            await renderContactList();
        }
    }

    if (typeof refreshContactNameUI === 'function') {
        await refreshContactNameUI();
    }

    var partnerAvatarEl = document.getElementById('partnerAvatar');
    if (partnerAvatarEl) {
        var avatar = await getPartnerAvatar();
        if (avatar) {
            partnerAvatarEl.innerHTML = '<img src="' + avatar + '">';
        } else {
            partnerAvatarEl.innerHTML = defaultAvatarSVG;
        }
    }
}

/* 清空字卡库 */

/** 填充「清空字卡库」的字卡库下拉框（通用字卡库 + 联系人专属库） */
async function populateClearLibSelect() {
    if (!clearLibSelect) return;
    var prevValue = clearLibSelect.value;
    var contacts = getAllContacts();

    clearLibSelect.innerHTML = '';

    var globalOpt = document.createElement('option');
    globalOpt.value = 'global';
    globalOpt.textContent = '通用字卡库';
    clearLibSelect.appendChild(globalOpt);

    if (contacts.length > 0) {
        var contactGroup = document.createElement('optgroup');
        contactGroup.label = '联系人';
        contacts.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = 'contact_' + c.id;
            opt.textContent = c.name;
            contactGroup.appendChild(opt);
        });
        clearLibSelect.appendChild(contactGroup);
    }

    // 保留用户已有选择；无有效选择时默认选中当前正在聊天的联系人
    // （群聊中或未选中任何联系人则回退「通用字卡库」）
    var validPrev = prevValue && Array.prototype.some.call(clearLibSelect.options, function (o) { return o.value === prevValue; });
    if (validPrev) {
        clearLibSelect.value = prevValue;
        return;
    }
    var defaultKey = 'global';
    var inGroup = (typeof isGroupChatMode === 'function') && isGroupChatMode();
    if (!inGroup) {
        var currentId = await getCurrentContactId();
        if (currentId !== null && contacts.some(function (c) { return c.id === currentId; })) {
            defaultKey = 'contact_' + currentId;
        }
    }
    clearLibSelect.value = defaultKey;
}

/** 读取当前选中的清空范围（all / text / sticker / emoji） */
function getSelectedClearScope() {
    var checked = document.querySelector('#clearScopeGroup input[type="radio"]:checked');
    return checked ? checked.value : 'all';
}

/** 读取指定字卡库数据（libKey: 'global' 或 'contact_<id>'） */
function getCardDataByLib(libKey) {
    if (libKey === 'global') return getGlobalCardData();
    var contactId = parseInt(libKey.replace('contact_', ''));
    return getCardData(contactId);
}

/** 保存指定字卡库数据，并失效缓存、递增版本号（确保字卡库弹窗强制重建） */
async function saveCardDataByLib(libKey, cardData) {
    if (libKey === 'global') {
        await saveGlobalCardData(cardData);
    } else {
        var contactId = parseInt(libKey.replace('contact_', ''));
        await saveCardData(contactId, cardData);
    }
    if (typeof invalidateCardDataCache === 'function') invalidateCardDataCache();
    if (typeof bumpCardDataVersion === 'function') bumpCardDataVersion();
}

/** 统计指定字卡库中待清空类型的数量（未选中的范围计 0） */
async function getClearCounts(libKey, scope) {
    var cardData = await getCardDataByLib(libKey);
    var clearText = scope === 'all' || scope === 'text';
    var clearSticker = scope === 'all' || scope === 'sticker';
    var clearEmoji = scope === 'all' || scope === 'emoji';
    return {
        text: clearText ? (cardData.text.cards || []).length : 0,
        sticker: clearSticker ? (cardData.sticker.cards || []).length : 0,
        emoji: clearEmoji ? (cardData.emoji.cards || []).length : 0
    };
}

/**
 * 执行清空：按范围清空对应类型的卡片
 * 字卡（text）有分组概念，清空时分组重置为仅「未分组」；表情包 / Emoji 无分组概念，分组不变
 */
async function doClearCardLib(libKey, scope) {
    var cardData = await getCardDataByLib(libKey);
    var clearText = scope === 'all' || scope === 'text';
    var clearSticker = scope === 'all' || scope === 'sticker';
    var clearEmoji = scope === 'all' || scope === 'emoji';

    if (clearText) {
        cardData.text = { groups: [{ name: '未分组', blocked: false }], cards: [] };
    }
    if (clearSticker) {
        cardData.sticker.cards = [];
    }
    if (clearEmoji) {
        cardData.emoji.cards = [];
    }
    await saveCardDataByLib(libKey, cardData);
}

/** 清空后刷新界面：存储空间统计 + 打开状态的字卡库弹窗 */
async function afterClearRefresh() {
    await updateStorageDisplay();
    var cardModal = document.getElementById('cardModal');
    if (cardModal && !cardModal.classList.contains('hidden')) {
        if (typeof renderCardGroups === 'function') await renderCardGroups();
        if (typeof renderCardList === 'function') await renderCardList();
    }
}

/**
 * 按钮A：清空全部字卡库（不受下拉框和范围选择影响）
 * 清空通用库 + 所有联系人的专属库
 */
async function clearCardLib() {
    // 统计全部库的数据
    var stats = await getAllCardCounts();
    var totalCards = stats.totalText + stats.totalSticker + stats.totalEmoji;

    if (totalCards === 0) {
        showToast('所有字卡库均已为空，无需清空');
        return;
    }

    // 弹出确认框，显示全部库的统计
    showClearConfirmForAll(stats);
}

/**
 * 统计全部字卡库的数据（通用库 + 所有联系人专属库）
 * @returns {Promise<{totalText: number, totalSticker: number, totalEmoji: number, libCount: number}>}
 */
async function getAllCardCounts() {
    var totalText = 0;
    var totalSticker = 0;
    var totalEmoji = 0;
    var libCount = 0;

    // 通用库
    var globalData = await getGlobalCardData();
    if (globalData) {
        totalText += (globalData.text.cards || []).length;
        totalSticker += (globalData.sticker.cards || []).length;
        totalEmoji += (globalData.emoji.cards || []).length;
        libCount++;
    }

    // 所有联系人专属库
    var contacts = getAllContacts();
    for (var i = 0; i < contacts.length; i++) {
        var data = await getCardData(contacts[i].id);
        if (data) {
            totalText += (data.text.cards || []).length;
            totalSticker += (data.sticker.cards || []).length;
            totalEmoji += (data.emoji.cards || []).length;
            libCount++;
        }
    }

    return {
        totalText: totalText,
        totalSticker: totalSticker,
        totalEmoji: totalEmoji,
        libCount: libCount
    };
}

/**
 * 显示清空全部字卡库的强确认弹窗
 * @param {{totalText: number, totalSticker: number, totalEmoji: number, libCount: number}} stats
 */
function showClearConfirmForAll(stats) {
    var libCount = stats.libCount;
    var libName = '全部字卡库（通用库 + ' + libCount + ' 个联系人的专属库）';
    var showText = stats.totalText > 0;
    var showSticker = stats.totalSticker > 0;
    var showEmoji = stats.totalEmoji > 0;

    function buildBody() {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin:10px 0 8px 0;text-align:left;';

        var line1 = document.createElement('div');
        line1.style.cssText = 'font-size:14px;color:var(--text-main);line-height:1.6;';
        line1.textContent = '即将清空全部字卡库（通用库 + ' + libCount + ' 个联系人的专属库）：';
        wrap.appendChild(line1);

        var list = document.createElement('div');
        list.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:4px;';

        if (showText) {
            var textItem = document.createElement('div');
            textItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            textItem.textContent = '字卡：' + stats.totalText + ' 张';
            list.appendChild(textItem);
            var groupHint = document.createElement('div');
            groupHint.style.cssText = 'font-size:12px;color:var(--text-secondary);opacity:0.75;padding-left:2px;';
            groupHint.textContent = '所有字卡的分组将一并清空';
            list.appendChild(groupHint);
        }
        if (showSticker) {
            var stickerItem = document.createElement('div');
            stickerItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            stickerItem.textContent = '表情包：' + stats.totalSticker + ' 张';
            list.appendChild(stickerItem);
        }
        if (showEmoji) {
            var emojiItem = document.createElement('div');
            emojiItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            emojiItem.textContent = 'Emoji：' + stats.totalEmoji + ' 个';
            list.appendChild(emojiItem);
        }
        wrap.appendChild(list);
        return wrap;
    }

    showCustomConfirm({
        modalClass: 'clear-all-lib-confirm-modal',
        maxWidth: 420,
        iconSVG: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.4"/>
                <circle cx="12" cy="16.5" r="1.4" fill="#f5a623" stroke="none"/>
            </svg>`,
        title: '确认清空字卡库',
        buildBody: buildBody,
        confirmInput: { placeholder: '请输入"确认清空"', matchText: '确认清空' },
        buttons: [
            { text: '取消', style: CONFIRM_CANCEL_BTN.style, baseBg: CONFIRM_CANCEL_BTN.baseBg, hoverStyle: CONFIRM_CANCEL_BTN.hoverStyle, onClick: function () {} },
            {
                text: '确认清空',
                requireInput: true,
                style: CONFIRM_DANGER_BTN.style,
                baseBg: CONFIRM_DANGER_BTN.baseBg,
                hoverStyle: CONFIRM_DANGER_BTN.hoverStyle,
                onClick: function () {
                    executeClearAllLibraries().then(function () {
                        showToast('✅ 已清空全部字卡库（通用库 + <span class="toast-highlight">' + libCount + '</span> 个联系人的专属库）');
                    });
                }
            }
        ]
    });
}

/**
 * 执行清空全部字卡库（通用库 + 所有联系人专属库）
 * 每个库都清空字卡、表情包、Emoji，并重置字卡分组为仅“未分组”
 */
async function executeClearAllLibraries() {
    // 1. 清空通用库
    var globalData = await getGlobalCardData();
    if (globalData) {
        globalData.text = { groups: [{ name: '未分组', blocked: false }], cards: [] };
        globalData.sticker.cards = [];
        globalData.emoji.cards = [];
        await saveGlobalCardData(globalData);
    }

    // 2. 清空所有联系人的专属库
    var contacts = getAllContacts();
    for (var i = 0; i < contacts.length; i++) {
        var data = await getCardData(contacts[i].id);
        if (data) {
            data.text = { groups: [{ name: '未分组', blocked: false }], cards: [] };
            data.sticker.cards = [];
            data.emoji.cards = [];
            await saveCardData(contacts[i].id, data);
        }
    }

    // 3. 使缓存失效并递增版本号
    if (typeof invalidateCardDataCache === 'function') {
        invalidateCardDataCache();
    }
    if (typeof bumpCardDataVersion === 'function') {
        bumpCardDataVersion();
    }

    // 4. 刷新存储空间
    await updateStorageDisplay();

    // 5. 刷新字卡库弹窗（如果开着）
    var cardModal = document.getElementById('cardModal');
    if (cardModal && !cardModal.classList.contains('hidden')) {
        if (typeof renderCardGroups === 'function') await renderCardGroups();
        if (typeof renderCardList === 'function') await renderCardList();
    }
}

/**
 * 按钮B：清空选中的内容（按范围选择清空）
 */
async function clearSelectedContent() {
    var libKey = clearLibSelect.value;
    if (!libKey) {
        showToast('请先选择一个字卡库');
        return;
    }

    var scope = getSelectedClearScope();
    var counts = await getClearCounts(libKey, scope);

    var typeNames = { all: '字卡、表情包、Emoji', text: '字卡', sticker: '表情包', emoji: 'Emoji' };
    if (counts.text + counts.sticker + counts.emoji === 0) {
        var libName = clearLibSelect.selectedOptions && clearLibSelect.selectedOptions[0] ? clearLibSelect.selectedOptions[0].textContent : '该字卡库';
        // 改后：联系人名称高亮
        showToast('<span class="toast-highlight">「' + libName + '」</span> 的 ' + typeNames[scope] + ' 已为空，无需清空');
        return;
    }
    showClearConfirm(libKey, scope, counts);
}

/** 显示强确认弹窗（需手动输入「确认清空」才能执行） */
function showClearConfirm(libKey, scope, counts) {
    var libName = '该字卡库';
    if (clearLibSelect.selectedOptions && clearLibSelect.selectedOptions[0]) {
        libName = clearLibSelect.selectedOptions[0].textContent;
    }

    var showText = counts.text > 0;
    var showSticker = counts.sticker > 0;
    var showEmoji = counts.emoji > 0;

    function buildBody() {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin:10px 0 8px 0;text-align:left;';

        var line1 = document.createElement('div');
        line1.style.cssText = 'font-size:14px;color:var(--text-main);line-height:1.6;';
        line1.textContent = '即将清空「' + libName + '」的以下内容：';
        wrap.appendChild(line1);

        var list = document.createElement('div');
        list.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:4px;';

        if (showText) {
            var textItem = document.createElement('div');
            textItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            textItem.textContent = '字卡：' + counts.text + ' 张';
            list.appendChild(textItem);
            var groupHint = document.createElement('div');
            groupHint.style.cssText = 'font-size:12px;color:var(--text-secondary);opacity:0.75;padding-left:2px;';
            groupHint.textContent = '字卡的分组将一并清空';
            list.appendChild(groupHint);
        }
        if (showSticker) {
            var stickerItem = document.createElement('div');
            stickerItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            stickerItem.textContent = '表情包：' + counts.sticker + ' 张';
            list.appendChild(stickerItem);
        }
        if (showEmoji) {
            var emojiItem = document.createElement('div');
            emojiItem.style.cssText = 'font-size:14px;color:var(--text-main);';
            emojiItem.textContent = 'Emoji：' + counts.emoji + ' 个';
            list.appendChild(emojiItem);
        }
        wrap.appendChild(list);
        return wrap;
    }

    showCustomConfirm({
        modalClass: 'clear-lib-confirm-modal',
        maxWidth: 420,
        iconSVG: `
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f5a623" stroke-width="2" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="7" x2="12" y2="13" stroke-width="2.4"/>
                <circle cx="12" cy="16.5" r="1.4" fill="#f5a623" stroke="none"/>
            </svg>`,
        title: '确认清空字卡库',
        buildBody: buildBody,
        buttons: [
            { text: '取消', style: CONFIRM_CANCEL_BTN.style, baseBg: CONFIRM_CANCEL_BTN.baseBg, hoverStyle: CONFIRM_CANCEL_BTN.hoverStyle, onClick: function () {} },
            {
                text: '确认清空',
                style: CONFIRM_DANGER_BTN.style,
                baseBg: CONFIRM_DANGER_BTN.baseBg,
                hoverStyle: CONFIRM_DANGER_BTN.hoverStyle,
                onClick: function () {
                    doClearCardLib(libKey, scope).then(function () {
                        // 改后：根据范围显示不同类型的提示
                        var typeText = { all: '全部字卡库', text: '字卡', sticker: '表情包', emoji: 'Emoji' }[scope] || '内容';
                        showToast('✅ 已清空 <span class="toast-highlight">「' + libName + '」</span> 的 ' + typeText);
                        afterClearRefresh();
                    });
                }
            }
        ]
    });
}

/* 打开 / 关闭数据管理弹窗 */

// 打开数据管理弹窗并刷新存储空间显示
// 改前：直接移除 hidden 类打开弹窗
// 改后：如果弹窗已经打开，则关闭它（实现点击图标切换开关）
function openDataManagerModal() {
    if (!dataModal) return;

    // 如果弹窗当前是显示状态，关闭它并返回
    if (!dataModal.classList.contains('hidden')) {
        closeDataManagerModal();
        return;
    }

    // 以下是原有的打开逻辑
    dataModal.classList.remove('hidden');
    (async function () {
        await updateStorageDisplay();
    })();
}

/** 关闭数据管理弹窗 */
function closeDataManagerModal() {
    if (dataModal) dataModal.classList.add('hidden');
}

/* 绑定事件 */

/** 绑定数据管理弹窗的所有事件 */
function bindDataManagerEvents() {
    dataCloseBtn.addEventListener('click', closeDataManagerModal);
    dataCloseFooterBtn.addEventListener('click', closeDataManagerModal);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && dataModal && !dataModal.classList.contains('hidden')) {
            closeDataManagerModal();
        }
    });

    fullBackupBtn.addEventListener('click', fullBackup);
    fullRestoreBtn.addEventListener('click', fullRestore);
    contactExportBtn.addEventListener('click', exportContact);
    contactImportBtn.addEventListener('click', importContact);
    contactBackupSelect.addEventListener('change', updateContactBackupInfo);
    deleteChatBtn.addEventListener('click', deleteChatHistory);
    resetDataBtn.addEventListener('click', resetAllData);
    clearCardLibBtn.addEventListener('click', clearCardLib);
    clearSelectedBtn.addEventListener('click', clearSelectedContent);
}

document.addEventListener('DOMContentLoaded', function () {
    bindDataManagerEvents();
});

window.openDataManagerModal = openDataManagerModal;
window.closeDataManagerModal = closeDataManagerModal;
window.updateStorageDisplay = updateStorageDisplay;
window.refreshAllData = refreshAllData;
window.getStorageStats = getStorageStats;
window.getStorageQuota = getStorageQuota;
