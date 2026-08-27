/**
 * 聊天设置模块 chat-settings.js
 * 负责：设置弹窗的打开/关闭、选项卡切换、数据读写、UI 联动
 * 所有数据操作均为异步（IndexedDB）
 */

/* DOM 元素缓存 */

const settingsModal = document.getElementById('settingsModal');
const settingsCloseBtn = document.getElementById('settingsModalClose');
const settingsCancelBtn = document.getElementById('settingsCancelBtn');
const settingsConfirmBtn = document.getElementById('settingsConfirmBtn');

const settingsTabs = settingsModal ? settingsModal.querySelectorAll('.settings-tab') : [];
const settingsPanels = {
    single: document.getElementById('settingsPanelSingle'),
    group: document.getElementById('settingsPanelGroup'),
    sound: document.getElementById('settingsPanelSound')
};

/** 作用域定义：single（无前缀）/ group（Group 前缀），控件 ID 前缀不同 */
const SETTINGS_SCOPES = [
    { key: 'single', prefix: 'setting' },
    { key: 'group', prefix: 'settingGroup' }
];

/** 获取某作用域下的全部设置控件引用（按 ID 前缀查找） */
function getScopeEls(scopeKey) {
    const scope = SETTINGS_SCOPES.find(function (s) { return s.key === scopeKey; });
    const p = scope.prefix;
    return {
        minWait: document.getElementById(p + 'MinWait'),
        minWaitValue: document.getElementById(p + 'MinWaitValue'),
        maxWait: document.getElementById(p + 'MaxWait'),
        maxWaitValue: document.getElementById(p + 'MaxWaitValue'),
        replyMin: document.getElementById(p + 'ReplyMin'),
        replyMinValue: document.getElementById(p + 'ReplyMinValue'),
        replyMax: document.getElementById(p + 'ReplyMax'),
        replyMaxValue: document.getElementById(p + 'ReplyMaxValue'),
        combineCards: document.getElementById(p + 'CombineCards'),
        combineMin: document.getElementById(p + 'CombineMin'),
        combineMinValue: document.getElementById(p + 'CombineMinValue'),
        combineMax: document.getElementById(p + 'CombineMax'),
        combineMaxValue: document.getElementById(p + 'CombineMaxValue'),
        mixSticker: document.getElementById(p + 'MixSticker'),
        mixEmoji: document.getElementById(p + 'MixEmoji'),
        quoteReply: document.getElementById(p + 'QuoteReply'),
        quoteRate: document.getElementById(p + 'QuoteRate'),
        quoteRateValue: document.getElementById(p + 'QuoteRateValue'),
        replyLock: document.getElementById(p + 'ReplyLock'),
        replyLockValue: document.getElementById(p + 'ReplyLockValue'),
        readNoReply: document.getElementById(p + 'ReadNoReply'),
        autoSend: document.getElementById(p + 'AutoSend'),
        showTimestamp: document.getElementById(p + 'ShowTimestamp'),
        combineSub: document.getElementById(p + 'CombineSub'),
        combineSub2: document.getElementById(p + 'CombineSub2'),
        quoteSub: document.getElementById(p + 'QuoteSub'),
        autoSendSub: document.getElementById(p + 'AutoSendSub'),
        autoSendInterval: document.getElementById(p + 'AutoSendInterval'),
        autoSendIntervalValue: document.getElementById(p + 'AutoSendIntervalValue')
    };
}

/** 各作用域开关的“状态文字”映射（checkbox id -> status span id） */
function getToggleStatusMap() {
    const map = {};
    SETTINGS_SCOPES.forEach(function (scope) {
        const p = scope.prefix;
        map[p + 'CombineCards'] = p + 'CombineCardsStatus';
        map[p + 'MixSticker'] = p + 'MixStickerStatus';
        map[p + 'MixEmoji'] = p + 'MixEmojiStatus';
        map[p + 'QuoteReply'] = p + 'QuoteReplyStatus';
        map[p + 'ReadNoReply'] = p + 'ReadNoReplyStatus';
        map[p + 'AutoSend'] = p + 'AutoSendStatus';
        map[p + 'ShowTimestamp'] = p + 'ShowTimestampStatus';
    });
    map['settingSoundEnabled'] = 'settingSoundEnabledStatus';
    return map;
}

