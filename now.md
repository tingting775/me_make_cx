梦角字卡传讯网站 — 交接文档
最后更新：2026-08-15
用途：给全新的 AI 会话阅读，快速接手上一个会话的完整上下文


一、项目简介

本项目是一个模拟聊天工具，核心玩法是用户创建「联系人」（模拟聊天对象），在「字卡库」中维护文字字卡、表情包和 Emoji，聊天时对方会从字卡库中随机抽取内容回复。

项目是纯前端应用，所有数据存储在浏览器的 IndexedDB 中，无需后端服务器。打开 index.html 即可运行。

本项目已完成从 localStorage 到 IndexedDB 的存储迁移，支持大容量图片和长聊天记录存储。


二、已完成的功能（全部完成并可正常使用）

（一）联系人管理

1、新增联系人（通过联系人管理弹窗）
2、修改联系人昵称（点击名字，行内编辑）
3、更换联系人头像（点击头像，裁剪圆形）
4、删除联系人（二次确认，同步删除字卡库和聊天记录）
5、拖拽排序（鼠标 / 触屏）
6、顶部下拉列表快速切换联系人
7、刷新页面后自动恢复上次正在聊天的联系人

（二）字卡库（通用库 + 单人库双轨制）

1、三种 Tab：文字字卡 / 表情包 / Emoji
2、通用字卡库：所有联系人共享的字卡池
3、单人字卡库：每个联系人的专属字卡
4、库切换：字卡库弹窗标题栏下拉切换，可在「通用」和各个联系人之间切换
5、记住选择：关闭弹窗后再次打开，默认回到上次选择的库
6、文字字卡：分组管理（新增、改名、删除、拖拽排序）、字卡增删改查、屏蔽、搜索
7、表情包：批量上传（多选图片）、网格展示、单个删除（悬停显示 ×）
8、Emoji：连续输入自动识别（忽略普通文字）、网格展示、单个删除（悬停显示 ×）
9、批量删除：表情包和 Emoji 支持管理模式（点击「管理」进入多选模式，批量删除）
10、分组屏蔽：屏蔽整个分组后，该分组所有字卡不参与回复（可取消屏蔽）
11、管理分组弹窗：显示所有分组（不含「未分组」），支持拖拽排序、改名、屏蔽切换、删除、清空字卡
12、单人库添加去重检测：在单人库中添加文字字卡时，自动检测是否已存在于通用库，重复则禁止添加并弹出轻提示

（三）聊天消息系统

1、发送文字消息
2、消息持久化（按联系人隔离存储到 IndexedDB）
3、消息引用（点击「引用」按钮，输入框上方显示引用条，发送后引用内容出现在消息气泡下方）
4、点击引用窗格可跳转至原消息位置（箭头指示，0.5秒后自动消失）
5、消息删除（悬停 / 长按显示「引用」「删除」按钮）
6、时间戳显示（早上/中午/下午/晚上/凌晨 + 小时:分钟，可通过设置开关控制）
7、发送消息后自动滚动到底部
8、支持发送表情包图片和 Emoji
9、分页加载（每次 20 条最新消息，滚动到顶部自动加载更早消息）
10、日期分隔线（今天/昨天/星期X/月日/年月日），采用左右横线 + 居中文字布局
11、滚动到最早消息后显示「已无更多历史记录」提示
12、回到底部按钮（浮动在输入框上方，向上滚动时出现，点击平滑滚动到底部）

（四）头像上传

1、圆形裁剪（支持拖拽移动图片、滚轮缩放、双指缩放）
2、联系人头像独立存储（每个联系人独立）
3、用户本人头像独立存储（与联系人头像分离）
4、全量备份时头像以独立文件存入 ZIP，恢复时自动还原

（五）回复引擎

1、回复速度：按设置的最短/最长等待时间随机延迟
2、回复条数：按设置的最少/最多条数生成多条回复，逐条发送
3、拼字卡：多条字卡用中文逗号拼接成一条消息
4、Emoji 混入：20% 概率在文字中插入 Emoji
5、表情包混入：20% 概率在文字后面补发一张表情包图片
6、引用回复：按概率触发，引用用户最近 10 条消息之一
7、已读不回：按概率触发，用户发消息后联系人不回复
8、主动发送：按间隔时间定时器，联系人主动发消息
9、多消息队列：连续发送多条消息时排队处理，防止冲突
10、正在输入状态：从初始延迟到所有消息发送完毕，持续显示
11、字卡池合并：回复时自动合并「通用字卡库 + 当前联系人单人字卡库」，屏蔽逻辑统一处理

（六）聊天设置弹窗

1、功能选项卡：回复速度、回复条数、拼字卡、表情包混入、Emoji 混入、引用回复、已读不回、主动发送、显示时间戳
2、音效选项卡：音效总开关、音量控制、发送音效选择（清脆/温暖/可爱/轻柔/飘渺）、接收音效选择
3、音效试听：点击「试听」按钮播放对应音效
4、音效实际播放：发送消息时播放「发送音效」，收到回复时播放「接收音效」
5、滑块值实时显示：滑动时右侧数值同步更新
6、开关联动：拼字卡开启时显示拼接条数设置，引用回复开启时显示触发概率，主动发送开启时显示间隔时间，音效总开关关闭时隐藏所有音效子选项

（七）数据管理弹窗

1、存储空间统计：显示已用空间 / 总配额，进度条 + 百分比，按联系人/字卡库/聊天记录/全局设置分类（聊天记录含群聊消息，备份清单含群聊数量）
2、全量备份：导出为 ZIP（v1.1，含联系人、群聊、字卡库、消息、设置、所有头像）
3、全量恢复：支持 ZIP 导入（兼容 v1.0 旧备份），冲突时选择「覆盖」或「合并」，群聊成员 ID 自动映射，头像自动还原
4、联系人/聊天室备份：导出单个联系人（含联系人信息、字卡库、聊天记录）或聊天室（含聊天室信息、聊天记录）的 JSON，支持导入（新增/覆盖模式，聊天室重名自动重命名）
5、删除聊天记录：按联系人 / 聊天室删除（下拉 optgroup 分组）
6、重置数据：清空所有数据（含群聊数据，二次确认）。2026-08-16 补齐遗漏：①删除 appState.dressUp 装扮设置（主题色/背景/玻璃/自选颜色，此前不重置）；②重置当前字卡库选择回通用库 saveCurrentCardLib('global')；③清理 localStorage 界面记忆（modalWindowState 弹窗拖拽位置、dressupAccordionState 手风琴状态、lastStorageWarningTime 存储警告时间）；④确认弹窗与卡片文案补"设置和装扮设置"

（八）轻提示 Toast 系统

1、所有操作成功提示改为轻提醒（3 秒自动消失，不打断用户）
2、层级 z-index: 5000，覆盖所有弹窗
3、宽度自适应内容，保持一行
4、保存设置时显示 SVG 绿勾 +「设置已保存」

（九）字体系统

1、全局使用思源黑体（Noto Sans SC），通过 Google Fonts 加载
2、回退方案完整（Android 用 Noto Sans CJK SC，macOS 用苹方，Windows 用微软雅黑）

（十）性能与交互优化（2026-08-11 新增）

1、字卡列表事件委托：每个条目的编辑 / 移动 / 屏蔽 / 删除按钮统一由 #cardList 上的一个监听器分发，不再为每张字卡绑定 4 个监听器（1408 张字卡 = 5632 个监听器 → 1 个）
2、字卡库无限滚动：超过 150 张字卡时首批只渲染 150 张，滚动接近底部自动追加 100 张，1408 张字卡打开弹窗秒开
3、管理模式滚动保持：表情包 / Emoji 批量管理模式的进入、退出、点选、全选只切换 CSS class，不再重建网格，滑动条不会跳动
4、确认弹窗样式统一：危险操作（通用确认框）与普通操作（分组重命名确认框）用 .confirm-ok--danger / .confirm-ok--primary 变体类区分，不再依赖 ID 选择器覆盖

三、近期完成的工作（2026-07-31 至 2026-08-01）

（一）存储层迁移：localStorage → IndexedDB

1、背景与目标
原项目使用 localStorage 存储所有数据，有大小限制（约 5-10MB），大容量图片和长聊天记录可能超出。迁移到 IndexedDB 支持更大容量（通常 50MB-几百MB）。本次迁移为「全新开始」方案，不保留 localStorage 旧数据。

2、数据库设计
① 数据库名：dream_chat_db
② 版本号：1
③ 对象仓库（Object Store）：
   ① contacts       ：联系人列表 [{ id, name, avatar, createdAt }]
   ② globalCards    ：通用字卡库（单条记录：{ data: { text, emoji, sticker } }）
   ③ contactCards   ：联系人字卡库（按联系人隔离，每条记录：{ contactId, type, data }）
   ④ messages       ：聊天记录（按联系人隔离，每条记录：{ contactId, messages: [] }）
   ⑤ settings       ：全局设置（单条记录：{ data: { ...settings } }）
   ⑥ userAvatar     ：用户自己的头像（单条记录：{ dataUrl }）
   ⑦ appState       ：应用状态（当前联系人ID、当前字卡库等）

3、代码改动范围
① data.js 完全重写：所有函数改为异步（返回 Promise），使用 IndexedDB API
② contact.js 异步化：所有函数改为 async，导出列表精简（不暴露与 data.js 重名的函数）
③ contact-ui.js 异步化：所有数据读写加 await，事件回调标记 async
④ avatar.js 异步化：头像读写加 await，补充遗漏的 await
⑤ card.js 异步化：所有数据读写加 await，相关函数改为 async
⑥ message.js 异步化：所有数据读写加 await，分页加载 + 日期分隔线 + 滚动加载更多
⑦ chat-settings.js 异步化：loadSettingsToUI、saveSettingsFromUI 改为 async
⑧ data-manager.js 异步化：所有数据读写加 await，全量恢复支持头像还原
⑨ main-ui.js 异步化：renderPartnerDropdownList、togglePartnerDropdown 改为 async
⑩ start.js 异步化：启动逻辑改为 async，修复变量名错误
⑪ welcome.js 新增存储空间检测功能

（二）存储空间提醒

1、触发时机：每次进入聊天界面时（欢迎界面加载完成后）
2、检测方式：使用 navigator.storage.estimate() 获取已用 / 配额
3、阈值策略：
   ① 使用率 < 85% ：不弹窗
   ② 85% ≤ 使用率 < 95% ：每24小时弹窗一次
   ③ 使用率 ≥ 95% ：每次都弹窗
4、提醒方式：使用 Toast 轻提示，不打断用户操作

（三）引用窗格点击跳转

