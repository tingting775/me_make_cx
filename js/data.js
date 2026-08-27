/**
 * 数据模块 data.js —— 底层采用 IndexedDB 存储，所有数据操作均为异步（需 await）
 *
 * 数据库名：dream_chat_db，版本号：2
 * 对象仓库（Object Store）：
 *   - contacts      : 联系人列表 [{ id, name, avatar, createdAt }]
 *   - globalCards   : 通用字卡库（单条记录：{ data: { text, emoji, sticker } }）
 *   - contactCards  : 联系人字卡库（按联系人隔离，每条记录：{ contactId, type, data }）
 *   - messages      : 聊天记录（按联系人/群聊隔离，每条记录：{ contactId, messages: [] }）
 *   - settings      : 全局设置（单条记录：{ data: { ...settings } }）
 *   - userAvatar    : 用户自己的头像（单条记录：{ dataUrl }）
 *   - appState      : 应用状态（当前联系人ID、当前字卡库、当前群聊ID等）
 *   - groupChats    : 多人聊天群组 [{ id, memberIds, createdAt }]
 */

/* 公共常量 */

/** 默认头像 SVG（无头像时的占位图标，全站共用） */
const defaultAvatarSVG = `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
</svg>`;

/* 工具：WebAudio 合成音效（message.js / chat-settings.js 共用） */

/**
 * 用 Web Audio API 合成一段提示音
 * @param {string} soundValue - 音色名：crisp / warm / cute / soft / ethereal
 * @param {number} volume - 音量（0~1）
 */
function playSynthSound(soundValue, volume) {
    try {
        const raw = volume || 0;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        let frequency = 600;
        let duration = 0.15;
        let waveType = 'sine';
        const v = raw * 1.2;

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        switch (soundValue) {
            case 'crisp':
                frequency = 900;
                duration = 0.08;
                waveType = 'sine';
                break;
            case 'warm':
                frequency = 350;
                duration = 0.25;
                waveType = 'sine';
                break;
            case 'cute':
                frequency = 750;
                duration = 0.12;
                waveType = 'sine';
                break;
            case 'soft':
                frequency = 280;
                duration = 0.4;
                waveType = 'sine';
                break;
            case 'ethereal':
                frequency = 520;
                duration = 0.5;
                waveType = 'sine';
                oscillator.frequency.setValueAtTime(520, audioCtx.currentTime);
                oscillator.frequency.linearRampToValueAtTime(570, audioCtx.currentTime + 0.15);
                oscillator.frequency.linearRampToValueAtTime(540, audioCtx.currentTime + 0.3);
                oscillator.frequency.linearRampToValueAtTime(560, audioCtx.currentTime + 0.4);
                oscillator.frequency.linearRampToValueAtTime(530, audioCtx.currentTime + 0.5);
                break;
            default:
                frequency = 600;
                duration = 0.12;
        }

        oscillator.type = waveType;
        oscillator.frequency.value = frequency;

        gainNode.gain.setValueAtTime(v, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);

        setTimeout(function () {
            audioCtx.close();
        }, duration * 1000 + 100);
    } catch (e) {
        console.warn('音效播放失败');
    }
}

/* 数据库连接（单例模式） */

let dbInstance = null;

