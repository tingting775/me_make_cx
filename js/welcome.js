/**
 * 欢迎界面模块 welcome.js —— 动态粒子次元门 + 脉冲进度条
 */

/* DOM 元素 */
const welcomeScreen = document.getElementById('welcome-screen');
const canvas = document.getElementById('gate-canvas');
const ctx = canvas.getContext('2d');
const pulseFill = document.getElementById('pulseFill');
const pulsePercent = document.getElementById('pulsePercent');

/* Canvas 尺寸自适应 */
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* 粒子系统 */
const colors = ['#a78bfa', '#67e8f9', '#f472b6', '#c4b5fd', '#34d399', '#fbbf24'];
const particles = [];

/** 初始化三圈环绕粒子（随机角度、半径、速度、颜色） */
function initParticles() {
    // 全局速度倍率（1.2 倍速）
    const speedMultiplier = 1.2;
    const trackCount = 3;
    for (let t = 0; t < trackCount; t++) {
        const radiusBase = 120 + t * 60;
        const count = 20 + t * 4;
        const speedBase = (0.006 + t * 0.003) * (t % 2 === 0 ? 1 : -1) * speedMultiplier;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = radiusBase + (Math.random() - 0.5) * 20;
            particles.push({
                radius: radius,
                angle: angle,
                speed: speedBase * (0.8 + Math.random() * 0.4),
                size: 1.5 + Math.random() * 3.5,
                color: colors[Math.floor(Math.random() * colors.length)],
                offsetX: (Math.random() - 0.5) * 30,
                offsetY: (Math.random() - 0.5) * 30,
                alpha: 0.6 + Math.random() * 0.4
            });
        }
    }
}
initParticles();

/* 次元门动画 */
let animationId = null;
let time = 0;