1、触发方式：点击消息气泡下方的引用区域（.message-quote）
2、跳转行为：使用 scrollIntoView({ block: 'center', behavior: 'smooth' })
3、高亮方式：使用固定位置的黑色小箭头替代绿光动画
4、箭头位置：基于气泡元素用 getBoundingClientRect + fixed 定位
5、等待机制：使用 scrollend 事件等待滚动真正停止后显示箭头
6、异常处理：如果原消息已被删除，显示 Toast「原消息已被删除」

（四）回到底部按钮

1、位置：聊天区域底部、输入框上方（不遮挡消息）
2、显示条件：用户向上滚动超过可视区 80% 时显示，滚动到底部后自动隐藏
3、点击行为：平滑滚动到底部
4、样式：35px 圆形按钮，图标为向下箭头 + 底部横线

（五）消息分页加载 + 日期分隔线

1、分页策略：
   ① 首次进入聊天只加载最新的 20 条消息
   ② 用户滚动到顶部（距顶部 < 100px）时自动加载更早的 20 条
   ③ 加载时有 1 秒冷却，防止频繁触发
   ④ 加载过程中显示加载指示器（顶部旋转动画）
   ⑤ 滚动到最早消息后显示「已无更多历史记录」提示

2、日期分隔线：
   ① 今天 → 「今天」
   ② 昨天 → 「昨天」
   ③ 前天 ~ 7天内 → 「星期一」~「星期日」
   ④ 7天以上（今年内）→ 「X月X日」
   ⑤ 7天以上（往年）→ 「XXXX年X月X日」
   ⑥ 布局：左右横线 + 居中文字（flex 布局，无毛玻璃背景）

（六）全量备份恢复头像

1、导出时：
   ① 联系人头像以 assets/avatar_{联系人ID}.png 或 .jpg 存入 ZIP
   ② 用户头像以 assets/user_avatar.png 或 .jpg 存入 ZIP

2、恢复时：
   ① 读取 ZIP 中的头像文件，通过 idMap 正确映射新旧 ID
   ② 自动将头像绑定到对应联系人
   ③ 恢复后自动刷新界面头像

（七）消息分页重复问题修复

1、问题描述
用户有 87 条消息记录，向上滚动加载更多时，从第 40+ 条开始出现消息重复。表情包消息被置顶到最上方。

2、问题原因
① 分页机制使用了基于 offset 的偏移量分页（loadMessagesPaginated 函数）
② 在加载过程中，如果 IndexedDB 中有新增消息，offset 错位导致同一条消息被重复加载
③ 表情包消息的时间戳为 0 或 null，排序时被排到了最前面

3、修复方案
① 在 data.js 中新增 loadMessagesBefore 函数，用时间戳作为分页边界替代 offset
② 修改 message.js 中的 messageState 结构，用 earliestLoadedTimestamp 替代 loadedCount
③ 修改 loadMoreMessages 函数，每次加载比 earliestLoadedTimestamp 更早的消息
④ 在 addMessage 和 sendStickerFromPicker 中确保 timestamp 始终有值（Date.now()）
⑤ 用户在控制台执行去重脚本，清理了 IndexedDB 中的 20 条重复消息

（八）数据覆盖丢失问题修复

1、问题描述
用户原有 60 多条消息，在一次引用跳转 + 发送消息的操作后，IndexedDB 中的消息被覆盖成了 22 条，丢失了 40 多条早期消息。

2、问题原因
① IndexedDB 中每个联系人只有一条记录，messages 字段是一个数组，存储所有消息
② 引用跳转时，loadMessagesFromTargetToLatest 返回的是部分数据（从目标所在页到最新页）
③ allMessages 被替换成了部分数据
④ 用户后续发送消息时，saveCurrentMessages(allMessages) 用部分数据覆盖了 IndexedDB 中的完整数据

3、修复方案（方案A）
所有保存操作（发消息、删消息、添加消息）不再直接使用 allMessages，而是：
① 先从 IndexedDB 读取完整消息列表（loadMessages）
② 修改完整列表（追加或删除）
③ 将完整列表写回 IndexedDB（saveMessages）

4、已修改的函数
① sendMessage：从 IndexedDB 读完整列表 → 追加新消息 → 写回
② addMessage：从 IndexedDB 读完整列表 → 追加 → 写回
③ deleteMessage：从 IndexedDB 读完整列表 → 删除目标 → 写回
④ sendStickerFromPicker：从 IndexedDB 读完整列表 → 追加 → 写回

（九）引用跳转加载逻辑优化

1、问题描述
点击引用气泡时，如果被引用的消息不在当前已加载的分页中，会提示「原消息已被删除」。

2、用户明确要求的正确逻辑
如果目标消息在第 2 页（第 21-40 条），则应加载从第 2 页到最新页（第 5 页）的所有消息，不加载比目标更早的第 1 页。

3、修复方案
① 在 data.js 中新增 loadMessagesFromTargetToLatest 函数
② 计算目标消息所在的起始页索引：Math.floor(targetIndex / pageSize) * pageSize
③ 从起始索引一直取到数组末尾（最新消息）
④ 引用点击时调用此函数，替换 allMessages，重新渲染，定位到目标消息
⑤ 更新 hasMore 和 earliestLoadedTimestamp，保留向上加载更早消息的能力

（十）引用跳转高亮改为箭头

1、问题描述
原有的「绿光高亮」效果不稳定：第一次点击正常发光，第二次点击气泡闪烁弹动。

2、修复方案
① 新增 showArrowOnMessage 函数，在被引用的消息旁边显示一个黑色小箭头
② 自己的消息（右侧气泡）→ 箭头在气泡左侧，指向右（→）
③ 对方的消息（左侧气泡）→ 箭头在气泡右侧，指向左（←）
④ 箭头出现 0.5 秒后自动淡出消失
⑤ 使用 fixed 定位 + getBoundingClientRect，基于气泡元素本身定位，位置精确

3、滚动同步优化
① 新增 scrollToMessageWithArrow 函数
② 使用 scrollend 事件监听滚动真正结束（而非固定延迟）
③ 滚动完全停止后才显示箭头，位置永远准确

4、已删除的代码
① 移除了所有 highlight-flash 相关代码
② 引用跳转不再使用绿光高亮

（十一）messageState 残留字段清理

1、问题描述
messageState 中残留了 loadedCount 和 totalCount 两个字段，但 resetMessageState 已不再包含它们。sendMessage、addMessage、deleteMessage、sendStickerFromPicker 中仍在使用这些字段，导致 undefined += 1 产生 NaN。

2、修复方案
① 从 messageState 定义中移除 loadedCount 和 totalCount
② 从 sendMessage、addMessage、deleteMessage、sendStickerFromPicker 中移除对这两个字段的操作

（十二）删除聊天记录后界面刷新

1、问题描述
在数据管理弹窗中点击「删除聊天记录」后，聊天界面没有刷新，旧消息依然可见。

2、问题原因
① loadMessagesForContact 函数没有在加载前清空 allMessages 和 DOM
② loadMoreMessages 函数中，当 newMessages.length === 0（空结果）时直接返回，没有处理首次加载的空状态
③ data-manager.js 中的 deleteChatHistory 调用 loadMessagesForContact 时未加 await

3、修复方案
① loadMessagesForContact 中先执行 allMessages = [] 和 renderMessages() 再加载
② loadMoreMessages 空结果分支中，判断 wasInitialLoad 时重置状态并刷新界面
③ deleteChatHistory 中加上 await loadMessagesForContact(id)

（十三）首次进入聊天界面滚动到底部优化

1、问题描述
进入聊天窗口后，消息没有自动滚动到底部，需要用户手动滚动。

2、问题原因
① scrollToBottomInstant 使用 scrollIntoView 带有平滑动画，用户能看到滚动过程
② 使用 requestAnimationFrame 只等了 2 帧（约 32ms），图片未加载完导致 scrollHeight 不准

3、修复方案
① 改用多次重试滚动：立即执行 → 300ms 后 → 再 300ms 后，确保图片加载完成
② 使用直接设置 scrollTop，无动画，用户无感知
③ 总延迟约 600ms，在欢迎界面期间完成

（十四）进度条与消息加载同步（本次核心任务）

1、背景
用户希望在欢迎界面期间完成所有加载工作，进入聊天界面时直接看到完整状态，不需要任何滚动或等待。

2、问题描述
① 原有进度条是固定的定时器链，与真实加载进度无关
② 进度条走到 100% 时，消息可能还未开始加载
③ 进度条在 48% → 40% 之间存在视觉回退
④ 用户进入聊天界面后需要手动滚动才能看到最新消息
⑤ 进度条 95% 后卡住，不走到 100%

3、修复方案
① 修改 startLoading：进度条走到 95% 后停住，等待 onWelcomeComplete 执行完成
② 修改 start.js 的 onWelcomeComplete：加载消息 + 滚动完成后，调用 completeLoading
③ 使用队列机制 + requestAnimationFrame 驱动进度动画，替代 CSS transition
④ 调整阶段3起始时间（560→580），消除定时器竞争导致的回退
⑤ completeLoading 中先更新 98%，再设置 loadComplete，最后走 100%
⑥ 100% 直接操作 DOM，不经过 updateProgress（避免被 loadComplete 拦截）

4、最终效果
① 进度条从 0% 平滑走到 95%，在 95% 处等待消息加载
② 消息加载完成后，进度条从 95% 平滑走到 100%
③ 欢迎界面消失，聊天界面直接显示最新消息（已滚动到底部）
④ 无回退、无卡顿、无动画闪烁


四、近期完成的工作（2026-08-04）

（一）批量删除分组提示框优化

1、问题背景
原有的批量删除分组功能直接弹出二次确认框，用户只能确认删除，没有选择「移至未分组」的选项，与单个删除分组的交互不一致。

2、修复方案
重新设计了批量删除分组的提示框：
（1）显示所有选中的分组列表（两列网格布局，卡片包裹）
（2）显示字卡总数统计
（3）提供「一同删除字卡」和「移至未分组」两个选项
（4）右上角带 ✕ 关闭按钮，点击遮罩或按 ESC 可关闭
（5）标题「即将批量删除分组」和副标题居中显示
（6）图标与单个删除弹窗保持一致（SVG 警告图标）

3、涉及函数
（1）batchDeleteGroups — 构建自定义提示框
（2）executeBatchDeleteGroups — 执行批量删除逻辑

（二）轻提示颜色规范统一

1、问题背景
项目中的轻提示颜色不统一，部分提示缺少高亮色。

2、修复方案
为以下场景添加绿色高亮（toast-highlight）：

（1）新增字卡重复 → 字卡名（绿色）
（2）批量屏蔽分组 → 分组数量（绿色）
（3）批量取消屏蔽分组 → 分组数量（绿色）
（4）全量备份成功 → 文件名（绿色）
（5）全量恢复成功（覆盖/新增）→ 联系人数量（绿色）
（6）联系人导出成功 → 联系人名（绿色）
（7）联系人导入成功（覆盖/新增）→ 联系人名（绿色）
（8）删除聊天记录成功 → 联系人名（绿色）
（9）批量删除分组 → 分组数量（绿色）+ 操作描述（橙色）