/** 打开/创建 IndexedDB 数据库（已打开则直接返回） */
function openDB() {
    return new Promise(function (resolve, reject) {
        // 如果已经打开，直接返回
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open('dream_chat_db', 2);

        // 首次创建或升级时，创建对象仓库
        request.onupgradeneeded = function (event) {
            const db = event.target.result;

            // 1. 联系人列表（主键：id）
            if (!db.objectStoreNames.contains('contacts')) {
                db.createObjectStore('contacts', { keyPath: 'id' });
            }

            // 2. 通用字卡库（单条记录，固定 key 为 'global'）
            if (!db.objectStoreNames.contains('globalCards')) {
                db.createObjectStore('globalCards', { keyPath: 'key' });
            }

            // 3. 联系人字卡库（复合索引：contactId + type）
            if (!db.objectStoreNames.contains('contactCards')) {
                const store = db.createObjectStore('contactCards', { keyPath: 'id', autoIncrement: true });
                store.createIndex('contactId_type', ['contactId', 'type'], { unique: true });
            }

            // 4. 聊天记录（按联系人隔离）
            if (!db.objectStoreNames.contains('messages')) {
                const store = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                store.createIndex('contactId', 'contactId', { unique: false });
            }

            // 5. 全局设置（单条记录，固定 key 为 'settings'）
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            // 6. 用户头像（单条记录，固定 key 为 'user'）
            if (!db.objectStoreNames.contains('userAvatar')) {
                db.createObjectStore('userAvatar', { keyPath: 'key' });
            }

            // 7. 应用状态（当前联系人ID、当前字卡库等）
            if (!db.objectStoreNames.contains('appState')) {
                db.createObjectStore('appState', { keyPath: 'key' });
            }

            // 8. 多人聊天群组（主键：id）
            if (!db.objectStoreNames.contains('groupChats')) {
                db.createObjectStore('groupChats', { keyPath: 'id' });
            }
        };

        request.onsuccess = function (event) {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = function (event) {
            reject(event.target.error);
        };
    });
}

/** 通用工具：读取单条记录（按主键） */
function getFromStore(storeName, key) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/**
 * 通用工具：执行一个「写入」操作（新增或更新）
 * @param {string} storeName - 对象仓库名称
 * @param {any} data - 要写入的数据（必须包含主键）
 * @returns {Promise<void>}
 */
function putToStore(storeName, data) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = function () { resolve(); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/**
 * 通用工具：执行一个「删除」操作
 * @param {string} storeName - 对象仓库名称
 * @param {string|number} key - 主键值
 * @returns {Promise<void>}
 */
function deleteFromStore(storeName, key) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = function () { resolve(); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/**
 * 通用工具：获取某个仓库的「所有记录」
 * @param {string} storeName - 对象仓库名称
 * @returns {Promise<Array>} 所有记录
 */
function getAllFromStore(storeName) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/**
 * 通用工具：根据索引获取记录（用于 contactCards 按 contactId+type 查询）
 * @param {string} storeName - 对象仓库名称
 * @param {string} indexName - 索引名称
 * @param {any} key - 索引值
 * @returns {Promise<Array>} 匹配的记录数组
 */
function getByIndex(storeName, indexName, key) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(key);
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/**
 * 通用工具：删除符合索引条件的记录（用于清理某个联系人的所有字卡）
 * @param {string} storeName - 对象仓库名称
 * @param {string} indexName - 索引名称
 * @param {any} key - 索引值
 * @returns {Promise<void>}
 */
function deleteByIndex(storeName, indexName, key) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.openCursor(key);
            request.onsuccess = function (event) {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = function () { reject(request.error); };
        });
    });
}

/* 联系人列表 */

/** 保存联系人列表（先清空再逐条写入） */
function saveContacts(contacts) {
    // contacts 是数组，需要逐条存入（但联系人数量通常很少，用 put 覆盖即可）
    // 策略：先清空再全部插入
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            const transaction = db.transaction('contacts', 'readwrite');
            const store = transaction.objectStore('contacts');
            // 先清空
            store.clear();
            // 逐条存入
            contacts.forEach(function (contact) {
                store.put(contact);
            });
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () { reject(transaction.error); };
        });
    });
}

/** 读取联系人列表 */
function getContacts() {
    return getAllFromStore('contacts').then(function (records) {
        return records || [];
    });
}

/** 保存当前联系人 ID（存入 appState） */
function saveCurrentContactId(id) {
    if (id === null || id === undefined || isNaN(id)) {
        return Promise.resolve();
    }
    return putToStore('appState', { key: 'currentContactId', value: String(id) });
}

/** 读取当前联系人 ID（非法值返回 null） */
function getCurrentContactId() {
    return getFromStore('appState', 'currentContactId').then(function (record) {
        if (!record) return null;
        const id = record.value;
        if (id === 'null' || id === 'undefined' || id === null) return null;
        const num = Number(id);
        return isNaN(num) ? null : num;
    });
}

/* 多人聊天群组 */

/** 保存群聊（新增/更新） */
function saveGroupChat(group) {
    return putToStore('groupChats', group);
}

/** 读取所有群聊 */
function getGroupChats() {
    return getAllFromStore('groupChats').then(function (records) {
        return records || [];
    });
}

