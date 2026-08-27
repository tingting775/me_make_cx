/**
 * 装扮模块 dress-up.js
 * 功能：主题色切换、聊天背景上传（含最近上传列表）、自定义圆形色盘、恢复默认、高级调节（透明度/毛玻璃）
 * 所有数据存储在 IndexedDB 的 appState 中，key 为 'dressUp'
 */

/* 预设颜色（常用色、饱和度适中、色系丰富，一排 12 个） */
const PRESET_COLORS = [
    // 一排 12 个：红橙黄绿青蓝紫粉都有
    { name: '珊瑚红', color: '#f05b56', gradient: ['#fbdcd9', '#fde7e4', '#fef1ef'] },
    { name: '活力橙', color: '#ff8c42', gradient: ['#ffe3cc', '#ffecdb', '#fff5ea'] },
    { name: '琥珀金', color: '#f5b942', gradient: ['#fdeecb', '#fef3da', '#fef8e9'] },
    { name: '柠檬黄', color: '#f2cf4b', gradient: ['#fbf3c9', '#fcf7da', '#fdfae9'] },
    { name: '草绿', color: '#7bc950', gradient: ['#ddf2cd', '#e6f6da', '#effae7'] },
    { name: '翡翠绿', color: '#2eb872', gradient: ['#c8ecda', '#d9f1e6', '#e9f7f1'] },
    { name: '青碧', color: '#28c1a0', gradient: ['#c6efe7', '#d7f4ee', '#e8f9f5'] },
    { name: '湖蓝', color: '#4fb3d9', gradient: ['#cceaf6', '#daf0f8', '#e8f6fa'] },
    { name: '天蓝', color: '#4a90d9', gradient: ['#cfe3f5', '#ddebf8', '#ebf3fb'] },
    { name: '靛蓝', color: '#5b6ee1', gradient: ['#d3d9f5', '#e1e5f8', '#eef0fb'] },
    { name: '罗兰紫', color: '#8d6fd8', gradient: ['#e2d8f5', '#eae3f8', '#f2edfb'] },
    { name: '樱花粉', color: '#f47bb3', gradient: ['#fbd7e6', '#fce3ec', '#fdeef4'] }
];

/* 自选颜色最多保留数量 */
const CUSTOM_COLORS_MAX = 8;

/* 默认主题色：天蓝（未保存设置 / 恢复默认时使用） */
const DEFAULT_THEME_COLOR = '#4a90d9';

/* 时间戳颜色预设：与主题色一致（直接复用 PRESET_COLORS） */

/* DOM 元素缓存 */
let dressUpModal = null;
let colorPickerGrid = null;
let resetBtn = null;
let confirmBtn = null;
let closeBtn = null;

// Tab 切换
let dressUpTabs = null;
let dressUpPanels = null;

// 生效对象下拉框（单人 / 群聊）
let singleTargetBtn = null;
let singleTargetName = null;
let singleTargetDropdown = null;
let singleTargetList = null;
let singleTargetWarn = null;
let groupTargetBtn = null;
let groupTargetName = null;
let groupTargetDropdown = null;
let groupTargetList = null;
let groupTargetWarn = null;

// 聊天背景（单人 / 群聊 两套独立 DOM）
let bgUploadBtn = null;
let bgRemoveBtn = null;
let bgFileInput = null;
let recentBgRow = null;
let recentBgGrid = null;
let bgScopeRadios = null;
let groupBgUploadBtn = null;
let groupBgRemoveBtn = null;
let groupBgFileInput = null;
let groupRecentBgRow = null;
let groupRecentBgGrid = null;
let groupBgScopeRadios = null;

// 高级调节 DOM 元素
let glassHeaderOpacity = null;
let glassHeaderBlur = null;
let glassMessageOpacity = null;
let glassMessageBlur = null;
let glassBottomOpacity = null;
let glassBottomBlur = null;
let glassResetBtn = null;

// 自定义取色面板 DOM 元素
let colorWheelPanel = null;
let colorSvCanvas = null;
let colorSvCtx = null;
let colorHueCanvas = null;
let colorHueCtx = null;
let colorAlphaCanvas = null;
let colorAlphaCtx = null;
let colorWheelCurrent = null;
let colorWheelHex = null;
let colorWheelHsla = null;
let colorWheelConfirmBtn = null;
let colorWheelCancelBtn = null;
let colorWheelEyeBtn = null;
let colorSvIndicator = null;
let colorHueIndicator = null;
let colorAlphaIndicator = null;

// 取色面板状态（HSVA）
let colorWheelTarget = null;        // 'theme' | 'timestamp' | 'groupName'
let colorWheelStartColor = '#ffffff';
let colorWheelTempColor = '#ffffff';
let colorWheelH = 210;              // 色相 0-360
let colorWheelS = 0.7;              // 饱和度 0-1
let colorWheelV = 0.9;              // 明度 0-1
let colorWheelA = 1;                // 透明度 0-1

/* 当前状态（内存） */

// 默认颜色（对象未单独设置时使用的兜底值，仅用于 UI 预览与取色面板起始色）
const DEFAULT_TIMESTAMP_COLOR = '#8faea3';
const DEFAULT_GROUP_NAME_COLOR = '#5a7c72';

let currentSettings = {
    themeColor: DEFAULT_THEME_COLOR,
    customThemeColors: [],      // 自选主题色列表（最多 CUSTOM_COLORS_MAX 个）
    customTimestampColors: [],  // 自选时间戳颜色列表（全站共享一份）
    customGroupNameColors: [],  // 自选多人聊天名称颜色列表（全站共享一份）
    glass: {
        header: { opacity: 0.25, blur: 10 },   // 标题栏：25% / 10px
        message: { opacity: 0, blur: 0 },       // 消息区域：0% / 0px
        bottom: { opacity: 0.6, blur: 10 }      // 输入框区域：60% / 10px
    },
    // 【单人】tab：每个联系人（含 common 通用）各自独立的背景/时间戳颜色/最近上传
    single: {
        scope: 'chat',          // 生效范围（仅聊天区域 / 全站），Tab 内所有背景共用
        objects: {}             // key: 'common' 或 String(contactId)
    },
    // 【群聊】tab：每个聊天室（含 common 通用）各自独立的背景/时间戳颜色/名称颜色/最近上传
    group: {
        scope: 'chat',
        objects: {}             // key: 'common' 或 String(groupId)
    }
};

// 当前打开的 Tab：'global' | 'single' | 'group'
let currentDressTab = 'single';
// 生效对象下拉框当前选中的 key：'common' 或 String(id)
let singleTargetKey = 'common';
let groupTargetKey = 'common';

/* 数据对象工具 */

/** 默认的单人对象结构（未设置时各字段为 null/空） */
function defaultSingleObject() {
    return { backgroundImage: null, timestampColor: null, recentBackgrounds: [] };
}

/** 默认的群聊对象结构 */
function defaultGroupObject() {
    return { backgroundImage: null, timestampColor: null, groupNameColor: null, recentBackgrounds: [] };
}

/** 取 Tab 状态（'single' | 'group' → currentSettings.single/group） */
function getTabSettings(tabName) {
    return tabName === 'group' ? currentSettings.group : currentSettings.single;
}

/** 取某个生效对象的数据（不存在时自动补默认结构） */
function getTabObject(tabSettings, key) {
    if (!tabSettings.objects[key]) {
        tabSettings.objects[key] = (tabSettings === currentSettings.group) ? defaultGroupObject() : defaultSingleObject();
    }
    return tabSettings.objects[key];
}

/** 取当前 Tab 的生效对象 key */
function getCurrentTargetKey() {
    return currentDressTab === 'group' ? groupTargetKey : singleTargetKey;
}

/** 取当前 Tab 当前生效对象的数据 */
function getCurrentTabObject() {
    return getTabObject(getTabSettings(currentDressTab), getCurrentTargetKey());
}

/** 同步取当前聊天对象 id（单人→联系人 id，群聊→聊天室 id；未在聊天返回 null） */
function getCurrentChatObjectId() {
    if (typeof isGroupChatMode === 'function' && isGroupChatMode()) {
        return (typeof window.getCurrentGroupIdSync === 'function') ? window.getCurrentGroupIdSync() : null;
    }
    return (typeof window.getCurrentContactIdSync === 'function') ? window.getCurrentContactIdSync() : null;
}

/** 同步取当前聊天对象对应的数据（单人→single.objects[id]，群聊→group.objects[id]） */
function getCurrentChatObjectData() {
    const id = getCurrentChatObjectId();
    if (id === null || id === undefined) return null;
    const tab = (typeof isGroupChatMode === 'function' && isGroupChatMode()) ? currentSettings.group : currentSettings.single;
    return tab.objects[id] || null;
}

/* 工具函数：判断颜色亮度 */

/** 根据亮度判断是否适合用深色文字（>160 为浅色） */
function isColorLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160;
}

/* 工具函数：颜色派生 */

/** hex 转 RGB 对象 */
function hexToRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

/** RGB 转 hex（自动补零） */
function rgbToHex(r, g, b) {
    const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

/** hex 转 HSL 对象（h: 0-360, s: 0-1, l: 0-1） */
function hexToHsl(hex) {
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
}

/** HSL 转 hex */
function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
}

/** 从浅色背景派生「强调色」：保持色相、压暗亮度，保证在浅背景上清晰可见 */
function deriveAccentColor(color) {
    const { h, s, l } = hexToHsl(color);
    // 保底饱和度：浅色通常饱和度低，抬一点避免太灰
    const newS = Math.min(0.6, Math.max(s, 0.35));
    // 压暗到中等深度（浅背景上用深色做强调）
    const newL = Math.min(l, 0.5);
    return hslToHex(h, newS, newL);
}

/** 从任意颜色派生浅色背景渐变（自定义主题色时使用，保持色相、降低饱和度） */
function deriveGradient(color) {
    const { h, s } = hexToHsl(color);
    const baseL = 0.88;
    const gS = Math.min(0.35, Math.max(s * 0.45, 0.12));
    return [
        hslToHex(h, gS, baseL),
        hslToHex(h, gS * 0.85, Math.min(0.95, baseL + 0.05)),
        hslToHex(h, gS * 0.7, Math.min(1, baseL + 0.10))
    ];
}