const settingSoundEnabled = document.getElementById('settingSoundEnabled');
const settingSoundVolume = document.getElementById('settingSoundVolume');
const settingSoundVolumeValue = document.getElementById('settingSoundVolumeValue');
const settingSendSound = document.getElementById('settingSendSound');
const settingReceiveSound = document.getElementById('settingReceiveSound');
const soundSubOptions = document.getElementById('soundSubOptions');
const soundPreviewBtns = document.querySelectorAll('.settings-sound-preview');

/* 打开 / 关闭弹窗 */

// 打开设置弹窗：先加载设置到界面，再显示
// 改前：直接移除 hidden 类打开弹窗
// 改后：如果弹窗已经打开，则关闭它（实现点击图标切换开关）
function openSettingsModal() {
    if (!settingsModal) return;

    // 如果弹窗当前是显示状态，关闭它并返回
    if (!settingsModal.classList.contains('hidden')) {
        closeSettingsModal();
        return;
    }

    // 以下是原有的打开逻辑
    (async function() {
        await loadSettingsToUI();
        settingsModal.classList.remove('hidden');
        switchSettingsTab('single');
    })();
}

/** 关闭设置弹窗 */
function closeSettingsModal() {
    if (settingsModal) settingsModal.classList.add('hidden');
}

/* 选项卡切换 */

/** 切换设置选项卡（single / group / sound） */
function switchSettingsTab(tabName) {
    // 只处理本弹窗（聊天设置）的 Tab，避免误响应装扮弹窗的 Tab 点击
    if (!settingsPanels[tabName]) return;
    settingsTabs.forEach(function (tab) {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
    });

    for (const key in settingsPanels) {
        const panel = settingsPanels[key];
        const isActive = key === tabName;
        // 同时管理 hidden 类：非活动面板隐藏、活动面板显示（防止 hidden 残留导致内容不显示）
        panel.classList.toggle('active', isActive);
        panel.classList.toggle('hidden', !isActive);
    }
}

/* 显示/隐藏子选项 */

/** 根据各作用域主开关状态显示/隐藏子选项区域 */
function updateSubOptionsVisibility() {
    SETTINGS_SCOPES.forEach(function (scope) {
        const els = getScopeEls(scope.key);
        if (!els.combineCards) return;
        els.combineSub.style.display = els.combineCards.checked ? 'flex' : 'none';
        els.combineSub2.style.display = els.combineCards.checked ? 'flex' : 'none';
        els.quoteSub.style.display = els.quoteReply.checked ? 'flex' : 'none';
        els.autoSendSub.style.display = els.autoSend.checked ? 'flex' : 'none';
    });

    if (soundSubOptions) {
        soundSubOptions.style.display = settingSoundEnabled.checked ? 'block' : 'none';
    }
}

/* 更新开关状态文字 */

/** 把所有开关的「开/关」状态文字刷新一遍（含单聊/群聊两个作用域） */
function updateAllToggleStatus() {
    const toggleStatusMap = getToggleStatusMap();
    for (const checkboxId in toggleStatusMap) {
        const checkbox = document.getElementById(checkboxId);
        const statusEl = document.getElementById(toggleStatusMap[checkboxId]);
        if (checkbox && statusEl) {
            statusEl.textContent = checkbox.checked ? '开' : '关';
        }
    }
}

/* 滑块实时更新 */

/** 滑块联动：最小值变大时，把最大值顶上去 */
function ensureMaxNotLessThan(minEl, maxEl) {
    if (maxEl && parseInt(maxEl.value) < parseInt(minEl.value)) {
        maxEl.value = minEl.value;
        maxEl.dispatchEvent(new Event('input'));
    }
}

/** 滑块联动：最大值变小时，把最小值拉下来 */
function ensureMinNotGreaterThan(minEl, maxEl) {
    if (minEl && parseInt(minEl.value) > parseInt(maxEl.value)) {
        minEl.value = maxEl.value;
        minEl.dispatchEvent(new Event('input'));
    }
}