/** 按 id 读取单个群聊 */
function getGroupChatById(id) {
    return getFromStore('groupChats', id);
}

/** 删除群聊 */
function deleteGroupChat(id) {
    return deleteFromStore('groupChats', id);
}

/** 保存当前群聊 ID（存入 appState，空值则清除记录） */
function saveCurrentGroupId(id) {
    if (id === null || id === undefined || id === '') {
        return deleteFromStore('appState', 'currentGroupId');
    }
    return putToStore('appState', { key: 'currentGroupId', value: String(id) });
}

/** 读取当前群聊 ID（无则返回 null，返回数字类型以匹配 groupChats 主键） */
function getCurrentGroupId() {
    return getFromStore('appState', 'currentGroupId').then(function (record) {
        if (!record) return null;
        const id = record.value;
        if (id === 'null' || id === 'undefined' || id === '') return null;
        const num = Number(id);
        return isNaN(num) ? null : num;
    });
}

/* 字卡数据 */

/** 获取默认的空字卡库结构 */
function getDefaultCardData() {
    return {
        text: {
            groups: [{ name: '未分组', blocked: false }],
            cards: []
        },
        emoji: {
            groups: [{ name: '未分组', blocked: false }],
            cards: []
        },
        sticker: {
            groups: [{ name: '未分组', blocked: false }],
            cards: []
        }
    };
}

/** 读取某个联系人的字卡库（按 contactId 分别读三种类型） */
function getCardData(contactId) {
    // 读取三种类型的字卡数据
    const types = ['text', 'emoji', 'sticker'];
    const promises = types.map(function (type) {
        return getByIndex('contactCards', 'contactId_type', [contactId, type]).then(function (records) {
            if (records && records.length > 0) {
                return { type: type, data: records[0].data };
            }
            return { type: type, data: { groups: [{ name: '未分组', blocked: false }], cards: [] } };
        });
    });

    return Promise.all(promises).then(function (results) {
        const cardData = getDefaultCardData();
        results.forEach(function (result) {
            cardData[result.type] = result.data;
        });
        return cardData;
    });
}

/** 保存某个联系人的字卡库（cardData 为 null 时仅删除该联系人的字卡记录） */
function saveCardData(contactId, cardData) {
    const types = ['text', 'emoji', 'sticker'];

    // 如果 cardData 为 null，只删除该联系人的所有字卡记录，不插入新数据
    if (cardData === null) {
        const deletePromises = types.map(function (type) {
            return deleteByIndex('contactCards', 'contactId_type', [contactId, type]);
        });
        return Promise.all(deletePromises).then(function () {});
    }

    const promises = types.map(function (type) {
        // 先删除旧记录（如果有）
        return deleteByIndex('contactCards', 'contactId_type', [contactId, type]).then(function () {
            // 再插入新记录
            return putToStore('contactCards', {
                contactId: contactId,
                type: type,
                data: cardData[type] || { groups: [{ name: '未分组', blocked: false }], cards: [] }
            });
        });
    });
    return Promise.all(promises).then(function () {});
}

/** 获取当前选中库的字卡数据（通用库或单人库），带内存缓存避免重复读 IndexedDB */
let cardDataCache = null;       // 缓存的字卡数据（同一对象引用，save 后自动同步）
let cardDataCacheLib = null;    // 缓存对应的字卡库 key

/** 使字卡数据缓存失效（导入 ZIP / 删除联系人 / 重置数据等直接改库后调用） */
function invalidateCardDataCache() {
    cardDataCache = null;
    cardDataCacheLib = null;
}

function getCurrentCardData() {
    return getCurrentCardLib().then(function (currentLib) {
        // 命中缓存（同一字卡库），直接返回，避免重复读 IndexedDB
        if (cardDataCache && cardDataCacheLib === currentLib) {
            return cardDataCache;
        }
        if (currentLib === 'global') {
            return getGlobalCardData().then(function (data) {
                cardDataCache = data;
                cardDataCacheLib = currentLib;
                return data;
            });
        } else {
            const contactId = parseInt(currentLib.replace('contact_', ''));
            return getContactById(contactId).then(function (contact) {
                if (!contact) {
                    cardDataCache = null;
                    cardDataCacheLib = null;
                    return null;
                }
                return getCardData(contactId).then(function (data) {
                    cardDataCache = data;
                    cardDataCacheLib = currentLib;
                    return data;
                });
            });
        }
    });
}