/** 派生发光文字色（比强调色亮一些，用于文字光晕） */
function deriveGlowColors(color) {
    const { h, s } = hexToHsl(color);
    const glowS = Math.min(0.55, Math.max(s, 0.3));
    return {
        glow1: hslToHex(h, glowS, 0.72), // 亮光晕
        glow2: hslToHex(h, glowS, 0.62)  // 中光晕
    };
}

/* 初始化 */

/** 初始化装扮模块：缓存 DOM、初始化色盘、绑定事件、加载设置 */
function initDressUp() {
    // 缓存 DOM 元素
    dressUpModal = document.getElementById('dressUpModal');
    colorPickerGrid = document.getElementById('colorPickerGrid');
    resetBtn = document.getElementById('dressUpResetBtn');
    confirmBtn = document.getElementById('dressUpConfirmBtn');
    closeBtn = document.getElementById('dressUpCloseBtn');

    // Tab 切换
    dressUpTabs = dressUpModal ? dressUpModal.querySelectorAll('.settings-tab') : [];
    dressUpPanels = {
        global: document.getElementById('dressUpPanelGlobal'),
        single: document.getElementById('dressUpPanelSingle'),
        group: document.getElementById('dressUpPanelGroup')
    };

    // 生效对象下拉框
    singleTargetBtn = document.getElementById('singleTargetBtn');
    singleTargetName = document.getElementById('singleTargetName');
    singleTargetDropdown = document.getElementById('singleTargetDropdown');
    singleTargetList = document.getElementById('singleTargetList');
    singleTargetWarn = document.getElementById('singleTargetWarn');
    groupTargetBtn = document.getElementById('groupTargetBtn');
    groupTargetName = document.getElementById('groupTargetName');
    groupTargetDropdown = document.getElementById('groupTargetDropdown');
    groupTargetList = document.getElementById('groupTargetList');
    groupTargetWarn = document.getElementById('groupTargetWarn');

    // 聊天背景（单人 + 群聊 两套）
    bgUploadBtn = document.getElementById('bgUploadBtn');
    bgRemoveBtn = document.getElementById('bgRemoveBtn');
    bgFileInput = document.getElementById('bgFileInput');
    recentBgRow = document.getElementById('recentBgRow');
    recentBgGrid = document.getElementById('recentBgGrid');
    bgScopeRadios = document.querySelectorAll('input[name="bgScope"]');
    groupBgUploadBtn = document.getElementById('groupBgUploadBtn');
    groupBgRemoveBtn = document.getElementById('groupBgRemoveBtn');
    groupBgFileInput = document.getElementById('groupBgFileInput');
    groupRecentBgRow = document.getElementById('groupRecentBgRow');
    groupRecentBgGrid = document.getElementById('groupRecentBgGrid');
    groupBgScopeRadios = document.querySelectorAll('input[name="groupBgScope"]');

    glassHeaderOpacity = document.getElementById('glassHeaderOpacity');
    glassHeaderBlur = document.getElementById('glassHeaderBlur');
    glassMessageOpacity = document.getElementById('glassMessageOpacity');
    glassMessageBlur = document.getElementById('glassMessageBlur');
    glassBottomOpacity = document.getElementById('glassBottomOpacity');
    glassBottomBlur = document.getElementById('glassBottomBlur');
    glassResetBtn = document.getElementById('glassResetBtn');

    if (!dressUpModal) return;

    // 初始化圆形色盘
    initColorWheel();

    // 绑定事件
    bindDressUpEvents();

    // 加载保存的设置
    loadDressUpSettings();
}

/* 加载 / 保存设置 */

/** 旧数据迁移：老版本是单份 backgroundImage/timestampColor/groupNameColor，迁移到新的对象结构 */
function migrateOldSettings(settings) {
    // 单人：老字段 backgroundImage / backgroundScope / recentBackgrounds / timestampColor
    if (!settings.single || !settings.single.objects) {
        const single = { scope: 'chat', objects: {} };
        if (settings.backgroundImage !== undefined || settings.timestampColor !== undefined ||
            (Array.isArray(settings.recentBackgrounds) && settings.recentBackgrounds.length > 0)) {
            single.objects.common = {
                backgroundImage: settings.backgroundImage || null,
                timestampColor: settings.timestampColor || null,
                recentBackgrounds: Array.isArray(settings.recentBackgrounds) ? settings.recentBackgrounds.slice(0, 5) : []
            };
        }
        if (settings.backgroundScope) single.scope = settings.backgroundScope;
        settings.single = single;
    }
    // 群聊：老字段 groupNameColor
    if (!settings.group || !settings.group.objects) {
        const group = { scope: 'chat', objects: {} };
        if (settings.groupNameColor !== undefined) {
            group.objects.common = {
                backgroundImage: null,
                timestampColor: null,
                groupNameColor: settings.groupNameColor || null,
                recentBackgrounds: []
            };
        }
        if (settings.groupBackgroundScope) group.scope = settings.groupBackgroundScope;
        settings.group = group;
    }
    return settings;
}

/** 从 IndexedDB 加载装扮设置并应用 */
async function loadDressUpSettings() {
    try {
        const record = await getFromStore('appState', 'dressUp');
        if (record && record.value) {
            const settings = migrateOldSettings(record.value);
            currentSettings.themeColor = settings.themeColor || DEFAULT_THEME_COLOR;
            currentSettings.single = settings.single;
            currentSettings.group = settings.group;
            currentSettings.customThemeColors = Array.isArray(settings.customThemeColors) ? settings.customThemeColors.slice(0, CUSTOM_COLORS_MAX) : [];
            currentSettings.customTimestampColors = Array.isArray(settings.customTimestampColors) ? settings.customTimestampColors.slice(0, CUSTOM_COLORS_MAX) : [];
            currentSettings.customGroupNameColors = Array.isArray(settings.customGroupNameColors) ? settings.customGroupNameColors.slice(0, CUSTOM_COLORS_MAX) : [];

            // 加载玻璃设置
            if (settings.glass) {
                currentSettings.glass = settings.glass;
            }

            // 应用主题色
            applyThemeColor(currentSettings.themeColor);
            // 应用玻璃设置
            applyGlassSettings(currentSettings.glass);
            updateGlassUI(currentSettings.glass);
            // 按当前聊天对象应用背景/颜色
            applyCurrentChatBackground();
            // 更新 UI
            updateColorPickerUI();
            updateSinglePanel();
            updateGroupPanel();
        } else {
            // 没有保存的设置，用默认值（天蓝）
            applyThemeColor(DEFAULT_THEME_COLOR);
            applyGlassSettings(currentSettings.glass);
            updateGlassUI(currentSettings.glass);
            updateColorPickerUI();
            updateSinglePanel();
            updateGroupPanel();
        }
    } catch (e) {
        console.error('加载装扮设置失败：', e);
    }
}

/** 保存装扮设置到 IndexedDB */
async function saveDressUpSettings() {
    try {
        await putToStore('appState', {
            key: 'dressUp',
            value: {
                themeColor: currentSettings.themeColor,
                single: currentSettings.single,
                group: currentSettings.group,
                customThemeColors: currentSettings.customThemeColors || [],
                customTimestampColors: currentSettings.customTimestampColors || [],
                customGroupNameColors: currentSettings.customGroupNameColors || [],
                glass: currentSettings.glass
            }
        });
    } catch (e) {
        console.error('保存装扮设置失败：', e);
    }
}

/* 主题色 */

/**
 * 解析颜色字符串为 { r, g, b, a, hex }
 * 支持：#rgb / #rrggbb / #rrggbbaa 与 rgba(r,g,b,a) / rgb(r,g,b)
 */
function parseColorValue(color) {
    if (!color) return null;
    const c = String(color).trim().toLowerCase();
    // #rgb / #rgba（短格式，每位重复展开）
    if (/^#[0-9a-f]{3,4}$/.test(c)) {
        const s = c.slice(1);
        const r = parseInt(s[0] + s[0], 16);
        const g = parseInt(s[1] + s[1], 16);
        const b = parseInt(s[2] + s[2], 16);
        const a = s.length === 4 ? Math.round((parseInt(s[3] + s[3], 16) / 255) * 100) / 100 : 1;
        return {
            r, g, b, a,
            hex: rgbToHex(r, g, b)
        };
    }
    // #rrggbb
    if (/^#[0-9a-f]{6}$/.test(c)) {
        return {
            r: parseInt(c.slice(1, 3), 16),
            g: parseInt(c.slice(3, 5), 16),
            b: parseInt(c.slice(5, 7), 16),
            a: 1,
            hex: c
        };
    }
    // #rrggbbaa（后两位为透明度）
    if (/^#[0-9a-f]{8}$/.test(c)) {
        return {
            r: parseInt(c.slice(1, 3), 16),
            g: parseInt(c.slice(3, 5), 16),
            b: parseInt(c.slice(5, 7), 16),
            a: Math.round((parseInt(c.slice(7, 9), 16) / 255) * 100) / 100,
            hex: c.slice(0, 7)
        };
    }
    const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) {
        const r = Math.round(parseFloat(m[1]));
        const g = Math.round(parseFloat(m[2]));
        const b = Math.round(parseFloat(m[3]));
        const a = m[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(m[4]))) : 1;
        return { r, g, b, a, hex: rgbToHex(r, g, b) };
    }
    return null;
}

/**
 * 应用主题色到整个网站
 * 思路：背景渐变用浅色（内置色用预设渐变，自定义色自动派生），
 *      再从主题色派生「强调色」写入全局 CSS 变量，全站按钮/边框/阴影自动跟随
 */