/** 逐帧绘制次元门：中心光晕、双层发光环、环绕粒子、底部反射 */
function drawGate(timestamp) {
    time = timestamp || 0;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxDim = Math.min(canvas.width, canvas.height);
    const baseRadius = maxDim * 0.18;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 中心光晕
    const pulse = Math.sin(time / 1500) * 0.15 + 0.85;
    const glowRadius = baseRadius * 1.2 * pulse;

    for (let i = 3; i >= 0; i--) {
        const r = glowRadius * (1 - i * 0.25);
        const alpha = 0.12 - i * 0.025;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(167, 139, 250, ${alpha + 0.08})`);
        grad.addColorStop(0.5, `rgba(103, 232, 249, ${alpha})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 发光环
    const ringRadius = baseRadius * 1.1 + Math.sin(time / 2000) * 10;
    ctx.save();
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = `rgba(167, 139, 250, ${0.4 + Math.sin(time / 1500) * 0.15})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 12]);
    ctx.lineDashOffset = -time / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 第二层环
    const ringRadius2 = baseRadius * 0.85 + Math.cos(time / 1800) * 8;
    ctx.save();
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = `rgba(103, 232, 249, ${0.3 + Math.sin(time / 2000 + 1) * 0.1})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 16]);
    ctx.lineDashOffset = time / 80;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 粒子
    particles.forEach(p => {
        p.angle += p.speed;
        const x = cx + Math.cos(p.angle) * p.radius + p.offsetX;
        const y = cy + Math.sin(p.angle) * p.radius + p.offsetY;
        const sizePulse = 1 + Math.sin(time / 1000 + p.angle) * 0.3;
        const size = p.size * sizePulse;
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
        ctx.globalAlpha = p.alpha * (0.8 + Math.sin(time / 800 + p.angle) * 0.2);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 底部光晕反射
    const grad2 = ctx.createRadialGradient(cx, cy + baseRadius * 1.5, 0, cx, cy + baseRadius * 1.5, baseRadius * 0.8);
    grad2.addColorStop(0, 'rgba(167, 139, 250, 0.06)');
    grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(cx, cy + baseRadius * 1.5, baseRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();

    animationId = requestAnimationFrame(drawGate);
}

drawGate(0);

/* 进度更新 */
let loadComplete = false;
let progressQueue = [];
let isProgressAnimating = false;

/** 更新进度条目标值（完成加载后只接受 100） */
function updateProgress(value) {
    const newTarget = Math.min(100, value);
    // 如果已经完成加载，且目标是 100，直接设置
    if (loadComplete && newTarget === 100) {
        pulseFill.style.width = '100%';
        pulsePercent.textContent = '100%';
        pulsePercent.style.textShadow = '0 0 40px rgba(167, 139, 250, 0.6), 0 0 80px rgba(103, 232, 249, 0.3)';
        return;
    }
    // 如果已经完成加载，忽略所有非 100 的更新
    if (loadComplete) return;

    // 添加到队列
    progressQueue.push(newTarget);

    // 如果已经在动画中，等待当前动画完成
    if (isProgressAnimating) return;

    // 开始处理队列
    processProgressQueue();
}

/** 依次处理进度队列：取最新目标值，做 250ms 缓动动画 */
function processProgressQueue() {
    if (progressQueue.length === 0) {
        isProgressAnimating = false;
        return;
    }

    isProgressAnimating = true;

    // 取队列中最后一个值（跳过中间值，直接到最新目标）
    const target = progressQueue[progressQueue.length - 1];
    // 清空队列
    progressQueue = [];

    // 获取当前实际显示的值
    const startValue = parseFloat(pulseFill.style.width) || 0;
    const targetValue = Math.min(100, target);

    // 如果目标值小于当前值，忽略（防止回退）
    if (targetValue < startValue) {
        isProgressAnimating = false;
        processProgressQueue(); // 继续处理队列
        return;
    }

    // 开始动画
    const startTime = performance.now();
    const duration = 250;

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startValue + (targetValue - startValue) * eased;

        const rounded = Math.round(current);
        pulseFill.style.width = current + '%';
        pulsePercent.textContent = rounded + '%';

        if (rounded >= 100) {
            pulsePercent.style.textShadow = '0 0 40px rgba(167, 139, 250, 0.6), 0 0 80px rgba(103, 232, 249, 0.3)';
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // 动画完成
            pulseFill.style.width = targetValue + '%';
            pulsePercent.textContent = Math.round(targetValue) + '%';
            isProgressAnimating = false;
            // 继续处理队列（如果有新的更新）
            processProgressQueue();
        }
    }

    requestAnimationFrame(animate);
}

/* 加载流程 */

/** 启动加载流程：按阶段推进进度条，最后停在 95% 等待 onWelcomeComplete */
function startLoading() {
    // 阶段 1：初始化 (0% → 15%)
    updateProgress(0);
    setTimeout(() => { if (!loadComplete) updateProgress(8); }, 120);
    setTimeout(() => { if (!loadComplete) updateProgress(15); }, 250);

    // 阶段 2：加载联系人 (15% → 40%)
    setTimeout(() => {
        if (!loadComplete) {
            updateProgress(22);
            if (typeof loadContactsFromStorage === 'function') {
                loadContactsFromStorage();
            }
        }
        setTimeout(() => { if (!loadComplete) updateProgress(32); }, 160);
        setTimeout(() => { if (!loadComplete) updateProgress(40); }, 280);
    }, 280);

    // 阶段 3：加载头像 (40% → 60%)
    setTimeout(() => {
        if (!loadComplete) {
            updateProgress(48);
        }
        setTimeout(() => { if (!loadComplete) updateProgress(55); }, 160);
        setTimeout(() => { if (!loadComplete) updateProgress(60); }, 250);
    }, 580);

    // 阶段 4：加载到 95%，然后执行 onWelcomeComplete
    setTimeout(() => {
        if (!loadComplete) {
            updateProgress(72);
        }
        setTimeout(() => {
            if (!loadComplete) {
                updateProgress(85);
            }
            setTimeout(async () => {
                if (!loadComplete) {
                    updateProgress(95);
                    if (typeof window.onWelcomeComplete === 'function') {
                        await window.onWelcomeComplete();
                        completeLoading();
                    } else {
                        completeLoading();
                    }
                }
            }, 180);
        }, 200);
    }, 850);
}

/** 通知进度条：消息已加载完成，走完最后 5%（由 start.js 在消息加载完成后调用） */
function completeLoading() {
    if (loadComplete) return;

    // 先更新进度到 98%（加入队列）
    updateProgress(98);

    // 再设置完成标志
    loadComplete = true;

    // 等待动画完成后，再跳到 100%
    function waitForAnimation() {
        if (isProgressAnimating) {
            requestAnimationFrame(waitForAnimation);
        } else {
            // 动画已完成，直接设置 100%
            pulseFill.style.width = '100%';
            pulsePercent.textContent = '100%';
            pulsePercent.style.textShadow = '0 0 40px rgba(167, 139, 250, 0.6), 0 0 80px rgba(103, 232, 249, 0.3)';
            setTimeout(() => {
                finishLoading();
            }, 200);
        }
    }
    waitForAnimation();
}

/* 加载完成，进入聊天界面 */

/** 隐藏欢迎界面，进入聊天界面 */
async function finishLoading() {
    // 清除次元门动画循环
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // 隐藏欢迎界面
    welcomeScreen.classList.add('hidden');

    // 存储空间检测（不阻塞界面）
    checkStorageSpaceOnEntry();
}

/** 存储空间检测：使用率超 85% 时提醒备份（95% 以上每天提醒一次） */
async function checkStorageSpaceOnEntry() {
    try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 5 * 1024 * 1024;
        const percent = (usage / quota) * 100;

        if (percent < 85) return;

        const lastWarningTime = localStorage.getItem('lastStorageWarningTime');
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (percent >= 95) {
            showStorageWarning(percent);
            localStorage.setItem('lastStorageWarningTime', String(now));
            return;
        }

        if (percent >= 85 && percent < 95) {
            if (!lastWarningTime || (now - parseInt(lastWarningTime)) > oneDay) {
                showStorageWarning(percent);
                localStorage.setItem('lastStorageWarningTime', String(now));
            }
        }
    } catch (e) {
        console.error('存储空间检测失败：', e);
    }
}