/** 保存当前选中库的字卡数据（保存成功后版本号 +1，用于判断 DOM 是否需要重建） */
let cardDataVersion = 0; // 字卡数据版本号：保存成功后递增

function saveCurrentCardData(cardData) {
    return getCurrentCardLib().then(function (currentLib) {
        if (currentLib === 'global') {
            return saveGlobalCardData(cardData).then(function () { return currentLib; });
        } else {
            const contactId = parseInt(currentLib.replace('contact_', ''));
            return getContactById(contactId).then(function (contact) {
                if (!contact) return null;
                return saveCardData(contactId, cardData).then(function () { return currentLib; });
            });
        }
    }).then(function (savedLib) {
        // 保存成功，数据已变更，版本号 +1
        cardDataVersion++;
        // 同步缓存：缓存指向刚保存的数据（同一字卡库）
        // 避免 confirmAddCard 等「直读 IndexedDB 再保存」的路径导致缓存陈旧、界面不刷新
        if (savedLib && cardData !== null && cardData !== undefined) {
            cardDataCache = cardData;
            cardDataCacheLib = savedLib;
        } else {
            cardDataCache = null;
            cardDataCacheLib = null;
        }
    });
}

/**
 * 外部直改字卡库后递增版本号（配合 invalidateCardDataCache 使用）
 * 清空字卡库等通过 saveCardData / saveGlobalCardData 直写 IndexedDB 的路径不走 saveCurrentCardData，
 * 版本号不会自增，导致字卡库弹窗 renderCardList 命中缓存 key 跳过重建；调用本函数强制界面重建
 */
function bumpCardDataVersion() {
    cardDataVersion++;
}

/* 通用字卡库 */

/** 获取通用字卡库数据 */
function getGlobalCardData() {
    return getFromStore('globalCards', 'global').then(function (record) {
        if (record && record.data) {
            return record.data;
        }
        return getDefaultCardData();
    });
}

/** 保存通用字卡库数据 */
function saveGlobalCardData(cardData) {
    return putToStore('globalCards', { key: 'global', data: cardData });
}

/* 分组数据规范化 */

/**
 * 把旧版分组（字符串数组）转成新版对象数组 [{ name, blocked }]
 * 已是对象数组则原样返回（纯函数，不修改入参）
 * @param {Array} groups - 分组数组（字符串或对象）
 * @returns {Array} 规范化后的对象数组
 */
function normalizeGroups(groups) {
    if (groups.length > 0 && typeof groups[0] === 'string') {
        return groups.map(function (name) {
            return { name: name, blocked: false };
        });
    }
    return groups;
}

/**
 * 规范化某类型字卡库的分组并写回（旧版字符串数组 → 对象数组）
 * 仅在检测到旧数据时写回并保存，避免无谓的 IndexedDB 写入
 * @param {object} cardData - 字卡库数据（含 groups）
 * @param {string} type - 类型：text / sticker / emoji
 * @returns {Promise<Array>} 规范化后的分组数组
 */
async function normalizeCardGroups(cardData, type) {
    const groups = cardData[type].groups || [];
    if (groups.length > 0 && typeof groups[0] === 'string') {
        const newGroups = normalizeGroups(groups);
        cardData[type].groups = newGroups;
        await saveCurrentCardData(cardData);
        return newGroups;
    }
    return groups;
}

/** 获取当前选中的字卡库类型（联系人不存在时回退到通用库） */
function getCurrentCardLib() {
    return getFromStore('appState', 'cardLib_lastSelected').then(function (record) {
        if (!record || !record.value) return 'global';
        const lib = record.value;
        if (lib.startsWith('contact_')) {
            const id = parseInt(lib.replace('contact_', ''));
            return getContactById(id).then(function (contact) {
                if (contact) return lib;
                // 联系人不存在，回退到通用
                return 'global';
            });
        }
        return 'global';
    });
}

/** 保存当前选中的字卡库 */
function saveCurrentCardLib(lib) {
    return putToStore('appState', { key: 'cardLib_lastSelected', value: lib });
}