function applyThemeColor(color) {
    const parsed = parseColorValue(color);
    if (!parsed) return;
    const { r, g, b, a, hex } = parsed;
    const preset = PRESET_COLORS.find(p => p.color === hex);
    // 自定义颜色没有预设渐变，自行派生浅色渐变
    const gradient = preset ? preset.gradient : deriveGradient(hex);
    const [g1, g2, g3] = gradient;

    // 页面背景渐变（仅 CSS 变量，不直接设置 body，防止覆盖）
    document.documentElement.style.setProperty('--bg-page-gradient1', g1);
    document.documentElement.style.setProperty('--bg-page-gradient2', g2);
    document.documentElement.style.setProperty('--bg-page-gradient3', g3);

    // 从浅色背景派生强调色，写入全局主题色变量
    const accent = deriveAccentColor(hex);
    const ar = hexToRgb(accent);
    document.documentElement.style.setProperty('--primary-color', accent);
    // RGB 三元组：供 rgba(var(--primary-rgb), 0.x) 系列使用
    document.documentElement.style.setProperty('--primary-rgb', ar.r + ', ' + ar.g + ', ' + ar.b);

    // 发光文字色（文字光晕）
    const { glow1, glow2 } = deriveGlowColors(hex);
    document.documentElement.style.setProperty('--primary-glow1', glow1);
    document.documentElement.style.setProperty('--primary-glow2', glow2);

    // body 背景保持默认（不随主题色变化）
    // 已删除 document.body.style.background 的设置

    // 带透明度的衍生变量：主色带 alpha 时按比例叠加，否则保持原有 hex+透明度后缀
    const withAlpha = function (hexSuffix, ratio) {
        if (a >= 0.999) return hex + hexSuffix;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (a * ratio).toFixed(3) + ')';
    };

    // 自己发的消息气泡背景色（主题色 + 约 80% 不透明度，用于滚动条/遮罩等 UI）
    document.documentElement.style.setProperty('--primary-light', withAlpha('CC', 0.8));

    // 自己的消息气泡背景（主题色 + 90% 不透明度，独立变量避免影响其他 UI）
    document.documentElement.style.setProperty('--bubble-bg', withAlpha('E6', 0.9));

    // 文字颜色：从主题色派生（保持色相，压暗保证可读性）
    // --text-main 主体文字（深色） / --text-secondary 次级文字（中深） / --text-placeholder 占位符（主题色带透明度）
    const { h: th, s: ts } = hexToHsl(accent);
    const textMain = hslToHex(th, Math.min(0.55, Math.max(ts, 0.3)), 0.26);
    const textSecondary = hslToHex(th, Math.min(0.5, Math.max(ts, 0.22)), 0.42);
    document.documentElement.style.setProperty('--text-main', textMain);
    document.documentElement.style.setProperty('--text-secondary', textSecondary);
    document.documentElement.style.setProperty('--text-placeholder', 'rgba(' + ar.r + ', ' + ar.g + ', ' + ar.b + ', 0.35)');

    // 根据主题色亮度决定自己气泡的文字颜色（浅色主题用深色文字，深色主题用白色）
    const textColor = isColorLight(hex) ? textMain : '#ffffff';
    document.documentElement.style.setProperty('--self-msg-color', textColor);

    // 更新状态
    currentSettings.themeColor = color;
    updateColorPickerUI();

    // 更新所有弹窗的标题栏背景色
    document.documentElement.style.setProperty('--modal-header-bg', withAlpha('CC', 0.8));

    // 弹窗遮罩背景
    document.documentElement.style.setProperty('--modal-overlay-bg', 'rgba(0, 0, 0, 0.30)');

    // 按钮悬停颜色（淡一点的主题色）
    document.documentElement.style.setProperty('--btn-hover-bg', withAlpha('40', 0.25));

    // 更新按钮边框颜色（主题色 + 25% 透明度，柔和一些）
    document.documentElement.style.setProperty('--btn-border-color', withAlpha('40', 0.25));

    // 主题色变化后，标题栏名字颜色需按当前透明度重算
    if (currentSettings.glass && currentSettings.glass.header) {
        applyHeaderNameAdaptiveColor(currentSettings.glass.header.opacity);
    }
}

/**
 * 应用时间戳颜色到 CSS 变量（兜底默认色；每个对象的具体颜色由 message.js 渲染时
 * 通过 getCurrentTimestampColor 内联设置，未设置的对象使用此默认）
 */
function applyTimestampColor(color) {
    if (color && !parseColorValue(color)) return;
    document.documentElement.style.setProperty('--timestamp-color', color || DEFAULT_TIMESTAMP_COLOR);
}

/**
 * 同步刷新聊天区域中已渲染消息的时间戳颜色。
 * message.js 渲染消息时会把颜色写进内联样式（优先级高于 CSS 变量），
 * 因此修改时间戳颜色后需要手动刷新这些内联样式才能立即生效。
 * @param {string|null} color 新颜色；传 null 表示移除内联样式、回退到 CSS 变量默认色
 */
function refreshRenderedTimestampColors(color) {
    document.querySelectorAll('.message-timestamp').forEach(function (el) {
        if (color) {
            el.style.color = color;
        } else {
            el.style.removeProperty('color');
        }
    });
}

/**
 * 应用多人聊天名称颜色到 CSS 变量（兜底默认色；每个聊天室的具体颜色由 message.js
 * 渲染时通过 getCurrentGroupNameColor 内联设置，未设置的聊天室使用此默认）
 */
function applyGroupNameColor(color) {
    if (color && !parseColorValue(color)) return;
    document.documentElement.style.setProperty('--group-name-color', color || DEFAULT_GROUP_NAME_COLOR);
}

/* 聊天时按对象取色（供 message.js 渲染调用，同步函数） */

/** 当前聊天对象的时间戳颜色（未设置返回 null，使用默认色） */
function getCurrentTimestampColor() {
    const obj = getCurrentChatObjectData();
    return obj && obj.timestampColor ? obj.timestampColor : null;
}

/** 当前聊天室的多人聊天名称颜色（未设置返回 null，使用默认色） */
function getCurrentGroupNameColor() {
    if (typeof isGroupChatMode !== 'function' || !isGroupChatMode()) return null;
    const obj = getCurrentChatObjectData();
    return obj && obj.groupNameColor ? obj.groupNameColor : null;
}

/** 按当前聊天对象应用背景图与颜色变量（切换联系人/群聊时调用） */
function applyCurrentChatBackground() {
    const isGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
    const tab = isGroup ? currentSettings.group : currentSettings.single;
    const id = getCurrentChatObjectId();
    const obj = (id !== null && id !== undefined && tab.objects[id]) ? tab.objects[id] : null;
    const bg = obj ? obj.backgroundImage : null;
    applyBackgroundImage(bg, tab.scope || 'chat');
    // 同步时间戳 / 多人聊天名称颜色 CSS 变量（未设置 → 默认色）
    applyTimestampColor(obj && obj.timestampColor ? obj.timestampColor : DEFAULT_TIMESTAMP_COLOR);
    if (isGroup) {
        applyGroupNameColor(obj && obj.groupNameColor ? obj.groupNameColor : DEFAULT_GROUP_NAME_COLOR);
    }
}

/** 渲染色块网格（内置色） */
function renderColorPicker() {
    if (!colorPickerGrid) return;

    colorPickerGrid.innerHTML = '';
    PRESET_COLORS.forEach(function (preset) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.dataset.color = preset.color;
        swatch.style.background = preset.color;
        swatch.title = preset.name;

        // 颜色名称（悬停时显示）
        const nameSpan = document.createElement('span');
        nameSpan.className = 'swatch-name';
        nameSpan.textContent = preset.name;
        swatch.appendChild(nameSpan);

        // 点击切换颜色
        swatch.addEventListener('click', function () {
            const color = this.dataset.color;
            applyThemeColor(color);
            saveDressUpSettings();
        });

        colorPickerGrid.appendChild(swatch);
    });

    // 更新选中状态
    updateColorPickerUI();
}

/** 渲染自选颜色（用户通过色盘选过的主题色） */
function renderCustomColors() {
    const grid = document.getElementById('customColorGrid');
    if (!grid) return;

    grid.innerHTML = '';
    const list = currentSettings.customThemeColors || [];
    if (list.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'custom-color-empty';
        hint.textContent = '还没有自选的颜色，点下面色盘选一个吧～';
        grid.appendChild(hint);
        return;
    }
    list.forEach(function (color) {
        const swatch = document.createElement('div');
        swatch.className = 'custom-color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = '自选 ' + color;
        swatch.addEventListener('click', function () {
            const c = this.dataset.color;
            applyThemeColor(c);
            saveDressUpSettings();
        });
        grid.appendChild(swatch);
    });
    updateColorPickerUI();
}

/** 记录一个自选颜色（去重、最新在前、最多 CUSTOM_COLORS_MAX 个） */
function addCustomThemeColor(color) {
    let list = currentSettings.customThemeColors || [];
    list = list.filter(function (c) { return c !== color; });
    list.unshift(color);
    currentSettings.customThemeColors = list.slice(0, CUSTOM_COLORS_MAX);
}

/** 更新色块选中状态（含自选色块与长方形色盘高亮） */
function updateColorPickerUI() {
    const swatches = colorPickerGrid?.querySelectorAll('.color-swatch') || [];
    let matched = false;
    swatches.forEach(function (swatch) {
        const isActive = swatch.dataset.color === currentSettings.themeColor;
        swatch.classList.toggle('active', isActive);
        if (isActive) matched = true;
    });
    // 自选色块选中态
    const customSwatches = document.querySelectorAll('#customColorGrid .custom-color-swatch');
    customSwatches.forEach(function (swatch) {
        swatch.classList.toggle('active', swatch.dataset.color === currentSettings.themeColor);
    });
    // 长方形色盘：预览当前主题色 + 非内置色时高亮
    const customPicker = document.getElementById('customThemeColorPicker');
    if (customPicker) {
        const preview = customPicker.querySelector('.custom-pad-preview');
        if (preview) preview.style.background = currentSettings.themeColor;
        customPicker.classList.toggle('active', !matched);
    }
}

/* 时间戳颜色（单人 + 群聊两套网格，各按自己的生效对象取色） */

/** 渲染一个时间戳颜色预设网格 */
function renderTimestampColorsInto(grid, onSelect) {
    if (!grid) return;
    grid.innerHTML = '';
    PRESET_COLORS.forEach(function (preset) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.dataset.color = preset.color;
        swatch.style.background = preset.color;
        swatch.title = preset.name;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'swatch-name';
        nameSpan.textContent = preset.name;
        swatch.appendChild(nameSpan);

        swatch.addEventListener('click', function () {
            onSelect(this.dataset.color);
        });

        grid.appendChild(swatch);
    });
}