3、涉及文件
（1）card.js
（2）data-manager.js

（三）清空字卡功能

1、功能说明
在管理分组弹窗中新增「清空字卡」功能，支持单个分组清空和批量清空。

2、单个清空
（1）位置：每个分组右侧按钮区，顺序为 屏蔽 → 清空 → 删除
（2）图标：📭（打开的空盒子）
（3）流程：点击 → 确认弹窗 → 清空该分组下的所有字卡 → 显示轻提示
（4）确认弹窗文案：确定要清空分组「分组名」里的 X 张字卡吗？（分组名和数字为绿色）
（5）轻提示：已清空「分组名」的 X 张字卡（分组名和数字为绿色）

3、批量清空
（1）位置：批量操作栏
（2）进入批量管理模式后显示「清空」按钮
（3）流程：点击 → 确认弹窗（显示所有选中分组列表 + 字卡总数）→ 清空 → 退出批量模式 → 显示轻提示
（4）轻提示：已清空 N 个分组，共 X 张字卡（数字为绿色）

4、涉及函数
（1）confirmClearGroupCards — 单个清空确认弹窗
（2）executeClearGroupCards — 执行清空逻辑
（3）batchClearGroups — 批量清空确认弹窗

（四）管理分组弹窗 - 单个删除分组弹窗优化

1、改动内容
（1）分组名包裹符号从 《》 改为 「」
（2）分组名颜色改为绿色（#5a9a88）
（3）数字颜色改为绿色（#5a9a88）
（4）布局改为：⚠️ 确认（18px，居中）+ 一行文字
（5）文字内容：即将删除分组「分组名」，该分组内有 X 张字卡，请选择如何处理？（15px）

2、涉及函数
（1）confirmDeleteGroup — 删除分组确认弹窗

（五）批量管理操作栏重构

1、背景
用户希望批量模式的交互更清晰，操作栏布局更合理。

2、改动内容
（1）删除了「取消」按钮（进入批量模式后，只有点击「✕ 退出批量」才能退出）
（2）点击网页空白处不再退出批量模式
（3）「屏蔽」和「取消屏蔽」拆分为两个独立按钮
（4）操作栏最终按钮顺序：全选 → 屏蔽 → 取消屏蔽 → 清空 → 删除
（5）「删除选中」简化为「删除」

3、涉及函数
（1）updateManageBatchUI — 更新批量操作栏UI状态
（2）enterManageBatchMode — 进入批量模式
（3）exitManageBatchMode — 退出批量模式
（4）batchBlockGroups — 批量屏蔽（修复了 count 为 0 的 bug）
（5）batchUnblockGroups — 批量取消屏蔽
（6）batchClearGroups — 批量清空
（7）bindCardModalEntry — 事件绑定


五、近期完成的工作（2026-08-10 群聊功能改版与修复）

本周期核心是「群聊」功能：界面改版（头部成员列表 + 标题栏按钮）、消息布局修复（时间戳对齐）、回复引擎调整（锁释放时间）。涉及文件：index.html、style.css、js/group-chat.js、js/message.js、js/avatar.js。当前群聊数据为「快乐小分队」：成员 夏以昼 / 祁煜 / 秦彻 / 黎深 / 沈星回 + 用户「我」共 6 人。

（一）群聊头部改版：用户作为群成员 + 右侧竖排按钮

1、需求（用户原话）
（1）把用户也当成群成员，放在 id="groupMembersList" 里，用户永远是第一个
（2）标题栏右侧原来的用户头像和名称不再显示
（3）标题栏右侧改成两个按钮，竖着摆：管理群成员按钮、退出按钮

2、改动
（1）js/group-chat.js 的 updateGroupHeaderUI：成员列表渲染 [me].concat(members)，其中 me={name:'我', avatar: await getUserAvatar()}，用户永远排第一；人数显示为 (members.length + 1人)；进入群聊时显示 groupChatHeader、groupHeaderActions，隐藏 partnerInfo、user-info
（2）exitGroupChat 退出群聊时反向恢复：groupHeaderActions 加 hidden、userInfoEl 移除 hidden
（3）新增全局 window.refreshGroupHeaderUI：用户更换头像后（avatar.js 调用）刷新成员列表里「我」的头像
（4）style.css：.group-header-actions 改为竖排（flex-direction:column、gap:8px、margin-left:12px、flex-shrink:0、两个按钮 width:92px）；新增 .user-info.hidden{display:none} 与 .group-header-actions.hidden{display:none}

3、验证：进入「快乐小分队」群，成员列表「我」永远第一；标题栏右侧为竖排「管理群成员」「退出」两个按钮，用户头像和名称不再显示；退出群聊后界面恢复原样

（二）群聊消息时间戳对齐修复

1、问题：群聊中时间戳位置不统一——单行文本消息时间戳离气泡 27px；带引用消息 58px（引用块与气泡之间还悬空 27px）；图片、多行文本、自己发的消息正常（4~5px）

2、根因：.message-item 是 flex row + flex-wrap 布局，行高由最高的子元素决定。群聊对方消息的「头像+名字」容器约 67px 高，比单行气泡（约 40px）高，气泡顶部对齐后底部悬空约 27px；时间戳（flex:0 0 100%; order:11）换行到新的一行，正好落在悬空区下方

3、修复
（1）js/message.js 的 createMessageElement：群聊对方消息（isGroupMsg && type==='other'）新增 .msg-content 纵向容器，气泡/图片、引用块、时间戳共 3 处 appendChild 改为 (msgContent || msgItem).appendChild
（2）style.css 群聊区块新增 .msg-content 规则：display:flex; flex-direction:column; align-items:flex-start; order:1; min-width:0; max-width:70%；容器内 bubble/image order 0、quote order 1（margin-top:4px、padding-left 归零）、timestamp order 2（margin-top:4px、padding-left 归零、flex:none）

4、注意事项
（1）时间戳有两处 append：同步分支（showTimestampCache 有值）与异步兜底分支（shouldShowTimestamp().then），两处都要改
（2）CSS 特异性：.message-item.group-msg.other .msg-content .message-quote（0,5,0）高于 .message-item.other .message-quote（0,2,1），能正常覆盖 padding-left

5、验证：20 条群聊消息时间戳距内容最大 5px，全部紧贴；单人聊天消息无 .msg-content、距离 5px 不受影响；自己发的消息不受影响

（三）群聊回复锁释放时间调整（80+ 秒 → 10 秒）

1、背景：用户发现群聊连发 3 条消息，成员只回了一次

2、根因
（1）单聊 simulateReply 用队列：isReplying 为 true 时 replyQueue.push(true) 排队，回复完毕后逐个处理，连发多条每条都会回
（2）群聊 simulateGroupReply 用锁：if (groupReplyInProgress) return 直接丢弃新消息，不排队
（3）锁释放时间原为 (minWait + maxWait*60 + 2) * 1000 + members.length * 4000，默认设置（minWait=3、maxWait=0.57、5 成员）约 85 秒

3、修改：js/message.js 的 simulateGroupReply 末尾，锁释放 setTimeout 改为固定 10000ms（10 秒）

4、遗留问题：10 秒后锁虽释放，但上一轮成员可能还没回完（单成员最迟约 60 秒才轮到回复），此时再发消息会安排新一轮回复，两轮可能重叠；群聊仍无排队机制，10 秒内连发的消息依然会被丢弃（待办，见下一步计划）

（四）「群聊发消息没人回」排查结论（2026-08-10 当次，已定位未改代码）

1、现象：用户发消息后群成员不回复

2、排查过程与结论
（1）实测发 1 条消息，等待约 30 秒，5 个成员全部回复并带引用（消息 22 条 → 32 条），回复引擎本身工作正常
（2）真实原因①：设置里「已读不回」开启（messageInteraction.readNoReply=true，概率 10%），命中时该条消息不回复——这是正常功能，不是 bug
（3）真实原因②：群聊锁丢弃消息——10 秒内连发多条，只有第一条触发回复，后续被 if (groupReplyInProgress) return 丢弃

3、经验：排查「没人回」先查：①已读不回设置 ②群聊锁状态 ③成员字卡是否为空（秦彻/黎深/沈星回单人字卡为 0 条，但全局库 1456 条兜底，仍有回复）


六、近期完成的工作（2026-08-11 确认框统一 · 事件委托 · 字卡库无限滚动 · 管理模式滚动修复）

本周期四件事，核心是「字卡库性能优化」：先是确认弹窗样式统一，接着把字卡列表 5632 个事件监听器收敛为 1 个事件委托，再给 1408 张字卡的列表加上无限滚动（秒开），最后修复了批量管理模式下滑动条自己跳顶的问题。涉及文件：index.html、style.css、js/card.js。

（一）确认弹窗样式统一：危险 / 主色变体类

1、背景
项目里有两个二次确认弹窗，确认按钮样式不一致：
（1）confirmModal（通用确认框，删除等危险操作）：确定按钮红色
（2）groupRenameModal（分组重命名确认框）：确定按钮主题色
原先差异化靠 ID 选择器硬编码（style.css 中 #groupRenameModal .confirm-ok 覆盖），新增弹窗无法复用，风格不可控。

2、修复方案
（1）新增两个变体类替代 ID 覆盖：
① .confirm-ok--danger：红底 rgba(244,67,54,0.15) + 红字 #d32f2f，用于危险操作（通用确认框）
② .confirm-ok--primary：主题色背景 + 白字，用于普通操作（分组重命名）
（2）index.html 两个确认按钮加变体类：
① confirmModal：class="confirm-ok confirm-ok--danger" id="confirmBtn"
② groupRenameModal：class="confirm-ok confirm-ok--primary" id="groupRenameConfirmBtn"
（3）删除 style.css 中 #groupRenameModal .confirm-ok 的 ID 覆盖

3、涉及函数
（1）showConfirmModal（main-ui.js）：用 cloneNode 重新绑定按钮，变体类随克隆保留，不受影响
（2）showCustomConfirm（card.js）：动态构建弹窗，支持 modalClass 选项
（3）data-manager.js 冲突弹窗（约 983 行）：.confirm-box + .confirm-ok + 内联样式，独立不受影响

4、验证：三个确认框红色 / 主色区分清晰，功能正常

（二）事件委托：字卡列表 5632 个监听器 → 1 个

1、背景
createCardItem 原先为每张字卡的 4 个按钮（编辑 / 移动 / 屏蔽 / 删除）各绑定一次 addEventListener。1408 张字卡 = 5632 个监听器，内存占用大、初始渲染慢。