/* 头像数据 */

/** 保存对方头像 */
function savePartnerAvatar(dataUrl) {
    return putToStore('appState', { key: 'partnerAvatar', value: dataUrl });
}

/** 读取对方头像 */
function getPartnerAvatar() {
    return getFromStore('appState', 'partnerAvatar').then(function (record) {
        return record ? record.value : null;
    });
}

/** 保存自己的头像 */
function saveUserAvatar(dataUrl) {
    return putToStore('userAvatar', { key: 'user', dataUrl: dataUrl });
}

/** 读取自己的头像 */
function getUserAvatar() {
    return getFromStore('userAvatar', 'user').then(function (record) {
        return record ? record.dataUrl : null;
    });
}

/* 消息数据 */

/** 保存某个联系人的消息列表（先删旧记录再插入） */
function saveMessages(contactId, messages) {
    // 先删除该联系人的旧消息
    return deleteByIndex('messages', 'contactId', contactId).then(function () {
        // 再插入新消息（如果消息不为空）
        if (messages && messages.length > 0) {
            return putToStore('messages', {
                contactId: contactId,
                messages: messages
            });
        }
    });
}

/** 读取某个联系人的消息列表 */
function loadMessages(contactId) {
    return getByIndex('messages', 'contactId', contactId).then(function (records) {
        if (records && records.length > 0) {
            return records[0].messages || [];
        }
        return [];
    });
}

/**
 * 加载指定时间戳之前的消息（用于向上翻页加载更早的消息；beforeTimestamp 为 null 时加载最新 limit 条）
 * @param {number} contactId - 联系人 ID
 * @param {number|null} beforeTimestamp - 查询此时间戳之前的消息，传 null 表示查询最新消息
 * @param {number} limit - 加载条数（默认 20）
 * @returns {Promise<Array>} 消息数组（按时间正序返回，最早→最新）
 */
function loadMessagesBefore(contactId, beforeTimestamp, limit = 20) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            // 从 IndexedDB 读取该联系人的所有消息
            const transaction = db.transaction('messages', 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('contactId');
            const request = index.getAll(contactId);

            request.onsuccess = function () {
                const records = request.result;
                if (!records || records.length === 0) {
                    resolve([]);
                    return;
                }
                // 取出消息数组
                const allMessages = records[0]?.messages || [];
                // 按时间戳降序排列（最新的在前）
                const sortedDesc = [...allMessages].sort(function (a, b) {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });

                let result = [];

                if (beforeTimestamp === null) {
                    // 首次加载：取最新的 limit 条
                    result = sortedDesc.slice(0, limit);
                } else {
                    // 加载更早：找到第一个 timestamp < beforeTimestamp 的位置
                    let startIndex = -1;
                    for (let i = 0; i < sortedDesc.length; i++) {
                        if (sortedDesc[i].timestamp < beforeTimestamp) {
                            startIndex = i;
                            break;
                        }
                    }
                    if (startIndex === -1) {
                        // 没有比 beforeTimestamp 更早的消息
                        resolve([]);
                        return;
                    }
                    // 从 startIndex 开始取 limit 条
                    result = sortedDesc.slice(startIndex, startIndex + limit);
                }

                // 按时间正序返回（方便渲染）
                result.sort(function (a, b) {
                    return (a.timestamp || 0) - (b.timestamp || 0);
                });
                resolve(result);
            };

            request.onerror = function () {
                reject(request.error);
            };
        });
    });
}


/**
 * 从目标消息所在页加载到最新消息（用于引用跳转）
 * 例：100 条消息，目标在第 30 条（第 2 页），则加载第 21-100 条
 * @param {number} contactId - 联系人 ID
 * @param {string} targetId - 目标消息的 ID
 * @param {number} pageSize - 每页大小（默认 20）
 * @returns {Promise<Array>} 消息数组（按时间正序）
 */