/** 渲染一个自选时间戳颜色网格 */
function renderTimestampCustomColorsInto(grid, onSelect) {
    if (!grid) return;
    grid.innerHTML = '';
    const list = currentSettings.customTimestampColors || [];
    if (list.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'custom-color-empty';
        hint.textContent = '还没有自选的颜色，点下面色盘选一个吧～';
        grid.appendChild(hint);
        return;
    }
    list.forEach(function (color) {
        const swatch = document.createElement('div');
        swatch.className = 'custom-color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = '自选 ' + color;
        swatch.addEventListener('click', function () {
            onSelect(this.dataset.color);
        });
        grid.appendChild(swatch);
    });
}

/** 记录一个自选时间戳颜色（去重、最新在前、最多 CUSTOM_COLORS_MAX 个，全站共享一份） */
function addCustomTimestampColor(color) {
    let list = currentSettings.customTimestampColors || [];
    list = list.filter(function (c) { return c !== color; });
    list.unshift(color);
    currentSettings.customTimestampColors = list.slice(0, CUSTOM_COLORS_MAX);
}

/** 把某个时间戳颜色应用到当前 Tab 的生效对象 */
function applyTimestampColorToTarget(color) {
    if (!parseColorValue(color)) return;
    const tab = getTabSettings(currentDressTab);
    const key = getCurrentTargetKey();
    const obj = getTabObject(tab, key);
    obj.timestampColor = color;
    saveDressUpSettings();
    updateTimestampColorUI();
    // 若当前浏览的聊天与本次修改的 Tab 一致，立即生效
    const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
    if ((currentDressTab === 'single' && !inGroup) || (currentDressTab === 'group' && inGroup)) {
        applyTimestampColor(color);
        // 已渲染消息的时间戳是内联样式，需同步刷新才能立即变色
        refreshRenderedTimestampColors(color);
    }
}

/** 单人 Tab：渲染时间戳颜色网格 + 自选网格 */
function renderSingleTimestampColors() {
    renderTimestampColorsInto(document.getElementById('timestampColorGrid'), function (color) {
        applyTimestampColorToTarget(color);
    });
    renderTimestampCustomColorsInto(document.getElementById('timestampCustomColorGrid'), function (color) {
        applyTimestampColorToTarget(color);
    });
}

/** 群聊 Tab：渲染时间戳颜色网格 + 自选网格 */
function renderGroupTimestampColors() {
    renderTimestampColorsInto(document.getElementById('groupTimestampColorGrid'), function (color) {
        applyTimestampColorToTarget(color);
    });
    renderTimestampCustomColorsInto(document.getElementById('groupTimestampCustomColorGrid'), function (color) {
        applyTimestampColorToTarget(color);
    });
}

/** 取单人/群聊各自生效对象的当前时间戳颜色（未设置 → 默认色） */
function getTargetTimestampColor(tabSettings, key) {
    const obj = tabSettings.objects[key];
    return obj && obj.timestampColor ? obj.timestampColor : DEFAULT_TIMESTAMP_COLOR;
}

/** 更新时间戳色块选中状态（单人、群聊两套网格各自按生效对象高亮） */
function updateTimestampColorUI() {
    // 单人网格
    const singleColor = getTargetTimestampColor(currentSettings.single, singleTargetKey);
    const singleGrid = document.getElementById('timestampColorGrid');
    if (singleGrid) {
        let matched = false;
        singleGrid.querySelectorAll('.color-swatch').forEach(function (swatch) {
            const isActive = swatch.dataset.color === singleColor;
            swatch.classList.toggle('active', isActive);
            if (isActive) matched = true;
        });
        singleGrid.querySelectorAll('.custom-color-swatch').forEach(function (swatch) {
            swatch.classList.toggle('active', swatch.dataset.color === singleColor);
        });
        const singlePicker = document.getElementById('customTimestampColorPicker');
        if (singlePicker) {
            const preview = singlePicker.querySelector('.custom-pad-preview');
            if (preview) preview.style.background = singleColor;
            singlePicker.classList.toggle('active', !matched);
        }
    }
    // 群聊网格
    const groupColor = getTargetTimestampColor(currentSettings.group, groupTargetKey);
    const groupGrid = document.getElementById('groupTimestampColorGrid');
    if (groupGrid) {
        let matched = false;
        groupGrid.querySelectorAll('.color-swatch').forEach(function (swatch) {
            const isActive = swatch.dataset.color === groupColor;
            swatch.classList.toggle('active', isActive);
            if (isActive) matched = true;
        });
        groupGrid.querySelectorAll('.custom-color-swatch').forEach(function (swatch) {
            swatch.classList.toggle('active', swatch.dataset.color === groupColor);
        });
        const groupPicker = document.getElementById('customGroupTimestampColorPicker');
        if (groupPicker) {
            const preview = groupPicker.querySelector('.custom-pad-preview');
            if (preview) preview.style.background = groupColor;
            groupPicker.classList.toggle('active', !matched);
        }
    }
}

/* 多人聊天名称颜色（仅群聊 Tab，按聊天室对象独立存储） */

/** 渲染多人聊天名称颜色预设色块 */
function renderGroupNameColors() {
    const grid = document.getElementById('groupNameColorGrid');
    if (!grid) return;

    grid.innerHTML = '';
    PRESET_COLORS.forEach(function (preset) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.dataset.color = preset.color;
        swatch.style.background = preset.color;
        swatch.title = preset.name;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'swatch-name';
        nameSpan.textContent = preset.name;
        swatch.appendChild(nameSpan);

        swatch.addEventListener('click', function () {
            applyGroupNameColorToTarget(this.dataset.color);
        });

        grid.appendChild(swatch);
    });

    updateGroupNameColorUI();
}

/** 渲染自选多人聊天名称颜色（用户通过色盘选过的） */
function renderGroupNameCustomColors() {
    const grid = document.getElementById('groupNameCustomColorGrid');
    if (!grid) return;

    grid.innerHTML = '';
    const list = currentSettings.customGroupNameColors || [];
    if (list.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'custom-color-empty';
        hint.textContent = '还没有自选的颜色，点下面色盘选一个吧～';
        grid.appendChild(hint);
        return;
    }
    list.forEach(function (color) {
        const swatch = document.createElement('div');
        swatch.className = 'custom-color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = '自选 ' + color;
        swatch.addEventListener('click', function () {
            applyGroupNameColorToTarget(this.dataset.color);
        });
        grid.appendChild(swatch);
    });
    updateGroupNameColorUI();
}

/** 记录一个自选多人聊天名称颜色（去重、最新在前、最多 CUSTOM_COLORS_MAX 个，全站共享一份） */
function addCustomGroupNameColor(color) {
    let list = currentSettings.customGroupNameColors || [];
    list = list.filter(function (c) { return c !== color; });
    list.unshift(color);
    currentSettings.customGroupNameColors = list.slice(0, CUSTOM_COLORS_MAX);
}

/** 把某个多人聊天名称颜色应用到群聊 Tab 的生效对象 */
function applyGroupNameColorToTarget(color) {
    if (!parseColorValue(color)) return;
    const obj = getTabObject(currentSettings.group, groupTargetKey);
    obj.groupNameColor = color;
    saveDressUpSettings();
    updateGroupNameColorUI();
    applyGroupNameColor(color);
}

/** 更新多人聊天名称色块选中状态（按群聊生效对象高亮） */
function updateGroupNameColorUI() {
    const obj = currentSettings.group.objects[groupTargetKey];
    const color = obj && obj.groupNameColor ? obj.groupNameColor : DEFAULT_GROUP_NAME_COLOR;
    const grid = document.getElementById('groupNameColorGrid');
    if (!grid) return;
    let matched = false;
    grid.querySelectorAll('.color-swatch').forEach(function (swatch) {
        const isActive = swatch.dataset.color === color;
        swatch.classList.toggle('active', isActive);
        if (isActive) matched = true;
    });
    const customSwatches = document.querySelectorAll('#groupNameCustomColorGrid .custom-color-swatch');
    customSwatches.forEach(function (swatch) {
        swatch.classList.toggle('active', swatch.dataset.color === color);
    });
    const customPicker = document.getElementById('customGroupNameColorPicker');
    if (customPicker) {
        const preview = customPicker.querySelector('.custom-pad-preview');
        if (preview) preview.style.background = color;
        customPicker.classList.toggle('active', !matched);
    }
}

/* 自定义取色面板（色相条 + 饱和度/明度方块 + 透明度条） */