2、实现
（1）createCardItem 不再绑定任何 click，只设置 dataset：
① div.dataset.index = filterIndex（过滤后索引）
② div.dataset.realIndex = realIndex（原数组索引，执行操作用）
（2）新增 bindCardListEvents()：在 #cardList 上绑定唯一 click 监听器
① const item = e.target.closest('.card-item')，找不到则 return
② const realIndex = parseInt(item.dataset.realIndex, 10)
③ 用 e.target.closest('.card-edit-btn' | '.card-move-btn' | '.card-block-btn' | '.card-delete-btn') 分发到 openEditCardModal / openEditGroupModal / toggleCardBlock / deleteCard
（3）bindCardModalEntry() 中调用 bindCardListEvents()

3、验证：用户实测「按钮是正常的」

（三）字卡库无限滚动（1408 张字卡秒开）

1、背景
字卡库打开时一次性渲染全部字卡（1408 张），弹窗打开慢、滚动卡顿。向用户提供方案后，用户选择「A：无限滚动（增量加载）」。虚拟列表被放弃：字卡条目高度不固定（.card-item 是 height:auto，文字可换行），虚拟列表要求固定行高。

2、实现
（1）新增全局状态（card.js 顶部）：
① _cardObserver：当前列表的 IntersectionObserver
② _cardLoadToken：加载令牌，渲染被切换时让旧回调失效
③ CARD_PAGE_SIZE = 150：首批渲染数量
④ CARD_LOAD_BATCH = 100：每次滚动追加数量
（2）新增 resetCardIncremental(container)：断开旧 observer + 移除残留哨兵，重渲染 / 空列表时调用
（3）新增 renderIncremental(container, items, createFn)：
① 数据 ≤ 150 张：直接走原 renderChunked，无感知
② 数据多时：首批只渲染前 150 张（renderChunked 秒开）
③ 首批渲染完成（.then 回调）后追加 1px 高的 .card-list-sentinel 哨兵
④ IntersectionObserver（root: container、rootMargin: '300px 0px'）观察哨兵，接近底部（提前 300px 预加载）时追加下一批 100 张，insertBefore 到哨兵之前
⑤ 全部加载完：observer.disconnect() + 哨兵 remove()
⑥ 令牌守卫：if (token !== _cardLoadToken) 直接放弃（切换分组 / 搜索 / 标签页时旧回调不污染新列表）
（4）renderCardList 改用 renderIncremental，空列表分支调用 resetCardIncremental
（5）style.css 新增哨兵样式：.card-list-sentinel { height:1px; flex-shrink:0; pointer-events:none; }

3、关键设计
（1）缓存命中不清理 observer：renderCardList 的 renderedState 缓存命中时直接 return，observer 与哨兵保留在 DOM 中，重开弹窗后还能从上次位置继续滚动加载
（2）切换分组 / 搜索 / 标签页会自动重置：新渲染先 resetCardIncremental + 令牌机制
（3）弹窗 display:none 时 IntersectionObserver 不触发，关闭弹窗不会继续加载

4、过程中的 bug 与修复
（1）编辑失误误删了 const token = _cardLoadToken;，renderIncremental 引用 token 时报 ReferenceError，已恢复
（2）经验：replace_string_in_file 的 oldString / newString 顺序极易搞反，编辑后必须 read_file 复核 + get_errors 校验

5、验证：1408 张字卡弹窗瞬间打开（秒开），滚动流畅追加

（四）批量管理模式滑动条跳动修复（表情包 / Emoji）

1、问题描述
字卡库 → 表情包 Tab → 点「管理」按钮，右侧滑动条会自动跳到顶部（用户原话「滑动条会自己往上走一下」）。

2、根因
（1）toggleManageMode 会重建整个网格（renderStickerGrid / renderEmojiGrid）
（2）renderChunked 重建时先 container.innerHTML = ''（超过 200 个还会先显示「加载中…」占位），内容高度瞬间骤减
（3）浏览器发现内容不够高，强制把 scrollTop 钳制回 0；内容重新填充后停在顶部回不来
（4）浏览器实测验证：同步路径（≤200 项）不跳；异步分帧路径（>200 项）必跳顶

3、修复（两层）
（1）根治：管理模式不再重建 DOM，只切换 CSS class
① 新增 applyManageModeToGrid(type)：遍历网格子项，加 / 去 manage-mode、selected class，同步 checkbox 的 checked
② 新增 updateItemSelection(index, type)：点选时只更新单个条目的 selected / checked
③ toggleManageMode / exitManageMode / toggleSelectItem / toggleSelectAll 全部改为调用上述函数，不再走 renderStickerGrid 重建
（2）防御：renderStickerGrid / renderEmojiGrid 重建时保存 / 恢复滚动位置
① 渲染前 const prevScrollTop = grid.scrollTop
② 渲染后 grid.scrollTop = prevScrollTop
③ 覆盖仍需重建的场景（删除单个表情包、切换标签页等）

4、验证：用户实测「完全OK」——进入 / 退出管理、点选、全选都不跳，删除单个表情包后列表位置保持


七、近期完成的工作（2026-08-15 数据管理弹窗群聊支持）

本周期核心是让「数据管理弹窗」完全支持多人群聊：全量备份 / 恢复纳入群聊数据，删除聊天记录支持聊天室，存储统计计入群聊消息，删除联系人时清理群聊成员引用。涉及文件：index.html、js/data-manager.js、js/contact.js。

（一）全量备份纳入群聊（备份版本 v1.0 → v1.1）

1、问题：collectAllData 只导出联系人 / 字卡 / 消息 / 设置，群聊列表（groupChats store）与群聊消息（messages 中 group_<id> 键）完全不导出，备份不完整
2、修复：
（1）collectAllData 新增 groupChats 字段 + 群聊消息（messages['group_<id>']），备份版本升级 v1.1
（2）fullRestore 版本检查兼容 v1.0 / v1.1，旧备份（无群聊字段）照常恢复

（二）全量恢复支持群聊

1、新增 importGroupChatData(data, idMap)：
（1）群聊 memberIds 按 idMap 映射（新增模式下冲突联系人改名换新 ID 也能正确对应）
（2）成员去重 + 过滤无效成员（联系人已被删除的丢弃）
（3）在导入群聊消息之前执行，保证群聊先存在
2、importCardDataAndMessages 消息循环新增 group_ 分支：覆盖模式直接覆盖，合并模式按消息 id 去重合并
3、Toast 提示增加群聊数量：「联系人 N 个 · 群聊 M 个」

（三）删除聊天记录支持聊天室

1、populateSelects：删除下拉改为 optgroup 分组（联系人 / 群聊），value 用前缀区分（c: 联系人 / g: 群聊）
2、deleteChatHistory：支持删除聊天室记录；删除当前正在查看的会话（含群聊模式）时即时刷新消息区

（四）存储统计计入群聊

1、getStorageStats：聊天记录大小与条数统计加入群聊消息（loadMessages('group_<id>')），counts 新增 groups 字段
2、updateStorageDisplay：备份清单新增「·群聊 N 个」（index.html 新增 #fullBackupGroups 元素）

（五）删除联系人清理群聊成员引用

1、问题：deleteContact 只删联系人的字卡库和聊天记录，群聊 memberIds 残留失效 ID，会被带进备份
2、修复：contact.js 的 deleteContact 删除联系人后遍历所有群聊，从 memberIds 中移除该 ID 并保存

（六）界面刷新支持群聊

refreshAllData 新增分支：当前处于群聊模式（isGroupChatMode）时刷新群聊消息，导入 / 重置后群聊界面数据同步

3、验证：浏览器实测——备份正确收集 3 个群聊 + 167 条群聊消息；成员映射（夏以昼 → 祁煜）替换正确，无效 ID 自动过滤；消息合并 / 覆盖模式均正确；临时测试数据清理干净，真实数据零污染


八、近期完成的工作（2026-08-15 存储空间可视化 · 表情包上传压缩 · 群聊消息串台修复）

本周期三件事：数据管理弹窗「存储空间」卡片细分显示表情包占用；表情包上传时自动压缩；修复群聊 / 单聊消息串台 bug。涉及文件：js/data-manager.js、index.html、js/card.js、js/message.js。

（一）存储空间卡片细分表情包占用

1、getStorageStats 新增 cardsSticker（所有字卡库 sticker 部分序列化大小）+ counts.stickerCards（表情包张数）
2、updateStorageDisplay 改为单行括号显示：·字卡库 48.9MB（表情包 48.8MB）

（二）表情包上传压缩（compressStickerImage）

1、规则：
（1）GIF（type 或文件名含 .gif）不压缩原样返回
（2）≤200KB 原样返回
（3）大图读入 → 最长边等比缩到 400px → canvas → 检测透明（alpha<255）→ 有透明输出 PNG，否则 WebP 0.8
（4）压缩后比原图大则退回原图
2、两个上传入口接入：openAddCardModal 的 sticker 分支（tempInput.onchange）+ confirmAddCard 的 sticker 分支（addCardSelectedFiles）
3、实测：773KB 噪点 PNG → 94KB（-88%）；透明 PNG 271KB→96KB 保留透明；小图 / GIF 原样

（三）群聊 / 单聊消息串台修复

1、问题：单聊模拟回复（simulateReply）的延迟 setTimeout 在用户切换到群聊后仍执行——addMessage('other', ...) 不带 senderId，persistMessage 检测到 isGroupChatMode() 为 true 就把消息写进群聊 storage（group_<id>），渲染时无 senderId 又被当作单聊消息显示（显示当前单聊对象的头像 / 名字）→ 群聊里出现「单人的夏以昼」
2、修复（最终逻辑 = 不串台 + 不丢消息）：
（1）单聊 simulateReply 记录发起时的 replyContactId，新增 stillInSingleChat() 校验（非群聊模式 + 当前联系人未变）
（2）新增 sendSingleReply 统一发送：仍在单聊会话中 → 正常 addMessage 渲染；用户已切走 → 仅调用新增的 persistMessageToContact 把消息保存到原联系人消息库（不渲染、不动当前 allMessages），回到该联系人时能看到回复
（3）sendNext 每条消息发送前、贴纸延迟定时器里都走 sendSingleReply；quotedData 仅在仍处于会话时生成（避免引用群聊消息）
（4）sendStickerFromPicker 群聊模式下补 senderId='me' / senderName='我'（与 sendMessage 一致，否则自己发的表情包被当作单聊消息渲染）
3、数据清理：删除快乐小分队群聊中 3 条串台的 other 消息，1 条 self 表情包补上 senderId
4、验证（加速测试：临时把单聊 replySpeed 调为 minWait=0 / maxWait=0.05）：单聊发消息 → 立即切到群聊 → 等 5 秒：单聊 storage 新增 2 条 other 回复（文字 + 表情包，正确保存不丢失），群聊零新增、零无 senderId 消息；测完恢复原设置（minWait=6 / maxWait=5.05）并清理测试消息
5、排查经验：单聊回复延迟由 replySpeed.minWait/maxWait 决定（本数据为 6~297 秒），短时间等不到回复属正常现象，不是 bug；验证延迟发送逻辑时需临时调小延迟加速

