/* ═════════════════════════════════════════════════════════════════════════
   米白护眼 · 整套皮肤       mf-tavern-skin / index.js
   入口脚本 · v1.1.0（v1.1.0 加「预设面板」模块）
   ─────────────────────────────────────────────────────────────────────────
   这个扩展把「皮肤 + 所有界面改造」收在一处：装它 = 全套外观 + 全套交互。
   样式在 skin.css，这里只放需要 JS 才能做到的事。

   ★ 当前模块
     1. style-guard   把 skin.css 钉在 head 末尾（否则主题自定义 CSS 会盖掉皮肤）
     2. qr-handle     输入框右上角小把手，点它才展开快捷操作浮层
     3. preset-panel  预设面板：参数折叠 + token 总览 + 搜索 + 行内编辑
                      + 查找替换 + 整体替换 + 自动存 + 占比条

   ★ 以后加功能都往这里加，一个模块一个 init 函数，
     最后在 boot() 里调一次，不要另开扩展。

   ★ 模块约定（改任何一边都要同步）
       body.mf-qr-js          → 本脚本已生效（CSS 据此判断走哪套规则）
       #send_form.mf-qr-open  → 快捷面板展开
       #mf-qr-handle          → 把手元素
       #mf-pm-panel           → 预设工具条（列表头 + 搜索）
       #mf-pm-tokboard        → token 总览
       #mf-param-fold         → 参数折叠外壳
       li[data-mf-prev]                                          → 预览行文字（CSS ::after 读）
      .mf-editor                                                → 点开才建的行内编辑器
     CSS 一侧在 skin.css 第 6.1 节（快捷栏）与第 10 节（预设面板）。

   ★ 兜底：本扩展被停用 / 加载失败 → body 上没有 .mf-qr-js
     → skin.css 自动退回"点输入框展开"，快捷按钮不会变成点不动。
     → 预设面板则退回酒馆原生外观（我们只是加装饰，不接管数据）。

   ═══ 预设面板 · 关键事实（都是查源码 + 看真数据得出来的，别凭印象改）═══

   [数据从哪来]
     window.SillyTavern.getContext() 返回的 chatCompletionSettings
     就是酒馆里的 oai_settings（st-context.js 里直接写成
     `chatCompletionSettings: oai_settings`）。
     · prompts        条目数组（**可能有 undefined 空位**，读要跳过）
     · prompt_order   [{character_id, order:[{identifier, enabled}]}]
     · openai_max_context / openai_max_tokens / temp_openai …

   [条目行是运行时生成的，别去改它的结构]
     PromptManager.renderPromptManagerListItems() 生成：
       li.completion_prompt_manager_prompt[data-pm-identifier]
         > span.drag-handle
         > span.completion_prompt_manager_prompt_name[data-pm-name]
         > span > span.prompt_manager_prompt_controls（detach/edit/toggle）
         > span.prompt_manager_prompt_tokens[data-pm-tokens]
     所以本模块的做法是**装饰**（v1.2.0 起纯属性，不动结构）：给 li 写 data-mf-prev，
     占比条；不删不改原生节点，酒馆自己的开关、拖拽、i18n 全都还能用。
     条目的 DOM 一旦被酒馆重排（换预设 / 拖拽 / 开关 / 删条目），
     我们的装饰会消失 → 用 MutationObserver 重新贴一遍（decorate 是幂等的）。

   [token 数字只信酒馆算的]
     行上的 data-pm-tokens 是酒馆分词器算出来的真实值，直接读。
     只有「本行正文被我们改过」才需要用 ctx.getTokenCountAsync 重算，
     算完写进 tokCache。**绝不拿字数估算冒充 token**（预设管理器 #38 的教训：
     估算 9578 vs 真实 7683，差 20%）。

   [保存：两层，都要]
     1) ctx.saveSettingsDebounced()      → 落 settings.json（内存里的当前值）
     2) presetManager.savePreset(名, null, {skipUpdate:true})
        → 落**预设文件**，而且这个重载**不弹 toast**（updatePreset 才弹）。
        不写这一层的话：改完切走预设再切回来，改动就没了。
        —— 这是酒馆原生行为（原生只在点「更新预设」图标时才写文件），
           我们替用户自动做了，所以「停手一秒」就自动存住。
     · 预设名取 presetManager.getSelectedPresetName()；'gui' 是内置默认，跳过。

   [开关 / 拖拽 / 新建：全都交给酒馆自己]
     开关 → 原生 .prompt-manager-toggle-action 的 click（会同步写 prompt_order）
     拖拽 → 原生 jQuery UI sortable（把手 .drag-handle，我们只把它放大）
     新建 → 点原生 footer 最后那个「+」（它会弹酒馆自己的命名框）
     自己重写这三件事 = 一定要处理 prompt_order / identifier 生成 / 重排，
     之前预设管理器就栽在「整体重建 prompts，identifier 全丢」（#12）。

   [插入点（marker）不能编辑，但**必须能拖**]
     酒馆的 chatHistory / worldInfoBefore / charDescription 这些是"位置"，
     本身没有正文，但它们是排序锚点 —— 拖它们才有意义。
     所以只禁编辑、不禁拖、不禁开关（原生允许关掉世界书入口）。
     演示稿里把 marker 锁死是 demo 简化，落地必须放开。

   ★ 踩坑记录（都是真实踩出来的，别重犯）
     · 扩展的 CSS 是启动时插进 head 的 <link>，而主题是**运行中**才 append
       到 head 末尾的 <style>。用户一切主题，我们就被挤到前面 → 失效。
       所以必须有 style-guard。别指望 !important 能全兜住，
       主题里带 !important 的规则一样是按「谁在后面谁赢」。
     · #qr--bar 是「快速回复」扩展运行时生成的，脚本执行瞬间还不存在，
       直接 querySelector 一定拿不到 → 必须轮询挂载。
     · 收起动画用 opacity + pointer-events，不用 display:none，
       否则 transition 不生效（见 skin.css 6.1）。
     · 点外部收起用 capture 阶段监听，避免被别的组件的 stopPropagation 吞掉。
     · 移动端 :hover 会"粘住"，交互一律靠类名 + focus，不靠 hover。
     · #completion_prompt_manager 在 #openai_settings **里面**（st_index.html
       第 2274 行）→ 别把它搬出去，搬出去以后切换 API 时它不会跟着隐藏。
    · 点条目名会触发酒馆自己的「查看」浮窗（prompt-manager-inspect-action
       上直接绑了 click）。要在 list 的 **capture 阶段**拦住，
       冒泡阶段拦晚了 —— 那时目标元素上的处理器已经跑完了。
    · MutationObserver 监听子节点时，自己改 DOM 会再次触发。
      decorate 必须幂等（先判断有没有再建、文本相同就不写），
      否则就是死循环把自己卡死。
    · color-mix() 在 Chrome 97 上不支持，样式一律写死 rgba。

   ★ v1.2.1 的三条（都是真机才看得见的）
     1) «折叠态的 div:not(.range-block) 全隐藏» 这条 CSS 把本扩展自己的
        .mf-pm-panel / .mf-tok-board / .mf-list-foot 也一起收掉了 →
        真机表现：折叠着就"搜索、收起、新建三个按钮集体消失"，总览也没了。
        往 #openai_settings 里加任何 div 都会被它吞，必须显式 :not() 排除。
     2) 展开搜索框靠 max-height 过渡，过渡一旦没跑（元素刚插入 / 后台标签 /
        无头截图），计算值永远是 0px → 点放大镜毫无反应。所以内联高度兜底。
     3) 酒馆 st_promptmanager.css:85-86 给 li 里所有 span span 设了
        opacity:.4 + filter:drop-shadow(0 0 2px black)：
        自绘开关被压成浅灰（读不出开关），铅笔带一圈黑晕。两个都要 !important 清掉。
     4) 250px 下「温度 0.85 · 上下文 200K · 回复 512」一行放不下（要 200px，只剩 124px），
        CSS 截断会把数字切成"上下文 200…"。窄了就换成两行（.mf-2l，阈值 330px）。

   ★ v1.3.0 的两条
     1) 工具栏第四颗按钮 = 锁定拖动。桌面端 sortable 是 handle:null（整行可拖），
        拦 .drag-handle 没用，必须 $(L).sortable('disable')；酒馆每次重画列表
        都会再调 makeDraggable()，所以在 decorateAll 末尾每次都重新贴一遍状态。
        搜索时也一并锁住（只剩几行时拖动会改到看不见的行，顺序=上下文顺序）。
     2) 搜索改成「只留命中行」：不命中的 li 直接 display:none（用 class + !important，
        因为原生 li 的 grid 是 2 个 id 的规则），命中行左侧一道浅黄竖条；
        行摘要从**第一处命中**开始截，不再永远从正文开头截。
   ═════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    if (window.__mfTavernSkin) return;              // 防重复执行

    var VERSION = '1.9.2';
    var APP = window.__mfTavernSkin = { version: VERSION, modules: {} };
    var LOG = '[米白护眼]';

    var head = document.head || document.getElementsByTagName('head')[0];

    function byId(id) { return document.getElementById(id); }

    function svg(paths, vb) {
        return '<svg viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor"' +
            ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 1 · style-guard + 主题接管
       ★ v1.9.1 重写。旧版是「反复把自己挪到 head 末尾」抢顺序，问题是：
         主题每次切换/重绘都会往末尾 append <style id="custom-style">，
         两边来回抢 → 页面上就是 米白 → 报纸 → 米白 → 报纸 连闪三四下
         （用户实测反馈，不是猜的）。
       ★ 新做法：不抢顺序，直接把对方关掉。
         酒馆的 custom_css 有固定 id（st_power.js 的 applyCustomCSS:
         styleId = 'custom-style'），<style> 支持 disabled 属性，
         设 true 后整张表不参与层叠计算 —— 报纸/微信读书一点痕迹都不会留。
         disabled 写在 MutationObserver 回调里，属于渲染前的微任务，
         没有中间态，所以不闪。
       ★ 自己的 link 只钉一次（压 user.css 这一类同优先级规则），之后永不移动。
       ★ 用户关掉整套外观时（mf_skin_on = '0'）这里什么都不做，
         主题原样保留，保证「关 = 完全是酒馆原主题」。
       ═════════════════════════════════════════════════════════════════════ */
    function initStyleGuard() {
        var pinned = false;

        function findSkin() {
            return document.querySelector('link[rel="stylesheet"][href*="mf-tavern-skin"]')
                || byId('mf-skin');
        }

        /* 注意：这里不能用模块 4 里的 rd()/KEY_SKIN —— 模块 1 在模块 4 前面，
           作用域拿不到。直接读 localStorage，key 必须和模块 4 保持一致。 */
        function skinWanted() {
            try { return localStorage.getItem('mf_skin_on') !== '0'; } catch (e) { return true; }
        }

        function muteTheme() {
            if (!skinWanted()) return;
            var ts = document.getElementById('custom-style');
            if (ts && !ts.disabled) ts.disabled = true;
        }

        function pinOnce() {
            if (pinned) return true;
            var node = findSkin();
            if (!node) return false;
            if (head.lastElementChild !== node) head.appendChild(node);
            pinned = true;
            return true;
        }

        /* ★ 开关状态必须在页面加载时也生效：否则「关掉整套 → 重启酒馆」之后
           skin.css 照样会加载，界面会变成「米白配色 + 原生顶栏」的半套状态。
           注意 link.disabled 的语义：true = 停用。 */
        function applyLinkState() {
            var node = findSkin();
            if (!node) return;
            var want = skinWanted();
            if (node.disabled === want) node.disabled = !want;
        }

        function tick() { pinOnce(); applyLinkState(); muteTheme(); }

        tick();
        [80, 260, 900, 2200].forEach(function (t) { setTimeout(tick, t); });

        /* 主题切换 / 导入主题 / 在设置里改自定义 CSS → 都会新建或重建
           #custom-style。这里只处理「新增」，不碰位置，所以不会抖。 */
        try {
            var obs = new MutationObserver(function (list) {
                var touch = false;
                for (var i = 0; i < list.length; i++) {
                    var an = list[i].addedNodes;
                    if (!an) continue;
                    for (var j = 0; j < an.length; j++) {
                        var el = an[j];
                        if (el.nodeType === 1 && (el.id === 'custom-style'
                            || el.tagName === 'STYLE' || el.tagName === 'LINK')) {
                            touch = true;
                        }
                    }
                }
                /* 扩展重载时酒馆会重建 <link>，新节点 disabled 默认 false，
                   不重套一遍开关就会在「已关」状态下把皮肤放出来。 */
                if (touch) { applyLinkState(); muteTheme(); }
            });
            obs.observe(head, { childList: true });
        } catch (e) {
            console.warn(LOG, '样式守护没起来，皮肤可能被主题盖住', e);
        }

        setTimeout(function () {
            if (!findSkin()) {
                console.warn(LOG, 'skin.css 没找到：检查扩展是否启用，或 manifest.json 的 css 字段');
            } else {
                console.log(LOG, '皮肤 v' + VERSION + ' 已就位（主题接管：' + (skinWanted() ? '开' : '关') + '）');
            }
        }, 3000);
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 2 · qr-handle
       输入框右上角的小圆钮：点它展开快捷操作浮层（小剧场 / 删去本轮…），
       点空白处收起。不带它的话，那排按钮要么一直挂着，要么点输入框就弹。

       ★ 为什么非要 JS：CSS 存不住"已展开"这个状态
           :hover         手机不可靠，摸一下粘住
           :focus         输入区里全是 div，没有可聚焦元素
           :focus-within  点 textarea 就触发 —— 正是要去掉的行为
       ═════════════════════════════════════════════════════════════════════ */
    function initQuickReplyHandle() {
        var HANDLE_ID = 'mf-qr-handle';

        function mount() {
            var form = byId('send_form');
            var bar = byId('qr--bar');
            if (!form || !bar) return false;         // 快速回复栏还没生成，下次再试

            if (!byId(HANDLE_ID)) {
                var h = document.createElement('div');
                h.id = HANDLE_ID;
                h.title = '快捷操作';
                h.setAttribute('role', 'button');
                h.innerHTML = svg('<path d="m6 15 6-6 6 6"/>');
                h.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    form.classList.toggle('mf-qr-open');
                });
                form.appendChild(h);
            }

            document.body.classList.add('mf-qr-js');  // 告诉 CSS：脚本活了
            return true;
        }

        // 点别处收起（capture 阶段，防止被其它组件的 stopPropagation 吞掉）
        document.addEventListener('click', function (e) {
            var form = byId('send_form');
            if (!form) return;
            if (form.contains(e.target)) return;      // 面板 / 按钮 / 输入框内部都不收
            form.classList.remove('mf-qr-open');
        }, true);

        // 轮询挂载：#qr--bar 是异步生成的，最多等 60 秒
        var tries = 0;
        var timer = null;
        function tick() {
            tries++;
            if (mount() || tries > 120) {
                if (timer) { clearInterval(timer); timer = null; }
            }
        }
        if (!mount()) timer = setInterval(tick, 500);

        // 快捷回复栏被关掉 / 切到 popout 模式时，把手跟着藏起来
        // ★ 2026-11-05 性能：原来 1000ms 永久空转。改成 2000ms + 后台标签页直接跳过
        setInterval(function () {
            if (document.hidden) return;
            var h = byId(HANDLE_ID);
            if (!h) return;
            h.style.display = byId('qr--bar') ? '' : 'none';
        }, 2000);
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 3 · preset-panel
       预设面板（AI 响应配置）的整套改造。模块头那份说明是这块的说明书。
       ═════════════════════════════════════════════════════════════════════ */
    function initPresetPanel() {
        var LIST_ID = 'completion_prompt_manager_list';
        var ROW = 'li.completion_prompt_manager_prompt';

        var state = {
            q: '',               // 面板级搜索词
            editing: null,       // 正在编辑的 identifier
            undo: null,          // 整体替换的撤销快照
            bulkWhere: 'body',   // 改动范围：body / name / both
            bulkWhich: 'on',     // 改动对象：all / on / off
            locked: false        // v1.3.0：锁定条目顺序（禁止拖动），跨会话记住
        };
        /* 锁定状态存 localStorage：用户锁一次就该一直锁着，
           否则每次刷新酒馆都可能在滑鼠标时把 21 条顺序拖乱（改顺序=改发给 AI 的上下文）。 */
        try { state.locked = localStorage.getItem('mf_pm_locked') === '1'; } catch (e) { }
        var tokCache = {};       // identifier → 真 token（只有被我们改过的行才需要重算）

        /* ── 酒馆桥 ───────────────────────────────────────────────────── */
        /* 不缓存 getContext() 的结果：换预设时酒馆可能整块换掉
           chatCompletionSettings / prompts，缓存 2 秒就会读到上一份。
           这个对象每次重新构造，但里面的 chat / prompts 还是同一批引用，
           调用的频率也不高（一次装饰一次、点一次一次），不值得缓存。 */
        function ctx() {
            try {
                if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                    var c = window.SillyTavern.getContext();
                    if (c && typeof c === 'object') return c;
                }
            } catch (e) { }
            return null;
        }
        function oai() {
            var c = ctx();
            return (c && c.chatCompletionSettings) || null;
        }
        function listEl() { return byId(LIST_ID); }

        function promptMap() {
            var o = oai(), m = {};
            if (!o || !Array.isArray(o.prompts)) return m;
            for (var i = 0; i < o.prompts.length; i++) {
                var p = o.prompts[i];
                if (p && p.identifier) m[p.identifier] = p;
            }
            return m;
        }

        /* ── 文本工具 ─────────────────────────────────────────────────── */
        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function fmt(n) {
            return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        /* ── 归一化搜索（预设管理器 tightMap / findRanges 的同款思路）──
           为什么不能用 indexOf：正文里换行、多打一个空格、全角逗号 vs 半角，
           indexOf 全都搜不到。做法：正文和查询都压成"紧凑串"
           （去空白 + 标点归一 + 小写），在紧凑串里 indexOf 一定准，
           再用映射表把命中位置还原回原文区间。 */
        var PUNCT = {
            '，': ',', '。': '.', '！': '!', '？': '?', '：': ':', '；': ';', '（': '(', '）': ')',
            '「': '"', '」': '"', '『': '"', '』': '"', '“': '"', '”': '"', '‘': "'", '’': "'",
            '、': ',', '—': '-', '－': '-', '…': '.', '·': '.', '～': '~', '《': '<', '》': '>',
            '【': '[', '】': ']', '\u3000': ' '
        };
        function tightMap(s) {
            var out = '', map = [];
            s = String(s == null ? '' : s);
            for (var i = 0; i < s.length; i++) {
                var c = s.charAt(i);
                if (/\s/.test(c)) continue;
                var t = PUNCT[c] || c;
                t = t.toLowerCase();
                for (var k = 0; k < t.length; k++) { out += t.charAt(k); map.push(i); }
            }
            return { t: out, map: map };
        }
        function findRanges(text, q) {
            if (!q || !text) return [];
            var Q = tightMap(q).t;
            if (!Q) return [];
            var M = tightMap(text), res = [], from = 0, idx;
            while ((idx = M.t.indexOf(Q, from)) >= 0) {
                var si = M.map[idx], ei = M.map[idx + Q.length - 1];
                res.push([si, ei + 1]);
                from = idx + Q.length;
            }
            return res;
        }
        function replaceAll(text, q, rep) {
            var R = findRanges(text, q);
            if (!R.length) return String(text == null ? '' : text);
            var out = '', pos = 0;
            for (var i = 0; i < R.length; i++) {
                out += text.slice(pos, R[i][0]) + rep;
                pos = R[i][1];
            }
            return out + text.slice(pos);
        }
        function hlHTML(text, q, cur) {
            var R = findRanges(text, q);
            if (!R.length) return esc(text);
            var out = '', pos = 0;
            for (var i = 0; i < R.length; i++) {
                out += esc(text.slice(pos, R[i][0]));
                out += '<mark' + (i === cur ? ' class="mf-cur"' : '') + '>' +
                    esc(text.slice(R[i][0], R[i][1])) + '</mark>';
                pos = R[i][1];
            }
            return out + esc(text.slice(pos));
        }
        function snipHTML(text, q, max) {
            var R = findRanges(text, q);
            var start = R.length ? Math.max(0, R[0][0] - 14) : 0;
            var seg = text.slice(start, start + max);
            var out = '', pos = 0, segEnd = start + seg.length;
            for (var i = 0; i < R.length; i++) {
                var a = R[i][0], b = R[i][1];
                if (b <= start || a >= segEnd) continue;
                var aa = Math.max(a, start), bb = Math.min(b, segEnd);
                out += esc(text.slice(start + pos, aa)) + '<mark>' + esc(text.slice(aa, bb)) + '</mark>';
                pos = bb - start;
            }
            out += esc(seg.slice(pos));
            return (start > 0 ? '…' : '') + out + (start + seg.length < text.length ? '…' : '');
        }
        /* 命中摘要：以第一处命中为中心截一段【纯文本】。
           li::after 只能吃 attr() 字符串，不能带 <mark>，所以这里不产出 HTML —— 
           定位靠「摘要从命中处开始」，不靠字色。 */
        function hitSnippet(text, at) {
            var s = String(text == null ? '' : text);
            var a = Math.max(0, at - 14), b = Math.min(s.length, at + 46);
            /* 起点落在英文单词中间会截出「…nd {{user}}」这种半截词，往后退到词边界。
               最多退 8 个字符，避免一个超长单词把命中挤到看不见的地方。 */
            for (var n = 0; n < 8 && a > 0; n++) {
                if (!/[A-Za-z0-9_]/.test(s.charAt(a)) || !/[A-Za-z0-9_]/.test(s.charAt(a - 1))) break;
                a--;
            }
            var seg = s.slice(a, b).replace(/\s+/g, ' ').trim();
            return (a > 0 ? '…' : '') + seg + (b < s.length ? '…' : '');
        }

        /* ── toast：有酒馆的 toastr 就用它，没有就自己弹一个 ────────────── */
        function toast(msg) {
            if (window.toastr && typeof window.toastr.info === 'function') {
                try { window.toastr.info(msg); return; } catch (e) { }
            }
            var el = byId('mf-pm-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'mf-pm-toast';
                document.body.appendChild(el);
            }
            el.textContent = msg;
            el.classList.add('on');
            clearTimeout(el._t);
            el._t = setTimeout(function () { el.classList.remove('on'); }, 2400);
        }

        /* ── 保存：settings + 预设文件（两层，见文件头的说明）─────────────
           ① settings：每次停手立刻写（内存 + settings.json，几乎无成本）
           ② 预设文件：再等 1.5 秒没新动作才写。预设文件动辄几百 KB，
              每敲一顿就 POST 一次太浪费；关编辑器 / 删除 / 整体替换时会强制刷一次。 */
        var saveTimer = null;
        var presetTimer = null;
        function saveSoon() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveNow, 900);      // 停手一秒
        }
        function writePresetFile() {
            clearTimeout(presetTimer);
            presetTimer = null;
            var c = ctx();
            if (!c || typeof c.getPresetManager !== 'function') return;
            // 静默：savePreset 这个重载不弹 toast（updatePreset 才弹）
            try {
                var pm = c.getPresetManager('openai');
                if (pm && typeof pm.savePreset === 'function' && pm.getSelectedPresetName) {
                    var nm = pm.getSelectedPresetName();
                    if (nm && nm !== 'gui') {
                        var r = pm.savePreset(nm, null, { skipUpdate: true });
                        if (r && typeof r.catch === 'function') r.catch(function () { });
                    }
                }
            } catch (e) { /* 接口变了也不影响 settings 已存 */ }
        }
        function saveNow() {
            clearTimeout(saveTimer);
            var c = ctx();
            if (!c) return;
            try { if (c.saveSettingsDebounced) c.saveSettingsDebounced(); } catch (e) { }
            clearTimeout(presetTimer);
            presetTimer = setTimeout(writePresetFile, 1500);
        }

        /* ── 让酒馆自己重排列表 ──────────────────────────────────────── */
        function forceRender() {
            var c = ctx();
            try {
                if (c && c.eventSource && c.eventTypes &&
                    c.eventTypes.CHATCOMPLETION_SOURCE_CHANGED) {
                    c.eventSource.emit(c.eventTypes.CHATCOMPLETION_SOURCE_CHANGED);
                    return true;
                }
            } catch (e) { }
            return false;
        }

        /* ═════════════════════════════════════════════════════════════
           一、外壳：token 总览 / 参数折叠 / 工具条
           ═════════════════════════════════════════════════════════════ */
        var foldSumTimer = null;
        function paintFoldSum() {
            var o = oai() || {};
            var el = byId('mf-fold-sum');
            if (!el) return;
            var t = parseFloat(o.temp_openai);
            var ctxLen = parseInt(o.openai_max_context, 10);
            var resp = parseInt(o.openai_max_tokens, 10);
            /* ★ 250px 面板里这一行只有不到 150px 宽，写 2,000,000 会被截成
               "上下文 2,00…"。按设计稿的口径压成 32K / 128K / 512。 */
            function brief(n) {
                if (!isFinite(n)) return '';
                if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';   // 2000000 → 2M
                if (n >= 1000) return (Math.round(n / 100) / 10) + 'K';         // 200000 → 200K
                return String(n);
            }
            var parts = [];
            if (isFinite(t)) parts.push('温度 ' + t.toFixed(2));
            if (isFinite(ctxLen)) parts.push('上下文 ' + brief(ctxLen));
            if (isFinite(resp)) parts.push('回复 ' + brief(resp));
            var txt = parts.join(' · ');
            if (el.textContent !== txt) el.textContent = txt;

            /* 真机左栏 250px：一行放不下三组数字，摘要换行到第二行（CSS .mf-2l）。
               阈值 330 是实测：整串要 ~200px，标题+箭头+内边距 ~110px。 */
            var foldEl = byId('mf-param-fold');
            var cfgEl = byId('ai_response_configuration');
            if (foldEl && cfgEl) foldEl.classList.toggle('mf-2l', cfgEl.clientWidth < 330);
            el.title = '温度 ' + (isFinite(t) ? t.toFixed(2) : '-') +
                ' · 上下文 ' + (isFinite(ctxLen) ? fmt(ctxLen) : '-') +
                ' · 回复 ' + (isFinite(resp) ? fmt(resp) : '-');
        }

        /* ═════════════════════════════════════════════════════════════
           buildShell：按**真实酒馆 DOM** 摆位置（别再凭 demo 猜）
           ─────────────────────────────────────────────────────────────
           真实层级（st_index.html，左栏 AI 响应配置）：
             #ai_response_configuration.flex-container.flexNoGap
               #respective-presets-block        预设选择条
               #common-gen-settings-block       生成量 / 上下文（其它 API 用）
               #respective-ranges-and-temps     ★ 解锁上下文 / 上下文长度 /
                                                  回复长度 / 采样滑杆 都在这里
               #advanced-ai-config-block
                 #openai_settings               一堆高级配置抽屉
                   div.range-block.m-b-1
                     #completion_prompt_manager  ← 列表容器（会被整块重画）

           ★ 之前只把 #openai_settings 的兄弟收进折叠，所以滑杆区
             （#respective-ranges-and-temps）根本没被折叠 —— 用户看到的
             "上面还是裸的" 就是这个原因。

           现在：
             折叠壳挂在 #advanced-ai-config-block 最前面（它 display:block，
             不会被 flex 挤成一条），把「两块兄弟 + #openai_settings 里
             除条目块以外的全部」都搬进去；
             token 总览 / 工具条 / 列表 / 底部按钮 全塞进 #openai_settings，
             顺序 = 折叠 → 总览 → 工具条 → 列表 → 底部。
           ═════════════════════════════════════════════════════════════ */
        function buildShell() {
            var pmHost = byId('completion_prompt_manager');
            var cfg = byId('ai_response_configuration');
            if (!pmHost || !cfg) return false;
            var pmBlock = pmHost.closest('.range-block');
            if (!pmBlock) return false;
            var settings = byId('openai_settings');
            if (!settings) return false;

            /* ① 折叠条：只是一个按钮，一个节点都不搬。
               ★★ v1.2.0：上一版把参数块 appendChild 进自造容器，每次列表重画
                  都要重算，还断开了原生 flex 的父子关系 —— "布局全乱"有一半来自这。
                  现在只切 #ai_response_configuration 上的一个 class，
                  参数块就是 display:none，DOM 结构一个字都不动。 */
            var fold = byId('mf-param-fold');
            if (!fold) {
                fold = document.createElement('button');
                fold.type = 'button';
                fold.className = 'mf-fold';
                fold.id = 'mf-param-fold';
                fold.innerHTML =
                    '<span class="mf-fold-title">生成参数</span>' +
                    '<span class="mf-fold-sum" id="mf-fold-sum"></span>' +
                    '<span class="mf-fold-chev">' + svg('<path d="M6 9l6 6 6-6"/>') + '</span>';
                fold.addEventListener('click', function () {
                    var open = fold.classList.toggle('open');
                    cfg.classList.toggle('mf-collapsed', !open);
                    if (open) paintFoldSum();
                });
                var anchor = byId('common-gen-settings-block') || byId('respective-ranges-and-temps');
                if (anchor && anchor.parentElement === cfg) cfg.insertBefore(fold, anchor);
                else cfg.appendChild(fold);
            }
            cfg.classList.toggle('mf-collapsed', !fold.classList.contains('open'));

            /* ③ token 总览：按设计稿顺序挂在折叠条**上面**（demo 是 ② 总览 → ③ 折叠）。
               ★ v1.2.1：之前插在 #openai_settings 里，被 v1.2.0 的折叠规则
                 （div:not(.range-block) 全部 display:none）连坐隐藏 —— 总览和工具条一起消失。
                 现在挂到 #ai_response_configuration 上，并用 CSS 的 :has(li) 兜住别的 API。 */
            var tb = byId('mf-pm-tokboard');
            if (!tb) {
                tb = document.createElement('div');
                tb.className = 'mf-tok-board';
                tb.id = 'mf-pm-tokboard';
                tb.innerHTML =
                    '<div class="mf-tok-top">' +
                    '<span class="mf-tok-lb">已开启 <b id="mf-tok-on">0</b> / ' +
                    '<span id="mf-tok-all">0</span> 条</span>' +
                    '<span class="mf-tok-num"><b id="mf-tok-sum">0</b> tok</span>' +
                    '</div>' +
                    '<div class="mf-tok-bar"><i id="mf-tok-fill"></i></div>' +
                    '<div class="mf-tok-sub"><span>占上下文 <b id="mf-tok-pct">0%</b></span>' +
                    '<span>·</span><span>只算已开启条目</span></div>';
                tb._mfNew = true;
            }
            // 位置错了就挪一次（insertBefore 是移动，不复制，不会重新下载/丢监听）
            if (tb._mfNew || tb.parentElement !== cfg || tb.nextElementSibling !== fold) {
                tb._mfNew = false;
                cfg.insertBefore(tb, fold);
            }

            /* ④ 工具条：列表头 + 搜索 */
            if (!byId('mf-pm-panel')) {
                var bar = document.createElement('div');
                bar.className = 'mf-pm-panel';
                bar.id = 'mf-pm-panel';
                bar.innerHTML =
                    '<div class="mf-list-head">' +
                    '<span class="mf-t">条目 <b id="mf-pm-count">0</b></span>' +
                    '<div class="mf-list-actions">' +
                    '<button type="button" class="mf-mini-btn" id="mf-pm-find" title="搜索条目（整段、跨行都能搜）">' +
                    svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>') + '</button>' +
                    '<button type="button" class="mf-mini-btn" id="mf-pm-collapse" title="收起展开的条目">' +
                    svg('<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>') + '</button>' +
                    '<button type="button" class="mf-mini-btn" id="mf-pm-add" title="新增条目">' +
                    svg('<path d="M12 5v14M5 12h14"/>') + '</button>' +
                    '<button type="button" class="mf-mini-btn mf-lock-btn" id="mf-pm-lock" title="锁定条目顺序（防止误拖）" aria-pressed="false">' +
                    svg(LOCK_ICON.off) + '</button>' +
                    '</div></div>' +
                    '<div class="mf-find-wrap" id="mf-pm-findwrap">' +
                    '<div class="mf-find-box">' +
                    svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>') +
                    '<input id="mf-pm-findinp" spellcheck="false" placeholder="粘一句整段进去，换行、空格、标点全半角都不影响">' +
                    '<button type="button" class="mf-find-x" id="mf-pm-findclear" title="清空">' +
                    svg('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>' +
                    '</div></div>' +
                    '<div class="mf-find-stat" id="mf-pm-findstat">' +
                    '<span class="mf-fs-main">找到 <b id="mf-fs-row">0</b> 条 <b id="mf-fs-hit">0</b> 处</span>' +
                    '<span class="mf-fs-none">没有条目含这几个字</span>' +
                    '<span class="mf-grow"></span>' +
                    '<button type="button" class="mf-chip go" id="mf-pm-bulktop">整体替换</button>' +
                    '</div>';
                settings.insertBefore(bar, pmBlock);
                bindToolbar();
            }

            /* ⑤ 列表底部：整体替换 / 撤销
               ⚠ 必须在 #completion_prompt_manager **外面**（它会被整块重画） */
            if (!byId('mf-pm-foot')) {
                var foot = document.createElement('div');
                foot.className = 'mf-list-foot';
                foot.id = 'mf-pm-foot';
                foot.innerHTML =
                    '<button type="button" class="mf-chip go" id="mf-pm-bulk" style="display:none">整体替换</button>' +
                    '<button type="button" class="mf-chip" id="mf-pm-undo" style="display:none">撤销上一次替换</button>';
                settings.insertBefore(foot, pmBlock.nextSibling);
                var bu = byId('mf-pm-bulk'), uu = byId('mf-pm-undo');
                if (bu) bu.addEventListener('click', openBulk);
                if (uu) uu.addEventListener('click', function () {
                    if (!state.undo) return;
                    var mp = promptMap();
                    state.undo.forEach(function (s) {
                        var p2 = mp[s.id];
                        if (p2) { p2.name = s.name; p2.content = s.content; }
                    });
                    state.undo = null;
                    uu.style.display = 'none';
                    saveNow();
                    writePresetFile();
                    decorateAll();
                    toast('已撤销');
                });
            }

            /* 折叠条上的摘要不用点开也要有内容。
               ★ v1.2.1：之前只在「点开折叠」和「动滑杆」时才画，
                 首次进面板折叠着 → 右边一片空白（真机上就是"右边啥也没有"）。 */
            paintFoldSum();

            return true;
        }

        /* ═════════════════════════════════════════════════════════════
           v1.3.0 · 锁定条目顺序
           ★ 为什么不能只挡 .drag-handle：桌面端酒馆 makeDraggable() 的配置是
             `handle: isMobile() ? '.drag-handle' : null` —— 电脑上**整行**都能拖，
             光拦把手等于没锁。必须把 sortable 实例 disable 掉。
           ★ 为什么还要在 capture 阶段补一道 pointerdown：酒馆每次重画列表都会
             再调一次 makeDraggable()，实测过 disable 状态会被重置；事件层
             兜住「从把手按下去」这一路，双保险，代价接近 0。
           ★ 搜索时也锁：列表只剩命中的几行，这时拖动会改变「看不见的行」的顺序，
             而顺序就是发给 AI 的上下文顺序 —— 属于看不见的高危操作。
           ═════════════════════════════════════════════════════════════ */
        var LOCK_ICON = {
            /* 闭合锁：已锁定 */
            on: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/>' +
                '<path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/>' +
                '<circle cx="12" cy="15.3" r="1"/>',
            /* 开口锁：可拖动 */
            off: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4"/>' +
                '<path d="M8 10.5V7.6a4 4 0 0 1 7.7-1.4"/>' +
                '<circle cx="12" cy="15.3" r="1"/>'
        };

        function guardDrag(L) {
            if (!L || L._mfGuard) return;
            L._mfGuard = true;
            ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) {
                L.addEventListener(ev, function (e) {
                    if (!state.locked && !state.q) return;      // 没锁：一点不插手
                    var t = e.target;
                    if (!t || !t.closest || !t.closest('.drag-handle')) return;  // 只拦把手
                    e.preventDefault();
                    e.stopPropagation();
                    toast(state.q && !state.locked
                        ? '搜索时不能拖动，清空搜索再拖'
                        : '条目已锁定，点工具栏那把锁解锁');
                }, true);
            });
        }

        function applyLock() {
            var L = listEl();

            var btn = byId('mf-pm-lock');
            if (btn) {
                btn.classList.toggle('on', !!state.locked);
                btn.setAttribute('aria-pressed', state.locked ? 'true' : 'false');
                btn.title = state.locked ? '已锁定：条目拖不动了，点一下解锁' : '锁定条目顺序（防止误拖）';
                var icon = svg(state.locked ? LOCK_ICON.on : LOCK_ICON.off);
                if (btn._mfIcon !== icon) { btn._mfIcon = icon; btn.innerHTML = icon; }
            }

            var lockNow = !!state.locked || !!state.q;
            document.body.classList.toggle('mf-pm-locked', lockNow);
            if (!L) return;
            L.classList.toggle('mf-locked', lockNow);
            guardDrag(L);
            try {
                var $ = window.jQuery;
                if ($ && $(L).data('ui-sortable')) {
                    if (lockNow) $(L).sortable('disable');
                    else $(L).sortable('enable');
                }
            } catch (e) { }
        }

        function bindToolbar() {
            var findBtn = byId('mf-pm-find');
            var wrap = byId('mf-pm-findwrap');
            var inp = byId('mf-pm-findinp');

            if (findBtn) findBtn.addEventListener('click', function () {
                var on = !wrap.classList.contains('on');
                /* ★ 只切 class 不够：展开是靠 max-height 过渡（0 → 120px）实现的，
                   一旦过渡没跑起来（元素刚插入 / 后台标签页 / 无头截图都会这样），
                   计算值就永远卡在 0px —— 表现成"点放大镜毫无反应"。
                   所以内联高度做兜底，class 只负责按钮的选中态。 */
                wrap.style.maxHeight = on ? '200px' : '0px';
                wrap.classList.toggle('on', on);
                findBtn.classList.toggle('on', on);
                if (on) { try { inp.focus(); } catch (e) { } }
                else { inp.value = ''; state.q = ''; closeEditor(); decorateAll(); }
            });

            var t = null;
            if (inp) inp.addEventListener('input', function () {
                clearTimeout(t);
                t = setTimeout(function () {
                    state.q = inp.value.trim();
                    closeEditor();
                    decorateAll();
                }, 180);
            });

            var clr = byId('mf-pm-findclear');
            if (clr) clr.addEventListener('click', function () {
                inp.value = ''; state.q = ''; closeEditor(); decorateAll(); inp.focus();
            });

            var cb = byId('mf-pm-collapse');
            if (cb) cb.addEventListener('click', function () { closeEditor(); });

            var lk = byId('mf-pm-lock');
            if (lk) lk.addEventListener('click', function () {
                state.locked = !state.locked;
                try { localStorage.setItem('mf_pm_locked', state.locked ? '1' : '0'); } catch (e) { }
                applyLock();
                toast(state.locked
                    ? '已锁定：条目不会再被拖乱'
                    : '已解锁：可以拖动条目调整顺序');
            });

            var add = byId('mf-pm-add');
            if (add) add.addEventListener('click', function () {
                // 交给酒馆自己：它会生成 identifier、写 prompt_order、重排
                var foot = byId('completion_prompt_manager_footer') ||
                    document.querySelector('#completion_prompt_manager .completion_prompt_manager_footer');
                var btn = foot && foot.querySelector('.menu_button:last-child');
                if (btn) { btn.click(); }
                else { toast('找不到「新建」按钮，先点列表底部那个 + 试试'); }
            });

            var bulkTop = byId('mf-pm-bulktop');
            if (bulkTop) bulkTop.addEventListener('click', openBulk);
        }

        /* ═════════════════════════════════════════════════════════════
           二、行装饰（幂等：先看有没有，再建；文本没变就不写）
           ═════════════════════════════════════════════════════════════ */
        function roleLabel(r) {
            return r === 'user' ? '用户' : r === 'assistant' ? 'AI' : '系统';
        }
        function previewText(p) {
            var s = String(p.content || '').replace(/\s+/g, ' ').trim();
            if (!s) return '（空）';
            return s.length > 90 ? s.slice(0, 90) + '…' : s;
        }
        function rowTokens(li, id) {
            if (tokCache[id] != null) return tokCache[id];
            var el = li.querySelector('.prompt_manager_prompt_tokens');
            if (!el) return 0;
            var raw = el.getAttribute('data-pm-tokens');
            if (raw == null) raw = el.textContent;
            var n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
            return isFinite(n) ? n : 0;
        }

        function decorate(li, map) {
            var id = li.getAttribute('data-pm-identifier');
            var p = id ? map[id] : null;
            if (!p) {
                /* 认不出内容的行，搜索时也不该留在结果里（否则过滤会漏一两个） */
                if (state.q) li.classList.add('mf-hide');
                return;
            }

            var isMarker = li.classList.contains('completion_prompt_manager_marker');

            /* ★★ v1.2.0：这里只写一个属性，不建任何节点。
               预览行是 li::after { content: attr(data-mf-prev) }，CSS 负责排版。
               上一版在这建 .mf-pm-main 包住名字、插 .mf-pm-preview、再插一颗
               自己画的铅笔按钮 —— 60 多条 × 每次列表重画，两次重排，
               既卡又和原生 grid 抢位置（"字叠字""数字叠按钮"就是这么来的）。 */
            var txt = isMarker ? '拖这行决定位置' : previewText(p);
            if (state.q) {
                var rb = findRanges(p.content || '', state.q);
                var rn = findRanges(p.name || '', state.q);
                if (rb.length) {
                    /* 摘要从第一处命中开始截，而不是永远从正文开头截 ——
                       否则「命中 14 处」后面跟着的还是开头那段，命中在哪照样看不见。 */
                    txt = '命中 ' + rb.length + ' 处 · ' + hitSnippet(p.content, rb[0][0]);
                } else if (rn.length) {
                    txt = '名字命中 · ' + txt;
                }
                /* ★ v1.3.0：搜索时只留命中的行。用户真机反馈「整体搜完完全看不见
                   哪个条目里有这几个字」—— 21 行都给，等于让他自己一行行找。
                   现在一律：命中 → 留（左侧浅黄竖条），不命中 → display:none。 */
                var hit = rb.length + rn.length;
                li.classList.toggle('mf-hit', hit > 0);
                li.classList.toggle('mf-hide', hit === 0);
            } else {
                li.classList.remove('mf-hit', 'mf-hide');
            }
            if (li.getAttribute('data-mf-prev') !== txt) li.setAttribute('data-mf-prev', txt);

            /* 停用行：左侧一根虚线，只加 class */
            li.classList.toggle('mf-off', li.classList.contains('completion_prompt_manager_prompt_disabled'));
        }

        function decorateAll() {
            var L = listEl();
            if (!L) return;
            var map = promptMap();
            var rows = L.querySelectorAll(ROW);

            /* ★ v1.1.3：一行出错不能拖垮整批。
               之前是裸循环，第一行抛异常 → 后面的 token 统计 / 计数全都不执行，
               真机上表现成"条目只有名字、总览 0 tok"，而且控制台没有可读线索。 */
            var firstErr = null;
            /* 清掉上一轮搜索留下的隐藏标记。为什么不能只靠 decorate 的 else 分支：
               decorate 开头有 `if (!p) return`，map 里对不上的行会提前返回，
               残留一个 mf-hide 就永远从列表里消失（用户会以为条目丢了）。 */
            if (!state.q) {
                for (var k = 0; k < rows.length; k++) rows[k].classList.remove('mf-hit', 'mf-hide');
            }
            for (var i = 0; i < rows.length; i++) {
                try { decorate(rows[i], map); }
                catch (e) { if (!firstErr) firstErr = e; }
            }
            if (firstErr) console.warn(LOG, '条目装饰出错（已跳过该行）', firstErr);

            /* 自检：有行但一个 data-mf-prev 都没有，说明 map 没对上 */
            if (rows.length && !L.querySelector('[data-mf-prev]')) {
                console.error(LOG, '条目装饰未生效', {
                    rows: rows.length,
                    mapKeys: Object.keys(map).length,
                    firstRowHTML: rows[0] ? rows[0].outerHTML.slice(0, 400) : null,
                    err: firstErr ? String(firstErr) : null
                });
            }

            /* 原生 footer 被 PromptManager 插在 header 之后 → 跑到列表上面去了。
               每次重画后搬一次，让它当真正的底部工具栏。 */
            var nf = L.parentElement && L.parentElement.querySelector('.completion_prompt_manager_footer');
            if (nf && nf.previousElementSibling !== L) L.parentElement.appendChild(nf);

            var cnt = byId('mf-pm-count');
            if (cnt && cnt.textContent !== String(rows.length)) cnt.textContent = rows.length;

            paintBoard(rows, map);
            paintFindStat(rows, map);
            applyLock();     // 列表被酒馆重画过 → 锁状态要重新贴上去

            // 编辑中的条目如果被酒馆重排掉了，把编辑器补回来
            if (state.editing) {
                var li = rowOf(state.editing);
                if (!li) { state.editing = null; }
                else if (!li.querySelector('.mf-editor')) {
                    var p = map[state.editing];
                    if (p) openEditor(li, p, true);
                }
            }

            /* ★ v1.1.3 自检快照（节流 3s）
               真机上看不到控制台，把关键结构写进 localStorage['mf_pm_diag']，
               事后可以直接从 WebView 的 leveldb 里捞出来，不用再盲猜。 */
            try {
                var now = Date.now();
                if (!decorateAll._t || now - decorateAll._t > 3000) {
                    decorateAll._t = now;
                    localStorage.setItem('mf_pm_diag', JSON.stringify({
                        v: VERSION,
                        rows: rows.length,
                        prevs: L.querySelectorAll('[data-mf-prev]').length,
                        mapKeys: Object.keys(map).length,
                        ids: [].map.call([].slice.call(rows, 0, 3), function (r) {
                            return r.getAttribute('data-pm-identifier');
                        }),
                        tokSample: rows[1] ? (function () {
                            var e = rows[1].querySelector('.prompt_manager_prompt_tokens');
                            return e ? String(e.textContent).trim().slice(0, 12) : null;
                        })() : null,
                        nameFound: !!(rows[0] && rows[0].querySelector('.completion_prompt_manager_prompt_name')),
                        rowHTML: rows[0] ? rows[0].outerHTML.slice(0, 300) : null,
                        err: firstErr ? String(firstErr) : null
                    }));
                }
            } catch (e) { }
        }

        function rowOf(id) {
            var L = listEl();
            if (!L) return null;
            var rows = L.querySelectorAll(ROW);
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].getAttribute('data-pm-identifier') === id) return rows[i];
            }
            return null;
        }

        /* ── token 总览 + 行内占比 ─────────────────────────────────────── */
        function paintBoard(rows, map) {
            var o = oai() || {};
            var all = 0, onRows = 0, onTok = 0, totalTok = 0;

            for (var i = 0; i < rows.length; i++) {
                var li = rows[i];
                var id = li.getAttribute('data-pm-identifier');
                var p = id ? map[id] : null;
                if (!p) continue;
                all++;
                var isMarker = li.classList.contains('completion_prompt_manager_marker');
                var tk = isMarker ? 0 : rowTokens(li, id);
                totalTok += tk;
                var off = li.classList.contains('completion_prompt_manager_prompt_disabled');
                if (!off) { onRows++; onTok += tk; }
            }

            var eOn = byId('mf-tok-on'), eAll = byId('mf-tok-all'),
                eSum = byId('mf-tok-sum'), ePct = byId('mf-tok-pct'),
                eFill = byId('mf-tok-fill');
            if (eOn) eOn.textContent = onRows;
            if (eAll) eAll.textContent = all;
            if (eSum) eSum.textContent = fmt(onTok);

            var maxCtx = parseInt(o.openai_max_context, 10);
            var pct = (isFinite(maxCtx) && maxCtx > 0) ? (onTok / maxCtx * 100) : 0;
            var pctTxt = pct > 0 && pct < 1 ? pct.toFixed(1) : String(Math.round(pct));
            if (ePct) ePct.textContent = pctTxt + '%';
            if (eFill) eFill.style.width = Math.max(0, Math.min(100, pct)) + '%';

            for (var j = 0; j < rows.length; j++) {
                var lj = rows[j];
                if (lj.classList.contains('completion_prompt_manager_marker')) continue;
                var idj = lj.getAttribute('data-pm-identifier');
                var bar = lj.querySelector('.mf-pm-ratio > i');
                if (!bar) continue;
                var offj = lj.classList.contains('completion_prompt_manager_prompt_disabled');
                var tkj = rowTokens(lj, idj);
                var w = (!offj && totalTok > 0) ? Math.round(tkj / totalTok * 100) : 0;
                bar.style.width = w + '%';
            }
        }

        function paintFindStat(rows, map) {
            var stat = byId('mf-pm-findstat');
            if (!stat) return;
            if (!state.q) {
                stat.classList.remove('on');
                stat.classList.remove('empty');
                var cnt0 = byId('mf-pm-count');
                if (cnt0) cnt0.textContent = rows.length;
                var b1 = byId('mf-pm-bulk'), b2 = byId('mf-pm-bulktop');
                if (b1) { b1.style.display = 'none'; b1.disabled = false; }
                if (b2) { b2.style.display = 'none'; b2.disabled = false; }
                return;
            }
            var nRow = 0, nHit = 0;
            for (var i = 0; i < rows.length; i++) {
                var id = rows[i].getAttribute('data-pm-identifier');
                var p = id ? map[id] : null;
                if (!p) continue;
                var c = findRanges(p.content || '', state.q).length +
                    findRanges(p.name || '', state.q).length;
                if (c) { nRow++; nHit += c; }
            }
            var r1 = byId('mf-fs-row'), r2 = byId('mf-fs-hit');
            if (r1) r1.textContent = nRow;
            if (r2) r2.textContent = nHit;
            stat.classList.add('on');
            /* 0 条命中：把「找到 0 条 0 处」换成一句人话，并把整体替换灰掉，
               否则用户看到的是空列表 + 一个能点的按钮，不知道发生了什么。 */
            stat.classList.toggle('empty', nRow === 0);
            /* 列表头显示「条目 4/21」：过滤后列表只剩几行，
               不写分母的话会让人以为条目被删了。 */
            var cntEl = byId('mf-pm-count');
            if (cntEl) cntEl.textContent = nRow + '/' + rows.length;
            var b3 = byId('mf-pm-bulk'), b4 = byId('mf-pm-bulktop');
            if (b3) { b3.style.display = ''; b3.disabled = nRow === 0; }
            if (b4) { b4.style.display = ''; b4.disabled = nRow === 0; }
        }

        /* ═════════════════════════════════════════════════════════════
           三、行内编辑器
           ═════════════════════════════════════════════════════════════ */
        function closeEditor() {
            if (!state.editing) return;
            var li = rowOf(state.editing);
            if (li) {
                var ed = li.querySelector('.mf-editor');
                if (ed) {
                    /* ★ 关之前先把没来得及自动存的正文写回去
                       （打完字 1 秒内就点别处 → 定时器还没到，不刷就丢了） */
                    var ta = ed.querySelector('textarea');
                    var p = promptMap()[state.editing];
                    if (ta && p && ta.value !== p.content) {
                        p.content = ta.value;
                        saveNow();
                        writePresetFile();
                        setTimeout(decorateAll, 60);
                    }
                    ed.remove();
                }
                li.classList.remove('mf-expanded');
            }
            state.editing = null;
        }

        function openEditor(li, p, silent) {
            if (!li || !p || p.marker) return;
            if (!silent && state.editing === p.identifier && li.querySelector('.mf-editor')) return;
            if (state.editing && state.editing !== p.identifier) closeEditor();

            var old = li.querySelector('.mf-editor');
            if (old) old.remove();

            state.editing = p.identifier;
            li.classList.add('mf-expanded');

            var ed = document.createElement('div');
            ed.className = 'mf-editor';
            ed.innerHTML =
                '<div class="mf-fe-head">' +
                '<span class="mf-slb">正文 · 这条就是要发给 AI 的东西</span>' +
                '<span class="mf-grow"></span>' +
                '<span class="mf-macro"><b data-put="{{char}}">主角</b><b data-put="{{user}}">对方</b></span>' +
                '</div>' +
                '<div class="mf-vwrap' + (state.q ? ' viewing' : '') + '">' +
                '<div class="mf-vtext"></div>' +
                '<textarea spellcheck="false" placeholder="写点什么…"></textarea>' +
                '<span class="mf-vhint">点一下正文，直接开始改</span>' +
                '</div>' +
                '<div class="mf-fbar mini" data-fbar="mini">' +
                '<span class="mf-fic">' + svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>') + '</span>' +
                '<span class="mf-ft" data-fmini></span>' +
                '<span class="mf-fopen">查找 / 替换</span>' +
                '</div>' +
                '<div class="mf-fbar" data-fbar="full" style="display:none"><div class="mf-fbody">' +
                '<div class="mf-frow"><span class="mf-flb">查找</span>' +
                '<textarea rows="1" data-fq spellcheck="false" placeholder="词、句子或整段"></textarea>' +
                '<span class="mf-fnav"><b data-nav="prev" title="上一处">‹</b><i data-fcnt>0/0</i>' +
                '<b data-nav="next" title="下一处">›</b></span></div>' +
                '<div class="mf-frow"><span class="mf-flb">替换</span>' +
                '<textarea rows="1" data-fr spellcheck="false" placeholder="留空＝把这些字删掉"></textarea></div>' +
                '<div class="mf-fbtn">' +
                '<span class="mf-chip" data-fact="rep">替换</span>' +
                '<span class="mf-chip go" data-fact="repall">全部替换</span>' +
                '<span class="mf-grow"></span>' +
                '<span class="mf-chip undo" data-fact="undo">撤销</span>' +
                '<span class="mf-chip" data-fact="close">收起</span>' +
                '</div></div></div>' +
                '<div class="mf-e-meta"><span>停手一秒自动存</span>' +
                '<span class="mf-saved" data-saved>已保存</span>' +
                '<span class="mf-grow"></span><span class="mf-stok" data-stok></span></div>' +
                '<div class="mf-ed-bar">' +
                '<label class="mf-ed-nm">名字<input type="text" data-nm spellcheck="false"></label>' +
                '<label class="mf-ed-sel">角色<select data-role>' +
                '<option value="system">系统</option>' +
                '<option value="user">用户</option>' +
                '<option value="assistant">AI</option>' +
                '</select></label>' +
                '<label class="mf-ed-num" style="display:none">深度<input type="number" min="0" max="999" value="0"></label>' +
                '<span class="mf-ed-spacer"></span>' +
                '<button type="button" class="mf-ed-btn danger" data-x="del">删除</button>' +
                '<button type="button" class="mf-ed-btn primary" data-x="done">完成</button>' +
                '</div>';
            li.appendChild(ed);

            var ta = ed.querySelector('textarea');
            var vw = ed.querySelector('.mf-vwrap');
            var vt = ed.querySelector('.mf-vtext');
            var fmini = ed.querySelector('[data-fbar="mini"]');
            var ffull = ed.querySelector('[data-fbar="full"]');
            var fq = ed.querySelector('[data-fq]');
            var fr = ed.querySelector('[data-fr]');
            var fcnt = ed.querySelector('[data-fcnt]');
            var stok = ed.querySelector('[data-stok]');
            var savedEl = ed.querySelector('[data-saved]');
            var nmInp = ed.querySelector('[data-nm]');
            var roleSel = ed.querySelector('[data-role]');
            var numLab = ed.querySelector('.mf-ed-num');
            var numInp = numLab.querySelector('input');

            var fb = { on: false, q: '', r: '', cur: 0, hits: [], undo: null };
            ed._fb = fb;

            function fit() {
                ta.style.height = 'auto';
                ta.style.height = Math.min(340, Math.max(100, ta.scrollHeight)) + 'px';
            }

            ta.value = p.content || '';
            nmInp.value = p.name || '';
            roleSel.value = p.role || 'system';
            if (p.injection_position === 1) {
                numLab.style.display = '';
                numInp.value = p.injection_depth || 0;
            }
            // 初始 token 直接读行上酒馆算好的值（tokCache 里只有被我们改过的行才有）
            var initTok = rowTokens(li, p.identifier);
            stok.textContent = (initTok ? fmt(initTok) : '—') + ' tok';
            fit();

            /* token 重算：只有改过正文才需要，用酒馆自己的分词器 */
            function recount() {
                var c = ctx();
                if (!c || typeof c.getTokenCountAsync !== 'function') return;
                if (!p.content) { tokCache[p.identifier] = 0; stok.textContent = '0 tok'; return; }
                try {
                    var r = c.getTokenCountAsync(p.content);
                    if (r && typeof r.then === 'function') {
                        r.then(function (n) {
                            if (typeof n === 'number' && isFinite(n)) {
                                tokCache[p.identifier] = n;
                                stok.textContent = fmt(n) + ' tok';
                                var tkEl = li.querySelector('.prompt_manager_prompt_tokens');
                                if (tkEl) tkEl.textContent = n;
                                decorateAll();
                            }
                        }, function () { });
                    }
                } catch (e) { }
            }

            /* 停手一秒 → 写回 */
            var t = null;
            ta.addEventListener('input', function () {
                fit();
                if (fb.on) { fRecalc(); paintView(); }
                clearTimeout(t);
                t = setTimeout(function () {
                    p.content = ta.value;
                    saveNow();          // 这里已经是「停手一秒」，别再套一层 debounce
                    savedEl.classList.add('on');
                    setTimeout(function () { savedEl.classList.remove('on'); }, 1100);
                    recount();
                }, 900);
            });

            function paintView() {
                vt.innerHTML = fb.q ? hlHTML(ta.value, fb.q, fb.cur) : esc(ta.value);
                var m = vt.querySelector('mark.mf-cur');
                if (m && m.scrollIntoView) { try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
            }
            vt.addEventListener('click', function () {
                vw.classList.remove('viewing');
                var R = findRanges(ta.value, fb.q);
                if (R.length && R[fb.cur]) {
                    ta.focus();
                    ta.setSelectionRange(R[fb.cur][0], R[fb.cur][1]);
                } else { ta.focus(); }
            });

            function fRecalc() {
                fb.q = fq.value;
                fb.hits = fb.q ? findRanges(ta.value, fb.q) : [];
                if (fb.cur >= fb.hits.length) fb.cur = 0;
                fcnt.textContent = fb.hits.length ? (fb.cur + 1) + '/' + fb.hits.length : '0/0';
                var mini = ed.querySelector('[data-fmini]');
                if (mini) {
                    mini.textContent = fb.q
                        ? ('「' + fb.q.slice(0, 14) + (fb.q.length > 14 ? '…' : '') + '」' +
                            (fb.hits.length ? ' ' + fb.hits.length + ' 处' : ' 找不到'))
                        : '';
                }
            }
            function autogrowF(el) {
                el.style.height = 'auto';
                el.style.height = Math.min(90, Math.max(26, el.scrollHeight)) + 'px';
            }
            function openF() {
                fmini.style.display = 'none';
                ffull.style.display = '';
                ffull.classList.add('open');
                fb.on = true;
                fq.value = fb.q || state.q || '';
                fr.value = fb.r || '';
                fRecalc();
                vw.classList.add('viewing');
                paintView();
                autogrowF(fq); autogrowF(fr);
            }
            function closeF() {
                ffull.style.display = 'none';
                ffull.classList.remove('open');
                fmini.style.display = '';
                fb.on = false;
                vw.classList.remove('viewing');
                paintView();
            }
            fmini.addEventListener('click', openF);
            fq.addEventListener('input', function () {
                autogrowF(fq); fb.cur = 0; fRecalc();
                if (fb.q) vw.classList.add('viewing'); else vw.classList.remove('viewing');
                paintView();
            });
            fr.addEventListener('input', function () { autogrowF(fr); fb.r = fr.value; });

            ed.addEventListener('click', function (e) {
                var nav = e.target.closest('[data-nav]');
                if (nav) {
                    if (!fb.hits.length) return;
                    fb.cur = (fb.cur + (nav.getAttribute('data-nav') === 'next' ? 1 : fb.hits.length - 1)) % fb.hits.length;
                    fcnt.textContent = (fb.cur + 1) + '/' + fb.hits.length;
                    vw.classList.add('viewing');
                    paintView();
                    return;
                }
                var fact = e.target.closest('[data-fact]');
                if (fact) {
                    var k = fact.getAttribute('data-fact');
                    if (k === 'close') { closeF(); return; }
                    if (k === 'undo') {
                        if (fb.undo == null) return;
                        ta.value = fb.undo; fb.undo = null;
                        fRecalc(); paintView(); fit();
                        p.content = ta.value; saveSoon(); recount();
                        toast('撤销了刚才的替换');
                        return;
                    }
                    if (k === 'rep') {
                        if (!fb.hits.length) return;
                        fb.undo = ta.value;
                        var a = fb.hits[fb.cur][0], b = fb.hits[fb.cur][1];
                        ta.value = ta.value.slice(0, a) + fr.value + ta.value.slice(b);
                        p.content = ta.value; saveSoon();
                        fRecalc(); paintView(); fit(); recount();
                        return;
                    }
                    if (k === 'repall') {
                        if (!fb.hits.length) return;
                        fb.undo = ta.value;
                        var out = '', pos = 0;
                        for (var i = 0; i < fb.hits.length; i++) {
                            out += ta.value.slice(pos, fb.hits[i][0]) + fr.value;
                            pos = fb.hits[i][1];
                        }
                        out += ta.value.slice(pos);
                        ta.value = out;
                        p.content = out; saveSoon();
                        fb.cur = 0; fRecalc(); paintView(); fit(); recount();
                        return;
                    }
                }
                var put = e.target.closest('[data-put]');
                if (put) {
                    var pos2 = ta.selectionStart, v = ta.value, ins = put.getAttribute('data-put');
                    ta.value = v.slice(0, pos2) + ins + v.slice(ta.selectionEnd);
                    ta.focus();
                    ta.setSelectionRange(pos2 + ins.length, pos2 + ins.length);
                    fit();
                    p.content = ta.value; saveSoon();
                }
            });
            ed.addEventListener('click', function (e) { e.stopPropagation(); });

            /* 名字 / 角色 / 深度 */
            nmInp.addEventListener('input', function () {
                p.name = nmInp.value;
                var a = li.querySelector('.completion_prompt_manager_prompt_name a') ||
                    li.querySelector('.completion_prompt_manager_prompt_name span[title]');
                if (a) a.textContent = p.name || '（没名字）';
                saveSoon();
            });
            roleSel.addEventListener('change', function () {
                p.role = roleSel.value;
                var chip = li.querySelector('.mf-role');
                if (chip) {
                    chip.className = 'mf-role ' + p.role;
                    chip.textContent = roleLabel(p.role);
                }
                saveSoon();
            });
            numInp.addEventListener('input', function () {
                p.injection_depth = parseInt(numInp.value, 10) || 0;
                saveSoon();
            });

            ed.querySelector('[data-x="done"]').addEventListener('click', function () {
                closeEditor();          // 里面会把没自动存的正文刷一次
                writePresetFile();
                decorateAll();
            });

            ed.querySelector('[data-x="del"]').addEventListener('click', function () {
                if (!window.confirm('删除条目「' + (p.name || '未命名') + '」？')) return;
                deletePrompt(p, li);
            });

            ed.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { closeEditor(); }
            });

            if (state.q && !silent) {
                fb.q = state.q; fb.cur = 0;
                openF();
            } else {
                paintView();
                /* ★ 别自动 focus + 光标扔到末尾：那样 textarea 会自己滚到最底部，
                   打开第一条看到的是一截被裁掉的行，像坏了。
                   要看就看开头，要改再点进去。 */
                if (!silent) ta.scrollTop = 0;
            }
        }

        function deletePrompt(p, li) {
            var o = oai();
            if (!o || !Array.isArray(o.prompts)) return;

            for (var i = o.prompts.length - 1; i >= 0; i--) {
                if (o.prompts[i] === p) { o.prompts.splice(i, 1); break; }
            }
            if (Array.isArray(o.prompt_order)) {
                for (var j = 0; j < o.prompt_order.length; j++) {
                    var rec = o.prompt_order[j];
                    if (!rec || !Array.isArray(rec.order)) continue;
                    rec.order = rec.order.filter(function (e) {
                        return e && e.identifier !== p.identifier;
                    });
                }
            }
            state.editing = null;
            if (li && li.parentElement) li.remove();     // 先给个即时反馈
            saveNow();
            writePresetFile();
            forceRender();
            setTimeout(decorateAll, 700);
            toast('已删除「' + (p.name || '未命名') + '」');
        }

        /* ═════════════════════════════════════════════════════════════
           四、整体替换（跨条目）
           ═════════════════════════════════════════════════════════════ */
        function bulkStat(q, where, which) {
            var map = promptMap(), n = 0, hits = 0;
            if (!q) return { n: 0, hits: 0 };
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var p = map[k];
                if (p.marker) continue;
                var li = rowOf(p.identifier);
                var off = li && li.classList.contains('completion_prompt_manager_prompt_disabled');
                if (which === 'on' && off) continue;
                if (which === 'off' && !off) continue;
                var c = 0;
                if (where !== 'name') c += findRanges(p.content || '', q).length;
                if (where !== 'body') c += findRanges(p.name || '', q).length;
                if (c) { n++; hits += c; }
            }
            return { n: n, hits: hits };
        }

        function modal() {
            var m = byId('mf-pm-modal');
            if (m) return m;
            m = document.createElement('div');
            m.className = 'mf-pm-modal';
            m.id = 'mf-pm-modal';
            m.innerHTML =
                '<div class="mf-pm-modal-box">' +
                '<div class="mf-pm-modal-head">整体替换</div>' +
                '<div class="mf-pm-modal-body">' +
                '<div class="mf-mb-lb">查找</div><div class="mf-mb-q" id="mf-mb-q"></div>' +
                '<div class="mf-mb-lb">替换成（留空＝删掉）</div>' +
                '<input id="mf-mb-r" spellcheck="false" placeholder="留空就是把这些字删掉">' +
                '<div class="mf-mb-lb">改哪里</div>' +
                '<div class="mf-seg" data-seg="where">' +
                '<button type="button" data-v="body" class="on">正文</button>' +
                '<button type="button" data-v="name">条目名</button>' +
                '<button type="button" data-v="both">两样</button></div>' +
                '<div class="mf-mb-lb">改哪些</div>' +
                '<div class="mf-seg" data-seg="which">' +
                '<button type="button" data-v="all">全部</button>' +
                '<button type="button" data-v="on" class="on">已开启</button>' +
                '<button type="button" data-v="off">已关闭</button></div>' +
                '<div class="mf-mb-stat" id="mf-mb-stat"></div>' +
                '</div>' +
                '<div class="mf-pm-modal-foot">' +
                '<button type="button" class="mf-ed-btn" data-m="cancel">取消</button>' +
                '<button type="button" class="mf-ed-btn primary" data-m="go">替换</button>' +
                '</div></div>';
            document.body.appendChild(m);

            m.addEventListener('click', function (e) {
                if (e.target === m) { m.classList.remove('on'); return; }
                var segBtn = e.target.closest('.mf-seg button');
                if (segBtn) {
                    var seg = segBtn.parentElement;
                    var btns = seg.querySelectorAll('button');
                    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('on');
                    segBtn.classList.add('on');
                    if (seg.getAttribute('data-seg') === 'where') state.bulkWhere = segBtn.getAttribute('data-v');
                    else state.bulkWhich = segBtn.getAttribute('data-v');
                    paintBulk();
                    return;
                }
                var act = e.target.closest('[data-m]');
                if (!act) return;
                if (act.getAttribute('data-m') === 'cancel') { m.classList.remove('on'); return; }
                applyBulk();
            });
            return m;
        }

        function paintBulk() {
            var st = bulkStat(state.q, state.bulkWhere, state.bulkWhich);
            var el = byId('mf-mb-stat');
            if (el) {
                el.textContent = st.hits
                    ? ('将改动 ' + st.n + ' 条 · ' + st.hits + ' 处')
                    : '这个组合里一处都没有';
                el.classList.toggle('none', !st.hits);
            }
            var go = byId('mf-pm-modal').querySelector('[data-m="go"]');
            if (go) { go.disabled = !st.hits; go.style.opacity = st.hits ? '' : '.45'; }
            return st;
        }

        function openBulk() {
            if (!state.q) return;
            var m = modal();
            byId('mf-mb-q').textContent = state.q;
            byId('mf-mb-r').value = '';
            m.classList.add('on');
            paintBulk();
        }

        function applyBulk() {
            var st = bulkStat(state.q, state.bulkWhere, state.bulkWhich);
            if (!st.hits) return;

            var map = promptMap(), snap = [];
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var p = map[k];
                if (p.marker) continue;
                var li = rowOf(p.identifier);
                var off = li && li.classList.contains('completion_prompt_manager_prompt_disabled');
                if (state.bulkWhich === 'on' && off) continue;
                if (state.bulkWhich === 'off' && !off) continue;
                snap.push({ id: p.identifier, name: p.name, content: p.content });
                var rep = byId('mf-mb-r').value;
                if (state.bulkWhere !== 'name') p.content = replaceAll(p.content, state.q, rep);
                if (state.bulkWhere !== 'body') p.name = replaceAll(p.name, state.q, rep);
                delete tokCache[p.identifier];
            }
            state.undo = snap;

            byId('mf-pm-modal').classList.remove('on');
            closeEditor();
            saveNow();
            writePresetFile();
            decorateAll();
            var u = byId('mf-pm-undo');
            if (u) u.style.display = '';
            toast('整体替换 ' + st.hits + ' 处（' + st.n + ' 条）');
        }

        /* ═════════════════════════════════════════════════════════════
           五、交互绑定 + 自愈
           ═════════════════════════════════════════════════════════════ */
        function bindList() {
            var L = listEl();
            if (!L || L._mfBound) return;
            L._mfBound = true;

            /* 点条目名 / 点铅笔 → 展开行内编辑器。
               ★ v1.2.0 铅笔换成原生那颗（.prompt-manager-edit-action），
                 它原生绑的是"打开酒馆自己的编辑弹窗"，这里一并拦掉。
                 必须在 capture 阶段拦：酒馆把处理器直接绑在这两个 span 上，
                 冒泡阶段拦晚了。 */
            L.addEventListener('click', function (e) {
                var insp = e.target.closest('.prompt-manager-inspect-action') ||
                    e.target.closest('.prompt-manager-edit-action');
                if (!insp) return;
                e.preventDefault();
                e.stopPropagation();
                var li = insp.closest(ROW);
                if (!li) return;
                var p = promptMap()[li.getAttribute('data-pm-identifier')];
                if (!p || p.marker) return;
                if (li.querySelector('.mf-editor')) closeEditor();
                else openEditor(li, p);
            }, true);

            L.addEventListener('click', function (e) {
                if (e.target.closest('.mf-editor')) return;
                if (e.target.closest('.drag-handle')) return;
                if (e.target.closest('.prompt_manager_prompt_controls')) return;
                if (e.target.closest('.prompt-manager-detach-action')) return;

                var li = e.target.closest(ROW);
                if (!li) return;
                var p = promptMap()[li.getAttribute('data-pm-identifier')];
                if (!p || p.marker) return;                 // 插入点不展开编辑器
                if (li.querySelector('.mf-editor')) closeEditor();
                else openEditor(li, p);
            });

            /* 酒馆重排列表（换预设 / 拖拽 / 开关 / 增删）→ 重新贴装饰 */
            var scheduled = false;
            function schedule() {
                if (scheduled) return;
                scheduled = true;
                setTimeout(function () {
                    scheduled = false;
                    decorateAll();
                }, 80);
            }
            try {
                var mo = new MutationObserver(schedule);
                mo.observe(L, { childList: true });
                L._mfObs = mo;
            } catch (e) { }

            /* 开关是原生处理器，点完等它写完 prompt_order 再刷新数字 */
            L.addEventListener('click', function (e) {
                if (e.target.closest('.prompt-manager-toggle-action')) {
                    setTimeout(decorateAll, 120);
                }
            });
        }

        function bindGlobals() {
            /* 参数滑杆一动，折叠条上的摘要跟着变 */
            var o = byId('ai_response_configuration') || byId('openai_settings');
            if (o && !o._mfBound) {
                o._mfBound = true;
                var onIn = function () {
                    clearTimeout(foldSumTimer);
                    foldSumTimer = setTimeout(paintFoldSum, 150);
                };
                o.addEventListener('input', onIn);
                o.addEventListener('change', onIn);
            }

            /* 换预设 → 等酒馆应用完再刷一遍 */
            var sel = byId('settings_preset_openai');
            if (sel && !sel._mfBound) {
                sel._mfBound = true;
                sel.addEventListener('change', function () {
                    tokCache = {};
                    setTimeout(function () { buildShell(); decorateAll(); paintFoldSum(); }, 500);
                    setTimeout(decorateAll, 1300);
                });
            }

            /* 窗口/抽屉宽度一变，折叠条可能要在一行和两行之间切 */
            if (!bindGlobals._rz) {
                bindGlobals._rz = true;
                var rzT = null;
                window.addEventListener('resize', function () {
                    clearTimeout(rzT);
                    rzT = setTimeout(paintFoldSum, 220);
                });
            }
        }

        /* ── 挂载：等酒馆把列表渲染出来 ────────────────────────────────── */
        function mount() {
            var L = listEl();
            if (!L) return false;
            if (!buildShell()) return false;
            bindList();
            bindGlobals();
            decorateAll();
            document.body.classList.add('mf-pm-js');
            return true;
        }

        var tries = 0, timer = null;
        function tick() {
            tries++;
            var ok = false;
            try { ok = mount(); } catch (e) { console.warn(LOG, '预设面板挂载出错', e); }
            if (ok || tries > 200) {
                if (timer) { clearInterval(timer); timer = null; }
                if (ok) console.log(LOG, '预设面板已接管（' + VERSION + '）');
            }
        }
        if (!mount()) timer = setInterval(tick, 500);

        /* 兜底轮询（2.5s）：抽屉晚渲染 / observer 漏掉重画时补一次。
           ★ v1.2.0 检查项改成 data-mf-prev（属性，不再是节点）。
             现在 decorate() 只写属性，就算误触发也只是几次 setAttribute，不重排。 */
        /* ★ 2026-11-05 性能：getClientRects() 会强制同步布局，2.5s 一次在滚动时会有毛刺。
           改成 5s + 后台跳过 + 只查抽屉 class（纯属性读取，不触发布局）。 */
        setInterval(function () {
            try {
                if (document.hidden) return;
                var L = listEl();
                if (!L) return;
                var dr = L.closest('.drawer-content');
                if (dr && !dr.classList.contains('openDrawer')) return;
                var rows = L.querySelectorAll(ROW);
                if (!rows.length) return;
                if (L.querySelectorAll('[data-mf-prev]').length >= rows.length) return;
                buildShell();
                bindList();
                bindGlobals();
                decorateAll();
                console.log(LOG, '自愈：补装饰 ' + rows.length + ' 行');
            } catch (e) { }
        }, 5000);

        /* 面板是抽屉，打开时才渲染尺寸；每次打开抽屉补一次（幂等，很便宜）
           #ai-config-button / #leftNavDrawerIcon 就是「AI 响应配置」那个抽屉，
           点任何抽屉开关都顺手补一次，免得酒馆改 id 之后这里失效。 */
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.drawer-toggle') && !e.target.closest('#leftNavDrawerIcon')) return;
            setTimeout(function () { buildShell(); decorateAll(); }, 140);
        }, true);

        APP.presetPanel = { decorate: decorateAll, state: state };
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 4 · topbar  顶栏改造（v1.4.0 起，v1.8.0 回到胶囊形态）
       ─────────────────────────────────────────────────────────────────────
       做四件事：
         ① 十颗（折叠键 + 九图标）收进一条靠左的小玻璃胶囊；手机端铺满
         ② 图标换成自己的线条 SVG（藏 FA 字形，注入 svg，只认九颗）
         ③ 最左一颗折叠键（整条收走 / 记住状态）+ 长按开设置面板
         ④ 面板里可以单独藏某些按钮，也可以调正文字号

       ★ 形态已经翻过两次，写在这里防止再自己发挥
         v1.5 靠左胶囊 → 用户「怎么看起来那么素」
         v1.6 横贯通栏 → 用户「你这个不太行，回归上一版，功能不要回归」
         v1.8 定为：**桌面靠左胶囊 + 手机铺满**，质感靠半透明渐变 + 反光，
         不靠 backdrop-filter（原因见 skin.css 11.1 和 11.2 的注释）。
         JS 只负责结构和状态，形态全在 CSS —— 换形态不必动这个文件。

       ★ 关键事实（ref/st_index.html 查过，别照设计稿写）
         · #top-bar 和 #top-settings-holder 是**兄弟节点**，不是父子。
           #top-bar 是个空壳（背景 + 阴影 + 50vw 宽），drawer 全在 holder 里。
           所以皮肤第 3 节的 `#top-bar .drawer-icon` 从来没生效过 ——
           新规则必须写 `#top-settings-holder .drawer-icon`。
         · .drawer{width:100%} + holder{justify-content:center}
           → 原生是九等分那 50vw。胶囊形态要 width:max-content +
           justify-content:flex-start + .drawer{width:auto} 三件一起改；
           手机通栏则反过来（100% + flex:1），两套在 11.10 里切换。
         · 折叠**必须把 --topBarBlockSize 归零**：它不是「顶栏高度」这一个
           属性的事，#sheld 的 top 和 height 同时引用它（st_style.css:776-784），
           只收图标宽度的话正文会被一条空带挡住。
         · 正文字号在 `.mes_text{font-size:calc(var(--mainFontSize)*1)}`，
           而 --mainFontSize = --fontScale * 15px。**别从 --fontScale 下手**：
           --topBarBlockSize / --bottomFormBlockSize 都是它算出来的，改一下
           整页 UI 连顶栏一起放大。用独立的 --mf-read-scale 乘在 .mes_text 上。

       ★ 安全退路（v1.7.0 重做了，原来那版是假的）
         所有改动都靠 body.mf-tb-js 这个 class。管理面板里有「还原原生顶栏」，
         点了写 mf_topbar_on='0'，class 一摘，skin.css 第 11 节全部失效，
         顶栏回到酒馆原生（tg 自己隐藏、注入的 svg 也 display:none）。

         ★★ v1.6.0 那版写的是「所以这个模块永远不会把用户锁在门外」——
            这句话是错的。按钮只写 '0'、不会写 '1'，点完就没入口了。
            用户原话：「我选择了返回原生，那我该怎么变成你给我搞的这个顶部了呢？
            我没有找到能的方向。」所以 v1.7.0 补了三层回头路，缺一层都不够：
              ① 按钮双向：setOn(v)，文案跟状态走（还原原生顶栏 ⇄ 用回扩展顶栏）
              ② 关掉时弹 8 秒 notice + 「换回」按钮
              ③ 酒馆 #extensions_settings 里注入常驻卡片（**注入不能判断 isOn()**，
                 判断了还原后它自己也消失，等于白做）
            另外原生模式下长按/右键一律 openPanel、不再 hideOne ——
            第 11 节失效时 data-mf-hid 根本没效果，图标不会消失，只会让用户
            以为长按坏了。

         ★ 字号不受这个开关影响 —— 它是用户自己调出来的阅读偏好，
           还原顶栏不该把他的字号一起改回去。

       ★ 为什么不用 DOM 重建顶栏
         九个 drawer 各自绑着酒馆自己的点击 / 面板 / i18n。整体重画会把它们弄丢。
         这里只做三件不破坏结构的事：加 class、注入 svg、插一颗新 drawer。
       ═════════════════════════════════════════════════════════════════════ */
    function initTopbar() {
        var KEY_ON = 'mf_topbar_on';
        var KEY_COL = 'mf_topbar_collapsed';
        var KEY_HID = 'mf_topbar_hidden';
        /* ★ 整套外观总开关。模块 1 的 styleWanted() 也直接读这个 key，
           两处必须一致（那边用 localStorage 原文，不用 rd()）。 */
        var KEY_SKIN = 'mf_skin_on';
        var KEY_FS = 'mf_reader_scale';   /* 正文字号倍率，1 = 原生 15px */
        /* v1.9.2 正文左右留白（百分比）。用户要「手机电脑都按比例」，
           所以存 %, 不存 px —— px 在 1280 上看不出、在 390 上又挤成一条。 */
        var KEY_PAD = 'mf_read_pad';

        /* 名称：第三方扩展的抽屉没登记，就退回它自己的 title */
        var NAMES = {
            'ai-config-button': '预设 · AI 响应配置',
            'sys-settings-button': '接口连接',
            'advanced-formatting-button': '回复格式化',
            'WI-SP-button': '世界书',
            'user-settings-button': '用户设置',
            'backgrounds-button': '背景',
            'extensions-settings-button': '扩展',
            'persona-management-button': '人设',
            'rightNavHolder': '角色卡'
        };

        /* 九个图标：和设计稿同一套线条（24 栅格、圆头、约 1.6 粗） */
        var ICO = {
            'ai-config-button': '<path d="M4 7h5.2M14.8 7H20"/><circle cx="12" cy="7" r="1.9"/>' +
                '<path d="M4 12h9.2M18.8 12H20"/><circle cx="16" cy="12" r="1.9"/>' +
                '<path d="M4 17h3.2M12.8 17H20"/><circle cx="10" cy="17" r="1.9"/>',
            'sys-settings-button': '<path d="M9.5 3v4.2M14.5 3v4.2"/>' +
                '<path d="M6.8 7.2h10.4v3.3a5.2 5.2 0 0 1-10.4 0z"/><path d="M12 15.7V21"/>',
            'advanced-formatting-button': '<path d="M5.5 19.5 12 4.5l6.5 15"/><path d="M8.4 13.6h7.2"/>',
            'WI-SP-button': '<path d="M12 6.4C10 4.8 7.6 4.4 5 4.4v13.2c2.6 0 5 .4 7 2 2-1.6 4.4-2 7-2V4.4c-2.6 0-5 .4-7 2z"/>' +
                '<path d="M12 6.4v13.2"/>',
            'user-settings-button': '<path d="M12 11.8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>' +
                '<path d="M5.6 19.8c.6-3.2 3.2-5 6.4-5s5.8 1.8 6.4 5"/>',
            'backgrounds-button': '<rect x="3.4" y="5" width="17.2" height="14" rx="2.4"/>' +
                '<circle cx="8.4" cy="9.4" r="1.3"/><path d="M4 17.4l4.6-4.8 3.2 3.3 3.1-3.6 5.1 5.1"/>',
            'extensions-settings-button': '<path d="M12 3.4 19.2 7.5v9L12 20.6 4.8 16.5v-9z"/>' +
                '<path d="M4.8 7.5 12 11.6l7.2-4.1M12 11.6v9"/>',
            'persona-management-button': '<circle cx="12" cy="12" r="8.6"/>' +
                '<path d="M8.6 14.2c.85 1.25 2 1.9 3.4 1.9s2.55-.65 3.4-1.9"/>' +
                '<circle cx="9.2" cy="9.6" r=".95" fill="currentColor" stroke="none"/>' +
                '<circle cx="14.8" cy="9.6" r=".95" fill="currentColor" stroke="none"/>',
            'rightNavHolder': '<rect x="3" y="5.4" width="18" height="13.2" rx="2.6"/>' +
                '<circle cx="8.5" cy="10.8" r="2"/>' +
                '<path d="M5.4 16.4c.6-1.6 1.75-2.45 3.1-2.45s2.5.85 3.1 2.45"/>' +
                '<path d="M13.8 9.8h4.2M13.8 13h3.2"/>'
        };
        var TG_ICO = '<path d="M5.5 4.5h13"/><path d="M8 16l4-4.5 4 4.5"/>';

        /* ★ 状态先进内存，localStorage 只当副本（预览沙箱里存不上，
           只靠它就会「点了没反应」）。存不住最多是记不住，绝不能是点不动。 */
        var cache = Object.create(null);
        function rd(k) {
            if (k in cache) return cache[k];
            try {
                var v = localStorage.getItem(k);
                if (v !== null) { cache[k] = v; return v; }
            } catch (e) { }
            return null;
        }
        function wr(k, v) { cache[k] = v; try { localStorage.setItem(k, v); } catch (e) { } }

        var hidden = {};
        (function () {
            var raw = rd(KEY_HID);
            if (!raw) return;
            try { JSON.parse(raw).forEach(function (k) { hidden[k] = 1; }); } catch (e) { }
        })();

        var holder = null, tg = null, panel = null, toastEl = null;
        var longPressed = false, pressTimer = null, sx = 0, sy = 0;
        var lastHidden = null, toastTimer = null, obsTimer = null;

        function isOn() { return rd(KEY_ON) !== '0'; }
        function isCol() { return rd(KEY_COL) === '1'; }

        /* ── 正文字号（v1.6.0）────────────────────────────────────────
           乘在 skin.css 的 .mes_text 上，只放大正文。

           ★ 为什么不改酒馆的 --fontScale
             --fontScale 是全局字号：顶栏高度 --topBarBlockSize、输入框
             --bottomFormBlockSize、所有 UI 都跟着它算。动一下整页重排，
             用户要的只是「正文读着舒服」，不是把整个界面放大。
             所以单独的 --mf-read-scale 只乘到 .mes_text 这一层。

           ★ 为什么要 clamp
             .70 以下正文会小到看不清，2.0 以上一行只剩十几个字、行高
             1.9 会把消息拉成一长条。范围锁 85%–160%，步进 5% —— 够用
             且不会调进不可用的区间。 */
        var FS_MIN = 0.85, FS_MAX = 1.60, FS_STEP = 0.05;

        function fsVal() {
            var v = parseFloat(rd(KEY_FS));
            if (!isFinite(v)) return 1;
            return Math.min(FS_MAX, Math.max(FS_MIN, Math.round(v * 100) / 100));
        }

        function applyFs() {
            var v = fsVal();
            /* ★★ v1.7.1 关键修正：值没变就绝对不要写。
               `--mf-read-scale` 挂在 body 上，`.mes_text` 的 font-size 依赖它 ——
               写一次 = 整页所有消息（用户那个聊天 4.2MB，几千条）全部重算样式。
               而这个函数挂在 apply() 上，apply() 又被顶栏的 MutationObserver
               调（80ms 防抖）。酒馆启动时顶栏 DOM 一直在变，等于每 80ms
               给整页消息重排一次 → UI 线程直接冻死，日志里连每 15 秒一次的
               「Saving user settings patch」都停了。
               ★ 这类「挂在 observer 上的函数」必须做到「值不变则零副作用」。 */
            if (document.body.style.getPropertyValue('--mf-read-scale') !== String(v)) {
                document.body.style.setProperty('--mf-read-scale', String(v));
            }
            /* syncExt 同理：必须放在下面那个 `if (!panel) return` 之前，
               用户可能一次都没开过顶栏面板，一直从扩展设置里调字号。 */
            syncExt();
            if (!panel) return;
            var lab = panel.querySelector('.mf-fs-v');
            if (lab) lab.textContent = Math.round(v * 100) + '%';
            var dn = panel.querySelector('[data-a="fs-"]');
            var up = panel.querySelector('[data-a="fs+"]');
            /* 到头了就 disabled，避免用户一直点却没反应 */
            if (dn) dn.disabled = v <= FS_MIN + 1e-6;
            if (up) up.disabled = v >= FS_MAX - 1e-6;
        }

        function bumpFs(dir) {
            var v = Math.round((fsVal() + dir * FS_STEP) * 100) / 100;
            wr(KEY_FS, String(v));
            applyFs();
        }

        /* ── 正文左右留白（v1.9.2）──────────────────────────────────
           .mes 的宽度 = 100% - 2×留白（见 skin.css 4.2）。

           ★ 为什么默认 3.5%
             旧版写死 `width: 93%`，等于每边留 3.5%。默认值和它完全等价，
             用户不调就还是原来的观感 —— 不擅自改动他已经看过的东西。
           ★ 为什么用 % 不用 px
             用户原话「两个都要，按比例来」。px 在 1280 上几乎看不出、
             在 390 上又会把正文挤成一列。
           ★ 上限 12%
             再往上一行就只剩二十来个字，读着反而不舒服；下限 0 是
             「贴满」，给喜欢满宽（报纸主题 chat_width=100 那种）的人。
           ★ 和 applyFs 一样：值没变就零副作用。这个函数挂在 apply() 上，
             apply() 被 MutationObserver 带着跑，无脑写 style 会整页重排。 */
        var PAD_MIN = 0, PAD_MAX = 12, PAD_STEP = 0.5, PAD_DEF = 3.5;

        function padVal() {
            var v = parseFloat(rd(KEY_PAD));
            if (!isFinite(v)) return PAD_DEF;
            return Math.min(PAD_MAX, Math.max(PAD_MIN, Math.round(v * 10) / 10));
        }

        /* 3.5% 显示成 "3.5%"，8 显示成 "8%" —— 别写成 8.0% */
        function padTxt(v) {
            return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + '%';
        }

        function applyPad() {
            var v = padVal();
            var cur = parseFloat(document.body.style.getPropertyValue('--mf-read-pad'));
            if (cur !== v) {
                document.body.style.setProperty('--mf-read-pad', v + '%');
            }
            /* 和 applyFs 一样：卡片上那个数也要跟着变，而且必须放在
               `if (!panel) return` 之前 —— 有人可能从没开过长按面板，
               一直在扩展设置里调。 */
            syncExt();
            if (!panel) return;
            var lab = panel.querySelector('.mf-pad-v');
            if (lab) lab.textContent = padTxt(v);
            var dn = panel.querySelector('[data-a="pad-"]');
            var up = panel.querySelector('[data-a="pad+"]');
            if (dn) dn.disabled = v <= PAD_MIN + 1e-6;
            if (up) up.disabled = v >= PAD_MAX - 1e-6;
        }

        function bumpPad(dir) {
            var v = Math.round((padVal() + dir * PAD_STEP) * 10) / 10;
            wr(KEY_PAD, String(v));
            applyPad();
        }

        function rows() {
            if (!holder) return [];
            return [].filter.call(holder.children, function (el) {
                return el.classList && el.classList.contains('drawer');
            });
        }

        /* key 用抽屉自己的 id；第三方扩展插进来的没有 id，用图标 class 兜底。
           ★ 绝不能用下标：扩展一升级多插一颗，后面全体后移，
             用户之前藏的会变成别的按钮被藏掉。 */
        function keyOf(d) {
            if (d.classList.contains('mf-tb-tg')) return 'tg';
            if (d.id) return d.id;
            var ic = d.querySelector('.drawer-icon');
            var m = ic && String(ic.className).match(/fa-[a-z0-9-]+/g);
            return 'x:' + (m ? m.filter(function (c) { return c !== 'fa-fw' && c !== 'fa-solid' && c !== 'fa-regular'; })[0] || 'unknown' : 'unknown');
        }

        function nameOf(d) {
            var k = keyOf(d);
            if (NAMES[k]) return NAMES[k];
            var ic = d.querySelector('.drawer-icon');
            var t = ic && (ic.getAttribute('title') || '');
            if (!t) {
                var hdr = d.querySelector('.drawer-toggle');
                t = hdr && hdr.getAttribute('title');
            }
            return (t || '').replace(/^\[title\]/, '') || k.replace(/^x:/, '');
        }

        function faOf(ic) {
            var m = (ic && String(ic.className).match(/fa-[a-z0-9-]+/g)) || [];
            m = m.filter(function (c) { return c !== 'fa-fw'; });
            return m.length ? m.join(' ') : 'fa-solid fa-circle';
        }

        /* ── 注入 SVG：只认九颗，第三方抽屉保持原样 ──────────────────── */
        function decorate() {
            rows().forEach(function (d) {
                if (d.classList.contains('mf-tb-tg')) return;
                var k = keyOf(d), ic = d.querySelector('.drawer-icon');
                if (!ic || !ICO[k]) return;
                ic.classList.add('mf-ic');
                if (ic.querySelector('svg')) return;
                ic.insertAdjacentHTML('beforeend', svg(ICO[k]));
                ic.lastElementChild.classList.add('mf-tb-svg');
                ic.lastElementChild.setAttribute('aria-hidden', 'true');
            });
        }

        /* ── 套状态 ─────────────────────────────────────────────────── */
        function apply() {
            if (!holder) return;
            /* 这两个 class 是第 11 节全部规则的总开关，挂在 body 上。
               值没变时连 toggle 都别调 —— 一旦 body 的 class 被写成一样的内容，
               浏览器仍有几率把整页标脏、重算一遍所有选择器。 */
            var wantJs = isOn();
            var wantCol = wantJs && isCol();
            if (document.body.classList.contains('mf-tb-js') !== wantJs) {
                document.body.classList.toggle('mf-tb-js', wantJs);
            }
            if (document.body.classList.contains('mf-tb-col') !== wantCol) {
                document.body.classList.toggle('mf-tb-col', wantCol);
            }

            rows().forEach(function (d) {
                var k = keyOf(d);
                if (k === 'tg') return;
                /* 值没变就别 setAttribute：apply() 是挂在 MutationObserver 上的，
                   每 80ms 可能跑一次，9 颗图标每颗都写一遍属性 = 白白标脏。 */
                var want = hidden[k] ? '1' : null;
                if (d.getAttribute('data-mf-hid') !== want) {
                    if (want) d.setAttribute('data-mf-hid', want);
                    else d.removeAttribute('data-mf-hid');
                }
            });

            if (tg) {
                var exp = isCol() ? 'false' : 'true';
                if (tg.getAttribute('aria-expanded') !== exp) tg.setAttribute('aria-expanded', exp);
                var ic = tg.querySelector('.mf-tb-tgi');
                var tt = isCol() ? '展开全部图标' : '收起图标';
                if (ic && ic.title !== tt) ic.title = tt;
            }

            applyFs();
            applyPad();
            syncExt();
        }

        /* ── 折叠键 ─────────────────────────────────────────────────── */
        /* ★ 折叠键**不能**做成 .drawer / .drawer-toggle 结构。
           酒馆的 doNavbarIconClick 绑在 .drawer-toggle 上，会给它 toggle 一个
           openIcon（白片高亮），因为里面没有 .drawer-content 就永远关不掉。
           用完全自定义的 class，酒馆不认识它 → 零冲突。 */
        function makeTg() {
            var d = document.createElement('div');
            d.className = 'mf-tb-tg';
            d.innerHTML = '<div class="mf-tb-tgi" role="button" tabindex="0" title="收起图标">' +
                svg(TG_ICO) + '</div>';
            holder.insertBefore(d, holder.firstElementChild);
            return d;
        }

        function closeDrawers() {
            var open = holder.querySelectorAll('.drawer-icon.openIcon');
            [].forEach.call(open, function (ic) {
                var t = ic.closest('.drawer-toggle') || ic;
                try { t.click(); } catch (e) { }
            });
        }

        function setCol(v) {
            wr(KEY_COL, v ? '1' : '0');
            if (v) closeDrawers();
            apply();
        }

        /* ── 扩展顶栏 ⇄ 原生顶栏（v1.7.0 补的回头路）──────────────────
           ★ 这里原先是 `wr(KEY_ON,'0')` 一把梭 —— 只能关，不能开。
             用户点「还原原生顶栏」之后就再也找不到入口了（面板里那行按钮
             文案还写着「还原原生顶栏」，点了还是 '0'），只能去翻 localStorage。
             所以按钮改成双向，并且关掉的时候必须主动说一句「怎么回来」。 */
        function setOn(v) {
            wr(KEY_ON, v ? '1' : '0');
            apply();
            if (panel && panel.classList.contains('on')) buildList();
            syncExt();
            if (!v) {
                notice('已还原原生顶栏 · 长按或右键顶栏图标可换回', {
                    btn: '换回',
                    wide: true,
                    ms: 8000,
                    onBtn: function () { setOn(true); }
                });
            } else {
                notice('已换回扩展顶栏', { ms: 2000 });
            }
        }

        /* ── 整套外观 ⇄ 酒馆原生（v1.9.1）─────────────────────────────
           用户场景：另一台手机的主题是「报纸」，装扩展后界面里还留着报纸的
           底色/背景图/字体 —— 因为旧版只是把米白「盖」上去，没盖到的地方
           还是报纸。这里改成「接管」：开的时候先把主题的 custom_css 停掉，
           关的时候把自己整套撤干净、主题原样恢复。

           ★ 顺序不能反：
             关 → 先 wr(KEY_ON,'0') + apply() 撤顶栏，再禁用 skin.css，
                  最后恢复主题。反过来会先出现「原生样式 + 改造后顶栏」的错位帧。
             开 → 先启用 skin.css，再禁主题，最后开顶栏。
           ★ 不调 setOn() 而是直接 wr + apply()：setOn 会弹自己的 toast，
             两个 toast 会叠在一起，看起来像出了两次错。
           ★ 禁用/恢复的是 #custom-style 的 disabled 属性，不删内容、不写文件，
             所以「关」之后主题完全是原样，刷新也不会丢东西。
        */
        function skinLink() {
            return document.querySelector('link[rel="stylesheet"][href*="mf-tavern-skin"]');
        }
        function themeStyleEl() {
            return document.getElementById('custom-style');
        }
        function isSkinOn() { return rd(KEY_SKIN) !== '0'; }

        function applySkin(on, silent) {
            var link = skinLink();
            var ts = themeStyleEl();

            /* 先落盘：后面 apply() / syncExt() 会立刻读 isSkinOn()，
               晚写会让卡片先显示旧状态再跳一下。 */
            wr(KEY_SKIN, on ? '1' : '0');

            if (on) {
                if (link) link.disabled = false;
                if (ts) ts.disabled = true;
                wr(KEY_ON, '1');
                /* link 停用期间注入的 SVG / 折叠键被清掉了，这里补回来 */
                if (holder) {
                    if (!holder.querySelector('.mf-tb-tg')) tg = makeTg();
                    decorate();
                }
                apply();
            } else {
                wr(KEY_ON, '0');
                apply();                       // 先把顶栏改造撤干净
                /* ★ 必须手动清掉注入的 SVG 和折叠键：
                   link 一停用，skin.css 里那条「.mf-tb-svg 隐藏」也没了，
                   不清就会「原生 FA 图标 + 我们的 SVG」叠成两个图标。
                   ★ 同时把 .mf-ic 类摘掉，否则下次开启 decorate() 会以为
                   已经装饰过（它靠 ic.querySelector('svg') 判断，不会重复注入，
                   但残留的 class 会让 CSS 的 content:none 提前生效）。 */
                [].forEach.call(document.querySelectorAll('.mf-tb-svg'), function (el) {
                    var p = el.parentNode;
                    el.remove();
                    if (p && p.classList.contains('mf-ic')) p.classList.remove('mf-ic');
                });
                [].forEach.call(document.querySelectorAll('.mf-tb-tg'), function (el) {
                    var par = el.parentNode;
                    el.remove();
                    if (par) par.classList.remove('mf-tb-has-tg');
                });
                tg = null;
                if (link) link.disabled = true;
                if (ts) ts.disabled = false;
            }

            if (panel && panel.classList.contains('on')) buildList();
            syncExt();

            if (!silent) {
                if (on) {
                    notice('已切到米白皮肤', { ms: 2000 });
                } else {
                    notice('已恢复酒馆原生外观 · 主题原样回来了', {
                        ms: 8000, wide: true, btn: '换回',
                        onBtn: function () { applySkin(true); }
                    });
                }
            }
        }

        /* ── 管理面板 ───────────────────────────────────────────────── */
        function ensurePanel() {
            if (panel) return panel;
            panel = document.createElement('div');
            panel.id = 'mf-tb-mgmt';
            panel.innerHTML =
                '<div class="mf-mg-head"><b>顶栏设置</b><span class="mf-mg-cnt"></span></div>' +
                '<div class="mf-mg-hint">长按 / 右键任意图标可以直接收走它。这里列的是全部按钮——关掉的也能在这儿放回来。</div>' +
                '<div class="mf-mg-list"></div>' +
                /* v1.6.0 正文字号：放在列表下面、按钮上面。
                   ★ 别塞进 .mf-mg-list —— 那是个 flex:1 + overflow:auto 的
                     滚动区，十颗按钮一多，字号那行就被滚没了。 */
                '<div class="mf-mg-sec">' +
                '<span class="mf-mg-sec-t">正文字号</span>' +
                '<div class="mf-fs">' +
                '<button type="button" data-a="fs-" title="正文小一点">A−</button>' +
                '<span class="mf-fs-v" data-a="fs0" title="点击恢复 100%"></span>' +
                '<button type="button" data-a="fs+" title="正文大一点">A+</button>' +
                '</div></div>' +
                /* v1.9.2 左右留白：和字号同一套控件，只是单位换成 %
                   （见 applyPad 注释：px 在大小屏上表现差太多） */
                '<div class="mf-mg-sec">' +
                '<span class="mf-mg-sec-t">左右留白</span>' +
                '<div class="mf-fs">' +
                '<button type="button" data-a="pad-" title="正文靠近两边">−</button>' +
                '<span class="mf-fs-v mf-pad-v" data-a="pad0" title="点击恢复默认 3.5%"></span>' +
                '<button type="button" data-a="pad+" title="正文离两边远一点">+</button>' +
                '</div></div>' +
                '<div class="mf-mg-foot"><span class="mf-grow"></span>' +
                '<button type="button" data-a="reset">全部恢复</button>' +
                '<button type="button" data-a="native">还原原生顶栏</button>' +
                '<button type="button" data-a="done">完成</button></div>';
            document.body.appendChild(panel);

            panel.addEventListener('click', function (e) {
                e.stopPropagation();
                var sw = e.target.closest('.mf-mg-sw');
                if (sw) {
                    var k = sw.getAttribute('data-k');
                    if (hidden[k]) delete hidden[k]; else hidden[k] = 1;
                    wr(KEY_HID, JSON.stringify(Object.keys(hidden)));
                    apply();
                    buildList();
                    return;
                }
                var b = e.target.closest('button[data-a], .mf-fs-v');
                if (!b) return;
                var a = b.getAttribute('data-a') || 'fs0';
                if (a === 'reset') {
                    hidden = {};
                    wr(KEY_HID, '[]');
                    apply();
                    buildList();
                } else if (a === 'native') {
                    setOn(!isOn());
                } else if (a === 'done') {
                    closePanel();
                } else if (a === 'fs-') {
                    bumpFs(-1);
                } else if (a === 'fs+') {
                    bumpFs(1);
                } else if (a === 'fs0') {
                    wr(KEY_FS, '1');
                    applyFs();
                } else if (a === 'pad-') {
                    bumpPad(-1);
                } else if (a === 'pad+') {
                    bumpPad(1);
                } else if (a === 'pad0') {
                    wr(KEY_PAD, String(PAD_DEF));
                    applyPad();
                }
            });

            return panel;
        }

        function buildList() {
            var list = panel.querySelector('.mf-mg-list');
            var cnt = panel.querySelector('.mf-mg-cnt');
            var all = rows().filter(function (d) { return !d.classList.contains('mf-tb-tg'); });
            var off = all.filter(function (d) { return hidden[keyOf(d)]; }).length;
            var native = !isOn();

            cnt.textContent = native ? '已还原原生' : (all.length - off) + ' / ' + all.length;
            /* 这行按钮是双向的：文案必须跟着状态走，否则用户会以为只能关 */
            var nb = panel.querySelector('[data-a="native"]');
            if (nb) nb.textContent = native ? '用回扩展顶栏' : '还原原生顶栏';
            list.innerHTML = '';

            all.forEach(function (d) {
                var k = keyOf(d);
                var ic = d.querySelector('.drawer-icon');
                var row = document.createElement('div');
                row.className = 'mf-mg-row' + (hidden[k] ? ' is-off' : '');
                row.innerHTML = (ICO[k] ? svg(ICO[k]) : '<i class="' + faOf(ic) + '"></i>') +
                    '<span class="mf-mg-name"></span>' +
                    '<span class="mf-mg-off">已隐藏</span>' +
                    '<button type="button" class="mf-mg-sw" role="switch" data-k="' + k + '"' +
                    ' aria-checked="' + (hidden[k] ? 'false' : 'true') + '"></button>';
                row.querySelector('.mf-mg-name').textContent = nameOf(d);
                list.appendChild(row);
            });
        }

        function position() {
            if (!panel || !holder) return;
            var r = holder.getBoundingClientRect();
            var w = panel.offsetWidth || 302;
            var left = Math.round(r.left + 10);
            var maxL = Math.max(8, window.innerWidth - w - 8);
            panel.style.top = Math.round(r.bottom + 4) + 'px';
            panel.style.left = Math.min(Math.max(8, left), maxL) + 'px';
        }

        function openPanel() {
            ensurePanel();
            buildList();
            applyFs();      /* 面板可能是刚建的，数值要补一次 */
            applyPad();
            position();
            panel.classList.add('on');
        }
        function closePanel() { if (panel) panel.classList.remove('on'); }

        /* ── 顶部提示条（撤销 / 说明共用一条）─────────────────────────
           v1.7.0 改造：原来只认「已隐藏 X ＋ 撤销」这一种。可「还原原生」之后
           更需要一条能说话的东西 —— 用户点了还原，界面立刻变回酒馆原样，
           如果没人告诉他「怎么回来」，就等于把他锁在门外了。
           所以拆成通用件：一段文案 + 可选按钮 + 可选停留时长。 */
        function notice(html, opts) {
            opts = opts || {};
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.id = 'mf-tb-toast';
                document.body.appendChild(toastEl);
            }
            clearTimeout(toastTimer);
            toastEl.innerHTML = '<span>' + html + '</span>';
            if (opts.btn) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = opts.btn;
                b.addEventListener('click', function () {
                    toastEl.classList.remove('on');
                    clearTimeout(toastTimer);
                    if (opts.onBtn) opts.onBtn();
                });
                toastEl.appendChild(b);
            }
            /* 文案长的时候（还原原生那条）撑宽一点，别挤成三行 */
            toastEl.classList.toggle('mf-toast-wide', !!opts.wide);
            toastEl.classList.add('on');
            toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, opts.ms || 4200);
        }

        function toast(name, k) {
            lastHidden = k;
            notice('已隐藏「' + name + '」', {
                btn: '撤销',
                ms: 3200,
                onBtn: function () {
                    if (!lastHidden) return;
                    delete hidden[lastHidden];
                    wr(KEY_HID, JSON.stringify(Object.keys(hidden)));
                    apply();
                    if (panel && panel.classList.contains('on')) buildList();
                }
            });
        }

        function hideOne(d) {
            var k = keyOf(d);
            if (k === 'tg') return;
            hidden[k] = 1;
            wr(KEY_HID, JSON.stringify(Object.keys(hidden)));
            apply();
            if (panel && panel.classList.contains('on')) buildList();
            toast(nameOf(d), k);
        }

        /* ── 长按 / 右键（事件委托，绑一次，之后动态加的抽屉也算） ──── */
        /* 命中的是什么：
             某个 .drawer / 折叠键 → 返回该元素（长按 = 收走它）
             顶栏空白            → 'blank'（长按 = 开设置面板）
             其它                → false（不管，别抢酒馆的右键菜单）

           ★ 顶栏空白也要能唤出面板。胶囊形态下空白只剩 2px 内边距，主要
             靠 #top-bar（那条 50vw 的透明空壳）兜住热区；手机铺满时空白
             更大。所以这一条在两种形态下都得留着 —— 别因为「胶囊很紧凑」
             就把它删掉，删了桌面上就只剩长按折叠键一条路。
           ★ 抽屉自己的面板里（.drawer-content）一律不管：那儿长按是选字、
             右键可能是酒馆自己的菜单，抢了会很难受。 */
        function hitOf(e) {
            var t = e.target;
            if (!t || !t.closest) return false;
            if (t.closest('.drawer-content')) return false;
            var d = t.closest('.drawer, .mf-tb-tg');
            if (d && holder.contains(d)) return d;
            if (holder.contains(t) || t.closest('#top-bar')) return 'blank';
            return false;
        }

        function bind() {
            /* ★ v1.7.0：原生模式下「长按某颗图标收走它」是没有意义的 ——
               skin.css 第 11 节整体失效，data-mf-hid 不生效，图标根本不会消失，
               用户只会觉得长按失灵。所以原生模式下一律开面板（那是唯一入口）。 */
            holder.addEventListener('contextmenu', function (e) {
                var h = hitOf(e);
                if (h === false) return;
                e.preventDefault();
                e.stopPropagation();
                if (!isOn()) { openPanel(); return; }
                if (h === 'blank' || h === tg) openPanel(); else hideOne(h);
            });

            holder.addEventListener('pointerdown', function (e) {
                var h = hitOf(e);
                if (h === false) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                sx = e.clientX; sy = e.clientY; longPressed = false;
                clearTimeout(pressTimer);
                pressTimer = setTimeout(function () {
                    longPressed = true;
                    try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) { }
                    if (!isOn() || h === 'blank' || h === tg) openPanel();
                    else hideOne(h);
                }, 480);
            });

            holder.addEventListener('pointermove', function (e) {
                if (!pressTimer) return;
                if (Math.abs(e.clientX - sx) > 9 || Math.abs(e.clientY - sy) > 9) {
                    clearTimeout(pressTimer); pressTimer = null;
                }
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
                holder.addEventListener(t, function () { clearTimeout(pressTimer); pressTimer = null; });
            });

            /* 长按后松手会再触发一次 click（会把抽屉打开 / 把顶栏折叠），
               在父级 capture 阶段吃掉。★ 同元素上的 capture 不保证先跑，
               绑在父级才可靠。 */
            holder.addEventListener('click', function (e) {
                if (longPressed) {
                    longPressed = false;
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, true);

            /* 点空白关面板；Esc 也关 */
            document.addEventListener('click', function (e) {
                if (!panel || !panel.classList.contains('on')) return;
                if (e.target.closest('#mf-tb-mgmt') || e.target.closest('.mf-tb-tg')) return;
                closePanel();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closePanel();
            });
            window.addEventListener('resize', function () {
                if (panel && panel.classList.contains('on')) position();
            });

            /* 第三方扩展可能往顶栏里插自己的抽屉：变化时补装饰 + 重算 */
            try {
                new MutationObserver(function () {
                    clearTimeout(obsTimer);
                    obsTimer = setTimeout(function () {
                        decorate();
                        apply();
                        if (panel && panel.classList.contains('on')) buildList();
                        syncExt();
                    }, 80);
                }).observe(holder, { childList: true });
            } catch (e) { }
        }

        /* ═════════════════════════════════════════════════════════════════
           扩展设置里的常驻入口（v1.7.0）
           ─────────────────────────────────────────────────────────────────
           ★ 为什么非要有这块
             顶栏一旦「还原原生」，页面上就再也没有属于我们的东西了：
             折叠键跟着 body.mf-tb-js 一起消失，注入的 SVG 也藏起来，
             只剩「长按 / 右键顶栏」这种看不见的手法。用户在酒馆里翻遍
             菜单也找不到入口 —— 这就是他说「我没有找到能的方向」的真原因。

             酒馆自己的扩展设置抽屉（#extensions_settings）是所有人都知道
             在哪儿的地方，往里放一个 extension_container，等于给皮肤留了
             一扇正门。**这块的注入绝不能判断 isOn()** —— 否则还原原生后
             它自己也跟着没了，那还不如不做。
           ═════════════════════════════════════════════════════════════════ */
        function syncExt() {
            var box = byId('mf-ext-block');
            if (!box) return;
            var on = isOn(), v = fsVal(), sk = isSkinOn();
            /* 所有文本赋值都先比一次：这个函数被 apply() 带着跑，频率不低，
               无脑写 textContent 会让浏览器把这几行字反复标脏、重排。 */
            var st = box.querySelector('.mf-ext-st');
            var stTxt = !sk ? '酒馆原生' : (on ? '已接管 · 整套米白' : '米白配色 · 原生顶栏');
            if (st && st.textContent !== stTxt) st.textContent = stTxt;
            box.classList.toggle('is-off', !sk);

            var btnSkin = box.querySelector('[data-a="skin"]');
            var skTxt = sk ? '米白皮肤' : '酒馆原生';
            if (btnSkin && btnSkin.textContent !== skTxt) btnSkin.textContent = skTxt;

            var btnToggle = box.querySelector('[data-a="toggle"]');
            var tgTxt = on ? '还原成原生顶栏' : '用回扩展顶栏';
            if (btnToggle && btnToggle.textContent !== tgTxt) btnToggle.textContent = tgTxt;

            /* ★ 一定要 :not(.mf-ext-padv)：留白那格也带 .mf-ext-v，
               不加限定会选到字号那个，两行显示同一个数。 */
            var val = box.querySelector('.mf-ext-v:not(.mf-ext-padv)');
            var vTxt = Math.round(v * 100) + '%';
            if (val && val.textContent !== vTxt) val.textContent = vTxt;

            var pv = box.querySelector('.mf-ext-padv');
            var pTxt = padTxt(padVal());
            if (pv && pv.textContent !== pTxt) pv.textContent = pTxt;

            /* 整套关掉时 skin.css 整张被停用，顶栏/字号这些按钮点了也不会生效，
               置灰比「点了没反应」诚实。 */
            var dn = box.querySelector('[data-a="fs-"]');
            var up = box.querySelector('[data-a="fs+"]');
            var pdn = box.querySelector('[data-a="pad-"]');
            var pup = box.querySelector('[data-a="pad+"]');
            if (btnToggle) btnToggle.disabled = !sk;
            if (dn) dn.disabled = !sk || v <= FS_MIN + 1e-6;
            if (up) up.disabled = !sk || v >= FS_MAX - 1e-6;
            var pv2 = padVal();
            if (pdn) pdn.disabled = !sk || pv2 <= PAD_MIN + 1e-6;
            if (pup) pup.disabled = !sk || pv2 >= PAD_MAX - 1e-6;
        }

        function mountExt() {
            var host = byId('extensions_settings');
            if (!host) return false;
            if (byId('mf-ext-block')) { syncExt(); return true; }

            var box = document.createElement('div');
            box.id = 'mf-ext-block';
            /* ★ 千万别用 .extension_container —— 那是酒馆自己的扩展挂载点，
               它在发现/重载扩展时会遍历这批容器（清空、重填、绑事件）。
               我们插一块进去，等于混进它的管理范围里，容易被整体清掉或
               反复重建。用自己的 class，跟它井水不犯河水。 */
            box.className = 'mf-ext-wrap';
            box.innerHTML =
                '<div class="mf-ext"><div class="mf-ext-h"><b>米白皮肤</b>' +
                '<span class="mf-ext-st"></span></div>' +
                /* ★ 整套外观 = 总开关，放第一行。关掉它 = 连 skin.css 都停用，
                   不只颜色回来，顶栏和字号也一起回原生 —— 这才是「完全原样」。 */
                '<div class="mf-ext-row"><span class="mf-ext-l">整套外观</span>' +
                '<button type="button" class="mf-ext-btn" data-a="skin"></button></div>' +
                '<div class="mf-ext-row"><span class="mf-ext-l">顶栏外观</span>' +
                '<button type="button" class="mf-ext-btn" data-a="toggle"></button></div>' +
                '<div class="mf-ext-row"><span class="mf-ext-l">正文字号</span>' +
                '<span class="mf-ext-fs"><button type="button" data-a="fs-">A−</button>' +
                '<span class="mf-ext-v"></span>' +
                '<button type="button" data-a="fs+">A+</button></span></div>' +
                /* v1.9.2 留白也放一份：用户原话「当然扩展那里你也可以加一个」。
                   长按面板是快捷入口，扩展卡片是「装完就能找到」的常驻入口。 */
                '<div class="mf-ext-row"><span class="mf-ext-l">左右留白</span>' +
                '<span class="mf-ext-fs"><button type="button" data-a="pad-">−</button>' +
                '<span class="mf-ext-v mf-ext-padv"></span>' +
                '<button type="button" data-a="pad+">+</button></span></div>' +
                '<div class="mf-ext-row"><span class="mf-ext-l"></span>' +
                '<button type="button" class="mf-ext-btn" data-a="panel">打开顶栏设置面板</button></div>' +
                '<div class="mf-ext-tip">长按或右键顶栏任意位置，也能打开设置面板。</div></div>';
            /* 放最前面：扩展设置抽屉里排了十几个扩展，放最后要滚半天 */
            host.insertBefore(box, host.firstChild);

            box.addEventListener('click', function (e) {
                var b = e.target.closest('button[data-a]');
                if (!b) return;
                e.preventDefault();
                e.stopPropagation();
                var a = b.getAttribute('data-a');
                if (a === 'skin') applySkin(!isSkinOn());
                else if (a === 'toggle') setOn(!isOn());
                else if (a === 'panel') { if (!isOn()) setOn(true); openPanel(); }
                else if (a === 'fs-') bumpFs(-1);
                else if (a === 'fs+') bumpFs(1);
                else if (a === 'pad-') bumpPad(-1);
                else if (a === 'pad+') bumpPad(1);
            });

            syncExt();
            watchExt(host);
            return true;
        }

        /* 酒馆某些版本会重绘扩展设置区块（装/删扩展之后）。被刷掉就补挂回来。
           观察的是父容器而不是卡片自己 —— 卡片被移除时它自己已经没有 observer 了。 */
        var extObs = null, extObsTimer = null;
        function watchExt(host) {
            if (extObs) return;
            try {
                extObs = new MutationObserver(function () {
                    if (byId('mf-ext-block')) return;
                    clearTimeout(extObsTimer);
                    /* ★ 不能复用顶栏那个 obsTimer —— 那边是 decorate/apply 的 80ms
                       防抖，两边共用一个变量会互相 clearTimeout，表现是「刚修好的
                       图标装饰偶尔不刷新」，很难查。 */
                    extObsTimer = setTimeout(function () { mountExt(); }, 60);
                });
                extObs.observe(host.parentNode || document.body, { childList: true });
            } catch (e) { }
        }

        /* 抽屉本身是静态 DOM，但扩展脚本可能比酒馆初始化早跑，重试几次兜住 */
        var extTries = 0, extTimer = setInterval(function () {
            extTries++;
            var ok = false;
            try { ok = mountExt(); } catch (e) { console.warn(LOG, '扩展设置入口挂载出错', e); }
            if (ok || extTries > 40) { clearInterval(extTimer); extTimer = null; }
        }, 800);

        /* ── 挂载 ───────────────────────────────────────────────────── */
        var bound = false;

        function mount() {
            holder = byId('top-settings-holder');
            if (!holder) return false;

            if (!holder.querySelector('.mf-tb-tg')) tg = makeTg();
            else tg = holder.querySelector('.mf-tb-tg');

            /* 折叠键自己的点击：只切换折叠，不冒泡给酒馆的抽屉逻辑 */
            if (tg && !tg.dataset.mfBound) {
                tg.dataset.mfBound = '1';
                tg.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (longPressed) { longPressed = false; return; }
                    setCol(!isCol());
                });
                tg.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCol(!isCol());
                    }
                });
            }

            if (!bound) { bound = true; bind(); }

            decorate();
            apply();
            return true;
        }

        var tries = 0, timer = null;
        function tick() {
            tries++;
            var ok = false;
            try { ok = mount(); } catch (e) { console.warn(LOG, '顶栏改造挂载出错', e); }
            if (ok || tries > 200) {
                if (timer) { clearInterval(timer); timer = null; }
                if (ok) console.log(LOG, '顶栏改造已接管（' + VERSION + '）');
            }
        }
        if (!mount()) timer = setInterval(tick, 400);

        APP.topbar = {
            apply: apply,
            open: openPanel,
            setOn: setOn,
            ext: mountExt,
            state: function () { return { on: isOn(), collapsed: isCol(), hidden: Object.keys(hidden) }; }
        };
    }

    /* ═════════════════════════════════════════════════════════════════════
       启动
       ═════════════════════════════════════════════════════════════════════ */
    /* mf-api-panel-module */
    /* ═════════════════════════════════════════════════════════════════════
       api-panel   API 连接配置面板（2026-11-05 新增）
       ─────────────────────────────────────────────────────────────────────
       目标：把酒馆原生 API 设置面板（#rm_api_block）改成
             D:\tavern-skin\api-config-v7.html 的样子 —— 分组条在上、表单卡片在下。

       ★ 铁律（改之前先读）
        1. 只动 #rm_api_block 里面的东西，别碰别处。
        2. 不删任何原生节点，只搬位置 / 加 class。酒馆的 JS 全靠 id 找元素，
           搬位置不影响它；搬走反而省得自己重写逻辑。
        3. 那 6 个原生图标（查看/新建/更新/编辑/重载/删除）隐藏后，
           由分组条和「⋯」菜单去 .click()，等于借酒馆自己的逻辑干活 ——
           弹窗、保存、切换全是真的，不是模拟。
        4. 「分组」= 酒馆原生 Connection Profiles（#connection_profiles），
           不是另存一套；切换走原生 change 事件，酒馆自己生效。

       ★ 已知边界
        · 酒馆的 Connection Profile 只存连接相关字段（api/source/key/model/proxy），
          温度那些在隔壁「AI 响应配置」面板里，这里碰不到。
        · 所以「采样参数跟着配置切」要另存一层，等第二批做。
       ═════════════════════════════════════════════════════════════════════ */

    function mfApiEsc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ★ 酒馆的按钮是 jQuery 绑的事件，原生 .click() 有时不触发（实测 create_connection_profile
       点了没反应）。统一走 jQuery trigger，没有 jQuery 再退回原生。 */
    function mfClick(id) {
        var el = document.getElementById(id);
        if (!el) return false;
        try {
            if (window.jQuery) { window.jQuery(el).trigger('click'); }
            else { el.click(); }
        } catch (e) {
            try { el.click(); } catch (e2) {}
        }
        return true;
    }
    function mfTriggerChange(el) {
        if (!el) return;
        try {
            if (window.jQuery) { window.jQuery(el).trigger('change'); }
            else { el.dispatchEvent(new Event('change', { bubbles: true })); }
        } catch (e) {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function initApiPanel() {
        var block = document.getElementById('rm_api_block');
        if (!block) { setTimeout(initApiPanel, 600); return; }
        if (block.dataset.mfApi === '1') return;

        var nativeRow = block.querySelector(':scope > .wide100p');
        if (!nativeRow) { setTimeout(initApiPanel, 600); return; }

        var mainApiEl = document.getElementById('main_api');
        var srcEl = document.getElementById('chat_completion_source');
        if (!mainApiEl || !srcEl) { setTimeout(initApiPanel, 600); return; }

        block.dataset.mfApi = '1';

        /* ══════════════════════════════════════════════════════════════
           ★ 为什么不接酒馆原生的「连接配置」（#connection_profiles）
             实测（2026-11-05）：这个客户端里 #connection_profiles 上
             一个 jQuery 事件都没有（jq._data = []），值还被别的扩展占成
             "modelTarget:..."，点 6 个图标全是死的。
             → 分组只能自己做，数据存 localStorage，写回原生控件时用
               trigger('change'/'input')，酒馆自己会响应（这些控件事件是好的）。
           ══════════════════════════════════════════════════════════════ */
        var MF_KEY = 'mf_api_profiles_v1';
        var PROFILES = [];
        var curId = '';
        var pendingNew = null;
        var openFlag = false;

        /* ── 表单快照：只抓当前可见的控件（不同服务来源字段不同） ───────── */
        function captureForm() {
            var o = { main_api: mainApiEl.value, chat_completion_source: srcEl.value, fields: {} };
            var root = document.getElementById('openai_api') || document;
            [].slice.call(root.querySelectorAll('input,select,textarea')).forEach(function (el) {
                if (!el.id || el.type === 'file') return;
                if (!el.offsetParent) return;                   /* 只存当前显示的 */
                if (el.id === 'main_api' || el.id === 'chat_completion_source') return;
                o.fields[el.id] = (el.type === 'checkbox') ? !!el.checked : el.value;
            });
            return o;
        }

        function setNative(id, v, evName) {
            var el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
            try {
                if (window.jQuery) { window.jQuery(el).trigger(evName || 'input'); }
                else { el.dispatchEvent(new Event(evName || 'input', { bubbles: true })); }
            } catch (e) {}
        }

        /* ── 预设解耦（2026-11-05 用户要求：配置动了预设不动，预设动了配置不动）──
           ★ 根因（实测，别再猜）：酒馆的「预设」文件
             default-user/OpenAI Settings/*.json 里存着
             chat_completion_source / custom_model / reverse_proxy /
             proxy_password 等 API 字段 —— 预设不是只存提示词，它是一整份
             settings 快照。所以：
             ① 切配置时无脑 trigger('change')，酒馆会把整份 settings 重刷，
                预设选择器跟着晃 —— 之前那个「切模型预设也变」的 bug 就是这个；
             ② 用户切预设时，API 区会被预设里的值直接盖掉。
           → 这里上两道闸，全程不碰用户的预设文件。
           ⚠ 别改回「每次都 trigger change」；也别把预设下拉 id 写死成
             settings_preset_openai —— 这个客户端里没有那个 id，
             _panel_raw.html 里唯一含 preset 的是 #openai_proxy_preset，
             而它在 API 区内部，必须排除。 */

        var restoring = false;

        function findPresetSel() {
            var list = document.querySelectorAll('select');
            for (var i = 0; i < list.length; i++) {
                var el = list[i];
                if (!/preset/i.test((el.id || '') + (el.name || ''))) continue;
                if (el.closest('#openai_api') || el.closest('#main-API-selector-block')) continue;
                if (el.closest('#mfGbox')) continue;
                return el;
            }
            return null;
        }

        /* API 区全量快照。故意不过滤 offsetParent：
           预设 apply 会把隐藏来源的字段也一起盖掉，漏一个等于没做。 */
        function snapApiZone() {
            var o = {};
            ['#openai_api', '#main-API-selector-block'].forEach(function (rootSel) {
                var root = document.querySelector(rootSel);
                if (!root) return;
                [].slice.call(root.querySelectorAll('input,select,textarea')).forEach(function (el) {
                    if (!el.id || el.type === 'file') return;
                    o[el.id] = (el.type === 'checkbox') ? (el.checked ? 1 : 0) : el.value;
                });
            });
            return o;
        }

        function fillApiZone(snap) {
            Object.keys(snap).forEach(function (id) {
                if (id === 'main_api' || id === 'chat_completion_source') return;
                var el = document.getElementById(id);
                if (!el || el.disabled) return;
                /* openai_proxy_preset 是「一键填 URL/密码」的填充器，不是配置。
                   写它只改显示、绝不能 trigger —— 一 trigger 它会把 URL 反填回去。 */
                if (id === 'openai_proxy_preset') { el.value = snap[id]; return; }
                if (el.type === 'checkbox') {
                    var want = !!snap[id];
                    if (el.checked !== want) setNative(id, want, 'change');
                } else if (el.value !== snap[id]) {
                    setNative(id, snap[id], el.tagName === 'SELECT' ? 'change' : 'input');
                }
            });
        }

        function restoreApiZone(snap) {
            var m = document.getElementById('main_api');
            var s = document.getElementById('chat_completion_source');
            var mChanged = m && snap['main_api'] !== undefined && m.value !== snap['main_api'];
            var sChanged = s && snap['chat_completion_source'] !== undefined && s.value !== snap['chat_completion_source'];
            if (mChanged) setNative('main_api', snap['main_api'], 'change');
            if (sChanged) setNative('chat_completion_source', snap['chat_completion_source'], 'change');
            /* 来源一变表单整块重建，等重建完再灌别的字段，否则灌进旧 DOM 白费 */
            if (mChanged || sChanged) setTimeout(function () { fillApiZone(snap); }, 220);
            else fillApiZone(snap);
        }

        /* 闸②：用户换预设 → API 区恢复成切换前的样子。
           捕获阶段先拍快照（这时酒馆还没 apply），apply 完立刻回填。
           回填排在当前任务之后、浏览器绘制之前，肉眼看不到跳。 */
        document.addEventListener('change', function (e) {
            var t = e.target;
            if (!t || t.tagName !== 'SELECT') return;
            if (restoring) return;
            if (!/preset/i.test((t.id || '') + (t.name || ''))) return;
            if (t.closest('#openai_api') || t.closest('#main-API-selector-block') || t.closest('#mfGbox')) return;

            var snap = snapApiZone();
            restoring = true;
            setTimeout(function () {
                try { restoreApiZone(snap); } catch (err) {}
                /* 酒馆 apply 预设要 await 读文件，可能是异步的，补一次兜底 */
                setTimeout(function () {
                    try { restoreApiZone(snap); } catch (err) {}
                    setTimeout(function () { restoring = false; }, 280);
                }, 360);
            }, 0);
        }, true);

        function applyProfile(p) {
            if (!p) return;
            var ps = findPresetSel();
            var presetBefore = ps ? ps.value : null;

            /* ★ 只在值真的变了才 trigger('change')。
               以前每次都 trigger，等于让酒馆把整份 settings 重刷一遍 ——
               「切配置预设也变」就是这么来的。 */
            var needMain = !!p.main_api && p.main_api !== mainApiEl.value;
            var needSrc = !!p.chat_completion_source && p.chat_completion_source !== srcEl.value;

            restoring = true;
            if (needMain) setNative('main_api', p.main_api, 'change');
            if (needSrc) setNative('chat_completion_source', p.chat_completion_source, 'change');

            /* 服务来源切换后表单是异步换的，等一拍再灌字段 */
            setTimeout(function () {
                try {
                    Object.keys(p.fields || {}).forEach(function (id) {
                        setNative(id, p.fields[id], 'input');
                    });
                    /* 闸①：预设归位。只改下拉显示，不 trigger ——
                       一 trigger 就等于重新 apply 那个预设，API 又被盖回去。 */
                    if (ps && presetBefore !== null && ps.value !== presetBefore) ps.value = presetBefore;
                } catch (err) {}
                restoring = false;
                refreshHead();
            }, (needMain || needSrc) ? 200 : 40);
        }

        function loadProfiles() {
            try {
                var raw = localStorage.getItem(MF_KEY);
                if (raw) PROFILES = JSON.parse(raw) || [];
            } catch (e) { PROFILES = []; }
            if (!PROFILES.length) {
                /* 第一次：把当前酒馆的连接存成一条「当前连接」 */
                PROFILES = [{
                    id: 'p' + Date.now(),
                    name: '当前连接',
                    main_api: mainApiEl.value,
                    chat_completion_source: srcEl.value,
                    fields: captureForm().fields
                }];
                curId = PROFILES[0].id;
                persistProfiles();
            }
            if (!curId || !PROFILES.some(function (x) { return x.id === curId; })) curId = PROFILES[0].id;
        }

        function persistProfiles() {
            try { localStorage.setItem(MF_KEY, JSON.stringify(PROFILES)); } catch (e) {}
        }

        function curProfile() {
            for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === curId) return PROFILES[i];
            return null;
        }

        function modelOf(p) {
            var f = (p && p.fields) || {};
            var keys = ['custom_model_id', 'model_openai_select', 'model_claude_select',
                'model_deepseek_select', 'model_google_select', 'model_openrouter_select'];
            for (var i = 0; i < keys.length; i++) if (f[keys[i]]) return f[keys[i]];
            return '';
        }

        /* ── 结构：分组条 + 卡片 + 折叠 ───────────────────────────────── */
        var gbox = document.createElement('section');
        gbox.className = 'mf-gbox';
        gbox.id = 'mfGbox';
        gbox.innerHTML =
            '<div class="mf-gbox-hd" id="mfGHd">' +
                '<svg class="mf-arw" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"></path></svg>' +
                '<span class="mf-nm">连接配置</span>' +
                '<span class="mf-cnt" id="mfGCnt">0</span>' +
                '<span class="mf-sp"></span>' +
                '<span class="mf-now" id="mfGNow"></span>' +
                '<button class="mf-more" id="mfGMore" type="button" title="更多操作">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>' +
                '</button>' +
                '<button class="mf-addp" id="mfGNew" type="button">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>' +
                    '<span>新建配置</span>' +
                '</button>' +
            '</div>' +
            '<div class="mf-gbox-bd" id="mfGBody"></div>' +
            '<div class="mf-menu" id="mfGMenu">' +
                '<button data-mf="rename">重命名</button>' +
                '<button data-mf="dup">复制一份</button>' +
                '<button data-mf="delete" class="mf-danger">删除这条</button>' +
            '</div>';

        nativeRow.parentNode.insertBefore(gbox, nativeRow);
        nativeRow.classList.add('mf-native-hide');

        function makeCard(title, note) {
            var sec = document.createElement('section');
            sec.className = 'mf-card';
            sec.innerHTML = '<div class="mf-card-hd"><h4>' + title + '</h4>' +
                (note ? '<span class="mf-card-note">' + note + '</span>' : '') +
                '</div><div class="mf-card-bd"></div>';
            return sec;
        }

        var c1 = makeCard('连接方式', '聊天补全 / 文本补全 / KoboldAI');
        var c2 = makeCard('服务来源 · 端点 · 密钥 · 模型', '点「连接」才会真正按这套参数请求');
        var acc = document.createElement('section');
        acc.className = 'mf-acc';
        acc.id = 'mfAcc';
        acc.innerHTML =
            '<div class="mf-acc-hd" id="mfAccHd">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="8" cy="17" r="2"></circle></svg>' +
                '附加参数与后处理<span class="mf-acc-note">3 项</span>' +
                '<svg class="mf-acc-arw" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"></path></svg>' +
            '</div>' +
            '<div class="mf-acc-bd" id="mfAccBd"></div>';

        var after = nativeRow;
        [c1, c2, acc].forEach(function (el) {
            after.parentNode.insertBefore(el, after.nextSibling);
            after = el;
        });

        /* 搬原生节点 */
        var mainSel = document.getElementById('main-API-selector-block');
        if (mainSel) c1.querySelector('.mf-card-bd').appendChild(mainSel);

        var openaiApi = document.getElementById('openai_api');
        if (openaiApi) c2.querySelector('.mf-card-bd').appendChild(openaiApi);

        ['prompt_post_processing_form', 'customize_additional_parameters', 'auto-connect-checkbox']
            .forEach(function (id) {
                var el = document.getElementById(id);
                if (el) acc.querySelector('.mf-acc-bd').appendChild(el);
            });

        /* 保存条 */
        var savbar = document.createElement('div');
        savbar.className = 'mf-savbar';
        savbar.innerHTML = '<div class="mf-svtx" id="mfSvTx">改完点「保存」，存成上面那一条</div>' +
            '<div class="mf-svbtns" id="mfSvBtns"></div>';
        c2.appendChild(savbar);

        var btnBox = savbar.querySelector('#mfSvBtns');
        var btnTest = document.getElementById('test_api_button');
        var btnConnect = document.getElementById('api_button_openai');
        /* ★「发送测试消息」收进 ⋯ 菜单（2026-11-05 用户要求：怕手滑误点）。
           ★ 不能 display:none 藏原生按钮 —— 藏了 .click() 不干活（踩过），
             要用 .mf-native-hide 那种「移出视口但仍是 display:block」的写法。 */
        if (btnTest) { btnTest.classList.add('mf-native-hide'); savbar.appendChild(btnTest); }
        if (btnConnect) { btnConnect.classList.add('mf-save'); btnBox.appendChild(btnConnect); }

        var btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.className = 'mf-btn-save';
        btnSave.id = 'mfBtnSave';
        btnSave.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z"></path><path d="M9 4v5h6V4"></path><path d="M9 14h6v6H9z"></path></svg><span>保存</span>';
        btnBox.appendChild(btnSave);

        /* ⋯ 更多：只放「发送测试消息」，默认收起 */
        var moreWrap = document.createElement('div');
        moreWrap.className = 'mf-more-wrap';
        moreWrap.innerHTML =
            '<button class="mf-btn-more" id="mfSvMore" type="button" title="更多">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
                '<circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle>' +
                '<circle cx="19" cy="12" r="1.8"></circle></svg>' +
            '</button>' +
            '<div class="mf-more-menu" id="mfSvMoreMenu">' +
                '<button type="button" data-act="test">发送测试消息</button>' +
            '</div>';
        btnBox.appendChild(moreWrap);

        var moreMenu = moreWrap.querySelector('#mfSvMoreMenu');
        moreWrap.querySelector('#mfSvMore').onclick = function (e) {
            e.stopPropagation();
            moreMenu.classList.toggle('on');
        };
        moreMenu.onclick = function (e) {
            var b = e.target.closest('button[data-act]');
            if (!b) return;
            moreMenu.classList.remove('on');
            if (b.dataset.act === 'test' && btnTest) btnTest.click();
        };
        document.addEventListener('click', function (e) {
            if (!moreWrap.contains(e.target)) moreMenu.classList.remove('on');
        });

        /* ── 自绘弹层（酒馆的 popup 是复用的，别去抢它） ────────────────── */
        var mask = document.createElement('div');
        mask.className = 'mf-mask';
        mask.id = 'mfMask';
        mask.innerHTML =
            '<div class="mf-dlg">' +
                '<h3 id="mfDlgTitle">标题</h3>' +
                '<div class="mf-dlg-sub" id="mfDlgSub"></div>' +
                '<input class="mf-dlg-inp" id="mfDlgInp" type="text">' +
                '<div class="mf-dlg-ft">' +
                    '<button class="mf-dlg-cancel" id="mfDlgCancel" type="button">取消</button>' +
                    '<button class="mf-dlg-ok" id="mfDlgOk" type="button">确定</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(mask);

        var dlgResolve = null;
        function askName(title, sub, def) {
            return new Promise(function (res) {
                dlgResolve = res;
                document.getElementById('mfDlgTitle').textContent = title;
                document.getElementById('mfDlgSub').textContent = sub || '';
                var inp = document.getElementById('mfDlgInp');
                inp.value = def || '';
                inp.style.display = '';
                mask.classList.add('on');
                setTimeout(function () { inp.focus(); inp.select(); }, 40);
            });
        }
        function askConfirm(title, sub) {
            return new Promise(function (res) {
                dlgResolve = res;
                document.getElementById('mfDlgTitle').textContent = title;
                document.getElementById('mfDlgSub').textContent = sub || '';
                var inp = document.getElementById('mfDlgInp');
                inp.value = '';
                inp.style.display = 'none';
                mask.classList.add('on');
            });
        }
        function closeDlg(v) {
            mask.classList.remove('on');
            if (dlgResolve) { var r = dlgResolve; dlgResolve = null; r(v); }
        }
        document.getElementById('mfDlgOk').onclick = function () {
            var inp = document.getElementById('mfDlgInp');
            closeDlg(inp.style.display === 'none' ? true : inp.value.trim());
        };
        document.getElementById('mfDlgCancel').onclick = function () { closeDlg(null); };
        mask.onclick = function (e) { if (e.target === mask) closeDlg(null); };
        document.addEventListener('keydown', function (e) {
            if (!mask.classList.contains('on')) return;
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('mfDlgOk').click(); }
            if (e.key === 'Escape') { e.preventDefault(); closeDlg(null); }
        });

        /* ── 渲染 ─────────────────────────────────────────────────────── */
        function refreshHead() {
            var p = curProfile();
            var now = document.getElementById('mfGNow');
            if (!now) return;
            if (pendingNew) {
                now.textContent = '新建中 · ' + (modelOf({ fields: captureForm().fields }) || '未选模型');
                return;
            }
            now.textContent = p ? (p.name + (modelOf(p) ? ' · ' + modelOf(p) : '')) : '';
        }

        function render() {
            var cnt = document.getElementById('mfGCnt');
            var body = document.getElementById('mfGBody');
            if (cnt) cnt.textContent = PROFILES.length;

            if (body) {
                var html = '';
                if (pendingNew) {
                    html += '<div class="mf-pitem ghost on"><span class="mf-dt"></span>' +
                        '<span class="mf-pnm">新建中 · ' + mfApiEsc(pendingNew.name) + '</span>' +
                        '<span class="mf-unsaved">未保存</span><span class="mf-sp"></span></div>';
                }
                html += PROFILES.map(function (p) {
                    var on = (p.id === curId && !pendingNew);
                    return '<div class="mf-pitem' + (on ? ' on' : '') + '" data-id="' + mfApiEsc(p.id) + '">' +
                        '<span class="mf-dt"></span>' +
                        '<span class="mf-pnm">' + mfApiEsc(p.name) + '</span>' +
                        (on ? '<span class="mf-badge">当前</span>' : '') +
                        '<span class="mf-sp"></span>' +
                        '<span class="mf-pmm">' + mfApiEsc(modelOf(p)) + '</span>' +
                    '</div>';
                }).join('');
                body.innerHTML = html;
            }
            refreshHead();
            var tx = document.getElementById('mfSvTx');
            var lb = document.querySelector('#mfBtnSave span');
            if (lb) lb.textContent = pendingNew ? '保存并加入' : '保存';
            if (tx) {
                tx.textContent = pendingNew
                    ? '填好端点、选好模型，点右边保存 → 输入名字就出现在上面的分组里'
                    : '改完点「保存」，存成上面那一条';
            }
        }

        /* ── 交互 ─────────────────────────────────────────────────────── */
        var gHd = document.getElementById('mfGHd');
        gHd.onclick = function (e) {
            if (e.target.closest('#mfGNew') || e.target.closest('#mfGMore')) return;
            openFlag = !openFlag;
            gbox.classList.toggle('open', openFlag);
        };

        document.getElementById('mfGBody').onclick = function (e) {
            var it = e.target.closest('.mf-pitem');
            if (!it) return;
            if (it.classList.contains('ghost')) { return; }
            var id = it.dataset.id;
            if (pendingNew) { pendingNew = null; }
            curId = id;
            var p = curProfile();
            if (p) applyProfile(p);
            openFlag = false;
            gbox.classList.remove('open');
            render();
        };

        document.getElementById('mfGNew').onclick = function (e) {
            e.stopPropagation();
            if (pendingNew) return;
            ensureLoaded();
            pendingNew = { name: '新配置 ' + (PROFILES.length + 1) };
            /* 清空表单，但保留连接方式和服务来源，省得重选 */
            setNative('custom_api_url_text', '', 'input');
            setNative('custom_model_id', '', 'input');
            openFlag = true;
            gbox.classList.add('open');
            render();
            var u = document.getElementById('custom_api_url_text');
            if (u) u.focus();
        };

        /* ⋯ 菜单 */
        var menu = document.getElementById('mfGMenu');
        document.getElementById('mfGMore').onclick = function (e) {
            e.stopPropagation();
            menu.classList.toggle('on');
        };
        document.addEventListener('click', function (e) {
            if (!menu.contains(e.target) && !e.target.closest('#mfGMore')) menu.classList.remove('on');
        });
        menu.onclick = async function (e) {
            var b = e.target.closest('button[data-mf]');
            if (!b) return;
            menu.classList.remove('on');
            var p = curProfile();
            if (!p) return;

            if (b.dataset.mf === 'rename') {
                var nn = await askName('重命名这条配置', '只改名字，不动连接。', p.name);
                if (nn === null) return;
                if (!nn) return;
                p.name = nn;
                persistProfiles(); render();
            } else if (b.dataset.mf === 'dup') {
                var cp = JSON.parse(JSON.stringify(p));
                cp.id = 'p' + Date.now();
                cp.name = p.name + ' 副本';
                PROFILES.splice(PROFILES.indexOf(p) + 1, 0, cp);
                curId = cp.id;
                persistProfiles(); render();
                applyProfile(cp);
            } else if (b.dataset.mf === 'delete') {
                if (PROFILES.length <= 1) return;
                var ok = await askConfirm('删除这条配置', '「' + p.name + '」删掉就找不回来了。');
                if (!ok) return;
                PROFILES.splice(PROFILES.indexOf(p), 1);
                curId = PROFILES[0].id;
                persistProfiles(); render();
                applyProfile(PROFILES[0]);
            }
        };

        /* 保存 */
        btnSave.onclick = async function () {
            ensureLoaded();
            if (pendingNew) {
                var nm = await askName('保存到分组', '给这条连接起个名字，存好就出现在上面的分组里。', pendingNew.name);
                if (nm === null) return;
                var snap = captureForm();
                var np = {
                    id: 'p' + Date.now(),
                    name: nm || pendingNew.name,
                    main_api: snap.main_api,
                    chat_completion_source: snap.chat_completion_source,
                    fields: snap.fields
                };
                PROFILES.unshift(np);
                pendingNew = null;
                curId = np.id;
                persistProfiles();
                render();
                return;
            }
            var p = curProfile();
            if (!p) return;
            var s = captureForm();
            p.main_api = s.main_api;
            p.chat_completion_source = s.chat_completion_source;
            p.fields = s.fields;
            persistProfiles();
            render();
            var tx = document.getElementById('mfSvTx');
            if (tx) {
                var old = tx.textContent;
                tx.textContent = '已保存到「' + p.name + '」';
                setTimeout(function () { tx.textContent = old; }, 1800);
            }
        };

        /* 折叠 */
        var accEl = document.getElementById('mfAcc');
        document.getElementById('mfAccHd').onclick = function () { accEl.classList.toggle('open'); };

        /* 模型/来源变动 → 组头跟着变 */
        ['custom_model_id', 'chat_completion_source', 'main_api'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', function () { setTimeout(refreshHead, 60); });
        });

        /* ★ 数据初始化必须等面板「真的可见」才做。
           面板关着的时候所有控件 offsetParent 都是 null，captureForm 会抓成空表，
           导致「当前连接」这条存下来是空字段，切回去什么都没恢复（实测踩过）。 */
        var loaded = false;
        function ensureLoaded() {
            if (loaded) return;
            if (!block.offsetParent) return;
            loaded = true;
            loadProfiles();
            render();
            applyProfile(curProfile());
            console.log(LOG, '[api-panel] 接管完成，配置', PROFILES.length, '条');
        }
        if (block.classList.contains('openDrawer')) setTimeout(ensureLoaded, 260);
        if (window.MutationObserver) {
            new MutationObserver(function () {
                if (block.classList.contains('openDrawer')) setTimeout(ensureLoaded, 260);
            }).observe(block, { attributes: true, attributeFilter: ['class'] });
        }
        render();
    }



    /* ══════════════════════════════════════════════════════════════════════
       世界书「跨书搜索」（2026-11-05 用户要求）

       ★ 用户要的是什么（原话）：
         「替换就不用做了，只要做搜索就行了…就是你这个 html 的搜索」
         → 不换原生世界书面板（#WorldInfo 里的书列表 / 条目行 / 编辑区全保留），
           只在抽屉顶部加一条搜索栏，输入就在【所有世界书】里一起搜。
           点结果 → 跳到原生面板那本书，滚到那条并展开。

       ★ 原生面板自带的 #world_info_search 只能搜【当前打开的这一本】，
         做不到跨书。所以数据必须自己拉。

       ★ 数据从哪来（实测 1.18.0 源码）：
         - 书名：window.SillyTavern.getContext().world_names 优先；
                 拿不到就退到 #world_editor_select 的 option；再退到 /api/settings/get。
         - 内容：POST /api/worldinfo/get  {name}  → {entries:{uid:{...}}}
                 跟原生 loadWorldInfo() 用的是同一个端点。
         - CSRF：GET /csrf-token → {token}，POST 必须带 X-CSRF-Token，否则 403。

       ★ 跳转怎么定位（原生没有暴露"跳到某条"的入口）：
         1) $('#world_editor_select').val(i) + dispatch('change') 切书
         2) 等 .world_entry[uid="N"] 出现
         3) 没出现（149 条那种书要分页）→ 往原生搜索框 #world_info_search
            填标题收窄，原生自己的过滤器会把目标排到第一页
         4) 还不行 → 点分页的下一页，最多翻 40 页
       ══════════════════════════════════════════════════════════════════════ */
    function initWorldSearch(retry) {
        retry = retry || 0;
        /* ★ 重试要设上限：万一这个客户端的 #WorldInfo / #wi-holder 跟上游不一样，
             无限 setTimeout 会每 800ms 刷一次，日志全废（API 面板那边就是这么写的，
             但那边已经验证过 id 对得上，这里没验证过，所以加闸）。 */
        function giveUp(why) {
            if (retry < 40) { setTimeout(function () { initWorldSearch(retry + 1); }, 800); }
            else { console.warn('[mf-ws] 世界书面板没找到（' + why + '），跨书搜索未启用'); }
        }
        var wi = document.getElementById('WorldInfo');
        if (!wi) { giveUp('#WorldInfo 不存在'); return; }
        var holder = wi.querySelector('#wi-holder');
        if (!holder) { giveUp('#wi-holder 不存在'); return; }
        if (wi.dataset.mfWs === '1') return;
        wi.dataset.mfWs = '1';

        var CACHE = null;          /* [{name, entries:[{uid,comment,keys,content}]}] */
        var CACHE_AT = 0;
        var LOADING = null;        /* 正在进行的加载 Promise，防重复拉 */
        var TOKEN = '';
        var Q = '';
        var T0 = 0;

        /* ── 小工具 ─────────────────────────────────────────────────────── */
        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function escA(s) { return esc(s).replace(/'/g, '&#39;'); }
        function waitFor(fn, ms) {
            return new Promise(function (res) {
                var t0 = Date.now();
                (function tick() {
                    var v = null;
                    try { v = fn(); } catch (e) { v = null; }
                    if (v) return res(v);
                    if (Date.now() - t0 > (ms || 4000)) return res(null);
                    setTimeout(tick, 110);
                })();
            });
        }
        function ktok(n) {
            n = n || 0;
            return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
        }

        /* ── CSRF token ─────────────────────────────────────────────────── */
        function getToken() {
            if (TOKEN) return Promise.resolve(TOKEN);
            return fetch('/csrf-token', { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (d) { TOKEN = (d && d.token) || ''; return TOKEN; })
                .catch(function () { return ''; });
        }
        function apiPost(url, body) {
            return getToken().then(function (tk) {
                var h = { 'Content-Type': 'application/json' };
                if (tk) h['X-CSRF-Token'] = tk;
                return fetch(url, {
                    method: 'POST',
                    headers: h,
                    body: JSON.stringify(body || {}),
                    cache: 'no-cache'
                });
            }).then(function (r) {
                if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
                return r.json();
            });
        }

        /* ── 书名列表 ───────────────────────────────────────────────────── */
        function bookNames() {
            /* ① 酒馆注入的全局上下文（1.12+ 有 getContext） */
            try {
                var ctx = window.SillyTavern && window.SillyTavern.getContext
                    ? window.SillyTavern.getContext() : null;
                if (ctx && ctx.world_names && ctx.world_names.length) {
                    return Promise.resolve(ctx.world_names.slice());
                }
            } catch (e) { /* 忽略，走下一档 */ }

            /* ② 原生下拉里的 option（面板一打开就有） */
            var sel = document.getElementById('world_editor_select');
            if (sel && sel.options.length > 1) {
                var out = [];
                [].slice.call(sel.options).forEach(function (o) {
                    if (o.value !== '' && o.textContent.trim()) out.push(o.textContent.trim());
                });
                if (out.length) return Promise.resolve(out);
            }

            /* ③ 最后兜底：问后端 */
            return apiPost('/api/settings/get', {}).then(function (d) {
                return (d && d.world_names) ? d.world_names.slice() : [];
            });
        }

        /* ── 拉全部世界书 ───────────────────────────────────────────────── */
        function loadAll(force) {
            if (!force && CACHE && (Date.now() - CACHE_AT) < 300000) {
                return Promise.resolve(CACHE);
            }
            if (LOADING) return LOADING;

            setStatus('正在读取世界书…');

            LOADING = bookNames().then(function (names) {
                if (!names.length) throw new Error('没找到任何世界书');
                var BOOKS = [];
                var i = 0;
                var done = 0;

                /* 一次 4 个并发，13 本书大概 1 秒内拉完 */
                function worker() {
                    if (i >= names.length) return Promise.resolve();
                    var name = names[i++];
                    return apiPost('/api/worldinfo/get', { name: name })
                        .then(function (d) {
                            var ents = (d && d.entries) || {};
                            var rows = Object.keys(ents).map(function (k) {
                                var e = ents[k] || {};
                                var keys = (e.key || []).filter(function (x) {
                                    return typeof x === 'string' && x.trim();
                                });
                                var sec = (e.keysecondary || []).filter(function (x) {
                                    return typeof x === 'string' && x.trim();
                                });
                                return {
                                    uid: Number(e.uid != null ? e.uid : k),
                                    comment: (e.comment || '').trim(),
                                    keys: keys.concat(sec),
                                    content: (e.content || ''),
                                    /* 状态位：给结果行的小圆点用 */
                                    st: e.disable ? 0 : (e.constant ? 2 : 1)
                                };
                            });
                            rows.sort(function (a, b) { return a.uid - b.uid; });
                            BOOKS.push({ name: name, entries: rows });
                        })
                        .catch(function (e) {
                            console.warn('[mf-ws] 读不了世界书：' + name, e);
                        })
                        .then(function () {
                            done++;
                            if (done % 3 === 0) setStatus('正在读取世界书…  ' + done + '/' + names.length);
                            return worker();
                        });
                }

                var seed = [];
                for (var s = 0; s < 4; s++) seed.push(worker());
                return Promise.all(seed).then(function () {
                    /* 保持和原生下拉一致的顺序 */
                    BOOKS.sort(function (a, b) {
                        return names.indexOf(a.name) - names.indexOf(b.name);
                    });
                    CACHE = BOOKS;
                    CACHE_AT = Date.now();
                    return BOOKS;
                });
            }).then(function (books) {
                LOADING = null;
                setStatus('');
                return books;
            }).catch(function (e) {
                LOADING = null;
                setStatus('读取失败：' + (e && e.message ? e.message : e), true);
                throw e;
            });

            return LOADING;
        }

        /* ── 搜索 ───────────────────────────────────────────────────────── */
        function hitIn(text, q) {
            if (!text) return -1;
            return text.toLowerCase().indexOf(q);
        }
        function snippet(text, idx, qlen) {
            var s = Math.max(0, idx - 34);
            var e = Math.min(text.length, idx + qlen + 66);
            return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
        }
        function doSearch(q) {
            var out = [];
            (CACHE || []).forEach(function (b) {
                var hits = [];
                b.entries.forEach(function (e) {
                    var w = 0, field = '', snip = '';
                    var ci = hitIn(e.comment, q);
                    if (ci >= 0) { w = 3; field = '标题'; }
                    if (!w) {
                        for (var i = 0; i < e.keys.length; i++) {
                            if (hitIn(e.keys[i], q) >= 0) { w = 2; field = '关键词'; break; }
                        }
                    }
                    if (!w) {
                        var xi = hitIn(e.content, q);
                        if (xi >= 0) {
                            w = 1; field = '正文';
                            snip = snippet(e.content, xi, q.length);
                        }
                    }
                    if (w) hits.push({ e: e, w: w, field: field, snip: snip });
                });
                if (!hits.length) return;
                hits.sort(function (a, b2) {
                    return (b2.w - a.w) || ((b2.e.content || '').length - (a.e.content || '').length);
                });
                out.push({ name: b.name, hits: hits, top: hits[0].w });
            });
            out.sort(function (a, b) { return (b.top - a.top) || (b.hits.length - a.hits.length); });
            return out;
        }

        function hl(text, q) {
            if (!q) return esc(text);
            var i = text.toLowerCase().indexOf(q);
            if (i < 0) return esc(text);
            return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length))
                 + '</mark>' + esc(text.slice(i + q.length));
        }

        /* ── 渲染 ───────────────────────────────────────────────────────── */
        var MAX_ROWS = 300;

        function render(q) {
            if (!panel) return;                         /* UI 还没建好时被提前调用，直接跳过 */
            if (!q) { panel.style.display = 'none'; wi.classList.remove('mf-ws-on'); return; }
            panel.style.display = 'block';
            wi.classList.add('mf-ws-on');

            if (!CACHE) {
                panel.innerHTML = '<div class="mf-ws-tip">' + esc(statusText || '正在读取世界书…') + '</div>';
                return;
            }

            var t = Date.now();
            var groups = doSearch(q);
            var total = groups.reduce(function (n, g) { return n + g.hits.length; }, 0);
            var dt = Date.now() - t;

            var head = '<div class="mf-ws-sum">'
                + '<span>跨 <b>' + groups.length + '</b> 本书，找到 <b>' + total + '</b> 条'
                + (dt > 3 ? '<i>' + dt + 'ms</i>' : '') + '</span>'
                + '<button type="button" class="mf-ws-re" data-act="reload">重新读取</button>'
                + '</div>';

            if (!total) {
                panel.innerHTML = head + '<div class="mf-ws-tip">没有匹配「' + esc(q) + '」的条目。<br>'
                    + '<span>只搜标题 / 关键词 / 正文；换个词试试。</span></div>';
                return;
            }

            var n = 0;
            var body = '';
            for (var gi = 0; gi < groups.length && n < MAX_ROWS; gi++) {
                var g = groups[gi];
                body += '<div class="mf-ws-book">'
                     + '<div class="mf-ws-bh"><span class="bn">' + hl(g.name, q) + '</span>'
                     + '<span class="bc">' + g.hits.length + ' 条</span></div>';
                for (var hi = 0; hi < g.hits.length && n < MAX_ROWS; hi++, n++) {
                    var h = g.hits[hi];
                    var e = h.e;
                    var title = e.comment || (e.keys.length ? '（无标题）' + e.keys.slice(0, 3).join(' / ') : '（无标题）');
                    var dot = e.st === 2 ? 'always' : (e.st === 0 ? 'off' : 'key');
                    body += '<div class="mf-ws-hit" data-book="' + escA(g.name) + '" data-uid="' + e.uid + '"'
                         + ' data-needle="' + escA((e.comment || e.keys[0] || '').slice(0, 30)) + '">'
                         + '<div class="l1"><i class="dt ' + dot + '"></i>'
                         + '<span class="tt">' + hl(title, q) + '</span>'
                         + '<span class="fw">' + h.field + '</span></div>';
                    if (e.keys.length) {
                        body += '<div class="l2">' + e.keys.slice(0, 6).map(function (k) {
                            return hl(k, q);
                        }).join(' · ') + (e.keys.length > 6 ? ' …' : '') + '</div>';
                    }
                    if (h.snip) body += '<div class="l3">' + hl(h.snip, q) + '</div>';
                    body += '</div>';
                }
                body += '</div>';
            }
            if (total > n) {
                body += '<div class="mf-ws-tip">只显示前 ' + n + ' 条，共 ' + total
                     + ' 条。加长关键词能收窄。</div>';
            }
            panel.innerHTML = head + body;
        }

        /* ── 跳转到原生面板定位 ─────────────────────────────────────────── */
        function selectBook(name) {
            var sel = document.getElementById('world_editor_select');
            if (!sel) return false;
            var idx = -1;
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].textContent.trim() === name) { idx = i; break; }
            }
            if (idx < 0) return false;
            sel.value = sel.options[idx].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        function rowOf(uid) {
            return document.querySelector('#world_popup_entries_list .world_entry[uid="' + uid + '"]');
        }

        function nextPageBtn() {
            var box = document.getElementById('world_info_pagination');
            if (!box) return null;
            var li = box.querySelector('.paginationjs-next');
            if (!li || li.classList.contains('disabled')) return null;
            return li.querySelector('a') || li;
        }

        function flash(row) {
            row.classList.add('mf-ws-flash');
            setTimeout(function () { row.classList.remove('mf-ws-flash'); }, 2200);
        }

        function expand(row) {
            var ed = row.querySelector('.world_entry_edit');
            if (ed && ed.offsetParent) return;          /* 已经展开 */
            var icon = row.querySelector('.inline-drawer-icon') ||
                       row.querySelector('.inline-drawer-toggle');
            if (icon) icon.click();
        }

        function jumpTo(book, uid, needle) {
            uid = Number(uid);
            if (!selectBook(book)) {
                setStatus('这本书记忆里找不到：' + book, true);
                return;
            }
            /* 清空搜索，回到原生列表 */
            input.value = '';
            Q = '';
            render('');
            input.blur();

            waitFor(function () {
                return document.querySelector('#world_popup_entries_list .world_entry');
            }, 6000).then(function () {
                var row = rowOf(uid);
                if (row) return row;

                /* 分页把目标挤到别的页了 → 借原生搜索收窄 */
                var si = document.getElementById('world_info_search');
                if (si && needle) {
                    si.value = needle;
                    si.dispatchEvent(new Event('input', { bubbles: true }));
                    return waitFor(function () { return rowOf(uid); }, 2500);
                }
                return null;
            }).then(function (row) {
                if (row) return row;
                /* 还是没找到 → 一页页翻 */
                var tries = 0;
                return (function turn() {
                    var b = nextPageBtn();
                    if (!b || tries++ > 40) return Promise.resolve(null);
                    b.click();
                    return waitFor(function () { return rowOf(uid); }, 1400).then(function (r) {
                        return r || turn();
                    });
                })();
            }).then(function (row) {
                if (!row) {
                    setStatus('已切到「' + book + '」，但没定位到第 ' + uid + ' 条（可能被分页或筛选藏住了）', true);
                    return;
                }
                try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(); }
                flash(row);
                expand(row);
                setStatus('');
            });
        }

        /* ── UI ─────────────────────────────────────────────────────────── */
        var wrap = document.createElement('div');
        wrap.className = 'mf-ws';
        wrap.innerHTML =
            '<div class="mf-ws-bar">'
          +   '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
          +        ' stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>'
          +        '<path d="M20 20l-3.6-3.6"></path></svg>'
          +   '<input id="mfWsInput" type="search" autocomplete="off" spellcheck="false"'
          +        ' placeholder="跨书搜索：所有世界书的标题 / 关键词 / 正文">'
          +   '<span class="mf-ws-cnt" id="mfWsCnt"></span>'
          +   '<button type="button" class="mf-ws-clr" id="mfWsClr" title="清空">'
          +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
          +        ' stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>'
          +   '</button>'
          + '</div>'
          + '<div class="mf-ws-panel" id="mfWsPanel"></div>';

        holder.parentNode.insertBefore(wrap, holder);

        var input = wrap.querySelector('#mfWsInput');
        var cnt = wrap.querySelector('#mfWsCnt');
        var panel = wrap.querySelector('#mfWsPanel');
        var clr = wrap.querySelector('#mfWsClr');
        var statusText = '';
        var statusErr = false;

        function setStatus(txt, isErr) {
            statusText = txt || '';
            statusErr = !!isErr;
            if (!panel) return;
            if (txt) {
                cnt.textContent = '';
            }
            if (txt && panel.style.display === 'block') {
                panel.innerHTML = '<div class="mf-ws-tip' + (isErr ? ' err' : '') + '">' + esc(txt) + '</div>'
                    + (isErr ? '<div class="mf-ws-tip"><button type="button" class="mf-ws-re"'
                             + ' data-act="reload">重试</button></div>' : '');
            } else if (!txt && Q && CACHE) {
                render(Q);
            }
        }

        /* 输入：防抖 140ms；首次触发时先拉数据 */
        function onInput() {
            var q = input.value.trim();
            clr.style.display = q ? 'block' : 'none';
            if (q === Q && CACHE) return;
            Q = q;
            if (!q) { render(''); cnt.textContent = ''; return; }

            if (!CACHE) {
                panel.style.display = 'block';
                wi.classList.add('mf-ws-on');
                panel.innerHTML = '<div class="mf-ws-tip">' + esc(statusText || '正在读取世界书…') + '</div>';
                loadAll(false).then(function () { if (Q) render(Q); }).catch(function () { });
                return;
            }
            render(q);
        }

        var dbt = 0;
        input.addEventListener('input', function () {
            clearTimeout(dbt);
            dbt = setTimeout(onInput, 140);
        });
        input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                input.value = ''; Q = ''; render(''); clr.style.display = 'none'; input.blur();
            }
        });
        clr.addEventListener('click', function () {
            input.value = ''; Q = ''; render(''); clr.style.display = 'none'; input.focus();
        });

        panel.addEventListener('click', function (ev) {
            var re = ev.target.closest('[data-act="reload"]');
            if (re) {
                CACHE = null;
                loadAll(true).then(function () { if (Q) render(Q); }).catch(function () { });
                return;
            }
            var hit = ev.target.closest('.mf-ws-hit');
            if (hit) jumpTo(hit.dataset.book, hit.dataset.uid, hit.dataset.needle);
        });

        /* 抽屉打开时后台预读，这样第一下输入就有结果 */
        var preload = function () {
            if (wi.classList.contains('closedDrawer')) return;
            if (CACHE || LOADING) return;
            loadAll(false).catch(function () { });
        };
        new MutationObserver(preload).observe(wi, { attributes: true, attributeFilter: ['class'] });
        setTimeout(preload, 2500);
    }


    /* ══════════════════════════════════════════════════════════════
       世界书面板 · 全功能版（2026-11-05）
       源码与联调页在工程根目录 _wb_panel.js / worldbook-live-preview.html，
       改之前先看那段头注释，坑全写在里面。
       ══════════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════════════════════
       世界书面板 · 全功能版（替换原生 #WorldInfo 内容区）  2026-11-05

       ★★ 用户要的是什么（原话）：
          「就是这个 HTML 有的功能也要做进去。然后新建什么的，不止于这些，
            反正这功能要有，必须做进去」
          → 不是只读预览。新建书 / 新建条目 / 编辑全字段 / 删除 / 批量 /
            整本启停 / 全局激活设置 / 跨书搜索，全都要，而且改了就自动存。

       ★★ 数据从哪来、往哪写（实测 1.18.0 源码，别自己造 API）：
          · 读：ctx.loadWorldInfo(name) → {entries:{uid:entry}}，走原生缓存
          · 写：ctx.saveWorldInfo(name, data, true)
                → 内部 POST /api/worldinfo/edit {name, data}
                → 同时 worldInfoCache.set() + emit WORLDINFO_UPDATED
                ★ 一定要用这个而不是自己 fetch：自己 fetch 不会更新原生缓存，
                  原生再切回这本书会拿旧数据把你刚写的覆盖掉。
          · 刷新书名：ctx.updateWorldInfoList()（async，重填下拉和 #world_info）
          · 书名列表：ctx.getWorldInfoNames()
          · 新建书 = saveWorldInfo(name, {entries:{}}, true) + updateWorldInfoList()
          · 删除书 = POST /api/worldinfo/delete {name} + updateWorldInfoList()
            （ctx 没暴露 deleteWorldInfo，只能 fetch；POST 要带 CSRF）

       ★★ 三档口径（只有两个字段，别再造 mode）：
            禁用 = disable:true ／ 常驻 = constant:true ／ 向量化 = vectorized:true
            关键词 = 三个都 false（selective 决定要不要关键词）

       ★★ 几个必须遵守的细节：
          1. 输入框失焦问题：input 事件里只改内存对象 + 标脏，绝不整棵重渲染；
             只有结构变化（展开/新建/删除/换三档）才 render()。
          2. 自动保存 700ms 防抖，同一本书合并；保存中再来改动 → 存完再存一次。
          3. sticky/cooldown/delay/scanDepth 是 number?，null 要兜成空串显示，
             写回时必须给 null 而不是 0（0 在酒馆里代表"生效 0 条"，语义不同）。
             ★ 实测用户数据里这几个字段大量是 null，兜错会把行为改掉。
          4. id 全带 mfWb 前缀：原稿用的是 #body，会撞酒馆的 <body>。
          5. 单条正文可能几万字，列表里只放关键词片，展开才 full 渲染。
          6. token 用「字符数 × 0.6」估算（酒馆的 tokenizer 没暴露给扩展）。
       ══════════════════════════════════════════════════════════════════════════ */

    function initWorldPanel(retry) {
        retry = retry || 0;

        function giveUp(why) {
            if (retry < 40) {
                setTimeout(function () { initWorldPanel(retry + 1); }, 800);
            } else {
                console.warn('[mf-wb] 没找到 #WorldInfo（' + why + '），全功能面板未启用');
            }
        }

        var wi = document.getElementById('WorldInfo');
        if (!wi) { giveUp('#WorldInfo 不存在'); return; }
        if (wi.dataset.mfWb === '1') return;
        wi.dataset.mfWb = '1';

        /* ── 图标 ─────────────────────────────────────────────────────────── */
        var SV = {
            chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
            down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
            left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
            star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/></svg>',
            plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
            search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
            close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
            gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></svg>',
            copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
            trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
            drag: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
            warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17H2.5L12 3z"/><path d="M12 9v5M12 17.2v.1"/></svg>',
            check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
            more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
            key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.8 12.2L20 3"/><path d="M17 6l2.5 2.5"/><path d="M14.5 8.5L17 11"/></svg>'
        };

        var POS = [
            [0, '↑Char', '角色定义之前'],
            [1, '↓Char', '角色定义之后'],
            [5, '↑EM', '示例消息之前'],
            [6, '↓EM', '示例消息之后'],
            [2, '↑AN', '作者注释之前'],
            [3, '↓AN', '作者注释之后'],
            [4, '@D 深度', '按深度插入'],
            [7, 'Outlet', '输出到 outlet 宏']
        ];
        var LOGIC = [
            [0, 'AND ANY', '任一命中即触发'],
            [3, 'AND ALL', '全部命中才触发'],
            [2, 'NOT ANY', '任一不命中就触发'],
            [1, 'NOT ALL', '全部不命中才触发']
        ];

        /* ── 新条目模板：必须把原生 newWorldInfoEntryDefinition 的字段全带上，
              少一个字段原生面板渲染/保存就会把它当 undefined 处理 ──────────── */
        function newEntry(uid) {
            return {
                uid: uid,
                key: [], keysecondary: [], comment: '', content: '',
                constant: false, vectorized: false, selective: true, selectiveLogic: 0,
                addMemo: false, order: 100, position: 0, disable: false,
                ignoreBudget: false, excludeRecursion: false, preventRecursion: false,
                matchPersonaDescription: false, matchCharacterDescription: false,
                matchCharacterPersonality: false, matchCharacterDepthPrompt: false,
                matchScenario: false, matchCreatorNotes: false,
                delayUntilRecursion: 0, probability: 100, useProbability: true,
                depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100,
                scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null,
                automationId: '', role: 0, sticky: null, cooldown: null, delay: null,
                triggers: []
            };
        }

        /* ── 状态 ─────────────────────────────────────────────────────────── */
        var BOOKS = [];             /* [{name, on, pinned, data}] */
        var LOADING = null;
        var LOADED_AT = 0;
        var view = 'list';
        var curName = null;
        var q = '';
        var fstate = 'all';
        var sortBy = 'custom';
        var batch = false;
        var selUid = {};
        var openUid = {};
        var advOpen = {};
        var gsetOpen = false;
        var lastScroll = 0;

        /* 自动保存 */
        var dirty = {};
        var saveTimer = 0;
        var saving = false;
        var savingSince = 0;        /* ★ 防卡死：saving 挂着超过 20s 就强制解锁 */
        var saveFail = 0;           /* ★ 连续失败次数，成功一次就归零 */
        var SAVE_FAIL_MAX = 3;
        var stText = '';
        var stKind = '';            /* '' | 'on' | 'ok' | 'err' */
        var stErrAt = 0;

        function getCtx() {
            try {
                return (window.SillyTavern && window.SillyTavern.getContext)
                    ? window.SillyTavern.getContext() : null;
            } catch (e) { return null; }
        }

        /* ── 小工具 ───────────────────────────────────────────────────────── */
        function esc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function escA(s) { return esc(s).replace(/'/g, '&#39;'); }
        function fmt(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
        function ktok(n) {
            n = n || 0;
            return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
        }
        function tokOf(len) { return Math.round((len || 0) * 0.6); }
        function num(v, d) { return (v === null || v === undefined || isNaN(+v)) ? (d || 0) : +v; }
        function N(v) { return (v === null || v === undefined || v === '') ? null : Number(v); }

        function keyArr(e) { return (e.key || []).filter(function (x) { return typeof x === 'string' && x.trim(); }); }
        function secArr(e) { return (e.keysecondary || []).filter(function (x) { return typeof x === 'string' && x.trim(); }); }
        function clen(e) { return (e.content || '').length; }
        function triOf(e) { return e.disable ? 'off' : (e.constant ? 'always' : (e.vectorized ? 'vec' : 'key')); }

        function hit(s, k) { return !k || String(s == null ? '' : s).toLowerCase().indexOf(k.toLowerCase()) >= 0; }
        function hl(s, k) {
            s = String(s == null ? '' : s);
            if (!k) return esc(s);
            var i = s.toLowerCase().indexOf(k.toLowerCase());
            if (i < 0) return esc(s);
            return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + k.length)) + '</mark>' + esc(s.slice(i + k.length));
        }

        function findBook(n) {
            for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].name === n) return BOOKS[i];
            return null;
        }
        function entList(b) {
            if (!b || !b.data || !b.data.entries) return [];
            var out = [];
            for (var k in b.data.entries) {
                if (Object.prototype.hasOwnProperty.call(b.data.entries, k)) out.push(b.data.entries[k]);
            }
            out.sort(function (a, z) { return num(a.uid) - num(z.uid); });
            return out;
        }
        function curEnts() { return entList(findBook(curName)); }
        function entByUid(u) {
            var b = findBook(curName);
            return (b && b.data && b.data.entries) ? (b.data.entries[u] || null) : null;
        }

        /* ── 保存状态条 ───────────────────────────────────────────────────── */
        function setStatus(kind, txt) {
            stKind = kind;
            stText = txt || '';
            var el = document.getElementById('mfWbSt');
            if (!el) return;
            el.className = 'svst' + (kind ? ' ' + kind : '');
            el.innerHTML = '<i></i><span>' + esc(stText) + '</span>';
        }

        /* ── 自动保存（700ms 防抖 + 保存中排队 + 失败重试） ─────────────────
           ★★★ 2026-11-05 修的真 bug：原来 flush() 一进来就 `dirty = {}`，
               保存失败只弹红字，没有把书名放回队列 →
               改动只活在内存里，关掉抽屉 / 刷新酒馆就永久丢失，
               而且面板显示的是新内容、文件里是旧内容，用户根本看不出来。
           现在的规矩：
             ① 只把「这一批」从队列移除，失败原样放回；
             ② 失败自动重试 3 次（1.2s / 2.4s / 4.8s 退避）；
             ③ 3 次都失败 → 红字常驻 + 列表上给这本书挂「未保存」标签；
             ④ saving 标志挂超过 20s 强制作废，防止一次卡死之后永远不再保存。 */
        function touch(name) {
            if (!name) return;
            dirty[name] = true;
            setStatus('on', '正在保存…');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(flush, 700);
        }

        function flush() {
            /* 卡死保护：上一次保存的 Promise 一直不落地 */
            if (saving && savingSince && (Date.now() - savingSince > 20000)) {
                console.warn('[mf-wb] 上次保存超过 20s 没反应，强制解锁');
                saving = false;
            }

            var names = [];
            for (var k in dirty) if (dirty[k]) names.push(k);
            if (!names.length) { setStatus('ok', '已保存'); return; }
            if (saving) { setTimeout(flush, 350); return; }

            /* ★ 只清这一批；失败时会被原样放回 */
            names.forEach(function (n) { delete dirty[n]; });

            saving = true;
            savingSince = Date.now();
            setStatus('on', '正在保存…');

            var ctx = getCtx();
            var jobs = names.map(function (nm) {
                var b = findBook(nm);
                if (!b || !b.data) return Promise.resolve();
                if (ctx && ctx.saveWorldInfo) {
                    /* ★ 走原生：同时更新 worldInfoCache 与 WORLDINFO_UPDATED 事件 */
                    return Promise.resolve(ctx.saveWorldInfo(nm, b.data, true));
                }
                return apiPost('/api/worldinfo/edit', { name: nm, data: b.data });
            });

            Promise.all(jobs).then(function () {
                saving = false;
                saveFail = 0;
                setStatus('ok', '已保存');
                /* 存成功了就把「未保存」标签摘掉（不重绘，免得打断正在打字的人） */
                var bad = document.querySelectorAll('#mfWb .tag.unsaved');
                if (bad.length) [].slice.call(bad).forEach(function (n) { n.remove(); });
                setTimeout(function () {
                    if (stKind === 'ok' && !Object.keys(dirty).length) setStatus('', '');
                }, 1600);
                if (Object.keys(dirty).length) flush();
            }).catch(function (err) {
                saving = false;
                /* ★★ 关键：把没存成功的书放回队列，绝不能让改动凭空消失 */
                names.forEach(function (n) { dirty[n] = true; });

                var msg = (err && err.message) ? err.message : String(err);
                console.error('[mf-wb] 保存失败', err, names);

                if (saveFail < SAVE_FAIL_MAX) {
                    saveFail++;
                    var wait = 1200 * Math.pow(2, saveFail - 1);   /* 1.2s → 2.4s → 4.8s */
                    setStatus('err', '保存失败，' + (wait / 1000).toFixed(1) + 's 后重试（'
                        + saveFail + '/' + SAVE_FAIL_MAX + '）：' + msg);
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(flush, wait);
                } else {
                    saveFail = 0;
                    setStatus('err', '保存失败（已重试 ' + SAVE_FAIL_MAX + ' 次）：' + msg
                        + ' — 改动还在面板里，先别关');
                    /* 让「未保存」标签出现在列表上；只有当面板开着才重绘 */
                    if (view === 'list' || view === 'book') { try { render(); } catch (e) { } }
                }
            });
        }

        /* ── CSRF + POST ──────────────────────────────────────────────────── */
        var TOKEN = '';
        function getToken() {
            if (TOKEN) return Promise.resolve(TOKEN);
            return fetch('/csrf-token', { cache: 'no-store' })
                .then(function (r) { return r.json(); })
                .then(function (d) { TOKEN = (d && d.token) || ''; return TOKEN; })
                .catch(function () { return ''; });
        }
        function apiPost(url, body) {
            return getToken().then(function (tk) {
                var h = { 'Content-Type': 'application/json' };
                if (tk) h['X-CSRF-Token'] = tk;
                return fetch(url, {
                    method: 'POST', headers: h,
                    body: JSON.stringify(body || {}), cache: 'no-cache'
                });
            }).then(function (r) {
                if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
                return r.json().catch(function () { return {}; });
            });
        }

        /* ── 读：书名 + 全局启用 ──────────────────────────────────────────── */
        function nativeNames() {
            var ctx = getCtx();
            try {
                if (ctx && ctx.getWorldInfoNames) {
                    var a = ctx.getWorldInfoNames();
                    if (a && a.length) return a.slice();
                }
                if (ctx && ctx.world_names && ctx.world_names.length) return ctx.world_names.slice();
            } catch (e) { /* 下一档 */ }

            var sel = document.getElementById('world_editor_select');
            if (sel && sel.options.length > 1) {
                var out = [];
                [].slice.call(sel.options).forEach(function (o) {
                    if (o.value !== '' && o.textContent.trim()) out.push(o.textContent.trim());
                });
                if (out.length) return out;
            }
            return [];
        }

        /* ★★★ 关键坑（2026-11-05 现场翻车，别改回去）：
           酒馆原生 world-info.js 第 1005 行是
               $('#world_info').append(`<option value='${i}'>${item}</option>`)
           —— option 的 value 是 **world_names 的下标**（'0','1','2'…），书名在 textContent 里。
           我原来写 `o.value || o.textContent` 当 key，结果是 "0"/"1"，
           和 BOOKS[i].name（书名）永远对不上 → 整个列表显示「已启用 0 本」，
           点开关时 setBookOn 也匹配不到 → 直接 return，用户看到的就是「点了没用」。
           正确做法：一律用 textContent.trim() 当书名。 */
        function optName(o) {
            return String((o && o.textContent) || '').trim();
        }

        function globalOnSet() {
            var set = {};
            var sel = document.getElementById('world_info');
            if (!sel) return set;
            [].slice.call(sel.options).forEach(function (o) {
                var nm = optName(o);
                if (nm && o.selected) set[nm] = true;
            });
            return set;
        }

        /* ── 读：全部世界书 ───────────────────────────────────────────────── */
        function loadAll(force) {
            if (!force && BOOKS.length && (Date.now() - LOADED_AT) < 300000) {
                return Promise.resolve(BOOKS);
            }
            if (LOADING) return LOADING;

            setStatus('on', '正在读取世界书…');
            var ctx = getCtx();
            var names = nativeNames();

            LOADING = Promise.resolve().then(function () {
                if (!names.length) throw new Error('没找到任何世界书');
                var onSet = globalOnSet();
                var out = [];
                var i = 0, done = 0;

                function one(name) {
                    if (!ctx || !ctx.loadWorldInfo) {
                        return apiPost('/api/worldinfo/get', { name: name })
                            .then(function (d) { return d; });
                    }
                    return Promise.resolve(ctx.loadWorldInfo(name));
                }

                function worker() {
                    if (i >= names.length) return Promise.resolve();
                    var name = names[i++];
                    return one(name).catch(function (e) {
                        console.warn('[mf-wb] 读不了：' + name, e);
                        return null;
                    }).then(function (data) {
                        if (data && data.entries) {
                            out.push({
                                name: name,
                                on: !!onSet[name],
                                pinned: pinnedOf(name),
                                data: data
                            });
                        }
                        done++;
                        if (done % 3 === 0) setStatus('on', '正在读取世界书… ' + done + '/' + names.length);
                        return worker();
                    });
                }

                var seed = [];
                for (var s = 0; s < 4; s++) seed.push(worker());
                return Promise.all(seed).then(function () {
                    out.sort(function (a, b) { return names.indexOf(a.name) - names.indexOf(b.name); });
                    BOOKS = out;
                    LOADED_AT = Date.now();
                    return BOOKS;
                });
            }).then(function (books) {
                LOADING = null;
                setStatus('', '');
                return books;
            }).catch(function (e) {
                LOADING = null;
                setStatus('err', '读取失败：' + (e && e.message ? e.message : e));
                throw e;
            });

            return LOADING;
        }

        /* ── 置顶（本地记忆，不写世界书） ─────────────────────────────────── */
        var PIN_KEY = 'mfWbPins';
        var PINS = {};
        try { PINS = JSON.parse(localStorage.getItem(PIN_KEY) || '{}') || {}; } catch (e) { PINS = {}; }
        function pinnedOf(n) { return !!PINS[n]; }
        function setPin(n, v) {
            if (v) PINS[n] = 1; else delete PINS[n];
            try { localStorage.setItem(PIN_KEY, JSON.stringify(PINS)); } catch (e) { }
            var b = findBook(n);
            if (b) b.pinned = !!v;
        }

        /* ── 统计 ─────────────────────────────────────────────────────────── */
        function bstat(b) {
            var on = 0, tok = 0, always = 0, key = 0, off = 0;
            entList(b).forEach(function (e) {
                var t = triOf(e);
                tok += tokOf(clen(e));
                if (t === 'off') off++;
                else { on++; if (t === 'always') always++; else key++; }
            });
            return { on: on, tot: entList(b).length, tok: tok, always: always, key: key, off: off };
        }
        function allStat() {
            var t = 0, on = 0, tok = 0;
            BOOKS.forEach(function (b) {
                var s = bstat(b);
                t += s.tot; tok += s.tok;
                if (b.on) on += s.on;
            });
            return { tot: t, on: on, tok: tok };
        }

        /* ── 顶栏 ─────────────────────────────────────────────────────────── */
        function renderHdr() {
            var h = '';
            if (view === 'list') {
                var st = allStat();
                /* ★ 一级页不再重复写「世界书」：抽屉头已经写着「世界书」了，
                     两个标题叠在一起很难看（960 宽真机截图确认过）。
                     这里只当副标题用，放统计。 */
                h = '<div class="top">'
                  + '<span class="ttl" style="font-size:12px;font-weight:400;color:var(--ink3)">'
                  + BOOKS.length + ' 本 · ' + fmt(st.tot) + ' 条 · ' + ktok(st.tok) + ' tok</span>'
                  + '<span class="grow"></span>'
                  + '<span class="iconbtn' + (gsetOpen ? ' on' : '') + '" data-act="gset" title="全局激活设置">' + SV.gear + '</span>'
                  + '</div>';
            } else {
                var b = findBook(curName);
                h = '<div class="top">'
                  + '<span class="back" data-act="back" title="返回">' + SV.left + '</span>'
                  + '<span class="ttl">' + esc(curName) + '</span>'
                  + '<span class="grow"></span>'
                  + '<span class="morewrap">'
                  +   '<span class="iconbtn" data-act="more" title="更多">' + SV.more + '</span>'
                  +   '<span class="moremenu" id="mfWbMore">'
                  +     '<button type="button" data-act="export">' + SV.copy + '导出本书 JSON</button>'
                  +     '<button type="button" data-act="delbook" class="danger">' + SV.trash + '删除整本世界书</button>'
                  +     '<button type="button" data-act="native">' + SV.gear + '临时切回原生面板</button>'
                  +   '</span>'
                  + '</span>'
                  + '<span class="iconbtn' + (batch ? ' on' : '') + '" data-act="batch" title="批量选择">' + SV.check + '</span>'
                  + '</div>';
            }
            document.getElementById('mfWbHdr').innerHTML = h;
        }

        /* ── 搜索行 ───────────────────────────────────────────────────────── */
        function renderSrow() {
            var h = '<div class="srow">'
              + '<span class="sbox' + (q ? ' has' : '') + '">' + SV.search
              + '<input id="mfWbQin" autocomplete="off" placeholder="'
              + (view === 'list' ? '搜书 / 跨书搜条目' : '搜标题 / 关键词 / 正文') + '" value="' + escA(q) + '">'
              + '<span class="clr" data-act="clrq">' + SV.close + '</span>'
              + '</span>';
            if (view === 'list') {
                h += '<span class="chip" data-act="newbook">' + SV.plus + '新建</span>';
            } else {
                h += '<select class="sel" id="mfWbSort">'
                  + '<option value="custom"' + (sortBy === 'custom' ? ' selected' : '') + '>自定义序</option>'
                  + '<option value="title"' + (sortBy === 'title' ? ' selected' : '') + '>标题 A-Z</option>'
                  + '<option value="token"' + (sortBy === 'token' ? ' selected' : '') + '>Token ↓</option>'
                  + '<option value="order"' + (sortBy === 'order' ? ' selected' : '') + '>Order ↓</option>'
                  + '<option value="prob"' + (sortBy === 'prob' ? ' selected' : '') + '>触发% ↑</option>'
                  + '</select>';
            }
            h += '</div>';
            document.getElementById('mfWbSrow').innerHTML = h;

            var qin = document.getElementById('mfWbQin');
            if (qin) {
                /* ★ 输入法组字期间不重渲染，否则中文打一个字就掉一次 */
                var composing = false;
                qin.addEventListener('compositionstart', function () { composing = true; });
                qin.addEventListener('compositionend', function () {
                    composing = false;
                    q = this.value;
                    renderBody();
                });
                qin.addEventListener('input', function () {
                    if (composing) return;
                    var pos = this.selectionStart;
                    q = this.value;
                    renderBody();
                    var again = document.getElementById('mfWbQin');
                    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { } }
                });
            }
            var ss = document.getElementById('mfWbSort');
            if (ss) ss.addEventListener('change', function () { sortBy = this.value; renderBody(); });
        }

        /* ── 一级：书列表 ─────────────────────────────────────────────────── */
        function bookRow(b) {
            var s = bstat(b);
            return '<div class="brow' + (b.on ? '' : ' dis') + '" data-act="open" data-name="' + escA(b.name) + '">'
              + '<span class="star' + (b.pinned ? ' on' : '') + '" data-act="pin" data-name="' + escA(b.name) + '" title="置顶">' + SV.star + '</span>'
              + '<span class="bn">' + hl(b.name, q) + '</span>'
              + (dirty[b.name] ? '<span class="tag unsaved" title="还没写进文件，别关面板">未保存</span>' : '')
              + (b.on ? '<span class="tag global">全局</span>' : '')
              + '<span class="bc">' + (b.on ? s.on : 0) + '/' + s.tot + '</span>'
              + '<span class="bt">' + ktok(s.tok) + '</span>'
              + '<span class="sw' + (b.on ? ' on' : '') + '" data-act="tbook" data-name="' + escA(b.name) + '" title="整本启用 / 停用"></span>'
              + '<span class="into">' + SV.chev + '</span>'
              + '</div>';
        }

        function gnum(id, label, min, max) {
            return '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">' + label + '</label>'
              + '<input class="ti" type="number" id="' + id + '" min="' + min + '" max="' + max + '" data-g="' + id + '">'
              + '</div>';
        }
        function gck(id, label) {
            return '<label class="ck"><input type="checkbox" id="' + id + '" data-g="' + id + '">' + label + '</label>';
        }

        function viewList() {
            var h = '';

            if (gsetOpen) {
                h += '<div style="padding:10px 13px 4px;border-bottom:1px solid var(--line2)">'
                  + '<div style="font-size:11px;color:var(--ink3);margin-bottom:8px;font-weight:600">全局激活设置<span style="font-weight:400"> · 改了立刻存进酒馆设置</span></div>'
                  + '<div class="grid3">'
                  + gnum('wi_depth_in', '扫描深度', 0, 1000)
                  + gnum('wi_budget_in', 'Context %', 1, 100)
                  + gnum('wi_cap_in', '预算上限', 0, 65536)
                  + '</div>'
                  + '<div class="grid3" style="margin-top:7px">'
                  + gnum('wi_minact_in', '最小激活', 0, 100)
                  + gnum('wi_maxdepth_in', '最大深度', 0, 100)
                  + gnum('wi_rec_in', '递归步数', 0, 10)
                  + '</div>'
                  + '<div class="fld" style="margin-top:9px">'
                  + '<label>插入策略</label>'
                  + '<select class="ts" id="wi_strategy_in" data-g="wi_strategy_in">'
                  + '<option value="0">均匀排序</option><option value="1">角色书优先</option><option value="2">全局书优先</option>'
                  + '</select></div>'
                  + '<div class="grid2" style="margin-top:2px">'
                  + gck('wi_names_in', '包含角色名') + gck('wi_recursive_in', '递归扫描')
                  + gck('wi_case_in', '区分大小写') + gck('wi_whole_in', '整词匹配')
                  + gck('wi_gscore_in', '组内计分') + gck('wi_overflow_in', '溢出提示')
                  + '</div></div>';
            }

            /* 跨书命中 */
            if (q) {
                var hits = [];
                BOOKS.forEach(function (b) {
                    entList(b).forEach(function (e) {
                        var t = (e.comment || '') + '\n' + (e.content || '') + '\n' + keyArr(e).join(' ');
                        if (hit(t, q)) hits.push({ b: b, e: e });
                    });
                });
                if (hits.length) {
                    h += '<div style="padding:9px 13px 3px;font-size:11px;color:var(--ink3)">跨书命中 <b style="color:var(--ink2)">'
                      + hits.length + '</b> 条</div><div class="list">';
                    h += hits.slice(0, 60).map(function (x) {
                        return '<div class="brow" data-act="jump" data-name="' + escA(x.b.name) + '" data-uid="' + x.e.uid + '">'
                          + '<span class="star"></span>'
                          + '<span class="bn">' + (x.e.comment ? hl(x.e.comment, q) : '<span class="none">无标题</span>') + '</span>'
                          + '<span class="tag bkname">' + esc(x.b.name) + '</span>'
                          + '<span class="bt">' + ktok(tokOf(clen(x.e))) + '</span>'
                          + '<span class="into">' + SV.chev + '</span>'
                          + '</div>';
                    }).join('');
                    if (hits.length > 60) h += '<div class="empty">还有 ' + (hits.length - 60) + ' 条，缩小范围再搜</div>';
                    h += '</div>';
                }
            }

            var onBooks = BOOKS.filter(function (b) { return b.on; });
            var offBooks = BOOKS.filter(function (b) { return !b.on; });
            /* 置顶的排前面 */
            function sortPin(a, z) {
                if (a.pinned !== z.pinned) return a.pinned ? -1 : 1;
                return 0;
            }
            onBooks.sort(function (a, z) { return sortPin(a, z) || (a.name > z.name ? 1 : -1); });
            offBooks.sort(function (a, z) { return sortPin(a, z) || (a.name > z.name ? 1 : -1); });

            h += '<div class="list">';
            h += '<div class="grp open"><div class="ghead"><span class="cv">' + SV.chev + '</span>'
              + '<span class="gn">已启用<i>对所有聊天生效</i></span>'
              + '<span class="gnum"><b>' + onBooks.length + '</b> 本</span></div><div class="gbody">'
              + (onBooks.length ? onBooks.map(bookRow).join('') : '<div class="empty">还没启用任何书</div>')
              + '</div></div>';

            h += '<div class="grp open"><div class="ghead"><span class="cv">' + SV.chev + '</span>'
              + '<span class="gn">未启用<i>点开关才会生效</i></span>'
              + '<span class="gnum">' + offBooks.length + ' 本</span></div><div class="gbody">'
              + (offBooks.length ? offBooks.map(bookRow).join('') : '<div class="empty">全部已启用</div>')
              + '</div></div>';
            h += '</div>';

            document.getElementById('mfWbBody').innerHTML = h;
            if (gsetOpen) applyGsetRead();
        }

        /* 全局设置：从原生隐藏控件读 → 填进我们的输入框；改动写回原生控件并触发 input */
        var GMAP = {
            wi_depth_in: ['world_info_depth', 'num'],
            wi_budget_in: ['world_info_budget', 'num'],
            wi_cap_in: ['world_info_budget_cap', 'num'],
            wi_minact_in: ['world_info_min_activations', 'num'],
            wi_maxdepth_in: ['world_info_min_activations_depth_max', 'num'],
            wi_rec_in: ['world_info_max_recursion_steps', 'num'],
            wi_strategy_in: ['world_info_character_strategy', 'sel'],
            wi_names_in: ['world_info_include_names', 'ck'],
            wi_recursive_in: ['world_info_recursive', 'ck'],
            wi_case_in: ['world_info_case_sensitive', 'ck'],
            wi_whole_in: ['world_info_match_whole_words', 'ck'],
            wi_gscore_in: ['world_info_use_group_scoring', 'ck'],
            wi_overflow_in: ['world_info_overflow_alert', 'ck']
        };

        function applyGsetRead() {
            Object.keys(GMAP).forEach(function (key) {
                var cfg = GMAP[key];
                var nat = document.getElementById(cfg[0]);
                var mine = document.getElementById(key);
                if (!nat || !mine) return;
                if (cfg[1] === 'ck') mine.checked = !!nat.checked;
                else mine.value = nat.value;
            });
        }

        /* ★ 只写「被改的那一个」，绝不能遍历全表：
             遍历会把还没填值的其它输入框（=''）回灌给原生控件，当场把全局设置清空。 */
        function writeOne(key) {
            var cfg = GMAP[key];
            if (!cfg) return;
            var nat = document.getElementById(cfg[0]);
            var mine = document.getElementById(key);
            if (!nat || !mine) return;

            if (cfg[1] === 'ck') {
                if (nat.checked === mine.checked) return;
                nat.checked = mine.checked;
                nat.dispatchEvent(new Event('change', { bubbles: true }));
                nat.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            if (String(nat.value) === String(mine.value)) return;
            nat.value = mine.value;
            /* 下拉只听 change；数字框原生监听 input（会顺带同步 counter） */
            if (cfg[1] === 'sel') nat.dispatchEvent(new Event('change', { bubbles: true }));
            else nat.dispatchEvent(new Event('input', { bubbles: true }));
        }

        /* ── 二级：书内 ───────────────────────────────────────────────────── */
        function filteredEnts() {
            var a = curEnts();
            if (fstate !== 'all') {
                a = a.filter(function (e) {
                    var t = triOf(e);
                    if (fstate === 'always') return t === 'always';
                    if (fstate === 'key') return t === 'key' || t === 'vec';
                    if (fstate === 'off') return t === 'off';
                    return true;
                });
            }
            if (q) {
                a = a.filter(function (e) {
                    return hit(e.comment, q) || hit(e.content, q) || hit(keyArr(e).join(' '), q)
                        || hit(secArr(e).join(' '), q);
                });
            }
            if (sortBy === 'title') a.sort(function (x, y) { return (x.comment || '').localeCompare(y.comment || '', 'zh'); });
            if (sortBy === 'token') a.sort(function (x, y) { return clen(y) - clen(x); });
            if (sortBy === 'order') a.sort(function (x, y) { return num(y.order) - num(x.order); });
            if (sortBy === 'prob') a.sort(function (x, y) { return num(x.probability, 100) - num(y.probability, 100); });
            return a;
        }

        function triBtns(e, lg) {
            var t = triOf(e);
            return '<span class="tri' + (lg ? ' lg' : '') + '">'
              + [['off', '禁用'], ['key', '关键词'], ['always', '常驻']].map(function (kv) {
                  return '<button type="button" data-tr="' + kv[0] + '"' + (t === kv[0] ? ' class="on"' : '') + '>' + kv[1] + '</button>';
              }).join('')
              + '</span>';
        }

        function entRow(e) {
            var t = triOf(e);
            var open = !!openUid[e.uid];
            var sel = !!selUid[e.uid];
            var ks = keyArr(e).slice(0, 3);
            var more = keyArr(e).length - ks.length;
            var h = '<div class="world_entry' + (t === 'off' ? ' off' : '') + (open ? ' open' : '') + (sel ? ' sel' : '')
                  + '" data-uid="' + e.uid + '">';

            h += '<div class="ehead" data-act="expand" data-uid="' + e.uid + '">';
            if (batch) {
                h += '<span class="lamp" style="background:' + (sel ? 'var(--gold)' : 'var(--line3)') + ';box-shadow:none"></span>';
            } else {
                h += '<span class="dh">' + SV.drag + '</span>';
                h += '<span class="lamp" data-act="kill" data-uid="' + e.uid + '" title="点一下启用 / 停用"></span>';
            }
            h += '<span class="et">' + (e.comment ? hl(e.comment, q) : '<span class="none">无标题</span>') + '</span>';
            if (t === 'always') h += '<span class="kbadge" title="常驻：不用关键词，一直生效">常驻</span>';
            else if (t === 'vec') h += '<span class="kbadge" title="向量化">向量</span>';
            else if (t === 'key') h += '<span class="kbadge kicon" title="' + keyArr(e).length + ' 个关键词">' + SV.key + (keyArr(e).length || '') + '</span>';
            h += '<span class="tok">' + ktok(tokOf(clen(e))) + '</span>';
            if (!batch) h += '<span class="cv">' + SV.down + '</span>';
            h += '</div>';

            if (!open && keyArr(e).length) {
                h += '<div class="ekey">' + ks.map(function (k) { return '<span class="kchip">' + hl(k, q) + '</span>'; }).join('')
                  + (more > 0 ? '<span class="kchip more">+' + more + '</span>' : '') + '</div>';
            }

            if (open) h += '<div class="eedit">' + editPane(e) + '</div>';
            h += '</div>';
            return h;
        }

        function keyEditor(e, field, ph) {
            var arr = (e[field] || []);
            var h = '<div class="kedit" data-kf="' + field + '" data-uid="' + e.uid + '">';
            h += arr.map(function (k, i) {
                return '<span class="kw">' + esc(k) + '<i data-kdel="' + i + '">×</i></span>';
            }).join('');
            h += '<input placeholder="' + ph + '">';
            h += '</div>';
            return h;
        }

        function editPane(e) {
            var h = '';

            h += '<div class="fld"><label>标题 / 备注</label>'
              + '<input class="ti" type="text" data-f="comment" data-uid="' + e.uid + '" placeholder="'
              + escA(keyArr(e).slice(0, 3).join(', ') || '给这条起个名字') + '" value="' + escA(e.comment) + '">'
              + '</div>';

            h += '<div class="fld"><label>正文内容<span class="r">' + fmt(tokOf(clen(e))) + ' tok</span></label>'
              + '<textarea class="ta content" data-f="content" data-uid="' + e.uid + '" placeholder="这段内容会原样发给 AI">'
              + esc(e.content || '') + '</textarea>'
              + '</div>';

            h += '<div class="fld"><label>触发档位</label>' + triBtns(e, true) + '</div>';

            h += '<div class="fld"><label>主关键词<span class="r">' + keyArr(e).length + ' 个</span></label>'
              + keyEditor(e, 'key', '逗号或回车分隔')
              + '<div class="mini">命中任一关键词才触发（常驻条目不用填）</div></div>';

            h += '<div class="fld"><label>可选过滤<span class="r">' + secArr(e).length + ' 个</span></label>'
              + keyEditor(e, 'keysecondary', '不填则忽略')
              + '</div>';

            h += '<div class="grid4">'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">插入位置</label>'
              + '<select class="ts" data-f="position" data-uid="' + e.uid + '">'
              + POS.map(function (p) {
                  return '<option value="' + p[0] + '"' + (num(e.position) === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
              }).join('')
              + '</select></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">深度</label>'
              + '<input class="ti" type="number" min="0" max="9999" value="' + num(e.depth, 4) + '" data-f="depth" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">Order</label>'
              + '<input class="ti" type="number" min="0" max="9999" value="' + num(e.order, 100) + '" data-f="order" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">触发%</label>'
              + '<input class="ti" type="number" min="0" max="100" value="' + num(e.probability, 100) + '" data-f="probability" data-uid="' + e.uid + '"></div>'
              + '</div>';

            h += '<div class="grid2" style="margin-top:9px">'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">包含组</label>'
              + '<input class="ti" type="text" placeholder="同组只激活一条" value="' + escA(e.group || '') + '" data-f="group" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">组权重</label>'
              + '<input class="ti" type="number" min="1" value="' + num(e.groupWeight, 100) + '" data-f="groupWeight" data-uid="' + e.uid + '"></div>'
              + '</div>';

            h += '<div class="grid3" style="margin-top:9px">'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">Sticky 条数</label>'
              + '<input class="ti" type="number" min="0" placeholder="无" value="' + (e.sticky == null ? '' : e.sticky) + '" data-f="sticky" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">Cooldown</label>'
              + '<input class="ti" type="number" min="0" placeholder="无" value="' + (e.cooldown == null ? '' : e.cooldown) + '" data-f="cooldown" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">Delay</label>'
              + '<input class="ti" type="number" min="0" placeholder="无" value="' + (e.delay == null ? '' : e.delay) + '" data-f="delay" data-uid="' + e.uid + '"></div>'
              + '</div>';

            /* 高级 */
            var ao = !!advOpen[e.uid];
            h += '<div class="adv' + (ao ? ' open' : '') + '">'
              + '<div class="advh" data-act="adv" data-uid="' + e.uid + '">' + SV.chev + '高级设置</div>'
              + '<div class="advb">'
              + '<div class="fld"><label>关键词逻辑</label>'
              + '<select class="ts" data-f="selectiveLogic" data-uid="' + e.uid + '">'
              + LOGIC.map(function (l) {
                  return '<option value="' + l[0] + '"' + (num(e.selectiveLogic) === l[0] ? ' selected' : '') + '>' + l[1] + ' · ' + l[2] + '</option>';
              }).join('')
              + '</select></div>'
              + '<div class="grid2">'
              + ckField(e, 'selective', '选择性（要关键词才触发）')
              + ckField(e, 'useProbability', '启用触发概率')
              + ckField(e, 'vectorized', '向量化')
              + ckField(e, 'excludeRecursion', '不被递归激活')
              + ckField(e, 'preventRecursion', '不激活其它条目')
              + ckField(e, 'ignoreBudget', '忽略预算')
              + ckField(e, 'groupOverride', '组内优先')
              + ckField(e, 'addMemo', '显示为备忘')
              + '</div>'
              + '<div class="grid2" style="margin-top:8px">'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">扫描深度（覆盖全局）</label>'
              + '<input class="ti" type="number" placeholder="用全局" value="' + (e.scanDepth == null ? '' : e.scanDepth) + '" data-f="scanDepth" data-uid="' + e.uid + '"></div>'
              + '<div><label style="display:block;font-size:10.5px;color:var(--ink3);margin-bottom:3px">Outlet 名称</label>'
              + '<input class="ti" type="text" placeholder="无" value="' + escA(e.outletName || '') + '" data-f="outletName" data-uid="' + e.uid + '"></div>'
              + '</div>'
              + '<div class="fld" style="margin-top:9px"><label>附加匹配源</label>'
              + '<div class="grid2">'
              + ckField(e, 'matchCharacterDescription', '角色描述')
              + ckField(e, 'matchCharacterPersonality', '角色性格')
              + ckField(e, 'matchScenario', '场景')
              + ckField(e, 'matchPersonaDescription', '用户人设')
              + ckField(e, 'matchCreatorNotes', '作者注释')
              + ckField(e, 'matchCharacterDepthPrompt', '深度提示')
              + '</div></div>'
              + '<div class="kv" style="margin-top:8px"><span>UID <b>' + e.uid + '</b></span>'
              + '<span>字符 <b>' + fmt(clen(e)) + '</b></span>'
              + '<span>角色 <b>' + (e.role == null ? '—' : (e.role === 0 ? '系统' : e.role === 1 ? '用户' : 'AI')) + '</b></span></div>'
              + '</div></div>';

            h += '<div class="eact">'
              + '<button class="bt" data-act="dup" data-uid="' + e.uid + '">' + SV.copy + '副本</button>'
              + '<button class="bt danger" data-act="del" data-uid="' + e.uid + '">' + SV.trash + '删除</button>'
              + '<span class="grow"></span>'
              + '<button class="bt done" data-act="collapse" data-uid="' + e.uid + '">' + SV.check + '收起</button>'
              + '</div>';

            return h;
        }

        function ckField(e, field, label) {
            return '<label class="ck"><input type="checkbox" data-f="' + field + '" data-uid="' + e.uid + '"'
                 + (e[field] ? ' checked' : '') + '>' + label + '</label>';
        }

        /* 书页顶部的统计块：单独成函数是为了增量渲染时能只换这一块 */
        function bookHeadHTML(b, s) {
            s = s || bstat(b);
            var h = '<div class="bhead">'
              + '<div class="bh2"><span>共 <b>' + s.tot + '</b> 条</span>'
              + '<span>启用 <b>' + s.on + '</b></span>'
              + '<span>常驻 <b>' + s.always + '</b></span>'
              + '<span>约 <b>' + ktok(s.tok) + '</b> tok</span>'
              + '<span class="grow"></span>'
              + '<span class="sw' + (b.on ? ' on' : '') + '" data-act="tbook" data-name="' + escA(b.name) + '" title="整本启用 / 停用"></span>'
              + '</div>'
              + '<div class="bar">'
              + '<span class="s1" style="width:' + (s.tot ? s.always / s.tot * 100 : 0) + '%"></span>'
              + '<span class="s2" style="width:' + (s.tot ? s.key / s.tot * 100 : 0) + '%"></span>'
              + '<span class="s3" style="width:' + (s.tot ? s.off / s.tot * 100 : 0) + '%"></span>'
              + '</div>'
              + '</div>';

            if (!b.on) {
                h += '<div class="warn">' + SV.warn + '<span><b>整本书没有启用</b>，下面怎么改都不会生效。点右上角开关打开它。</span></div>';
            }
            return h;
        }

        function fbarHTML(s) {
            return '<div class="fbar">'
              + fchip('all', '全部', s.tot)
              + fchip('always', '常驻', s.always)
              + fchip('key', '关键词', s.key)
              + fchip('off', '禁用', s.off)
              + '<span class="grow" style="flex:1"></span>'
              + '<span class="chip" data-act="newent" style="height:25px">' + SV.plus + '新建条目</span>'
              + '</div>';
        }

        function viewBook() {
            var b = findBook(curName);
            if (!b) { view = 'list'; renderBody(); return; }
            var s = bstat(b);
            var list = filteredEnts();

            var h = bookHeadHTML(b, s) + fbarHTML(s);

            h += '<div class="ents">';
            if (!list.length) {
                h += '<div class="empty">' + (q || fstate !== 'all' ? '这个筛选下没有条目' : '这本书还没有条目') + '</div>';
            } else {
                h += list.map(entRow).join('');
            }
            h += '</div>';

            document.getElementById('mfWbBody').innerHTML = h;
        }

        function fchip(k, label, n) {
            return '<span class="fchip' + (fstate === k ? ' on' : '') + '" data-act="fstate" data-k="' + k + '">'
              + label + ' <span class="n">' + n + '</span></span>';
        }

        function renderBatch() {
            var bb = document.getElementById('mfWbBatch');
            if (!bb) return;
            if (!batch || view !== 'book') { bb.className = 'batchbar'; bb.innerHTML = ''; return; }
            var n = 0;
            for (var k in selUid) if (selUid[k]) n++;
            bb.className = 'batchbar on';
            bb.innerHTML = '<span style="font-size:11.5px;color:var(--ink2)">已选 <b>' + n + '</b> 条</span>'
              + '<span class="grow"></span>'
              + '<button class="bt" data-act="bselall">全选</button>'
              + '<button class="bt" data-act="benable">启用</button>'
              + '<button class="bt" data-act="bdisable">禁用</button>'
              + '<button class="bt danger" data-act="bdel">' + SV.trash + '</button>';
        }

        /* ── 渲染总入口 ───────────────────────────────────────────────────── */
        function renderBody() {
            if (!BOOKS.length) {
                document.getElementById('mfWbHdr').innerHTML = '';
                document.getElementById('mfWbSrow').innerHTML = '';
                document.getElementById('mfWbBody').innerHTML =
                    '<div class="mfld">正在读取世界书…<br><span style="font-size:11px">'
                    + esc(stText || '第一次打开要拉一遍全部条目') + '</span></div>';
                return;
            }
            renderHdr();
            renderSrow();
            if (view === 'book' && findBook(curName)) viewBook(); else viewList();
            renderBatch();
        }

        function render() {
            var sc = root ? root.scrollTop : 0;
            renderBody();
            if (root) root.scrollTop = sc;
        }

        /* ★★★ 增量渲染（2026-11-05 v2.0.2 性能）：
           原来点开一条条目会走 render() → 整块 innerHTML 重画 149 条，
           实测 125ms（冷）/ 30ms（热）。书越大越慢，500 条的书会明显卡。
           现在只替换那一个 .world_entry 节点，顺手更新统计条的数字。
           只用于「单条操作」：展开 / 收起 / 高级设置 / 启停。
           筛选、排序、搜索、新建、删除这些会改变行集合的，仍然走全量 render()。 */
        function renderOne(uid) {
            var body = document.getElementById('mfWbBody');
            if (!body) return;
            var we = body.querySelector('.world_entry[data-uid="' + uid + '"]');
            var e = entByUid(uid);
            if (!we || !e) { render(); return; }        /* 找不到就退回全量，别赌 */

            var tmp = document.createElement('div');
            tmp.innerHTML = entRow(e);
            var neu = tmp.firstElementChild;
            if (!neu) { render(); return; }
            we.replaceWith(neu);

            /* 统计条和筛选条上的数字会变（启用条数、token 总量） */
            var b = findBook(curName);
            if (b) {
                var s = bstat(b);
                var hd = body.querySelector('.bhead');
                if (hd) hd.outerHTML = bookHeadHTML(b, s);
                var fb = body.querySelector('.fbar');
                if (fb) fb.outerHTML = fbarHTML(s);
            }
        }

        /* ── 书操作 ───────────────────────────────────────────────────────── */
        /* 整本启用 / 停用 = 把这本书加进「全局世界书」多选（对所有聊天生效）。
           ★ 匹配用书名（textContent），不是 option.value —— 原因见 globalOnSet 上面的注释。
           ★ 改完必须走 jQuery 的 .val(...).trigger('change')：
             ① 原生把 change 绑在 $('#world_info') 上，jQuery trigger 才会调到它；
             ② select2 也监听 change，只 dispatch 原生事件的话，原生下拉里的标签不会更新，
                下次调出原生面板会看到状态对不上。 */
        function setBookOn(name, on) {
            var sel = document.getElementById('world_info');
            if (!sel) { setStatus('err', '找不到原生世界书下拉（#world_info）'); return false; }

            var want = String(name).trim().toLowerCase();
            var opts = [].slice.call(sel.options);
            var idx = -1;
            for (var i = 0; i < opts.length; i++) {
                if (optName(opts[i]).toLowerCase() === want) { idx = i; break; }
            }
            if (idx < 0) {
                console.warn('[mf-wb] 全局启用下拉里没有这本书：' + name,
                    opts.map(optName));
                setStatus('err', '全局启用下拉里没这本书：' + name);
                return false;
            }

            opts[idx].selected = !!on;

            /* 把当前所有选中项按 value（索引）收集起来交给 jQuery */
            var vals = [];
            opts.forEach(function (o, k) {
                if (o.selected) vals.push(o.value !== '' ? o.value : String(k));
            });

            var $ = window.jQuery;
            if ($ && $(sel).length) {
                $(sel).val(vals).trigger('change');
            } else {
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }

            var b = findBook(name);
            if (b) b.on = !!on;
            return true;
        }

        function createBook() {
            var name = prompt('新建世界书，输入名字：', '新世界书 ' + new Date().toLocaleDateString('zh-CN'));
            if (!name) return;
            name = name.trim();
            if (!name) return;
            if (findBook(name)) { alert('已经有同名世界书了'); return; }

            var ctx = getCtx();
            var p = (ctx && ctx.saveWorldInfo)
                ? Promise.resolve(ctx.saveWorldInfo(name, { entries: {} }, true))
                : apiPost('/api/worldinfo/edit', { name: name, data: { entries: {} } });

            setStatus('on', '正在新建…');
            p.then(function () {
                return (ctx && ctx.updateWorldInfoList) ? ctx.updateWorldInfoList() : null;
            }).then(function () {
                /* ★ 不重新 loadAll：updateWorldInfoList 之后原生下拉已更新，
                     但再从后端拉一遍有延迟（而且新空书可能还没进 world_names）。
                     直接在本地落一条空书，立刻进得去；下一次重开面板会自然对齐。 */
                if (!findBook(name)) {
                    BOOKS.push({ name: name, on: false, pinned: pinnedOf(name), data: { entries: {} } });
                    BOOKS.sort(function (a, b) { return a.pinned === b.pinned ? (a.name > b.name ? 1 : -1) : (a.pinned ? -1 : 1); });
                }
                setStatus('ok', '已新建「' + name + '」');
                view = 'book'; curName = name; q = ''; fstate = 'all'; openUid = {}; selUid = {}; batch = false;
                retitle(); render();
                if (root) root.scrollTop = 0;
            }).catch(function (e) {
                setStatus('err', '新建失败：' + (e && e.message ? e.message : e));
            });
        }

        function deleteBook(name) {
            var b = findBook(name);
            if (!b) return;
            if (!confirm('删除整本世界书「' + name + '」？\n\n里面 ' + entList(b).length + ' 条会一起没，不可撤销。')) return;

            setStatus('on', '正在删除…');
            apiPost('/api/worldinfo/delete', { name: name }).then(function () {
                var ctx = getCtx();
                return (ctx && ctx.updateWorldInfoList) ? ctx.updateWorldInfoList() : null;
            }).then(function () {
                /* 本地也摘掉，不用等重读 */
                BOOKS = BOOKS.filter(function (x) { return x.name !== name; });
                if (curName === name) { view = 'list'; curName = null; }
                setStatus('ok', '已删除「' + name + '」');
                render();
                loadAll(true).catch(function () { });
            }).catch(function (e) {
                setStatus('err', '删除失败：' + (e && e.message ? e.message : e));
            });
        }

        /* 导出本书：自己造 Blob 下载，不走原生按钮
           ★ 为什么不点原生 #world_popup_export：它导的是 #world_editor_select 里当前选中的书，
             而我们的面板切书时不同步那个下拉 → 会导出错的书。 */
        function exportBook(name) {
            var b = findBook(name || curName);
            if (!b) return;
            try {
                var blob = new Blob([JSON.stringify(b.data, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = (b.name || 'worldbook') + '.json';
                document.body.appendChild(a);
                a.click();
                setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
                setStatus('ok', '已导出「' + b.name + '」');
            } catch (e) {
                setStatus('err', '导出失败：' + (e && e.message ? e.message : e));
            }
        }

        /* 临时切回原生面板：改名 / 导入 / 排序这些没做的功能，从这里进原生去做。
           刷新酒馆就恢复我们的面板。 */
        function useNative() {
            wi.classList.remove('mf-wb-on');
            root.style.display = 'none';
            alert('已切回原生世界书面板。\n\n改名 / 导入 / 应用排序请在这里做；\n刷新酒馆（Ctrl+R）后会回到新版面板。');
        }

        /* ── 条目操作 ─────────────────────────────────────────────────────── */
        function maxUid(b) {
            var m = -1;
            entList(b).forEach(function (e) { if (num(e.uid) > m) m = num(e.uid); });
            return m;
        }

        function newEntryInBook() {
            var b = findBook(curName);
            if (!b) return;
            var uid = maxUid(b) + 1;
            var e = newEntry(uid);
            b.data.entries[uid] = e;
            openUid[uid] = true;
            fstate = 'all'; q = '';
            touch(b.name);
            render();
            var el = document.querySelector('#mfWb .world_entry[data-uid="' + uid + '"] input[data-f="comment"]');
            if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
        }

        function dupEntry(uid) {
            var b = findBook(curName);
            var src = entByUid(uid);
            if (!b || !src) return;
            var c = JSON.parse(JSON.stringify(src));
            c.uid = maxUid(b) + 1;
            c.comment = (src.comment || '') + ' (副本)';
            b.data.entries[c.uid] = c;
            openUid[c.uid] = true;
            touch(b.name);
            render();
        }

        function delEntry(uid) {
            var b = findBook(curName);
            var e = entByUid(uid);
            if (!b || !e) return;
            if (!confirm('删除「' + (e.comment || '无标题') + '」？不可撤销。')) return;
            delete b.data.entries[uid];
            delete openUid[uid];
            delete selUid[uid];
            touch(b.name);
            render();
        }

        /* ── 事件：点击 ───────────────────────────────────────────────────── */
        function onClick(ev) {
            var t = ev.target.closest('[data-act]');
            var kd = ev.target.closest('[data-kdel]');

            /* 删关键词 */
            if (kd) {
                var box = kd.closest('.kedit');
                if (!box) return;
                var el0 = entByUid(+box.dataset.uid);
                var f0 = box.dataset.kf;
                if (!el0) return;
                var arr = (el0[f0] || []).slice();
                arr.splice(+kd.dataset.kdel, 1);
                el0[f0] = arr;
                touch(curName);
                render();
                return;
            }

            if (!t) return;
            var act = t.dataset.act;

            if (act === 'open') {
                var b = findBook(t.dataset.name);
                if (b) {
                    view = 'book'; curName = b.name; q = ''; fstate = 'all';
                    openUid = {}; selUid = {}; batch = false; retitle(); render();
                    if (root) root.scrollTop = 0;
                }
                return;
            }
            if (act === 'jump') {
                var b2 = findBook(t.dataset.name);
                if (b2) {
                    view = 'book'; curName = b2.name; fstate = 'all';
                    openUid = {}; openUid[+t.dataset.uid] = true; selUid = {}; batch = false;
                    q = ''; retitle(); render();
                }
                return;
            }
            if (act === 'back') {
                view = 'list'; curName = null; q = ''; batch = false; selUid = {}; openUid = {};
                retitle(); render();
                if (root) root.scrollTop = 0;
                return;
            }
            if (act === 'pin') {
                var bp = findBook(t.dataset.name);
                if (bp) { setPin(bp.name, !bp.pinned); render(); }
                ev.stopPropagation();
                return;
            }
            if (act === 'tbook') {
                var bt = findBook(t.dataset.name);
                if (bt) {
                    var okOn = setBookOn(bt.name, !bt.on);
                    if (okOn) setStatus('ok', (bt.on ? '已启用「' : '已停用「') + bt.name + '」');
                    render();
                }
                ev.stopPropagation();
                return;
            }
            if (act === 'expand') {
                var uid = +t.dataset.uid;
                if (batch) { selUid[uid] = !selUid[uid]; render(); return; }
                openUid[uid] = !openUid[uid];
                renderOne(uid);          /* 只重画这一条，不碰其余 148 条 */
                return;
            }
            if (act === 'kill') {
                var ke = entByUid(+t.dataset.uid);
                if (ke) { ke.disable = !ke.disable; touch(curName); renderOne(ke.uid); }
                ev.stopPropagation();
                return;
            }
            if (act === 'collapse') {
                var cu = +t.dataset.uid;
                openUid[cu] = false; renderOne(cu); return;
            }
            if (act === 'adv') {
                var au = +t.dataset.uid;
                advOpen[au] = !advOpen[au]; renderOne(au); return;
            }
            if (act === 'fstate') { fstate = t.dataset.k; render(); return; }
            if (act === 'clrq') { q = ''; render(); return; }
            if (act === 'gset') { gsetOpen = !gsetOpen; render(); return; }
            if (act === 'newbook') { createBook(); return; }
            if (act === 'delbook') { closeMore(); deleteBook(curName); return; }
            if (act === 'more') {
                var mm = document.getElementById('mfWbMore');
                if (mm) mm.classList.toggle('on');
                ev.stopPropagation();
                return;
            }
            if (act === 'export') { closeMore(); exportBook(curName); return; }
            if (act === 'native') { closeMore(); useNative(); return; }
            if (act === 'newent') { newEntryInBook(); return; }
            if (act === 'dup') { dupEntry(+t.dataset.uid); return; }
            if (act === 'del') { delEntry(+t.dataset.uid); return; }

            if (act === 'batch') { batch = !batch; selUid = {}; render(); return; }
            if (act === 'bselall') {
                filteredEnts().forEach(function (e) { selUid[e.uid] = true; });
                render(); return;
            }
            if (act === 'benable' || act === 'bdisable') {
                var on = act === 'benable';
                var b3 = findBook(curName);
                if (!b3) return;
                var cnt = 0;
                for (var u in selUid) {
                    if (!selUid[u]) continue;
                    var ee = b3.data.entries[u];
                    if (ee) { ee.disable = !on; cnt++; }
                }
                if (cnt) touch(curName);
                render();
                return;
            }
            if (act === 'bdel') {
                var b4 = findBook(curName);
                if (!b4) return;
                var n = 0;
                for (var u2 in selUid) if (selUid[u2]) n++;
                if (!n) return;
                if (!confirm('删除选中的 ' + n + ' 条？不可撤销。')) return;
                for (var u3 in selUid) if (selUid[u3]) delete b4.data.entries[u3];
                selUid = {}; batch = false;
                touch(curName);
                render();
                return;
            }
        }

        function closeMore() {
            var mm = document.getElementById('mfWbMore');
            if (mm) mm.classList.remove('on');
        }
        document.addEventListener('click', function (ev) {
            var mm = document.getElementById('mfWbMore');
            if (!mm || !mm.classList.contains('on')) return;
            if (ev.target.closest && ev.target.closest('.morewrap')) return;
            mm.classList.remove('on');
        });

        /* ── 事件：三档 ───────────────────────────────────────────────────── */
        function onTri(ev) {
            var btn = ev.target.closest('.tri button');
            if (!btn) return;
            ev.stopPropagation();
            var we = btn.closest('.world_entry');
            if (!we) return;
            var e = entByUid(+we.dataset.uid);
            if (!e) return;
            var tr = btn.dataset.tr;
            if (tr === 'off') e.disable = true;
            else if (tr === 'always') { e.disable = false; e.constant = true; e.vectorized = false; }
            else { e.disable = false; e.constant = false; e.vectorized = false; }
            touch(curName);
            render();
        }

        /* ── 事件：输入（只改内存，不重渲染） ─────────────────────────────── */
        function onInput(ev) {
            var el = ev.target;
            var f = el.dataset.f;
            if (!f) return;
            var we = el.closest('.world_entry');
            if (!we) return;
            var e = entByUid(+we.dataset.uid);
            if (!e) return;

            var numFields = ['depth', 'order', 'probability', 'groupWeight'];
            var nulFields = ['sticky', 'cooldown', 'delay', 'scanDepth'];

            if (numFields.indexOf(f) >= 0) { e[f] = Number(el.value) || 0; touch(curName); return; }
            if (nulFields.indexOf(f) >= 0) { e[f] = N(el.value); touch(curName); return; }

            if (f === 'comment') {
                e.comment = el.value;
                var et = we.querySelector('.ehead .et');
                if (et) et.textContent = el.value || '无标题';
                touch(curName);
                return;
            }
            if (f === 'group') { e.group = el.value; touch(curName); return; }
            if (f === 'outletName') { e.outletName = el.value; touch(curName); return; }
            if (f === 'content') {
                e.content = el.value;
                var lr = we.querySelector('.fld .r');
                if (lr) lr.textContent = fmt(tokOf(e.content.length)) + ' tok';
                var tk = we.querySelector('.tok');
                if (tk) tk.textContent = ktok(tokOf(e.content.length));
                touch(curName);
                return;
            }
            if (f === 'position') { e.position = Number(el.value); touch(curName); return; }
            if (f === 'selectiveLogic') { e.selectiveLogic = Number(el.value); touch(curName); return; }

            /* 复选 */
            if (el.type === 'checkbox') {
                e[f] = !!el.checked;
                if (f === 'vectorized' && el.checked) e.constant = false;
                touch(curName);
                /* 向量化会改档位徽标，需要重渲染 */
                if (f === 'vectorized') render();
                return;
            }
        }

        /* ── 事件：关键词输入框 ───────────────────────────────────────────── */
        function onKey(ev) {
            var inp = ev.target;
            if (!inp.closest || !inp.closest('.kedit')) return;
            var box = inp.closest('.kedit');
            var e = entByUid(+box.dataset.uid);
            if (!e) return;
            var f = box.dataset.kf;

            function add(v) {
                v = String(v || '').trim().replace(/,$/, '');
                if (!v) return;
                var arr = (e[f] || []).slice();
                v.split(/[,，]/).forEach(function (x) {
                    x = x.trim();
                    if (x && arr.indexOf(x) < 0) arr.push(x);
                });
                e[f] = arr;
                touch(curName);
                render();
                var nb = document.querySelector('#mfWb .kedit[data-uid="' + e.uid + '"][data-kf="' + f + '"] input');
                if (nb) nb.focus();
            }

            if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); add(inp.value); return; }
            if (ev.key === 'Backspace' && !inp.value) {
                var a = (e[f] || []).slice();
                if (a.length) { a.pop(); e[f] = a; touch(curName); render(); }
            }
        }

        function onBlur(ev) {
            var inp = ev.target;
            if (!inp.closest || !inp.closest('.kedit')) return;
            var box = inp.closest('.kedit');
            var e = entByUid(+box.dataset.uid);
            if (!e || !inp.value.trim()) return;
            var f = box.dataset.kf;
            var arr = (e[f] || []).slice();
            inp.value.split(/[,，]/).forEach(function (x) {
                x = x.trim();
                if (x && arr.indexOf(x) < 0) arr.push(x);
            });
            e[f] = arr;
            touch(curName);
            render();
        }

        /* ── 组装 DOM ─────────────────────────────────────────────────────── */
        var root = document.createElement('div');
        root.id = 'mfWb';
        root.innerHTML =
            '<div class="wrap">'
          + '<div id="mfWbHdr"></div>'
          + '<div id="mfWbSrow"></div>'
          + '<div id="mfWbSt" class="svst"></div>'
          + '<div id="mfWbBody"></div>'
          + '<div class="batchbar" id="mfWbBatch"></div>'
          + '</div>';

        wi.appendChild(root);
        wi.classList.add('mf-wb-on');

        /* 抽屉标题改成自己的（原生 title 是 "World Info"）
           ★ mfOrig 必须存「世界书」而不是原生英文：retitle() 返回一级页时会恢复 mfOrig，
             存英文的话每次返回都会变回 "World Info"（踩过）。 */
        var titleEl = wi.querySelector('#WorldInfoheader h3 span');
        if (titleEl) {
            titleEl.dataset.mfOrig = '世界书';
            titleEl.textContent = '世界书';
        }

        function retitle() {
            /* 抽屉头永远「世界书」：书页的书名由面板自己的顶栏（← 书名）承担，
               两边都写书名会重复。 */
            if (!titleEl) return;
            titleEl.textContent = '世界书';
        }

        root.addEventListener('click', onClick);
        root.addEventListener('click', onTri);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        root.addEventListener('keydown', onKey);
        root.addEventListener('blur', onBlur, true);
        root.addEventListener('scroll', function () { lastScroll = root.scrollTop; });

        /* 全局设置面板的写入：只处理带 data-g 的那个控件 */
        root.addEventListener('change', function (ev) {
            var el = ev.target;
            if (!el.dataset || !el.dataset.g) return;
            writeOne(el.dataset.g);
        });
        root.addEventListener('input', function (ev) {
            var el = ev.target;
            if (!el.dataset || !el.dataset.g) return;
            writeOne(el.dataset.g);
        });

        /* 原生那边全局启用的书变了（比如切角色卡自动加书）→ 刷新我们的 on 标记
           ★ 用委托而不要直接绑在 #world_info 上：updateWorldInfoList() 会 empty + 重建选项，
             一旦原生把 select 元素整个换掉，直接绑的监听就永久失效了（踩过）。 */
        var holderEl = wi.querySelector('#wi-holder');
        if (holderEl) {
            holderEl.addEventListener('change', function (ev) {
                if (!ev.target || ev.target.id !== 'world_info') return;
                var onSet = globalOnSet();
                BOOKS.forEach(function (b) { b.on = !!onSet[b.name]; });
                if (view === 'list') render();
            });
        }

        /* ── 启动 ─────────────────────────────────────────────────────────── */
        function start() {
            renderBody();
            loadAll(false).then(function () { render(); }).catch(function () { render(); });
        }

        /* 抽屉打开时才拉数据（关着拉没意义，还拖慢启动） */
        var pre = function () {
            if (wi.classList.contains('closedDrawer')) return;
            if (BOOKS.length && (Date.now() - LOADED_AT) < 60000) return;
            loadAll(false).then(function () { render(); }).catch(function () { });
        };
        new MutationObserver(pre).observe(wi, { attributes: true, attributeFilter: ['class'] });
        setTimeout(start, 1200);
    }

    /* ★ 自启动：线上 boot() 里也会调一次，重复进来会被 wi.dataset.mfWb 挡掉。
         本地预览页没有 boot，全靠这一句。 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initWorldPanel(0); });
    } else {
        initWorldPanel(0);
    }


    function boot() {
        APP.modules.styleGuard = true;
        initStyleGuard();

        APP.modules.qrHandle = true;
        initQuickReplyHandle();

        APP.modules.presetPanel = true;
        initPresetPanel();

        APP.modules.topbar = true;
        initTopbar();

        APP.modules.apiPanel = true;
        initApiPanel();

        /* 旧的跨书搜索栏被全功能面板取代；函数保留在上面，回滚只需把这两行换回去 */
        APP.modules.worldPanel = true;
        initWorldPanel();

        console.log(LOG, '扩展已启动，模块：', Object.keys(APP.modules).join(', '));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