/** HSV 转 hex（h: 0-360, s/v: 0-1） */
function hsvToHex(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** hex 转 HSV */
function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        switch (max) {
            case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60; break;
            case gn: h = ((bn - rn) / d + 2) * 60; break;
            default: h = ((rn - gn) / d + 4) * 60; break;
        }
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** 组合当前 HSVA 为颜色字符串：透明度=100% 时输出 hex，否则输出 rgba() */
function hsvaToString(h, s, v, a) {
    const hex = hsvToHex(h, s, v);
    if (a >= 0.999) return hex;
    const { r, g, b } = hexToRgb(hex);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a.toFixed(2) + ')';
}

/** 绘制饱和度/明度方块（横向：白→纯色相；纵向：透明→黑） */
function drawSvBox() {
    if (!colorSvCtx) return;
    const ctx = colorSvCtx;
    const w = colorSvCanvas.width, h = colorSvCanvas.height;
    const g1 = ctx.createLinearGradient(0, 0, w, 0);
    g1.addColorStop(0, '#fff');
    g1.addColorStop(1, 'hsl(' + colorWheelH + ',100%,50%)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createLinearGradient(0, 0, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
}

/** 绘制色相条（彩虹渐变） */
function drawHueBar() {
    if (!colorHueCtx) return;
    const ctx = colorHueCtx;
    const w = colorHueCanvas.width, h = colorHueCanvas.height;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, 'hsl(' + (i * 60) + ',100%,50%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

/** 绘制透明度条（左端=全透明，右端=不透明，固定黑白不跟随色相） */
function drawAlphaBar() {
    if (!colorAlphaCtx) return;
    const ctx = colorAlphaCtx;
    const w = colorAlphaCanvas.width, h = colorAlphaCanvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

/** 从事件坐标计算比例（0-1） */
function ratioFromEvent(e, el, horizontal) {
    const rect = el.getBoundingClientRect();
    let ratio;
    if (horizontal) {
        ratio = (e.clientX - rect.left) / rect.width;
    } else {
        ratio = (e.clientY - rect.top) / rect.height;
    }
    return Math.max(0, Math.min(1, ratio));
}

/** 更新面板预览（色块 + HEX + HSLA） */
function updateColorWheelPreview() {
    if (!colorWheelCurrent || !colorWheelHex) return;
    colorWheelTempColor = hsvaToString(colorWheelH, colorWheelS, colorWheelV, colorWheelA);
    // 颜色写在伪元素层上，底层的浅色棋盘格保留，半透明时透出浅色棋盘（不会像透出深色面板那样变深）
    colorWheelCurrent.style.setProperty('--cw-fill', colorWheelTempColor);
    colorWheelHex.value = hsvToHex(colorWheelH, colorWheelS, colorWheelV).toUpperCase();
    if (colorWheelHsla) {
        colorWheelHsla.textContent = 'HSLA(' +
            Math.round(colorWheelH) + '°, ' +
            Math.round(colorWheelS * 100) + '%, ' +
            Math.round(colorWheelV * 100) + '%, ' +
            Math.round(colorWheelA * 100) + '%)';
    }
}

/** 更新指示器位置 */
function placeSvIndicator() {
    if (!colorSvIndicator) return;
    const wrap = colorSvIndicator.parentElement;
    colorSvIndicator.style.left = (colorWheelS * 100) + '%';
    colorSvIndicator.style.top = ((1 - colorWheelV) * 100) + '%';
}

/** 更新色相指示器位置 */
function placeHueIndicator() {
    if (!colorHueIndicator) return;
    colorHueIndicator.style.left = ((colorWheelH / 360) * 100) + '%';
}

/** 更新透明度指示器位置 */
function placeAlphaIndicator() {
    if (!colorAlphaIndicator) return;
    colorAlphaIndicator.style.left = (colorWheelA * 100) + '%';
}

/** 取当前 Tab 生效对象的时间戳/名称颜色起始值（供取色面板使用） */
function getColorWheelStart(target) {
    if (target === 'theme') return currentSettings.themeColor;
    if (target === 'timestamp') {
        return getTargetTimestampColor(getTabSettings(currentDressTab), getCurrentTargetKey());
    }
    // groupName
    const obj = currentSettings.group.objects[groupTargetKey];
    return obj && obj.groupNameColor ? obj.groupNameColor : DEFAULT_GROUP_NAME_COLOR;
}

/** 打开取色面板（target: 'theme' | 'timestamp' | 'groupName'），从起始色提取 HSVA */
function openColorWheel(target) {
    if (!colorWheelPanel) return;
    colorWheelTarget = target;
    colorWheelStartColor = getColorWheelStart(target);
    // 从起始色提取 HSVA（支持 hex / rgba）
    const parsed = parseColorValue(colorWheelStartColor);
    const hsv = parsed ? hexToHsv(parsed.hex) : { h: 210, s: 0.7, v: 0.9 };
    colorWheelH = hsv.h;
    colorWheelS = hsv.s;
    colorWheelV = hsv.v;
    colorWheelA = parsed ? parsed.a : 1;
    colorWheelTempColor = colorWheelStartColor;
    drawSvBox();
    drawHueBar();
    drawAlphaBar();
    placeSvIndicator();
    placeHueIndicator();
    placeAlphaIndicator();
    updateColorWheelPreview();
    colorWheelPanel.classList.remove('hidden');
}

/** 关闭取色面板 */
function closeColorWheel() {
    if (colorWheelPanel) colorWheelPanel.classList.add('hidden');
    colorWheelTarget = null;
}

/** 屏幕取色（EyeDropper API，Chrome/Edge 支持） */
async function pickScreenColor() {
    if (!window.EyeDropper) {
        if (typeof showToast === 'function') showToast('当前浏览器不支持屏幕取色，请使用 Chrome 或 Edge');
        return;
    }
    try {
        const result = await new EyeDropper().open();
        const hex = result.sRGBHex || '#ffffff';
        const hsv = hexToHsv(hex);
        colorWheelH = hsv.h;
        colorWheelS = hsv.s;
        colorWheelV = hsv.v;
        // 保留当前透明度，取色后可在透明度条继续微调
        drawSvBox();
        drawAlphaBar();
        placeSvIndicator();
        placeHueIndicator();
        placeAlphaIndicator();
        updateColorWheelPreview();
    } catch (e) {
        // 用户按 Esc 取消取色，不做处理
    }
}

/** 确定：应用所选颜色（加入自选列表并保存） */
function confirmColorWheel() {
    if (!colorWheelTarget) return;
    const color = hsvaToString(colorWheelH, colorWheelS, colorWheelV, colorWheelA);
    if (colorWheelTarget === 'theme') {
        applyThemeColor(color);
        addCustomThemeColor(color);
        renderCustomColors();
        updateColorPickerUI();
        saveDressUpSettings();
        showToast('✅ 主题色已更新');
    } else if (colorWheelTarget === 'timestamp') {
        applyTimestampColorToTarget(color);
        addCustomTimestampColor(color);
        updateSinglePanel();
        updateGroupPanel();
        saveDressUpSettings();
        showToast('✅ 时间戳颜色已更新');
    } else {
        applyGroupNameColorToTarget(color);
        addCustomGroupNameColor(color);
        renderGroupNameCustomColors();
        updateGroupNameColorUI();
        saveDressUpSettings();
        showToast('✅ 多人聊天名称颜色已更新');
    }
    closeColorWheel();
}

/** 取消：恢复起始颜色 */
function cancelColorWheel() {
    if (colorWheelTarget === 'theme') {
        applyThemeColor(colorWheelStartColor);
        updateColorPickerUI();
    } else if (colorWheelTarget === 'timestamp') {
        // 时间戳：直接恢复 CSS 变量显示（不改任何对象数据）
        const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        const color = getTargetTimestampColor(getTabSettings(currentDressTab), getCurrentTargetKey());
        if ((currentDressTab === 'single' && !inGroup) || (currentDressTab === 'group' && inGroup)) {
            applyTimestampColor(color);
            refreshRenderedTimestampColors(color);
        }
        updateTimestampColorUI();
    } else if (colorWheelTarget === 'groupName') {
        const color = getColorWheelStart('groupName');
        applyGroupNameColor(color);
        updateGroupNameColorUI();
    }
    closeColorWheel();
}

/** 初始化取色面板（缓存 DOM、绑定拖拽与输入事件） */
function initColorWheel() {
    colorWheelPanel = document.getElementById('colorWheelPanel');
    colorSvCanvas = document.getElementById('colorSvCanvas');
    if (!colorWheelPanel || !colorSvCanvas) return;
    colorSvCtx = colorSvCanvas.getContext('2d');
    colorHueCanvas = document.getElementById('colorHueCanvas');
    colorHueCtx = colorHueCanvas?.getContext('2d');
    colorAlphaCanvas = document.getElementById('colorAlphaCanvas');
    colorAlphaCtx = colorAlphaCanvas?.getContext('2d');
    colorWheelCurrent = document.getElementById('colorWheelCurrent');
    colorWheelHex = document.getElementById('colorWheelHex');
    colorWheelHsla = document.getElementById('colorWheelHsla');
    colorWheelConfirmBtn = document.getElementById('colorWheelConfirmBtn');
    colorWheelCancelBtn = document.getElementById('colorWheelCancelBtn');
    colorWheelEyeBtn = document.getElementById('colorWheelEyeBtn');
    const svWrap = document.getElementById('colorSvWrap');
    const hueWrap = document.getElementById('colorHueWrap');
    const alphaWrap = document.getElementById('colorAlphaWrap');
    colorSvIndicator = document.getElementById('colorSvIndicator');
    colorHueIndicator = document.getElementById('colorHueIndicator');
    colorAlphaIndicator = document.getElementById('colorAlphaIndicator');

    // 拖动通用绑定
    function bindDrag(el, handler) {
        let dragging = false;
        el.addEventListener('pointerdown', function (e) {
            dragging = true;
            try { this.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
            handler(e);
        });
        el.addEventListener('pointermove', function (e) {
            if (e.buttons & 1) handler(e);
        });
        el.addEventListener('pointerup', function () { dragging = false; });
        el.addEventListener('pointercancel', function () { dragging = false; });
    }

    // 饱和度/明度方块：横向=饱和度，纵向=明度（上亮下暗）
    bindDrag(svWrap, function (e) {
        colorWheelS = ratioFromEvent(e, svWrap, true);
        colorWheelV = 1 - ratioFromEvent(e, svWrap, false);
        placeSvIndicator();
        updateColorWheelPreview();
        drawAlphaBar(); // 透明度条跟随当前颜色变化
    });

    // 色相条
    bindDrag(hueWrap, function (e) {
        colorWheelH = ratioFromEvent(e, hueWrap, true) * 360;
        placeHueIndicator();
        updateColorWheelPreview();
        drawSvBox();       // 方块跟随色相变化
        drawAlphaBar();
    });

    // 透明度条
    bindDrag(alphaWrap, function (e) {
        colorWheelA = ratioFromEvent(e, alphaWrap, true);
        placeAlphaIndicator();
        updateColorWheelPreview();
    });

    // 十六进制输入框：支持 #rgb / #rrggbb / #rrggbbaa，回车或失焦生效
    colorWheelHex?.addEventListener('change', function () {
        const parsed = parseColorValue(colorWheelHex.value);
        if (!parsed) {
            // 输入非法：还原为当前颜色
            colorWheelHex.value = hsvToHex(colorWheelH, colorWheelS, colorWheelV).toUpperCase();
            return;
        }
        const hsv = hexToHsv(parsed.hex);
        colorWheelH = hsv.h;
        colorWheelS = hsv.s;
        colorWheelV = hsv.v;
        colorWheelA = parsed.a;
        drawSvBox();
        drawAlphaBar();
        placeSvIndicator();
        placeHueIndicator();
        placeAlphaIndicator();
        updateColorWheelPreview();
    });
    colorWheelHex?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') this.blur(); // 触发 change 事件
    });

    // 按钮
    colorWheelConfirmBtn?.addEventListener('click', confirmColorWheel);
    colorWheelCancelBtn?.addEventListener('click', cancelColorWheel);
    colorWheelEyeBtn?.addEventListener('click', pickScreenColor);

    // 点击遮罩关闭
    colorWheelPanel.addEventListener('click', function (e) {
        if (e.target === colorWheelPanel) cancelColorWheel();
    });

    // ESC 关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && colorWheelPanel && !colorWheelPanel.classList.contains('hidden')) {
            cancelColorWheel();
        }
    });
}

