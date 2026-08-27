/**
 * 弹窗置顶管理 modal-focus.js
 * 负责：多个弹窗同时打开时的层级（z-index）管理
 * 1. 弹窗打开（移除 hidden 类）时自动置顶 → 新点开的弹窗永远在最上面
 * 2. 点击任意弹窗时该弹窗置顶 → 即使被其他弹窗的遮罩盖住，也能透过遮罩点到下层弹窗盒子并把它提到最前
 */
(function () {
    // 覆盖全部弹窗容器的选择器（与 index.html 中各弹窗的 class 保持一致）
    var MODAL_SELECTOR = [
        '.modal',                 // initModal
        '.avatar-modal',          // 头像上传弹窗
        '.confirm-modal',         // confirmModal / groupRenameModal
        '.img-preview-modal',     // imgPreviewModal 大图预览
        '.card-modal',            // cardModal 字卡库
        '.card-sub-modal',        // manageGroup / addGroup / addCard / editCard / editGroup / groupChat / groupManage / groupMember
        '.contact-manager-modal', // contactManagerModal 联系人管理
        '.settings-modal'         // settingsModal 聊天设置 / dataManagerModal 数据管理 / dressUpModal 装扮
    ].join(', ');

    // z-index 递增起点：高于所有静态弹窗层级（最高 --z-modal-tip: 4000、toast 5000），且远低于 99999（toast 提示等常驻浮层）
    var zTop = 5100;

    /** 把指定弹窗提升到最前（隐藏中的弹窗不提升） */
    function bringModalToFront(modal) {
        if (!modal || !modal.classList || modal.classList.contains('hidden')) return;
        zTop += 1;
        modal.style.zIndex = String(zTop);
    }
    window.bringModalToFront = bringModalToFront;

    /**
     * 找到鼠标坐标点上"最上层的弹窗盒子"（跳过遮罩背景本身），返回其所属弹窗容器。
     * 说明：elementsFromPoint 会返回坐标点上的所有元素（含被遮挡的），
     * 因此点击被上层遮罩盖住的下层弹窗时，也能找到下层弹窗的盒子。
     */
    function findTopBoxModalAt(x, y) {
        var els = document.elementsFromPoint(x, y);
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el || !el.closest) continue;
            var modal = el.closest(MODAL_SELECTOR);
            if (!modal) continue;
            // 命中的是遮罩背景本身（el === modal）时跳过，继续找被盖住的下层弹窗盒子
            if (el === modal) continue;
            return modal;
        }
        return null;
    }

    function initModalFocus() {
        var modals = document.querySelectorAll(MODAL_SELECTOR);

        // 1) 弹窗打开（hidden 类被移除）时自动置顶
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    var el = m.target;
                    if (!el.classList.contains('hidden') && el.matches(MODAL_SELECTOR)) {
                        bringModalToFront(el);
                    }
                }
            });
        });
        modals.forEach(function (modal) {
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        });

        // 2) 点击任意弹窗（含被遮罩盖住的下层弹窗盒子）时置顶
        document.addEventListener('mousedown', function (e) {
            var modal = findTopBoxModalAt(e.clientX, e.clientY);
            if (modal) bringModalToFront(modal);
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModalFocus);
    } else {
        initModalFocus();
    }
})();
