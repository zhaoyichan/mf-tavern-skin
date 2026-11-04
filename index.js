/* ── 发布版补充 · 关键数据 + 踩坑清单（完整版见 README.md 顶部） ───────────
   仓库 https://github.com/zhaoyichan/mf-tavern-skin   · v1.9.0
   ★ 真机 #top-bar 是 absolute 空壳，9 个 drawer 全在 #top-settings-holder 里；
     --topBarBlockSize 同时被 #sheld 的 top / height 引用，归零正文才铺满。
   ★ 正文字号只能写 --mf-read-scale（85%~160%，步进 5%），
     绝不能改 --fontScale —— 会连带顶栏高度和输入框。
   ★ 玻璃观感来自「透 + 105° 斜向受光面」，不是亮度；背后有正文时要开 blur(16px)，
     否则会透出字影。
   ★ 备份绝不放 third-party/：酒馆按目录扫 manifest，多副本 = 多份 skin.css 互压
     = 启动后整个界面卡死，且日志无任何报错。
   ★ 测试页必须有 viewport meta，否则 CDP mobile 下 vw=980，媒体查询全部误判。
   ─────────────────────────────────────────────────────────────────────── */
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

    var VERSION = '1.9.0';
    var APP = window.__mfTavernSkin = { version: VERSION, modules: {} };
    var LOG = '[米白护眼]';

    var head = document.head || document.getElementsByTagName('head')[0];

    function byId(id) { return document.getElementById(id); }

    function svg(paths, vb) {
        return '<svg viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor"' +
            ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 1 · style-guard
       把扩展自己的 <link href="…/mf-tavern-skin/skin.css"> 钉在 head 末尾。
       为什么：主题的 custom_css 由 power-user.js 在运行中 append 到末尾，
               Stylish 主题里大量 !important 规则，靠优先级压不住，
               只能靠顺序 —— 谁最后谁赢。
       ═════════════════════════════════════════════════════════════════════ */
    function initStyleGuard() {
        var moves = 0;

        function findSkin() {
            return document.querySelector('link[rel="stylesheet"][href*="mf-tavern-skin"]')
                || byId('mf-skin');
        }

        function pinToEnd() {
            var node = findSkin();
            if (!node) return false;
            if (head.lastElementChild !== node) {
                head.appendChild(node);          // 移动同一节点，不会重新下载
                moves++;
            }
            return true;
        }

        // 扩展 CSS 和 JS 是并发加载的，link 可能比本脚本晚到 → 多试几次
        pinToEnd();
        [200, 900, 2500, 6000].forEach(function (t) { setTimeout(pinToEnd, t); });

        // 主题一换 / 一改自定义 CSS，head 末尾就会多一个 <style>，立刻挪回来
        try {
            var obs = new MutationObserver(function (list) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i].addedNodes && list[i].addedNodes.length) { pinToEnd(); return; }
                }
            });
            obs.observe(head, { childList: true });
        } catch (e) {
            console.warn(LOG, '样式守护没起来，皮肤可能被主题盖住', e);
        }

        setTimeout(function () {
            if (!findSkin()) {
                console.warn(LOG, 'skin.css 没找到：检查扩展是否启用，或 manifest.json 的 css 字段');
            } else {
                console.log(LOG, '皮肤 v' + VERSION + ' 已就位（样式表提升 ' + moves + ' 次）');
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
        setInterval(function () {
            var h = byId(HANDLE_ID);
            if (!h) return;
            h.style.display = byId('qr--bar') ? '' : 'none';
        }, 1000);
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
        setInterval(function () {
            try {
                var L = listEl();
                if (!L || !L.getClientRects().length) return;      // 面板没开就不管
                var rows = L.querySelectorAll(ROW);
                if (!rows.length) return;
                if (L.querySelectorAll('[data-mf-prev]').length >= rows.length) return;
                buildShell();
                bindList();
                bindGlobals();
                decorateAll();
                console.log(LOG, '自愈：补装饰 ' + rows.length + ' 行');
            } catch (e) { }
        }, 2500);

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
        var KEY_FS = 'mf_reader_scale';   /* 正文字号倍率，1 = 原生 15px */

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
            var on = isOn(), v = fsVal();
            /* 所有文本赋值都先比一次：这个函数被 apply() 带着跑，频率不低，
               无脑写 textContent 会让浏览器把这几行字反复标脏、重排。 */
            var st = box.querySelector('.mf-ext-st');
            var stTxt = on ? '扩展版 · 已接管' : '酒馆原生';
            if (st && st.textContent !== stTxt) st.textContent = stTxt;
            box.classList.toggle('is-off', !on);
            var btnToggle = box.querySelector('[data-a="toggle"]');
            var tgTxt = on ? '还原成原生顶栏' : '用回扩展顶栏';
            if (btnToggle && btnToggle.textContent !== tgTxt) btnToggle.textContent = tgTxt;
            var val = box.querySelector('.mf-ext-v');
            var vTxt = Math.round(v * 100) + '%';
            if (val && val.textContent !== vTxt) val.textContent = vTxt;
            var dn = box.querySelector('[data-a="fs-"]');
            var up = box.querySelector('[data-a="fs+"]');
            if (dn) dn.disabled = v <= FS_MIN + 1e-6;
            if (up) up.disabled = v >= FS_MAX - 1e-6;
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
                '<div class="mf-ext"><div class="mf-ext-h"><b>米白皮肤 · 顶栏</b>' +
                '<span class="mf-ext-st"></span></div>' +
                '<div class="mf-ext-row"><span class="mf-ext-l">顶栏外观</span>' +
                '<button type="button" class="mf-ext-btn" data-a="toggle"></button></div>' +
                '<div class="mf-ext-row"><span class="mf-ext-l">正文字号</span>' +
                '<span class="mf-ext-fs"><button type="button" data-a="fs-">A−</button>' +
                '<span class="mf-ext-v"></span>' +
                '<button type="button" data-a="fs+">A+</button></span></div>' +
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
                if (a === 'toggle') setOn(!isOn());
                else if (a === 'panel') { if (!isOn()) setOn(true); openPanel(); }
                else if (a === 'fs-') bumpFs(-1);
                else if (a === 'fs+') bumpFs(1);
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
    function boot() {
        APP.modules.styleGuard = true;
        initStyleGuard();

        APP.modules.qrHandle = true;
        initQuickReplyHandle();

        APP.modules.presetPanel = true;
        initPresetPanel();

        APP.modules.topbar = true;
        initTopbar();

        console.log(LOG, '扩展已启动，模块：', Object.keys(APP.modules).join(', '));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