（四）切换聊天后「回复保存不丢」+「正在输入提示跟随界面」

1、需求：①从群聊切到单聊，群聊没发完的记录也要保存；②正在输入提示框跟随当前聊天界面：单聊时显示单聊对象的输入提示，切到群聊界面后输入框隐藏（单聊 pending 状态保留），退出群聊回到该单聊界面时，若还没回完，输入框重新出现；回复全部发完才消失
2、实现：
（1）群聊侧：simulateGroupReply 每个成员新增 sendGroupReply 统一发送——仍在该群聊 → 正常 addMessage 渲染；用户已切走 → persistMessageToContact 保存到原群聊 storage（带 senderId/senderName），回到该群聊时能看到；已切走时不生成 quotedData（避免引用错当前界面消息）
（2）typing 统一调度：新增 singleTypingMap（单聊 pending 状态，按联系人 id 分别保存）+ syncTypingIndicator()——只渲染当前聊天界面的输入方：单聊界面只认当前联系人的 singleTypingMap[id]，群聊界面只认 groupTypingMembers，都不在则隐藏
（3）resetSingleReplyState / resetGroupReplyState 只清锁、不清 pending 状态（singleTypingMap / groupTypingMembers / token 保留）——切换聊天输入框隐藏但状态不丢，切回时重新显示
（4）回复发完由收尾清理：单聊收尾 delete singleTypingMap[replyContactId] + syncTypingIndicator()（按条目 token 判断，防同联系人旧轮误删新轮）；群聊成员发完 removeGroupTypingMember
（5）enterGroupChat / leaveGroupChatUI / switchContact 末尾调用 syncTypingIndicator() 刷新显示（进入群聊即隐藏单聊输入框、退出即恢复）
（6）切换联系人（单聊 A→B）：singleTypingMap 按联系人分开保存，切到 B 时只显示 B 的输入状态（A 的弹窗隐藏但状态保留）——B 发消息后切回 A，若 A 还没回完则弹窗重新出现；A 排队中的回复仍保存到其 storage（不丢）
（7）删除联系人清残留：新增 cleanupTypingForContact(contactId)——删除 singleTypingMap[contactId] + 从 groupTypingMembers 中移除该成员 + syncTypingIndicator() 刷新；deleteContact 中调用（删的是当前联系人时后续 switchContact 再刷新一次）
3、验证（加速测试 replySpeed minWait=0 / maxWait=0.3，测完恢复 6/5.05）：
（1）单聊发消息 → typing 出现（夏以昼 正在输入）→ 切群聊 → typing 消失 → 切回单聊 → typing 重新出现（回复未发完）
（2）群聊发消息 → 切单聊：群聊成员 9 条回复全部保存到群聊 storage 且都带 senderId
（3）单聊夏以昼发消息 → typing 出现 → 切到祁煜 → 弹窗隐藏（只显示当前联系人的输入状态）→ 给祁煜发消息 → 祁煜 typing 出现 → 切回夏以昼 → 夏以昼 typing 重新出现（回复未回完）✅
（4）删除联系人清残留：临时建联系人+字卡→发消息 typing 出现→deleteContact→typing 隐藏、列表无残留、自动切回夏以昼；延迟到达的回复会在删除后重建该 id 消息库（测试后已清空，属已知行为：pending 回复无法取消）✅
4、测试数据已清理（临时联系人已删、幽灵消息库已清空、设置备份恢复），注意：单聊回复速度当前为用户设置值（minWait=6 / maxWait=0.53 分钟≈6~32 秒），勿随意改


九、代码结构
├── style.css           # 全部样式（完整）
├── tasks.json          # VS Code 任务配置
├── README.md           # 项目说明
├── now.md              # 本文档（最新交接用）
└── js/
    ├── data.js         # 数据层（IndexedDB 存储，完全重写）
    ├── contact.js      # 联系人业务逻辑（异步化）
    ├── message.js      # 消息模块（异步化 + 分页 + 日期分隔线）
    ├── avatar.js       # 头像上传、裁剪（异步化）
    ├── main-ui.js      # 主界面控制（异步化）
    ├── contact-ui.js   # 联系人管理界面（异步化）
    ├── card.js         # 字卡库模块（异步化）
    ├── chat-settings.js # 聊天设置弹窗（异步化）
    ├── data-manager.js # 数据管理弹窗（异步化 + 头像备份恢复）
    ├── welcome.js      # 欢迎界面（进度条 + 粒子动画）
    └── start.js        # 启动入口（异步化）


十、下一步计划

（一）表情包 / Emoji 网格删除按钮事件委托（可选优化）：renderStickerGrid / renderEmojiGrid 的删除按钮仍为每个条目单独 addEventListener，可像字卡列表一样改为事件委托
（二）字卡条目渲染微优化（可选）：createCardItem 可用字符串拼接 innerHTML 替代多次 createElement
（三）群聊回复排队机制：当前群聊连发消息会被锁丢弃（见五（三）），需改为与单聊一致的排队机制，确保每条消息都有人回
（四）消息列表虚拟滚动（大量消息时性能优化）
（五）字卡库批量操作增强（批量移动分组、批量屏蔽/取消屏蔽）
（六）暗色模式支持
（七）存储空间接近上限时在数据管理页面显示更醒目的提示


十一、重要经验（务必记住）

（一）IndexedDB 迁移的关键原则

1、data.js 是所有数据访问的唯一入口，其他模块通过 window 调用其函数
2、所有数据读写函数必须返回 Promise，上层调用必须加 await
3、contact.js 只管理内存状态，不暴露与 data.js 重名的函数
4、删除联系人时，saveCardData 传入 null 只删除不插入，防止空指针

（二）异步改造的常见坑

1、事件监听回调中使用 await 时，回调必须标记为 async
2、forEach 中调用异步函数时，需要改用 for...of 或 Promise.all
3、IIFE（立即执行异步函数）可以用于不需要等待结果的场景
4、点击输入框内部时，需要阻止事件冒泡，避免触发父元素的点击事件
5、多个模块之间存在函数重名时，后加载的会覆盖先加载的（注意导出列表）

（三）消息分页加载的设计要点

1、首次加载用 DocumentFragment 一次性渲染，避免逐条闪烁
2、增量加载时用 insertBefore 插入到顶部，记录滚动位置并恢复
3、日期分隔线只在跨天时插入，避免重复
4、加载更多时跳过「已无更多」提示作为插入位置，避免错位
5、用 isFirstLoadComplete 标记首次加载完成，防止滚动触发加载更多
6、用 lastLoadMoreTime 做 1 秒冷却，防止频繁触发
7、必须使用时间戳分页（loadMessagesBefore），绝不能使用 offset 分页

（四）回到底部按钮的设计要点

1、位置：聊天区域底部、输入框上方（不遮挡消息）
2、显示条件：距底部 > 可视区 80% 时显示，接近底部时隐藏
3、点击使用 scrollTo({ top: scrollHeight, behavior: 'smooth' })
4、发送新消息后自动隐藏（已经到底了）
5、按钮显隐逻辑必须独立于 hasMore，否则加载完成后按钮消失

（五）数据保存的核心原则（极其重要）

1、任何保存操作都必须基于 IndexedDB 中的完整数据，不能基于 allMessages
2、allMessages 只用于展示（分页数据），不应用于持久化保存
3、发消息、删消息、添加消息时，必须先 loadMessages 读完整列表，修改后再 saveMessages 写回
4、引用跳转只是「查看」操作，不应触发任何保存
5、已在 sendMessage、addMessage、deleteMessage、sendStickerFromPicker 中全部修复

（六）引用跳转的设计要点

1、引用跳转时应加载「从目标所在页到最新页」的所有消息，不加载比目标更早的消息
2、跳转后应保留向上加载更早消息的能力（hasMore 和 earliestLoadedTimestamp）
3、高亮方式改用固定位置的箭头，不用动画高亮（避免闪烁）
4、使用 scrollend 事件等待滚动真正结束，不用固定延迟
5、箭头必须基于气泡元素用 getBoundingClientRect 定位，不能基于整个消息项

（七）进度条与加载同步的核心经验

1、进度条必须与真实加载进度挂钩，不能是固定的定时器链
2、进度条值必须在函数内部做防回退处理（忽略小于当前值的目标）
3、用 requestAnimationFrame + 队列驱动动画，替代 CSS transition
4、在 completeLoading 中，必须先更新进度再设置完成标志，否则进度被拦截
5、100% 更新必须直接操作 DOM，不经过 updateProgress（避免被 loadComplete 拦截）
6、定时器必须有取消机制，否则已排队的定时器会在完成标志设置后继续执行

（八）轻提示颜色

1、toast-highlight 类只在 .toast-message 容器内生效，弹窗中的文字如需绿色需使用内联样式 style="color:#5a9a88;font-weight:600;"

2、批量操作中，必须在调用 exitManageBatchMode() 之前保存 selectedGroupNames.length，否则会被清空为 0

（九）批量模式交互设计

1、批量模式下，点击遮罩不应关闭弹窗，只有点击「✕ 退出批量」才能退出
2、操作栏按钮应保持功能单一（屏蔽/取消屏蔽分离），方便用户精确控制
3、「清空」按钮在非批量模式下应隐藏，进入批量模式后显示

（十）弹窗设计

1、删除分组的确认弹窗应提供「一同删除字卡」和「移至未分组」两个选项
2、批量删除分组弹窗应显示所有选中的分组列表，方便用户确认
3、弹窗中的分组名和数字应使用绿色高亮，与轻提示风格保持一致

（十一）函数命名

1、execute 前缀用于执行实际操作的内部函数（如 executeBatchDeleteGroups、executeClearGroupCards）
2、confirm 前缀用于显示确认弹窗的函数（如 confirmDeleteGroup、confirmClearGroupCards）
3、batch 前缀用于批量操作函数（如 batchBlockGroups、batchClearGroups）

（十二）调试方法

1、打开浏览器开发者工具（F12），查看 Console 面板的报错信息
2、报错信息中的文件名和行号是定位问题的关键
3、使用 console.log 在关键位置打印变量值
4、修改代码后必须硬刷新（Ctrl+Shift+R）清除缓存

（十三）flex 换行布局的悬空问题