/** 绑定所有滑块的实时数值显示，并保证最小/最大值联动不冲突（同时覆盖单聊/群聊两套滑块） */
function bindSliderRealtime() {
    const sliders = document.querySelectorAll('.settings-slider-wrap input[type="range"]');
    sliders.forEach(function (slider) {
        slider.addEventListener('input', function () {
            const wrap = this.closest('.settings-slider-wrap');
            const valueSpan = wrap.querySelector('.settings-slider-value');
            if (!valueSpan) return;

            const val = parseFloat(this.value);
            const id = this.id;
            // 通过 ID 后缀判断类型（settingXxx / settingGroupXxx 共用同一后缀）

            if (id.endsWith('MinWait')) {
                valueSpan.textContent = val + ' 秒';
            } else if (id.endsWith('MaxWait')) {
                if (val < 1) {
                    const seconds = Math.round(val * 60);
                    valueSpan.textContent = seconds + ' 秒';
                } else {
                    valueSpan.textContent = val + ' 分钟';
                }
            } else if (id.endsWith('ReplyMin') || id.endsWith('ReplyMax') ||
                id.endsWith('CombineMin') || id.endsWith('CombineMax')) {
                valueSpan.textContent = val + ' 条';
            } else if (id.endsWith('QuoteRate')) {
                valueSpan.textContent = val + '%';
            } else if (id.endsWith('ReplyLock')) {
                valueSpan.textContent = val + ' 秒';
            } else if (id.endsWith('SoundVolume')) {
                valueSpan.textContent = val + '%';
            } else if (id.endsWith('AutoSendInterval')) {
                valueSpan.textContent = val + ' 分钟';
            } else {
                valueSpan.textContent = val;
            }

            // ---- 联动（同一前缀内替换后缀即可同时适配单聊/群聊） ----
            if (id.endsWith('MinWait')) {
                const prefix = id.slice(0, -'MinWait'.length);
                const maxSlider = document.getElementById(prefix + 'MaxWait');
                if (maxSlider) {
                    const maxSeconds = parseFloat(maxSlider.value) * 60;
                    if (maxSeconds < val) {
                        let newMax = Math.ceil(val / 60 * 100) / 100;
                        newMax = Math.max(0.17, newMax);
                        newMax = Math.min(10, newMax);
                        maxSlider.value = newMax;
                        maxSlider.dispatchEvent(new Event('input'));
                    }
                }
            }
            if (id.endsWith('MaxWait')) {
                const prefix = id.slice(0, -'MaxWait'.length);
                const minSlider = document.getElementById(prefix + 'MinWait');
                if (minSlider) {
                    const minSeconds = parseFloat(minSlider.value);
                    const maxSeconds = val * 60;
                    if (minSeconds > maxSeconds) {
                        let newMin = Math.floor(maxSeconds);
                        newMin = Math.max(1, newMin);
                        newMin = Math.min(30, newMin);
                        minSlider.value = newMin;
                        minSlider.dispatchEvent(new Event('input'));
                    }
                }
            }

            if (id.endsWith('ReplyMin')) {
                ensureMaxNotLessThan(this, document.getElementById(id.replace('ReplyMin', 'ReplyMax')));
            }
            if (id.endsWith('ReplyMax')) {
                ensureMinNotGreaterThan(document.getElementById(id.replace('ReplyMax', 'ReplyMin')), this);
            }
            if (id.endsWith('CombineMin')) {
                ensureMaxNotLessThan(this, document.getElementById(id.replace('CombineMin', 'CombineMax')));
            }
            if (id.endsWith('CombineMax')) {
                ensureMinNotGreaterThan(document.getElementById(id.replace('CombineMax', 'CombineMin')), this);
            }
        });
    });
}

/* 从 IndexedDB 加载设置 */

