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

    var VERSION = '2.0.10';
    var APP = window.__mfTavernSkin = { version: VERSION, modules: {} };
    var LOG = '[米白护眼]';

    var head = document.head || document.getElementsByTagName('head')[0];

    function byId(id) { return document.getElementById(id); }

    function svg(paths, vb) {
        return '<svg viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor"' +
            ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 1 · 主题接管（v2.0.4 重写：不再在别人的主题上面叠一层）
       ★★ 2026-11-06 用户实测并纠正：不是「安装库链那一次」，
         是**每次退出酒馆再打开**都会依次变三种主题
         报纸 → 酒馆原版 → 米白。原话：「这个扩展本身就是个主题，
         为什么前面还要有主题」「我要的是秒加载」。

       ★ 真根因（查过 ST 1.19.0 的 index.html + power-user.js，不是猜）：
         ① index.html 的 head 里 15 个 <link> 全是酒馆自己的 CSS，
            **没有扩展 CSS** —— 扩展的 skin.css / index.js 是启动后运行时
            才动态插进 head 的。所以扩展永远比主题晚。
         ② 启动早期 applyPowerUserSettings() → applyCustomCSS() 把
            power_user.custom_css（手机上选的是「报纸(无滤镜)」主题，
            15.5KB CSS）注入 <style id="custom-style"> → 第一段「报纸」。
         ③ 旧版 initStyleGuard() 的 muteTheme() 把这个 <style>
            disabled=true → 旧主题没了、新 CSS 还没接管 → **第二段「原版」**。
         ④ pinOnce() 把 skin.css 的 <link> 挪到 head 末尾 → 第三段「米白」。
         ⑤ [80, 260, 900, 2200]ms 一串 tick 反复做 ③④，
            把这三段拉长到肉眼数得出来。
         → 「抢顺序 + 关掉对方」这套叠加式设计本身就是病根，
           调 !important / z-index / 遮罩都治不了。

       ★ 新做法：把皮肤 CSS **写进酒馆自己的主题槽位**
         power_user.custom_css。ST 启动早期 applyCustomCSS() 会读它并注入
         <style id="custom-style">，早于扩展加载 → 从下一次冷启动起
         **第一帧就是米白**，报纸和中间那版原版都不再出现。
         扩展的 <link> 只钉一次做兜底，不再挪来挪去、不再 disable 主题。

       ★ 关键数据（2026-11-06 实测，别改回去）：
         · 落盘位置：data/default-user/settings/appearance.json →
           power_user.custom_css；themes/*.json 里每个主题也带 custom_css。
         · applyCustomCSS() 从 power_user.custom_css 取值，同步给
           #customCSS textarea，写入 <style id="custom-style">（head 末尾）。
           源码 public/scripts/power-user.js。
         · #customCSS 是设置面板里的 textarea，触发它的 input 事件就是
           ST 官方保存路径（写 power_user.custom_css + saveSettingsDebounced）。
         · user.css 是 head 里最后一个静态 <link>（index.html:46），
           第一帧就生效，但扩展 JS 写不了磁盘文件，手机端指望不上。
       ★ 用户拍板：「不用管，我没打算关」→ 不保留旧主题、不做还原路径。
         已知限制：mf_skin_on='0' 只停用 <link>，#custom-style 里的皮肤
         不会被清掉（用户明确不需要这条路径，别自作主张补）。
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

        /* ★ 这里原本有 muteTheme()：把 #custom-style disabled=true。
           v2.0.4 删掉了 —— 现在那个 <style> 装的是**皮肤自己**，
           disable 它正是「报纸 → 原版」那一帧的来源。别再加回来。 */

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

        /* ★ 只跑一次。旧版 [80,260,900,2200] 四段 tick 每次都
           appendChild + disable 主题，正是「过一会…再过一会」的节奏来源。 */
        pinOnce();
        applyLinkState();

        /* 扩展重载时酒馆会重建 <link>，新节点 disabled 默认 false，
           重套一次开关。不挪主题、不 disable，所以没有中间态。 */
        try {
            var obs = new MutationObserver(function (list) {
                var touch = false;
                for (var i = 0; i < list.length; i++) {
                    var an = list[i].addedNodes;
                    if (!an) continue;
                    for (var j = 0; j < an.length; j++) {
                        var el = an[j];
                        if (el.nodeType === 1 && (el.tagName === 'LINK' || el.id === 'mf-skin')) {
                            touch = true;
                        }
                    }
                }
                if (touch) { pinned = false; pinOnce(); applyLinkState(); }
            });
            obs.observe(head, { childList: true });
        } catch (e) {
            console.warn(LOG, '样式守护没起来', e);
        }

        /* ── 把皮肤装成酒馆自己的主题（v2.0.4 核心改动）────────────────
           fetch 自己那份 skin.css 全文 → 写进 #customCSS textarea 并
           trigger('input') 让 ST 自己写 power_user.custom_css + 落盘到
           settings/appearance.json → 下次冷启动 applyCustomCSS() 直接注入，
           第一帧就是米白。
           ② 同时把全文写进 #custom-style，保证**本次会话**立刻生效，
              不依赖 ST 有没有真的绑 input（双保险，不是抢顺序）。 */
        var THEME_LEN_KEY = 'mf_theme_css_len';

        function installAsTheme(attempt) {
            var mark = 0;
            try { mark = Number(localStorage.getItem(THEME_LEN_KEY) || 0); } catch (e) { }
            var already = byId('custom-style');
            // 下次启动：ST 已把皮肤注入 #custom-style，长度对得上就直接跳过，零开销
            if (mark && already && already.innerHTML.length === mark) return;

            var link = findSkin();
            var ta = byId('customCSS');
            if (!link || !ta) {
                // #customCSS 在设置面板里，可能比扩展晚一点才出现；只在首次安装时轮询
                if (attempt < 8) setTimeout(function () { installAsTheme(attempt + 1); }, 250);
                return;
            }

            fetch(link.href, { cache: 'force-cache' }).then(function (r) {
                return r.ok ? r.text() : null;
            }).then(function (css) {
                if (!css || css.length < 1000) return;
                var st = byId('custom-style');
                if (st && st.innerHTML === css) {
                    try { localStorage.setItem(THEME_LEN_KEY, String(css.length)); } catch (e) { }
                    return;
                }

                // ① ST 官方保存路径：写 textarea + input → power_user.custom_css
                //    + applyCustomCSS() + saveSettingsDebounced()（落盘）
                try {
                    ta.value = css;
                    if (window.jQuery) window.jQuery(ta).trigger('input');
                    else ta.dispatchEvent(new Event('input', { bubbles: true }));
                } catch (e) { /* 交给 ② 兜底 */ }

                // ② 本次会话立刻生效
                st = byId('custom-style');
                if (!st) {
                    st = document.createElement('style');
                    st.id = 'custom-style';
                    st.setAttribute('type', 'text/css');
                    head.appendChild(st);
                }
                if (st.innerHTML !== css) st.innerHTML = css;
                try { localStorage.setItem(THEME_LEN_KEY, String(css.length)); } catch (e) { }
            }).catch(function (e) {
                // 写不进主题槽位也不要紧：扩展自己的 <link> 照常生效，不会比旧版更差
                console.warn(LOG, '写主题槽位失败（扩展 CSS 仍照常生效）', e);
            });
        }
        setTimeout(function () { installAsTheme(0); }, 300);

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

        /* ── 整套外观 ⇄ 酒馆原生（v1.9.1；v2.0.4 改了主题那一半）──────
           历史场景：另一台手机的主题是「报纸」，装扩展后界面里还留着报纸的
           底色/背景图/字体 —— 旧版只是把米白「盖」上去，没盖到的地方还是报纸。
           所以旧版「开」的时候会把 #custom-style disabled=true 停掉主题。

           ★★ v2.0.4 这条**必须反过来**：现在 #custom-style 里装的是
             installAsTheme() 写进去的**皮肤自己**（power_user.custom_css）。
             再 disabled=true 就等于把皮肤关掉，而且下次冷启动
             applyCustomCSS() 注入的那份也会被关掉 —— 用户要的「第一帧
             就是米白」直接失效。所以：
               开 → link 启用 + #custom-style **启用**
               关 → link 停用 + #custom-style **停用**（回到酒馆原生）
           ★ 顺序不能反：关 → 先 wr + apply() 撤顶栏，再停 skin.css；
             反过来会出现「原生样式 + 改造后顶栏」的错位帧。
           ★ 不调 setOn() 而是直接 wr + apply()：setOn 会弹自己的 toast，
             两个 toast 会叠在一起，看起来像出了两次错。
           ★ 用户 2026-11-06 明确「不用管，我没打算关」，所以这里只保证
             语义一致、不额外做旧主题还原；别再自作主张加备份/恢复逻辑。
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
                /* v2.0.4：#custom-style 现在是皮肤自己，开就要让它生效 */
                if (ts) ts.disabled = false;
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
                /* v2.0.4：连主题槽位那份一起停，才是真正的「酒馆原生」 */
                if (ts) ts.disabled = true;
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

        /* ★★ 2026-11-07 性能（用户报「卡成屎」的一号元凶）：
           原来这里是「启动 2.5 秒后无条件 preload」+「抽屉 class 一变就 preload」。
           而下面的世界书面板（mfWb）自己还有一套 loadAll、也读全部 17 本书 ——
           一次打开抽屉 = 2.8MB × 2 全部 JSON.parse 一遍，主线程直接堵住。
           实际上这个搜索框在 input 事件里自己就会 loadAll（见上面的输入处理），
           预读完全多余。现在只在第一次点进搜索框时预读一次，抽屉打开时零 IO。 */
        var preloaded = false;
        var preload = function () {
            if (preloaded || CACHE || LOADING) return;
            preloaded = true;
            loadAll(false).catch(function () { });
        };
        input.addEventListener('focus', preload);
        input.addEventListener('click', preload);
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
            upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3"/></svg>',
            refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 11-2.6-6.1"/><path d="M20.5 4v5h-5"/></svg>',
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
        var BOOKS = [];             /* [{name, on, pinned, data, _stub?}] */
        var LOADING = null;
        var LOADED_AT = 0;
        var PENDING = 0;            /* 还有几本书的内容没读回来（_stub 数量） */
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
        /* ── 保存诊断（2026-11-07 加）────────────────────────────────────────
           ★ 为什么加：用户报「新增条目 / 新建书，面板显示已保存，但酒馆原生里没有」。
             硬证据（磁盘，不是界面）：worlds 目录 17 个文件，最后一次修改
             停在 2026-11-05 20:18，11-06 升级到 ST 1.19 之后一直到 11-07
             11:30 一个字节都没动过 → **根本没写盘**，「已保存」是假的。
             而 11-05 在 ST 1.18 上新建成过一本（女版.json = { "entries": {} }），
             说明这条链路以前是通的，1.19 之后才断。

           ★ 代码里三处会「静默吞错」，任何一处命中都会显示已保存：
             ① 本函数下面的 flush() 里 findBook 失败 → return Promise.resolve()，
                一个请求都不发，Promise.all 依然成功；
             ② ST 自己的 _save()（world-info.js）里 `await fetch(...)` 不检查
                response.ok —— 服务端 400 / 403 也当成功返回；
             ③ touch() 里 name 为空 → 根本不进 dirty，flush 看到空队列
                立刻 setStatus('ok','已保存')。
             后端已核对：1.18 与 1.19 的 src/endpoints/worldinfo.js 逐字节相同，
             /edit 只校验 name 与 entries 存在就写文件 → 接口侧没变。

           ★ 所以这里**不改保存行为**，只做三件事：
             · 每次 touch / 每次 flush 记进 window.__mfWbDiag（名字、找到书没、
               有没有 ctx.saveWorldInfo、真实读回条数）；
             · 保存后主动 POST /api/worldinfo/get 读回来，与内存条数比对；
             · 对不上就红字 + 首次 alert 详情，绝不再假装成功。

           ★ 定位完、修好之后：诊断记录可以留着（几乎零开销），
             但「读回核对」和「findBook 失败要报错」这两条**必须保留** ——
             它们才是防止下次再骗人的闸。 */
        var DIAG = (window.__mfWbDiag = window.__mfWbDiag || {
            touches: [], saves: [], last: null, alerted: false, verified: false
        });

        /* 保存后读回核对：把磁盘真实条数和内存条数摆在一起 */
        function verifyOnDisk(names) {
            return Promise.all(names.map(function (nm) {
                var b = findBook(nm);
                var mem = (b && b.data && b.data.entries)
                    ? Object.keys(b.data.entries).length : -1;
                return apiPost('/api/worldinfo/get', { name: nm }).then(function (d) {
                    var disk = (d && d.entries) ? Object.keys(d.entries).length : -1;
                    return { name: nm, mem: mem, disk: disk, ok: (disk === mem) };
                }).catch(function (e) {
                    return {
                        name: nm, mem: mem, disk: -2,
                        ok: false, err: (e && e.message) ? e.message : String(e)
                    };
                });
            }));
        }

        /* ★★★ 2026-11-07 v2.0.7：保存时机改成「攒着写」
           ─ 用户实测（原话）：「连续关两个条目卡」「卡好几秒像死机」，
             并明确授权：能接受改完不立刻写盘，只要别卡。
           ─ 旧逻辑：任何一个字段改动 → 700ms 后 flush → saveWorldInfo(整本书)
             → 整本 JSON.stringify + POST + 原生 emit(WORLDINFO_UPDATED) 写盘。
             点灯停用一条只改 1 个布尔，却要重写整本 1MB 的书，
             连续关两条 = 两次 1MB 写盘，跟「一条几百字节」完全不成比例。
           ─ 现在分两档：
             · markDirty（默认）：点灯 / 三方开关 / 改字段 / 关键词 → 只标脏，
               攒到 8 秒或「切书 / 返回列表 / 关抽屉」时统一写一次；
             · touchNow：新建 / 删除 / 复制条目、新建书 → 700ms 防抖，
               结构改动不压在内存里等。
           ⚠ 不要加 beforeunload 同步 flush：关酒馆本来就要写 5.6MB settings，
             再叠一次整本世界书会让关窗更卡（用户报的就是「点 X 半天不消失」）。 */
        var LAZY_SAVE_MS = 8000;

        function markDirty(name) {
            if (!name) return;
            dirty[name] = true;
            if (stKind !== 'on') setStatus('on', '未保存 · 切书 / 关面板时写入');
            /* 只排一次：连续改十几条不会反复重置定时器，也不会每改一次就写一次盘 */
            if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = 0; flush(); }, LAZY_SAVE_MS);
        }

        function touchNow(name) {
            if (!name) return;
            dirty[name] = true;
            if (stKind !== 'on' || stText !== '正在保存…') setStatus('on', '正在保存…');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(function () { saveTimer = 0; flush(); }, 700);
        }

        /* 旧调用点默认走懒保存（字段编辑、点灯这些高频操作） */
        function touch(name) { markDirty(name); }

        /* 切书 / 返回列表 / 关抽屉时立刻落盘 —— 用户「改完就走」的那几步不能丢 */
        function flushNow() {
            var has = false;
            for (var k in dirty) if (dirty[k]) { has = true; break; }
            if (!has) return;
            clearTimeout(saveTimer);
            saveTimer = 0;
            flush();
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
            var tSave = nowMs();     /* v2.0.7 性能打点：整本序列化 + POST 的真实耗时 */
            setStatus('on', '正在保存…');

            var ctx = getCtx();
            /* 诊断记录：这一批保存到底走了哪条路 */
            var rec = {
                at: Date.now(),
                names: names.slice(),
                hasCtx: !!ctx,
                hasSaveWorldInfo: !!(ctx && ctx.saveWorldInfo),
                notFound: [],
                path: ''
            };
            var jobs = names.map(function (nm) {
                var b = findBook(nm);
                if (!b || !b.data) {
                    rec.notFound.push(nm);
                    /* ★ 这里原来是 `return Promise.resolve()` —— 一个请求都不发，
                       面板却照样报「已保存」。2026-11-07 诊断改成必须抛出来。 */
                    return Promise.reject(new Error('面板里找不到这本书：' + nm));
                }
                if (ctx && ctx.saveWorldInfo) {
                    /* ★ 走原生：同时更新 worldInfoCache 与 WORLDINFO_UPDATED 事件
                       ⚠ 但它的 _save() 不检查 response.ok，所以失败也会 resolve，
                         真正的判据是下面 verifyOnDisk() 读回来的条数。 */
                    if (!rec.path) rec.path = 'saveWorldInfo';
                    return Promise.resolve(ctx.saveWorldInfo(nm, b.data, true));
                }
                if (!rec.path) rec.path = 'apiPost';
                return apiPost('/api/worldinfo/edit', { name: nm, data: b.data });
            });

            Promise.all(jobs).then(function () {
                saving = false;

                /* ★ v2.0.7：把「写一本 1MB 的书到底要多久」量出来。
                   只记进 window.__mfWbPerf，不打扰界面（保存慢单独看这条）。 */
                try {
                    var dtSave = Math.round(nowMs() - tSave);
                    var p = window.__mfWbPerf || (window.__mfWbPerf = []);
                    p.push({ act: 'save', ms: dtSave, at: Date.now(), path: rec.path, books: names.length });
                    if (p.length > 40) p.shift();
                    if (dtSave >= 1500) console.warn('[mf-wb] 保存耗时 ' + dtSave + 'ms', names, rec.path);
                } catch (e) { }

                /* ★ 2026-11-07 卡顿修复（用户实测：加了核对之后点抽屉要等一两秒）：
                   verifyOnDisk 走 /api/worldinfo/get，会把**整本书**拉回本地再比条数。
                   用户最大的世界书 1 MB，每存一次就是下行 1 MB + JSON.parse，
                   正好赶上他点别的抽屉 → 主线程和网络被占住，点了像没反应。
                   现在只核对**第一次**保存：链路通不通一次就能看出来，之后零额外开销。
                   想再单独核对一次：控制台执行
                       window.__mfWbDiag.verified = false
                   再改一个字就会重新核对一遍。 */
                function afterSave(rep) {
                    rec.result = rep || null;
                    DIAG.saves.push(rec);
                    if (DIAG.saves.length > 20) DIAG.saves.shift();
                    DIAG.last = rec;

                    var mismatch = (rep || []).filter(function (r) { return !r.ok; });
                    if (mismatch.length) {
                        /* 数据没落盘：把书放回队列（不自动重试，避免空转），红字常驻 */
                        mismatch.forEach(function (r) { dirty[r.name] = true; });
                        var detail = mismatch.map(function (r) {
                            var d = r.disk === -2 ? ('读不回：' + (r.err || '请求失败'))
                                : (r.disk < 0 ? '读不回' : r.disk + ' 条');
                            return '「' + r.name + '」面板 ' + r.mem + ' 条 / 磁盘 ' + d;
                        }).join('\n');
                        var route = rec.path || '没发请求'
                            + (rec.hasSaveWorldInfo ? '' : '（拿不到 ctx.saveWorldInfo）');
                        setStatus('err', '⚠ 没真写进酒馆：' + mismatch.map(function (r) {
                            return r.name;
                        }).join('、') + '（走 ' + route + '）');
                        console.error('[mf-wb] 保存没落盘', rec);

                        /* ★ 关键一步：saveWorldInfo 吞掉了状态码，这里绕开它、
                           自己 POST 一次 /api/worldinfo/edit，把真实原因逼出来。
                           两种结果都能定性：
                             · 直连成功 → 是 ctx.saveWorldInfo 这条链的问题（1.19 变了）
                             · 直连也拒 → 是后端/权限问题，状态码会写进红字 */
                        var first = mismatch[0];
                        var fb = findBook(first.name);
                        apiPost('/api/worldinfo/edit', {
                            name: first.name,
                            data: (fb && fb.data) || { entries: {} }
                        }).then(function () {
                            setStatus('ok', '已用直连接口写入（原生 saveWorldInfo 那条路失效）');
                            if (!DIAG.alerted) {
                                DIAG.alerted = true;
                                alert('诊断结论：原生的 saveWorldInfo 没把数据写进去，'
                                    + '但我直接调 /api/worldinfo/edit 成功了。\n\n'
                                    + detail + '\n\n走的路径：' + route
                                    + '\nctx 存在：' + rec.hasCtx
                                    + '，ctx.saveWorldInfo：' + rec.hasSaveWorldInfo
                                    + '\n\n→ 问题在 saveWorldInfo 这条调用链，不在后端。');
                            }
                        }).catch(function (e) {
                            var m = (e && e.message) ? e.message : String(e);
                            setStatus('err', '⚠ 写入被服务端拒绝：' + m);
                            console.error('[mf-wb] 直连 /edit 也被拒', e);
                            if (!DIAG.alerted) {
                                DIAG.alerted = true;
                                alert('保存没有落盘，而且直连接口也被拒绝了。\n\n'
                                    + detail + '\n\n服务端返回：' + m
                                    + '\n走的路径：' + route
                                    + '\nctx 存在：' + rec.hasCtx
                                    + '，ctx.saveWorldInfo：' + rec.hasSaveWorldInfo);
                            }
                        });

                        if (view === 'list' || view === 'book') { try { render(); } catch (e) { } }
                        return;
                    }

                    saveFail = 0;
                    setStatus('ok', rep ? '已保存（已核对磁盘）' : '已保存');
                    /* 存成功了就把「未保存」标签摘掉（不重绘，免得打断正在打字的人） */
                    var tags = document.querySelectorAll('#mfWb .tag.unsaved');
                    if (tags.length) [].slice.call(tags).forEach(function (n) { n.remove(); });
                    setTimeout(function () {
                        if (stKind === 'ok' && !Object.keys(dirty).length) setStatus('', '');
                    }, 1600);
                    if (Object.keys(dirty).length) flush();
                }

                if (!DIAG.verified) {
                    DIAG.verified = true;
                    return verifyOnDisk(names).then(afterSave);
                }
                afterSave(null);
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

        /* ══════════════════════════════════════════════════════════════════
           酒馆助手 (JS-Slash-Runner / TavernHelper) 适配层   2026-11-07 加
           ──────────────────────────────────────────────────────────────────
           ★ 为什么要有这层（用户实测结论，别再绕回去）：
             用户自己的 D:\preset-manager\manager.js（预设管理器）用这套接口
             管世界书，在他这台 1.19 上是**真能用**的。而本面板原来靠遍历
             原生 #world_info 的 <option> 找书名 —— 1.19 把 settings 里的
             world_info 从「数组」改成了 { globalSelect: [...] }，DOM 那套
             随时会和真实设置脱节，现象就是「面板里点了启用，酒馆没反应」。

           ★ 接口签名（扩展目录里的 @types/function/worldbook.d.ts 有正式声明）：
               getWorldbookNames(): string[]                 ← 同步
               getGlobalWorldbookNames(): string[]           ← 同步，= 全局启用列表
               rebindGlobalWorldbooks(names: string[]): Promise<void>  ← 写全局启用
               createWorldbook(name, entries?): Promise<boolean>
               getWorldbook(name): Promise<WorldbookEntry[]>
               deleteWorldbook(name): Promise<void>

           ★ 这些函数挂在 window.TavernHelper 上（也可能平铺在 window 上，
             桌面端还可能在外层 frame 上）→ 三处都试，找不到就返回 null，
             由调用方退回老路，绝不 throw。
           ══════════════════════════════════════════════════════════════════ */
        function thFn(name) {
            var owners = [];
            function push(o) { if (o) owners.push(o); }
            try { push(window.TavernHelper); } catch (e) { }
            try { push(window.parent && window.parent.TavernHelper); } catch (e) { }
            try { push(window.top && window.top.TavernHelper); } catch (e) { }
            push(window);
            try { push(window.SillyTavern); } catch (e) { }
            try { push(getCtx()); } catch (e) { }
            for (var i = 0; i < owners.length; i++) {
                try {
                    var f = owners[i][name];
                    if (typeof f === 'function') return f.bind(owners[i]);
                } catch (e) { }
            }
            return null;
        }
        /* 整本启用列表（书名数组）。拿不到返回 null，不是空数组 —— 空数组会把
           「一本都没启用」和「读不到」混成一件事。 */
        function thGlobalNames() {
            var f = thFn('getGlobalWorldbookNames');
            if (!f) return null;
            try {
                var v = f();
                if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean);
            } catch (e) { }
            return null;
        }

        /* ── 读：书名 + 全局启用 ──────────────────────────────────────────── */
        function nativeNames() {
            var ctx = getCtx();
            /* ① 首选酒馆助手（和预设管理器同一条路） */
            var thn = thFn('getWorldbookNames');
            if (thn) {
                try {
                    var tv = thn();
                    if (Array.isArray(tv) && tv.length) return tv.map(function (x) { return String(x); });
                } catch (e) { }
            }
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
            /* ① 首选酒馆助手：getGlobalWorldbookNames() 就是 settings 里的
                  world_info.globalSelect，真值，不依赖下拉框有没有渲染出来 */
            var g = thGlobalNames();
            if (g) { g.forEach(function (n) { set[n] = true; }); return set; }
            /* ② 老路：遍历原生下拉的选中项（1.18 时代的写法） */
            var sel = document.getElementById('world_info');
            if (!sel) return set;
            [].slice.call(sel.options).forEach(function (o) {
                var nm = optName(o);
                if (nm && o.selected) set[nm] = true;
            });
            return set;
        }

        /* ── 读：全部世界书 ─────────────────────────────────────────────────
           ★★ 2026-11-07 改成分层（用户报「打开面板卡、开关点不动、有时点不了」）：
             旧版打开抽屉时一次性把 17 本书（合计 2.8MB）全读回来，
             主线程被 JSON.parse 堵住 → 面板半天不出来，这期间点什么都没反应。
             现在分两段：
               ① 骨架（毫秒级）：只拿书名 + 全局启用状态，BOOKS 立刻建好，
                  每本挂一个空壳 data 并标 _stub，列表马上能渲染、能点、能开关；
               ② 补内容（后台，并发 6）：读完一本就地替换那一行，
                  用户点进哪本读哪本，绝不等全部。
           ★ 形状约定：_stub=true 时 data.entries 一定是 {}（不是 null），
             这样 bstat / entList / 导出这些老代码不用改也不会崩；
             只有 bookRow 的数字、跨书搜索、进书页要认这个标记。 */
        function loadAll(force) {
            if (!force && BOOKS.length && (Date.now() - LOADED_AT) < 300000) {
                return Promise.resolve(BOOKS);
            }
            if (LOADING) return LOADING;
            /* 已经是骨架状态（内容还在后台补）→ 别再起一轮，直接给 */
            if (!force && BOOKS.length) return Promise.resolve(BOOKS);

            var ctx = getCtx();
            var names = nativeNames();
            if (!names.length) {
                setStatus('err', '没找到任何世界书');
                return Promise.reject(new Error('没找到任何世界书'));
            }

            var onSet = globalOnSet();
            var prev = {};
            BOOKS.forEach(function (b) { prev[b.name] = b; });

            /* ① 骨架：不读任何书内容 */
            BOOKS = names.map(function (n) {
                var old = prev[n];
                /* force=true（点重载）一定要真的重读，所以这里不能保留旧 data */
                if (!force && old && old.data && !old._stub) return old;
                return {
                    name: n,
                    on: !!onSet[n],
                    pinned: pinnedOf(n),
                    data: { entries: {} },
                    _stub: true
                };
            });
            LOADED_AT = Date.now();
            PENDING = BOOKS.filter(function (b) { return b._stub; }).length;
            if (PENDING) setStatus('on', '正在读取 ' + PENDING + ' 本世界书…');

            var idx = 0;
            var CONC = 6;

            function one(name) {
                if (!ctx || !ctx.loadWorldInfo) {
                    return apiPost('/api/worldinfo/get', { name: name })
                        .then(function (d) { return d; });
                }
                return Promise.resolve(ctx.loadWorldInfo(name));
            }

            function worker() {
                if (idx >= names.length) return Promise.resolve();
                var name = names[idx++];
                var b0 = findBook(name);
                if (!b0 || !b0._stub) return worker();               /* 已读过就跳过 */
                return one(name).then(function (data) {
                    var bb = findBook(name);
                    if (bb && data && data.entries) {
                        bb.data = data;
                        delete bb._stub;
                        PENDING--;
                        paintRow(name);
                        return;
                    }
                    throw new Error('没有 entries');
                }).catch(function (e) {
                    console.warn('[mf-wb] 读不了：' + name, e);
                    var bb2 = findBook(name);
                    if (bb2) { delete bb2._stub; PENDING--; }        /* 读失败也算处理过，别卡住 */
                }).then(function () {
                    if (PENDING > 0 && (PENDING % 3 === 0)) {
                        setStatus('on', '正在读取世界书… 还剩 ' + PENDING + ' 本');
                    }
                    return worker();
                });
            }

            var seeds = [];
            for (var s = 0; s < CONC; s++) seeds.push(worker());
            LOADING = Promise.all(seeds).then(function () {
                LOADING = null;
                PENDING = 0;
                setStatus('', '');
                if (view === 'list') { try { render(); } catch (e) { } }
                return BOOKS;
            }).catch(function (e) {
                LOADING = null;
                setStatus('err', '读取失败：' + (e && e.message ? e.message : e));
                throw e;
            });

            /* ★ 关键：立刻把骨架交出去，调用方马上渲染，不等内容 */
            return Promise.resolve(BOOKS);
        }

        /* 后台读完一本 → 只换那一行，不重画整个列表 */
        function paintRow(name) {
            if (view !== 'list') return;
            var body = document.getElementById('mfWbBody');
            if (!body) return;
            var rows = body.querySelectorAll('.brow');
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].dataset.name === name) {
                    var b = findBook(name);
                    if (!b) return;
                    var tmp = document.createElement('div');
                    tmp.innerHTML = bookRow(b);
                    var neu = tmp.firstElementChild;
                    if (neu) rows[i].replaceWith(neu);
                    return;
                }
            }
        }

        /* 单独读一本书（点进去之前调）。已读过立即 resolve。 */
        function loadBook(name) {
            var b = findBook(name);
            if (!b) return Promise.reject(new Error('没有这本书'));
            if (!b._stub) return Promise.resolve(b);
            var ctx = getCtx();
            var p = (ctx && ctx.loadWorldInfo)
                ? Promise.resolve(ctx.loadWorldInfo(name))
                : apiPost('/api/worldinfo/get', { name: name });
            return p.then(function (data) {
                if (data && data.entries) {
                    b.data = data;
                    delete b._stub;
                    if (PENDING > 0) PENDING--;
                }
                return b;
            });
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
                  + BOOKS.length + ' 本 · '
                  + (PENDING ? ('读取中，还剩 ' + PENDING + ' 本') : (fmt(st.tot) + ' 条 · ' + ktok(st.tok) + ' tok'))
                  + '</span>'
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
                /* ★ v2.5.0：导入入口补在一级页（跟「新建」并排）。
                   原生的导入按钮 #world_import_button 被我们藏掉的 #wi-holder
                   一起盖住了，用户在面板里根本摸不到导入。 */
                h += '<span class="chip" data-act="importwb">' + SV.upload + '导入</span>';
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
            /* 内容还没读回来（骨架阶段）→ 数字先显示 —，别撒谎写 0 */
            var stub = !!b._stub;
            return '<div class="brow' + (b.on ? '' : ' dis') + '" data-act="open" data-name="' + escA(b.name) + '">'
              + '<span class="star' + (b.pinned ? ' on' : '') + '" data-act="pin" data-name="' + escA(b.name) + '" title="置顶">' + SV.star + '</span>'
              + '<span class="bn">' + hl(b.name, q) + '</span>'
              + (dirty[b.name] ? '<span class="tag unsaved" title="还没写进文件，别关面板">未保存</span>' : '')
              + (b.on ? '<span class="tag global">全局</span>' : '')
              + '<span class="bc">' + (stub ? '—' : ((b.on ? s.on : 0) + '/' + s.tot)) + '</span>'
              + '<span class="bt">' + (stub ? '—' : ktok(s.tok)) + '</span>'
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
                var stubN = BOOKS.filter(function (b) { return b._stub; }).length;
                BOOKS.forEach(function (b) {
                    entList(b).forEach(function (e) {
                        var t = (e.comment || '') + '\n' + (e.content || '') + '\n' + keyArr(e).join(' ');
                        if (hit(t, q)) hits.push({ b: b, e: e });
                    });
                });
                if (hits.length) {
                    h += '<div style="padding:9px 13px 3px;font-size:11px;color:var(--ink3)">跨书命中 <b style="color:var(--ink2)">'
                      + hits.length + '</b> 条'
                      + (stubN ? '（还有 ' + stubN + ' 本没读完，可能漏）' : '')
                      + '</div><div class="list">';
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
            return h;
        }

        /* ★★ 2026-11-07 修 bug（用户报「黄色的未启用标识叠三层」）：
           原来这条 warning 是拼在 bookHeadHTML() 返回值末尾的，所以它和 .bhead
           是**两个并列的顶层 div**；而增量渲染用的是
               hd.outerHTML = bookHeadHTML(b, s)
           —— 只换掉 .bhead 那一个，旁边旧的 .warn 根本没被收走。
           于是每展开一次条目（renderOne）就多出一条黄条：点三次叠三层。
           现在拆成独立函数 + syncHead() 统一维护，谁都不会再漏删。 */
        function bookWarnHTML(b) {
            if (b && b.on) return '';
            return '<div class="warn">' + SV.warn
                 + '<span><b>整本书没有启用</b>，下面怎么改都不会生效。点右上角开关打开它。</span></div>';
        }

        /* 只换书页顶部的「统计条 + 警告条」，条目行一个都不动 */
        function syncHead(b, s) {
            var body = document.getElementById('mfWbBody');
            if (!body || !b) return;
            var hd = body.querySelector('.bhead');
            if (!hd) return;
            var nx = hd.nextElementSibling;
            if (nx && nx.classList.contains('warn')) nx.remove();   /* 先收走旧的，防叠 */
            hd.outerHTML = bookHeadHTML(b, s || bstat(b));
            if (!b.on) {
                var nh = body.querySelector('.bhead');
                if (nh) nh.insertAdjacentHTML('afterend', bookWarnHTML(b));
            }
        }

        /* ★ 2026-11-07 v2.0.7：统计条 / 筛选条的「只改数字」版本。
           renderOne（点灯、展开收起、改字段）走这两个，DOM 结构一个都不动；
           只有 bookHeadHTML / fbarHTML 真正需要的场景（进出书页、筛选变化）才整体重建。
           ★ 黄条（.warn）仍然按 b.on 增删 —— 它是「整本没启用」的提示，
             多一条少一条都必须跟着状态走（v2.0.6 叠三层的教训）。 */
        function patchHead(b, s) {
            var body = document.getElementById('mfWbBody');
            if (!body) return;
            var hd = body.querySelector('.bhead');
            if (!hd) return;

            var bs = hd.querySelectorAll('.bh2 b');
            var vals = [s.tot, s.on, s.always, ktok(s.tok)];
            for (var i = 0; i < bs.length && i < vals.length; i++) {
                var v = String(vals[i]);
                if (bs[i].textContent !== v) bs[i].textContent = v;
            }

            var sw = hd.querySelector('.sw');
            if (sw && sw.classList.contains('on') !== !!b.on) sw.classList.toggle('on', !!b.on);

            var bar = hd.querySelector('.bar');
            if (bar && bar.children.length >= 3) {
                bar.children[0].style.width = (s.tot ? s.always / s.tot * 100 : 0) + '%';
                bar.children[1].style.width = (s.tot ? s.key / s.tot * 100 : 0) + '%';
                bar.children[2].style.width = (s.tot ? s.off / s.tot * 100 : 0) + '%';
            }

            var nx = hd.nextElementSibling;
            var hasWarn = !!(nx && nx.classList && nx.classList.contains('warn'));
            if (!b.on && !hasWarn) hd.insertAdjacentHTML('afterend', bookWarnHTML(b));
            else if (b.on && hasWarn) nx.remove();
        }

        function patchFbar(s) {
            var body = document.getElementById('mfWbBody');
            if (!body) return;
            var ns = body.querySelectorAll('.fbar .fchip .n');
            var vals = [s.tot, s.always, s.key, s.off];
            for (var i = 0; i < ns.length && i < vals.length; i++) {
                var v = String(vals[i]);
                if (ns[i].textContent !== v) ns[i].textContent = v;
            }
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

            var h = bookHeadHTML(b, s) + bookWarnHTML(b) + fbarHTML(s);

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

            /* 统计条和筛选条上的数字会变（启用条数、token 总量）。
               ★ v2.0.7：不再 outerHTML 重建这两块。原来点一下条目就把书页顶部的
                 DOM 整体销毁重建，连带一次样式重算 + 布局（149 条的书上是可感的顿）。
                 现在只改文字和进度条宽度，节点一个都不换。 */
            var b = findBook(curName);
            if (b) {
                var s = bstat(b);
                patchHead(b, s);
                patchFbar(s);
            }
        }

        /* 进书页的统一入口：open / jump 都走这里，省得两处各写一遍再走形 */
        function goBook(name, uid) {
            flushNow();          /* ★ v2.0.7：切书 = 落盘时机（懒保存的兑现点） */
            view = 'book'; curName = name; q = ''; fstate = 'all';
            openUid = {}; selUid = {}; batch = false;
            if (uid !== undefined && uid !== null) openUid[uid] = true;
            retitle(); render();
            if (root) root.scrollTop = 0;
        }

        /* ── 书操作 ───────────────────────────────────────────────────────── */
        /* 整本启用 / 停用。
           ★★ 2026-11-07 重写（用户报「红字说全局下拉没有这本书」）：
             旧实现遍历 #world_info 的 <option> 找书名，找不到就红字。
             1.19 把 world_info 改成 {globalSelect:[...]}，下拉和真实设置脱节，
             于是「新建的书永远点不了启用」。
             现在走酒馆助手 rebindGlobalWorldbooks(书名数组) —— 和用户自己的
             预设管理器（D:\preset-manager\manager.js 第 1351 行）同一条路。
             拿到就写、写完回读；拿不到才退回下面那段老的 DOM 逻辑。
           ★ 回滚：写失败要把 b.on 恢复原值，否则界面显示已启用、酒馆里没有。 */
        function setBookOn(name, on) {
            name = String(name || '').trim();
            if (!name) return false;
            var b0 = findBook(name);
            var back = b0 ? b0.on : null;

            function paint(v, force) {
                var bb = findBook(name);
                var changed = !!bb && (!!bb.on !== !!v);
                if (bb) bb.on = !!v;
                if (!changed && !force) return;         /* 状态没变就不重画，省一次抖动 */
                if (view === 'list') { try { render(); } catch (e) { } return; }
                if (view === 'book') {
                    /* ★ 书页绝对不能 render() —— 那会把 149 条全部重画（实测 30~125ms）。
                       这里只同步顶部统计条 + 黄条，条目行一个都不动。 */
                    var cur = findBook(curName);
                    if (cur) { try { syncHead(cur); } catch (e) { } }
                }
            }

            /* ★ 2026-11-07：点击瞬间只改这一行的 class，不重画列表。
               原来一点开关就 render() 整页（17 行全重建），等接口返回又 render 一次
               —— 用户看到的是「按下去卡一下、还闪」。真正需要重排（行要在
               「已启用/未启用」两组之间搬家）留到写完那一次。 */
            function markLocal(v) {
                var bb = findBook(name);
                if (bb) bb.on = !!v;
                if (view !== 'list') return;
                var body = document.getElementById('mfWbBody');
                if (!body) return;
                var rows = body.querySelectorAll('.brow');
                for (var r = 0; r < rows.length; r++) {
                    if (rows[r].dataset.name !== name) continue;
                    rows[r].classList.toggle('dis', !v);
                    var sw = rows[r].querySelector('.sw');
                    if (sw) sw.classList.toggle('on', !!v);
                    return;
                }
            }

            var thSet = thFn('rebindGlobalWorldbooks');
            if (thSet) {
                var cur = thGlobalNames() || [];
                var i = cur.indexOf(name);
                if (on && i < 0) cur.push(name);
                if (!on && i >= 0) cur.splice(i, 1);

                markLocal(on);                   /* 先动这一行，写失败再回滚 */
                setStatus('on', (on ? '正在启用「' : '正在停用「') + name + '」…');

                var done = function (ok, err) {
                    if (ok) {
                        /* 以酒馆真实状态为准回读一次 */
                        var now = thGlobalNames();
                        if (now) paint(now.indexOf(name) >= 0, true);
                        else paint(on, true);
                        setStatus('ok', (on ? '已启用「' : '已停用「') + name + '」');
                    } else {
                        paint(back, true);
                        setStatus('err', '整本启停没写进酒馆：' + (err || '酒馆助手没有回应'));
                        console.warn('[mf-wb] rebindGlobalWorldbooks 失败', err);
                    }
                };

                var ret = null;
                try { ret = thSet(cur); } catch (e) { ret = null; }
                if (ret && typeof ret.then === 'function') {
                    ret.then(function () { done(true); },
                             function (e) { done(false, (e && e.message) ? e.message : String(e)); });
                    return true;
                }
                done(true);                      /* 同步版（老接口）也认 */
                return true;
            }

            /* ── 退路：老 DOM 逻辑（1.18 时代）──────────────────────────── */
            var sel = document.getElementById('world_info');
            if (!sel) { setStatus('err', '拿不到整本启停的接口（酒馆助手没加载，原生下拉也不在）'); return false; }

            var want = String(name).trim().toLowerCase();
            var opts = [].slice.call(sel.options);
            var idx = -1;
            for (var j = 0; j < opts.length; j++) {
                if (optName(opts[j]).toLowerCase() === want) { idx = j; break; }
            }
            if (idx < 0) {
                console.warn('[mf-wb] 全局启用下拉里没有这本书：' + name, opts.map(optName));
                setStatus('err', '这台酒馆没开放整本启停接口，下拉里也找不到「' + name + '」');
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

        /* ── 导入世界书（v2.5.0 新增） ─────────────────────────────────────
           【为什么之前没有】
             我们的全功能面板把原生 #wi-holder 整个 display:none 了
             （skin.css：#WorldInfo.mf-wb-on 时隐藏），而原生的
             「导入世界书」按钮 #world_import_button 就住在 #wi-holder 里面，
             于是面板里只剩「新建」，导入这条路整个消失。
             二级页「更多」菜单里也只有 导出 / 删除 / 临时切回原生。

           【做法：复用原生按钮，不自己解析文件】
             原生按钮背后是酒馆的 importWorldInfo()，它认得
             .json / .lorebook / .png（PNG 角色卡里内嵌的世界书）三种格式，
             还会弹酒馆自己的提示。自己重写解析 = 把酒馆的坑重踩一遍。
             → JS 直接 click 那个「看不见的」原生按钮
               （display:none 的元素也能 .click()，事件照样派发）。

           【导入完要把新书刷进我们的面板】
             原生导入是异步的：弹文件框 → 读文件 → 写盘 → 刷新 world_names。
             我们这边轮询书名清单：一旦变了就 loadAll(true) 重读并重绘。
             ★ 必须把所有数据源合并成一个签名再比：
               ctx.getWorldInfoNames() 和原生下拉 #world_editor_select
               这两份有时不同步，只盯其中一份会误判 / 漏判。
             最多等 3 分钟，超时自己收工，不留定时器。 */
        function importBook() {
            var btn = document.getElementById('world_import_button');
            if (!btn) {
                setStatus('err', '没找到原生导入按钮（酒馆版本变了？）');
                return;
            }
            /* 所有数据源合并成一个签名：ctx 那份 + 原生下拉那份 */
            function allSig() {
                var set = {};
                try { nativeNames().forEach(function (n) { set[n] = 1; }); } catch (e) { }
                var sel = document.getElementById('world_editor_select');
                if (sel) {
                    [].slice.call(sel.options).forEach(function (o) {
                        var t = (o.textContent || '').trim();
                        if (t && o.value !== '') set[t] = 1;
                    });
                }
                return Object.keys(set).sort().join('');
            }
            var before = allSig();
            setStatus('on', '请选择要导入的世界书文件…');
            try {
                btn.click();
            } catch (e) {
                setStatus('err', '导入失败：' + (e && e.message ? e.message : e));
                return;
            }
            var t0 = Date.now();
            var iv = setInterval(function () {
                if (allSig() !== before) {
                    clearInterval(iv);
                    loadAll(true).then(function () {
                        render();
                        setStatus('ok', '导入完成，列表已刷新');
                    }).catch(function (e) {
                        render();
                        setStatus('err', '导入后刷新失败：' + (e && e.message ? e.message : e));
                    });
                } else if (Date.now() - t0 > 180000) {
                    clearInterval(iv);
                }
            }, 1500);
        }

        function createBook() {
            var name = prompt('新建世界书，输入名字：', '新世界书 ' + new Date().toLocaleDateString('zh-CN'));
            if (!name) return;
            name = name.trim();
            if (!name) return;
            if (findBook(name)) { alert('已经有同名世界书了'); return; }

            var ctx = getCtx();
            /* ★ 新建优先走酒馆助手 createWorldbook(name) → Promise<boolean>：
                 它会同时写文件 + 刷新 world_names + 重填原生下拉，
                 比 saveWorldInfo(name, {entries:{}}) 干净（后者不保证登记进列表）。 */
            var thCreate = thFn('createWorldbook');
            var p = thCreate
                ? Promise.resolve(thCreate(name))
                : ((ctx && ctx.saveWorldInfo)
                    ? Promise.resolve(ctx.saveWorldInfo(name, { entries: {} }, true))
                    : apiPost('/api/worldinfo/edit', { name: name, data: { entries: {} } }));

            setStatus('on', '正在新建…');
            p.then(function () {
                /* ★ 2026-11-07 诊断：saveWorldInfo 吞状态码，建失败也会 resolve。
                   所以立刻 GET 一次，文件真在才继续往下走。 */
                return apiPost('/api/worldinfo/get', { name: name }).catch(function (e) {
                    return { __err: (e && e.message) ? e.message : String(e) };
                });
            }).then(function (probe) {
                if (probe && probe.__err) throw new Error('新书读不回来：' + probe.__err);
                if (!probe || !('entries' in probe)) throw new Error('新书读不回来（服务端没有这个文件）');
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
            touchNow(b.name);      /* 结构改动（新建 / 复制 / 删除）立刻写，别压内存 */
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
            touchNow(b.name);      /* 结构改动（新建 / 复制 / 删除）立刻写，别压内存 */
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
            touchNow(b.name);      /* 结构改动（新建 / 复制 / 删除）立刻写，别压内存 */
            render();
        }

        /* ── 事件：点击 ───────────────────────────────────────────────────── */
        /* ★★ 2026-11-07 v2.0.7 性能打点
           用户报「连续关两个条目卡，卡好几秒像死机」。
           读代码能算出的开销（bstat、JSON.stringify 1MB）都只有几十毫秒，
           解释不了「几秒」→ 必须先量出来是哪一下慢，别再猜（上次判「下载失败」连猜错两次）。
           做法：把 onClick 包一层计时。
             · 每次点击耗时 > 120ms 记进 window.__mfWbPerf（最多 40 条）
             · > 500ms 直接显示在面板状态条上，4 秒后自动消失
           用户下次说「卡」的时候，状态条上那行「慢：收起 2340ms」就是证据。
           定性完可以删掉这一段（不影响任何功能）。 */
        var PERF = (window.__mfWbPerf = window.__mfWbPerf || []);
        var PERF_TO = 0;
        function nowMs() {
            return (window.performance && performance.now) ? performance.now() : Date.now();
        }
        function notePerf(ev, t0) {
            var dt = nowMs() - t0;
            if (dt < 120) return;
            var act = '点击';
            try {
                var n = ev.target.closest('[data-act]');
                act = n ? (n.dataset.act || '点击') : (ev.target.tagName || '点击');
            } catch (e) { }
            PERF.push({ act: act, ms: Math.round(dt), at: Date.now() });
            if (PERF.length > 40) PERF.shift();
            if (dt >= 500) {
                setStatus('on', '慢：' + act + ' ' + Math.round(dt) + 'ms');
                clearTimeout(PERF_TO);
                PERF_TO = setTimeout(function () {
                    if (stText.indexOf('慢：') === 0) setStatus('', '');
                }, 4000);
            }
        }

        function onClick(ev) {
            var t0 = nowMs();
            try { onClickImpl(ev); }
            finally { notePerf(ev, t0); }
        }

        function onClickImpl(ev) {
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
                renderOne(+box.dataset.uid);   /* v2.0.7：删一个关键词不用重建整页 */
                return;
            }

            if (!t) return;
            var act = t.dataset.act;

            if (act === 'open') {
                var b = findBook(t.dataset.name);
                if (!b) return;
                /* ★ 内容还没读回来就先进书页 → 用户会看到一本「空书」，
                   而且这时点「新建条目」会写进空壳，随后被读回来的数据覆盖 → 改动丢失。
                   所以：单本读完再进，一步都不抢。 */
                if (b._stub) {
                    setStatus('on', '正在读取「' + b.name + '」…');
                    loadBook(b.name).then(function () {
                        setStatus('', '');
                        goBook(b.name);
                    }).catch(function (e) {
                        setStatus('err', '读不出来：' + (e && e.message ? e.message : e));
                    });
                    return;
                }
                goBook(b.name);
                return;
            }
            if (act === 'jump') {
                var b2 = findBook(t.dataset.name);
                if (!b2) return;
                var jUid = +t.dataset.uid;
                if (b2._stub) {
                    setStatus('on', '正在读取「' + b2.name + '」…');
                    loadBook(b2.name).then(function () {
                        setStatus('', '');
                        goBook(b2.name, jUid);
                    }).catch(function () { setStatus('err', '读不出来'); });
                    return;
                }
                goBook(b2.name, jUid);
                return;
            }
            if (act === 'back') {
                flushNow();      /* ★ v2.0.7：返回列表 = 落盘时机 */
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
                /* ★ 这里绝对不要再 render()：setBookOn 内部已经做了「点击只改这一行 +
                   写完归位」，外面再来一次 render 就是「点一下重画两遍」，用户眼里就是卡。
                   状态条也由 setBookOn 自己出，别在外面拼（之前拼反过：拿的是改后的值）。 */
                if (bt) setBookOn(bt.name, !bt.on);
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
                if (ke) {
                    ke.disable = !ke.disable;
                    touch(curName);
                    /* ★ v2.0.7：灯的颜色完全由 .world_entry.off 控制（skin.css 3387 行），
                       所以「没展开的条目」点灯只 toggle 一个 class 就够，不用重建 DOM；
                       展开状态必须重画，因为里面的「禁用 / 常驻 / 关键词」三方按钮要跟着变。 */
                    var kwe = t.closest('.world_entry');
                    if (!openUid[ke.uid] && kwe) {
                        kwe.classList.toggle('off', !!ke.disable);
                        var kb = findBook(curName);
                        if (kb) { var ks = bstat(kb); patchHead(kb, ks); patchFbar(ks); }
                    } else {
                        renderOne(ke.uid);
                    }
                }
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
            if (act === 'importwb') { importBook(); return; }
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
            /* ★ v2.0.7：只重画这一条。原来这里是全量 render()，
               一条开关把 149 条全部重建（含展开条目里的大段正文）。 */
            renderOne(e.uid);
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
                if (a.length) { a.pop(); e[f] = a; touch(curName); renderOne(e.uid); }
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
            /* ★ v2.0.7：blur 是 capture 绑定，点下一条会先触发这里。
               原来走全量 render()，等于每次换条目都重建整页 → 连续操作越点越卡。 */
            renderOne(e.uid);
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

        /* 抽屉标题：v2.6.0 起**清空**。
           【为什么】
             用户 2026-11-22 原话：「世界书那个导入新建的上面有一个世界书这个字，
               我感觉它比较占地方，把那个字给删掉吧。」
             → 那个字就在我们面板「导入 / 新建」那一行的正上方（抽屉头），
               面板自己的一级页已经有统计行了，再顶着一个「世界书」纯属重复占位。
           【★ v2.6.0 修的一个真 bug】
             原来的选择器是 `wi.querySelector('#WorldInfoheader h3 span')` ——
             这是「后代选择器」，意思是「#WorldInfoheader 内部的 h3 里的 span」。
             但原生 DOM 是（index.html:4676）：
                 <div id="WorldInfoheader" class="fa-solid fa-grip drag-grabber"></div>
                 <div class="flex-container alignitemscenter gap10px">
                   <div id="WI_panel_pin_div">…</div>
                   <h3 class="margin0">
                     <span data-i18n="Worlds/Lorebooks">Worlds/Lorebooks</span>
                     <a …><span class="note-link-span"></span></a>
                   </h3>
                 </div>
             → h3 是 #WorldInfoheader 的**兄弟节点的子节点**，不是它的后代！
               所以那个选择器**永远返回 null** —— 也就是说
               「把抽屉标题改成『世界书』」这件事从来没生效过，
               抽屉头一直显示的是原生 i18n 的标题。
               （本轮探针实测：document.querySelector('#WorldInfoheader h3 span') === null，
                 证实了这一点。）
             现在改成按 i18n key 找，找不到再退化到第一个 h3 > span。
           【为什么清空而不是 remove 节点】
             那个 span 带 data-i18n="Worlds/Lorebooks"，酒馆切语言时会再往里写字。
             删节点的话，i18n 那一步可能报错或者在别处补一个空标题出来。
             → 保留节点、清空文字、打上自己的 class，再由 CSS 把它藏掉
               （见 skin.css 的 .mf-wi-hide）。两道保险：文字空 + 看不见，
               i18n 写回来也看不见。 */
        var titleEl = wi.querySelector('h3 > span[data-i18n="Worlds/Lorebooks"]') || wi.querySelector('h3 > span');
        if (titleEl) {
            titleEl.dataset.mfOrig = '';
            titleEl.textContent = '';
            titleEl.classList.add('mf-wi-hide');
        }

        function retitle() {
            /* 抽屉头不再有标题：书名由面板自己的顶栏（← 书名）承担。 */
            if (!titleEl) return;
            titleEl.textContent = '';
        }

        root.addEventListener('click', onClick);
        root.addEventListener('click', onTri);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        root.addEventListener('keydown', onKey);
        root.addEventListener('blur', onBlur, true);
        root.addEventListener('scroll', function () { lastScroll = root.scrollTop; });

        /* ★★ 2026-11-07 v2.0.8 临时诊断：聊天区「滚到最下面卡住，要等一下」量到底多久
           用户原话：聊天主界面、滚到最下面时卡住、要等一下就恢复。
           读代码排除过的：扩展没在 #chat 上绑任何 scroll/touch 监听；
             .mes 本身无背景无阴影无边框；原生 script.js 没有 #chat 的滚动监听。
           → 只能量。做法：滚到底那一刻起，用 rAF 采 1.2 秒的帧间隔，记最长的一帧。
             · > 400ms 视为真卡，写 window.__mfScrollNote
             · 打开世界书面板时把最近一次写进状态条（例如「滚到底 1830ms」）
             · 全部记录在 window.__mfScrollPerf（最多 30 条）
           ⚠ 纯测量：只加一个 passive 监听 + 1.2 秒的 rAF 循环，不动任何样式和逻辑。
             定性完把这一段整块删掉即可，不影响功能。 */
        (function () {
            var bindTries = 0;
            function bind() {
                var chat = document.getElementById('chat');
                if (!chat) { if (++bindTries < 25) setTimeout(bind, 800); return; }
                if (chat.dataset.mfScrollProbe) return;
                chat.dataset.mfScrollProbe = '1';

                var armed = false, t0 = 0, worst = 0, frames = 0;

                /* ★ v2.0.10：改成「一滚动就采样」，不再只在离底 6px 时采。
                   原因：用户说的是「上下滑动卡」= 整个滚动过程掉帧，
                   而上次只在滚到底那一下采样，抓到的 worst 可能 < 400ms → 什么都没报
                   （用户回「没有」就是这个原因）。
                   现在同时记 worst（停顿型卡）和 fps（掉帧型卡），两者都能看见。 */
                chat.addEventListener('scroll', function () {
                    if (document.hidden) return;
                    if (armed) return;

                    armed = true; t0 = nowMs(); worst = 0; frames = 0;

                    (function loop() {
                        var a = nowMs();
                        frames++;
                        requestAnimationFrame(function () {
                            var d = nowMs() - a;
                            if (d > worst) worst = d;
                            var span = nowMs() - t0;
                            if (span < 1200) { loop(); return; }

                            armed = false;
                            var fps = Math.round(frames / (span / 1000));
                            var rec = {
                                at: Date.now(),
                                worst: Math.round(worst),
                                frames: frames,
                                fps: fps,
                                mes: document.querySelectorAll('#chat .mes').length,
                                scrollH: chat.scrollHeight,
                                clientH: chat.clientHeight
                            };
                            var arr = (window.__mfScrollPerf = window.__mfScrollPerf || []);
                            arr.push(rec);
                            if (arr.length > 30) arr.shift();

                            if (rec.worst >= 400) {
                                window.__mfScrollNote = '滚动停顿 ' + rec.worst + 'ms／楼层 ' + rec.mes;
                                console.warn('[mf-wb] 滚动停顿', rec);
                            } else if (fps < 50) {
                                window.__mfScrollNote = '滚动 ' + fps + 'fps／楼层 ' + rec.mes;
                                console.warn('[mf-wb] 滚动掉帧', rec);
                            }
                        });
                    })();
                }, { passive: true });
            }
            bind();
        })();

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

        /* ★ v2.0.10 诊断函数（定性后可删）：一行念出聊天区的真实状态。
           `楼层` = #chat 里 .mes 的个数（= 真正渲染了多少层）；
           `节点` = #chat 内全部 DOM 元素数（含 markdown 生成的 span/table）；
           `截断` = 运行时 #chat_truncation 下拉的值（和 settings.json 的 5 对不上就是被谁改了）；
           `更早按钮` = 原生 #show_more_messages 是否在（在 = 截断确实生效了）。
           ★ 为什么读 DOM 而不是读 power_user.chat_truncation：
             我们要的是「实际生效值」，不是「配置文件里写的值」，两者可能不一致。 */
        function chatSnapText() {
            var c = document.getElementById('chat');
            if (!c) return '#chat 没找到';
            var mes = c.querySelectorAll('.mes').length;
            var nodes = c.querySelectorAll('*').length;
            var sel = document.getElementById('chat_truncation');
            var tr = sel ? String(sel.value) : '?';
            return '楼层 ' + mes
                + ' · 节点 ' + (nodes >= 1000 ? (nodes / 1000).toFixed(1) + 'k' : nodes)
                + ' · 截断 ' + tr
                + ' · 更早按钮 ' + (document.getElementById('show_more_messages') ? '有' : '无')
                + ' · 视口 ' + c.clientHeight + '/' + c.scrollHeight;
        }

        /* 抽屉打开时才拉数据（关着拉没意义，还拖慢启动） */
        var pre = function () {
            if (wi.classList.contains('closedDrawer')) {
                /* ★ v2.0.7：关抽屉 = 懒保存的兑现点之一。
                   ★ v2.0.8：延后 400ms —— 抽屉切换动画是 260ms，原来用 0
                     会和动画抢主线程，用户感知就是「从一个面板切到另一个时顿一下」。
                     等面板先滑完再写，写盘就藏在动画后面了。
                     没有脏数据时 flushNow 直接 return，零开销。 */
                setTimeout(flushNow, 400);
                return;
            }
            /* ★ v2.0.10 诊断（定性后可整段删）：无条件把聊天区的真实状态念出来。
               要判断的唯一一件事：settings 里 chat_truncation = 5，到底有没有落到 DOM。
                 · 楼层 ≈ 5 且「更早按钮 有」 → 截断生效，卡不在楼层数，去查滚动边界；
                 · 楼层 = 184 且「更早按钮 无」 → 截断没生效，DOM 里是全量，用户判断成立。
               为什么用 toastr 而不是状态条：状态条马上会被 loadAll 的
               「正在读取世界书…」覆盖掉，用户根本看不见。 */
            try {
                var snap = chatSnapText() + (window.__mfScrollNote ? ' ‖ ' + window.__mfScrollNote : '');
                console.log('[mf-wb] 聊天区快照 →', snap, window.__mfScrollPerf);
                if (window.toastr && typeof window.toastr.info === 'function') {
                    window.toastr.info(snap, '聊天区快照', {
                        timeOut: 8000, closeButton: true, progressBar: true, positionClass: 'toast-top-center'
                    });
                }
            } catch (e) { console.warn('[mf-wb] 快照失败', e); }

            /* 诊断：把最近一次「滚到底卡了多久」显示在状态条上（用户能看到） */
            if (window.__mfScrollNote) {
                setStatus('on', window.__mfScrollNote);
                window.__mfScrollNote = '';
            }
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


    /* ═══════════════════════════════════════════════════════════════════
       模块 9：chat-photo —— 主聊天里给 AI 消息挂一张照片
       ═══════════════════════════════════════════════════════════════════
       用户口径（2026-11-13）：
       · 名字下面一条极细虚线「加张照片」，不导入就什么都没有，跟原版一样
       · 导入后 = 头像那种感觉：AI 消息顶部一张图，底部渐变化进正文
       · 宽和高必须各自独立调（不是等比），还有三档预设和三种渐变
       · 收起 = 不渲染，回到普通 HTML
       · 手机上没有 hover，工具条收成一个「⋯」，点开才展开三个操作
       · 只挂该角色这一段里的**最后一条**消息（不是每条都挂）
         ★ v2.6.0 改：原来是「第一条」。用户 2026-11-22 原话：
           「我记得我当时说的是每个角色在最后的一条消息发一张图片，而不是第一条，
             因为是对话的形式，所以我要现场图片嘛，肯定是最后一条图片，最后一条消息有图片，
             这种好一点」
           → 对话是往下走的，最后一条 = 最新鲜的那条 = 「现场感」最强的地方。
             挂第一条的话，往下聊几轮，那张图就埋在很上面了，看不见了。

       ★ 关键实现决定（别乱改）
       1. 存储用 IndexedDB，不用 localStorage。
          一张裁好的图约 1100×300 jpeg ≈ 100~160KB，localStorage 只有 5MB，
          十来个角色就炸；而且 base64 还要再涨 33%。
       2. 只认**角色显示名**做 key，不认 chid。
          group 聊天里 chid 未必等于 characters 下标，按 chid 取会把照片串到别人身上。
          代价：角色改名后照片要重导（可接受，总比串图好）。
       3. 注入点：.mes_block 里 .ch_name 之后、.mes_text 之前。
          找不到 .ch_name 就插到 .mes_text 前，再找不到就插到块首 —— 三级兜底，
          不同版本酒馆的 DOM 差一点也不会崩。
       4. 「最后一条」按当前聊天重新算：每次全量扫 #chat .mes，取该名字**最后一次**出现的那条。
          切聊天 / 删楼 / 继续聊 都会自动重算，不用自己记状态。

       ★ v2.6.0 关键改动：**照片从「每个角色一张」改成「全局一张」**
         【用户口径 2026-11-22】
           「默认这个图片是全局的，也就是导入一张图片，其他新开对话、换一个角色，
             那个图片还是在，只有自己去换了才会换。」
         → 所以存储 key 固定成一个 GLOBAL_KEY，不再按角色名分。
           挂载点仍然是「每个角色的最后一条消息」，但挂的是**同一张**图。
         【老数据怎么办】
           v2.5.x 之前是按角色名存的（key = 角色显示名）。
           读库时如果全局图还没有，就从老数据里挑一张（按 key 排序取第一个，保证每次一样）
           提升成全局图，其余老数据**保留不删**（主人的东西，说好不删）。

       ★ 依赖的皮肤变量（skin.css :root）：--mf-paper / --mf-line2 / --mf-ink2 / --mf-accent
       ═══════════════════════════════════════════════════════════════════ */
    function initChatPhoto() {
        if (window.__mfChatPhoto) return;
        window.__mfChatPhoto = true;

        var LS_KEY = 'mf_ph_style';
        var DB_NAME = 'mf_photo_db';
        var STORE = 'photos';

        /* ── 外观：全局一套，宽/高/渐变 ── */
        var STYLE = { w: 100, h: 118, fade: 'bottom' };
        try {
            var s0 = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            if (typeof s0.w === 'number') STYLE.w = s0.w;
            if (typeof s0.h === 'number') STYLE.h = s0.h;
            if (['bottom', 'both', 'none'].indexOf(s0.fade) >= 0) STYLE.fade = s0.fade;
        } catch (e) { }

        function saveStyle() {
            try { localStorage.setItem(LS_KEY, JSON.stringify(STYLE)); } catch (e) { }
        }
        function applyStyle() {
            var b = document.body;
            b.style.setProperty('--mf-ph-w', STYLE.w + '%');
            b.style.setProperty('--mf-ph-h', STYLE.h + 'px');
            b.setAttribute('data-mf-ph-fade', STYLE.fade);
        }

        /* 预设：只负责套一组 w/h，套完照样能拖滑块 */
        var PRESETS = {
            strip:  { w: 100, r: 4 },
            flat:   { w: 100, r: 2 },
            square: { w: 68,  r: 1 }
        };
        function colWidth() {
            var c = document.querySelector('#chat .mes .mes_block') ||
                    document.querySelector('#chat .mes');
            return c && c.clientWidth ? c.clientWidth : 600;
        }
        function aspect() {
            return Math.max(1, colWidth() * STYLE.w / 100) / Math.max(1, STYLE.h);
        }
        function applyPreset(k) {
            var p = PRESETS[k];
            if (!p) return;
            STYLE.w = p.w;
            STYLE.h = Math.round(colWidth() * p.w / 100 / p.r);
        }
        function presetOf() {
            var cw = colWidth();
            for (var k in PRESETS) {
                var p = PRESETS[k];
                if (Math.abs(STYLE.w - p.w) <= 1 &&
                    Math.abs(STYLE.h - cw * p.w / 100 / p.r) <= 4) return k;
            }
            return '';
        }

        /* ── 存储：IndexedDB ── */
        var dbp = null;
        function openDB() {
            if (dbp) return dbp;
            dbp = new Promise(function (res, rej) {
                var r;
                try { r = indexedDB.open(DB_NAME, 1); } catch (e) { rej(e); return; }
                r.onupgradeneeded = function () {
                    var d = r.result;
                    if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
                };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { rej(r.error); };
            });
            return dbp;
        }
        function dbPut(key, blob) {
            return openDB().then(function (d) {
                return new Promise(function (res, rej) {
                    var tx = d.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).put(blob, key);
                    tx.oncomplete = function () { res(); };
                    tx.onerror = function () { rej(tx.error); };
                });
            });
        }
        function dbDel(key) {
            return openDB().then(function (d) {
                return new Promise(function (res, rej) {
                    var tx = d.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).delete(key);
                    tx.oncomplete = function () { res(); };
                    tx.onerror = function () { rej(tx.error); };
                });
            });
        }
        function dbAll() {
            return openDB().then(function (d) {
                return new Promise(function (res, rej) {
                    var tx = d.transaction(STORE, 'readonly');
                    var st = tx.objectStore(STORE);
                    var keys = [], vals = [], n = 0;
                    function done() {
                        if (++n < 2) return;
                        var m = new Map();
                        keys.forEach(function (k, i) { m.set(k, vals[i]); });
                        res(m);
                    }
                    var kr = st.getAllKeys(), vr = st.getAll();
                    kr.onsuccess = function () { keys = kr.result || []; done(); };
                    vr.onsuccess = function () { vals = vr.result || []; done(); };
                    tx.onerror = function () { rej(tx.error); };
                });
            });
        }

        /* key → { blob, url, hidden }
           ★ v2.6.0：全局一张，所以正常只会有一条记录，key 固定 GLOBAL_KEY。
             Map 结构保留（老数据是按角色名存的，还在库里，读的时候靠迁移逻辑处理）。 */
        var GLOBAL_KEY = '__global__';
        var PHOTOS = new Map();
        var ready = false;

        function setMem(key, blob, hidden) {
            var old = PHOTOS.get(key);
            if (old && old.url) URL.revokeObjectURL(old.url);
            PHOTOS.set(key, { blob: blob, url: URL.createObjectURL(blob), hidden: !!hidden });
        }

        /* ── DOM 工具 ── */
        function isUser(m) {
            var a = m.getAttribute('is_user');
            if (a !== null) return a === 'true';
            return m.classList.contains('is_user');
        }
        function nameOf(m) {
            var nt = m.querySelector('.ch_name .name_text');
            if (nt) {
                var s = (nt.textContent || '').trim();
                if (s) return s;
            }
            var cn = m.querySelector('.ch_name');
            if (cn) {
                /* .ch_name 里除了名字还塞着编辑/删除等按钮，直接读 textContent 会拼成一串垃圾。
                   只认第一个非空文本节点，退一步认第一个 span。 */
                for (var i = 0; i < cn.childNodes.length; i++) {
                    var n = cn.childNodes[i];
                    if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim();
                }
                var sp = cn.querySelector('span');
                if (sp && sp.textContent.trim()) return sp.textContent.trim();
            }
            return (m.getAttribute('data-name') || '').trim();
        }

        var barSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
        var plusSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

        function photoHTML(key) {
            return '<img class="mf-ph-img" alt="">'
                + '<div class="mf-ph-bar">'
                + '  <button class="mf-ph-more" type="button" title="照片">' + barSvg + '</button>'
                + '</div>'
                + '<div class="mf-ph-menu">'
                + '  <button type="button" data-act="style">外观</button>'
                + '  <button type="button" data-act="swap">换图</button>'
                + '  <button type="button" data-act="fold">收起</button>'
                + '</div>';
        }

        function insertPhoto(mes, key, info) {
            var block = mes.querySelector('.mes_block') || mes;
            var nameEl = block.querySelector('.ch_name');
            var textEl = block.querySelector('.mes_text');
            var el = document.createElement('div');
            el.className = 'mf-ph';
            el.setAttribute('data-mf-key', key);
            el.innerHTML = photoHTML(key);
            el.querySelector('.mf-ph-img').src = info.url;
            if (nameEl && nameEl.parentNode === block) {
                block.insertBefore(el, nameEl.nextSibling);
            } else if (textEl && textEl.parentNode === block) {
                block.insertBefore(el, textEl);
            } else {
                block.insertBefore(el, block.firstChild);
            }
        }

        function insertEntry(mes, key) {
            var block = mes.querySelector('.mes_block') || mes;
            var nameEl = block.querySelector('.ch_name');
            var textEl = block.querySelector('.mes_text');
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'mf-addp';
            el.setAttribute('data-mf-add', key);
            el.innerHTML = '<i></i><span>' + plusSvg + '加张照片</span><i></i>';
            if (nameEl && nameEl.parentNode === block) {
                block.insertBefore(el, nameEl.nextSibling);
            } else if (textEl && textEl.parentNode === block) {
                block.insertBefore(el, textEl);
            } else {
                block.insertBefore(el, block.firstChild);
            }
        }

        /* ── 扫描 + 注入 ──
           ★ v2.6.0：挂载点从「该角色的第一条」改成「该角色的最后一条」；
             图片本身从「每个角色一张」改成「全局一张」（PHOTOS 里只认 GLOBAL_KEY）。
           扫法：全量遍历 #chat .mes，把 AI 消息按名字分组，
           同一个名字后出现的覆盖先出现的 → Map 里留下的就是「最后一条」。 */
        function scan() {
            var chat = document.getElementById('chat');
            if (!chat || !ready) return;

            var mesList = Array.prototype.slice.call(chat.querySelectorAll('.mes'));
            var last = new Map();
            mesList.forEach(function (m) {
                if (isUser(m)) return;
                var k = nameOf(m);
                if (!k) return;
                last.set(k, m);
            });

            var info = PHOTOS.get(GLOBAL_KEY);

            /* 1. 清掉不该留的：不是「该角色最后一条」的、或者照片已被收起/删除 */
            Array.prototype.forEach.call(chat.querySelectorAll('.mf-ph'), function (el) {
                var owner = el.closest('.mes');
                var ok = owner && last.get(nameOf(owner)) === owner && info && !info.hidden;
                if (!ok) el.remove();
            });
            Array.prototype.forEach.call(chat.querySelectorAll('.mf-addp'), function (el) {
                var owner = el.closest('.mes');
                var ok = owner && last.get(nameOf(owner)) === owner && !(info && !info.hidden);
                if (!ok) el.remove();
            });

            /* 2. 补上缺的 */
            last.forEach(function (m, k) {
                if (info && !info.hidden) {
                    if (!m.querySelector('.mf-ph')) insertPhoto(m, GLOBAL_KEY, info);
                } else {
                    if (!m.querySelector('.mf-addp') && !m.querySelector('.mf-ph')) insertEntry(m, GLOBAL_KEY);
                }
            });
        }

        var raf = 0;
        function schedule() {
            if (raf) return;
            raf = requestAnimationFrame(function () { raf = 0; scan(); });
        }

        function waitChat() {
            var c = document.getElementById('chat');
            if (!c) { setTimeout(waitChat, 500); return; }
            new MutationObserver(schedule).observe(c, { childList: true });
            schedule();
        }

        /* ── 事件：照片上的 ⋯ / 加照片入口 ── */
        document.addEventListener('click', function (ev) {
            var more = ev.target.closest('.mf-ph-more');
            if (more) {
                ev.preventDefault();
                ev.stopPropagation();
                var ph = more.closest('.mf-ph');
                var open = ph.classList.contains('menu-on');
                document.querySelectorAll('.mf-ph.menu-on').forEach(function (x) { x.classList.remove('menu-on'); });
                if (!open) ph.classList.add('menu-on');
                return;
            }
            if (ev.target.closest('.mf-ph-menu')) {
                /* ★ 菜单项必须先处理，再判"点在菜单里就 return"。
                   原来顺序写反了，导致点「外观/换图/收起」全被第 2 条拦掉，
                   表现就是菜单能开、点了没反应。 */
                var mi = ev.target.closest('[data-act]');
                if (mi) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var key = mi.closest('.mf-ph').getAttribute('data-mf-key');
                    var act = mi.getAttribute('data-act');
                    mi.closest('.mf-ph').classList.remove('menu-on');
                    if (act === 'fold') {
                        var i2 = PHOTOS.get(key);
                        if (i2) { i2.hidden = true; scan(); }
                    } else if (act === 'swap') {
                        openSheet(key);
                    } else if (act === 'style') {
                        openStyle(mi);
                    }
                }
                return;
            }

            document.querySelectorAll('.mf-ph.menu-on').forEach(function (x) { x.classList.remove('menu-on'); });

            var add = ev.target.closest('[data-mf-add]');
            if (add) {
                ev.preventDefault();
                ev.stopPropagation();
                var k = add.getAttribute('data-mf-add');
                var info = PHOTOS.get(k);
                if (info && info.hidden) { info.hidden = false; scan(); }
                else openSheet(k);
                return;
            }
        }, true);

        /* ── 外观面板 ── */
        var styleEl = null;
        function buildStyle() {
            if (styleEl) return styleEl;
            var d = document.createElement('div');
            d.className = 'mf-ph-pop';
            d.innerHTML =
                '<div class="mf-ph-popt">照片外观<em>所有照片共用</em></div>'
                + '<div class="mf-ph-row"><span>预设</span><div class="mf-ph-seg" data-k="preset">'
                + '<button type="button" data-p="strip">横条</button>'
                + '<button type="button" data-p="flat">扁条</button>'
                + '<button type="button" data-p="square">方块</button></div></div>'
                + '<div class="mf-ph-row"><span>宽</span><input id="mfPhW" type="range" min="5" max="100" step="1"><b id="mfPhWv">100%</b></div>'
                + '<div class="mf-ph-row"><span>高</span><input id="mfPhH" type="range" min="16" max="900" step="1"><b id="mfPhHv">118</b></div>'
                + '<div class="mf-ph-row"><span>渐变</span><div class="mf-ph-seg" data-k="fade">'
                + '<button type="button" data-v="bottom">仅底部</button>'
                + '<button type="button" data-v="both">上下</button>'
                + '<button type="button" data-v="none">无</button></div></div>';

            d.addEventListener('click', function (ev) {
                var p = ev.target.closest('[data-p]');
                if (p) { applyPreset(p.getAttribute('data-p')); syncStyle(); applyStyle(); saveStyle(); return; }
                var v = ev.target.closest('[data-v]');
                if (v) { STYLE.fade = v.getAttribute('data-v'); syncStyle(); applyStyle(); saveStyle(); }
            });

            var rw = d.querySelector('#mfPhW'), rh = d.querySelector('#mfPhH');
            rw.addEventListener('input', function () {
                STYLE.w = +rw.value;
                d.querySelector('#mfPhWv').textContent = rw.value + '%';
                syncPreset(); applyStyle(); saveStyle();
            });
            rh.addEventListener('input', function () {
                STYLE.h = +rh.value;
                d.querySelector('#mfPhHv').textContent = rh.value;
                syncPreset(); applyStyle(); saveStyle();
            });
            document.body.appendChild(d);
            styleEl = d;
            return d;
        }
        function syncPreset() {
            var cur = presetOf();
            styleEl.querySelectorAll('[data-k="preset"] button').forEach(function (b) {
                b.classList.toggle('on', b.getAttribute('data-p') === cur);
            });
        }
        function syncStyle() {
            styleEl.querySelectorAll('[data-k="fade"] button').forEach(function (b) {
                b.classList.toggle('on', b.getAttribute('data-v') === STYLE.fade);
            });
            styleEl.querySelector('#mfPhW').value = STYLE.w;
            styleEl.querySelector('#mfPhWv').textContent = STYLE.w + '%';
            styleEl.querySelector('#mfPhH').value = STYLE.h;
            styleEl.querySelector('#mfPhHv').textContent = STYLE.h;
            syncPreset();
        }
        function openStyle(anchor) {
            var d = buildStyle();
            syncStyle();
            d.classList.add('on');
            var r = anchor.closest('.mf-ph').getBoundingClientRect();
            d.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.right - 258)) + 'px';
            var top = r.bottom + 8;
            if (top + d.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - d.offsetHeight - 8);
            d.style.top = top + 'px';
        }
        document.addEventListener('mousedown', function (e) {
            if (styleEl && styleEl.classList.contains('on') &&
                !e.target.closest('.mf-ph-pop') && !e.target.closest('.mf-ph-more')) {
                styleEl.classList.remove('on');
            }
        });

        /* ── 裁图面板 ── */
        var sheet = null, cropImg, cropBox, zoomIn, okBtn, delBtn, curKey = '';
        var natW = 0, natH = 0, zoom = 1, ox = 0, oy = 0, base = 1;

        function buildSheet() {
            if (sheet) return sheet;
            var d = document.createElement('div');
            d.className = 'mf-ph-sheet';
            d.innerHTML =
                '<div class="mf-ph-card">'
                + '<header>加一张照片<button class="x" type="button" data-a="cancel">&times;</button></header>'
                + '<div class="mf-ph-pick">'
                + '  <label class="dz">' + plusSvg + '<b>点击选择照片</b><span>也可以直接拖进来</span>'
                + '  <input type="file" accept="image/*" hidden></label>'
                + '</div>'
                + '<div class="mf-ph-crop"><div class="mf-ph-box"><img alt=""><i class="frame"></i></div>'
                + '  <p class="hint">拖动调整位置 · 滑块缩放 · 框内就是最后出图的范围</p>'
                + '  <input type="range" min="1" max="3" step="0.01" value="1"></div>'
                + '<footer><button class="ghost" type="button" data-a="del">删照片</button>'
                + '<button class="ghost" type="button" data-a="cancel">取消</button>'
                + '<button class="ok" type="button" data-a="ok" disabled>确定</button></footer>'
                + '</div>';
            document.body.appendChild(d);

            cropImg = d.querySelector('.mf-ph-box img');
            cropBox = d.querySelector('.mf-ph-box');
            zoomIn = d.querySelector('.mf-ph-crop input');
            okBtn = d.querySelector('[data-a="ok"]');
            delBtn = d.querySelector('[data-a="del"]');

            d.querySelector('.dz input').addEventListener('change', function (e) {
                var f = e.target.files && e.target.files[0];
                if (f) loadFile(f);
            });
            ['dragenter', 'dragover'].forEach(function (t) {
                d.addEventListener(t, function (e) { e.preventDefault(); d.classList.add('over'); });
            });
            ['dragleave', 'drop'].forEach(function (t) {
                d.addEventListener(t, function (e) { e.preventDefault(); d.classList.remove('over'); });
            });
            d.addEventListener('drop', function (e) {
                var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (f && /^image\//.test(f.type)) loadFile(f);
            });
            d.addEventListener('click', function (e) {
                if (e.target === d) closeSheet();
                var a = e.target.closest('[data-a]');
                if (!a) return;
                var act = a.getAttribute('data-a');
                if (act === 'cancel') closeSheet();
                else if (act === 'del') removePhoto();
                else if (act === 'ok') commit();
            });

            /* 拖拽 / 缩放 */
            var drag = null;
            cropBox.addEventListener('pointerdown', function (e) {
                if (!cropImg.src) return;
                drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
                cropBox.setPointerCapture(e.pointerId);
            });
            cropBox.addEventListener('pointermove', function (e) {
                if (!drag) return;
                ox = drag.ox + (e.clientX - drag.x);
                oy = drag.oy + (e.clientY - drag.y);
                paint();
            });
            cropBox.addEventListener('pointerup', function () { drag = null; });
            cropBox.addEventListener('pointercancel', function () { drag = null; });
            zoomIn.addEventListener('input', function (e) {
                if (!cropImg.src) return;
                var cw = cropBox.clientWidth, ch = cropBox.clientHeight;
                var cx = cw / 2, cy = ch / 2, k = (+e.target.value) / zoom;
                ox = cx - (cx - ox) * k;
                oy = cy - (cy - oy) * k;
                zoom = +e.target.value;
                paint();
            });
            cropBox.addEventListener('wheel', function (e) {
                if (!cropImg.src) return;
                e.preventDefault();
                var nv = Math.min(3, Math.max(1, zoom + (e.deltaY > 0 ? -0.06 : 0.06)));
                var cw = cropBox.clientWidth, ch = cropBox.clientHeight;
                var cx = cw / 2, cy = ch / 2, k = nv / zoom;
                ox = cx - (cx - ox) * k;
                oy = cy - (cy - oy) * k;
                zoom = nv; zoomIn.value = nv;
                paint();
            }, { passive: false });

            sheet = d;
            return d;
        }

        function loadFile(file) {
            var fr = new FileReader();
            fr.onload = function () { loadSrc(fr.result); };
            fr.readAsDataURL(file);
        }
        function loadSrc(src) {
            cropImg.onload = function () {
                natW = cropImg.naturalWidth;
                natH = cropImg.naturalHeight;
                sheet.querySelector('.mf-ph-pick').style.display = 'none';
                sheet.querySelector('.mf-ph-crop').classList.add('on');
                okBtn.disabled = false;
                syncBox();
                fitReset();
            };
            cropImg.src = src;
        }

        /* 取景框跟着当前宽高比走（跟原型同一套：竖图按高度反算宽度，保住比例） */
        function syncBox() {
            var ar = aspect();
            var avail = Math.max(120, cropBox.parentElement.clientWidth - 2);
            var maxH = Math.min(window.innerHeight * 0.42, 400);
            var w = avail, h = w / ar;
            if (h > maxH) { h = maxH; w = Math.max(80, h * ar); }
            cropBox.style.width = Math.round(w) + 'px';
            cropBox.style.height = Math.round(h) + 'px';
            cropBox.style.margin = '0 auto';
        }
        function fitReset() {
            var cw = cropBox.clientWidth, ch = cropBox.clientHeight;
            base = Math.max(cw / natW, ch / natH);
            zoom = 1; zoomIn.value = 1;
            var w = natW * base, h = natH * base;
            ox = (cw - w) / 2; oy = (ch - h) / 2;
            paint();
        }
        function paint() {
            var w = natW * base * zoom, h = natH * base * zoom;
            cropImg.style.width = w + 'px';
            cropImg.style.height = h + 'px';
            clampPos();
            cropImg.style.left = ox + 'px';
            cropImg.style.top = oy + 'px';
        }
        function clampPos() {
            var w = natW * base * zoom, h = natH * base * zoom;
            var cw = cropBox.clientWidth, ch = cropBox.clientHeight;
            if (w <= cw) ox = (cw - w) / 2; else ox = Math.min(0, Math.max(cw - w, ox));
            if (h <= ch) oy = (ch - h) / 2; else oy = Math.min(0, Math.max(ch - h, oy));
        }

        function openSheet(key) {
            var d = buildSheet();
            curKey = key;
            var info = PHOTOS.get(key);
            d.querySelector('.mf-ph-pick').style.display = '';
            d.querySelector('.mf-ph-crop').classList.remove('on');
            d.querySelector('.mf-ph-pick input').value = '';
            delBtn.style.display = info ? '' : 'none';
            okBtn.disabled = true;
            cropImg.removeAttribute('src');
            d.classList.add('on');
        }
        function closeSheet() { if (sheet) sheet.classList.remove('on'); curKey = ''; }

        function removePhoto() {
            if (!curKey) return;
            var k = curKey;
            dbDel(k).catch(function () { });
            var o = PHOTOS.get(k);
            if (o && o.url) URL.revokeObjectURL(o.url);
            PHOTOS.delete(k);
            closeSheet();
            scan();
        }

        function commit() {
            if (!curKey || !cropImg.src) return;
            var k = curKey;
            var cw = cropBox.clientWidth, ch = cropBox.clientHeight;
            var scale = natW / (natW * base * zoom);
            var sx = -ox * scale, sy = -oy * scale, sw = cw * scale, sh = ch * scale;

            var ar = cw / Math.max(1, ch);
            var MAXP = 1100, OW, OH;
            if (ar >= 1) { OW = MAXP; OH = Math.max(24, Math.round(MAXP / ar)); }
            else { OH = MAXP; OW = Math.max(24, Math.round(MAXP * ar)); }

            var cv = document.createElement('canvas');
            cv.width = OW; cv.height = OH;
            var ctx = cv.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            try {
                ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, OW, OH);
            } catch (e) { }

            cv.toBlob(function (blob) {
                if (!blob) { closeSheet(); return; }
                setMem(k, blob, false);
                dbPut(k, blob).catch(function () { });
                closeSheet();
                scan();
            }, 'image/jpeg', 0.88);
        }

        /* 调试钩子：只在本地模拟页/控制台用，线上不影响功能。
           没有它就没法在 CDP 里塞一张测试图，只能靠手动选文件。 */
        window.__mfPhotoAPI = {
            photos: PHOTOS,
            scan: scan,
            setMem: setMem,
            put: dbPut,
            style: STYLE,
            applyStyle: applyStyle,
            aspect: aspect
        };

        /* ── 启动 ── */
        applyStyle();
        dbAll().then(function (m) {
            /* ★ v2.6.0 迁移：老数据是「每个角色一张」（key = 角色显示名），
               新版是「全局一张」（key = __global__）。
               如果全局图还没有，就从老数据里挑一张提升上来 ——
               按 key 排序取第一个，保证每次启动挑的都是同一张，不会换来换去。
               老记录本身**保留不删**（主人的东西）。 */
            var g = m.get(GLOBAL_KEY);
            if (!g) {
                var keys = Array.prototype.slice.call(m.keys()).sort();
                for (var i = 0; i < keys.length; i++) {
                    var b0 = m.get(keys[i]);
                    if (b0 instanceof Blob) {
                        PHOTOS.set(GLOBAL_KEY, { blob: b0, url: URL.createObjectURL(b0), hidden: false });
                        dbPut(GLOBAL_KEY, b0).catch(function () { });
                        break;
                    }
                }
            }
            m.forEach(function (blob, k) {
                if (blob instanceof Blob && !PHOTOS.has(k)) {
                    PHOTOS.set(k, { blob: blob, url: URL.createObjectURL(blob), hidden: false });
                }
            });
            ready = true;
            waitChat();
        }).catch(function (e) {
            console.warn(LOG, '照片库读取失败（IndexedDB 不可用？）', e);
            ready = true;
            waitChat();
        });

        /* 调试用：?mfph=diag 在控制台打一遍结构自检 */
        if (/[?&]mfph=diag/.test(location.search)) {
            setTimeout(function () {
                var m = document.querySelector('#chat .mes');
                console.log(LOG, '照片自检', {
                    chat: !!document.getElementById('chat'),
                    mes: document.querySelectorAll('#chat .mes').length,
                    block: !!document.querySelector('#chat .mes .mes_block'),
                    chName: !!document.querySelector('#chat .mes .ch_name'),
                    nameText: !!document.querySelector('#chat .mes .ch_name .name_text'),
                    isUserAttr: m ? m.getAttribute('is_user') : null,
                    key: m ? nameOf(m) : null,
                    photos: PHOTOS.size
                });
            }, 2500);
        }
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 10 · 角色墙（改造酒馆原生角色列表）
       ─────────────────────────────────────────────────────────────────────
       【为什么是"改造"而不是"新建"】
       用户 2026-11-13 原话：「这个角色墙所对应的就是酒馆那个东西啊，而不是新增的」。
       所以目标节点是原生常驻的 #rm_print_characters_block，不另开界面。

       【为什么不重建 DOM】
       原生格子上挂着：点击选中、双击开聊、拖拽排序、右键菜单、收藏切换、
       批量编辑、标签文件夹钻取。重建 DOM 就得把这些事件全部重接一遍，
       而且 printCharacters 每次翻页/搜索都会 .empty() 整块重绘，
       重建方案要在每条路径上重挂一次，漏一处就坏一个功能。
       → 所以：结构零改动，JS 只做「加 class」，外观全交给 skin.css。

       【为什么主图必须用 JS 标、不能用 :nth-child】
       #rm_print_characters_block 里除 .character_select 外，还会混进
       .character_group / .bogus_folder_select（标签文件夹）/ .empty_block /
       .hidden_block / .back_block（见 script.js:1044 的 switch）。
       用 :nth-child(1) 会把"返回块"当成主图。必须筛出真正的 .character_select。

       【真实结构（2026-11-13 读 SillyTavern release 分支核对）】
       script.js:945 getCharacterBlock / index.html:7232 模板
         .character_select[data-chid]        ← ★ 是 data-chid，不是 chid
                           .is_fav           ← ★ 收藏状态靠这个 class
           .avatar > img                     ← 真 img，src 是缩略图
           .character_select_container
             .character_name_block > .ch_name
             .ch_additional_info / .ch_description / .tags / .ch_fav_icon

       【皮肤这边的坑（改动前必读）】
       原生 style.css 有四处跟卡片墙完全相反，skin.css 里全部用 !important 盖了：
         :2913 #rm_print_characters_block{display:flex}   → 改成 grid
         :3285 .character_select{flex-direction:row;padding:5px} → 改成 column
         :1406 .avatar{width/height:固定值;border-radius:圆形}
         :1450 .avatar img{同上 + border + box-shadow}
         :3353 .character_select_container{position:relative}
           ★ 这条最阴：它会把 .ch_fav_icon 的 absolute 从卡片右上角
             拽到名字行里。已在 skin.css 里打回 position:static。

       【重绘怎么跟上】
       printCharacters 的 callback 每次都 $(listId).empty() 再 append，
       所以每次翻页 / 搜索 / 换排序 / 切标签文件夹，class 都会被冲掉。
       → MutationObserver 盯 childList（不盯 attributes，否则自己加 class 会自激）。
       → 另加一个 1.2s 的低频检查：面板关闭再打开时 block 节点会被整体重建，
         那时旧 observer 已经盯不住新节点了。开销是一次 querySelector，可忽略。
       ═════════════════════════════════════════════════════════════════════ */
    var MF_WALL_HERO_AT = 0;   /* 第几个格子当 2×2 主图（0 = 第一个） */
    var MF_WALL_BIG_AT = 4;    /* 第几个格子跨两行（4 = 第五个） */

    function mfMarkWall(block) {
        if (!block) return;

        var kids = Array.prototype.slice.call(block.children);
        for (var i = 0; i < kids.length; i++) {
            kids[i].classList.remove('mf-hero', 'mf-big');
        }

        /* 只认真正的角色格子，跳过分组 / 文件夹 / 空态 / 返回块
           ★ v2.6.0：也要跳过我们自己插的「＋ 新建」卡（.mf-newcard），
             它不是角色，不能参与 hero / big 的序号分配。 */
        var chars = kids.filter(function (el) {
            return el.classList && el.classList.contains('character_select')
                && !el.classList.contains('mf-newcard');
        });

        /* ★★ 保险：认不出结构就一个 class 都不加，保持酒馆原生外观。
           理由 —— 本模块的 CSS 全部挂在 .mf-wall 上，而 .mf-wall 只在
           这里加。所以最坏的结果是"这次没效果"，绝不可能是"面板被改坏"。
           触发场景：这版客户端的 DOM 跟上游 release 不一样（改了类名、
           换了虚拟列表）。那时应该去补选择器，而不是让用户面对一个
           半残的面板。 */
        if (!chars.length) {
            block.classList.remove('mf-wall');
            return;
        }

        block.classList.add('mf-wall');
        for (var j = 0; j < chars.length; j++) {
            if (j === MF_WALL_HERO_AT) chars[j].classList.add('mf-hero');
            else if (j === MF_WALL_BIG_AT) chars[j].classList.add('mf-big');
            /* ★ v2.7.0：角色墙的「没头像」判定整个并入全局默认图替换器。
               v2.6.0 这里的判据是「img 有没有 src」——错的：
               酒馆给没上传头像的卡把**默认图烤进了角色卡 PNG**，
               src 一直都有（而且是 /thumbnail?file=xxx.png）→ 永远判成「有头像」
               → 默认图从来没上场。
               现在改成：按图像字节指纹比对，跟酒馆默认图同图的才换
               （详见 initDefaultAvatarReplace 附近的说明）。
               mfSwapDefaultAvatar 是异步的（要先 fetch 拿指纹），
               这里只是发起一次判定，真正的兜底在全局 MutationObserver + 3s 巡检。 */
            var av = chars[j].querySelector('.avatar');
            if (av) {
                var im = av.querySelector('img');
                if (im) {
                    mfSwapDefaultAvatar(im);
                    /* 头像文件被删 / 404 → 破图 → 也换默认图。
                       用 data-mf-err 标记，防重复挂监听。 */
                    if (!im.getAttribute('data-mf-err')) {
                        im.setAttribute('data-mf-err', '1');
                        im.addEventListener('error', function (e) {
                            var t = e.currentTarget;
                            if (!t || t.getAttribute('data-mf-default-avatar')) return;
                            var pick = mfRandomDefaultImg();
                            if (!pick) return;
                            t.setAttribute('src', pick);
                            t.setAttribute('data-mf-default-avatar', '1');
                        });
                    }
                }
            }
        }
    }

    /* ── v2.6.0 · 末尾「＋ 新建」卡 ──
       【用户口径 2026-11-22】
       「角色墙在最末尾也加一个相似的框，不过那个框里面是一个加号，这样的话就可以新建了。」

       【为什么插进 #rm_print_characters_block，而不是自己画一面墙】
         原生 printCharacters 每次翻页 / 搜索 / 排序 / 切标签文件夹都会
         $(list).empty() 再 append —— 我们插的卡会被一起清掉。
         → 所以挂到已有的 MutationObserver（childList）回调里补回来，
           补之前先查 #mf-newcard 在不在 → 不会重复插、不会自激。

       【为什么点它走原生 #rm_button_create】
         同 v2.5.0 顶部那个「＋ 新建」：新建表单要处理头像 / 预设 / 导入 / 默认提示，
         自己重建 = 把酒馆的坑重踩一遍。原生按钮即使 display:none 也照样能 click。

       【为什么这张卡故意带 .character_select class】
         不带就没法复用 .mf-wall 那整套网格与卡片样式
         （grid-template-rows: 1fr auto、圆角、裁切等）。
         代价是原生 $(document).on('click', '.character_select', ...) 也会收到它
         → 我们在卡片上 stopPropagation，事件到不了 document，原生不会误触发。
         另外 mfMarkWall 里已把 .mf-newcard 排除在 hero / big 序号之外。 */
    function mfEnsureNewCard(block) {
        if (!block) return;
        if (block.querySelector('#mf-newcard')) return;

        var card = document.createElement('div');
        card.id = 'mf-newcard';
        card.className = 'character_select mf-newcard';
        card.setAttribute('data-mf-newcard', '1');
        card.innerHTML =
            '<div class="avatar mf-newcard-av"><span class="mf-newcard-plus">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
            + ' stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
            + '</span></div>'
            + '<div class="character_select_container"><div class="character_name_block">'
            + '<div class="ch_name">新建角色</div></div></div>';

        card.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var native = document.getElementById('rm_button_create');
            if (native) native.click();
            else alert('没找到原生新建按钮');
        });

        block.appendChild(card);
    }

    /* ── v2.6.0 · 没有头像的角色卡用默认图（两张随机一张）──
       【用户口径 2026-11-22】
       「把那个角色墙那个默认图片改成这个。」（主人给了两张图）
       「角色墙如果是默认就那个随机播放」→ 随机取一张当默认图。

       【为什么图是 base64 内联，而不是放在扩展目录里当文件】
         实测这个客户端**不提供** third-party 扩展的静态资源路由
         （/scripts/extensions/third-party/<name>/x.jpg 与 /extensions/... 全是 404），
         所以放在目录里的图片浏览器根本取不到 → 只能内联成 data URI。
         图已压到 360×540 jpeg q80（约 45KB / 37KB），base64 后约 60KB / 50KB。

       【每个位置各自随机】
         v2.6.0 是「整页随机一次」（CSS 变量是全局一份，所有卡必然同一张）。
         v2.7.0 改成「每个 <img> 独立随机」—— 每个节点各自抽一张，
         所以墙上十几张卡会各不相同。
         ★ 「只随机一次」现在靠 DOM 上的 data-mf-default-avatar 标记保证：
           换过的节点不再重复处理，图片不会一直在跳（否则像在抽卡）。 */
    /* ★ 两张默认图（主人给的），base64 内联。
       占位符由 tools/inject_wall_imgs.js 填 —— 手写这段 base64 会把 diff 撑爆。
       ★ v2.7.0 起这个数组是**全局**默认头像池（不只服务角色墙）。 */
    var MF_WALL_DEFAULT_IMGS = [
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAIcAWgDASIAAhEBAxEB/8QAGwAAAQUBAQAAAAAAAAAAAAAAAwABAgQFBgf/xAAaAQADAQEBAQAAAAAAAAAAAAABAgMABAUG/9oADAMBAAIQAxAAAAHiWk3OUSExjEhFDYvZ/RcnRW2sOMLafQ8cVt2DGneda4RUWgrodgjtBGLWGdGqHlTmyyzxwmIctoV5iIrXQyoob1aup6PKzxRfdxRqiJ4tZJmrPm0q0c/npnJL0eNrNUq6da3VBMQRiHImm1uDCV7JKksd3RwKvJfqeh4UFV9WjhbfbF4nVRVa2lNEd8SbOr6glOYtBhs5r8dsXM6jkpYoYtg8UmzRnA4birst+rGKsXK084pXRFRdHM0lKmaPWHRc05oZYvGWE5DcEl3OmKaCpObXzZchTT6LlN8y7yGCS8Nt8Rwdim0ed6wrtXlpZG8qqw8uBwszoR0lgx0wKKMLYsAMWNAIJh6lWFgRatCQ9MagiumhyPRNTvJXOWlBKUG0WIzY6U2lky1wUjRnYG8ovJmmSxUkZ7NrnyY6upT67i6nqlfk6Kqt04tSt1jSeWDrjqLmrwlvvj2AeTr3h08MFwdStSgQsvSqYZ2dszIxqu7h4hToC86TXWhnulN6WC8OvZjUqB961yEHl3bcdJ16jPw7jS0GqxKkGpNOFkW2idREJ/M6CpKqqgwkYuAU6vIl2quzgkaVNKvul9rz+flsZp1WAq7Lt6WftE5efr4m2NhdLj5MVaaTUiVXpQ41HaLxiyFZkGacXKyKE+xNKpeBKSJMw46+1jxPQ9PzPFXcEYHDTRy7Kugs+1DNZqamWuNSDDktUssOdOj2OR3vofNvQzqDruDwNMa7MUcSDhE5uC63mlXnFpJRhp3usWnIYblfCEpPs02Jg82nsXcxfVC6uwGWnAEp1Pwvd8cm1ZZ0fNts0qZwTQzVClgUJxoqVwKsbPtVzq5aV32/NI036oBnOuMxqolNwVMI1qtWiCNMhqsk95s6fZnRNoOcgNaV442eXR7Y6pp6VXXmahfdaxJYKNo5A5kYss+Xj992xiX0a2wiwJJDaTOnicqr0bKW5Vu+75NnSx4OOxscZpzp0VUxH3G4Xe8RptOs4wkdTPPSgrSJIS2O9eRFhBIysxbGwvXM/UXoqSnmLXZzs+0y6OD0PJbI1Zg2MQJvH79DN37dzgF2BSObXvZID2si0uG8LvZzF06c+3humy7IJp5vPFfT28rY70nM4o2FodeOFxVltipkyPKC2LML7WJ1z7F9LD0IuKEopcmQGiNSLRpqe2wblKikUZDVKO3UnR9zFnxduwTNqNPQ56xnMtYxLjKQxwdfMBFgqVxWqihqNgBSBxHGac4PnVdTe0iKi8qk9YTZNs84aIIO9Lui6a2MUprOug4oR5qtnWxaKjVrGFQFGatsdoz2pzc3P0U7TivCYZw2q3glUzdSYVK9qgZECUSpTGYRSNgFo4kbV4nInryxrrURPmSZ2i6T7P3fG+uimg067ULHCy0fU52zUm4qetlBbJIWcxiQi4sVji2kRD2kIgATCKLZqt7NKzuVLquRJsKVa7mtKcWiqDgaBUZLpmFbUr31pJC02IVFYeaR3s4JTV1MvYavn3Y63ZcxZqR6OqfPtoShKzLj43YMRyM+w5yqc8ayJS9mxRGJXsWNiZd/GoLcel56VIMjV56NqiRLGKFK1nMuVyooyfR3dTI6ChoK1nK4pU8szsCw2ae4sZbXnxx8t9jOphrLRv4J6L2MubNDr6qXK2Ofo6UnMZ7L3b8B1lh0nP08+sbujmU5U6NsjdKms0+YZR9TVptsba5/oea5UUfXw48o3lqAhoZpAExwikjNLFg5S08HVy3lRzL9PTppoFGUltVeSdWdnBeZtZKY0tsitk37mhjQ6GriV2/zwjUUArESMTVcCtWJWyeT0ur6DzolefrNXhDRuTSDRt5/fDOA7RpQnLprSsUgzUtCtWNC9mwml2oJmRRYLKavAeEYyZlikhtuONYnTReqVaWC0GB0nzS7ae5idZU8rm59y8SmgRlSksYwNU2hy17po34hDJ0cl8Dl4va67mJCfzu5s8t0xWtqVbfneq2Htc2DrUYA9HzbxsgIjfgaYezXcWNOp02CVzB3a4wEdYUbdUlZaWZp00NZ9UZOcW7VI6ntuftm3jfR8t1zIS/laLqVLGxPy8gyxPRvLdrM+d6r56wzJTa8CijPnsP0Lhe2lfpRaGP53o1aNl+vlqRlCnOSuUZTWs5kmOpQnXxzqVqijQG8VKTJ538kyeNbSry2s0677W5Vdgn0bnOy4438y0sroWjasV6zZ+YtCmWFbrIaxIScdlq+beipbm6fecp0c2YIsGhb9D817Pz/AEunxT43L3bY3ud/m0Vpx2avphJxn04rssNyC1zKe5JLc5HrJTry66tLTz9t83b43Nn32B5d+pxGWl6Rw/ppOlyPVcKaebWHK0IMiypFpKPQqtmuy0ZGLaANijAr6FPz/rVtmberuR6vIOq5fshGvyHr/lRt1z8/2IalY0HnaoO3CdRPMSWsFqSVxDtyD0L0EAdUVjzU8svrfLW5Ru5+u5fe5tXlo1sfD1vzX0Dzqu5MoiQZM6laDux0Kr7VZZMt/Bm42nHo5macGS/7P4d7XHo8o63pKnJ2a/mHT+dsLN/Ehcety4PtuPvjAdOXRYcRlqYlJFdOWZYM7SjJ0ZJDcDLcl6fztPosTYFKVnLuBsmtIJj6r5r2vCG2TV6yMOjl2mLIpStAnfU5+g7Kpd0efp8zDq4XTxGiRNPb9U8Z7qV7LQ5/h71zKXqeQydqSD1vKbEuu6OUZdDWqiVtSzhMlemucYkp2VzgLi169VFOlLDOD0/ACPqNCHXx+jvgj2UhXnh2XKUpsg4Fysmvz+9UtwVNHm70u+HM3qPpeJsbXHKvKs29XnYhqyGtDaWTdydwIbHhp27Tzw9Gx3LP0eGra0aNjl7yQg2JGEsCKCBm4WzWEFK3ZTJHi9Q4RpTIbRWrygHa7Pn8qvP0tfmS9nl9nlYCrzV5wnDuVa021ElkHZ5wYWmR822E1eZyx6UDme24btVbB18y5ZTwKNs0CVRsi8IHP1W2C8OksRwxKhNjYlVcawppK9mhS5PRM4i4RpaPOFaeUz9HKnZFSEjL0vDUZM8xM68r6BkmwTJjkzrBVrEXmbpebN0+UGMKjr1ynl5tUIIUUXPnqTZamboc/bJRUeqTNEh1LfWvPX961LoCrilcrybKpJDJSW2fU3JMOZy+6rVhzlmZ/rPnQZWtkSei0zfNe1WeaxhKUgWaTbQLVJfhDapFfnPmXWTot3MjQrJZtcnRyUlKcLqzB4d01DYWtXb1g83eB1CPShssGWmnnamB2naYMwslJzou6GSSIjR0HK88PpGG5nbuMrVMzecDjafcZdJc2cgrc9SM9rp87Du95yZTFNnVVrrWc3Yj35EOttK3H3eqMt+bj0wQcu5KMespKb7HhN9qqp4jy0VhK/D6CUy5u5pMirxdtk6WzpIhRWZhpPnWwDOqY11+HVeTuG5nBy+gcnn268wrxZ247WBakdyod7dHTxmp0l2PRyJOroz67FjI05dclGKVZD5h17B+Zz682pizqW5YyQ35joCaXqcYl873hEkxCaVfAr1JlKb3LDJzdPrQmfAQ9HzK83LX9GJTE1auw0q1fpLfP18MHrsikME0eldMat2FefRy4eo0DuH2N+unTGlZJOpVKC3nC47Jl82WtfmDUJCnOwxPfhcqRmVVUreqzS8z6JM62TJtpMzbSaK2dk2KdkNOod8HKBwCOJYlrTWAxngTMbmzAVtmQLwzcdPPw8Lo5dajUJTm1KQWDPOtB+csYxrzFcZco3I4EEdDekvVbzPqLjVi4EiJsStBYJ4xxI8ENNRc5O77RkzgPFonPApCK07YWmSvjqs7udhZzx16QCFVGYsCDrwryOyVuZMpgMRMBNwPjZlXsKbatLmfpmJa5PpwGFAhMF1c0YPtNQJlecplGdpFWZ0ck6wUgkdBLKrk6dJsBp9NkYbV5oyTNGUAmfnrtdjSFV+ktz3HrtK6nkn6op3IPt122dds6E2q2rFHntZVZbdnCUk9oVe7ENny0ArSnMzYvNiGUSTiyM0c1l0qPK5VI9dS5+bJ0y5YgazKixmeAnrzTDOTc4SzCZWujwCyfbp5sFznjbbXWtSg1Vp57a/ay9+RCPoVzNz1XoaHSc9X1TaTsk9p0kuTOtpM8iGdV9lic9GsCVt/BZBOKTyPKtELYDFqQjMaeDoljAcbMlMCEdWCpEVh3yaAEDQHzM9S/RxojkuhZaNC8Nszour2YDYYqZQS62Zdf3jCemr2NDG1cCwp5xXRzuepUn0WrxIK8Wzk1lfjRJiaE5SsA1ilcGLk1UbIs2qYab132cpEpjfuzYzkEM6ALInJ0jdlKiYgWjMlYnbErZCdNWtzyeeysVBP/8QALhAAAgICAQMEAQQCAwADAAAAAQIAAwQREhATIQUgIjEUIzAyQQYzFSQ0QEJD/9oACAEBAAEFAug6a8IdFjspQeNQ+dr8K0t3MZO9UcR5+I8XDYHtNGxGJGNYIabePatAWttW4zkit0YmXXBAl8TK0LcrwuUZdZzO5UN1c9RNMEZEFt+7rMhSrts7m5uVjlPqXHaPvfXc34lfhktQi37FziBvjjZD1tQHsV+SkVWEdq6Gq+FMkT/sxmyIL7BBlWw5VsfLYwuHLikjgk4Vw1LO1O3EqLF8cicGEO/eNwHQuthO+la8janAwdUGz5Wc4G8CVZbpFvWxMfKsqmPnq5LTfTjOys7SidlYcWsw4iyzEWDCn4E/AM/AaXYz1Tlom1oXM5Tc8T4w8ZpZ2xG+J38XHnoh0bbOQEB6KQJy8mzkJueZTrWmV2J0GbeFm86w+5v2HiIbEEN9U/Kpn5lM/Mqhzqp+fVGz6tMdt7SIUjAiK8YgwW6r6OgamamoID1HQHyL53mndaC0zuiC0g4e7YPrj030tasErFNIcijbjjFOMwJxpmGot01uEezcJhE1HMVtCU/XieIUBnbnAzXsHTc3NwbiiYuStUX1JZ/yST85TP8AkFE7jXKiKo3s5PELj2K6N2kF1hY0lrH/AB7DDi2xsa2dpxChmpqahEPRvEbR6N+xoTjOE4zjNTUA6CKAZVRWwXDqMuxu3MLBn3Ln1E5adOU7YEpqRjbiqYykTFyRkBW2NiNwaHGrM/GrjYdcbDSW43EMpEf4htsQktn9dF4xKVYHGn4zT8Yz8dp2GgpedozjCk4ma9ggnp2PzYmO+gleoz+SrGF03yChrmh/WlyspW4ObCvTbTbznZOdkLvG2Zw2eEsr8MPPsqu4DvrDekbIWDJWLahiEdNKYa6tsKw3Gszsxq+M4zRlCGyytRXF+bJ8msfU0SLXNjFD2slbGuSh0oq4x/LVoWs/HUqaNQKRCDOep3pjWhyaUjUJLahMgcReNqo9wivXHZdlxBboi9jDcwneZiIZqamunpq+VPON4ViYiisW2mw2EUU8ntbIrKX0v884duLohtoVr42mqNUQGj8unpywy7np68gyzHtYPSwJTSiychOUNk5GbaaYzjOMAmvOoi+VEA6ahEPiYf8A5KR4Y/rDSLZY1kFYSX1962lOByhujKbkLXNk/wBbN5GPZyxuphRTAAOhhhEzHHesdmbxB4m4eoJhPQdFixJvUQF5Xg3vK/TKQKqaq4LN5tTcURY57s2tNdPL8ir/AMoO7KX3V/GEwgGBvGPaFpOZTs5tctzp+e0qyUddgwmbm5lhnrbCO8oVh/bqDqJqDp6bhtktRj0URm0CV4ifcyv076tst/gbSuvze9bc8upwqtZsseNrS88DMr6J5GCHo/ATuET8mwQ5Vk/JtjZN0fJtcMZqampr3DoJWrWNjOnbn2sHg/VudxD4Ds0W7uKj92wXcDS5WGf/AFOuSfVomP8A68j/AFL5ggnGFYVhUwqRCdQ2Qkno37YECmelYZxq2TcoflE8zUsNaRrAczLQWVZdotCN3FNn6ORZwGv00h/gD4+rH8wH53n4IPAEqbgwyhKWS1NLNTJq71eTgpVXYiCU47Wjsmtr6x7gpMFZgrgqgpgrE9Mw66qm8giH4Rf9m/PqR3fQf1y5S7W0+lYW8725NW3K5PkjtxdD4Y6L/Gcv1Mgnu0/xHRpV9Y4NrIOKzOQ2U30mqzRmjOM4mcZ4m5yM5zumd553XnImIjMSB2/1FiZCWECenOTE+s08rUOny/hkVnaW/wAFp5UviWlqKH4ICJePFdnystGmfliq3ysXbVrBi2wYlk/CeHBslFFlL91BO9XLLq5k5WPpn23KcvHKbM3Nmeemlg10q5M/p+GuMv309Sq+OJlcWxPh6gPEc8mEs254lY5+GI3cx9QDTMghr5wYrIx0k3zqVR3K1PJSiubqp+Sgi50vzHZCxm5voD03Nzc3N+zzNGKhZvSsEYiFDv5LPBnqJIVv44uQy3LebK5/WpYu24/r0t2Xn95wWsDUysjux15GleZor0B9seUFe468SJYetQWEROE3VDWCBQ/u2ZsypWss9M/66+DOSzXnONlZsuNsyLkqXDt7t1R+EMMWXjpRbxDWMgNpsmSHsrqU9lV5TtiwufEcANyAh+UPER2WchNwNORhcwu0DtsXN14TXQCV1PY/pfpr4x1GbtorbDVCxci52njgzd+zAXVlfTXj+xD5C/TH44+OtQ5Tc47VPC0+EP0gmQfn9wGNG6rNThO3Er/Urq0OnI9cSnvWYlwoFXeaa1PMx7BXfdlKkfxORRDX23xfCJ0MH30K8n8Cb8f1GOqyg4k7moP5WL3LE2V5ajND1SIdkVztwJFHj2+g4oapECS1+2qrsOe2Mzhcd8pe/wCkP5ZA/UHjGqP6Q8sZ/cP0sYxv4f19zKb5/wBCA+FmS/FdaEJE5QmKvI8dRdCVeR4niDXtx6XyLsFa8epDyg/Uuutyc2H0izbYVtcyGE7QKL4N+w/DlVWNKrcXYwfetRmEH8I31F+7VDTGbuH7JEY6jJtR5E1OMKyms8TUTBUYBoCxTKqEsDGpSVI9n+L9rfdImMw/GRzeOtiLYLMCsjIwLgbsS9kep6aFyQwCZDwY2YxX0y8x/TqhO1hpMfGxmrNbKSQ0Mb+DD445RKlbkWsg0sBBlgAu4iECY9WE6nDoYDHAJqSE0Am/G422Ly7zrOQ7WQhasYzz8Z52HEo71NqWC0C/t+n0jhWtqwOs3vqo5Wfyb1Vla+2h1NFdNwP59Ue0ko+NXEzsNpkWo2OLjW/5eNar6Fqnm5nHjcTsKNdbx51CBywsVWlNKY4tyq64cypplW1slvb4lgH57lV/E9G3LMgiLf4oygj5B5Y+LaXr3Nzk07zCDJaU5Ja1b/1PUHXvVvZjtvFzJ2s6ktkeoItPqAY38FW3dJ9ONFuN6q/YzMsAhBpTLn1YrATuxWUzxHKW1AjSgRNbrVxPhdL17bWHw7QxXZGn5TQ5Nhnds6ofKWanNYHgKwcZnutVOHhWWrXh9sX3Cst6jVrCuwnS4oHpz7K5V6gjTKWi8X2W1HErrzUoxhis+rfW1010MuZTkcS8C6hjtak4i+F1Wzje1n4jaRe1LMrzezWxlaOjQ9PH7AimJK0Ltj4FNct9YpSXW5OSVCpGorsluNpqn79cBcQ3Fz6dZVeReca6rdieoDWX6PZ+r0xcNLashOweQYa5AeCR2Laobn47Ec+d9NR/Hs1NdaK+bClJ2q5wSACY9L3m/Mx8NLrLchVO+hHSxfLja+p18ojsJ3XiWsS3LWBlvRd6unG3FftZJjHQttsqWutawyBpW3yeZf8Aq3C0/qMJqH28AZ2knbSdtIqqoE3NxBzfK5O/rHHCS8+WBg9hXcpZWtyKmotHkRDtbF844XL9P7fFcJzZi8uFtG3y+md8LmPwscE9yqJlUpLLxtbztWrYGmpmspG2rhUQ9Da7ROZUc98wJ3kneSC9YL1mAwszql36j/kF/e9Y/nlAiD2W3rU2W/DK9XoD1g8XlMZdzHc0wmen56VpaB28ZClUY6ma/Jix7PGcTD9pTuGgTt6jIJ3qrKmjeZoTQ6K8vR+3rXsE/wAfTllqvby3PN8TYxv4t1y8jtqWJN7T/H3XP9Ly6TVdw1N6nIxbJ/cru7mKByB8S95wE/vcb6x1raxXUAajPWJYeUsMaHpvovk2n4aXfBWnYE7Cx0KH0Gvhh+u3digxLk1rc5cVEzMvhP8A89xjs+jZn4Gf6zTXa2RjtS04zjqf3XMDGYWXJwFjRBsssKNO007TTtkQAtFLpD5BbQs8lvucZxllKmEa6LZTruUQ2nkLmjWclxk7WL/l3/lGjRhjlZrhKzyGVk8YYf4n6X7b69GzO5SyiZmK2O1TcHh+8Ahc702wfkZF/cj/ACafcKQLqJRtba+M1qFl6MCYUMevZ7c4xVMW51Js5BBXHRdTUE9Mxxk5rj5f5d/5Mbi1ydrFay6vRyqwn3OPlx5f+KfbxGKNTd+Tjpp683EOO0YbgQ9r0o8qGbQxMoWZBMRRrQnEQOAGKNP04WE74JItafiMYMNImMiEeZxMEdRyVZ2Z/fT/ABvH7eNvlZ/k6dyqtdrNniOr+Wt/gPE8tAkwcj8aygq8sbkMnG7Rp9PVfS+f6PoCs1HqpZKFdlaq3vVd7hBmRMgmcrDOF5n48GNSIK0HRrp3TO60q8oSBBh1QYlM/Fpn4tMb08ENwVt1T03IS3Ap+/8ALn1NajIye636UTUT7lVj1PiepJZLaa2pZOzhsBXk/wCNs/L1PGW6h6dNgdpGprxyNaGjNeYQk1PkJxYztLCnjsicbIyPO84i5B33bWsrvtjOq1V9i26/HCDDDY1dH8f8sb/vwkn2ueIALQJ7qMu7HUotyZtFteZ6PTYHtuSsepW6y/yJi3hLK3WxDDC+h9wfEi3UFm4GB9vbM4alTqJgjeTcOcvqC2PypxCzcfTPHp/+Rqbc1Tse2xWaelUI1mZgMk+x7NbOEmSK8jJYWNksEPIxjtoZ6Xmdty0sYCG+uKVacJozRgDRTqA76r9cWMxsV3bHwSjV3EZWXcoNpJOhPTv/AAXWd26+rgR56E6mt9Mpf+v6d/6WJQX+mpbVbU1FhE109DrquzrLBXUWnxmdmFYR1/iVyHeokmGDYKZNyQZ1kXPWDOpgsqYVXVtPB6LjLDbRRPz7OX54XHNtXJ89HljbOzMa01+gpXYZXS1cv9JVoyPWydMfHa8+oqBh41nbvPzSs8q/WLO7nMeJU8gZiWnHyVz6sp77Oyl3qYaueepmI26P2a7mBx7AyW2KFtpNPQmV1WuEwbWhwq1UYyQHXpfGamLeCMrFryV/4g7qxcdbCyJPUHL48w8vtzBzEa7K2MwykfAHfRvr00VWo68H86+z+LdpqnWalD9u3oem+u+u5aQEShrlr9PpUiuusbjHoICeR6YnnHGxMlj2sVbLK0WmoZXb11usay4/GB/joxW5dPSbNp6jX+tm6rGHVxXc2ZwXeTTo49nJN/seYJ2xEUJNiEzlD0EAngTIya60xP8AzameeNafXQ1zejH/AIn5KIs0C1alxj3Gi/KXU9SX5A+w61anYu9hM3NzfsPTXse1K5Znyy+yyAeeqfXUgGGsQIBGTlGVlKnYAJnYFeFcOF1DLbiZQLPR7LrFVWtW2uv/AFzcJ9m5ylCNa+5sHpqaEyLlpD5rexPv9xkmNxnqThXygHHp79jKya9wEaXW5kXBI7ciDr9mnFssiVdse31Stt+xfA/dI03ca93OqPsU2fk4lewAzbd/llNytijb+2tGsanHFcAWC1lndrYa9rKGj4qND6ekb04zIx3pgw2MXDSNiV6sx7E9uoB08QgTCp/JyCSxxf8AZkqO4ap6dk8LXUi+1uEYlR0q/l1ooN0TErQBQIem5y/ayau7V3ykFtZj5KrLshrOi1Oy+6zy1NrVdEPzLFnjLMn/ALGHXd5stUz7nAwDiOmNhPbBWK6yrzTGHxDEUsRWqjc5Tf7BA02JS0b01d/8dP8Aj2lNXbSyiuyP6eJZi2JProtNjS2mxGWtiChEanjK+D22VnlWOTLU6FkE7YgpsaJ6fe0X0tjG9Ls3XhpRFOhsiC3cLCEcx29RzwmVlMPYP37VZga8gHLeym6zMvCh+4ys+XenYMybqi9pZGDtsWsZi5zCLehndFc3zHIidyGyFt9dFp2vimll+aiN+W5mySBuBJr/AOD4hdFN7tk2lCswLHot9SyVyjcDPkeldhlZ7kanIaB7mNdqzkZoziJ4niV1hhdbXjpd6pLL7LP3jGzaFIzKTEsVumSbeOS99bYuVkA25drVV/BjzY12HbtWQDRxP8m1rH/HsvOTh67WLetaLUh3L6VtlVzVWTc+4wl1zV3r6k3G+xsu1krrXUPiEzR6Hc4+zfknQvzkpH5F5W3IewXKJazGH5GgkWDJyY4awhu7D2KpdXeq8cnm9totWtu1iILb8kHGcXgykjdqWoaCrGjLKWfkCWZQDKyzlPJgDbvu7CW9vJsvo7IEPxnLpvzw8r7bq+6iUCsdtjEpRGjKrwUUgnwLcPvMfTKDK/TilmRSb8in09RVTj1UmXY3de6rGpGrSlOLi9tK6652TzXDqFoCiNoxq0M/Gri41e+0qwjgUZWPdpnqhRrLVxxVqMwXoATOGpz4zZJUaH7z1dw1qEWbm+jU1MezUBXStTTQmhPBnbml25CizLWpsj1C54b7WmLcQXbuNPqM8CT4ic59zU1+zv8AY37tzc8mKDNCEaD3ASy/jMvNY2EljNamoXAnMz7gbU3BOM1OM4zkJv2b9m/3fJiaJ+oWl+2Wy9aS+aeTMzmagGoz6hYn2agXoIDP6TU2ISYpm4T0H7A9wECiCEjebkKj8lWrKymvPsLgRnJ9whM3NwbiVtKK+E89FXcCRvubm5vrr3amoF3GZeLOpiZtT3ZLAZFuTStObl92qcZ9Qt4M1NQiamj0GunAwIYmOuk1xq8SxwYKyZwCg2ajWn2+J4g9/Lz3fLMxXIbgqcboxSpbrg3XwIWhgrZg1Lyum0uMOLiLDgJo4dYX/jlI/Cbg+OEhT5cC0ro3Gq8MPk3LgzaCtyHHx2vLLxKoxjeCEJgVRPjAR7PMtyqq4fUq2I9RZr0bV13qEtsayVWvXLGLt0LTRmhE4yrjqyyqsPn1xsy5p+ZbrHyLrBZVax7Ngii0HvsZWhaNjuVFdghDheDGNSxbQ9niFjO3uMm4tcCQDXTkTL81aEzMp7zAJx6DxC0DGGeTAsBVSSJxJKVcQGIjDnPxgCK4lRJjWalmV4NrtKqucr+ErIaNrdn1PPuPj23WJUv562ju8LD5hgE10I3DoTc8zkom9qw3Fq1FRR0M1B9onEBBpR4dZxIlhIjgCC07W0EIwENs5+dmH9qyzjL7XucVuRRgHi3gufIcTuQ2EzRM+InImBGaCqBQOi7YldTQ4RELSkAwLxjPxhLaJG7y3QqdV1MStJ39TyYTucjBqchOYnMR7Ir+ejOoltpj2qswlqszLfUKqhk5tt0LiE7g2ZpRAxnAmCsTXUUvrVSzuM0ECEjXGV0Fj/Ut+ViKdTXjgIYPYXURspADlmUDY4iaEaJ9x3O7js2XWE9GPUgKpJMVRrqg5MmOmnbtR9z+lsZQvlEXlO2qxRoHxNnprS78gfP7BET6bwDc+2YmN96+O5//xAAqEQACAgEEAQQCAgMBAQAAAAAAAQIRAxASITEEEyBBURQiMnEFI2FCgf/aAAgBAwEBPwHRGNKXYp7eBy+jdK6PVaPWkerI9ST+COVx+CWbceqx5LQpIU6HlbJTctETmqGLvklV8aIb+ixZGiav4HFos3M3SN7PUZ6jN43fwUUcoQ3ejju5HBm16xlQswvMcSfkbi1ootnpo9Oux46505HopHA9ceKU+j8XJ9H4uT6JePL6HiY4SGnpZjgu9ESI2uzJj2m6jeWtL9mPI8btH5syfkyStNH532h+VH6JeQn0hZIfKJ7H0hYU3wVol9i7L+CcbjRS0sQ9LFIciy0WXpZZi7PnRdivsjCtJrbJll6v3WWISNpjf7C5NjNnIo6+R/LW/fRRRCqHwNi7FCva5UTlbLEiiXAuCzdE3ocyxGONDRVdnekJWiUVNFHNl0ZJj7OBySPVPULZZS1ojCuz+zaT5FpjnTGqJcO2z1Uyc+Ruzi+SSWiaQmk7PVi+0f69UrI49vLHKxys6Wi1/I/WjvvTsfI1yPSjabTbrBfOiiL9RSv2rRss+CZvo3NlMUZfWlksbT4NrMZhx7mxwa0fAnrwTdcI2OrJC5NpNUjd/wAFI9QlOzcWPNElkvoU2jD5Cj2flwH5UPoyzhJfqRkou2Usn8DZ8Em4cMw4tz5FNRjJ6R6LLHL/AIcfQ1/wp62iyMHJWekz06K2l6QlsdofnQarJEi/HnLizzZenUdcWJyRPE4lnq/8JZNxa+Rta7xNM3pG9CZJ+zHFZP1ZJOLompeT4q+yUJQ4kIgqjRLiPJLjobkfsymbTYz0nozYxxaIqkS9keDPub3m89WUlTZDHtqf2Q5PIy29qPUZJtiels5+DdLWxN6PRclaRfwZcNcxI9mBbqizJ/rx/r7Y4ckukfiTIeDa5kfhYvs9NnpjhRFaWQhu7NpJcabqFks4yKmuTDan/RkxZfI5xv8A+EPDlX78C8OPyxeLj+iOKK6KN0EScX0LHH5ZuYmx2N0S6IY1re6ewcNvBONPTDJmPE1b+zLN+Mrj2Q/yM+snKMclNXESXyWenElCtaEjhdjlEjhyZuIIfj5MKqWkYOTpHmR9Lyov+jIrJ0bTxkrpk8scfZkyvK+dPGyNXE7FNoWeSFnI5IyKFi3y2oj4Df8AKRj8DGiHjY4/B48HDd/Z5fNIljXZ4rSguKP8rLdkTIeZNJJj/blClRLmQ+Y6xe12J2r9lilI7FESHwSyxR5PlVkMnmXFpIxfwRkxRyKpGT/Hv/wzH4koR5JRce9Iv49nju+CitY4nJWbdHKlZKcp96ZZepNsr25FFx/Y/o6dktEjxocN64sEsvQvDo6+C9W77M0Lg1FcjTjwyGOU+hL2eVJv9UY1+kjFCM8aTMvjuPRQsbfRjWyNEVu6MWOEVpJnLK0vVxT7NsfoXHQ6ZKkPyIx7MmXdK0bnt2kJvC6aFOElybcb5TPQQvHshj2raOP2cLol5EY8Nk8spO0y/a5Jdimn0yUqVj82KdMl50E+DJ5W/g+TcY8PqK5SIeBf/oj4CS4Zjj9nJlyKCsnnT/iTnPpslOMez8n6WrLf0KM32yeBy7ZLw5fDPxs0X2R8eU5n4akuSfj7EYcLnLgl4PNoj4MqMfjzh0xrMumRr5HkoyZOdvwZHFc9Inlcujb9lxXx7aK0cbNpQ4J9npRHwbz9u2Tz0+C5MeWo1IeeK/iSnu5kbtdhtKK9+5IlkPU5oeb6N7lw2ScV/In5PxAbb59iVmwckipM2laXrZbZ6XxZNel/Jkszlwb4x7JeQ3xE5fZtNptZtFEWnAptHqs3jkOQ8lEs/wBDyyZ6/wAJHq82SyqyWVvRIdleyvdZ2b9HNJ8jzQRLyL6Q5NlNm3WijYbaNpWjNpGKMiojCyXlKHEUSy1yT8mTL0oRWlCRGG4WNJaSipDRY5m4/8QAKREAAgIBBAEEAgIDAQAAAAAAAAECEQMQEiExEwQgQVEUIjJhIzBCcf/aAAgBAgEBPwEY+TNKUP4k8LyVIjiXyLHhcd1n4UJH4cD8TGL0uJc7jL6SGTqRj9Isao/Gjdi9PFO0ZMbaJYty4IelUXuZjwxx9aSjxwQxtyES64I3XOjIx+zaSwRm6MO+HKZDLGZtTPDD6HjxHgxngxHgxEscY/xYnRvNxwxkUo9FkLVr2uKfZ44/Q8KYsSRaN6MmeK6H6iS5H6hy5iR9Tue2hpvk4QhM4026ymo9nmgeWH2KUWKi0Wtc2XnatJcf2Y3Uick/49mH1G9X8m7d8G1fWlG0esoqXZ+NEjhj1R+P9HhYsbXybX9iszZvHC2brF9Dd8RK44NvFmHI4zNrOV7GhxKKK9/rV/j4PhUSV/qS4VDklwTytuh/tyYcm6CftZfvSH0Weoj/AI2SjtR5USy8Wb/sjxLkhxOj03Ea0ooui/buLFbJWRdiRLlDlu7PDbRKO1UymLkhjuRjjS0381q6fBtoqRtZt1YnRd9HWmXE4SIScGTjuI4o7KZLFdUYcXOl6bTaUv8ARZDhj0yQtHZH9uEeFxIYrirEqJX8CvSmym1QsUl0z9/Zd9CiKNM+SPY9fB+1n/gjoXA3S1sssv2udEnuJI+dGIlrR86bTai0WiiiORNcm6P2NmfLtSFJPRW+BpLkss5MceHKQpq603UbmXZt/s2o2IUUtVhkRx12bUZce9H40hemn9mPHKD5Y05Kj9o/yLIR38oz5lFUhrdKOlFFGz+zn7NyNy1plDmo8HlRvvoSsrSS3di9PL/ljWVRMOPdb1yZlDghlUtHjv5Iwr50512P7Ka+TazayK4I+yT28idoVYsv9Fp9FUZHcrIW5cFo/U4LQzceRDRF8G9CknpHVvTG1/EoyxS5ROdxolwYcdKzYiKSOB0UcG1CTQ+RQSNq0Wk2XozHkvhmTlGR0rMa8k+dKKKHKK7Z5oks/wBI88vo3o8gpCdj0nOjcR70oonJxJ04mCcMS2yJ5UnwPO/geaQ8jZZycm42opaKu9JTd61tjuFLdyQemVE8sXx9GH/M+R+nX/JOOx0znTcJ+y0XfRTJzjH+TPJGfWjdcswPyenaMboSNxnbq0QxSydGPEsapaZYp86OKY8aHjHBoscq7H6hfBL1L+CWab+TLLdRi4TFk+DMrl2ehjUGiXpot2jrhjjYuERf7FFDQ/bS0vRGxsxYN0CHpad2T/kyE3Doh6pf9GTMpPgTsZXFid65vvS9ZTSL0UbYoqPWmNbYpe6DafBYuVRjfxo5GV6zmonnvStVwYp1NbujHiwSVxPU/jwXPBfsx8csY5OLIZE2NjdEnbHwTm30MXvUmuhyl9jt9m5oUrNkn0RVLkaHHcNOJvZ5TykpbnZeixNigkV7avoaZVn47atEfTt9kcGwXHZdksm3hIln/o8/2PSENzoji+xKPwJWeMv2XH6FNIjnQ8mN9jyqMTz0+COayc6XIs3FHm54JZFLs/XRRIQ4sjfQoV2X9FP/AEJ1r/4W9FEoji+zg288Hjb7Eq60ssssv/QoigbBQKroVvoji+/a6RKfJTOPfRVG4j+/RsRyxQXyWjzRPPFnngeQnkN160bTaUUKAsSFFIcDYKJWk1YscPke36Lp8ISbMj29HmfTMUk1ZS+Pdt02s2MUCi0bmPSXQyEiyUdx4I9s8PzElGnTQxsRZ4b7FEWNLRlsbosvWWWieRs5ITkiEnIRRtP/xAA+EAABAwEFBgMFBwMEAgMAAAABAAIRIQMQEjFBICIyUWFxE4GRBDBCUqEjM0BicrHBFIKSU9Hh8AXxY7LC/9oACAEBAAY/AtuVEqc1KxBZrNVN9NiQFUG8yFCpsG7NZrp7mu2JWaoozCot1xAU+KoNsqWi+8X3i4pWQXCslwrhCyC3wqC7NUKzugH3VFVUvhdNre2IRrvKhWF1DdqtVqsr6XbqzXEuJcS5j3Oaz93VSFXYOJUlAqUARULTbzWd+q1WRRPu8N8jMe7yF2ardRAl2zksLqn5RmqWFOrlFtZlo56Iiys/EP5cvVVsbLtiXCARmCuEL7Jt9PeOGn4CpWSyVBdUKksbz1W60BQ31Qxbx5Lww3DFICo1rjyESp8FjeqwQ3Fp1XCJ5LgC4CsvcVVPwnFCrbtaqe0sVLVruyFpa5aN/wB10UN/9KGNoptMKofqiS0eilma1p9F4dpu+0NyPNcrqxfqsyt2qrfXZq5UcqFZrO/JZe68R2WihU8lWrlDalTmomey/wChUKz3/wB1u0e3/sKXSJErdJuoSuIriKzKzur7iIuzVLs1ndoohEQVxR3VHBVi9rMpQAoGhT8KxnyULfo3ksIozVGH4APQKrYb8IGiDmGeYRLuDX8qOvdBg54h/IUtNDsZLJYHNXCFwhUoqqnuKsVKX5m7MrPae/lQI8v3QZqVhZmi52ahtEPmOSaK4AclY13n1PdQeL/7LxLOk0KpkmvHwlFk57w/m/JZG5xi7czVVUKEdvPZz26ofmcUAp9Lo9AE1pO+9PtiYs27rU3k1uLzTLTWydJUA1bWUC7lC/KVXIqxtDxWZg/ts5BU2XeHko9/VbjXO7CVUNsx+YqXvdan0C3GBvYIs5A/vKlVzKhuWQ/krGR+lC0tDvlpMcl7O3mZVp6K0aefqomYQCg5LC7PJW1m45xC4lqtweq4QhJAPJZ7EMMKXkBvdRZZD3xJ3bIZn+FuWYnmam7ILdzUoFueN/7oH4dEGA7z/oi526wD6JmIRJy6K07EKyn4QVi6ynxkpTXcrp5pjtkYXEqhXEVmuJcZUOdI98GMEudQJtkAGxQRlsgaORLt6Hmg6/8ASrT2r2h0NbutAyA6Lx30xZdAvEteBnC3qg6JhqD51reJyKg5ihQB5wgDm3du/u2slW7L8Aba1H2zqAfKF1UO4gnC4eI4N7qwwmRCtbPFg3w6eSZZWW57OMv90SaWbBIbzQA4nKVCrmn9EFITe6d3CAQ7m6V921TAvLaeaxWjz5BbjsXkiWxRb4ELd2slW7JclmmWzq2jhInRZFUXifLn2RuHQKx6EJ+uYTeyrrU+qYbMitIKfhcMYEQU2umSkZps/FRdlJU6L0TPlaKodNjNcRQF0CEWm6t2SqbuELJZLILNcRWZQawHEaBNZoBC3HeTlhfuWg5otOohOY7Ozoh3j63NPVWvdYdQE3omVggCCqgHqM1vcbHUOqPIqsmIyRy6q0qThrCDjqAusf8ApMb81SndXLJaLMLMKQ5vqquHquNvqhNqB5qjRaFHDQcr8gsgshfndkVkgxjSXHIBYrQg2xz6LoqptqMwcJQZaHd0PJe0t6Aq07ypuM65ps/FRRrCYdYg97j1XQ5o2b8wM1josQ5+qY2zE4nboWGZ+ZwRe8bx05BHGDHRUFr/AJLhtP8ANcL/APJQ3E3zWf4ANbJcdAsTwDbOzPLpf1QboaoouNT4eFe0OyOEZbFn0cnNIzapPA/PoedwTMKB6Issvu/idzQa3X6ItaYFTVF5bHIILuZ2ziVFvLRbiy9w1jZlxhYDZBv5wP3uzjqs5800h1Cm49BCIJryToEDCrUc27B7Jr/l/a7BaGnwu/hVr3U4CeUu3UcTpHyigTnafujMpsUcNUV3omDoVmsyviWR9Vw/VZBZN9Fp6XZrNRthrGlzjoF4tvGOIDRoslWrR9LqHBaN4XBYbYzg1CnRF5Ct6UpC/tuF8LCcxRQ0Ynclvbz/ANu17bPkFJWI6o3N7H3YR2t4wwVMZrB7L7KJPWSVNtZsb/dKz9FSvdOs3ghhOXylPsjDnZYrntHxmAP3RaMk4obQqR2UBTe52pyTWzutzuF0TEDNZ3ZDYzC09b9Ns2pq4mg5BUzOqnVSc1LrVoH5ljsnMdaN4g05hTmhWs1VUF3KbeNoKEyzmBmUAKDQXSpTmt4nXZrQrILIKLtVqtdttlZDechZMEdeaJ8k5x4WKPY3CxsP9U5u7dFiNsy0d+cFfdebCpO7a8jSVhOcRKauiZVQpRvzCkXC8WpzmfJF0UbfAzRHPVddmYzWVwUOJHYSpbbT5I79oY1wbNt/r/8A5uaeQQsXfdF02n5vy7EPaHDqFDHOs+1VLMDgNBRfdZcnBF9qAxjR8RW4J7mFu2JPRAeHHUwvtLUD9JK3vaoPko/qS48mwVLQbSTxEwUcEuZORzX8Gl0auuAaD1VBChnrdknjnvXiXuxcnGFuU6gytboPiHssNWdSFuWrnBblq8dk507xcoYKrRaeq0TbWykObksQEdOS9p5htEwDkuJZql/6UBoKqxsnOc0TMj/vVB4Fnb2fNui3LU2LvlK/1Roo9p9ncTyLnBDH7Dh5SEB4Qb8u6F4dlhwnLCmtt5wkxMIgOa8/KVoJrCJFQKXO+XNV4eSk5/tex39txwmRzTvENeQKOCa81vFZn/FDCZX3wxdkd6nOFuzKM6iL6KBC/wCFrGtES0yFXS7VZlcSzTm05lV5Jr3sa9hkVWKwdLSatchI8O0K+ztPFaND/sq2Xo1BlsDZ2mqOJjDPTNG0ZGH9k52Jj54gVYeA5/hzOAmU2RNUJud5KXSei4VkVkSnMa6pylTkeV1KHmFNm8tPTVQWkEZ8kQMhsBzTDhrdwhaDyXEb8lu0VN09Cq2jz/cVr6lVaoa0Y3UCBtxgHLUoGysSzqBVRae0Bp8kWvtGPH6CsIt3NtPhBBRBxMcfQrecXt65rP1U2lHDIpgJmzaKL7Ubkc809mdc+aZiy0Tz8tI5XtZhJIW9ToFRZn1UzLecZLk5eIwYpGUa81Wzdi6MhA4t7kVvEetFuCepWQu09ffANXjWsUztH6dlh/8AH2Hin5zRqn2m3MfJZ7oUMaAFlB6LdMr+mt/vhWzcdVQ+S15rViLfaoj91af07tyaSg97nEurmrRwkFrgB6J+Iy5/O8vmLRxPot5zD2K3TNxByKB+BEnVYfEdh5Tsaeq09fc1yXCuELhCyHoosxTV2gTvAb49oMz8KH9U/H0+EeSoKbEqMnCoKZ7UymOj+jlxH1XEoJ+i4imsc6bImoOixaP/AHCs3HLFW6Uz2SzMWpH2rhp0W6F15pzHcbbvMX519zVo9Fwj0XCFwtW7TYaOZhOsgYsGmAxuvdeyezfE93iWn8JrBqg1jo57NBVP9lfw2o+qcx2myPF0oT2TcfxtkJhdU5KyceEPEq3tHZzey0Ganog05Nz7riPk1fdvd3W4yB1K4Qt9o9FFnhPTIo6RobszfxFcUBRmt5yzWq1Wq9naPmTujiVaxlZ7g8lOjQjGy0OkSvEbpDk21GRArzGhRDrjc8eI5rHNOXNUM0b+yFjajDBO8nYsoqhjq81JvDeSs2DiI9NrW6PaeMDi1O1FAqOptF/yhW9qcgJTnnNxlTq8prdNdghvH+ykmV5Qn+yWnHZZfpKcy0bvBUvrcVYUxFwBKE53QM1VjZ5uKLnGpuzlfauLW9BmoDQPqqiVu2XqVkPIe4AVTKrC1Waqser3yrZ3z2Jb5qEGsBkClwuwWfF+yJOZN7LU8HC/sm2rYcx7dFzbodkhWVjk4Vd56X4z5X5hZjYm6dmmag3CWLVHCaX+zs5AKz7o82uBRHRbyCLbPPnc3Y/pLQ8PB25IteMQyPVc7M5OWKJvssWWJW1odXFZQg312QbqKqosrs1nd907vCzRlVUtOxZWcHDxO7BDumprX8JTt+SdFU05ohsz22w5phwqCm2vxZORs3iRyUtrZnXldReLORhYkZVow61aed05rJVUSqrT0uIYHOjOFutaO5W9bu8gvvLQ+als+Zvq2Vu5KphcQ2HW5G9aZdkFYs5k/spN2HTYnZMiWOo4LHYvxN+qLXNGE6FUrZnI/wAJ1vnbR4jekK0Z8xBVuB8LlI1oUC01BkJr25Fccea0d5L7p/kqWXq5Z2Y+q3rVx7UVWg96qGgR0uyVIWa3lVfF6rg+q4PquD6rE0R3RDrGo6qlmmlgw4RhLeV3szBriuGIRIkdvcntdis3Frlh9ohrueieCN0hFujWQqiQ10wrQj43o0zzRBkEJw9oGJhy6KbJrI6Kguz2akrJZwuZVCFWqran6Kto70Rh7oXFPcITy0T/AOptPDnJF1i7xLH59Ez2iZs7TNo5KV7O3/4/5uEmYoNqdshjtz5TksFpMEBPsngudMTGaDWy2BVyw8R5J2EDKq3mIWlke7eaD2Gh97N0QmiKLC0wgHneOiNj8DjJag0vOFvC3kvZ/wBAVo5tTZwPop2sqJ4thipRY/Z95vya+W1A1Qd7a9ptRTdyUMcIRAwtnkFyCJOc3UzWF53XXSSuJcXoqbFSdiklaBCJ9EHEtlbzTunLmpst18y6l/s/6ArR/wAziVjsxIOY2K3ezO/LC7go9k02f2drGeh7rBbNwu+h2BZ27Q4FpieaDHcWHRbwVKossnb2saIddhpxaKpm6lFR581vNaVvWZ9V8Q8lOILdIuot5xP0W60F3RS0Nb9UMcm0eJpoph581vWQVLserWOC4Y/Ug9zsWGsAKfZ7UsHI1CLLTiC663UozVyp8JCa45I9k13MLBpZiPNbt9nat+EygfEwO+U0WJ5aB1onCyYQ40xXCdNgD5ae6q71UlycAZdybmmycws1mpZZuK3nNZ9VxPJ7quI9yvCbT7WP5vLTRrThaVv0cMnDMKtsI6Nqt3fw5l1aqpTojDdhtJw6I2VWtdVs8+St8XFiNz3Tw/XYLXtm2Grq+ic3kVMXTA7St5hCovyuofefZ2lo46qZ1hbxc/utxrR2GzHw8XnleHcyT9VQkJ0uOScGPDGSVvWklHwpw9dibSpIz53FvNUXXku6tbHUfaN/lNc346eaZYtyFT1XiHid9L5iDzCPIquY95SAs9uqcAd6EwDSl0auXnfu+irtBF8VyTLYZtMwtyoG83t/6TH6Ops1yQeOA+7y295yizb6qrvT3NVqua5FSR6XQM3GFZHV4p1qoORqmeGZFnu+WibZ0DRvSidNirhKITeyz9xAGzkqhbrVW8+9luaYSYnM8lZtGVlZCndMcOybiP2dpuO/3RxUc0oRkq3R7vKGqGAjaa4SRy/BhvJW736/srPFq4qUy0+Lgf8AqCjlRCqwg11PJQ3IXN2oaFvVK4QtFvU2qhZKlFuuQxCiq9o7CVvOcfot2WnmuHEObfdYJwtqSeQCcdSvJQRQBbhXg20NZaUnkdCntNDyVMyp1vJ2M4CqJ7rdos/ewKOzCi2aWlcQXNRpdia2RthvmU7wzxMLT2NwhQcx9bocsQnxrKMXXkV9oMfdHCyFSqrTYl+61YbNi4Sstjrdl7mq4I7Lde4Kj/ouP6LCFvCvNbjisp7Kt26wp5cIoApAMASmujdJhCKnXohiMfm5Ko3+mTuoQbzVo0sdVpEhbwVGqlm70WTW9yq2rfILde2Oqk71pz5XawqrdVM1WpQUNifwe44NPUSvu7E+awjxXPz6Lelv9sIeLiI+qbI3TDMINAOSc8Wbd2Wm2LYaB0TywYGSn+GSLNy4j6regnmogvhD7Ml3Vb9m5g56IFpp01VdqgldVJTsJk9FUBSc/wAJUiVVwnlKxiscDVyd1Rtt3dFGzmtzEKUxJ5aJosNe10IuE4pmVibj9E0OcXx8DjQoAsew8oVLs7qKSpeYCixb5lbzj7+MU9guP1W65p7G4CwFTryWE2trj7hVtMfQrCBgJzcCsTA3ENYlF7ziJrKGOH91jaWGfhaMlGB7nkU0A/3USqqbc5aRQoNOCOrVuCzI/KsNmIF1RXmm2dqQZyOuy8DnVAYfRChxIhxxP6abddiFJyU4Xu5UzUj2V0fqXhus8PPehY3WTWdn09FumvNc+yBNqbM/NUpxbaFzBqQmm0tATaGJiAE1ln4dmxmuU9SUBjFtan4G1TSGOE9Vv2VvH5Qnbrh+qzAT7UGBijuoe8spxzkpFq21afinNS9rjZ9Oaq4CfTzU2do2PyOU+0FreTmUcvDc4Ww0c3Nfd2v+KECec0VIKyVAsiiLTlRDC7DSsob0zs0W9QbWHE5v6TCAs3Pb5yq2rvIBY6l/zOMm7faD3CkWTB/atwCVL7VzR8tnuqjrQecqW22EdGVRZ7PitMGbnOQbanEUfDaATrdLrW0A+UFPAJc/vKhx3G5Sck0iza7qVuMa3sE4ttntDtBC8S0LrR35lQAdlwj0VWNPkqNjsSpwT3qt1gHaikmijEZVXtpzQwEGUG2RLrTV2iqqZ3UW8YW6IVfwG+92H5RRQwQOWzJs2E9lAs2x2Ti3XZqVCqodhHcohpDW9FvPPZOl3VYsr6KtFqqQFX8XRVuo2Vu1K+0wr7J27zhSTsUuqqXV/Hdk3DaBo1VXye6PhNgKXGTsUVdjPZzVSpzWSqqfhMocoPiEH5UHvs7d3dyFMLBk3Z5+7pVVopEzdX8FVQXgLdtGk901jKk6omeXkjhcOgTA2nPYouK+duoUl1FuCFBEnonYTkuV3D76QgFGRW6nFxU5hE7rVuti+qgKuakLJAAKTCrXqqiTdQjooBYpIpqoav5RxjXJEw2VBgKNI02M9jkq7OS5LetW+SpiA6hSThs4yQtfaLVjiBEBEWa3lulS4zfS+uXVVhTMKgr1CphHQBTFeql49Aps7SOkIAWhEIzak1lEEz5KRkVz8l8XdVBJ7QhTLqnHEIOm1uhS66qrfuYTzqoO/a8lElreV9NneVFUqCO91Ed51ZCp+yh/7qlUOXULhIbdnlyUxPncN9Z05Kk+d3X3uJ7oTm4PrmsVi0WVIoVXPboFvGFSqzryWGKLP0WWwFL5CyInmsl/CklS0QcpUyM8kIp2Vfojzu5C7r7qixWh/wCECGOM5URd7QIGglEcr8lQLeK5qBdUrK6G1VSETW6aBvMr7If3kL+Tmoot3uonrClnDzCqhhAVQI6oYnZVyVNgys9upVMlvOCc6kASJ5qBvu5NUOOFnyhUuoua3Qq7MmGjqtXn0C0AGnO6QhAxOKm1M9FS7LJSfVZ0UrIem1UhUquGFXbqiMW1O1CrK+zACMkm6h/4Rcc4TZnOFRQvO8OzrcBooR2MzdN3/8QAJxABAAIBAwMDBQEBAAAAAAAAAQARITFBURBhcYGRoSCxwdHw4fH/2gAIAQEAAT8hv6A8ujvQbwInEVI2BhK+EEKYhx8ooVWXD5JiqWAZq4946mPeFQ/ea2ZliEMMVLozMdYMFBSPgfWbyZ0ioLVyQvjO4MrVbmcHCYhrEVloM3jecrEo0sVgmZFSoEIL06K1og0pGF3M4ewwBaJk4NYFuzAMFwMi+k7T2mwHtNCECDLes3ErTQomhcMJQ+JeLCZTDDlY1apviOeqPezEDE9YtxBvuI9Xqhq6Iz1NjMHoZPuoa9BCYq4p0LJSWRzg1GKkEKtOGYfz4Zdil3h5MWxtCp54Zyh+gCmydvwn8yPAma9iXuMMVqxE7iIdpUpA2PSNFgjhZsmJcolSqi3GsYypStegFk5lHjIlMFdArSYoQsDqhQasBrXExbUz/sQXaWMxEHWALYHa0Q00a/CPI+0r3faA/wATteyOYexKo3foxKILG26PUZZuGZcojbkIsLlglMVGB0L6KXKBF2P0lm854v7idmbAxYrB0gHCYOGFm08GK8pRF1aL/wAS8sj1XsXPfRUedz2lE54djzomwPdn9oyvSyyf3MHr7MB4uWJ2iQehFldWGdSWTFubZMJN40TsicJXDoDxYhLX1ud0svqClnRBQzm/xlzsd4aSp/rIXt3s1HbjzKETG/nTVaEqmVoocoRRNu0vE7yF7ygk7ItmLHXb7f1FaUnVazdJ4YZYOtZC6kZYegESIhZhKJ2M8fVQztRO0vLmsIIB1M9WasPIlm890F4127cOYTqdbb9/0gbtETlbwqPKJrL1NjGrL2qOxa5UN8aJfDXA3jjotthX4hxAHCf97kG/VonDHeSVtSNb+8a6qbGk2MswmVKFMZATIQs0QK6BgRdXaoPbIse0nZSrRJ4eiIGXEXSQ9mARRtLgw6BbKQ8Gjy7vg+8qo/xMj49zDNmzKsax8jxLRHlrKW5Xsupd4tN7w9YfNAa03M1g8vyl4zuB/mGX7qtX9/EdXvGC8sKvuJ/3Z/0elUcuaxbgboCaEzW5Wrg29j6DMebB9WB5eIEvKI16AXoGFR1gpphc04HDKmpdkbGZF/YlJVo35gMydXx39rhQtHOJnLRr3h4gwYCy9tWFhQtv5lq0dmL7TEUmxULIwaiwfuWSRs6RurT0m7nxFYtC4dx3hH3at5r5JTXQsjrD0/sY74ZY0Eq5zvP8/AaexKmiNeWQhpMnb6CXEXnSHE+WN20Bvc0QZ+0INv7wrNTvDblQ0UZl9pZeq1po/d+JUTpr1cTHtXMMU2Ne0ek3K7TNK2hwc+Y/4MJ4IhJQVb7u7L9TdR3TGpHjt2eYhVw+UZU7hj9Rp9IL4i6EP9vZ9YvJGLhqN2XtCnPtRs2jUurR6NrPKa4PeOC71idEygCBeSdyInES/eDb9Aeb0HvAb5ZxGqmA6FRPQpqB5mAGHM7Xn7TGNCK1Zpr0TI7a3zEKaX5H9+4+EtXpv8Rdohb1rXreZS6y0d3/ACLqjfBeYZmUKtafzp8RzxA+YaO5jswCmgpl2cB+2v8AfpGMQ4gOCak3pMSKIvQIELmFt5mVgozEaIFiIpPHRJLagalMvMZWogWgO7E6Z78IeUXPsTstQfiM/MrzvoXLScCPOT7kBHEA/wAUQWa7vH/Al4yjA3f9YFmRRodggvk694ITg+DNYCWR2JkgaWwvk/5MnIzlBidsG/4goB1G6oS41ek2tvSPZMb8bsTBpAyommM5M15zVyyhQlpGvPS2XLgdAlQIZSGmEVJXQ6rw/sQcdufvjNMyRdi7iUS7A2l07NZi/WecSvYgqf5IGm2q+G77S3AIV8D1ivVKjgP+PxO0K3x+omPHuriaji8Tmi/H9UyrhhjbDm+8SzEwq2S4nO5ykGZdCQuuaxVQVkPDUN5+s2LjMRuHtmEsbd/oRASoEroIdCklUErnTTgol46G8STPGDDt2GK6DS7ad0BqW4gnD2IzkaZ7uPVityCb8pXFlZfL/MVwHU7OJqp2xNvmFbAjtwAEyDJ3xE7gK9Jme0ujjR7QQ4ipUROJt17TSSeSVbZiwCaxAWcJUqB1rqQiOgxW2ZWgG1/FsLt5RQ977nMAkjkm5NUsYFrC4bWR5v8AUaIoCuxy+1yxgODxm13/AHPCNUjQ/UQpLs1sXlhUsqgHrAt2RHHOsSmdky89/tL1b5S5Yiu4ZIMg4pBr0v7FfieZQ7Tk6VMQezA6yIEu1TtHtATfW7i6mHFdQXMDvSYAeGWGZ2jEDb9TSlNwCDzD2TG1oj+shEZS2XY/cOFrgbveO+F0v7kx3CrhZvLKFtTM2YofP+zMZ+fHsUXqGmd6oLio8oF/2BRHASOfR0zDGYDPVm/iIPSY/EDQjf5/rmggy3KPeaqabns8xAux7rY7JXuFTPts+XPTcTUTdsJ3lcrAvWJqFGsuNNdjJKI1NyG395kyfeaMsF4eWYaPpCvLAjiB2HjEK7XyyvQpi0HgjG3aesTjwgas3LFbwRV167w/qPjcSv2mQxWwhbc3t2/MOo7vZSZXtOxAfmajsn8wu2T7QZjy8QzWUcDGbu91WhNF9kobaqtTnNP4mxZDDvr7TMYKbrtlDE6DWqneGPMRRqcvk/naZrts3b/n3jCKyiTgfecX3Qcz7s/3M7H1HVNgfMP+QlxHDdUzGZF1/wCy8DitdS7rGFuhF/8AKdo6K5EO4+kG2QHbAunrULG4EpbHg/e8vRhWkrNbJZh7D9ouamIA8r83/ZwbSr1L/cvY13MiXYs8SvpOT3/1g6uGXvAp6wHAwnR6JMDnmPB/3MyZQaDtePvGQuA3s94qcbff1+jtLrGZoYrfimWNFAdI52+AmCzCewJad0Z7wscbZZAxuV5nOcpFstC2UFS5qmiWlpaDBh2IEnNDwwgFrHRC8DhGJxKTEVS8d+8vvujmp8Kb7GXvTj8RKViPdFmnrmgZ/CNGLwqxJthV9t+D6dAGxo3YBYLvzBRaK+EDWbUHxO3ePVBy7Hd8VAvcyRQ03Q0oNYbgCxqkc2PDVMfaMYp9m4YxQO+MF6pfmONHvDrcvpHMy9BUVKVeTYvqcs1MZNmOmJ+yDUFhqaongsoiT1ZEuVbRrLTQfnKf4F9NJNZ2iRpvRlVO7PlrGqRBNyIbjTb8u/3iFQDfH5iA2mLBT7/EGMdo/wDT1iGlXo/m2s4wca4o/wBmYLtnZw9pqUrCGuD8y51H6Jda+MoLU9I00+E2UjAr0qJf4Shr8T/kSqBwjRWuto116WaTSDEdrMD6slt9VeZldYTTruAz/mESI3omjMicjCQdntcBrXOP78xMFGt2ZxCxZoHYlsKVEaU5X2mvRXpiq6dcQCIscMKPIvqNmNYlGvT17S0K7Kung2mTCzNBUUQcZWPH/bh250+JkzKE5lR/xiVtI3pDm4MxhBdVL8RUIqiKE3+gtdYS+HLynY7wcTuW8tr/ACB0P6ntX5iRmq8Jv3NhKBTVudhuOpoppr2mHHiYRUHGvV7fMLvQeIO7MVDOJWanDiL49HSWzQU8iUNIEaOAoXLrMUviho8Sl2mzwbEND1jy7QmxPQMqkAvebCF+Jh/BO2PRh+yYC4Wce5MOPeZf2gbz6SUMeDjFvrcC3ay1YVjKwEoLR69o/pJSI40oVf2n7ib2yi4cFPAmAdVlvrMjyJB/N/aSxe02MxGHWNTLHtPkjjufuJgN5ZalmNewRsGyVZ8swlrRMbUDGNbnMAAaEfCAHCRjsKo8RqUbahT/ABFSp6og2geD7xcPoJfoajtyvad+Q5J2FdIRTsZllwze327t4hKe7vm5ksU0vfEzqq8j/LMKYL1NYGzrZCEe4hQlALmXN0soe+XWcXDZm86ECfmi5B26Ggm2dIdTtmKYQNvZ/sG+d3dgPemGjSUQbenbvC3/AHNb5iQXyOHeMenVBZlxVZzIE17wojvZS+8tuG5XECAipGHvBrSj6FSXKqH7PXX0lh5GZnwi/mPJqHk/Zz7QAAAA2OqV91LonFOyp7M4XUitdKf3LrryyJlSqQ+xcvopgyDv85jYJrKYPvG8Dm1C/aIUexdPzFKkv4NIEIJagTUxxFSitZgXy6+srqaeC3szHG8xp4P38TIA20jw9l9zGopby91VajR5eXlmqR4gld/9uYdYDRjRaGbg+IdR7ugYVBLulHZnmSr/AMjKLdAt++ZgK5lv/kPnCgSmgE2NW3zKGGxN38+jVlRHZjFEbUVMu5e7iVRaY+biBtoPrvNiztFGmA1B8PW54Hy/594lJ+ZxNN69tEqoSY9Qz3LrGjc62U5vH/YFw0YADZ95UwOaekVuhLVq+8unFwux6aRQy0gqosSPzP4zEooYPPswsKoVGDvXxLgA6Jzv+IIrOyPRcTYfN5inS2HD99CNS5t66fJ8xRtK0NuGVc0UUMOw7yuXKq5YbPAsv7A7woHR4zLQ1cLpPbGaonUHCpZ0VYvfoRHNK8RFVc4lCv8ASWRbcD7oRwgNm5CJRcJ4QWyIFA36C1tLWa2jjEEaqv7P+y3Aadt1UUIEf3PziU7jqwb+dJpVoEy8ZY9oES9z8yqo9eg/jeWA/s5QpNdXb/KieBjsA5P7aDVmuw4svJd6do+bdVW5/wCRB0Gi6hlBdfsr/s1kNSONfea8D4Y0MA7OfaUQC4M7R4RU0pyJE5xpNcPcJfjGX9GkeVRV1Q8MbBNlEvPSxLMBtGcA+rN48ELa+/XQgFkMV7OibPpHgczkKsvBnJkHyd4r4TLrvHTcL7W0vrDT+hlET2bp6BLAFufY0iTSBBfo6y1trp9wZfAAKLLe0Awq3ppA9hqHXx3ib9ZZA47by0K2YdTm4M8zz8ICVZBD2GvkuO2W18guVNMaOatatl14msr/AA1mnxjbyP8AOZpG+Dcd4Zil2UgvIg5MTCHXX7RB4zcexHFRTOx6yrh92g/LFKU+Cr9LlQpJx/2cL5m6+CFGmby9g9D6CXUw7XGvYqKBxa69og2kZdB4GhAmt40N86ssz+A/lhvhImae8wl8euxF038Ib/viBqUOisJNFcE9UG3i0y18y6TTBeO2AgrwZHmAfNbQS9qiGK1kSt8hVlf4Y6xzLKjF64NGJhyOzftrC0DwiMmsNDHAjMwZbvEPDdBwSjdXBoR1VJntjPR6zNYXD3y7w+GOevnLdCWNcCd29WG1AL9MHpA8FTUgTMPsnu75mgly6fBGmIPThmSUcDF3h7ZJgShoNnX3hW/HfTcK7JdjZHl0mT5kWnpF/wAcMtFWDPZg5hMrxxFF3mqvlHvKAZ33fWZtxtOpNGDUOTkm14lEqaSwOk7qdko7T2IwGPR6XsmGC/4MU/VFVKOspO5gOZnHS90eKlRR+TxFUx9iY+T8R5B1hXZBRlXu/Q985z6T8dhP+faasDq+ZqDpTO+8FbzKNrRBre6WpBMdsO/mONSWeaxcqftQe9fNSuuW/r6DnvAodG0U6qF+GD8+0f6D7yo9wCLb262pgYhzzMoIR3S/sWZ95ULvqCqlOp7NwDSHkgNm5UQb9yY60EMlOZsAmT8SPe+kt/pEv6xYVxXHGZW0uDblbH3nzcsY6V95VsvdnKVKlRkuSEUXzXlJa9TdhoQrEZbREpbU490LMcXr7wLcMK/TiNCwGsbd+I0ddRZJAK3elCV53MJvet2cxZiITRuBfMHuw5oBqsUrnC2HbvEbWfmYs9LsQI5Q8rABztjFxeLV8XCawixL90Ivuv6uaAbr2v8AEVnbn5cweAHgmLbBtd5UroLsZWdLXLLHW8IzmXnxPn8SsNhvnvHc+jBQFu+8fTIYFKu0W22+IIcRHNYr1fzGwljUmRvad0WhKDL1Nj7QKIutWAOCIvWUCgsbSledj2EId2uXvLMhld2zGg92ZkYPATYK/MUatrFrWUmkNBdWym0BpDdH4lApDbqCNGoZQdHMrq17IY/cQpr3E0fdgyHeV+KVyKw3Yi026HeLGcTJyb2L3jWvzMIl0Wz3wG7/AFrKLCK7h0T+3m8l/hiXrKMVBAGwvOZa1CNrTl7D8xLEDxKBCK258OYjpONLswBMUTHbIdirilYrhi2hMRCwMKVKvn3jbdliD412R2hSS5XKHxOCnokDYZ4uYWntBpTM7Y59pzNC/ebVqHriKZrnftBWpLgnjtD9S8IrWGi8sOUz6bWEhbb6n0a+8BXaI7Jai/8AlnvDBGuyzWYuOAFUz30+Y+/cKuAo+8xAoJYnfPYRaKMTMI63BGkvRCy6qaXFOI6iqK00yyqjek3lTIPsiTdAbCvvEYy8FmZJfzFASmb233jaGbdANLllAuT+OD1mnmGNX3PvBZttNNeJYMZWFp7Q29aUxEVwY5ROS92GGU0w1xDS6OkiWm0NmEcAMZsyujmcTMJWFu4eiUoq4omEUp8cWPwxuU3n1/yZJ0hkh6UNT8wtIcDVHiSzgQ8tGJrUfMUaEAmCvSo20ulSh83BcLzd8H7leydjCbn0P9S0165JVVkhNHFgkI4Zlt0RlpFKRd5hAg5KaXb+38RqDQZ4u3o39SkszDSLFVVvSC5U3iuwzxDSitcBI6uSiZQGo/fzKM29w7JLJ2BHUii7K+o8u/3gnLR2KujyTS9uPC/uZcKGvebYXdxKVl44ZUKh9ojSXxChVp5fiD5Y5H7nFu/6pm4fYYLesW/CKX5H+UJoOAroGQHqx2Q9JboD0lr0N8TWVTeC8wL/AEi+pfVMH7IMFhpZJRIJTlH/AFYThVDcQZvBFWuK+xAADaZi07t1vKgUR6M2YBMCG9DVq1Lggg3IIF7r/UBm7Nw8MDDbr4qaHl7hhgqXWRNs395isaEfD7ymS1JNyYPOUFv8gQu1X4inaYK3MOLX1nI9oBWmobDM+gO0CMGK4BeIBl9aNFDOxHaPRH4QjEUOw/UDtbpoYmZeHYGKhyZG6GzNRGC/MZJvAweLMSnGgEzbR8w2i2OjPBG+/wDiBcALA5HQ+m1WeeSjK9Ej1tCMzm/xHWYXxr7wVBqFDgzgrYmRqysr94RtIobP/KmOtXaWgk3tHEtcFZFHe3vEpqpTojb7gDSDG8fSbjWNA2wfAr3gVHVtFKBaJzFq+9hUJlX+viPefEeMLbVVrZoHKOxl92EA0l9HSVRLiZkLIu8BJhRbjMsLtzUPy8QSw6il1vjppnUBCABc2DfzMQicXc5GA1LKKvi3YzW0l6DfDYx/9VcwPMxxDuwGp+8y4K9UcLsk4iEl5I/3CAMRa6bLbsSvbR3ZS2jvgfMFkD3YyxtVR2MCEpY1SxU65WX9+QlXhqjf6auI1oyi2eYq2EIHc8S34SVK/wCbQx0ThRz1pJKrBN02dn5lwe1+BhXjoSGldGjCz8y6jQjlPaZU1W0rUypZe7mUCu9XVu03yeYVkCNIxbLu9CsJXaajjjKf5Hmxfi0YaeSFQai1HSY9XrBPCMca88Mx/BmEWa35J6sx6Z2tHYBBaJljvE/E1Q0UK2kHEnFiKM6p5tCClVVVqviIW5aIVv8AFxC0tn2GG4j0jKJ8kcQPR3TjtMIUUe20JpQaWIDyj4ghaA/EvRnE+5lGLzAsIIfVp05loFNfyqWfdzlBKxROneVFVEpgdugg5LxDZU5gSuj9ZrczcT+aygW+7FqoUZIGrOagqpecRnzl5iIRzVHzK5K7ZSxvbgQ7fh/oh1vDOJHviYbsM6xTuHP29IAA/wAAakG9eP8AlKXdYqy4cY/MMwnmYVjS3q5JvKOcdRlO0z0D7t+R6waai1MVEShh5NVANnQ3SJst0iA24ExpVxKsCQwuxC6At0AgnvSrCbK5SN4pVf4Bj1X0XL6LlzDRqHry2yypTKyTbmaePQePiADw4RezUbl6ZSz234IcKs1gtv2yjChOCBVdLeplgCd4uBbXMAG8BmRvoy7VMPa3e8BDggpi+n/ZRl5+84FDWL05+yGn9w2PtT6MVH7c2dw+Q7wK3i7IqHJFGbZWjGYGTFaP+ynFtsYuLfXMpjYzuvooND1id+iJ2kK7tlIhmIAllsQMoIFSAOZnms17y04ShjsfxNXy6uZfqgqCj3ljow2ncyQ6HkhtmiXN21TiICmaIdvu43PUsg8zH5pZ8pYFwfz5lxXETqUgitmNmGBZiXLlyjpJpMdGqz7rgvQo8Sjnoep1kdt4YWPOE1SDjCYHvPV95UYK+iDQEmzR8xK8rvC0PcJlwOYCwlDlqCO9KOwav7mG1l2jiPHc3N828NntMPXbZZ2npNzqkoDaBv2lsjmL5g4TuS5cvMvBGIfxN2PfUEZ+YBiU89JqEiNE8stVVa79Caj06ujKo+i5f0ZtHhswLJVSe78whMTTnL8zeruBxz0cdPQ0ysPsCtf7tNBeFS7K6NVzUYRRpdz8RbdDYlmyGAOCvoWXLlkoXyn9Sv7ghKWC2EPfojawjbv9GkNN66vV0fpqVKldHiCnoS/Ll+83t1Q4GCLpqmYVZxLPbZ6Rr6lPvFykLUITcggqauBAsMVXKlS2u/ouLMoT9odYO/DZBTtNMGcTFX85hoSnfEDiXCb/AE1kJ3jtT6p+25gKubqT57D9IE+ThNRwDf3jTl5T4lYJUqVMpR36JwgRXAQw0BbYWzvhJXByLMxlLQoleaOzDr6Wso3T1x4WHhlytk1iEOy7RgWqueZVdB4hUuXGXSAWlmsT6obQD4ng9I2R5RpLtxHXUlSpXQ63bUIvCQR31TWCYkVjL2gD+jpYB2JWZUOlSouC+CBUBuPqTFDtKF5XMm24Hhr0NKBE94kdNFeTp5Kw+CLjxMkSBiimrDgfCD6jwyw6Dq8E8OiwViHEo7EyKWOYFUlMcAccssQXyYDu+ZQIpXRx0r6EUonDGbou5J7EDmKNWCzIqAPZguN9yJF9XmcH8wmjB4egOSc1Klfcm+Y4zwNYr+YAzsDGr29yWwirSeybAKlNeL7y6KeA/g4jVIj9nkjUtYDXP4jPykBdzxcxTbjUwf1pNOnkZSXNzcSGifE8CWg7wro+SFQwg1QWa4gtptpB6R2DSJlo/EzNZ6wOYfEHgmcrmV9NdGX0qekqDTnGVPeoFAy4uAPiYlce3iyWZ3cl5QoqpKgaw4O8bJGhXFjdlARNCbP99pYsd5BgcBe1JQnzN8xowyx3IeV5wUPzDI7LiPaKzmyOVIasM0cRGyogqbYMy03r1lJ7CFM65TJT1hJsm6JqQZ/yKS2t4mgnIwBt0Zf1PTMrp7dWjQOC5lBGS3UrxNPR6+ndOX7S6HNwqZ+FxEZY/cRtkGHAa4q9ZuhFO/JM93hZqMBua9aiGy0g07E9ONYXFTq2ScMVYjc6PUxENmeZZrp3gRbY7RyxL2llE/QlRmmd5ff8/ia/ji+hLrrZzBuNfRc16HKaMa3zFjEvSjF/nSXzKqLss0x8LSzEe2ZTGzyJGHcgK7TB1uHd5tlviLVl+FGl3HskApt4PsqM0lVqPBmBWoTDFvOKmItaX7l/EQxSUaJ8QqQGdI/ECAPiZswq6uLWAFcPziXbH0zMINavaNrdij2g2VeYqNKUCz4ojgtKamcOCLJv+JdRLTEy1XDpcp3NYCIA1Xaa1bFKW7XrEi0ZLP2j9GWBcnGkqJMosabaIjibXS5ZFqm4ZT1mq07VB24VWrtMxkqwedPaFQjVV+4FeI0slgM/b8wChUcHPetCHN/Nz68QpTXhQTlOZVII427QWfU4DAhAg6gvsjGrW892kqg4Xuh8NJUD8gfSM01bKfTExAO8LxSNdoeXMGLYFEWZ+NGU4QdC401ifuiC31tVyx0Q9QavEdKAqMVAriV1MW6YjAODO2IXsje0llgfRYMzq3PeUkznL5uIqodl+IxBQrQHl06HUHwDLELmkPyBglRSNaB8ysoj+swQzkD5SygwErxc3aSoGPDFDVDcyjcl92pAQg9NNzxAN11gNXaLXNZz2z4/IiyRLT4VrGmw1yj0jftipu7eWB0I4gsyeKgQrOf3RzbPDSKihbWV2lqzzC1QOCqoo7//AH2m8o4VF2owElVtjFC2OzdhlmCvMdZkmvnqD9Ny5cuPRly88v09UywMQ9AYJeOkhYsUMq6oIArUiys47EXsMs2ScEFA3mWpKKNe8DO9orKxiFG2Zi9o9Bt5lbbDwJjwoQLF9O1iN3rMZOJdjAiVaB3lXamLwGPcLd3WBdXMqXX13LDovpfRly+i8S93pcvtGPKFEIlrlRZ4wBofCTCVk429pVHoa8vSXwLy6sCXGYXzAKynaIq8oHe5i1h4NRFUfMM+K3huzUHedJzMA6dLl1KRTouZSXcFm0ua9KhGL0WBpaQV7F4vMaF1BR1IXmFqbmINe0MzBzmpmOJRvG70B4ZM1l0x3mWV7ibsCj7xg6HnSFbcGrI0hAIU4zNGjTmNzh6xF6guJ2i8xZrvNO8uDKgrrpFmbIsBq3OzaclNL8xCToWMHJccaNbZjzTCDhBgQagj00zLtNRwcT7fRWOWGzNY15ga6zy+ZbbyyzRbtN2D7ywDp5dpoxQSx3MDTANZUoS5jkZn0XxM9oc4FfTZmmVnQcTCWHZguKC1DyPpBiXEAbPdNM8YbluwOQP3lQ7ohktEJweFjtzYmV7diaMf9lJw7w8HbEaBRCe00LxTrMtVlmC6qcMN7noEpm+0pALM3rfxK2ZrVo017yyIeoe35mtwaLEewiCgqWrBrUi8QN9pfKHNvxCcYlfRxDJABVbrXaIrat0dyaIeYeiBKNqPFJvKHWb1UwtTl1YttvS9RUzbm2IFbVzXgGEwaHYZSFXW8V6wyk/KDysMuzECXxCxJgxyrC+0Tg/MT7KrdYyUthGyXVnuI48wZk2zD+YbA7V+ptiNNsVw69VsPLUNVSgunt58kBpkqxG9LinKcQNzZKO8GJMwi9EGtDLrQh4mxbgXKzGzdM+D3ZusNTNfSVgm4My4m4FN6wvrH0VMAO/mYMkfb3itrBoEsdJ2SL2Lv0UDMVgZvPmAGXyERApTMaOmy6rUl+2XdJbV/P8AcSknbfIadiKKhcUCA5Da8MBOezG56S73xUvzKQ+NM/3MYzXX2r/Ik8rbwa5eQ09JWNA/yoklAW6ECbRF4t5hQmwcPj8SgjnSJ40ma3WVWnSpWqszTr5YW35mwuHBjeXEHQQXNlZqXEbh4ZYG7ISvfid2ALrKDoO6KlRaxHTEtbMGbVdounxA5vEtoC6pKzWbaEZjb07y0OBoUJ7zUYO5BPI27buYLOGr9OZjRjRofaHWyNO2td/WFgaluj/fiBfVRL2esoooxqPxN3dbv0hqm4daRq8G8sKzTwxDLSpqtXM363e2Z7pvMatKlBxf1LoAZXv0reGwusLHBWjSLJsQZa7xKvJavMZeYbAHQ450E/elcV2joFuWKZbW8CJUcKn37y0LVNI0U3yzTopvhlc+dLCUpXaXAbA0w/vtOcN8Gsd7nKI2g78VNHHwKu+f6o5lLoe8oFj6s/3rL1mG2X9rKo7vSpZs5xlvzB5amnMU4rwTI/D6biXA6bwbFFjmymA2g5JjS1zTkuV6wF7dqlEjCrleUwkuGHeDMvp9CGXt3Ye4+Jpw6AIK7ZmhO8asN07oaof7zL9ID9ivTmFZWnmem01wrz+RNANC8TOAtKVjBqzFD5tMa66eJfLDK/57xtbsveMDUZWrt/EONrDlBtlu8sFeXbEtdZevRSpsXGjd2lGyd/pcEekOmik0uEZoz3YlF1LCM+d3QPWCoYBuTEVsBYUTcNu0TivxNc/zA65gAwBCHzGUOS6iDXsoOlc5XB+0G1TCT7VKUZcBWLNYAmAAAoMUT5h0LOJcvMNmdFtad/ErwsOdY5EusKb7XdKYsNMxHReGCTTd6z7eYXHrOZRZM7c7U1zRl0S3NonbEtIDtFtt16OGIq6yoIBb3moMzjmGnURV08RtrPWWAsTWpcpy94770zUACU6Z1O53gzygde8Bhod/Q1mx7Bbq9ANWOZ7EbtWbylbbCnRgt2ku4a4NnlMjtwxXSjQZkJL0KM8TUtLmKaepLaWz/9oADAMBAAIAAwAAABByQ3aVdO0ed7pdLIx6Ar7fAC7yZMfMK39QgvwGi/ssQ2Dk5vOv3mgx1YMmc7xRxFuDqtj5w0MRiazj9xlYXMU78l5/dgG2OfZkDYcUJJ4S2APfiz0sk9rF0SV3OIKsobzdNeuXGumv5BLIZ/XhHjLXF0JIZrx2TVwCaxhxI0FnOwybwQx3spi2fD7kJ0LzNW5cphRmYzu2rqzlAMDVy27Rc2yuXZnPBFU648QM7EgOQ1Dx9+lv2FI9ZIMLDKI1FGOGTPmTVmcVYfC9SZHERAPxqRKtQMtfpnhskrtEADkuo979BfHO1a4gBWS/kIylhGOL/wBy64gB4McjIF2B5g7yhW7hyWEv78VJmMqmu7HcqgzUcKsM6N0sOSVESBLuQqDsNSgZISM6MSUUXCANoi68MXcCFij0bz9ddPVZn+Jmf91Y6eSW4gw3zl27zQzf9ZLhWOJbcDqsxH5//DF/z9yJm1IsAEEnaZYh7MzzUskJEfYztIe/FSjWqQlrMBufTVhva3XWn6QNIemwFk8yz9qXq8vZZtsOEpXVn3mCAh5DMm2hJUNfuuUa2/yXzeEVtWAMOMSZ5Pgf6MhDp/DwhwBBqz2E22RUj5A+iPGEXqUCca0H9g02kMoBmdy3m0j7W1fq18hA+CVQTw4SasnGO3HRuXPdl68GGMd1n1AqsRzWzh+r0cHQAyRE1BbTrdCKJkP/AI0hZlHIkvy90PK3ZYysp68x+eUOoZygMJGqSRxbIP0auiSUk7Ns8eVjz56v/N9LroXlpPxzxdx7Uasf/8QAJxEBAQEAAgIBAwQDAQEAAAAAAQARITEQQVFhcYGRobHB0fDxIOH/2gAIAQMBAT8QiWOksri0p8DtZ8HMOwC09W08SdvEXHUYZsmCxG28xoBhdzckzdYWbk2AQfQxAMW5eXEUMe9h4PK7EtHV9eOwYvCYH7L2IHJfpkhcdz9vGQHF6Uj6gYZesx7is3Y/fmPm8d5xCcXNkcfCTnIPhcOEy+zP03M20OnguFz+sj/xOWtF24nHgHtTuC8ZZtluT3viGm7faI3p1cnEe1p6lPVq2bfBHbjC1lfSdGFK5hfDI/rgvRbqGOJx5sOZsGw11AytJPiVD5kHqWxISPTfW21j1EGJwvlulHDvu0B2KYYG6slYgPkFltu2lvgfVJeoN5kBYi0uY24I6mA68PVjmeNSKO+48bbYsOx7YPqzw9xFhM4QwWDiHNh12Hxgu5jEibPDIek3lk7dsPdh7tOmdS1zJeTEpkrRBgcw2dHfxcDiUDDZ5FunI4th9pDgtfFt9XzPh9KwshLl34LmTRj2WIc2yQd6mXHUssgT0OrFfpaNb2zRp1OfMzrzf4ekCfoGR93jnZFhaCRGExwObUJdPDZlYBzdtjw8Qby5HPUrqwmbMJ6hNv4jH/gEqasXt1E3PARbkN5tgE2McShj2yzGPQT3mG6PCa+rVjuVn6uZiQ7Oi9RclgLkjfmz5sio75FI6lrFAkBt1IJ6zPNg7k9vBoJ14Mio7n4JfHOCAgnIW7+P+Lg6cfhuJNnp3INwl12Ti0dWnuEcdTo5vIx+Pw31rHzYhHuY9zY7S2ze5zjnm+0BGN63O/vtgIRffz+lr140W4XM9k4NuPEyZmQHSYcH7+Qr1dsXpNt7hVZl3/wftj6lal4N45+HP4mc8ZC8WVGI9Jo4Qu+IObb0trepbgDxj4bdQmtwEh6jylbDF99wjpSClIdbY9dP2SzpcKcH8z8F3pMGMLHwTw4SbKPUaW/UtzfA2yDHNvMSam+NNIn5q0iPAXFw9eANzlP9/EOnN9Cy7cUMk7MY7uy5Op1vSyEBEXkIS0i4vdxxY9+5fXanOMZzrP8AsoK18Z/cXsYHUB4Z+Lj7gHBYJxmG8kfJbOW+C1cy2YBbAMJgEu2d6MuYPcmWxNi8NfZgPa927AgO2llFSXheLTqHo7ZngN8ZGF0cF3iiHbL6sM6wqcaf4QYGw0erKbJ15jFa7e9fRZBg5sqtYvB4uIh3UmQ3GcOHNlK6/TxB3Bv3uRDp9JHhmpsJvr/UoV6sGwTdmwvX93JmH6yDtxHxbOh1N0sskARZLbmNjhGMG32hHdimDVukd+0BadH8wdyQ/RP4sM7bPR9Z6M19T2DI6vckyJmD4jFll64sEiTMOWc53Un1WFpsAGE3M7MPWzv0jeRD2RI2SLCSQ9D5kerv7Qozw7a93qhjzhHEh0Mzh2d4LIJJD/dtdPY/tHRzA7yLW5dWsRdzvBbDDfljNwZDgk9lizPFdturDAcQHVkOwtHA/ptsBdvVeW2Ptu8y5/xheB+uf3cBzDwIsxD8LQ18z/If1l6AnXU7Z4YvVl1Y2tMMpEDmWvhhG6A/zaHPifKH3b2ND8WHbfv/AL++yYnYgx3hF2xnPX0c239AXaJW+iTJdkhobZnPKQ3D7f8A2T3S+YfjP32OAQfeScafO9/m4Xg/T/dZUTjPa9xvpnz7n9rfX/biFyEO3+fv/wAjMIkjVzfDnWgeH5kHP0O5NOJGeXn83UP3W+Ms8iRnGwdQbpGwCIckjnskjR6LhBt3NbEfAhvZtnY/tK6OPItlDHiyyzJbuAmiddQVDsuwmLlEDqy4ss+spp1l8EvAh+7ju2WcdXEyz3Jk+Ck56vQZ245wbwX4hHBIudxBhOm8rds8A/ce8wEwgCEH1uoYUwkoG8xbyrfBYNeptwwIfEYOF+8s5Xfm3FdbhjiXWY8G/mCwjnwDLWPAziBWFvcDiRDW5YCP7viX3vbrHe4g+4A6u/Ag2UuYT14ow5gExjRl3W9jfmXWJHC12xrBhcLuOFhIsLnFh3OaGQDhJGT1ab//xAAnEQEBAQACAgEDBQADAQAAAAABABEhMRBBUWFxkYGhsdHwweHxIP/aAAgBAgEBPxAyUMZDgZkfXq0rvD4hGwfXP6keqv4vrv7WRgv7SOF+18tFoSLPKH72brAjmScjGWrqxEwZH1NuO/rDDIqvaePvJbdCUNHM6nw4z8TTofEzg8k9y+ihcIGyp3+8Af8Ad/nmc+STo2oD2QeiOOZcpBRRPmIdk8dKinppwUuLkvT1cWdZHYZ8QnCRcBt0iTscg9jtj2QvqQZGZcFkLsPmhJ0zKECWbJnufSdSLwd+4+m/wkATiROg/wB+ZdRw4f7/ALvmi9zjMsvZA9QzyZkezWQ6UH2gPd3kT6mZi2lShr1394IY/Vv52vqwP9/zYRQf1s/V8kJ7gE2z1J6kuVgsWNjZ4yyZ+hz4ijDh7/qYoLC+iRf5xLgO4H/ieebi08b9SvO+ObbTu4cI28wMCWc5kjwspgc6/wDFtEigP1keV6f55idSyXwyV6/+NzuRb9HikPHVg5i5bSB4dPw3V/qRvbz9u8/iSN+f/IOPn1OSfG/gh/38ZJJMDmOYBebK7gjNvmLT1GPUeFxk4dg4ZkeSA51v/HMvTP15uTvuY2xD824n2WaX6S5aYN7uXuz7bLostbbfG/E4ull4eLWE+oiR9xw+pFCet2HvGyH3RjCKj9uWVfU8fqf7lIb+RvuPCEoctxZHHWDZeLhw3ohbl3J0niXDJyNbc7LBvb4gV5S7sHfhixZ477uiFYRHjuQCOVbweAk9FlmGRvlkUL0SbJe2AkDu9exM2+WQ3UDokze7pXwVNQkRnUv1a4HoJ592zZA5ko1xtvtaGJfQmODyiMe8lzZgdl9a3etrNLMJ4T8/7lhuafMXM4PEBSPDmscSd2x7LB1a3iAJwd317d5LfFr3MavoQng8QJdRjIB23Jx+kPJ3LPDWDW414fGjZp2Y+mAPL5S5YwaupZepAny3TDyyvHXuLYmnf8Z5r4ldrWhAT1LAupT68KMMYJ3fQtCw5R7rhC7ji6+FA1lW77icvU7ObhTNuk8lz43N3llud8DqtCR82J5YW7vmJx5L2G3IYT4bcsaYj7sHsgVxXvqXS5vHii4e/DnLCMfFEnSRanBavi6XVjw7tMlFocM6ll0bw+oY3pmA8/Ms7l6bwuyblInuAdyz1fNOXU4R1NwuILvxt7jw7amMcw4M4ekwvqerPvBmgVdFmQi17PGWpbdsrRAzlhTgu+7CEaYThfX+5tZNokIcYuXZTT5o4qLM4LkEnwnUTpfXEN6Rel0+FwOruvQXKfabQToOs4y+5E04ljX7LulrF7sMfJHKbuYwRx8cXEk/FOhLlbS4R3jLUx9ym9ZP8zL65XAxh7wyM6eKjH1dg8MQwW+G2yuNqCIBjOF3DAvHEuux420ENd+Kw1+pua3w8EPz3IHBk8ur4ZcSejE1duYhkn32eti9Z/UiWW2AIfJlwdhS9w5sK5bmpA1ZrOlr3DbQ7LYdss8dySU7F2I6DP2z+ICOObiO0I63ZHiS0NgzEfza+JZ3LohHVivMVoReJvgHnIXRC7I0yNQGGdY3cHWWJhWzQxZxhlrwuPJ02kzRB44RjRL0se2NQ5HLzcL3JGE6wiPJn++0K4H7n/sG1x+P+p5HL73RzYW+Xx6g5D9ev4kmuV1iHfIyPo4hYDFxtPkwcu06inuzxtss+F5E8u2Qp2uLNgZG7YdwJsQcZGtDmOBwhOTA7kSZ97l4bbL4zYOYJHwDAfmA7kdEeCcm0AMLbmzZ9jEcIbm4EtsWRZHOKMGpxL04QSPuxOIHKsjuS9x1JBzYCaWJ3ljmQZ14QyO2FC+Iulk1lty5NXbWZ6nwyM/W774j4jENasj0J5hEFiERzvGqEzx+JUHBvyz4yC4O4GQ71CHBDvVh27APpJ9XoJaawPqHym7zKoQIOlyei0GBsew20SE9mCeqFwjObvgkE0Q1gMv1YxwYxnUlXLUdy+DBc+oBhOiw8t//xAAnEAEAAgIBBAICAwEBAQAAAAABABEhMUFRYXGBkaGxwRDR8OHxIP/aAAgBAQABPxCzLibgN4hBwlMjjmD3sWIyGlIuW72wleKXUrMWdXBh3pFyMYoBF2B7lPDWcRTiE1dxHmvf+BhfkesYaJBgWA6y7A9pXgjnEeg9xHaFRglNsLogI4HMRYpGvrBFKiHbChGQtjIVedxkmyqWNF1eYm5+KgS10qWsancY/cOssv5oGAKsCOVTBShhcYcwtXmNSYkLRjmVtsVTPlYIS2XDykq54Q2KNAcSoE6CXB7FkshFV0kNdlEBNiCcN3JVoAl1odGKhzO8PRMKlQbxcCV1gkp4ESkdZyoDbGUH9Etqf1BLWeoJyeoqZ2sXAWXbBOjN/wBly9bcDzEzB/DuY1C4lzWMrBEv2maGFqNsqDlajnia/hkYiap4lpnAxqoLiCdZQq2SMUIGG9Q2ngi5uPc532QmPUjhgpiom4grD1/Eb9j3ACuTKDZbFktKWjGdK6mU+fMEGy9pa2zxMjTCWhHA+NgRS42bqCq0TUj6m5C4vQTZCC7IdziXAojhxuIuUwA3G/vdUsxFeorYqBVoRi0RywZEX0hYFg2jCWh5THEp0gYDzGHMCYIkUU7R2RaYsmKsYNMLNAyQualu4IcAl77xQIZRsp6M5FQJGq1TISpYP1EgmS+CO+3HBmYNyS8QjE8iogMGMoRCJGISou/jGsscsWpoysK20qhl9QkwIkLMcCHSYgtGIMQcxgwzPmChHNsbcyyNNNwOPGQjwDwEE2fEILsBDgwUtXUZzYxZthLhFqpnvHjbHmWZf2CMOeC8yGndomWC0Df0flATlhbe4tQHdp3luD6F/RWj2Le0sFzu4I7OP1UTcMBHxWI8BR+o2lOcJUMBQ+D+EEUclbgOIojZFRlJjMtAKhpdSlyCuiXCLjlOibwNs9ZYcCXGRNUUyuBOCyJZCQMQKIws3BoQm0TqBqLh2KeI2gTm4NBzsZwz1Kf2vM4wm0k6mUW8Jf8ATpW44tG1q1equV7uZQAxv9Be0YuosJQG29hxWbmdVYwKcik0zRYQiHlfayuLiU+eRD8xmVChIU3d5OrPJZmbQvpgHT3HqYgLR64IrIHQIyn0cJbTzE/+ArCkj3gnCCK0Pc3lEslBBC9Lm5Ur+LnICLbEc5VM+KYswYQcwf4VGiAjcJxI9XnCKVQ4A3+YQ3HvR+WAzqtGzkq0E6e4CuzsdPlbAz/tQlxY3ODx2e/B3SDZVygBcquPi4IFFRoo82Ev3ChJRd11CVg6igB4PHO8wrq81f0fD6SNjZZaQHCO0P8A7LVzmKLyfTq6vFH3yLcg0npIPT8sFBk9yPm6vBjAUKu+Y9VeJlZrvqOiC6qsx2kOGXppXiak0ah42Cdj9plFzBnWmajfIxC9uhH5H2ShxHB+mILRE3S9wjlp2ZeveINU5XtjxEKKSbJ+p4J5J0mZMxaihCANH4JyddFc+GSoaX65Mohu2uvZXIfcLERssvT+41GOKLIVWRtJ/nqcYSbiu6YJfOrY3lYz2iRlJCMrqm4gB0YxrpoFX5lRr1HgXaOfzU+BNeAvd1Tbzqr3kORhti8wS390qwfhR2nzogUfIla/njMid5kWkV564mkviWKZRwRGDEzZ2JUCEKYjseYcA+YHY/BcF2NdVqE0UmnI959aSQIzVQf5wIq4GaGqiEAVDZcH69YQKuh5juS8Q02We5Ssh0i6wm80yvoF6g2TTouDzX2rEvAyLj/j9EsiqxnB18w7c3szs4Onn0TlTBgK7+fGo9UNJ2Y8jQc143dAxEijyP8A247AgY5TN7E5VBydI4lbfZV9Nv8Aqi1OixucF3dsejuK65m9oD0CD2o1a3PgCdHPWNNQIlOeE4eE63LYKRzQkRkpGKNTWoeYXTcilnu4gU+DEGn6Q6q3iIrnKoKuXJiNviKCzu/m5t2lOElNvyLlvDvtLgeysG/BMhd63UpywOFwKjTs5fI9UEVh7MEEfKa2xDOLFlZYlG2VLKFvClrz/aZNI2e1R4Yt9xDDG9b/AMR0YIKrC6PLBatmx/135goidA0htvVkOmXYQbU4A4sodhPKhyoIsgKRV3yPX4AiQ28E10B2ECWVA0xQG0aDx1+SDmLFQ4V2fGe/aPYLw6dfSWjH3lS/C/McxWtW8gPl9mdReoaQMqJl/fRzQPKBMr4gKmUEPmBqoLxa5dVLFRfQRiIYfG1wzfJNxVEDqwXRhnAvgiGPmi7QmgM5WHmMGRfMxyMKKo62PiGCSSs2sIdhuDYpcA8Sws6G4kpF0KlmUcIGKCF8U8sKiDPR6D8R2HJtFNvYW4X2aZLKnnyw3kwAu1ry7rsKxDcPIbBmvYCX3I3NdezVUd9jgx1Bw5GdbHwKBESEbeF8DD7xQqphHobPldZVFyBQJ+937Okxhyl6q8OfqCFbC7OGK9PWcvyieUch3KVmMcCLc/BCfmBAQRcGINZYh0wkjjRC9BQqu3muhMjFYM6JjnPWKOx4mgGWLqJ4IvKqCrNxctEYvMLMXcNC1gQ2xgQ6naQB+YcTNH3AVAxzCofP9pL8hv7C/ZR5HsKRe6v7hJj0Bc75r45V7eju/wCt9R8KJp2FuvPL/wAlTQ2vSYeEz1FXkloA0ZjdvpteCuIPx4osXuaFV73zFbV3Tv8A7YhBjxuD5ZamqY4zJ1z7SW8RiXMYXyiGXMhi+zGaLRXuqZScK16tZe/z5ieXRW3PsWGo3LhMHt4pEFRyjfwwbnfMdNvJpv3Br8Q3LyszUuGtQ+sOPyAOjpZA2bZUYgkYo9Tl7waJVplzNxb3iuiD5lMrcDpKyCOSaSZmZVh0x5bi+rk7lwKdfgv2J6omFA1iK18RAAMP/jiJLZBtdeI4c7HSZeI9J8tRD9Y2LrvL4vHeum8XDJc/p7Z6pEsBFNHBnLtXNxHi9vebvu5O9OItEP0t+nxD/B/Vy1j3AAQUodqwvfLDtHnHU4fVKN4Dh9uH5x7nOKD7GX0sLIvFj+JjE0RjhEb+JhzyS7L9r7iwUtYb3KwZhmuDcvMv1BpRQjHYN/yRlonuw+meph27UV+I/FtpJ+IrbdmCYdTA31gjr+DOUcQzgZlEEEp+ATNvPgLV4BlLehMA4OHeHrtY9nunEbC9A1+/1Di6cToBRI1ox07kHKiUZeiHdvIaOoFESV8L6JgOVuEKQpzWgeTLW7g7BzsAbdao+jrdRVFPdVvt+05qnpyW9ZuWNJajojT+I5c6vt/5M7LODthIby8E8nD7PslAtyzgqBfbzebUPsp9wgndn4lSUqGvmP2ERY+NRTpjDzG4FLFJeygQ22rC5jC+0XDvG2b1fqCNmoLaEJKwJRKhAQG4Mx5j+UeI0F7IBSqugDb2IPukbLbvpzdADrLJvoD9zhlRvq/R9dYYWLs7bjiMQGKVNBQly5BaHBD2vWArgNvBtWUBLsUpt6ZodNnOhDjGkFVdBwHprNzOwQDRj/BQHftDwhJF2tPgtXxGJUN0oFv93lNqCznQfIt5WYiYEV8/3Ac0o+FKfn+pcQnnK/f+5mDWVZzupUZRB3WyDbmjj2TgI+VmEMwc9iNiQj6qH6iwa0aFJU4N7CB0HxBECFHvp3hINDBc+LuXwNu9kNwoLFl7UysOBVrlYQDZyQxBh/Blo3NhDqlfmLcH5uJct8URD9Kso4DuVLGU1unD8wTJVA1LO7SXtnFE7wwQMTIbAwgpIa2ihN5V9G/RFSESpOThg2uKMdFj8KAVpVX9QxFsvdXcXO3cmGiY6S64QFEsQeetbi6U50VNgehH0Sj5Y8AO7l8RIPKrxieuCgsxTuC8HrabvYeCfMp3F3xkbD2/uUnWrOCLL9g9zIpZg9kB/cfLCJ8q/cAShRuLkr5Vfz1hO2Nk6DBBYQK+ruHotfJMZl5RVZh6x8wnMpx/EHH0BRix3Abv7lxbUKbWaZlppRS7bWOkTSjeBHU3rncpKcn5TE6IJm5kkHiglL0e2UG67u/1Alx7lyw1RBOQOrHE+aYrQH2YgzX2aIIB3vaIme9Wmq/2hYUIAZ6gY+I6uGnoV7+UTGFmqnofowUnSk2Er8P1L11Pe7g/Bp6JRaOZfClPohU+bfK19VH5z4wQDGJ6tP7RcCxGm7t+q9MdELrT4M5zCq0K/mbu1U/gUe8VqL61AqwBizYmPMKmqb3Ao71buHWFjVbbKECnjLfeByBDMOFowYrmVgeVwsYBzV/TAoDcFXaSz5uWJqmzuyw+Woq1L79cvaxR4S+EEuKQqojYnWsUZPumYgf87TMr539QdUbcA+JUL9NATO/3e5VHevS681M0ZzCgPSVou2GB0tnJXAQRXfzMdH5/7hTmC1wHiF8tQHA9TYXxQHa8tToEFqS14X/dBlmcdY2jr7Ov4AJY44S2yKslOzUByhAMomf69kas5a5fGen4ihbtnva2TcUDPpT+RD5IMALaAVLVpYOYmndwWvLzdV7lMCazmwN/71NSFhX4n4fiXpkHmc0eyVtQNVCUcE8hX6JaEqgBqhs8D5MQOCEKQrdHAx2iZPlDBwrrhrxMABS0WS7L2AHALti/ydzkNL2ICvCdoWDurQbaXmKvH5FePLi3v4joUA0DQN32mArHafgh9cOLe+up+yN/1HJDhHY6axFqrPduMWtsSjbpHZWxcH/C7BPAQ5FidZ1BfLNccRvEVuVvKWxuqOZX2RdY2bfy8vYIDFDm2V1CnFhcBKaw09oDEJU7Nfn6gFXVmCZjK+5PeqepoBBSVoN9cxMw59v6zYYEiKNWvh/qIupX/W3HxaTObtOqQToOE7LrKynJuWlX0BaDtgn21o3Q5fcpQiF6BUvrEunbZnBa85c8tHLDAU8Ls7LfIczHMgvTbfVOdQQRAIgoGWVbXPK9oVvW3wRCIK50Ar+vmZmldpWLslcZoDXZDle8GNTHDWGE1RXaKjXbF3Veoh39oGHsGxM8Q7CaR3LgSFSBaQ9Sh+6VqICy930CxHzyK8SHyfVS2tTIpVHXxGra2Eflx5ibdXsOljx3iwGKc0GE53uJGNUPK5/uWDkx7RvPQ7wm3VLatf8AsJzh+gxxFfyzXHACZ50mC8YgEGaX6PhhlyIiIWJpHtUTZi9nXC8DQunffCEqrXcFfUNB1gL2Bekd4pawtNosEtRisqyYjQa9u0OXwvyfEFA4HAkzg22q3BWM6oN2CLA1g5TRXd72iFLoMN+ZZTr0HK+PzAbQypc5Jg9L/uNdWuqI/mKUsN5FRTSTuf6lhwfKhdj32/uOUHwH8wDAPAfqcE+H9RDt6B+pmyrRmXTuCsyaJl3QdoIXd+WJXDPRlRtV+CYzGMeMH51HN6DhOwLBVF0LnMUtp2/MyAUFpvwPfimy+eAlhvUep+ziHCg1FI5Och2sgKgOsvFoMDBkz2YHIjfog2QwI6c2gUX1esUwYg1m1r4ivpoHy/UW2OYCxytnxE22qOrBS1cnSCKEg8jsjaZI87PYV7GBVmp1HXo/KGSIzS3RcA8XKIoqu7mKTmq7SlBvYcAVHSjILqFtgaDhI6ZUfaxDB4mR8G3/AH+xCdoFvLcDtcvQgLAwUqOpU3uULisP8NiKqIMZhDgl2z6gsTGeO0zxV+4P8NeEPUuZWyzCAbIBBaDcWzlwArqnJ/dXdmQ/h2iNFky8Ogh+0DQi/MquksiRKqrAr7inW5UtA7Vk2N8TBoFgX2u5zwuq1L5SuLPTh/U1dMHmqngFvlARc8Ut4V0eqlp4BLex/wBl6sffEuVbjpLYNf3EcyrUFNYiRIVEubbSSyC8ZvJ1ZV7Dx/txim0MR24WWeIGmtZuF3wfdaPt+o5TMm6q/Kuu8w0046BHbOMpaQYDHetEO9fz9XHlaNCL4vxydobyDVtpd8hIqtheqsMIrePUUpUeaYnMy7f2TtfB/cxWrHZFURTvDUH+AnZDGzo1dtcWqhlDCFsdZfrQ7BwGCD6V90x15gi8qdwasfmyMoNuSsG1Mh0RzLo2BXfiB2TQc1Df2SlCtjN0IAwH6Rv9sQAxhx0uOt1bhoMmzE3OEu7mHiYuGtzBBCiHSo704alQUcD9wNhaC+MonuHifoEzgcrmFJUstV7Tl3BcUxsHmVHDmOngzWXb8LV+z15jYgAepW37WX92j/yYmiPEsstyMygPdeAjWxxbL0jaLqDEg6aWzc2eSX8e7/iGMH2suEP4b23DQeVwDK/uXn1FtCZVvTVBoKJbAwaXsNvzfxD0GPagTa+7fRLALZYeq/YaeGN54YLV9lXxKcFNhm+tqT1M2Cawa7aavljnJtiZYwPSoyTvUaq2Xznf5jHCbxZp39kYvueLtf8A1juRGsK5s/Mu4wUR1/rl8wktGi+IXaG/iNyocjiEAFdWc/cFtCXSrL8k4lh8H6joApuue0uuFZGGF4Qaj4SAmYUcE/ouU28nPaEhgG75g1AMHQ6uh+Yqab7IUurs01rEPml6jA9IkK8SzjiWeIiMbYmyjo2Br9xlNg9IdoWkXtgALsxGSYaK2PNO/EpK1UEp4RbuV4sCq62olxei2Fwg5xCmq6Thu/OcAtbYq+KZWOwPCK293FbpQKNBLdNj12cmE2AAKANAdI/xhrYIX0w1UVqvTLR4SGrgLJ8BYXwHVE1zgL4cmz6ss2w4La9XFFhbwBtlvx4Mt1VIo48d5fuhdAOOqMd0CIGd6FwGciucsMNMpAbMACrdPSPAI5IreH/u+ZY9XGi4Eyvp3h9qEIqUQDh+bhPUYFdgGAUmFfdlqVwRXhwMYeXbogRTJn2TL1aXjkUDMOKDxHdgI7ozavWyLQDlXqUR+Ir1jrMki7Vt7kyg46x6CCF6N/p8oVka8l6gV0tdb9ahSQGzvRoD5GoJ/OhHsVRjpWzdGPUOr85Dzm5owvDnloX4ZU9eiPNirfmCQvZGFq4qh9QQ7BSfkSPQ5zQeGVFGKHvCd02aKCNuwTiz+CIIFs/5qJKwcm5hVulTppLyJYnIpGHjO42VeLw8lQy0JPI4/NfMygFx1Rae6qzEU3a1D2Z6pUC+EGMdwr2hjtb9QFpVVjzAdil9EtuPbAxgN1ayZxLX7pbUYuGQ27p4ziwl4tVIlGRfV+TCwemdsFtAaza9cw4DsaAyl0fl3UwhIaDsEXxccG8gQqhoHUX+Y/nUO58AVTuzDQ3uF1WF3ly9k5dquJUgiW7QNvFnM0B02rvDvwkWLbo80A+YIZOIeBCZ8kiV5FPLK3hFn5OrxBQCic3c7vox1gqHaOuZtWX8dX6BBV3oy9ooKqMEdacktTkg6i75VmiONljcGtGjEKNDg416NFX7gI2ZtD9xXFWliqOhNXUTHa1EvZYWsCltbEt+lOTpcMtQrmoOg3mvwR2C0BYFGvqCm1MxWWnuM1u1U2fzFKCU867RxUDoZPVws5SLhxtsz5LIAgCtlg75/wCRRCy+mjH6lXZPDDOY7MSs90BLE9xAp8ghTQ6iQVN84PAymRAL4U39CXIIB2sQ7HDkzK0l1K5AHlhrBatYC2Tqr0YWWx4bYW5miNAUHYObfGYF6t5FdhDD4hyOUcJavIa2OHNZhb6Dl1jBdZXr0t1LKJpwcHGxW6yY3o1o7rM0mS3J2wyRdE4SsjW4BGVYMX8DDsU4DNiHtAMCQ0EM6xuWGOIG92g9Qz4v8ooOihAVfL+oFzE7u/xAQfdFPmoGIL1vKoW9CllXO3NhL2HUrbDfR+pQGyWvqXv/ALNaAVkMsb6SoKQBQPzdSqrQVDUWraLDzeVsKmAcBG2uN7jKFjtEow7MVsZfNrSu0yb/ABHN2y2qaI3+t3AEy+n6I5T5jKyWpghM6POviHlqCBsnhW+d+kiQX/4TD+4AXzsHwf3K212BUPtlrlDT3zo2jl1D1g7pMONUGH/OXPaLgBChHNrkN5uxvxF2aWYuNgiScUF+1CvqN/aAzHnBZvAj0iRYQmkwD4xyWaww0bASBcLN4zdp2hJHah9hL+67xyVtLcdnYHo/W4Udm6hpXQu2nBYARmrA3FeA2mGzSG24wxSHAzZ6NNUYx3nFvJGaDz8iIhjtcszylfZC2IKdYx1mVSKbwAnOi3jxmJBrQwlh0aW+qJVpEfLLITOlvq0rVhRJ2Dx5MeIQiQDaeLOTo7+ItIhgVYxAVkc0s1AW1xBI9BXeZeIJxF0pubPHZgH2dghUlOQbsULfLfiMYfHVTo2v8y6hm9n9wtjPZs/MbIY6Nwos3XaNGx3T+ozSG5YwW91LGl67rEEg4zErZZ1ncBmXIlJslnZAzj1YetzrN6gDvleV1OPZd3i58IeYkVMGAdFMHllDk7V+evuWlvyrZ9afiCaEM0sPQrD9Rjh15eJtyawvJTuNagqlg2J1GVQwEbtBVI7Giv1AoNRZdemSB0zXU1EoqRtFVXQvNaWumWfot1NaI7HF8hm9wgYytm8Nu+vxLV21wgo6VUS+wYIhpV5/JLFiPTHiMnOLArDsw65YlPWLrPLafEanjateYS0BVkpGSgsYq1TS7W1Pcaf8xwHoL/q3n0cSlQGTodPEUobvKXMkzMUrRC93XnKoqHvCRKRt8Ysg5Tkiw4jv+GnD4iWsxsaR9Sz1hEsuNNW8EvrQaz/ZAPLelzHcLdmaOvIA/UBifBrzPL2JddBRkoFHJABjvMxV4gjoGKNZvUB6CGKrxOKiVeXaA5hGMhMlvZlyPTk52P6hhvQTVrToPrvFpjcWgRV/mn9QCGsRUz8RODcKo/BDEX3wtXOs1ZrfMDnwzi4v4PuU7AULFlLfJm/EPVBuE3Q2gyvQ6q4O7DeIawWZ4dL4vGWd6zZbdVZZjGrRD3cnZxL79MWuLtOMcTGjaH1AKG0Kd6/cAA1fXnvE3deNwFFYdeDu9e3HPSNF5GgH4iKOOipdjTXxLiPuWbiU6n2iReUKzgfqO6vhmFFGbtg3a7YQiiwWxCtHAXAW6IxOqUms9S6QRnGg5KG27t9HUWKsdQ2ioeoIyPALtrzX9wBizQHHeOI6eR/ipUFXQgzQz8bgc5Cdjn2i/M5WUgmBsfYkpzHJ0hvvLI1x5S4GuSAZKBoXlXhrPuoJyoqctLBwpa02SySLzdvzVczH2nLQy4z96iTAk6i26+E/lOJg8I4fIx6F1L1KuM1EIX0DxtG4qHA38sP6DNWT3IHlmxC5cBx3jRhHmHFuq0ezddyMiarCPAC9C3mGInUyvI2eyPZt6pj1LqA4phHUTdVHBek2UeLBXqUGkABb/wAlqGnQzfeB0p7xYv1MAs5rJ/UUbzaKfuB0I5z/ANR8iNmePqL2HNMAdvUImFMnIWfaTm3O/wCM43ZtHFi/2xS4DZ1f9iFcudQ/gDVsKhFBlVptiBLkjyBfzT8wo6IeC2D2Wu2uIjJWTH3K3YiORlwRev3H0lTQfuDZmtBYKEoJYinWYXDFYYq/Do2esysLo8pXHe1Xk61CbooPBWXySsd76WDL+PUYFq1DS38K9Hxn2RdAssgLdjlyAdXtA61Y2q2ryr1csENbznvMuoc51M8anKEAEx9KxCJkrhIwpeelxUqAB0lvbkWOHbzSgvVtavurVx6anDzHoPzK76urL9SzhUVY15ouExwC/wAFblWtpdOEVl/DF6PQTIrFHR3HKNXmmriBrMeGPp8oBoTa/o8KMhQ3dfyZYtvmHEPvPzFogpLTTXgv/VDCEOMwZyCzYHl79D2xUqNlnPuB0AXo/wCxPy43bYi+1jtFlZ3RVeA9ziNbX/rMwzY9NRCwPEBbq1Z2X3jFwEQmOK/MQitSvioogibthT2c9iHN1ihRdYw9YaS7u0RKNHqvSZheqCz1ofVxjjwQoNBbQQTQfMrArMlp6J1hs5FbVcAFD3fuC4bz9osfAQFTXIuToU0eZQ4NtvwJ+YhsSsUh8fuBTgDeq8F6Y1EuqsjtS2sMZTpC/ULsmP6i49AVi1AIFdUSvUstrK8xydVhCk+JmnmsjLWuMaG5bi1oYv1FcCQ9I+4CtQXlwT1BhirAMrtFVUUVw9CMhVTL+V/Mu2QA5VREotWe0KwNO0/s9uOekorOzLdWvakaFdRW+XB0Jg46NnYQ5UA8d5ftv2GZR3zfdLhadKfXQ/mAaAkKIGeIhZkIxZ2v8f3DyTmKt6Y9n3HC9c8E8HfduYwGLQrD6hMcc+ZmILBfl7fiGYXfFR62AebIvaOcZfiLy2tbG/xL63jhNTMRINX+JhJXyh9dI9bJxdxlpfe4gCC7qIkscxGyOwoKKs4uWgU8xe7JvDMS0jIxbw56xCAwFq58jmCa+L9qFjBpW1LA1sVIaYYbrUEgr3Ci/awLSgVDmqfuWFow1lLI+hlAAlZxSvvUJdTViZEimq3dvt8S8Wtfknfp030jOVVXcTsa+3/koXtBSeZre8ABKV7/AJasdkcEYRgj4Xns6R4SEXW/cf4X8kD3lphmsNnI5l2VNtwWDFg/p/JDQEYLLFL1RlmXRi2h6qXxGad2hb9y5FGYcO/nXuYkAYANEqkB1rctKeFVM4urtgMh4i6zARyCogvLdNwmu/mSOKX2My0oCtuKi7xnmLQQ0Ugl2vgjLCHQfwhg1F0kZXkTDxZKog6G48JoTj1MhXa1wIpRTNDhO0qsODfqFiwz0ikSB5NmJmMSaYFHywLRsP4iyuPzI8Rv1weXzUbeskYNtvTputSxFRgSvCRDLQVnX0eYiVQquxeVl4NAuVlU1BVqxy67S0+pu7DF80OOFHINiQ4jnyT4dnZ7Q13qI2L49PxiDkr2Ypr9Tz5hKAjVC1XGviazlAN1Xu6HojFKJ4G5IpDG1eZaEfVApe/DsvSahzH5QbG8M/0GW6R1iF5QgeaI/dHbg7mEt9r/AKmdAdNIRlUT2RQIeUXJfwVBYNcod82/cztlmw/EWYMVtU7TFqKta/7LTgDqsA0XdUarhIqBsEqY5ms2uc/iDGcN/wC3FcCKWc5hQVKe8tcldB5ZSBs7YuK9j6gQ5eb6wG6suQZKtcbgM3KwHAQXgBjR1jlWANs5307RUygSsXo3L6BtQoPBxLAdSLQgpDH4luAF3yxEXEClOB2Z82wAjiHV/IrPxrmVsN7xCS6VVJ5D9Hh3iYGI8D5gNvcPIcxgLr+rAnN6ToS9eyObQht3yfNJ7lcUncGvXD2WGooNLsKI+HEUpj0QXwsybXAyexUsXEKN/SV6M9GV8GLbccrfaEAt8mAn8H7lkGcsvlMQ2naQPxEK3iIVwNbL9ShfUKtPyilkfprMCHlCdW1D1T939BOSr3/tinyH98ToVDOP7ZxYQ6O9jZ9+IEl4HEmJWChTdsY4zCHmculR6Sn56Sz/AGGPWiSmsL/d9zUVhB63U3aDs1LrQQqJvX8ZRWztggIL1qcDUptmnxjBe+vbmWmlAL1Z0eE7OI48YK/Kc/rxEFmUYoLCsWNIkcmhC2G7z+46UUBhBo9mIggSvgGy9WIY3sMrDs8AllYN4E3K/aDBcLZekrNOTvNBRD1MEIS2UMwAbpziNxdvQ4JbqHzlOSlOIoez4hRGRekoaFITJDOZXL/UqvEK0mzOo8TEpFA2PmUDaOaxQQY4ZfUXY87cH8mPJIpKKG7rcCmtbSPZT9y5oKhenHSJaSxyq7FDVFBdeYBUZGy8rgYzjLUK7dU2HuhLDvXMI4SUaSrE7Zm93iq1ZHVSrpERzLR0LVrvKOIk23Kyd4TosMHVg405FsbENcEqCTKES49VgyYSmja8QhDSRppCDuRYYOkNFHAInjMLUrhpQ4cJTfT+pfqsC+yxSzJoIrV3xR8QCqh5yh091o86OvR4YXC+OfD0TTMK7rq1K1AtzpTDxNzNBLN/lBtDxTkYKu17CasRrUErB6OIuf4qaiwQDohmJnIxkAVKu/qIzOSZ37beYV1rQtXBsh5GjTo0ZhgxFA6JnS0SIGPMtJBkblvbXxANkaWtl/io5qDqoEHuVjqjiUYS9q3ChGmekS6w4UN1ZeziDVRIRoapOpACnyzR6rh3Z6XLv9vfR6Mcldf4PLoNsbIv1LCpQPdQPtismAhpCeVtcGsFRwMTgLb3BJtX46416gXcVn5XSJUSDy2yopxuQw3Hr7S70c6cPWt1CrkHU1UrUbkCbs8XcCW6rYtEqy+hn4j5CByWMFU11Y3TDoSj2S0MTtAFrHPiItsAyntYWCB/1UL8xL8O9+HEtAkG1/QTJGADSboab674mC6MQtWZzzEeUpR1z78zDpc8g6x8GFdqKfxFI2kY0K/SvqPgqjZO7J0xnpuCLAes1p3KwyuhthnoD1f9lTi6j0GrvYPwzpkh9P6lF0IO4KRkysbLS+tnhnzFnIRbHrqT7md95pKVmnWNABK5wRYVoFLLCjL4i217crYhSIDgcP6jRssyg5ODbyHmImKHuG83/uYRI0YbXdBmaRIwOK/UV9RGZRyATCvatVDq6IQ/cC+7Bf0wFWfKQ+GpUn2D8QSVqiKu2v3HT7a+NxXWm6dRiS0bgFoxxn7H7mlhKqjuzXrPabiTFpPKv4IMmsAl6gr3paPqJ7vXH6YTNdCGCVtamWAcW/6oIBSnQ+fMoLSEM68eUxDmuGWoHRb81KOpVqjRu10QPlsYs6QyFeZU0InxXUdjzGhTLZu+kQFUA5ZZL3gDyOt+oYBdE4Xj8MuvJ0QiX6uCULqO7hHZEfXh+4OKeVq2X8HqXy40cniCfYdJbNgRnVMiexYPERih8Xac8NwQUaU8Ru3sEWawTRcVKu+l11lqo4xmDAsitgW0OmcxlgE2KXlKH1v1LPlx5hG6oeM2fT9RIen8czmLuCxqKgFE0jkho4RbP7QsgVEJTMbJ27tcYoafMbGMgBiYz57TFlxu6r6gBvxqnKjREwXf56kKSoKW/WRMMUNAvgIkoHsz6XMbCp4rmPaiDFR1dZUbOOkuD/jZquimw6Qa5KilVzsZx2H1Uz+jQCO91/MuWK5bawNKdt7YgVYDAv1DiicwFQR2hGgNn9FydOnjQONFRk2VLVuDqjpH4oF8t38RWnVjTNtSqwFe3PSfMQji5RCnNt9D/EDgtlWlg6LRKt3zhn0qF4plzvwBkdC6LjJeHIKvQITB3wh9a+51UFgfJZ9xaZK8VvwzAZQbof0P5Yy2Z5lsvEwcyvWJZjzEXuBXEO6CWRdRqLCqoUdwOd3f5iFxTKpS18BzFvaDj1S/cTD8CH0XE7R4z9xzQ3U3BravmK0xTWZvaxV4F9wE2nguJ3Dz4jCKa55FQSIGEwemwh2N1NGqMFc1AmHMUs06zXsgy7bJXPQLqIAgOxpFy5rzBw5/jIrJ3GmNSVaUo15AFvO5hUu9d4VEwc7VFkrHjjslxDkLfkmaKyNHQf77jABiOQACOHKtF2KPsp9MFALVrqnx99pQzRdzb06Lt7UTiNQWn8w5C7qSO8avG9wz9pfWXXb8ol6ebTh9kTqvuMIKuyWnDBZS4l3SDGPjMeh8ImNY0vCH8zMaegYjTffw3BMI9aqYM7j2/qNuYVf7jrACAXLYYdVqbqFDWKPtJUM6cXkX6R9wDAL6mfNGFhstfFg9xNSqW1eMsMaiCIljhHmXAK6mvD/crkHAp/7OGPaHphu7mYVm1ZPxMBzABaz1jdMVaKaZfrHuO9BA6CqnqvhhEm8XifyeyJKio27gp3afMAZQM5xkTyfSE47KmFYR1DSBToYsCvlIOx8bvzEBjMRwR7CoCtELSCDeJa0wZG/uLGLubZpWUL6g+TXUIcax2Jx38ZhS6cdo3zLDKky1+tl4CWV3/ai4s2zaflv7lghpt6/xMlgF7pFwI2b8w2qqvVbiUu7X7hLjO2Wkj2+33+0MKhkvg9EOVN3A+TmIPY75Nwmo+Ioek67S/afEKWEu9hZOBD6PMxcQk2ic19wSNBrYWeR8lFhqca4GqPFgHcmKjQo8tw+6P8F6gYNt9KIxA5pYlnWcr0Zeen1CrsgVljrGKpMbwq8ey41TjwEwALUILY8RBzxDR0O//sVtv2BKWMhdxVoUPuUtuUsLHdaiZsFYA26IaiN4bqPBFtNpNr/IXwih+X9SmzGIk2OywoEf4X+DCy25czq97p/QwS6tmgXj2KpMI52KxHvVAhbInMZErD9xCIHbSewfUyoRml5JD8DXcRvBa4AOIHgC5dxV9rmDSZNyw3Adnj9niONHAcEczzqut4hDdAPU3uGNMWURlFWyjde2ohbTKbadtn8Rq+DKrPV7XAG894AbGvEFoKme0HW4NS8cCIqjVDisR2lZOIfwtFdGWILZ8jmXExPoMvBH+EeIr+RjTGqDC81o5ZltOfFFv2PUuQ9YAFB1ox6mkjFHBgZYOK/xXES12XkBT/8AcIRBR7d6/wAQqJLFp6QkiHQY7fOf3EYkdLd3nHyREsLS3wZ/NS5ctjT+AK7mePJ4l9YMoH1WgiooLEJUMrrEfuFUI1en2QVMmPMMlEd8RDIPRcKFRZEYdQEccVH041a09pBbW6GH7hSwHpW34mL9tVGM17qBiG5pD5WM+DsB8Bf3KvJpqeyWEjI9CNO+x9neC9B/BjwnSxLVp+EvrUVsL4gtgLU4jOYk12nSvVeXtLGUqa1luoK66QHhr6hZ24jVqtf7iM7i6+Pn+42scBKdbFCsnworWxqKqHkb+JmmJVsOrf1MDArObF/kghne2Vct4RHy5/kWI/ZQBbdcExjXbs/R6nMjSqH1K3VnRESUp4uUd3d1OAF8ZlgQ456wphkeWKDSZ5GCAs9zIzl4lJKFEJzEDEF0qy+2z3K35jMO7o+S/UtA+zY/ZG1/qf2+iZJjxV0rxz7nATPR0s243jcWIREwiUkwgCBj+DSIS1RToIWFrAdFDo43LSsPHviIySqntz9TAZEm0VHlBfRGZ1cVsHUiH4GKju9zzJzBlNDD7iz7JiLxYHn/AFxZ3XbZ86mYJ6f+D8zNFtVXay5bGljl8jofficcgEa8yq0uAL/MKjs1Co0X3nMENZIuFCwdTtGBA7me0t/QIYrGLBFt5iW+oMM/EprUNYECOoyJews+HEaWy1QX0NR6TnIB99x5seT/AHNaPk/MW4rlvPMcXgqmB7IYIrgJ/T8xh0PJ8MROC3gfhiUCpTzxCyu7B8tSrpDVlUqi84ib7LvAgt6ap8yxASLVmQct/JMrdNgtgzcWLmrzHdIMwJbT4HxcKWbOUG7TCO0azXQxlIMg9Qee3OtwmhbKpRXqdPWukRAl4xPqAw+kGo2K9Mw+6hY9UZfgMEEnun2kAD4wFPANkeLtuV+47ufEzCbZphlqNUMY+osG/XQy2EKtt2jbSoXOvJLQJopcD9zHOFQWuyVFYXaUrsRQtXfEBap2NwTIFacRos1u6qDrLPaUCXLi4hnMKfxQFYWcxyVXa4dBxA24YrDMXCniCDbbR4a2V5l4KGEOvkxBAUsykwBlWtEGsLE0T0tBuU8OzKqiwvS0F8EO0hmbJItoNjLnjAbFstmb+rGMtWuhxFYBZZTRzeUNUOFT6mgQoVBaac3Z1htvVjgpyVQMEDgt0Kjow+XPeX+yABCs3qyuqe5RoADL5doVw7byBTV9WAN3MD9h4gDQjjR5hfR6A0xCwBkVdy6MnRi2KCNowOdIIkWiZ/MQECoozbAoAVSpaQ7A8muXR5mQarF32X0Ij9tqmAatWwMt3Yh5Qx1gXMInQXDMqViGDvFONxLqoXVO4FsF+YO8/iI8MB3+UMX0gF5SM7BoAvW2ObiIOtfL6hBm6GybxzKlrYL6So5kIibbeI6c9GLEBW6talc7ppgKTVGzZlStd16HQXYDFFs9IwRJK0oDtWA9xg0oPRYhcOrYK6LgzBTai4INZ0/iFmRQlR3BiE0QlAtBjPZ5rDK1YA8chNO9/EYpUVYZmHbJwwQ6oIpRpxbmWUiqlLussIUi8M1X5ZmM4AWp4Ayyiqcf0j9zugQYELguAFqHmABQEIhsHmELILXt7wlx7SnLEVjUoG4qVLKgTfQ+puwtFnprcHeoKehlykZhLOxeAF3XK6IuF0iodKOxxdwchAPqOyFx2AESrS8asU5+IqOMZvnK1uYrilheOhRVGpx4jUHYOxzd3zB9MFFpfOzrlfO44QgROv56Lu1FrJL+xQjeKxTeq76gG6loM2iVUC8pKBQVf+jW5gT94I4LpXiFk7RqOt4Ppihqcc3lW7XuxpAur0fczYhQofLk7MXEYS89BzHcyTcLvmsRgov2lBdq83FGdXC4uwACnhY2cX7gMQzZx7YiWgBo8Ggi0HKRUnd0/wC1FwCWqydplRgF2m8Qicrp3WHLE90xmLrzOtDpMCjUXrK8ZekbqsIUemT9QfKWigd2D1Y/C7E+gwTgRGtJegpLcSE/k2oQeUzXmUnMdAlDAvTXmKChKCMdLBjxGsWAHNWp5uXvNKgMaLcnXpDbURui5I0i7q4XEjsQC1Agu8mi8y+UG8zCzSWJwccwYhp5gsT8r1L8PNedQFZur3y1MkHVca0Ly68XF6xPEgoJ3XfmFqgFGxnQqjPTUAiAGYGs0Z8nuEhFkkdRWcF5ui2FWQDqjRgo+HOo1hJfhQp6l6yQpUGl7xS/YT8hLNQbD3JwwO9Bytvj7hFZ83T+QYcOmoFawJnr4ltBEUqOOLhS4K6Z4mUDk0FulvmYETVdLtmV8VADZqvqKaMYHKANWh81EY4C6wXfiVC99mpeBF4DmY7H23Nso3nDcEDG6Mxrrd3frmoKOgADQb7A95YtqVAlSpUJQwbRDjkD2g1Qpdizbhbz4iu+7LP3aPzdiO0NDxU8ZlLv0J+7hIUyC38RLFiqFV3aLjmMtOk5bWr7jwNKoFu+DXqaaoBK9BqHkI8wFpFxYRWNct30lsrU2u1hC0KxfeBuMNgGhenaKFAnfUuplVhIz87lFDorhYqlZDOdS3hiwaOWNc0b6xP5OGu4avtLe1eUH4gCmA2QbBaoJ1uLDxABe6MsBI20/QlZUMya/N1OrlgY+rgataqo9DDr8SNvkxhNZgWPQXBAqDbpZcQCDfs59RFsKwBrO/WoEctYbqmhOwj9SxjC4TqA8dMeWWwmjA3deIQmOi9IyRV5YDUjUJ5y5lUHbG5R+4C+oIlA7S7zAggwZeZZzEG4qslTI4nbTcVwx5iUcb3Kba8xCseMiP8AwFhAe/QQHQJzfiVTGW6lniE0Rz40BV1YSmaA5N5hQ4NtNmggZyk43G27+XDKcpTpVQgKLFBDA0ehmF2LDVcJGx0r1HHpUqB4Bz2JaTihr0Cv6JXQ6gJReqAmA2jJrgV8d42rcKAnB353HrY8rmCCp1LFOXQvLFhz1yfBEQeicH1EYiQLDtmg+XMFbkhbZe4pQmhDOGzqmP8AYgAUS4sKr+L/AIOpXxG95IdEXN9YJcRvlixu4UumodP4iqS34l8hd6uFqg1vnrBW0/MvUUZTEWDf0juGzhNQ3QeTiGa6lsQ6LPnvCwFjP2JvxArMyFsdfwmvYgBd3ldHcq4oV95vI7mWguICQFiUWjl1KTWCu0qY2uz9QHA7xaeOkvytvNwFFF6UdS+SnSBs+ML5lbbXlnV5844h6KHi+u4ABvYHL5iNgiFsyiseSLi4BGokN3HvEVznpEALpfFwTJfbAuWPe6zsKh3HpiAzcW2n3M9WA8xjiUrXmFVOH5i4aV9xBauP2UGmrI2Zg5YM8kogsYorULxZZNrecG4bDrCpLVWM4eMZl/X5N3kQzdEqW0jF4HEVvwreDodCCOAy1XmEGpbeSNRDI9jUGhsuON3bpX7mQDFtdIgihKyCOezDtVIF1eb4JRg1jA85iAKEbWn3/vyCjTtvvfb98Sh5hgOn/v8Atk84CLa6UDeK1CpE4Xh9R8sP4eJbMDu5iEyPMR6YmuW/E4Au6oIl7V2lJg45gCbAdiFdzuzqluDLBuXEBYjAejLtFWi+0RAuUwRRnHaOjcVNcnEV2GlbSbYicBkwWzv7lHsVKDAYZu8W+I/esQKFcAN6q8PSDkWy2DuvKyy7gHBg4hm68yqLXHWHo+xp8zBLsIF5SrVirhjiU1dYiAjVFZbjdo0YS8j17/8AYVhToW7cY41WqOvEeCoXnN/PMFjKubt/ukbAzugy+vHXxCKJdVHWPXPXpG1zCht+ZZSQAHRXBWbUrw9oUsq3G4Cu9D27jl4l3ktR1CkOZXqX5hyp44llbtziCC1JnGdUq8Ee8vRqEKADtiVElfxQsquqy91dbDnxBoVHQp+SX2c3AnvrLMwhkCjruHFh0SqyZMvF1M6KrYoow/PuLAtECpkArrHs4W2CsHVm8dot11iUL6VBqwcrGDldJBc4+n4hV1eBppf1AWWDhLPl57O8RvTNNvVFUAbgs19XFy4RoK7XVdSBoIw1hy7+9xKFbNagDaIEpz+usygPDWXdzKQpVC0t9DxLngGwcvmuuIgiVnYL4H5cPECw22BVYQeqzpkvSy0QBvjTKt4Rm8mNWwi4It6VZXSrhXAFWarqU7xs0U2vMWABZvL8xYbyxrZrgOlRnJ8ukdHHpOt8qEWFI7oEMQxCU9IjYqr+YDKtnNx4MkoMK6xtHmadG88PbVTMJstrdkEYhaxngDfqMtx2xHlh32uGghqll8VVKzS2f1FdPNxrhXvKm4IvF7XtFvgWFZtz8Z69ZezsD1x33xWIjW8iJkwIG1tPuEXmgLSGbaePz9qCUKggCmejeoccL5BBbm6Dp0NQVGAMKQNVejJrGdcoyyJQRQd9KMX26ZLW/YoMaAcdf+R/cOwm7Kc+kH870apqYOdYLe3uoTa0ueLwcHDUtRkKMLbssYPnywPaGSmKwbcoNHJ6jCNdYsVmiqz7HiAcmDC9LSrLrZyeIII4Eia4LY6ZqV2jpEvKKzfNdDDqKZlC6NxnCO7iWYR3nDzpCty6VKVv1MIi1Bv/AJLcS/N8z2oupRQnp+IXCO6oyxbXR0jQGX1GCjAdIuw2LIQ8S/ML6qaBH5hu6Hbv6jXCqqdAlvLtKTLFCIaX2QMgSkCh1pF36gUAy6R36r3YKAGtsF9YuY4LaOgcSo+V6MzGVB5cs5hOP+GXJLcKhQ2jIN+enP1KBqAqlA2CZM+N0ho+FAEryAcsmXbcDswxTwZ6AcHs6MtzhcDulxne+2pRAFdeloMbuitV0hkpfiG1pgRxT9TLwlIUV5tmqLvNdlqIR7tIPC855HPaAqiUJUVisVbVVp6o49iheI4qwsLvih1CZcybWcC8Y8nmLGBFXgFjpVYuvyRiWQCmbVLc4xS8ajaDG/FEZGO2OrS3YkATRfpWhuyniABhQi6bYGR5q/mXILXWAFUDt/G16gnQcy0oV2CPcV5oY9BYYq8MpoSjNLH1LvhgP7lskK9IBt0o5HG4o7JsVejBb8zJ3WnAXCuAe2oK5JQC71s7MMQr0VAXJiK4PU24uJe1wFxbi+4MFD33Ee+wZZh1ByxBavk1PcWgFqi1zT1+t5jQGRbLp3fvxn4WAvU0ui63pxAPJsIea0G2mjzbMus0ULMC1he9X8xfRMqQWKF1ru1l6sAlJU2g6KqvP4hGpi+yHUZukst6xNI1hz3gGX+PA6yDWGbLzrIm151VSqXDNVcuX7po3BYFGRLt6f8AG8YG7MAAVo04BVB7qziswMsL1uzKywatxdYTcq1iQBUC7L92Xz5lOMdB4/57zElXycC24N58ZhGjyHPr+JQjKqKKXoxob/FwcS/4TECpQtFL0FwpDiKabHc5JiEXt4jqhqobmaDl8EcSLKyLsHj85jbku8C7mr8RKyi12uq8soiy9sS8xRNEH8IW4eU5jADINDcTp76i/wDk5g7QF9zBv5SBUrGDQ8ob8H/JYHiKFcYN1s9CMqIuiq9w0+YGXhXEVttW9YUF1nksquhm5QoANrdn1n6uBYiCnN5p09rEz3zHFORwJvLd3d55clNDBGWR6AO+Ocd91FDJZbgxda0arjxiKXutrS4WvGjBVIczDBC1gGQN9Kc4XllZLC8BQHDpHqI2Vi4YgbYKmVC3lAX22y/ruWCmzyBlkKK63MswukPN3W7x363FtiDlYNFOKxrGd3BX7RQMNVZ37V2jdWxkSj8fUQHFKtBZvMuEuXW4BZ1yMo5v+DOhXMw4PVxdRfDmhQXoOIoCrFt7VAXKwKWea68X5lLtyw2NNXAscYuCCTXBEHIHmIYT1csTWvcUQHGfbUO0FwDawA8LnN8Qee2CoCZhy5YXV00YuooVoUX8I7KSFKhd4QN40pslEWBcsC0wJpHRxrJEg015ou/KZqD28uw9G14jsQqRWvdUpoMql31m+JUyM3kesaKhIzNj4ZtrddPdFjqF4ZarJpAsevKXUVUcUQEUbKrpdK5DiYDi+VlDaXoQt7XmEadRCORQcFdzjTjh25lKqWjaQdYyXSRiVhKKxXUAJYGEGy2VT8ygKWFFoYOIdYoaGaArbCizQKL4jKkrob7XOd8kqk2DFO2W5bIrBg9WaELxLGNDPWGKl5PiIdYgAsW07rL0JhuCkZujr8XFGjsnt2/jtBGn4IhW2GBeV0e2Ic/TxPmYGHtt+YNpnltNQX3aPiUYjsQQNgbYDlnWzVaHjcybTpje9sWoHyqF1SO+ddC6xKSiCtJUD3SrRtC6NgNohS5GDrAJWGhW1L5oli/0th2xrwfMIEKgYDpMVRh0qKFDLDbd+qlokIWNFBY5Dt2zEDwSUFNIuNoLybl6VbttLazjQ17janV0yB168YzAVjWyAavBo56bjARovHd/xDV6h1eStVqI3cHul3cJs04sVXzLUWoIzQeagMeDrKoCMQ0RxMglwqDCgOhDLk4JQD7AdYiKira5ZVniW+pUzCXEBQ5loZ5yqO06dOI8kp4XEAUCjofwRhxZbtFIPuln4rrMHtKLPyxiXUF3yfG4m6SYFq8XBgEaWoBebGBmCmRFUltX+/Kw2Yq3pBVe/UE1lGZgMFu2jrCAKnVbdzIG/TBPzLgW9wynl3MIxuzhjfPPWAsIVhFKesGyQOhztpemIzGAo0pbYW94FtEDLvNZh2PNnLVzqyS8RAMdTGg5HHK4yrVtmZZvCuJSIAdl7n//2Q==',
        'data:image/jpeg;base64,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'
    ];
    /* ★ v2.6.0 的 mfApplyWallDefault()（把随机图写进 CSS 变量 --mf-wall-default-img，
       靠 .mf-nopic 的 background-image 显示）已删除。
       原因：那个方案的判据是错的（见 mfMarkWall 里的注释），
       而且「每个位置各自随机」用 CSS 变量做不到 —— 变量是全局一份，
       所有卡必然是同一张。v2.7.0 改成直接换 <img> 的 src，每个节点独立随机。 */

    /* ── v2.7.0 · 全局默认头像替换（酒馆 ai4.png → 主人的两张图）──

       【用户口径 2026-11-22 19:3x 原话】
       「默认图不是这样的，默认图是我新建了角色卡，我没有往里面加图片，
         但是酒馆那个里面有图片，它会把那个图片改成那个女子的，但是我不要这样子，
         我就是如果他没加图片的话，就是我的那些默认图，而不是说加载失败的时候才出现。
         就把酒馆那个默认的图片改成现在我给你的这两个。」
       → 三个选择：全局全换 / 每个位置各自随机 / 用户头像也一起换。

       【★ 根因（实测 + 源码双重确认，不是猜的）】
       ★ 这个客户端（TauriTavern，Rust 封装的 ST）新建角色卡时，
         把**客户端自带的 `default_Seraphina.png`（粉发少女）烤进了角色卡 PNG**。
         证据链：
         ① 主人 19:33 新建的卡「快乐；‘.png」，PNG 内嵌 ccv3 元数据里
            {"avatar":"none", ...} —— 确实没上传过图。
         ② 本地哈希比对：该卡内嵌图 == 客户端
            %LOCALAPPDATA%/TauriTavern/default/content/default_Seraphina.png
            （240×360，粉发少女），md5 前 12 位都是 3e1646772025。
            12 张卡的内嵌图都是它。
         ③ 服务端 `characters.js:1038`：
              if (!request.file) {
                  await writeCharacterData(DEFAULT_AVATAR_PATH, char, ...);
              }
            —— 没上传文件时，用默认头像路径当图片源写进 PNG。
            （上游 ST 的 DEFAULT_AVATAR_PATH 是 public/img/ai4.png，
              但这个客户端实际烤的是自己的 default_Seraphina.png。）

       【★ v2.6.0 为什么没生效】
       当时判据是「img 有没有 src」→ 默认图当然有 src → 被判成「这卡有头像」→
       默认图一直没上场。**判据选错了对象**：该问的是「这张图的内容是不是酒馆默认图」，
       而不是「这图存不存在」。

       【本模块怎么做】
       不去改 avatar 字段（那是酒馆的数据），不去动磁盘上的角色卡 PNG
       （主人选的「只改显示，不动原文件」），也不去改 default_avatar 常量
       （在 ES module 作用域里，改不到）。
       → **只改 DOM**：把 <img> 的 src 换成我们的 base64。

       ★ 换的是 <img> 的 src 属性本身，不是 CSS 背景 ——
         因为原生会读 img 的 src 做逻辑（script.js:12229 点击放大头像）。
         原生那行已经支持 data URL：
           const avatarSrc = (isDataURL(thumbURL) || /^\/?img\/(?:.+)/.test(thumbURL))
             ? thumbURL : charsPath + targetAvatarImg;
         → 换成 base64 data URI 后，放大头像照样能显示我们的图。

       ★ 什么时候扫：
         酒馆是动态渲染的（切对话、翻页、重建角色墙都会重新塞 src），
         所以 MutationObserver 盯着 img 的 src 属性变化 + 定时兜底巡检。 */

    /* ── 判据：按「图像字节指纹」识别酒馆的默认头像 ──

       【★ 为什么不能用文件名 / metadata 字段判定 —— 实测全部走不通】
       ① 文件名：客户端的默认图不叫 ai4.png。实测前端 img/ai4.png 是
          **紫色问号剪影**（512×768），而角色卡里烤的是**粉发少女**
          （240×360）—— 两者根本不是同一张图。
       ② metadata 的 avatar 字段：服务端 `characters.js:413` 有
          `jsonObject.avatar = item;` —— **服务端用文件名覆盖了元数据里的 'none'**。
          所以前端 `characters[].avatar` 永远是「快乐；‘.png」这种文件名，
          永远拿不到 'none'，判定不了。
       ③ 像素比对（canvas）：要跨域取图，canvas 会被污染，getImageData 直接抛错。

       【★ 唯一稳的判据：字节指纹】
       浏览器能同源 fetch 图片字节（本客户端 origin 是 http://tauri.localhost，
       服务端把 /characters/ 与 /thumbnail/ 都开在同源下，实测 fetch 全部 200）。
       → fetch 图片 → 取「总字节长度 + 按固定步长抽样的字节和」当指纹。
       ★ 不用 canvas，不用 decode，几十 KB 的图 fetch 一次就够。
       ★ 为什么「长度 + 采样和」就够判同图：
         同一张 PNG 的字节流是确定性的（同样的压缩参数 → 同样的字节），
         实测 12 张「粉发少女」的卡：长度全 = 8800、采样和全 = 1415，
         而 4 张真头像分别是 10934 / 7017 / 4803 / 4976 —— 完全分得开。

       【★★ 基准必须跟被判定对象走同一条渲染管线】
       踩过的坑：基准直接取 `/characters/default_Seraphina.png`（原图 69296 字节），
       而卡片显示用的是 `/thumbnail?type=avatar&file=xxx.png`（缩略图 8800 字节）
       —— **两个字节流根本不是一回事**，比长度永远对不上。
       → 基准也走 /thumbnail 接口：`/thumbnail?type=avatar&file=default_Seraphina.png`
         同一套缩放 + 编码参数，出来的字节才可比。
       （default_Seraphina.png 本身就在 characters 目录里，是客户端自带的默认角色卡，
         它也显示在角色墙上，所以这个路径一定取得到。）

       【★ 主人 2026-11-22 19:5x 的选择】
       「按图像内容：图是粉发少女就换」+「只改显示，不动原文件」
       → 所以：只换 <img> 的 src，磁盘上的角色卡 PNG 一个字节都不动。 */

    /* ★ 独立存在的酒馆默认图（不烤进任何文件，src 就是它本身）
       → 这几个用文件名判就够了，很可靠。
       注意：ai4.png / user-default.png / five.png 是**前端静态资源**，
       客户端打包在 exe 里，实测 img/ai4.png = 紫色问号剪影。 */
    var MF_TAVERN_DEFAULT_AVATAR_FILES = ['ai4.png', 'user-default.png', 'five.png'];

    /* 基准图（烤进角色卡的默认图）的候选路径。
       ★ 第一个必须是 /thumbnail 管线（跟卡片显示同一套字节）。
       ★ 只放 default_Seraphina —— 主人 2026-11-22 的判据是
         「图是粉发少女就换」，粉发少女 = default_Seraphina.png。
         default_Assistant.png（客户端自带助手卡）内容不是粉发少女，
         按内容判据**不纳入**，避免把自带角色卡的正经头像也刷掉。 */
    var MF_TAVERN_BASE_AVATAR_PATHS = [
        '/thumbnail?type=avatar&file=default_Seraphina.png'
    ];

    /* ★ 用户（persona）默认头像的基准 —— 走 /thumbnail 同管线。
       为什么 persona 要单独一条：
       用户槽位当前渲染的是 `/thumbnail?type=persona&file=1788261080182-.png`
       —— 文件名是上传时的时间戳，**不叫 user-default.png**，
       字节也和 `user-default.png` 的缩略图差几个字节（2756 vs 2762），
       所以「文件名判据」和「字节指纹」都判不出来。
       但它俩的像素内容是同一张灰色问号剪影（16x16 采样平均绝对差 0.031），
       → persona 只能用**像素签名**判。 */
    var MF_TAVERN_BASE_PERSONA_PATH = '/thumbnail?type=persona&file=user-default.png';

    /* 指纹缓存：url → {len, sum} 或 null（取不到） */
    var MF_FP_CACHE = {};
    /* 基准指纹（数组，可能多条） */
    var MF_BASE_FPS = [];
    var MF_BASE_FP_READY = false;
    /* persona 像素签名（16x16 RGB 拉平），null = 取不到 */
    var MF_PERSONA_SIG = null;
    var MF_PERSONA_SIG_READY = false;

    /* 算一张图的字节指纹（不需要 canvas） */
    function mfByteFingerprint(url) {
        if (!url) return Promise.resolve(null);
        if (url.slice(0, 5).toLowerCase() === 'data:') return Promise.resolve(null);
        if (Object.prototype.hasOwnProperty.call(MF_FP_CACHE, url)) {
            return Promise.resolve(MF_FP_CACHE[url]);
        }
        return fetch(url, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var u8 = new Uint8Array(buf);
            /* 步长 1013 是质数且跟 PNG 的扫描线长度不同步，避免采样落在固定周期上 */
            var sum = 0;
            for (var i = 0; i < u8.length; i += 1013) sum = (sum + u8[i]) >>> 0;
            var fp = { len: u8.length, sum: sum };
            MF_FP_CACHE[url] = fp;
            return fp;
        }).catch(function () {
            MF_FP_CACHE[url] = null;
            return null;
        });
    }

    /* 取基准指纹（只取一次）—— 支持多条候选路径依次 fallback */
    function mfEnsureBaseFingerprint() {
        if (MF_BASE_FP_READY) return Promise.resolve(MF_BASE_FPS);
        var i = 0;
        function next() {
            if (i >= MF_TAVERN_BASE_AVATAR_PATHS.length) {
                MF_BASE_FP_READY = true;
                return Promise.resolve(MF_BASE_FPS);
            }
            var p = MF_TAVERN_BASE_AVATAR_PATHS[i++];
            return mfByteFingerprint(p).then(function (fp) {
                if (fp) {
                    MF_BASE_FPS.push(fp);
                    MF_BASE_FP_READY = true;
                    return MF_BASE_FPS;
                }
                return next();
            });
        }
        return next();
    }

    /* 两个指纹是否指向同一张图 */
    function mfSameImage(a, b) {
        if (!a || !b) return false;
        return a.len === b.len && a.sum === b.sum;
    }

    /* 指纹是否命中「基准集合」中的任意一条 */
    function mfHitBase(fp) {
        if (!fp) return false;
        for (var i = 0; i < MF_BASE_FPS.length; i++) {
            if (mfSameImage(MF_BASE_FPS[i], fp)) return true;
        }
        return false;
    }

    /* src 的文件名（去掉 query / hash，取最后一段） */
    function mfSrcFileName(src) {
        if (!src) return '';
        var clean = String(src).split('?')[0].split('#')[0];
        var parts = clean.split('/');
        return parts[parts.length - 1];
    }

    /* ── persona（用户自己）头像的像素签名判据 ──
       【为什么 persona 必须走像素而不能走字节】
         用户槽位渲染的是 `/thumbnail?type=persona&file=1788261080182-.png`
         —— 文件名是上传时的时间戳，不叫 user-default.png；
         字节也和 `user-default.png` 的缩略图差几个字节（2756 vs 2762，
         同一张图但缩放/编码参数不同）。
         所以文件名判据、字节指纹判据**都判不出来**。
       【像素签名怎么算】
         缩到 16x16 画到 canvas，逐像素取 RGB 拉平成 768 个数。
         实测：`user-default.png` 的缩略图 vs 用户槽位当前那张，
         16x16 平均绝对差 = 0.031（几乎逐像素相同）；
         而跟真人头像（1788261080182-.png 原图 avg=[51,51,51] 但内容不同）
         差到几十上百。阈值取 8 完全够用。

       【跨域问题】
         之前踩过：canvas 会被跨域图污染导致 getImageData 抛错。
         但 persona 的图来自**同源**的 /thumbnail 接口 → 不污染。
         实在拿不到就返回 null，判定跳过（不误伤）。 */
    var MF_PIX_CACHE = {};

    function mfPixelSignature(url) {
        if (!url) return Promise.resolve(null);
        if (url.slice(0, 5).toLowerCase() === 'data:') return Promise.resolve(null);
        if (Object.prototype.hasOwnProperty.call(MF_PIX_CACHE, url)) {
            return Promise.resolve(MF_PIX_CACHE[url]);
        }
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                try {
                    var cv = document.createElement('canvas');
                    cv.width = 16; cv.height = 16;
                    var ctx = cv.getContext('2d');
                    ctx.drawImage(img, 0, 0, 16, 16);
                    var d = ctx.getImageData(0, 0, 16, 16).data;
                    var sig = [];
                    for (var i = 0; i < d.length; i += 4) {
                        sig.push(d[i], d[i + 1], d[i + 2]);
                    }
                    MF_PIX_CACHE[url] = sig;
                    resolve(sig);
                } catch (e) {
                    MF_PIX_CACHE[url] = null;
                    resolve(null);
                }
            };
            img.onerror = function () {
                MF_PIX_CACHE[url] = null;
                resolve(null);
            };
            img.src = url;
        });
    }

    /* 两个像素签名的平均绝对差 */
    function mfPixelDistance(a, b) {
        if (!a || !b || a.length !== b.length) return Infinity;
        var s = 0;
        for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
        return s / a.length;
    }

    /* 取 persona 基准像素签名（只取一次） */
    function mfEnsurePersonaSignature() {
        if (MF_PERSONA_SIG_READY) return Promise.resolve(MF_PERSONA_SIG);
        return mfPixelSignature(MF_TAVERN_BASE_PERSONA_PATH).then(function (sig) {
            MF_PERSONA_SIG = sig;
            MF_PERSONA_SIG_READY = true;
            return sig;
        });
    }

    /* 随机取一张默认图（每个位置各自随机 → 主人选的） */
    function mfRandomDefaultImg() {
        if (!MF_WALL_DEFAULT_IMGS || !MF_WALL_DEFAULT_IMGS.length) return '';
        return MF_WALL_DEFAULT_IMGS[Math.floor(Math.random() * MF_WALL_DEFAULT_IMGS.length)];
    }

    /* 已判定过的 img → 结果缓存（避免重复 fetch） */
    var MF_VERDICT = new WeakMap();

    /* 真正执行替换 */
    function mfApplyDefaultImg(img) {
        var pick = mfRandomDefaultImg();
        if (!pick) return false;
        try {
            img.setAttribute('src', pick);
            img.setAttribute('data-mf-default-avatar', '1');
            return true;
        } catch (e) { return false; }
    }

    /* 判定并替换单个 <img>（异步：要先 fetch 拿指纹） */
    function mfSwapDefaultAvatar(img) {
        if (!img || img.tagName !== 'IMG') return false;
        var src = img.getAttribute('src');
        if (!src) return false;
        if (src.slice(0, 5).toLowerCase() === 'data:') return false;

        /* 已经换过的就别再管了（每张图只随机一次，否则像在抽卡） */
        if (img.getAttribute('data-mf-default-avatar')) return false;

        var verdict = MF_VERDICT.get(img);
        if (verdict !== undefined) return false;

        /* ── 判据 A：文件名命中「独立存在的酒馆默认图」 ──
           这些是前端静态资源，src 就是它本身，文件名判最可靠，不用 fetch。 */
        var fname = mfSrcFileName(src);
        if (MF_TAVERN_DEFAULT_AVATAR_FILES.indexOf(fname) >= 0) {
            MF_VERDICT.set(img, true);
            return mfApplyDefaultImg(img);
        }

        /* ── 判据 B：persona（用户自己）头像的像素签名 ──
           只对 type=persona 的 URL 走这条 —— 角色卡那条路用字节指纹更快更准。 */
        var isPersona = /[?&]type=persona\b/i.test(src) || /persona/i.test(fname);
        if (isPersona) {
            return mfEnsurePersonaSignature().then(function (base) {
                if (!base) { MF_VERDICT.set(img, false); return false; }
                return mfPixelSignature(src).then(function (sig) {
                    if (!sig) { MF_VERDICT.set(img, false); return false; }
                    var same = mfPixelDistance(base, sig) <= 8;
                    MF_VERDICT.set(img, same);
                    if (!same) return false;
                    return mfApplyDefaultImg(img);
                });
            }).catch(function () { return false; });
        }

        /* ── 判据 C：字节指纹 == 基准（烤进角色卡的默认图） ──
           ★ 不排除基准自身 URL：
             default_Seraphina.png 这张卡也在角色墙上，它显示的就是粉发少女，
             主人的判据是「图是粉发少女就换」→ 它也该换。
             （基准指纹是提前 fetch 存下来的，跟 DOM 里这张 img 无关，
               换掉 img.src 不会影响基准本身，所以不会自循环。） */
        return mfEnsureBaseFingerprint().then(function (bases) {
            if (!bases || !bases.length) { MF_VERDICT.set(img, false); return false; }
            return mfByteFingerprint(src).then(function (fp) {
                if (!fp) { MF_VERDICT.set(img, false); return false; }
                var same = mfHitBase(fp);
                MF_VERDICT.set(img, same);
                if (!same) return false;
                return mfApplyDefaultImg(img);
            });
        }).catch(function () { return false; });
    }

    /* 扫一个根节点下的所有 <img> */
    function mfSwapDefaultsIn(root) {
        if (!root) return 0;
        var n = 0;
        if (root.tagName === 'IMG') { if (mfSwapDefaultAvatar(root)) n++; }
        if (!root.querySelectorAll) return n;
        var list = root.querySelectorAll('img');
        for (var i = 0; i < list.length; i++) {
            if (mfSwapDefaultAvatar(list[i])) n++;
        }
        return n;
    }

    var MF_DEFAULT_AVATAR_OBS = null;
    var MF_DEFAULT_AVATAR_TIMER = null;

    function initDefaultAvatarReplace() {
        if (MF_DEFAULT_AVATAR_OBS) return;

        /* 1. 先把基准指纹拉下来，再扫已有的 */
        mfEnsureBaseFingerprint().then(function () {
            mfSwapDefaultsIn(document.body);
        });

        /* 2. 盯着 src 属性变化 + 新节点插入。
           ★ 用 attributeFilter 只看 src，别的不看 —— 否则节点一多回调就爆。
           ★ childList 也看：酒馆重建角色墙时是整块 innerHTML 重绘，
             那一刻新 img 的 src 才被设上。 */
        try {
            MF_DEFAULT_AVATAR_OBS = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var m = muts[i];
                    if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG') {
                        mfSwapDefaultAvatar(m.target);
                    } else if (m.type === 'childList' && m.addedNodes) {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var nd = m.addedNodes[j];
                            if (nd && nd.nodeType === 1) mfSwapDefaultsIn(nd);
                        }
                    }
                }
            });
            MF_DEFAULT_AVATAR_OBS.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
        } catch (e) { }

        /* 3. 定时兜底：酒馆有些地方是直接改 DOM 属性但不触发 MutationObserver
           的极端情况（很少见），3s 巡检一次，只处理还没判定的。
           ★ 判定是异步的（要 fetch 拿指纹），mfSwapDefaultAvatar 内部用
             WeakMap 记判定结果，重复调用不会重复 fetch。 */
        if (!MF_DEFAULT_AVATAR_TIMER) {
            MF_DEFAULT_AVATAR_TIMER = setInterval(function () {
                if (!document.body) return;
                var list = document.querySelectorAll('img');
                for (var i = 0; i < list.length; i++) {
                    var im = list[i];
                    /* 已经换过的跳过 —— 保证「每张图只随机一次」，
                       否则巡检会不停换，图片一直在跳（主人会以为在抽卡）。 */
                    if (im.getAttribute('data-mf-default-avatar')) continue;
                    /* 已经判定过「不是默认图」的也跳过 —— 省掉重复 fetch */
                    if (MF_VERDICT.has(im)) continue;
                    mfSwapDefaultAvatar(im);
                }
            }, 3000);
        }
    }

    /* ── 顶部工具栏折叠（v2.3.1） ──
       【用户口径 2026-11-13 22:2x】
       「上面的按钮还是有啊。你上面不要堆那么多，不然手机界面会很别扭，
         你都把那些按钮给换个样式。那你就把它先隐藏，或者把它们折叠收到一块儿」
       → 默认只留一行：搜索框 + ⋯。四批全收进 ⋯ 里。

       【为什么塞进 #form_character_search_form】
       那个 div 原生就是 display:flex（style.css:3204），append 一个按钮
       天然就排成一行，不用绝对定位、不用算 top。放 #charListFixedTop 里
       就得自己算偏移，字号一变就飘。

       【幂等】
       面板重开时 #charListFixedTop 里的东西不一定重建，所以每次都先查
       有没有 #mf-tools-toggle，有就只同步 class，不重复插。 */
    function mfEnsureTools() {
        var block = document.getElementById('rm_characters_block');
        var form = document.getElementById('form_character_search_form');
        if (!block || !form) return;

        block.classList.add('mf-tools');

        /* ── 常显的「＋ 新建角色卡」（v2.5.0 新增） ──
           【为什么不能再只藏在 ⋯ 里】
             原生新建按钮 #rm_button_create 一直都在，但收起态整条
             #rm_button_bar 被 CSS 藏掉了：
               #rm_characters_block.mf-tools:not(.mf-tools-open) #rm_button_bar
                 { display: none !important; }
             结果角色墙上只看到卡片，没有「新建」的入口 —— 找起来太费劲
             （用户 2026-11-22 原话：「角色卡那个界面是有卡片，但是没有
               新建角色卡的那种选项」）。
           【点它走原生 #rm_button_create 的 click】
             原生处理器是：selected_button = 'create'; select_rm_create();
             面板本身是 display:none 也能触发 click，所以不必把它显示出来，
             也不用自己重建新建表单（重建 = 要处理头像/预设/导入等一堆分支）。
           【幂等】
             面板重开时 #charListFixedTop 里的东西不一定重建，
             所以每次都先查有没有 #mf-char-new，有就跳过。 */
        if (!form.querySelector('#mf-char-new')) {
            var nb = document.createElement('button');
            nb.id = 'mf-char-new';
            nb.type = 'button';
            nb.className = 'mf-newchar';
            nb.title = '新建角色卡';
            nb.setAttribute('aria-label', '新建角色卡');
            nb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
                + ' stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'
                + '<path d="M12 5v14M5 12h14"/></svg><span>新建</span>';
            nb.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var native = document.getElementById('rm_button_create');
                if (native) native.click();
                else alert('没找到原生新建按钮');
            });
            /* 排在 ⋯ 前面 → 一行是 [搜索框][＋ 新建][⋯] */
            var tgl = form.querySelector('#mf-tools-toggle');
            if (tgl) form.insertBefore(nb, tgl);
            else form.appendChild(nb);
        }

        if (form.querySelector('#mf-tools-toggle')) return;

        var btn = document.createElement('button');
        btn.id = 'mf-tools-toggle';
        btn.type = 'button';
        btn.title = '更多工具';
        btn.setAttribute('aria-label', '更多工具');
        btn.setAttribute('aria-expanded', 'false');
        /* 收起态三个点「⋯」，展开态换成「×」。
           两个 svg 用 CSS 切 display，比旋转三条横线明确得多
           （旋转 90° 出来是竖三点，用户看不出这是"关掉"）。 */
        btn.innerHTML = '<svg class="mf-ico-more" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
            + '<circle cx="5.2" cy="12" r="1.85"/><circle cx="12" cy="12" r="1.85"/><circle cx="18.8" cy="12" r="1.85"/></svg>'
            + '<svg class="mf-ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
            + ' stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

        btn.addEventListener('click', function (e) {
            /* 别让点击冒到 form / 外面的委托上去（有些扩展会在 form 上挂 input 处理） */
            e.preventDefault();
            e.stopPropagation();
            var open = block.classList.toggle('mf-tools-open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.title = open ? '收起工具' : '更多工具';
        });

        form.appendChild(btn);
    }

    function initCharWall() {
        var tries = 0;
        var block = null;
        var mo = null;

        function attach() {
            /* 顶部折叠跟角色墙用同一个巡检节奏：面板重开、抽屉重建都能跟上。
               它不依赖 mfMarkWall 的成功与否（认不出结构也能先把顶栏收好）。 */
            mfEnsureTools();

            var b = document.querySelector('#rm_print_characters_block');
            if (!b) return false;
            if (b === block && mo) { mfMarkWall(b); mfEnsureNewCard(b); return true; }

            block = b;
            mfMarkWall(b);
            /* ★ v2.6.0：末尾「＋ 新建」卡 */
            mfEnsureNewCard(b);

            if (mo) mo.disconnect();
            mo = new MutationObserver(function () { mfMarkWall(block); mfEnsureNewCard(block); });
            /* ★ 只监听 childList。监听 attributes 的话，
                 mfMarkWall 自己加的 class 会触发回调 → 无限自激。 */
            mo.observe(b, { childList: true });
            return true;
        }

        (function waitForPanel() {
            if (attach()) return;
            if (++tries < 60) setTimeout(waitForPanel, 300);
            /* 60 次 = 18 秒，够酒馆启动；还没出来说明这个版本结构不同，
               直接放弃，别留一个每 300ms 跑的定时器。 */
        })();

        /* 面板关闭再打开时 #rm_print_characters_block 会被整个重建，
           旧 observer 盯的是死节点。低频巡一下，换了就重挂。 */
        setInterval(function () { attach(); }, 1200);
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 11 · 角色详情页（点格子滑入）
       ─────────────────────────────────────────────────────────────────────
       【用户口径 2026-11-13 22:2x】
       「我点击那个格子，我点进去也只是编辑界面，没有 HTML 的所谓的选那个
        聊天记录，完全没有。」
       → 点格子要进详情页（封面 / 简介 / 三口径 / 真实聊天列表 / 底部进聊天）。

       【为什么必须拦原生点击】
       原生（script.js:11192）只有一句：
           $(document).on('click', '.character_select', async function () {
               const id = Number($(this).attr('data-chid'));
               await selectCharacterById(id);
           });
       selectCharacterById 的作用是「选中 + 把右侧抽屉切到角色编辑面板」，
       所以用户点下去永远是编辑界面。详情页只能自己接管。

       【拦法：document 捕获阶段】
       原生那套是 jQuery 的 document 委托（冒泡阶段）。我们在 document 上加
       捕获阶段的监听（第三个参数 true），事件还没往下走就 stopPropagation，
       jQuery 的委托永远收不到 —— 这是唯一不用改酒馆源码就能稳拦的位置。
       ★ 不能用 stopImmediatePropagation：同一节点上别人的监听器也会被打断。

       【必须放行的三种点击（放行错了就是原生死按钮）】
         1. .ch_fav_icon        收藏星标
         2. 批量编辑模式        #bulkSelectAllButton 可见 = 批量选中中，点格子是勾选
         3. 拖拽               pointerdown→click 位移 > 6px 视为拖拽，不是点击
       判不出来就放行（宁可多开一次原生编辑，也不要吃掉原生命令）。

       【数据从哪来 —— 全部走酒馆真实接口，不用静态快照】
       · 角色本体     ctx.characters[chid]（name / description / data.tags / data.creator）
       · 头像大图     /characters/<avatar>   ← 不是 getThumbnailUrl，那个是 96px 缩略图，铺 20vh 会糊
       · 聊天列表     POST /api/characters/chats  {avatar_url}
                      返回 map，值含 file_name / file_size / message_count / last_mes / preview_message
                      （与 script.js:8510 getPastCharacterChats 完全同一条路子）
       · 进某段聊天   ctx.selectCharacterById(chid) → ctx.openCharacterChat(file_name)
                      openCharacterChat 内部会 clearChat + getChat，所以必须先选角色
       · 新建聊天     点原生 #option_start_new_chat（会弹酒馆自己的确认框，保持原生行为）
       · 编辑        关掉详情页，把这次点击"还"给原生 —— 直接 ctx.selectCharacterById(chid)

       【右侧抽屉要收起来】
       进聊天后如果 #right-nav-panel 还开着，聊天区被挡一半。原生开关是
       #rightNavDrawerIcon 那个抽屉把手，点一下即可（用 closedDrawer 判状态）。

       【踩坑】
       - #mf-detail 的位移层必须自己 overflow:hidden，否则 translateX(100%)
         会把整个酒馆撑出横向滚动条。
       - 详情页里的滚动容器 .mfd-content 是 flex column，子项必须 flex:0 0 auto，
         否则三段卡会被压成 0 高（原型阶段踩过）。
       - 头像 src 用 encodeURIComponent；中文角色名 + 空格不编码会 404。
       ═════════════════════════════════════════════════════════════════════ */

    var MF_D_EL = null;          /* #mf-detail 根节点 */
    var MF_D_CHID = null;        /* 当前展示的角色下标 */
    var MF_D_CHATS = [];         /* 当前角色的聊天列表 */
    var MF_D_CUR = -1;           /* 选中第几段 */
    var MF_D_DOWN = null;        /* pointerdown 坐标，用来识别拖拽 */
    var MF_D_STATE = 'closed';   /* closed | open | closing —— 防连点把状态搞乱 */
    var MF_D_TIMER = null;       /* 关闭后摘除 display 的定时器 */
    var MF_D_PASS = false;       /* 为 true 时放过这一次卡片点击（把点击还给原生） */

    function mfCtx() {
        return (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;
    }

    function mfEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mfAvatarUrl(av) {
        return new URL('/characters/' + encodeURIComponent(av), location.href).href;
    }

    /* 时间：酒馆的 last_mes 是毫秒时间戳（数字）或 ISO 串，两种都要认 */
    function mfWhen(v) {
        if (v == null || v === '') return null;
        var d = (typeof v === 'number') ? new Date(v) : new Date(String(v));
        if (isNaN(d.getTime())) return null;
        return d;
    }

    function mfDayTxt(d) {
        if (!d) return '—';
        var diff = (Date.now() - d.getTime()) / 86400000;
        if (diff < 1) return '今天';
        if (diff < 2) return '昨天';
        if (diff < 30) return Math.floor(diff) + ' 天前';
        if (diff < 365) return Math.floor(diff / 30) + ' 个月前';
        return Math.floor(diff / 365) + ' 年前';
    }

    function mfFullTxt(d) {
        if (!d) return '';
        var p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* 「最近活跃」那格是「大数字 + 小单位」两段，所以不能直接塞 mfDayTxt 的整句。
       ★ 别再用正则去抠（踩过：「今天」被 [^\d年月天前个] 抠成了「天」）。 */
    function mfRecParts(d) {
        if (!d) return ['—', ''];
        var diff = (Date.now() - d.getTime()) / 86400000;
        if (diff < 1) return ['今天', ''];
        if (diff < 2) return ['1', '天前'];
        if (diff < 30) return [String(Math.floor(diff)), '天前'];
        if (diff < 365) return [String(Math.floor(diff / 30)), '个月前'];
        return [String(Math.floor(diff / 365)), '年前'];
    }

    /* 聊天记录条目的主标题。
       酒馆的聊天文件名只有「角色名 - 2026-10-02@22h16m26s476ms」，没有语义标签，
       所以标题放绝对日期时间，右边那列放相对时间（今天/3 天前），两边互补。
       去年以前的补上年份。 */
    function mfSegWhen(d) {
        if (!d) return '—';
        var p = function (n) { return String(n).padStart(2, '0'); };
        var md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
        if (d.getFullYear() !== new Date().getFullYear()) md = d.getFullYear() + '年' + md;
        return md + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /* 摘要：把 markdown 符号和换行压成一行动作，太长的截断 */
    function mfLine(raw) {
        var s = String(raw || '').replace(/[\r\n]+/g, ' ').replace(/[*_`>#]/g, '').trim();
        return s.length > 120 ? s.slice(0, 120) + '…' : s;
    }

    /* ── 建壳（只建一次，之后只换内容） ── */
    function mfBuildDetail() {
        if (MF_D_EL) return MF_D_EL;

        var el = document.createElement('div');
        el.id = 'mf-detail';
        el.innerHTML = [
            '<div class="mfd-mask"></div>',
            '<div class="mfd-app" role="dialog" aria-modal="true" aria-label="角色详情">',
            '  <div class="mfd-banner">',
            '    <div class="mfd-dim"></div>',
            '    <img alt="">',
            '    <div class="mfd-grain"></div>',
            '    <div class="mfd-fade"></div>',
            '  </div>',
            '  <div class="mfd-topbar">',
            '    <button class="mfd-back" type="button">',
            '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
            '      <span>角色列表</span>',
            '    </button>',
            '    <button class="mfd-edit" type="button" title="编辑这个角色">',
            '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
            '    </button>',
            '  </div>',
            '  <main class="mfd-content">',
            '    <div class="mfd-idline">',
            '      <h2><span class="mfd-name"></span><span class="mfd-ver"></span></h2>',
            '      <p class="mfd-tagline"></p>',
            '      <p class="mfd-byline"></p>',
            '    </div>',
            '    <p class="mfd-desc"></p>',
            '    <div class="mfd-tags"></div>',
            '    <section class="mfd-freq">',
            '      <div class="mfd-fhead"><span class="lbl">使用频率</span><span class="rank"></span><i></i></div>',
            '      <div class="mfd-mtx">',
            '        <div class="mfd-mx"><span class="mk">热度</span><div class="mv"><span data-k="hot">—</span><em>/ 100</em></div><div class="mb"><i data-b="hot"></i></div><div class="ms" data-s="hot"></div></div>',
            '        <div class="mfd-mx"><span class="mk">消息总量</span><div class="mv"><span data-k="msg">—</span><em>条</em></div><div class="mb"><i data-b="msg"></i></div><div class="ms" data-s="msg"></div></div>',
            '        <div class="mfd-mx"><span class="mk">最近活跃</span><div class="mv"><span data-k="rec">—</span><em data-u="rec"></em></div><div class="mb"><i data-b="rec"></i></div><div class="ms" data-s="rec"></div></div>',
            '      </div>',
            '    </section>',
            '    <div class="mfd-sechead"><span class="lbl">聊天记录</span><span class="cnt"></span><i></i></div>',
            '    <ul class="mfd-segs"></ul>',
            '    <div class="mfd-tail"></div>',
            '  </main>',
            '  <footer class="mfd-dock">',
            '    <button class="mfd-cta" type="button">',
            '      <span class="t">进入</span><span class="n"></span>',
            '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
            '    </button>',
            '    <button class="mfd-newbtn" type="button" title="开一段新聊天">',
            '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
            '    </button>',
            '  </footer>',
            '</div>'
        ].join('\n');

        document.body.appendChild(el);

        el.querySelector('.mfd-mask').addEventListener('click', mfCloseDetail);
        el.querySelector('.mfd-back').addEventListener('click', mfCloseDetail);
        el.querySelector('.mfd-edit').addEventListener('click', function () {
            var chid = MF_D_CHID;
            mfCloseDetail();
            /* 还回原生：这就是用户原来点一下会看到的角色编辑面板 */
            var ctx = mfCtx();
            if (ctx && chid != null) ctx.selectCharacterById(Number(chid));
        });
        el.querySelector('.mfd-cta').addEventListener('click', function () { mfEnterChat(MF_D_CUR); });
        el.querySelector('.mfd-newbtn').addEventListener('click', mfNewChat);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && el.classList.contains('mfd-in')) mfCloseDetail();
        });

        MF_D_EL = el;
        return el;
    }

    function mfOpenDetail(chid) {
        var ctx = mfCtx();
        if (!ctx || !ctx.characters) return;
        var ch = ctx.characters[chid];
        if (!ch) return;

        var el = mfBuildDetail();
        MF_D_CHID = chid;
        MF_D_CHATS = [];
        MF_D_CUR = -1;

        var data = ch.data || {};
        var nameEl = el.querySelector('.mfd-name');
        var verEl = el.querySelector('.mfd-ver');
        nameEl.textContent = ch.name || '(未命名)';
        verEl.textContent = data.character_version ? 'v' + data.character_version : '';

        var desc = String(ch.description || data.description || '').trim();
        var tagline = String(data.creator_notes || ch.creatorcomment || '').split(/[\r\n]+/)[0].trim();
        var byline = [];
        if (data.creator) byline.push('by ' + data.creator);
        if (ch.create_date) {
            var cd = mfWhen(ch.create_date);
            if (cd) byline.push(mfFullTxt(cd).slice(0, 10) + ' 建卡');
        }

        el.querySelector('.mfd-tagline').textContent = tagline.slice(0, 60);
        el.querySelector('.mfd-tagline').style.display = tagline ? '' : 'none';
        el.querySelector('.mfd-byline').textContent = byline.join(' · ');

        var dEl = el.querySelector('.mfd-desc');
        /* 简介里常有 {{char}} / {{user}} 宏，这里不做替换（详情页不是正文），
           只把换行压平，免得三行 clamp 里全是空行。 */
        dEl.textContent = desc.replace(/\r/g, '').replace(/\n{2,}/g, ' \n');
        dEl.style.display = desc ? '' : 'none';

        var tags = (data.tags && data.tags.length) ? data.tags : (ch.tags || []);
        var tWrap = el.querySelector('.mfd-tags');
        tWrap.innerHTML = tags.slice(0, 12).map(function (t) { return '<span>' + mfEsc(t) + '</span>'; }).join('');
        tWrap.style.display = tags.length ? '' : 'none';

        var img = el.querySelector('.mfd-banner img');
        var dim = el.querySelector('.mfd-banner .mfd-dim');
        var big = mfAvatarUrl(ch.avatar);
        img.onerror = function () {
            /* 大图 404 时退回缩略图，总比空白好 */
            if (ctx.getThumbnailUrl) img.src = ctx.getThumbnailUrl('avatar', ch.avatar);
        };
        img.src = big;
        dim.style.backgroundImage = 'url("' + big.replace(/"/g, '%22') + '")';

        /* 进入时先把三口径清成占位，等聊天列表回来再填 */
        ['hot', 'msg', 'rec'].forEach(function (k) {
            el.querySelector('[data-k="' + k + '"]').textContent = '—';
            el.querySelector('[data-b="' + k + '"]').style.width = '0';
            el.querySelector('[data-s="' + k + '"]').textContent = '';
        });
        el.querySelector('.mfd-fhead .rank').textContent = '';
        el.querySelector('.mfd-sechead .cnt').textContent = '';
        el.querySelector('.mfd-segs').innerHTML = '<li class="mfd-empty">正在读取聊天记录…</li>';
        el.querySelector('.mfd-cta .t').textContent = '进入「' + (ch.name || '') + '」';
        el.querySelector('.mfd-cta .n').textContent = '';

        mfOpenLayer();
        el.querySelector('.mfd-content').scrollTop = 0;

        mfLoadChats(chid);
    }

    /* ── 进出状态机 ──
       2026-11-13 22:5x 用户报「一退出就卡」。
       原来关闭只删一个 class，满屏的合成层仍然留在文档里（translateX(100%)），
       WebView2 会继续为它分配图层，切回角色列表滚动就发滞。
       现在：关上 0.42s 后 display:none 真摘掉；再打开时先取消 hide、强制一次重排，
       否则 display:none→block 与 transform 变化落在同一帧，动画会被整段跳过。 */
    /* ── 把这一层钉到右抽屉的框上 ──
       2026-11-13 23:2x 用户口径（原话）：
       「原本是角色列表，原本的界面就是在右边，就算你进入二级面，那它的界面
        也只是覆盖角色列表那里，但是你却直接把它放在了中间，而且它的两边
        根本不是空白，它是被拉长那种空白」。
       → 抽屉宽度 = (100dvw - --sheldWidth - 2px)/2（style.css:5624），
         --sheldWidth 被用户拖过就会变，抽屉还能最大化/拖拽，
         所以**不自己算**，一次 getBoundingClientRect 直接抄。
       量不到（抽屉关着/高度还是 0）就清掉内联，退回 CSS 里的兜底公式，
       绝不留一个 0 宽的空壳。 */
    function mfSyncBox() {
        var el = MF_D_EL;
        if (!el) return;
        var p = document.getElementById('right-nav-panel');
        if (!p) return;
        var r = p.getBoundingClientRect();
        if (!r.width || r.width < 200 || !r.height || r.height < 200) {
            el.style.left = '';
            el.style.top = '';
            el.style.width = '';
            el.style.height = '';
            el.style.borderRadius = '';
            return;
        }
        el.style.right = 'auto';
        el.style.left = Math.round(r.left) + 'px';
        el.style.top = Math.round(r.top) + 'px';
        el.style.width = Math.round(r.width) + 'px';
        el.style.height = Math.round(r.height) + 'px';
        /* 抽屉自己有 10px 圆角 + 1px 边，层是方的就会在角上多出两块直角 */
        el.style.borderRadius = getComputedStyle(p).borderRadius;
    }

    function mfOpenLayer() {
        var el = MF_D_EL;
        if (!el) return;
        if (MF_D_TIMER) { clearTimeout(MF_D_TIMER); MF_D_TIMER = null; }
        el.classList.remove('mfd-hide');
        mfSyncBox();
        void el.offsetWidth;
        el.classList.add('mfd-in');
        MF_D_STATE = 'open';
    }

    function mfCloseDetail() {
        var el = MF_D_EL;
        if (!el || MF_D_STATE === 'closed') return;
        MF_D_STATE = 'closing';
        el.classList.remove('mfd-in');
        if (MF_D_TIMER) clearTimeout(MF_D_TIMER);
        MF_D_TIMER = setTimeout(function () {
            MF_D_TIMER = null;
            if (MF_D_STATE !== 'closing' || !MF_D_EL) return;
            MF_D_EL.classList.add('mfd-hide');
            MF_D_STATE = 'closed';
        }, 420);
    }

    /* ── 拉聊天列表 ── */
    function mfLoadChats(chid) {
        var ctx = mfCtx();
        if (!ctx || !ctx.characters) return;
        var ch = ctx.characters[chid];
        if (!ch) return;

        fetch('/api/characters/chats', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify({ avatar_url: ch.avatar }),
        }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (data) {
            /* 用户可能已经关掉/切到别的角色了，回来要对一下号 */
            if (MF_D_CHID !== chid || !MF_D_EL) return;

            var list = [];
            if (data && typeof data === 'object' && data.error !== true) {
                list = Object.values(data);
            }
            list = list.filter(function (x) { return x && x.file_name; });
            list.sort(function (a, b) {
                var ta = mfWhen(a.last_mes), tb = mfWhen(b.last_mes);
                return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
            });

            MF_D_CHATS = list;
            MF_D_CUR = list.length ? 0 : -1;
            mfPaintChats();
            mfPaintFreq(chid, list);
        }).catch(function () {
            if (MF_D_CHID !== chid || !MF_D_EL) return;
            MF_D_CHATS = [];
            MF_D_CUR = -1;
            mfPaintChats();
        });
    }

    function mfPaintChats() {
        var el = MF_D_EL;
        if (!el) return;
        var ul = el.querySelector('.mfd-segs');
        var cnt = el.querySelector('.mfd-sechead .cnt');
        var ch = mfCtx().characters[MF_D_CHID];

        cnt.textContent = MF_D_CHATS.length ? MF_D_CHATS.length + ' 段' : '';

        if (!MF_D_CHATS.length) {
            ul.innerHTML = '<li class="mfd-empty">还没有聊天记录，点右下角的 + 开一段新的</li>';
            el.querySelector('.mfd-cta .n').textContent = '';
            el.querySelector('.mfd-cta .t').textContent = '开始「' + (ch ? ch.name : '') + '」的第一段';
            return;
        }

        ul.innerHTML = MF_D_CHATS.map(function (c, i) {
            var d = mfWhen(c.last_mes);
            var n = c.message_count != null ? c.message_count : '';
            return '<li class="mfd-seg' + (i === MF_D_CUR ? ' on' : '') + '" data-i="' + i + '">'
                + '<span class="sn">' + String(i + 1).padStart(2, '0') + '</span>'
                + '<div class="sb">'
                +   '<div class="st"><b>' + mfEsc(mfSegWhen(d)) + '</b>'
                +   (n !== '' ? '<span class="dot">·</span><em>' + n + ' 条</em>' : '')
                +   '</div>'
                +   '<p class="ss">' + mfEsc(mfLine(c.preview_message)) + '</p>'
                + '</div>'
                + '<span class="sd">' + mfEsc(mfDayTxt(d)) + '</span>'
                + '</li>';
        }).join('');

        /* ★ 2026-11-13 22:5x：原来单击只"高亮一下"，必须双击或点底部按钮才进聊天，
           手机上根本没有双击 —— 用户原话「我点不下去聊天列表，那我要那个干嘛呀」。
           现在单击就是进这段聊天，高亮只作为按下时的即时反馈。 */
        ul.querySelectorAll('.mfd-seg').forEach(function (li) {
            li.addEventListener('click', function () {
                var i = Number(li.getAttribute('data-i'));
                MF_D_CUR = i;
                ul.querySelectorAll('.mfd-seg').forEach(function (x) { x.classList.remove('on'); });
                li.classList.add('on');
                mfPaintCta();
                mfEnterChat(i);
            });
        });

        mfPaintCta();
    }

    function mfPaintCta() {
        var el = MF_D_EL;
        if (!el) return;
        var ch = mfCtx().characters[MF_D_CHID];
        var c = MF_D_CHATS[MF_D_CUR];
        var t = el.querySelector('.mfd-cta .t');
        var n = el.querySelector('.mfd-cta .n');
        if (!c) {
            t.textContent = '开始「' + (ch ? ch.name : '') + '」的第一段';
            n.textContent = '';
            return;
        }
        var d = mfWhen(c.last_mes);
        t.textContent = '继续这段「' + (ch ? ch.name : '') + '」';
        n.textContent = d ? mfDayTxt(d) : '';
    }

    /* ── 三口径 ──
       口径（原型定过，别乱调权重）：
         热度 = 0.5×消息量(对数) + 0.5×近度(半衰 14 天)，全局归一化到 100
       段数那 0.25 在原型里是"这个角色有几段聊天"的归一化，
       实机上要拉每个角色的聊天列表才能算，代价是 N 次请求 —— 砍掉，
       把权重让给近度。数字仍然可解释：聊得多 + 最近聊过 = 高。
       ★ 绝不拿字数估 token / 估消息数，所有数字都来自接口返回。 */
    function mfPaintFreq(chid, list) {
        var el = MF_D_EL;
        if (!el) return;
        var ctx = mfCtx();
        var ch = ctx.characters[chid];
        if (!ch) return;

        var msgs = 0;
        var last = null;
        list.forEach(function (c) {
            msgs += Number(c.message_count || 0);
            var d = mfWhen(c.last_mes);
            if (d && (!last || d > last)) last = d;
        });
        /* message_count 缺失时退回角色自带的 chat_size（字节数，仅用于相对比较） */
        var sizeFallback = !msgs && Number(ch.chat_size || 0) > 0;

        var all = (ctx.characters || []).map(function (c) {
            return Number(c.chat_size || 0);
        });
        var maxSize = Math.max.apply(null, all.concat([1]));
        var maxMsgs = Math.max(msgs, 1);

        var pMsg = msgs ? Math.log10(msgs + 1) / Math.log10(maxMsgs + 1) : 0;
        var rec = last ? Math.pow(0.5, (Date.now() - last.getTime()) / (14 * 86400000)) : 0;
        var rp = mfRecParts(last);

        /* 消息量按全局最大 chat_size 归一，避免只有一两个角色时永远 100 分 */
        var pTot = Math.log10(Number(ch.chat_size || 0) + 1) / Math.log10(maxSize + 1);
        var hot = Math.round(100 * (0.5 * pTot + 0.5 * rec));

        el.querySelector('[data-k="hot"]').textContent = msgs || sizeFallback ? hot : '—';
        el.querySelector('[data-b="hot"]').style.width = (msgs || sizeFallback ? Math.max(3, hot) : 0) + '%';
        el.querySelector('[data-s="hot"]').textContent = msgs ? (msgs + ' 条撑起来的') : (sizeFallback ? '按卡体积估的' : '聊过才有热度');
        el.querySelector('.mfd-fhead .rank').textContent = msgs ? '共 ' + msgs + ' 条' : '';

        el.querySelector('[data-k="msg"]').textContent = msgs || (sizeFallback ? '—' : 0);
        el.querySelector('[data-b="msg"]').style.width = Math.round(pMsg * 100) + '%';
        el.querySelector('[data-s="msg"]').textContent = list.length ? ('分布在 ' + list.length + ' 段里') : '';

        el.querySelector('[data-k="rec"]').textContent = rp[0];
        el.querySelector('[data-u="rec"]').textContent = rp[1];
        el.querySelector('[data-b="rec"]').style.width = Math.round(rec * 100) + '%';
        el.querySelector('[data-s="rec"]').textContent = last ? mfFullTxt(last) : '还没聊过';
    }

    /* ── 进聊天 / 新建 ── */
    function mfHideNav() {
        /* 右侧抽屉开着就把聊天区挡了。closedDrawer 存在 = 已经关着，别乱点。 */
        var panel = document.querySelector('#right-nav-panel');
        if (!panel) return;
        if (panel.classList.contains('closedDrawer')) return;
        var handle = document.querySelector('#rightNavDrawerIcon');
        if (handle) handle.click();
    }

    /* 客户端里 getContext() 万一没暴露 selectCharacterById（不同前端 fork 有差异），
       就退回"把这次点击还给原生"：找到那张卡，打上放行标记再点它一下。
       ★ 不打标记是不行的 —— 我们自己的 document 捕获监听会再截一次，变成死循环。 */
    function mfNativePickCard(chid) {
        var card = document.querySelector('#rm_print_characters_block .character_select[data-chid="' + chid + '"]');
        if (!card) return false;
        MF_D_PASS = true;
        try { card.click(); } finally { setTimeout(function () { MF_D_PASS = false; }, 0); }
        return true;
    }

    function mfEnterChat(i) {
        var ctx = mfCtx();
        if (!ctx || MF_D_CHID == null) return;
        var c = MF_D_CHATS[i];
        var chid = Number(MF_D_CHID);

        mfCloseDetail();

        if (typeof ctx.selectCharacterById !== 'function') {
            console.warn('[mf-detail] 没有 selectCharacterById，改用原生点击');
            mfNativePickCard(chid);
            return;
        }

        var p = ctx.selectCharacterById(chid);
        Promise.resolve(p).then(function () {
            if (!c || !c.file_name) return;
            if (typeof ctx.openCharacterChat === 'function') return ctx.openCharacterChat(c.file_name);
            /* 极少数 fork 不暴露 openCharacterChat：退一步去点原生聊天列表里的同名项 */
            var shown = String(c.file_name).replace(/\.jsonl$/, '');
            var items = document.querySelectorAll('#rm_chat_list .select_chat_block, #select_chat_div > *');
            for (var k = 0; k < items.length; k++) {
                if ((items[k].textContent || '').indexOf(shown) >= 0) { items[k].click(); return; }
            }
            console.warn('[mf-detail] 找不到 openCharacterChat，也没匹配到原生聊天条目', shown);
            if (window.toastr) toastr.warning('这个客户端没开放聊天接口，请点右上角铅笔进原生面板');
        }).then(function () {
            setTimeout(mfHideNav, 120);
        }).catch(function (err) {
            console.error('[mf-detail] 进入聊天失败', err);
            if (window.toastr) toastr.error('打开聊天失败，可以再点一次试试');
        });
    }

    function mfNewChat() {
        var ctx = mfCtx();
        if (!ctx || MF_D_CHID == null) return;
        var chid = Number(MF_D_CHID);
        mfCloseDetail();
        if (typeof ctx.selectCharacterById !== 'function') { mfNativePickCard(chid); return; }
        Promise.resolve(ctx.selectCharacterById(chid)).then(function () {
            setTimeout(function () {
                mfHideNav();
                /* 点原生按钮：会弹酒馆自己的「开始新聊天？」确认框，保持原生行为 */
                var btn = document.querySelector('#option_start_new_chat');
                if (btn) btn.click();
            }, 160);
        });
    }

    /* ── 拦截点击 ── */
    function mfBulkMode() {
        var b = document.querySelector('#bulkSelectAllButton');
        return !!(b && b.style.display !== 'none');
    }

    function mfGuardStyle() {
        /* 酒馆切暗色是给 body 加 .dark；这里只需要保证详情页跟着变，
           变量选择器已经写成 body.dark #mf-detail，无需额外处理。 */
    }

    function initCharDetail() {
        if (document.body.classList.contains('mf-detail-js')) return;
        document.body.classList.add('mf-detail-js');
        mfGuardStyle();

        /* pointerdown 记坐标：拖拽排序时也会派发 click，不能当成点击 */
        document.addEventListener('pointerdown', function (e) {
            MF_D_DOWN = { x: e.clientX, y: e.clientY };
        }, true);

        document.addEventListener('click', function (e) {
            if (MF_D_PASS) return;
            var card = e.target && e.target.closest ? e.target.closest('.character_select') : null;
            if (!card) return;
            /* 只在角色列表面板里生效，别的界面有同名结构就放过 */
            if (!card.closest('#rm_print_characters_block')) return;

            /* 1. 收藏星标：原生自己的事 */
            if (e.target.closest('.ch_fav_icon')) return;
            /* 2. 批量编辑中：点击是勾选 */
            if (mfBulkMode()) return;
            /* 3. 拖拽：位移超过 6px 不算点击 */
            if (MF_D_DOWN) {
                var dx = Math.abs(e.clientX - MF_D_DOWN.x);
                var dy = Math.abs(e.clientY - MF_D_DOWN.y);
                if (dx > 6 || dy > 6) return;
            }

            var raw = card.getAttribute('data-chid');
            if (raw == null) return;
            var chid = Number(raw);
            if (isNaN(chid)) return;

            /* ★ 在这一层掐断，jQuery 的 document 委托（冒泡阶段）就收不到了 */
            e.stopPropagation();
            e.preventDefault();

            mfOpenDetail(chid);
        }, true);

        /* 窗口尺寸变了、抽屉宽度跟着 --sheldWidth 变了 —— 层要重新贴一次 */
        window.addEventListener('resize', function () {
            if (MF_D_STATE === 'open') mfSyncBox();
        });
    }

    /* ═════════════════════════════════════════════════════════════════════
       模块 12 · 面板顶部折叠（世界书 / 预设）
       ─────────────────────────────────────────────────────────────────────
       【用户口径】
       「最主要的还是那些角色的界面，还有那个世界书和预设都有这样的问题，
         就是上面那里一大堆东西，然后导致下面主要的内容突出不出来。」
       拍板：统一收成一个「⋯」，点开才展开（和角色页同一套）。

       【世界书的上半截到底占了多少】
       #WorldInfo 顶部依次是：
         #WorldInfoheader                  拖拽把手
         .flex-container.alignitemscenter  锁 + 标题
         #wiTopBlock                       「Active World(s)」多选 + 全局激活设置
         #world_popup                      新建/选择/导入/导出 + 条目列表
       #wiTopBlock 里那个 <select id="world_info" multiple> 默认就摊开 4 行，
       加上标题、留白，光是被折叠的这一块桌面就吃掉 ~200px，手机上剩不下几行。

       【折叠的是哪块】
       #wiTopBlock —— 它是"设置一次就不动"的东西（哪些世界书全局生效、扫描深度）。
       新建/选择/导入那行（#world_popup 顶部）保留常显，那是主要操作，收了反而难用。

       【安全策略（这条最重要）】
       找不到 #WorldInfo / #wiTopBlock / 标题行，就**一个 class 都不加**，
       面板保持酒馆原样。宁可"没效果"，也绝不"改坏别人的面板"。
       ═════════════════════════════════════════════════════════════════════ */

    var MF_FOLD_TIMER = null;

    function mfFoldBtn(wrap, flagClass, label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mf-fold-btn';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/>'
            + '<circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            wrap.classList.toggle(flagClass);
        });
        return btn;
    }

    /* ── 世界书 ── */
    function mfFoldWorldInfo() {
        var wi = document.getElementById('WorldInfo');
        if (!wi || wi.classList.contains('mf-wi-fold')) return;
        var top = document.getElementById('wiTopBlock');
        var head = document.getElementById('WorldInfoheader');
        if (!top || !head) return;
        var titleRow = head.nextElementSibling;
        if (!titleRow) return;

        wi.classList.add('mf-wi-fold');
        titleRow.appendChild(mfFoldBtn(wi, 'mf-wi-open', '展开/收起世界书设置'));
    }


    /* ── 预设（左栏 AI 响应配置）★ v2.6.0 已删除折叠功能 ──
       【为什么删掉】
         用户 2026-11-22 原话：「预设界面那里，就是我点进去它突然会一会儿详细一会儿
         一会儿简单的，就是这种反复卡会不会显得非常卡。」
         原来的实现把采样滑条 / 预设标题行 / 图标簇折进一个 ⋯ 按钮，
         而「折起来」靠的是**给节点打 class**（.mf-pv-hide）+ 每 2 秒巡检补打。
         酒馆只要重建一次预设块（切 API 类型 / 换预设 / 重连），
         新节点就没那个 class → 面板自己弹回详细态；巡检又因为 .mf-pv-fold
         还在而直接 return，永远补不回来。
         → 表现就是「详细 ↔ 简单」反复横跳，用户看着像卡。
       【结论】
         折叠带来的信息节省，远不值得它这个不稳定性。
         现在预设面板**完全交给酒馆原生**，扩链一个 class 都不加。
         皮肤层只保留纯外观（skin.css 里原来的 #left-nav-panel.mf-pv-* 规则
         也一并删了 —— 留着就是死代码）。 */

    function initPanelFolds() {
        if (document.body.classList.contains('mf-fold-js')) {
            mfFoldWorldInfo();
            return;
        }
        document.body.classList.add('mf-fold-js');
        mfFoldWorldInfo();

        /* 酒馆会在切账号/重连后重建一部分面板节点，按钮跟着节点一起没了。
           2s 一次的巡检只在"没有按钮"时才动手，平时是空转。
           ★ v2.6.0：巡检里不再调 mfFoldPreset —— 预设折叠整个删了（见上面的说明）。 */
        if (!MF_FOLD_TIMER) {
            MF_FOLD_TIMER = setInterval(function () {
                mfFoldWorldInfo();
            }, 2000);
        }
    }


    /* ═════════════════════════════════════════════════════════════════════
       模块 12 · 消息末尾的 ⟳ 重新生成 + 禁掉滑动误触（v2.5.0）
       ─────────────────────────────────────────────────────────────────────
       【用户口径 2026-11-22】
       「酒馆不是会有那个向右一滑，然后就会重新生成的嘛，呃我太容易误触了，
         所以我希望你把它改成不会滑动就会生成，就是需要点最末尾有个小按钮。」

       【真根因 · 为什么一碰就烧 token】
       原生消息右边缘有个 › 箭头（.swipe_right，住在 .swipeRightBlock 里）：
         · 点它 = 切到下一条备选回复（swipe right）
         · 当这条已经是最后一条备选（.last_swipe）时再点 = OVERSWIPE
           → OVERSWIPE_BEHAVIOR.REGENERATE = 重新生成
       原生 CSS 里箭头的显隐规则（style.css:1351 / 1355）：
         body:not(.swipeAllMessages) .mes:not(.last_mes)
             :is(.swipe_left, .swipe_right, .swipes-counter)
         .mes:not(.swipes_visible, .last_swipe) :is(.swipe_right)
       → 也就是说最后一条消息上那个箭头一直都在，看着像装饰，碰不得。

       【改法 · 三层】
       ① 隐藏原生箭头（skin.css）：
          ★ 只藏 .swipe_right，**不藏 .swipes-counter** ——
            那个数字可以点，开的是备选选择器（swipe-picker.js），
            换回旧备选全靠它，藏了就再也回不去旧回复。
       ② 消息末尾加一个 ⟳ 小按钮：
          只有「最后一条是 AI 消息」时才给 —— 原生箭头也只对最后一条生效，
          中间消息没有「原地重生成」这回事，硬塞会造成
          「点了却重生成最后一条」，比没有更误导。
          点它走原生 #option_regenerate（原生入口 → Generate('regenerate')）。
          ★ 不自己调 Generate()：自己调就得处理 is_send_press、swipe 状态、
            分组聊天等一堆分支；点原生那个 <a> 等于用户亲手点一次。
       ③ 掐断横向拖动：在 #chat 上用**捕获阶段**监听 pointer/touch 事件，
          一旦发现是横向拖动（|dx|>18 且 |dx|>|dy|*1.4）就 stopPropagation，
          酒馆任何绑在冒泡阶段的手势都收不到这次拖动。
          ★ 只 stopPropagation，**不 preventDefault**：
            preventDefault 会把「鼠标拖动划词选中」和「竖向滚动」一起废掉。
          ★ 必须用捕获阶段：冒泡阶段 #chat 已经是最后一个目标，
            酒馆绑在 .mes / document 上的监听器早就跑完了，拦不住。
       ═════════════════════════════════════════════════════════════════════ */
    function initMsgRegen() {
        var chat = document.getElementById('chat');
        if (!chat) {
            setTimeout(function () { initMsgRegen(); }, 600);
            return;
        }

        /* ── ③ 横向拖动拦截 ───────────────────────────────────────────── */
        var drag = null;          /* {x, y, hit} */
        var swallowUntil = 0;     /* 拖动后那一次 click 的截止时刻 */

        function pt(e) {
            if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX || 0, y: e.clientY || 0 };
        }
        /* 在输入框 / 文本域 / 代码块里拖 = 划词选字，不是滑消息，放行 */
        function inTextZone(e) {
            var t = e.target;
            if (!t || !t.closest) return false;
            return !!t.closest('input, textarea, select, [contenteditable="true"], pre, code, table');
        }
        function onDown(e) {
            if (inTextZone(e)) { drag = null; return; }
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            var p = pt(e);
            drag = { x: p.x, y: p.y, hit: false };
        }
        function onMove(e) {
            if (!drag || drag.hit) return;
            var p = pt(e);
            var dx = p.x - drag.x, dy = p.y - drag.y;
            if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                drag.hit = true;
                /* ★ 只掐断传播，不 preventDefault（保住划词选中 + 竖向滚动） */
                try { e.stopPropagation(); } catch (err) { }
            }
        }
        function onUp() {
            if (drag && drag.hit) {
                /* 横向拖动结束时浏览器可能补一个 click（拖到箭头上的那种）→ 吞掉 */
                swallowUntil = Date.now() + 350;
            }
            drag = null;
        }
        function onClick(e) {
            if (swallowUntil && Date.now() < swallowUntil) {
                swallowUntil = 0;
                try { e.preventDefault(); e.stopPropagation(); } catch (err) { }
            }
        }

        var hasPointer = !!(window.PointerEvent);
        var downEv = hasPointer ? ['pointerdown'] : ['mousedown', 'touchstart'];
        var moveEv = hasPointer ? ['pointermove'] : ['mousemove', 'touchmove'];
        var upEv = hasPointer ? ['pointerup', 'pointercancel'] : ['mouseup', 'touchend', 'touchcancel'];
        downEv.forEach(function (t) { chat.addEventListener(t, onDown, true); });
        moveEv.forEach(function (t) { chat.addEventListener(t, onMove, true); });
        upEv.forEach(function (t) { chat.addEventListener(t, onUp, true); });
        chat.addEventListener('click', onClick, true);

        /* ── ② 消息末尾的 ⟳ 重新生成 ─────────────────────────────────── */
        var RID = 'mf-regen';

        /* ★ 酒馆标记「用户消息」用的是**属性**不是 class：
             messageElement.attr({ 'is_user': mes.is_user, ... })
             → DOM 上是 is_user="true" / is_user="false"
           用 classList.contains('is_user') 判会永远判成 false，
           结果按钮会挂到用户自己那条消息上。 */
        function isUserMsg(el) {
            if (!el) return false;
            return String(el.getAttribute('is_user')).toLowerCase() === 'true';
        }

        function place() {
            var msgs = chat.querySelectorAll('.mes');
            if (!msgs.length) return;
            var last = msgs[msgs.length - 1];
            var target = isUserMsg(last) ? null : last;

            /* 清掉别的消息上的旧按钮（重生成后最后一条会换人） */
            var olds = chat.querySelectorAll('#' + RID);
            for (var i = 0; i < olds.length; i++) {
                if (!target || olds[i].parentNode !== target) olds[i].parentNode.removeChild(olds[i]);
            }
            if (!target) return;
            if (target.querySelector('#' + RID)) return;

            var txt = target.querySelector('.mes_text');
            if (!txt || !txt.parentNode) return;

            var b = document.createElement('button');
            b.id = RID;
            b.type = 'button';
            b.className = 'mf-regen';
            b.title = '重新生成这条回复';
            b.setAttribute('aria-label', '重新生成这条回复');
            b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
                + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M20.5 12a8.5 8.5 0 11-2.6-6.1"/><path d="M20.5 4v5h-5"/></svg>';
            b.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var opt = document.getElementById('option_regenerate');
                if (opt) opt.click();
                else alert('没找到原生重新生成入口');
            });
            /* 放在 .mes_text 后面 = 这条消息的最末尾 */
            txt.parentNode.insertBefore(b, txt.nextSibling);
        }

        /* 酒馆每次重绘消息都会换掉 .mes 元素 → 按钮会掉。
           MutationObserver 重新贴（幂等：已有就跳过）。
           用 subtree 是因为酒馆有时整块替换 .mes 的内部结构，
           只盯 #chat 的直接子节点会漏。 */
        var pending = false;
        var mo = new MutationObserver(function () {
            if (pending) return;
            pending = true;
            setTimeout(function () { pending = false; place(); }, 60);
        });
        mo.observe(chat, { childList: true, subtree: true });

        place();
        /* 兜底巡检：面板重开 / 节点整体重建时 observer 可能盯到死节点 */
        setInterval(function () { place(); }, 1200);
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

        APP.modules.chatPhoto = true;
        initChatPhoto();

        APP.modules.charWall = true;
        initCharWall();

        /* ★ v2.7.0：全局默认头像替换器。
           把酒馆自带的默认图（ai4.png / user-default.png / five.png）
           换成主人的两张图，每个位置各自随机。
           必须在 charWall 之后启动 —— 角色墙渲染时会先塞 ai4.png，
           替换器要能盯住那一下。 */
        APP.modules.defaultAvatar = true;
        initDefaultAvatarReplace();

        APP.modules.charDetail = true;
        initCharDetail();

        APP.modules.msgRegen = true;
        initMsgRegen();

        APP.modules.panelFolds = true;
        initPanelFolds();

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