function loadMessagesFromTargetToLatest(contactId, targetId, pageSize = 20) {
    return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
            // 从 IndexedDB 读取该联系人的所有消息
            const transaction = db.transaction('messages', 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('contactId');
            const request = index.getAll(contactId);

            request.onsuccess = function () {
                const records = request.result;
                if (!records || records.length === 0) {
                    resolve([]);
                    return;
                }
                // 取出消息数组
                const allMessages = records[0]?.messages || [];
                // 按时间戳升序排列（最早的在前）
                const sortedAsc = [...allMessages].sort(function (a, b) {
                    return (a.timestamp || 0) - (b.timestamp || 0);
                });

                // 找到目标消息的索引
                const targetIndex = sortedAsc.findIndex(function (m) {
                    return m.id === targetId;
                });

                if (targetIndex === -1) {
                    // 没找到目标消息
                    resolve([]);
                    return;
                }

                // 计算目标消息所在页的起始索引
                // 例如：targetIndex=29（第30条），pageSize=20，则 startPageIndex = 20（第21条）
                const startPageIndex = Math.floor(targetIndex / pageSize) * pageSize;

                // 从起始索引一直取到最后（最新消息）
                const result = sortedAsc.slice(startPageIndex);

                resolve(result);
            };

            request.onerror = function () {
                reject(request.error);
            };
        });
    });
}

/**
 * 清空某个联系人的消息
 */
function clearMessagesStorage(contactId) {
    return deleteByIndex('messages', 'contactId', contactId);
}

/**
 * 保存当前联系人的消息列表
 */
function saveCurrentMessages(messages) {
    return getCurrentContactId().then(function (contactId) {
        if (!contactId) return;
        return saveMessages(contactId, messages);
    });
}

/* 设置数据 */

/** 默认设置（深合并时作为兜底） */
function getDefaultScopeSettings() {
    return {
        replySpeed: {
            minWait: 3,
            maxWait: 1
        },
        replyCount: {
            min: 1,
            max: 3
        },
        replyContent: {
            combineCards: false,
            combineMin: 2,
            combineMax: 4,
            mixSticker: true,
            mixEmoji: true
        },
        messageInteraction: {
            quoteReply: true,
            quoteRate: 30,
            readNoReply: false,
            readNoReplyRate: 10,
            autoSend: false,
            autoSendInterval: 30,
            replyLockSeconds: 10
        },
        timestampStyle: 'zh'
    };
}

function getDefaultSettings() {
    return {
        single: getDefaultScopeSettings(),
        group: getDefaultScopeSettings(),
        sound: {
            enabled: true,
            volume: 70,
            sendSound: 'crisp',
            receiveSound: 'crisp'
        }
    };
}

/** 旧版平铺设置迁移为新结构（single/group 各自一份） */
function migrateLegacySettings(data) {
    // 旧结构：顶层有 replySpeed（无 single/group 字段）
    if (data && data.replySpeed && !data.single && !data.group) {
        const scope = {
            replySpeed: data.replySpeed,
            replyCount: data.replyCount,
            replyContent: data.replyContent,
            messageInteraction: data.messageInteraction,
            timestampStyle: data.timestampStyle
        };
        return {
            single: scope,
            group: JSON.parse(JSON.stringify(scope)),
            sound: data.sound
        };
    }
    return data;
}

/** 保存设置 */
function saveSettings(settings) {
    return putToStore('settings', { key: 'settings', data: settings });
}

/** 读取设置（与默认值深合并，保证新字段有默认值） */
function getSettings() {
    return getFromStore('settings', 'settings').then(function (record) {
        if (record && record.data) {
            const migrated = migrateLegacySettings(record.data);
            const defaults = getDefaultSettings();
            return deepMerge(defaults, migrated);
        }
        return getDefaultSettings();
    });
}

/** 深度合并对象（source 覆盖 target 的对应字段） */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

/* 联系人业务辅助函数 */

/** 根据 ID 获取联系人（不存在返回 null） */
function getContactById(id) {
    return getContacts().then(function (contacts) {
        return contacts.find(function (c) { return c.id === id; }) || null;
    });
}

/** 检查联系人是否存在 */
function contactExists(id) {
    return getContactById(id).then(function (contact) { return contact !== null; });
}

/** 检查名字是否已被占用 */
function isNameTaken(name, excludeId) {
    return getContacts().then(function (contacts) {
        return contacts.some(function (c) {
            return c.id !== excludeId && c.name === name.trim();
        });
    });
}