/* 最近上传背景（单人 / 群聊 各按生效对象独立 5 张） */

/** 取某个 Tab 生效对象的数据（单人或群聊） */
function getTabObjectData(tabName, key) {
    return getTabObject(getTabSettings(tabName), key);
}

/** 将背景图加入「当前 Tab 生效对象」的最近上传列表（最多 5 张，最新在前） */
function addRecentBackground(dataUrl) {
    const obj = getCurrentTabObject();
    let list = obj.recentBackgrounds || [];
    list = list.filter(function (item) { return item !== dataUrl; });
    list.unshift(dataUrl);
    if (list.length > 5) list = list.slice(0, 5);
    obj.recentBackgrounds = list;
    renderRecentBackgrounds();
}

/** 移除单个最近背景（从当前 Tab 生效对象的列表） */
function removeRecentBackground(dataUrl) {
    const obj = getCurrentTabObject();
    let list = obj.recentBackgrounds || [];
    list = list.filter(function (item) { return item !== dataUrl; });
    obj.recentBackgrounds = list;
    saveDressUpSettings();
    renderRecentBackgrounds();
    showToast('已移除该背景');
}

/** 渲染一个最近上传背景网格（按该 Tab 的生效对象） */
function renderRecentBackgroundsInto(row, grid, obj, onApply) {
    if (!row || !grid) return;
    const list = obj.recentBackgrounds || [];
    if (list.length === 0) {
        row.classList.add('hidden');
        return;
    }
    row.classList.remove('hidden');
    grid.innerHTML = '';
    list.forEach(function (dataUrl) {
        const item = document.createElement('div');
        item.className = 'recent-bg-item';
        if (dataUrl === obj.backgroundImage) item.classList.add('active');

        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = '最近背景';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'recent-bg-remove';
        removeBtn.textContent = '×';
        removeBtn.title = '移除';
        removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeRecentBackground(dataUrl);
        });

        item.appendChild(img);
        item.appendChild(removeBtn);
        item.addEventListener('click', function () {
            onApply(dataUrl);
        });

        grid.appendChild(item);
    });
}

/** 渲染单人 / 群聊两套最近上传列表（各按自己的生效对象） */
function renderRecentBackgrounds() {
    const singleObj = getTabObjectData('single', singleTargetKey);
    renderRecentBackgroundsInto(recentBgRow, recentBgGrid, singleObj, function (dataUrl) {
        applyBackgroundToTarget(dataUrl, true);
    });
    const groupObj = getTabObjectData('group', groupTargetKey);
    renderRecentBackgroundsInto(groupRecentBgRow, groupRecentBgGrid, groupObj, function (dataUrl) {
        applyBackgroundToTarget(dataUrl, true);
    });
}

/* 背景图 */

/** 应用背景图到聊天区域或全站（scope: 'chat' | 'full'），纯 DOM 操作 */
function applyBackgroundImage(dataUrl, scope) {
    const container = document.querySelector('.chat-container');
    const messageArea = document.getElementById('messageArea');

    if (!container || !messageArea) return;

    // 先移除所有背景图相关的类
    container.classList.remove('dressup-bg-chat', 'dressup-bg-full');
    document.body.classList.remove('dressup-bg-chat', 'dressup-bg-full');

    if (!dataUrl) {
        // 没有图片：清除所有背景
        container.style.backgroundImage = '';
        messageArea.style.backgroundImage = '';
        messageArea.style.background = '';
        return;
    }

    // 根据范围应用
    if (scope === 'chat') {
        container.classList.add('dressup-bg-chat');
        messageArea.style.backgroundImage = 'url(' + dataUrl + ')';
        messageArea.style.backgroundSize = 'cover';
        messageArea.style.backgroundPosition = 'center';
        messageArea.style.backgroundRepeat = 'no-repeat';
        messageArea.style.backgroundColor = 'transparent';
        container.style.backgroundImage = '';
    } else {
        // 全站：毛玻璃透出底图
        container.classList.add('dressup-bg-full');
        container.style.backgroundImage = 'url(' + dataUrl + ')';
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        container.style.backgroundRepeat = 'no-repeat';
        messageArea.style.backgroundImage = '';
        messageArea.style.background = 'transparent';
    }
}

/** 把背景图应用到当前 Tab 的生效对象并保存（通用 → 全部对象；指定对象 → 仅该对象） */
function applyBackgroundToTarget(dataUrl, showTip) {
    const tab = getTabSettings(currentDressTab);
    const key = getCurrentTargetKey();
    const scope = getSelectedScope(currentDressTab);
    tab.scope = scope;

    if (key === 'common') {
        // 通用：批量写入所有对象（此 Tab 维度下的所有联系人/聊天室）
        const allKeys = Object.keys(tab.objects);
        if (allKeys.length === 0) {
            // 还没有任何对象数据时，至少存到 common 上（后面新建对象时以 null 开始）
            const commonObj = getTabObject(tab, 'common');
            commonObj.backgroundImage = dataUrl;
        } else {
            allKeys.forEach(function (k) {
                getTabObject(tab, k).backgroundImage = dataUrl;
            });
        }
    } else {
        getTabObject(tab, key).backgroundImage = dataUrl;
    }

    saveDressUpSettings();
    renderRecentBackgrounds();

    // 当前浏览的聊天与本 Tab 一致时立即生效
    const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
    if ((currentDressTab === 'single' && !inGroup) || (currentDressTab === 'group' && inGroup)) {
        applyCurrentChatBackground();
    }
    if (showTip) showToast('✅ 聊天背景已更新');
}

/** 更新单人 / 群聊两套生效范围单选按钮 */
function updateScopeRadiosUI() {
    bgScopeRadios.forEach(function (radio) {
        radio.checked = radio.value === currentSettings.single.scope;
    });
    groupBgScopeRadios.forEach(function (radio) {
        radio.checked = radio.value === currentSettings.group.scope;
    });
}

/** 处理背景图上传（压缩到 1200px 内并应用；isGroup 决定保存到单人还是群聊） */
function handleBgUpload(file, isGroup) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            // 压缩
            const maxWidth = 1200;
            const maxHeight = 1200;
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

            // 写入该 Tab 生效对象（通用 → 全部；指定对象 → 仅该对象）
            const tab = getTabSettings(isGroup ? 'group' : 'single');
            const key = isGroup ? groupTargetKey : singleTargetKey;
            const scope = isGroup ? getSelectedScope('group') : getSelectedScope('single');
            tab.scope = scope;
            if (key === 'common') {
                const allKeys = Object.keys(tab.objects);
                if (allKeys.length === 0) {
                    getTabObject(tab, 'common').backgroundImage = dataUrl;
                } else {
                    allKeys.forEach(function (k) {
                        getTabObject(tab, k).backgroundImage = dataUrl;
                    });
                }
            } else {
                getTabObject(tab, key).backgroundImage = dataUrl;
            }
            const obj = getTabObject(tab, key);
            let list = obj.recentBackgrounds || [];
            list = list.filter(function (item) { return item !== dataUrl; });
            list.unshift(dataUrl);
            if (list.length > 5) list = list.slice(0, 5);
            obj.recentBackgrounds = list;

            saveDressUpSettings();
            renderRecentBackgrounds();
            const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
            if ((!isGroup && !inGroup) || (isGroup && inGroup)) {
                applyCurrentChatBackground();
            }
            showToast('✅ 聊天背景已更新');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/** 获取某个 Tab 当前选中的生效范围 */
function getSelectedScope(tabName) {
    const radios = tabName === 'group' ? groupBgScopeRadios : bgScopeRadios;
    let scope = 'chat';
    radios.forEach(function (radio) {
        if (radio.checked) scope = radio.value;
    });
    return scope;
}

/* 玻璃调节 */

/**
 * 根据标题栏透明度计算名字/标题文字颜色，写入 CSS 变量：
 * 透明度 ≥ 40%：保持正常深色（var(--text-main) 兜底）
 * 透明度 < 40%：颜色渐变到白色，并叠加柔和投影，保证深色背景图上可读
 * 曲线 t = ratio^0.15：35% 时 ≈0.73（够亮但非纯白），透明度越低越白，
 *                     0% 时纯白，35%~0% 全程平滑渐变「越来越白」
 */
function applyHeaderNameAdaptiveColor(opacity) {
    // --text-main 是 applyThemeColor 写入的 hex，直接解析；解析失败时用灰色兜底
    const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim();
    const base = parseColorValue(textMain) || { r: 90, g: 90, b: 90 };
    // 插值系数 t：opacity=0.4 → 0（正常深色）；opacity=0 → 1（纯白）
    const ratio = Math.min(1, Math.max(0, (0.4 - opacity) / 0.4));
    // 幂曲线（指数 0.15）：35% → t≈0.73 足够亮，之后随透明度降低平滑逼近纯白
    const t = Math.pow(ratio, 0.15);
    if (t <= 0) {
        // 透明度正常：移除变量，回退到 CSS 默认色
        document.documentElement.style.removeProperty('--header-name-color');
        document.documentElement.style.removeProperty('--header-name-shadow');
        return;
    }
    const r = Math.round(base.r + (255 - base.r) * t);
    const g = Math.round(base.g + (255 - base.g) * t);
    const b = Math.round(base.b + (255 - base.b) * t);
    document.documentElement.style.setProperty('--header-name-color', 'rgb(' + r + ', ' + g + ', ' + b + ')');
    // 柔和投影（随透明度渐强），低透明度时文字从深色背景中浮出来
    document.documentElement.style.setProperty(
        '--header-name-shadow',
        '0 1px 2px rgba(0, 0, 0, ' + (t * 0.45).toFixed(2) + '), 0 1px 8px rgba(0, 0, 0, ' + (t * 0.3).toFixed(2) + ')'
    );
}

/**
 * 应用玻璃设置到三个区域
 */