1、.message-item 是 flex row + flex-wrap，行高由最高的子元素决定（群聊对方消息的「头像+名字」容器约 67px），矮气泡（约 40px）底部悬空约 27px
2、尾部块（时间戳 flex:0 0 100% 换行）会落在悬空区下方，产生「时间戳离气泡远」的视觉问题
3、解法：用纵向子容器（.msg-content）把 内容/图片 + 引用 + 时间戳 包起来紧贴排列，不再受外部 flex 行高影响

（十四）单聊队列 vs 群聊锁

1、单聊：isReplying + replyQueue 排队，连发多条依次回复
2、群聊：groupReplyInProgress 锁，占用期间新消息直接丢弃；锁释放时间已改为 10 秒
3、如需群聊每条消息都回复，需把锁机制改为排队机制

（十五）浏览器自动化读取全局 let 变量的 TDZ 陷阱

1、page.evaluate 隔离作用域里直接读页面顶层 let/const 变量会报 ReferenceError: Cannot access 'xxx' before initialization
2、解法：注入 <script> 标签读取后挂到 window 上，或使用页面自身暴露的 window.xxx 函数

（十六）已读不回设置

1、messageInteraction.readNoReply + readNoReplyRate（默认 10%），命中时不回复是正常功能，不是 bug
2、排查「发消息没人回」时先检查该设置

（十七）管理模式不要重建 DOM

1、进入 / 退出 / 点选 / 全选批量管理模式时，只切换 CSS class（manage-mode / selected / checked），绝不重建网格
2、重建会清空容器内容，导致 scrollTop 被浏览器钳制回 0（滑动条跳顶），且重建几百个节点浪费性能
3、checkbox、selected 等视觉状态全部由 class 控制，切 class 即可，无需重建

（十八）清空容器会导致滚动条跳顶（浏览器强制行为）

1、任何「innerHTML = '' 再重新填充」的重建，浏览器都会把 scrollTop 钳制回 0（内容高度骤减时）
2、renderChunked 的 >200 项分支会先显示「加载中…」占位再分帧填充，异步路径必跳顶；≤200 项同步路径不跳
3、必须重建时：渲染前保存 prevScrollTop，渲染完成后 grid.scrollTop = prevScrollTop

（十九）无限滚动（增量渲染）五要素

1、哨兵元素：列表底部放一个 1px 高的哨兵 div，被 IntersectionObserver 观察
2、root 必须是滚动容器本身（root: container），否则视口外的元素永远不触发
3、rootMargin 提前预加载：rootMargin: '300px 0px' 让哨兵提前 300px 进入触发区，滚动更平滑
4、令牌防污染：_cardLoadToken 每次渲染自增，回调里 if (token !== _cardLoadToken) 直接放弃，切换分组 / 搜索 / 标签页时旧回调不污染新列表
5、全部加载完必须 observer.disconnect() + 移除哨兵，避免空转

（二十）事件委托要点

1、父容器（#cardList）绑定唯一 click 监听器，用 e.target.closest('.card-item') 找目标项
2、按钮分发用 e.target.closest('.card-edit-btn' | '.card-move-btn' | ...) 判断点击了哪个按钮
3、索引存 dataset：div.dataset.index = 过滤后索引，div.dataset.realIndex = 原数组索引
4、执行增删改操作必须用 realIndex（原数组索引），不能用过滤后的 index

（二十一）replace_string_in_file 编辑陷阱

1、oldString / newString 参数顺序搞反会误删 / 误改代码（本次误删了 const token = _cardLoadToken; 一行）
2、编辑后必须 read_file 复核改动区域 + get_errors 校验语法

（二十二）群聊数据备份要点

1、群聊消息的 contactId 是 'group_<id>' 字符串（非数字），与联系人消息（数字 id）区分；备份 / 统计 / 删除时都按该键处理
2、全量备份版本号升级（v1.0 → v1.1）必须向后兼容：恢复时用版本白名单校验，旧备份无群聊字段也能恢复
3、群聊 memberIds 是联系人 id 数组，恢复时需按 idMap 映射；成员可能已被删除，导入时过滤无效成员
4、删除联系人与清理群聊成员引用必须联动，否则备份文件里会残留失效成员 ID

（二十三）延迟回复串台的根因与预防

1、单聊 / 群聊的模拟回复都依赖 setTimeout 延迟执行，期间用户可能切换模式（单聊 ↔ 群聊）或切换联系人
2、串台根因：persistMessage 按「当前模式」决定存储位置（群聊 group_<id> / 单聊 联系人 id），addMessage 渲染按「有无 senderId」决定样式——延迟回复执行时模式已变，消息就会写错 store 且渲染错样式
3、预防：任何延迟发送（setTimeout 队列）必须在每次发送前校验「模式未变 + 会话未变」：群聊校验 getCurrentGroupStorageId() === 发起时 id，单聊校验 !isGroupChatMode() && getCurrentContactIdSync() === 发起时联系人 id；校验失败不丢弃——改用 persistMessageToContact 保存到发起时会话的消息库（不渲染），回来看得到
4、群聊消息必须有 senderId（成员 id 或 'me'），否则会被当单聊消息渲染（显示当前单聊对象的头像名字）——sendStickerFromPicker 等旁路发送也要补 senderId
5、「正在输入」提示是全局共用 DOM（msg_typingIndicator），切换聊天时输入框要隐藏但 pending 状态不能清——用 syncTypingIndicator 统一调度（singleTypingMap = 单聊 pending、按联系人 id 分别保存；groupTypingMembers = 群聊 pending）：只渲染当前界面自己的输入方，切走隐藏、切回若未回完则重新显示；reset 函数只清锁不清 pending 状态，回复发完才清理（单聊按条目 token 判断删除，防同联系人旧轮误删新轮）


十二、快速启动指南

1、在 VS Code 中打开项目文件夹
2、运行 Tasks: Run Task → Open Chat Site in Browser（或直接打开 index.html）
3、首次使用会弹出「欢迎来到」弹窗，输入联系人名字开始
4、点击底部「+」号 → 字卡库 → 切换「通用」或具体联系人 → 添加字卡
5、在聊天框输入文字，对方会从「通用库 + 当前联系人库」中随机回复
6、向上滚动可加载更早的历史消息（每次 20 条）
7、所有数据存储在 IndexedDB 中，清除浏览器缓存不会丢失数据（除非手动清除站点数据）


十三、常见问题排查

（一）功能面板展开时聊天区域不上移
可能原因：flex 收缩失效
排查方法：检查 .message-area 是否有 flex:1 1 0%; min-height:0;

（二）正在输入或引用条不显示
可能原因：被父容器 overflow:hidden 裁剪
排查方法：检查所有父容器的 overflow，移除 hidden

（三）消息刷新后丢失
可能原因：saveCurrentMessages 未被调用或未 await
排查方法：检查 message.js 中的 sendMessage、addMessage、deleteMessage 函数是否加了 await

（四）日期分隔线不显示或格式不对
可能原因：createDateSeparator 未使用 span 包裹文字
排查方法：确认 createDateSeparator 用 innerHTML 包含 <span class="line"> 和 <span class="text">

（五）滚动加载更多时页面跳动
可能原因：滚动位置恢复逻辑不准确
排查方法：确认 loadMoreMessages 中记录了 oldScrollTop 和 oldScrollHeight，恢复时用 scrollTop = oldScrollTop + heightDiff

（六）全量备份恢复后头像丢失
可能原因：doFullRestore 未调用 restoreAvatarsFromZip
排查方法：确认 doFullRestore 在两个分支（有冲突 / 无冲突）都调用了 restoreAvatarsFromZip

（七）已无更多历史记录不显示
可能原因：hasMore 为 true 时不会显示
排查方法：确认 messageState.hasMore 在 loadedCount >= totalCount 时变为 false

（八）回到底部按钮不显示
可能原因：向上滚动距离不足阈值
排查方法：在 handleScroll 中加 console.log 检查 isNearBottom 的值

（九）数据被部分数据覆盖
可能原因：保存时直接使用了 allMessages（分页数据）而非完整数据
排查方法：检查 sendMessage、addMessage、deleteMessage 是否从 IndexedDB 读完整数据
修复方案：所有保存操作必须先 loadMessages 再 saveMessages

（十）引用箭头位置不准
可能原因：固定延迟不够，滚动未完成时箭头已出现
排查方法：改用 scrollend 事件替代 setTimeout
修复方案：使用 scrollToMessageWithArrow 函数

（十一）进度条回退或卡住
可能原因：定时器竞争、CSS transition 动画冲突、loadComplete 拦截
排查方法：查看控制台日志，确认进度值是否严格递增
修复方案：使用 requestAnimationFrame + 队列驱动，100% 直接操作 DOM

（十二）轻提示颜色不生效
可能原因：在弹窗中使用了 toast-highlight 类
修复方案：改用内联样式 style="color:#5a9a88;font-weight:600;"

（十三）批量屏蔽提示数字为 0
可能原因：exitManageBatchMode 清空了 selectedGroupNames
修复方案：在调用 exitManageBatchMode 前保存 count

（十四）批量模式点击空白处退出
可能原因：遮罩点击事件未判断批量模式
修复方案：在 manageModal 的 click 事件中判断 isManageGroupBatchMode

（十五）清空按钮不显示
可能原因：enterManageBatchMode 中未设置 display
修复方案：确保 clearBtn.style.display = 'inline-block'

（十六）管理模式滑动条跳到顶部
可能原因：toggleManageMode 重建整个网格，renderChunked 清空容器导致 scrollTop 被钳制回 0
修复方案：管理模式只切换 class 不重建 DOM（applyManageModeToGrid / updateItemSelection）；必须重建时保存 / 恢复 scrollTop

（十七）字卡库打开慢 / 滚动卡顿
可能原因：一次性渲染全部字卡（1408 张）
修复方案：已改为 renderIncremental 无限滚动（首批 150 张 + 每次追加 100 张），哨兵 + IntersectionObserver 触发

（十八）字卡列表按钮失效
可能原因：事件委托的 closest 选择器不匹配，或 dataset.realIndex 读取失败
排查方法：确认 createCardItem 设置了 dataset.index / dataset.realIndex；确认 bindCardListEvents 的 closest 选择器与按钮 class 一致

（十九）全量备份不含群聊数据
可能原因：备份版本为 v1.0（群聊功能上线前导出），或 data-manager.js 缺少群聊收集逻辑
排查方法：确认 collectAllData 含 groupChats 字段与 group_<id> 消息键；旧备份用 v1.1 代码恢复仍兼容


十四、设计决策记录

（一）通用字卡库的定位
通用字卡库是所有联系人共享的基底，单人库是特定联系人的增量。回复时两者合并使用，通用库屏蔽影响所有联系人，单人库屏蔽仅影响该联系人。

（二）重复检测的严格模式
在单人库中添加文字字卡时，如果内容已在通用库中存在，则禁止添加，并通过轻提示告知用户。Emoji 和表情包不进行通用库重复检测。