/** 获取所有联系人 */
function getAllContacts() {
    return getContacts();
}

/** 获取当前联系人对象 */
function getCurrentContact() {
    return getCurrentContactId().then(function (id) {
        if (id === null) return null;
        return getContactById(id);
    });
}

/** 获取当前联系人名字（无则返回空字符串） */
function getCurrentContactName() {
    return getCurrentContact().then(function (contact) {
        return contact ? contact.name : '';
    });
}

/* 通用下拉工厂（字卡库切换下拉，供表情面板 / 字卡库 / 管理分组弹窗复用） */

/**
 * 创建字卡库切换下拉（通用下拉工厂）
 * 统一处理：渲染列表、打开/关闭、点外部关闭、Esc 关闭、标签更新
 * @param {object} options
 * @param {string} options.dropdownId - 下拉容器元素 id
 * @param {string} options.listId - 下拉列表容器元素 id
 * @param {string} options.switchBtnId - 切换按钮元素 id
 * @param {string} options.labelId - 按钮上名称标签元素 id
 * @param {string} options.itemClass - 下拉项类名（用于 current 高亮等样式）
 * @param {string} [options.dividerStyle] - 分隔线样式（默认绿色半透明分隔线）
 * @param {function} options.onPick - 选中新库后的回调 (libKey)，仅在库确实变化时调用
 * @returns {{ render: function, toggle: function, close: function, bind: function, updateLabel: function }}
 */
function createLibDropdown(options) {
    const dropdown = document.getElementById(options.dropdownId);
    const list = document.getElementById(options.listId);
    const switchBtn = document.getElementById(options.switchBtnId);
    const labelEl = document.getElementById(options.labelId);
    const dividerStyle = options.dividerStyle || 'height:1px; background:rgba(var(--primary-rgb),0.15); margin:4px 12px;';

    /** 创建下拉列表项（图标 + 名称 + 当前库标记） */
    function createItem(libKey, labelText, isCurrent, avatar) {
        const div = document.createElement('div');
        div.className = options.itemClass + (isCurrent ? ' current' : '');
        div.dataset.lib = libKey;

        const icon = document.createElement('span');
        icon.className = 'lib-icon';
        if (libKey === 'global') {
            // 通用库：SVG 星星（比 emoji ⭐ 更精确居中，颜色跟随主题色）
            icon.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:currentColor;flex-shrink:0;"><path d="M12 2l2.94 6.32 6.94.63-5.25 4.57 1.55 6.8L12 17.02 5.82 20.32l1.55-6.8L2.12 8.95l6.94-.63z"/></svg>';
        } else if (avatar) {
            icon.innerHTML = '<img src="' + avatar + '" style="width:18px;height:18px;border-radius:50%;object-fit:cover;">';
        } else {
            // 无头像时使用默认头像 SVG，显示为灰色圆形
            icon.innerHTML = defaultAvatarSVG;
            const svg = icon.querySelector('svg');
            if (svg) {
                svg.style.width = '18px';
                svg.style.height = '18px';
                svg.style.borderRadius = '50%';
                svg.style.display = 'block';
                svg.querySelector('path').setAttribute('fill', '#999');
            }
        }

        const label = document.createElement('span');
        label.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        label.textContent = labelText;

        div.appendChild(icon);
        div.appendChild(label);

        if (isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'lib-badge';
            badge.style.cssText = 'color:#4caf50; font-size:8px; flex-shrink:0; margin-left:auto;';
            badge.textContent = '●';
            div.appendChild(badge);
        }

        div.addEventListener('click', function (e) {
            e.stopPropagation();
            const newLib = this.dataset.lib;
            (async function () {
                if (newLib !== await getCurrentCardLib()) {
                    await options.onPick(newLib);
                }
                close();
            })();
        });

        return div;
    }

    /** 渲染下拉列表（通用库 + 分隔线 + 各联系人库） */
    function render() {
        if (!list) return;
        (async function () {
            const currentLib = await getCurrentCardLib();
            const contacts = await getAllContacts();

            list.innerHTML = '';
            list.appendChild(createItem('global', '通用', currentLib === 'global'));

            if (contacts.length > 0) {
                const divider = document.createElement('div');
                divider.style.cssText = dividerStyle;
                list.appendChild(divider);
            }

            contacts.forEach(function (contact) {
                const libKey = 'contact_' + contact.id;
                list.appendChild(createItem(libKey, contact.name, currentLib === libKey, contact.avatar));
            });
        })();
    }

    /** 打开/关闭下拉（打开时先重新渲染） */
    function toggle() {
        if (!dropdown || !switchBtn) return;
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            render();
            dropdown.classList.remove('hidden');
            switchBtn.classList.add('active');
        } else {
            close();
        }
    }

    /** 关闭下拉 */
    function close() {
        if (dropdown) dropdown.classList.add('hidden');
        if (switchBtn) switchBtn.classList.remove('active');
    }

    /** 更新切换按钮上的名称（通用 / 联系人名 / 失效回退通用） */
    async function updateLabel(libKey) {
        if (!labelEl) return;
        if (libKey === 'global') {
            labelEl.textContent = '通用';
            return;
        }
        const contactId = parseInt(libKey.replace('contact_', ''));
        const contact = await getContactById(contactId);
        if (contact) {
            labelEl.textContent = contact.name;
        } else {
            labelEl.textContent = '通用';
            await saveCurrentCardLib('global');
        }
    }

    /** 绑定切换按钮点击、外部点击关闭、Esc 关闭 */
    function bind() {
        if (!switchBtn || !dropdown) return;

        switchBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggle();
        });

        document.addEventListener('click', function (e) {
            if (!dropdown.classList.contains('hidden')) {
                if (!dropdown.contains(e.target) && e.target !== switchBtn && !switchBtn.contains(e.target)) {
                    close();
                }
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !dropdown.classList.contains('hidden')) {
                close();
            }
        });
    }

    return { render: render, toggle: toggle, close: close, bind: bind, updateLabel: updateLabel };
}