/** 把已保存的设置填充到界面上（单聊/群聊分别加载到各自面板） */
async function loadSettingsToUI() {
    const settings = await getSettings();

    // 单聊 / 群聊两个作用域
    SETTINGS_SCOPES.forEach(function (scope) {
        const els = getScopeEls(scope.key);
        const scopeSettings = settings[scope.key];
        if (!els.minWait || !scopeSettings) return;

        els.minWait.value = scopeSettings.replySpeed.minWait;
        els.minWaitValue.textContent = scopeSettings.replySpeed.minWait + ' 秒';
        els.maxWait.value = scopeSettings.replySpeed.maxWait;
        const maxWaitVal = scopeSettings.replySpeed.maxWait;
        if (maxWaitVal < 1) {
            const seconds = Math.round(maxWaitVal * 60);
            els.maxWaitValue.textContent = seconds + ' 秒';
        } else {
            els.maxWaitValue.textContent = maxWaitVal + ' 分钟';
        }

        els.replyMin.value = scopeSettings.replyCount.min;
        els.replyMinValue.textContent = scopeSettings.replyCount.min + ' 条';
        els.replyMax.value = scopeSettings.replyCount.max;
        els.replyMaxValue.textContent = scopeSettings.replyCount.max + ' 条';

        els.combineCards.checked = scopeSettings.replyContent.combineCards;
        els.combineMin.value = scopeSettings.replyContent.combineMin;
        els.combineMinValue.textContent = scopeSettings.replyContent.combineMin + ' 条';
        els.combineMax.value = scopeSettings.replyContent.combineMax;
        els.combineMaxValue.textContent = scopeSettings.replyContent.combineMax + ' 条';
        els.mixSticker.checked = scopeSettings.replyContent.mixSticker;
        els.mixEmoji.checked = scopeSettings.replyContent.mixEmoji;

        els.quoteReply.checked = scopeSettings.messageInteraction.quoteReply;
        els.quoteRate.value = scopeSettings.messageInteraction.quoteRate;
        els.quoteRateValue.textContent = scopeSettings.messageInteraction.quoteRate + '%';
        els.replyLock.value = scopeSettings.messageInteraction.replyLockSeconds || 10;
        els.replyLockValue.textContent = (scopeSettings.messageInteraction.replyLockSeconds || 10) + ' 秒';
        els.readNoReply.checked = scopeSettings.messageInteraction.readNoReply;

        const autoSendInterval = els.autoSendInterval;
        if (autoSendInterval) {
            autoSendInterval.value = scopeSettings.messageInteraction.autoSendInterval || 30;
            const intervalSpan = autoSendInterval.closest('.settings-slider-wrap')?.querySelector('.settings-slider-value');
            if (intervalSpan) intervalSpan.textContent = (scopeSettings.messageInteraction.autoSendInterval || 30) + ' 分钟';
        }

        els.autoSend.checked = scopeSettings.messageInteraction.autoSend || false;

        const showTimestamp = scopeSettings.timestampStyle !== 'none';
        els.showTimestamp.checked = showTimestamp;
    });

    // 音效（全局）
    settingSoundEnabled.checked = settings.sound.enabled;
    settingSoundVolume.value = settings.sound.volume;
    settingSoundVolumeValue.textContent = settings.sound.volume + '%';
    settingSendSound.value = settings.sound.sendSound;
    settingReceiveSound.value = settings.sound.receiveSound;

    updateSubOptionsVisibility();
    updateAllToggleStatus();
}

/* 保存设置 */

/** 从界面收集设置并保存，同时重置自动发送定时器、刷新消息时间戳 */
async function saveSettingsFromUI() {
    const settings = {
        single: {},
        group: {},
        sound: {}
    };

    // 单聊 / 群聊两个作用域
    SETTINGS_SCOPES.forEach(function (scope) {
        const els = getScopeEls(scope.key);
        if (!els.minWait) return;
        const autoSendInterval = els.autoSendInterval;
        settings[scope.key] = {
            replySpeed: {
                minWait: parseFloat(els.minWait.value),
                maxWait: parseFloat(els.maxWait.value)
            },
            replyCount: {
                min: parseFloat(els.replyMin.value),
                max: parseFloat(els.replyMax.value)
            },
            replyContent: {
                combineCards: els.combineCards.checked,
                combineMin: parseFloat(els.combineMin.value),
                combineMax: parseFloat(els.combineMax.value),
                mixSticker: els.mixSticker.checked,
                mixEmoji: els.mixEmoji.checked
            },
            messageInteraction: {
                quoteReply: els.quoteReply.checked,
                quoteRate: parseFloat(els.quoteRate.value),
                readNoReply: els.readNoReply.checked,
                readNoReplyRate: 10,
                autoSend: els.autoSend.checked,
                autoSendInterval: autoSendInterval ? parseFloat(autoSendInterval.value) : 30,
                replyLockSeconds: els.replyLock ? parseInt(els.replyLock.value) : 10
            },
            timestampStyle: els.showTimestamp.checked ? 'zh' : 'none'
        };
    });

    settings.sound = {
        enabled: settingSoundEnabled.checked,
        volume: parseFloat(settingSoundVolume.value),
        sendSound: settingSendSound.value,
        receiveSound: settingReceiveSound.value
    };

    await saveSettings(settings);

    if (typeof window.resetAutoSendTimer === 'function') {
        window.resetAutoSendTimer();
    }

    showToast(`
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;">
        <path d="M20 6L9 17l-5-5"/>
    </svg>
    设置已保存
`);

    // 保存后刷新消息区，保持当前聊天模式：
    // 群聊模式下加载群聊消息（group_xxx），单聊模式才加载联系人消息
    const groupId = window.getCurrentGroupIdSync ? window.getCurrentGroupIdSync() : null;
    if (groupId !== null) {
        if (typeof loadMessagesForContact === 'function') {
            loadMessagesForContact('group_' + groupId);
        }
    } else {
        const contactId = await getCurrentContactId();
        if (contactId && typeof loadMessagesForContact === 'function') {
            loadMessagesForContact(contactId);
        }
    }
}