（三）删除联系人时的数据清理
删除联系人时，同时删除该联系人的字卡库（cardData_{联系人ID}）和消息记录（messages_{联系人ID}）。

（四）记住上次选择的库
关闭字卡库弹窗后，再次打开默认回到上次选择的库（存储于 localStorage 的 cardLib_lastSelected）。

（五）库切换的联动机制
主字卡库弹窗与管理分组弹窗各自独立维护下拉菜单，但共享同一个 cardLib_lastSelected 存储值。切换库时，两个下拉菜单的标签文字同步更新。

（六）刷新恢复联系人的机制
contact.js 只管理内存状态，不干预 localStorage 的读取。start.js 负责从 localStorage 恢复状态，是唯一读取存储并初始化内存的地方。两个层级职责分离，避免循环依赖。

（七）存储方案的选择
项目原使用 localStorage，因容量限制迁移到 IndexedDB。迁移采用「全新开始」方案，不保留旧数据。IndexedDB 使用异步 API，所有上层调用需加 await。

（八）存储空间提醒的设计
不频繁打扰用户，仅在必要时提醒。85%~95% 每24小时提醒一次，95% 以上每次都提醒。使用 Toast 轻提示，不打断用户操作。

（九）引用跳转的实现
点击引用窗格滚动到原消息位置，使用 scrollIntoView({ block: 'center', behavior: 'smooth' })。原消息被删除时显示 Toast 提示。高亮采用边框发光效果。

（十）日期分隔线的设计
采用 flex 布局：左横线（flex:1）+ 文字 + 右横线（flex:1）。无毛玻璃背景，左右横线各占一半，文字居中。文字颜色与主题保持一致。

（十一）消息分页加载的设计
首次加载 20 条最新消息，滚动到顶部触发加载更早消息。增量插入 + 滚动位置保持，确保用户滚动体验流畅。加载完成前有 1 秒冷却防止频繁触发。

（十二）数据保存的核心原则
任何保存操作都必须基于 IndexedDB 中的完整数据，不能基于 allMessages（分页数据）。引用跳转只是「查看」操作，不应触发任何保存。

（十三）引用跳转加载范围
引用跳转时加载「从目标所在页到最新页」的所有消息，不加载比目标更早的消息。跳转后保留向上加载更早消息的能力。

（十四）引用高亮方式
改用固定位置的黑色小箭头替代绿光高亮动画。箭头基于气泡元素本身定位，使用 scrollend 事件等待滚动完全停止后显示，位置永远准确。

（十五）进度条同步策略
进度条必须与真实加载进度挂钩。在 95% 处等待消息加载完成，完成后走完最后 5%。使用 requestAnimationFrame + 队列驱动动画，确保平滑无回退。

（十六）无限滚动 vs 虚拟列表
字卡条目高度不固定（.card-item 为 height:auto，文字可换行），虚拟列表要求固定行高，无法直接应用；因此选择无限滚动（增量渲染）方案：首批 150 张 + 滚动追加 100 张，配合哨兵与 IntersectionObserver。

（十七）缓存命中保留 observer
renderCardList 的 renderedState 缓存命中时直接 return，此时不清 observer、不移哨兵——用户重开弹窗后能续接滚动位置继续加载，避免重复加载已渲染内容。

（十八）管理模式状态用 class 表达
checkbox、selected、manage-mode 等全部由 CSS class 控制，切换状态只需 toggle class，无需重建 DOM。既避免滚动跳动，又提升点选响应速度。

（十九）群聊数据备份的设计
全量备份 / 恢复必须覆盖群聊（列表 + 消息），与联系人数据同等对待。群聊消息复用 messages store，contactId 用 'group_<id>' 字符串隔离，与联系人的数字 id 天然区分。恢复时群聊成员按 idMap 映射并过滤无效成员，保证新增模式下联系人改名换 ID 后群聊依然正确对应。备份版本向后兼容，旧备份不因新字段缺失而恢复失败。

（二十）字卡库切换的渲染缓存必须含库标识
renderCardList 的 renderedState 缓存 key 必须包含当前字卡库（currentLib）。原因：切换字卡库只改 cardLib_lastSelected，不会递增 cardDataVersion；若标签页/分组/搜索词均未变，缓存 key 与上次一致会命中缓存直接 return，导致界面残留上一个字卡库的字卡（Bug：通用库切到联系人【夏以昼】后，分组【全部】仍显示通用字卡）。修复：缓存 key 由「标签页|分组|搜索词」改为「标签页|分组|搜索词|字卡库」，并在缓存判断前 await getCurrentCardLib()。

（二十一）联系人/聊天室备份的数据约定
数据管理弹窗的"联系人备份"升级为"联系人/聊天室备份"，功能上支持群聊的导出/导入。要点：
1. 备份下拉用 optgroup 分组：联系人组 value 为 'c:<id>'，聊天室组 value 为 'g:<id>'（与删除聊天记录下拉的 'c:'/'g:' 前缀约定一致），displayName 用 getGroupName()（群聊无独立字卡库，始终显示"·字卡库 0 张"）。
2. 导出格式按类型区分：联系人导出 type:'single_contact'（含 contact、cardData、messages），聊天室导出 type:'single_group'（含 group、messages），文件名分别为 联系人_<name>_日期.json / 聊天室_<name>_日期.json。
3. 导入兼容两种类型：single_group 导入时先按 data.group.id 查 getGroupChatById 判断是否存在——存在则弹冲突弹窗（标题按类型显示"检测到聊天室<名字>已存在"），不存在直接新增；新增模式下聊天室重名自动加 (1)(2) 后缀并分配新 ID（与联系人新增一致）。
4. doImportGroup 消息落库复用 messages store，storageId 为 'group_<id>'：覆盖模式 saveMessages 直替，新增模式 mergeMessages 按消息 id 去重合并。
5. 冲突弹窗的两个选项 label（新增模式/覆盖模式）文字 16px，说明小字 12px。
6. 注意：群聊消息的 storageId 依赖 group.id，导入"新增"时 group.id 被重新分配，必须用分配后的 targetId 拼 storageId 存消息，否则消息会写到错误的位置。
7. 聊天室无独立字卡库，备份信息列表不显示"·字卡库 0 张"条目：updateContactBackupInfo 的 isGroup 分支将 contactBackupCards.style.display 置 'none'，联系人/空值分支恢复 ''（切换回联系人时自动恢复显示）。

（二十二）全量导入后群聊成员保留（2026-08-16）
背景：用户全量导入 ZIP 后，聊天室（群聊）的成员信息全部消失。排查结论与修复：
1. 排查过程：备份 ZIP（v1.1）中 groupChats.memberIds 是完整的（快乐小分队 5 人、未命名群聊 3 人、单人聊天室 2 人，均为数字 Int64 类型）；三种导入模式（无冲突新增/冲突新增/冲突覆盖）在正确数据下均能保留成员；真实 ZIP 覆盖导入可完整恢复成员。
2. 根因：importGroupChatData（data-manager.js）原逻辑会"去重 + getContactById 过滤无效成员"——一旦成员 id 与联系人 id 短暂不匹配（导入顺序、新增模式 idMap 映射、旧数据、字符串/数字类型不一致），成员会被全部清空并持久化；restoreGroupChatOnStartup（group-chat.js）启动时也会过滤 contactExists 并在成员数变化时 saveGroupChat 持久化清空。
3. 修复：
   ① importGroupChatData 改为只做 idMap 映射 + 去重，不再用 getContactById 过滤丢弃成员 id，即使对应联系人已删除也保留成员（显示时由 getCurrentGroupMembers 跳过不存在的联系人）。
   ② restoreGroupChatOnStartup 不再过滤/持久化清空成员，保留全部 memberIds。
4. 验证：真实 ZIP 覆盖导入后，快乐小分队 5 人、未命名群聊 3 人、单人聊天室 2 人全部保留；刷新页面后成员不消失。
5. 注意：联系人 id 为数字(Int64)，getContactById 严格 === 比较，字符串 memberIds 会导致成员查不到被清空——测试时勿用真实群聊 id，用临时段（99xxx/9955xxx）。

（二十三）全量备份含装扮设置（2026-08-16）
背景：用户要求"全量备份也要备份用户的头像、背景图、自定义色盘等"。排查确认：头像备份（assets/avatar_<id>.png、assets/user_avatar.png）原本就有；真正缺失的是 appState.dressUp 装扮设置（主题色/自定义色盘/玻璃效果/各对象背景图/时间戳颜色/群名颜色）。
1. 数据模型（dressUp 存 appState key 'dressUp'）：
   - { themeColor, customThemeColors[], customTimestampColors[], customGroupNameColors[], glass{header,message,bottom}, single{scope,objects}, group{scope,objects} }
   - single.objects key = 'common' | String(contactId)，group.objects key = 'common' | String(groupId)
   - 每个对象 { backgroundImage, timestampColor, groupNameColor(仅group), recentBackgrounds[] }；backgroundImage/recentBackgrounds 项均为 dataURL 字符串，recentBackgrounds 最多 5 张
2. 备份（data-manager.js collectAllData + fullBackup）：
   - collectAllData 返回值新增 dressUp 字段（getFromStore('appState','dressUp')）
   - fullBackup 调 extractDressUpToZip：把 single/group 所有对象的 backgroundImage 和 recentBackgrounds dataURL 提取为 ZIP 独立文件 assets/dressup_<tab>_<key>_bg.<ext> 与 _recent<i>.<ext>，data.json 中对应字段用 '__DRESSUP__:<路径>' 占位符（避免 JSON 过大，防 2MB+ 字符串）；ext 按 MIME 判断（image/jpeg→jpg，否则 png）
   - 占位符是 'data:image' 开头的才提取；非图片/脏数据（如 data:application/octet-stream）不匹配则保持原样（不改动）
3. 恢复（doFullRestore 冲突分支与无冲突分支均调用 restoreDressUpFromZip）：
   - 解析 '__DRESSUP__:' 占位符 → zip.file(path) 读 blob → dressUpFileToDataURL 按扩展名构造正确 MIME（jpg/jpeg→image/jpeg，否则 image/png）→ new Blob([blob],{type:mime}) → blobToDataURL 回填
   - 单人 objects 的 key 是联系人 id，新增模式下按 idMap 映射（'common' 不映射，数字 key 用 parseInt+idMap）
   - 写回 putToStore('appState',{key:'dressUp',value:out})，调 loadDressUpSettings() 应用
   - 旧备份（08-16 16:31 及更早）无 dressUp 字段 → data.dressUp undefined → 返回 false 不报错（兼容）