/** 显示存储空间警告（轻提示或 alert 兜底） */
function showStorageWarning(percent) {
    if (typeof showToast === 'function') {
        const level = percent >= 95 ? '⚠️ 紧急：' : '⚠️ 提醒：';
        const message = level + '存储空间已使用 ' + Math.round(percent) + '%，建议立即导出备份以防数据丢失';
        showToast(message);
    } else {
        alert('存储空间已使用 ' + Math.round(percent) + '%，建议立即导出备份以防数据丢失');
    }
}

/* 页面加载完成后自动开始 */
document.addEventListener('DOMContentLoaded', function () {
    // 先设置间距（在加载流程开始前，避免视觉跳跃）
    const title = document.querySelector('.gate-title');
    const progress = document.querySelector('.pulse-progress');
    if (title) title.style.marginBottom = '40px';
    if (progress) progress.style.marginTop = '30px';

    setTimeout(function () {
        startLoading();
    }, 300);
});

/* 加载界面文字样式初始化（青蓝色 + 波浪跳动） */
(function initPulseStatus() {
    const el = document.querySelector('.pulse-status');
    if (!el) return;

    let spans = el.querySelectorAll('span');
    if (spans.length === 0) {
        const chars = el.textContent.split('');
        el.innerHTML = '';
        chars.forEach(function(ch) {
            const span = document.createElement('span');
            span.textContent = ch;
            el.appendChild(span);
        });
        spans = el.querySelectorAll('span');
    }

    const color = 'hsl(190, 80%, 75%)';
    const spacing = 4;

    spans.forEach(function(span, i) {
        span.style.color = color;
        span.style.textShadow = 'none';
        span.style.filter = 'none';
        span.style.opacity = '1';
        span.style.marginRight = spacing + 'px';
        span.style.display = 'inline-block';
        const delay = (i * 0.1).toFixed(1);
        span.style.animation = 'waveJumpFinal 1.2s ease-in-out infinite';
        span.style.animationDelay = delay + 's';
    });

    el.style.animation = 'none';
    el.style.opacity = '1';

    if (!document.getElementById('waveJumpFinal-style')) {
        const style = document.createElement('style');
        style.id = 'waveJumpFinal-style';
        style.textContent = `
            @keyframes waveJumpFinal {
                0%, 100% { transform: translateY(0); }
                30% { transform: translateY(-8px); }
                60% { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
})();

window.completeLoading = completeLoading;