/* 音效试听 */

/** 试听音效：按当前弹窗里的音色与音量调用公共合成函数 */
function playPreviewSound(type) {
    const soundValue = type === 'send' ? settingSendSound.value : settingReceiveSound.value;
    playSynthSound(soundValue, parseFloat(settingSoundVolume.value) / 100);
}

/* 绑定事件 */

/** 绑定设置弹窗的全部交互事件 */
function bindSettingsEvents() {
    settingsTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchSettingsTab(this.dataset.tab);
        });
    });

    // 主开关 -> 子选项显隐（单聊/群聊各一套 + 音效）
    const toggleSubItems = ['settingSoundEnabled'];
    SETTINGS_SCOPES.forEach(function (scope) {
        toggleSubItems.push(scope.prefix + 'CombineCards');
        toggleSubItems.push(scope.prefix + 'QuoteReply');
        toggleSubItems.push(scope.prefix + 'AutoSend');
    });
    toggleSubItems.forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function () {
                updateSubOptionsVisibility();
                updateAllToggleStatus();
            });
        }
    });

    const allToggles = document.querySelectorAll('.settings-toggle input[type="checkbox"]');
    allToggles.forEach(function (toggle) {
        if (!toggleSubItems.includes(toggle.id)) {
            toggle.addEventListener('change', function () {
                updateAllToggleStatus();
            });
        }
    });

    bindSliderRealtime();

    settingsCloseBtn.addEventListener('click', closeSettingsModal);
    if (settingsCancelBtn) {
        settingsCancelBtn.addEventListener('click', closeSettingsModal);
    }

    settingsConfirmBtn.addEventListener('click', function () {
        (async function() {
            await saveSettingsFromUI();
            closeSettingsModal();
        })();
    });


    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
            closeSettingsModal();
        }
    });

    soundPreviewBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            const type = this.dataset.sound;
            playPreviewSound(type);
        });
    });

    // 滑块 change 后的最小值/最大值联动（单聊/群聊两套）
    SETTINGS_SCOPES.forEach(function (scope) {
        const p = scope.prefix;
        const replyMinEl = document.getElementById(p + 'ReplyMin');
        const replyMaxEl = document.getElementById(p + 'ReplyMax');
        const combineMinEl = document.getElementById(p + 'CombineMin');
        const combineMaxEl = document.getElementById(p + 'CombineMax');
        if (replyMinEl) {
            replyMinEl.addEventListener('change', function () {
                ensureMaxNotLessThan(this, document.getElementById(p + 'ReplyMax'));
            });
        }
        if (replyMaxEl) {
            replyMaxEl.addEventListener('change', function () {
                ensureMinNotGreaterThan(document.getElementById(p + 'ReplyMin'), this);
            });
        }
        if (combineMinEl) {
            combineMinEl.addEventListener('change', function () {
                ensureMaxNotLessThan(this, document.getElementById(p + 'CombineMax'));
            });
        }
        if (combineMaxEl) {
            combineMaxEl.addEventListener('change', function () {
                ensureMinNotGreaterThan(document.getElementById(p + 'CombineMin'), this);
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    bindSettingsEvents();
    updateSubOptionsVisibility();
    updateAllToggleStatus();
});

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