4. MIME 污染教训（重要）：
   - JSZip 的 file.async('blob') 返回的 blob 默认 MIME 是 application/octet-stream（丢失原图片 MIME）；直接 blobToDataURL 会把 'data:application/octet-stream;base64,...' 写入数据库 → dress-up.js 的 startsWith('data:image') 判断失效（背景图无法应用）
   - 曾用旧版 restoreDressUpFromZip 污染了用户真实数据（10 个背景图字段全是 octet-stream 前缀）——已通过 base64 魔数修复（/9j/ → image/jpeg，iVBOR → image/png，R0lGOD → image/gif，UklGR → image/webp）
   - 教训：从 ZIP 还原 dataURL 必须按扩展名手动构造 MIME；测试会污染真实数据，测试前应备份当前 dressUp（window.__dressUpBackup）
5. 验证：完整链路（collectAllData→extract→restore）restored:true、10 个 ZIP 文件、恢复后全部 data:image/jpeg；端到端（改 themeColor→#ff0000→doFullRestore→恢复 #4a90d9、背景图 385595 字符完整、时间戳 #f5b942、群名 #7bc950、色盘 1 个、玻璃全开）；UI 应用（.chat-container 有 dressup-bg-full 类 + url(data:image/jpeg) 背景、cover 模式）
6. 注意：doFullRestore 冲突分支是异步回调式（showConflictOptions 触发后立即 return），测试需等待恢复完成再验证；loadDressUpSettings() 无返回值（只应用+刷新 UI），验证用 currentSettings 或 DOM 计算样式

（二十四）群聊名称颜色自选空提示换行修复（2026-08-16）
现象：装扮弹窗 → 群聊 Tab → 多人聊天名称颜色 → 自选区空提示"还没有自选的颜色，点下面色盘选一个吧～"竖排换行约 10 次，其它自选提示（主题色/时间戳颜色）都正常单行。
根因：`#groupNameCustomColorGrid`（style.css ~7639）为与内置色块一致被设为 `display:grid; grid-template-columns: repeat(12, 1fr)`，而空提示是直接 append 进 grid 的 span，被当作单个 grid item 塞进第 1 列（约 24px 宽），长文本在窄列内被拆成 10 行（实测 w=24 h=260）。其它自选容器（customColorGrid/customTimestampColorGrid）默认 `.custom-color-grid` 是 flex 布局，span 独占一行不换行。
修复：`#groupNameCustomColorGrid .custom-color-empty { grid-column: 1 / -1; width: 100%; }`——空提示横跨全部 12 列占满整行。
验证：修复后空提示 338×26 单行（gridColumn 1 / -1）；有自选颜色时色块正常（24×24，12 列 grid 不受影响）；还原空态提示仍单行。
经验：grid 容器里塞"跨整行的提示/说明元素"必须显式 `grid-column: 1 / -1`，否则会被塞进单列窄格拆行。

（二十五）头像 MIME 污染修复 + 备份头像恢复（2026-08-16）
现象：用户重置数据导入最新 ZIP 后，自己和联系人的头像全部变成默认灰色人头。
根因链：
1、`restoreAvatarsFromZip`（js/data-manager.js）恢复头像时直接 `blobToDataURL(blob)` 处理 JSZip 的 blob——JSZip 的 `file.async('blob')` 返回的 blob MIME 是 `application/octet-stream`（丢失原图片 MIME），于是写入数据库的 dataURL 变成 `data:application/octet-stream;base64,...`，浏览器无法渲染（显示空白/灰头像）。
2、`fullBackup` 备份头像时用 `avatar.startsWith('data:image')` 判断是否为图片——被污染的 octet-stream 前缀不通过判断，导致头像永远不进备份 ZIP。
3、于是"重置 + 导入最新 ZIP"后头像字段缺失 → 显示默认灰色人头。
修复（js/data-manager.js）：
1、新增 4 个辅助函数：
   - `isImageDataUrl(dataUrl)`：兼容污染前缀判断——`data:image` 开头直接 true；否则取 base64 用魔数判断（JPEG /9j/、PNG iVBORw0KGgo、GIF R0lGOD、WebP UklGR）
   - `dataUrlImageExt(dataUrl)`：按 MIME/魔数返回扩展名（jpg/webp/gif/png）
   - `fixImageDataUrlMime(dataUrl)`：仅当 `data:application/octet-stream` 前缀时按魔数修正为正确的 `data:image/*`，非污染原样返回
   - `zipFileToDataURL(file, path)`（async）：按 ZIP 内扩展名构造正确 MIME → `new Blob([blob], {type: mime})` → blobToDataURL → 最后 fixImageDataUrlMime 兜底
2、`fullBackup` 头像备份改用 `isImageDataUrl` 判断 + `fixImageDataUrlMime` 转 blob + `dataUrlImageExt` 定扩展名（备份文件 assets/avatar_<id>.<ext>、assets/user_avatar.<ext>）
3、`restoreAvatarsFromZip` 改用 `zipFileToDataURL` 恢复（按扩展名构造 MIME），联系人扩展名数组支持 png/jpg/jpeg/webp/gif
4、数据库中已污染的 5 个头像字段（用户 + 夏以昼/祁煜/秦彻/黎深，base64 数据完整仅前缀错误）用 `fixImageDataUrlMime` 修复写回。
验证：备份 ZIP 现在包含 4 个联系人头像 + 用户头像；清空头像后从 ZIP 恢复（覆盖模式）头像全部回来且为干净的 `data:image/png`；刷新后界面头像正常渲染（naturalWidth 180）。
经验：
1、JSZip blob MIME 丢失是反复出现的坑（此前 dressUp 背景图 10 个字段也污染过）：从 ZIP 还原 dataURL 必须按扩展名手动构造 MIME，不能直接 blobToDataURL。
2、备份判断必须兼容污染前缀（用魔数），否则被污染的数据永远无法备份。
3、修复函数 fixImageDataUrlMime 也要在 restore 路径兜底（zipFileToDataURL 已加），防止旧 ZIP 再次污染。

（二十六）清理脏数据：空名群聊（2026-08-16）
现象：用户重置导入后，聊天室管理面板出现一个空名群聊「群聊」（3 位成员），其中 2 位成员的联系人 ID（1786422998567、1786423237646）已不存在，只有「系统」有效，无聊天记录，创建于 8 月 14 日。
判断：非测试残留（8 月 14 日创建，早于当天全部测试），为历史导入后遗留的失效群聊（与"导入后聊天室成员消失"同源）。
处理：经用户确认后删除（deleteGroupChat(1786696073904)），该群无消息记录无需清理 messages。
验证：删除后群聊剩 2 个（快乐小分队 5 人、夏以昼单人聊天室 2 人），appState 无 currentGroupId 残留。
附：appState.cardLib_lastSelected 指向不存在的联系人卡片（contact_1786869497029）——无害，getCurrentCardLib() 有自动回退通用库逻辑，未处理。
附：2026-08-16 当天测试（头像修复/备份/恢复）确认无数据库残留；localStorage 仅有弹窗尺寸、手风琴状态等 UI 记忆属正常。

（二十七）单聊天室备份导入成员联系人修复（2026-08-16）
现象：用户实测——导出「快乐小分队」聊天室 → 新开网页（仅手动新建联系人 111）→ 从数据管理弹窗→联系人/聊天室备份导入 → 聊天室新建成功、聊天记录完整，但：①联系人头像全灰 ②联系人管理里只有 111，成员联系人未创建。
根因：单聊天室备份 JSON（type:'single_group'，旧版 version '1.0'）只含 {group, messages}，不含成员联系人数据；doImportGroup 只 saveGroupChat + saveMessages，不创建联系人。导入后 group.memberIds 仍是原环境联系人 id，目标环境查不到 → getGroupMessageAvatar 返回 null（灰色人头）、getCurrentGroupMembers 过滤掉成员；但消息对象里已存 senderName，所以名字能显示。
修复（js/data-manager.js）：
1、导出端（exportContact 聊天室分支）：version 升为 '1.1'，新增 members 字段——collectGroupMembers(group) 遍历 memberIds 用 getContactById 收集成员完整数据（含头像 dataURL，与单联系人导出一致内嵌 JSON）。
2、导入端（doImportGroup 开头）：importGroupMembers(data.members)——缺失的联系人按原 id 新增（保留 id 以匹配消息 senderId，群聊 memberIds 也无需改写）；已存在的跳过不覆盖；名字被占用自动重命名（如 夏以昼(1)）。返回新增数量，toast 追加显示「新增成员 N 位」。
3、版本兼容：importContact 校验改为接受 '1.0' 和 '1.1'，旧备份文件（无 members 字段）仍可正常导入。
验证（Playwright 模拟用户场景，备份-恢复保护用户数据）：导出数据含 5 名成员 → 清库只留 111 → 导入 → 5 名成员全部创建（4 名带头像，沈星回原就无头像），聊天室新建、memberIds 保留、183 条消息完整，消息全部 senderId 能匹配到联系人（getGroupMessageAvatar 返回头像）。toast 显示「新增成功…新增成员 5 位」。测试后用户数据完整恢复（5 联系人/3 群聊/1110 条消息）。
经验：
1、单聊天室备份与全量备份的关键区别——全量备份（ZIP）会创建全部缺失联系人（doFullRestore + idMap），单聊天室备份此前从不含成员数据。
2、contact.js 的联系人是内存数组（loadContactsFromStorage 从库加载），测试时清库必须同步调 loadContactsFromStorage()，否则 getContactById 基于旧内存数组误判「已存在」。
3、消息 senderName 存在消息对象上（渲染直接取），头像按 senderId 实时查联系人——所以成员联系人缺失时「名字正常、头像全灰」。

（二十八）JSZip 本地化（2026-08-16）
现象：用户在 Edge 浏览器打开网站，控制台报错——`Tracking Prevention blocked access to storage for https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`（连续多条）。
根因：Edge 的跟踪防护（Tracking Prevention）拦截 cdnjs.cloudflare.com 第三方 CDN 的存储访问，导致 JSZip（全量备份导出/恢复的依赖库）加载受阻。JSZip 之前一直从 CDN 引入（index.html head 内 script）。
修复：
1、下载 jszip.min.js（v3.10.1，97KB）到本地 `js/vendor/jszip.min.js`
2、index.html 改为 `<script src="js/vendor/jszip.min.js"></script>`，彻底摆脱 CDN 依赖（离线可用、不被拦截）
3、Google Fonts 链接保留原样（style.css 第 68 行字体栈含后备字体，加载失败自动回退系统字体，不影响功能）
验证：硬刷新后页面加载 `file:///.../js/vendor/jszip.min.js`，window.JSZip 可用（version 3.10.1），new JSZip().generateAsync({type:'blob'}) 成功产出 ZIP。
经验：纯本地 file:// 应用应避免任何 CDN 依赖——CDN 可能被跟踪防护拦截、离线不可用；第三方库一律下载到本地 vendor 目录。

文档结束