function applyGlassSettings(glass) {
  if (!glass) return;

  var header = glass.header || { opacity: 0.25, blur: 10 };
  var message = glass.message || { opacity: 0, blur: 0 };
  var bottom = glass.bottom || { opacity: 0.6, blur: 10 };

  // 标题栏
  var headerEl = document.querySelector('.chat-header');
  if (headerEl) {
    headerEl.style.background = 'rgba(255, 255, 255, ' + header.opacity + ')';
    headerEl.style.backdropFilter = 'blur(' + header.blur + 'px)';
    headerEl.style.webkitBackdropFilter = 'blur(' + header.blur + 'px)';
  }

  // 标题栏名字颜色：透明度越低颜色越浅，保证可读性
  applyHeaderNameAdaptiveColor(header.opacity);

  // 聊天消息区域（只改背景，不改毛玻璃，避免子弹窗被遮挡）
  var chatBody = document.querySelector('.chat-body');
  if (chatBody) {
    chatBody.style.background = 'rgba(255, 255, 255, ' + message.opacity + ')';
    chatBody.style.backdropFilter = 'none';
    chatBody.style.webkitBackdropFilter = 'none';
  }

  var messageArea = document.getElementById('messageArea');
  if (messageArea) {
    messageArea.style.background = 'rgba(255, 255, 255, ' + message.opacity + ')';
    messageArea.style.backdropFilter = 'none';
    messageArea.style.webkitBackdropFilter = 'none';
  }

  // 底部输入框区域
  var bottomEl = document.querySelector('.bottom-wrapper');
  if (bottomEl) {
    bottomEl.style.background = 'rgba(255, 255, 255, ' + bottom.opacity + ')';
    bottomEl.style.backdropFilter = 'blur(' + bottom.blur + 'px)';
    bottomEl.style.webkitBackdropFilter = 'blur(' + bottom.blur + 'px)';
  }

  // 更新内存中的值
  currentSettings.glass = glass;
}

/** 更新 UI 滑块的值与右侧数值显示 */
function updateGlassUI(glass) {
    if (!glass) return;

    if (glassHeaderOpacity) glassHeaderOpacity.value = Math.round(glass.header.opacity * 100);
    if (glassHeaderBlur) glassHeaderBlur.value = glass.header.blur;
    if (glassMessageOpacity) glassMessageOpacity.value = Math.round(glass.message.opacity * 100);
    if (glassMessageBlur) glassMessageBlur.value = glass.message.blur;
    if (glassBottomOpacity) glassBottomOpacity.value = Math.round(glass.bottom.opacity * 100);
    if (glassBottomBlur) glassBottomBlur.value = glass.bottom.blur;

    // 更新显示值
    document.getElementById('glassHeaderOpacityValue').textContent = Math.round(glass.header.opacity * 100) + '%';
    document.getElementById('glassHeaderBlurValue').textContent = glass.header.blur + 'px';
    document.getElementById('glassMessageOpacityValue').textContent = Math.round(glass.message.opacity * 100) + '%';
    document.getElementById('glassMessageBlurValue').textContent = glass.message.blur + 'px';
    document.getElementById('glassBottomOpacityValue').textContent = Math.round(glass.bottom.opacity * 100) + '%';
    document.getElementById('glassBottomBlurValue').textContent = glass.bottom.blur + 'px';
}

/** 从滑块读取值并应用（同时更新数值显示与保存） */
function applyGlassFromSliders() {
    const glass = {
        header: {
            opacity: parseFloat(glassHeaderOpacity ? glassHeaderOpacity.value / 100 : 0.25),
            blur: parseFloat(glassHeaderBlur ? glassHeaderBlur.value : 10)
        },
        message: {
            opacity: parseFloat(glassMessageOpacity ? glassMessageOpacity.value / 100 : 0),
            blur: parseFloat(glassMessageBlur ? glassMessageBlur.value : 0)
        },
        bottom: {
            opacity: parseFloat(glassBottomOpacity ? glassBottomOpacity.value / 100 : 0.6),
            blur: parseFloat(glassBottomBlur ? glassBottomBlur.value : 10)
        }
    };
    applyGlassSettings(glass);
    updateGlassUI(glass);  // 同步右侧数值显示
    saveDressUpSettings();
}

/** 重置玻璃设置为默认值 */
function resetGlassDefault() {
    const defaultGlass = {
        header: { opacity: 0.25, blur: 10 },
        message: { opacity: 0, blur: 0 },
        bottom: { opacity: 0.6, blur: 10 }
    };
    applyGlassSettings(defaultGlass);
    updateGlassUI(defaultGlass);
    saveDressUpSettings();
    showToast('✅ 高级调节已恢复默认');
}

/* 恢复默认 */

/** 恢复所有装扮设置到默认值（包括所有联系人/聊天室的单独设置） */
function restoreDefault() {
    // 恢复主题色到默认天蓝
    const defaultColor = DEFAULT_THEME_COLOR;
    applyThemeColor(defaultColor);

    // 恢复兜底 CSS 变量
    applyTimestampColor(DEFAULT_TIMESTAMP_COLOR);
    applyGroupNameColor(DEFAULT_GROUP_NAME_COLOR);

    // 清空所有对象数据（单人 + 群聊）
    currentSettings.single = { scope: 'chat', objects: {} };
    currentSettings.group = { scope: 'chat', objects: {} };

    // 清除当前聊天背景
    applyCurrentChatBackground();

    // 同步刷新已渲染消息的时间戳颜色（恢复为默认色，移除内联样式回退 CSS 变量）
    refreshRenderedTimestampColors(null);

    // 清空自选颜色
    currentSettings.customThemeColors = [];
    renderCustomColors();
    currentSettings.customTimestampColors = [];
    currentSettings.customGroupNameColors = [];
    renderSingleTimestampColors();
    renderGroupTimestampColors();
    renderGroupNameCustomColors();

    // 重置玻璃设置为默认
    const defaultGlass = {
        header: { opacity: 0.25, blur: 10 },
        message: { opacity: 0, blur: 0 },
        bottom: { opacity: 0.6, blur: 10 }
    };
    applyGlassSettings(defaultGlass);
    updateGlassUI(defaultGlass);

    // 更新 UI
    updateColorPickerUI();
    updateSinglePanel();
    updateGroupPanel();
    saveDressUpSettings();

    showToast('✅ 已恢复默认装扮');
}

/* 弹窗控制 */