/* 导出函数（暴露到 window，供其他模块调用；均为异步，调用需 await） */

window.saveContacts = saveContacts;
window.getContacts = getContacts;
window.saveCurrentContactId = saveCurrentContactId;
window.getCurrentContactId = getCurrentContactId;
window.getCardData = getCardData;
window.saveCardData = saveCardData;
window.getCurrentCardData = getCurrentCardData;
window.saveCurrentCardData = saveCurrentCardData;
window.invalidateCardDataCache = invalidateCardDataCache;
window.getGlobalCardData = getGlobalCardData;
window.saveGlobalCardData = saveGlobalCardData;
window.getCurrentCardLib = getCurrentCardLib;
window.saveCurrentCardLib = saveCurrentCardLib;
window.getCardDataVersion = function () { return cardDataVersion; };
window.bumpCardDataVersion = bumpCardDataVersion;
window.savePartnerAvatar = savePartnerAvatar;
window.getPartnerAvatar = getPartnerAvatar;
window.saveUserAvatar = saveUserAvatar;
window.getUserAvatar = getUserAvatar;
window.saveMessages = saveMessages;
window.loadMessages = loadMessages;
window.clearMessagesStorage = clearMessagesStorage;
window.saveCurrentMessages = saveCurrentMessages;
window.getDefaultSettings = getDefaultSettings;
window.saveSettings = saveSettings;
window.getSettings = getSettings;
window.getContactById = getContactById;
window.contactExists = contactExists;
window.isNameTaken = isNameTaken;
window.getAllContacts = getAllContacts;
window.getCurrentContact = getCurrentContact;
window.getCurrentContactName = getCurrentContactName;
window.getDefaultCardData = getDefaultCardData;

// 暴露内部工具（供其他模块需要时使用）
window.openDB = openDB;
window.getFromStore = getFromStore;
window.putToStore = putToStore;
window.deleteFromStore = deleteFromStore;
window.getAllFromStore = getAllFromStore;
window.getByIndex = getByIndex;
window.deleteByIndex = deleteByIndex;
window.playSynthSound = playSynthSound;
window.normalizeGroups = normalizeGroups;
window.normalizeCardGroups = normalizeCardGroups;
window.createLibDropdown = createLibDropdown;
window.defaultAvatarSVG = defaultAvatarSVG;

window.loadMessagesFromTargetToLatest = loadMessagesFromTargetToLatest;