/** 切换装扮弹窗 Tab（'global' | 'single' | 'group'） */
function switchDressUpTab(tabName) {
    if (!dressUpTabs.length || !dressUpPanels[tabName]) return;
    dressUpTabs.forEach(function (tab) {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    Object.keys(dressUpPanels).forEach(function (key) {
        dressUpPanels[key].classList.toggle('active', key === tabName);
    });
    currentDressTab = tabName;

    // 同步警告显隐：切到单人/群聊 Tab 时，若生效对象为「通用」则显示警告
    // （打开弹窗时可能只 selectTarget 了当前聊天对象对应的 kind，另一 kind 的
    //   警告保持 HTML 初始的 hidden 状态，导致默认选通用也不显示警告）
    if (tabName === 'single') {
        singleTargetWarn?.classList.toggle('hidden', singleTargetKey !== 'common');
    } else if (tabName === 'group') {
        groupTargetWarn?.classList.toggle('hidden', groupTargetKey !== 'common');
    }
}

/* 生效对象下拉框（单人 / 群聊） */

// 群聊列表同步缓存（getGroupChats 是异步的，下拉框需要同步名称）
let groupChatsCache = [];

/** 渲染生效对象下拉框列表项（通用 + 全部联系人/聊天室；群聊为异步加载） */
function renderTargetDropdown(kind) {
    const isGroup = kind === 'group';
    const listEl = isGroup ? groupTargetList : singleTargetList;
    if (!listEl) return;

    listEl.innerHTML = '';

    // 通用选项
    const commonItem = document.createElement('div');
    commonItem.className = 'dress-target-item' + ((isGroup ? groupTargetKey : singleTargetKey) === 'common' ? ' active' : '');
    const commonName = document.createElement('span');
    commonName.className = 'dress-target-item-name';
    commonName.textContent = '通用';
    commonItem.appendChild(commonName);
    commonItem.addEventListener('click', function () {
        selectTarget(kind, 'common');
    });
    listEl.appendChild(commonItem);

    if (isGroup) {
        // 群聊：异步读取（返回 promise，供调用方 await 后再设置默认选中）
        return getGroupChats().then(function (groups) {
            groupChatsCache = groups || [];
            buildTargetItems(listEl, groups || [], function (g) { return getGroupName(g); }, kind);
        });
    } else {
        buildTargetItems(listEl, getAllContacts(), function (c) { return c.name; }, kind);
    }
}

/** 构建对象列表项 */
function buildTargetItems(listEl, items, nameOf, kind) {
    const isGroup = kind === 'group';
    items.forEach(function (item) {
        const key = String(item.id);
        const row = document.createElement('div');
        row.className = 'dress-target-item' + ((isGroup ? groupTargetKey : singleTargetKey) === key ? ' active' : '');
        const name = document.createElement('span');
        name.className = 'dress-target-item-name';
        name.textContent = nameOf(item);
        row.appendChild(name);
        row.addEventListener('click', function () {
            selectTarget(kind, key);
        });
        listEl.appendChild(row);
    });
}

/** 切换生效对象（kind: 'single' | 'group'；key: 'common' 或 String(id)） */
function selectTarget(kind, key) {
    if (kind === 'group') {
        groupTargetKey = key;
        if (groupTargetName) groupTargetName.textContent = key === 'common' ? '通用' : getGroupNameByIdSync(key);
        groupTargetWarn?.classList.toggle('hidden', key !== 'common');
    } else {
        singleTargetKey = key;
        if (singleTargetName) singleTargetName.textContent = key === 'common' ? '通用' : getContactNameByIdSync(key);
        singleTargetWarn?.classList.toggle('hidden', key !== 'common');
    }
    closeTargetDropdown(kind);
    updateSinglePanel();
    updateGroupPanel();
    // 切换生效对象后立即应用该对象的时间戳/名称颜色预览
    if (kind === 'group') {
        applyTimestampColor(getTargetTimestampColor(currentSettings.group, groupTargetKey));
        applyGroupNameColor(getGroupNameColorForTarget(groupTargetKey));
    } else {
        applyTimestampColor(getTargetTimestampColor(currentSettings.single, singleTargetKey));
    }
}

/** 群聊生效对象的名称颜色（未设置用默认） */
function getGroupNameColorForTarget(key) {
    const obj = currentSettings.group.objects[key];
    return obj && obj.groupNameColor ? obj.groupNameColor : DEFAULT_GROUP_NAME_COLOR;
}

/** 按 id 同步取联系人名称 */
function getContactNameByIdSync(id) {
    if (typeof getAllContacts === 'function') {
        const c = getAllContacts().find(function (c) { return String(c.id) === String(id); });
        if (c) return c.name;
    }
    return id;
}

/** 按 id 同步取聊天室名称 */
function getGroupNameByIdSync(id) {
    const g = groupChatsCache.find(function (g) { return String(g.id) === String(id); });
    return g ? getGroupName(g) : id;
}

/** 打开/关闭生效对象下拉框 */
function toggleTargetDropdown(kind) {
    const dropdown = kind === 'group' ? groupTargetDropdown : singleTargetDropdown;
    if (!dropdown) return;
    if (dropdown.classList.contains('hidden')) {
        renderTargetDropdown(kind);
        dropdown.classList.remove('hidden');
    } else {
        dropdown.classList.add('hidden');
    }
}

function closeTargetDropdown(kind) {
    const dropdown = kind === 'group' ? groupTargetDropdown : singleTargetDropdown;
    if (dropdown) dropdown.classList.add('hidden');
}

/** 更新单人 Tab 全部 UI（时间戳网格 + 最近上传 + 生效范围） */
function updateSinglePanel() {
    renderSingleTimestampColors();
    renderRecentBackgrounds();
}

/** 更新群聊 Tab 全部 UI（时间戳网格 + 名称颜色 + 最近上传 + 生效范围） */
function updateGroupPanel() {
    renderGroupTimestampColors();
    renderGroupNameColors();
    renderGroupNameCustomColors();
    renderRecentBackgrounds();
}

// 打开装扮弹窗：切换 Tab、渲染各区域并加载设置
// 改前：直接移除 hidden 类打开弹窗
// 改后：如果弹窗已经打开，则关闭它（实现点击图标切换开关）
async function openDressUpModal() {
    if (!dressUpModal) return;

    // 如果弹窗当前是显示状态，关闭它并返回
    if (!dressUpModal.classList.contains('hidden')) {
        closeDressUpModal();
        return;
    }

    // 默认进入【全局】Tab
    switchDressUpTab('global');

    // 渲染生效对象下拉框（默认选中当前联系人/聊天室，没有则通用）
    renderTargetDropdown('single');
    await renderTargetDropdown('group'); // 群聊异步加载，等它完成再设默认选中
    const currentId = getCurrentChatObjectId();
    if (currentId !== null && currentId !== undefined) {
        const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        selectTarget(inGroup ? 'group' : 'single', String(currentId));
    } else {
        selectTarget('single', 'common');
        selectTarget('group', 'common');
    }
    renderTargetDropdown('single');
    renderTargetDropdown('group');

    // 渲染各区域
    renderColorPicker();
    renderCustomColors();
    renderRecentBackgrounds();
    updateSinglePanel();
    updateGroupPanel();
    updateScopeRadiosUI();
    loadDressUpSettings();
    dressUpModal.classList.remove('hidden');
}

/** 关闭装扮弹窗 */
function closeDressUpModal() {
    if (dressUpModal) dressUpModal.classList.add('hidden');
    closeTargetDropdown('single');
    closeTargetDropdown('group');
}

/* 手风琴状态记忆（localStorage） */

const ACCORDION_STATE_KEY = 'dressupAccordionState';

/** 保存所有手风琴模块的展开/收起状态 */
function saveAccordionState() {
    const state = {};
    document.querySelectorAll('.dressup-accordion').forEach(function (mod) {
        const key = mod.dataset.acc;
        if (key) state[key] = mod.classList.contains('open');
    });
    try { localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略存储异常 */ }
}

/** 恢复用户上次的展开/收起选择；无记录时保持默认（全部收起） */
function restoreAccordionState() {
    let state = {};
    try { state = JSON.parse(localStorage.getItem(ACCORDION_STATE_KEY)) || {}; } catch (e) { state = {}; }
    document.querySelectorAll('.dressup-accordion').forEach(function (mod) {
        const key = mod.dataset.acc;
        if (!key) return;
        const isOpen = state[key] === true;
        mod.classList.toggle('open', isOpen);
        mod.classList.toggle('closed', !isOpen);
    });
}

/* 事件绑定 */

/** 绑定装扮弹窗的所有事件（关闭、恢复默认、Tab、生效对象、上传背景、滑块、取色面板） */
function bindDressUpEvents() {
    // 关闭按钮
    closeBtn?.addEventListener('click', closeDressUpModal);

    // 确认/关闭按钮
    confirmBtn?.addEventListener('click', closeDressUpModal);

    // 恢复默认
    resetBtn?.addEventListener('click', function () {
        restoreDefault();
    });

    // 手风琴折叠：点击模块标题展开/收起（方案C），并记住用户的打开选择
    dressUpModal?.addEventListener('click', function (e) {
        const head = e.target.closest('.accordion-head');
        if (!head) return;
        const mod = head.parentElement;
        if (!mod || !mod.classList.contains('dressup-accordion')) return;
        mod.classList.toggle('open');
        mod.classList.toggle('closed');
        saveAccordionState();
    });

    // 恢复用户上次的展开/收起选择（无记录时全部默认收起）
    restoreAccordionState();

    // ESC 键关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && dressUpModal && !dressUpModal.classList.contains('hidden')) {
            closeDressUpModal();
        }
    });

    // Tab 切换
    dressUpTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchDressUpTab(this.dataset.tab);
        });
    });

    // 生效对象下拉框开关
    singleTargetBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTargetDropdown('single');
    });
    groupTargetBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTargetDropdown('group');
    });

    // 点击下拉框外部关闭
    document.addEventListener('click', function (e) {
        if (singleTargetDropdown && !singleTargetDropdown.classList.contains('hidden') &&
            !singleTargetDropdown.contains(e.target) && e.target !== singleTargetBtn) {
            singleTargetDropdown.classList.add('hidden');
        }
        if (groupTargetDropdown && !groupTargetDropdown.classList.contains('hidden') &&
            !groupTargetDropdown.contains(e.target) && e.target !== groupTargetBtn) {
            groupTargetDropdown.classList.add('hidden');
        }
    });

    // 单人：背景图上传
    bgUploadBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        bgFileInput?.click();
    });

    bgFileInput?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            handleBgUpload(file, false);
        }
        this.value = '';
    });

    // 群聊：背景图上传
    groupBgUploadBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        groupBgFileInput?.click();
    });

    groupBgFileInput?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            handleBgUpload(file, true);
        }
        this.value = '';
    });

    /** 移除当前 Tab 生效对象的背景图（通用 → 所有对象无背景；指定对象 → 仅该对象无背景） */
    function removeTargetBackground(isGroup) {
        const tab = getTabSettings(isGroup ? 'group' : 'single');
        const key = isGroup ? groupTargetKey : singleTargetKey;
        const obj = tab.objects[key];
        if (key === 'common') {
            const allKeys = Object.keys(tab.objects);
            if (allKeys.length === 0) {
                showToast('当前没有背景图');
                return;
            }
            allKeys.forEach(function (k) {
                tab.objects[k].backgroundImage = null;
            });
        } else {
            if (!obj || !obj.backgroundImage) {
                showToast('当前没有背景图');
                return;
            }
            obj.backgroundImage = null;
        }
        saveDressUpSettings();
        renderRecentBackgrounds();
        const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
        if ((!isGroup && !inGroup) || (isGroup && inGroup)) {
            applyCurrentChatBackground();
        }
        showToast('已移除聊天背景');
    }

    // 单人：移除背景图
    bgRemoveBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        removeTargetBackground(false);
    });

    // 群聊：移除背景图
    groupBgRemoveBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        removeTargetBackground(true);
    });

    // 生效范围切换（单人）
    bgScopeRadios.forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (!this.checked) return;
            currentSettings.single.scope = this.value;
            const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
            if (!inGroup) applyCurrentChatBackground();
            saveDressUpSettings();
        });
    });

    // 生效范围切换（群聊）
    groupBgScopeRadios.forEach(function (radio) {
        radio.addEventListener('change', function () {
            if (!this.checked) return;
            currentSettings.group.scope = this.value;
            const inGroup = typeof isGroupChatMode === 'function' && isGroupChatMode();
            if (inGroup) applyCurrentChatBackground();
            saveDressUpSettings();
        });
    });

    // 高级调节 - 滑块事件
    const glassSliders = [
        glassHeaderOpacity, glassHeaderBlur,
        glassMessageOpacity, glassMessageBlur,
        glassBottomOpacity, glassBottomBlur
    ];
    glassSliders.forEach(function (slider) {
        if (slider) {
            slider.addEventListener('input', function () {
                applyGlassFromSliders();
            });
        }
    });

    // 高级调节 - 重置按钮
    glassResetBtn?.addEventListener('click', function (e) {
        e.stopPropagation();
        resetGlassDefault();
    });

    // 自定义主题色色盘（点击打开圆形取色面板）
    const customThemePicker = document.getElementById('customThemeColorPicker');
    customThemePicker?.addEventListener('click', function () {
        openColorWheel('theme');
    });

    // 单人：自定义时间戳颜色色盘
    const customTimestampPicker = document.getElementById('customTimestampColorPicker');
    customTimestampPicker?.addEventListener('click', function () {
        currentDressTab = 'single';
        openColorWheel('timestamp');
    });

    // 群聊：自定义时间戳颜色色盘
    const customGroupTimestampPicker = document.getElementById('customGroupTimestampColorPicker');
    customGroupTimestampPicker?.addEventListener('click', function () {
        currentDressTab = 'group';
        openColorWheel('timestamp');
    });

    // 自定义多人聊天名称颜色色盘（点击打开圆形取色面板）
    const customGroupNamePicker = document.getElementById('customGroupNameColorPicker');
    customGroupNamePicker?.addEventListener('click', function () {
        currentDressTab = 'group';
        openColorWheel('groupName');
    });
}

/* 暴露函数 */

window.initDressUp = initDressUp;
window.openDressUpModal = openDressUpModal;
window.closeDressUpModal = closeDressUpModal;
window.applyCurrentChatBackground = applyCurrentChatBackground;
window.getCurrentTimestampColor = getCurrentTimestampColor;
window.getCurrentGroupNameColor = getCurrentGroupNameColor;
