# 米白护眼 · 整套皮肤（mf-tavern-skin）

> **仓库 / 分发**：https://github.com/zhaoyichan/mf-tavern-skin
> 手机或别的电脑：酒馆「扩展 → 从 URL 安装」粘贴上面这个地址即可。
> 直接下载 zip：https://github.com/zhaoyichan/mf-tavern-skin/archive/refs/heads/main.zip
> 在线预览（世界书管理布局）：https://zhaoyichan.github.io/mf-tavern-skin/

## ★ 关键数据 + 踩坑清单（动手前先读这段）

| 项 | 实测数据 / 结论 |
| --- | --- |
| 版本 | v2.8.0；`manifest.json` **必须在仓库根目录**，酒馆才会认成一个扩展 |
| 实测环境 | TauriTavern Windows 客户端；手机 390px 宽 `(pointer:coarse)`；Clash Verge 代理 `127.0.0.1:7897`（不是 7890） |
| ★ 扩展静态资源 | **这个客户端不给 third-party 扩展开静态资源路由**：`/scripts/extensions/third-party/<name>/x.jpg` 与 `/extensions/third-party/<name>/x.jpg` 实测全是 404。→ 扩展要带图，只能 base64 内联成 data URI（注入脚本 `tools/inject_wall_imgs.js`） |
| ★ 性能真凶（v2.8.0 实测） | ① 启动卡 = `RecentRequestLog` 扩展（6534ms → 禁用后 127ms，它对每个 fetch 都 clone+解析响应体）② 打字卡 = 输入框**实时 token 计数**（每敲一字发一次 `count_openai_tokens_batch`，拦掉后 72.4ms → 57.6ms）③ 扩链自身只占 **3ms**（别夸大） |
| ★ CSS 只加载一份 | 主题槽位 `power_user.custom_css` 只放 **1,544 字符**「首屏骨架」（变量 + body 底色 + 聊天区全宽 + 顶栏），完整皮肤只由 `<link>` 提供。★ 实测 FCP 940ms vs 扩链加载 13853ms → 直接删光主题槽位会闪 13 秒，骨架方案不会。改 `skin.css` 的 `:root` 后跑 `node tools/check_boot_sync.js` 查同步 |
| ★ 首屏 | `first-contentful-paint` 实测 **396ms**；扩链 `index.js` 实际执行在 **13,853ms** |
| ★ 手机端 | 扩链代码电脑/手机同一份 → 手机端可卸载 `RecentRequestLog` 扩展，用扩链内置的「最近请求记录」（模块 13） |
| ★ 默认头像真相 | 客户端在 `characters.js:1038` 有一句 `if (!request.file) { await writeCharacterData(DEFAULT_AVATAR_PATH, ...) }` —— **新建角色卡没上传头像时，客户端把自带的 `default_Seraphina.png`（粉发少女）烤进角色卡 PNG**。所以「没加图片」≠「src 为空」，src 一直有值 |
| ★ 默认图判据（v2.7.0） | 三条判据并行：**A** 文件名 ∈ {`ai4.png`,`user-default.png`,`five.png`}（前端静态资源）；**B** 字节指纹 == 基准 `/thumbnail?type=avatar&file=default_Seraphina.png`；**C** persona 用 16×16 像素签名（阈值 8）。**只改 `<img>` 的 src，磁盘上的角色卡一个字节不动** |
| ★ 基准必须同管线 | 基准必须走 `/thumbnail` 缩略图接口，跟被判定对象同一套字节。直接拿 `/characters/default_Seraphina.png`（69296 字节）去比卡片缩略图（8800 字节）永远对不上 |
| ★ 字节指纹算法 | `fetch` → 总字节长度 + **步长 1013** 的抽样字节和。实测 12 张粉发卡：长度全 8800、采样和全 1415；4 张真头像分别 10934/7017/4803/4976 —— 完全分得开。1013 是质数且与 PNG 扫描线长度不同步 |
| ★ persona 要用像素判 | 用户槽位渲染的是 `/thumbnail?type=persona&file=1788261080182-.png` —— 文件名是上传时间戳、字节也和 `user-default.png` 缩略图差几字节（2756 vs 2762），**文件名判据和字节指纹都判不出来**。只能比像素：16×16 平均绝对差 0.09（同图）vs 79.1（粉发少女） |
| ★ 哪些默认图**不**换 | `default_Assistant.png` 是客户端自带助手卡的 **TauriTavern Logo 图**（不是粉发少女）→ 按主人的内容判据**不纳入**基准；`default_Seraphina.png` 是粉发少女 → **要换**（它自己也显示在角色墙上） |
| 照片的挂载点 | 扩链「照片」功能 v2.6.0 起：一张**全局**图（IndexedDB key = `__global__`），挂在**每个角色的最后一条** AI 消息上方（`.mes_block` 里，`.ch_name` 之后、`.mes_text` 之前） |
| 右滑重生成 | 原生 `.swipe_right` 箭头住在 `.swipeRightBlock` 里。点它 = 切下一条备选；**当这条已经是最后一条备选（`.last_swipe`）时再点 = OVERSWIPE → `OVERSWIPE_BEHAVIOR.REGENERATE` = 重新生成**（原生 `script.js` 约 10410 行） |
| 原生箭头的显隐 | 酒馆原生 `style.css` 两条规则决定它什么时候出现：`body:not(.swipeAllMessages) .mes:not(.last_mes) :is(.swipe_left,.swipe_right,.swipes-counter)` 和 `.mes:not(.swipes_visible,.last_swipe) :is(.swipe_right)` —— 所以最后一条消息上那个箭头**一直都在**，误触一次烧一次 token |
| ★ 隐藏 ≠ 删除 | 我们的面板用 `display:none` 藏原生节点（`#wi-holder`、`#rm_button_bar`），**节点还在 DOM 里 → JS `.click()` 照样能触发**（`display:none` 的元素也能派发 click）。这是「导入世界书」「新建角色卡」两个入口能低成本补回来的前提 |
| 用户消息的标记 | 酒馆用**属性** `is_user="true"/"false"`（`messageElement.attr({is_user: mes.is_user})`），**不是 class**。用 `classList.contains('is_user')` 判会永远判成 false，按钮会挂到用户自己那条消息上 |
| 备选计数器不能藏 | `.swipes-counter`（那个「1/3」的数字）可以点开**备选选择器**（`swipe-picker.js`，`SWIPE_SOURCE.SWIPE_PICKER`），是换回旧回复的唯一入口。藏箭头可以，藏它就再也回不去旧备选了 |
| 消息末尾按钮的落点 | 消息 DOM 是 `.mes`(flex 行) → `[.for_checkbox][.mesAvatarWrapper][.swipe_left][.mes_block][.swipeRightBlock]`，`.mes_block` 内才是 `.mes_text`。所以「消息最末尾」= 插在 `.mes_text` 之后（`.mes_block` 里），不是插在 `.mes` 里 |
| DOM 真相 | `#top-bar` 是 `absolute` 空壳（50vw×44），与 `#top-settings-holder` 是**兄弟节点**；9 个 drawer 全在 holder 里 |
| 九个 drawer | `ai-config-button` / `sys-settings-button` / `advanced-formatting-button` / `WI-SP-button` / `user-settings-button` / `backgrounds-button` / `extensions-settings-button` / `persona-management-button` / `rightNavHolder` |
| 正文铺满 | `--topBarBlockSize` 被 `#sheld` 的 `top` 和 `height` **同时引用**，只在宽屏精细指针下归零 |
| 字号硬约束 | `--mainFontSize = var(--fontScale) * 15px`。**不能改 `--fontScale`**（会连带顶栏高度、输入框），字号走 body 上的 `--mf-read-scale`，85%–160% 步进 5% |
| 玻璃质感 | 来自「半透 + 105° 斜向白色受光面（前 46% 渐隐）」，不是靠调亮度；把填充降到 .60 只会变成白板 |
| blur 判据 | 取决于**背后有没有内容**：背后是正文就开 `blur(16px)`（否则透出字影），纯色背景可关。603 条消息实测加 blur 后 16.68ms/帧 vs 16.65ms/帧，都是 60fps |
| ★ 最痛的坑 | **备份永远不放 `third-party/`**。酒馆按目录扫 `manifest.json`，一个目录 = 一个扩展实例；三份 skin.css 同优先级互压 → 启动几秒后整个界面卡死，关掉重开依旧，日志无报错 |
| 测试页坑 | 没有 `<meta name="viewport" ...>` 时 CDP `mobile:true` 会得到 `innerWidth=980`，媒体查询全不命中，会误判成 flex 写错 |
| 回头路 | 扩展设置里常驻「还原原生 / 用回扩展顶栏」**双向**开关；`a==='native'` 不能只写死一个方向。注入卡片不能用 `isOn()` 判断是否显示 |
| 发版口径 | `docs/` 是 GitHub Pages 源；仓库只放扩展本体 + `docs/`；备份、调试脚本、DOM 快照、截图以外的临时产物、本地经验文档**一律不提交** |

酒馆（SillyTavern / TauriTavern）的一整套米白护眼外观 + 界面改造，全部收在一个扩展里。
装上它，外观就是这个样子，不需要再手动改 `data/_css/user.css`。

## 安装

**方式 A · 从 URL 安装（推荐，手机也能用）**

1. 打开酒馆 →「扩展」→「安装扩展 / 从 URL 安装」
2. 粘贴：`https://github.com/zhaoyichan/mf-tavern-skin`
3. 等它自己拉完，重启或刷新（Ctrl+R）酒馆生效

**方式 B · 手动放文件夹**

1. 下载 zip：`https://github.com/zhaoyichan/mf-tavern-skin/archive/refs/heads/main.zip`（解压后取根目录内容，别套一层文件夹）
2. 把整个 `mf-tavern-skin` 文件夹放进 `data/extensions/third-party/`
3. 重新打开酒馆，进「扩展」面板确认有「米白护眼 · 整套皮肤」
4. 如果没生效，刷新一次（Ctrl+R）或确认扩展已启用

> `auto_update` 故意留 `false`：装好后不会被未测试的新提交自动覆盖，要更新自己点。

> **⚠️ `third-party/` 下只许有一个 `mf-tavern-skin` 目录**
>
> 酒馆是按目录扫 `manifest.json` 的 —— 只要子目录里有合法 manifest 就是一个扩展。
> 所以**备份、旧版本、`mf-tavern-skin_backup_xxx`、`mf-tavern-skin (1)` 这类副本
> 一律不能留在这个目录里**，否则会有多份 `skin.css` 同时注入、规则互相覆盖
> （旧版是「靠左胶囊」，新版是「铺满通栏」，谁也压不死谁），表现为
> **酒馆启动几秒后整个界面卡死、关掉重开依旧**，而且日志不报任何错。
>
> 备份放别处，例如 `D:\tavern-skin\_backups\`。检查方法：
>
> ```
> ls -d data/extensions/third-party/mf-tavern-skin*
> # 必须只有一行
> ```

## 包含什么

| 模块 | 内容 |
|---|---|
| `skin.css` | 整套皮肤：米白配色、正文直排（无气泡框）、去头像、93% 宽、17px/1.9、对话淡米金高亮、输入栏、快捷操作浮层 |
| `index.js` → style-guard | 把样式表钉在 `head` 末尾，保证盖得住主题的自定义 CSS |
| `index.js` → qr-handle | 输入框右上角小把手，点它才展开「小剧场 / 删去本轮 / 隐藏本轮」那排 |
| `index.js` → preset-panel | 预设面板（AI 响应配置）：生成参数折叠、token 总览、条目搜索、行内编辑、查找/替换、整体替换、自动存、占比条 |
| `index.js` → world-panel | **世界书面板（v2.0.0）**：直接替掉原生 #WorldInfo 的内容区，三级列表 / 跨书搜索 / 全字段编辑 / 新建书与条目 / 批量 / 整本启停 / 全局激活设置，**改了就自动存** |
| `index.js` → topbar | 顶栏改造：九个图标靠左一排、换成自己的线条 SVG、最左一颗折叠键（收起全部 / 记忆）、长按或右键任意图标可以单独隐藏，全部能恢复 |
| `index.js` → api-panel | 连接配置面板：分组盒 + 整张表单（上下两层、零嵌套），新建走 pendingNew 虚线 ghost 行，保存才落库（localStorage `mf_api_profiles_v1`） |
| `index.js` → chat-photo | 聊天里的照片：宽高解耦 + 裁剪框真联动、只底部渐变、形状/大小/渐变可调、收起时后端不渲染（IndexedDB 按角色名存） |
| `index.js` → char-wall | **角色墙（v2.2.0）**：接管角色列表成 3 列墙 + 左上 2×2 hero，顶部四排按钮收进「⋯」。只加 class + 全 CSS，**不重建 DOM、不动原生事件** |
| `index.js` → char-detail | **角色详情页（v2.4.1）**：点格子不再进编辑面板，而是**在右抽屉里**滑入一页；聊天列表走真实接口，点哪段进哪段 |
| `index.js` → panel-folds | 世界书 / 预设面板顶部折叠：`#wiTopBlock`、采样滑条、预设标题行与图标簇收进标题行「⋯」，找得到节点才动手，找不到一个 class 都不加 |
| `index.js` → msg-regen | **消息末尾 ⟳ 重新生成 + 禁滑动误触（v2.5.0）**：藏掉原生右箭头，改成消息末尾一个 22px 的 ⟳ 小按钮；横向拖动直接掐断 |

后续还会往里加：侧栏/抽屉统一、弹窗与表单。

## 预设面板（v1.1.0 起，v1.3.0 补齐工具条与搜索过滤）

打开「AI 响应配置」面板后：

| 位置 | 做什么 |
|---|---|
| 顶部数字卡 | （预设选择条下面第一块）已开启几条 / 一共几条、这些条目占多少 token、占上下文百分之几。**只算预设里已开启的条目**，不含聊天记录/世界书/角色 |
| 「生成参数」 | 默认收起，只留一行摘要（温度 · 上下文 · 回复）。点一下展开全部滑杆。**窄面板放不下时摘要自动换到第二行**，不会把数字截成"上下文 200…" |
| 「条目 N」工具条 | 列表头上：左边是条数（搜索时显示「4/21」），右边四个按钮 = 🔍 搜索 / ⇕ 收起展开的条目 / ＋ 新建条目（走酒馆自己的命名框，identifier / prompt_order 全由酒馆写）/ 🔒 锁定拖动 |
| 条目列表 | 每条一行，行间一条 1px 细线：拖动把手 + 名字 + 正文预览 + token + 铅笔 + 开关。结构零改动，预览行是 CSS 生成的 |
| 点条目 | 就地展开编辑器：正文、名字、角色、注入深度；**停手一秒自动存**，没有保存按钮 |
| 放大镜 | 整段搜索。换行、多打空格、全角半角标点都不影响。**搜索时列表只留命中的条目**（其余整行隐藏），命中行左侧一道浅黄竖条，行摘要从第一处命中开始截；0 命中时显示「没有条目含这几个字」并把整体替换灰掉 |
| 🔒 锁定 | 锁上后**条目拖不动**（桌面端酒馆是整行可拖，光拦把手没用，所以直接 disable 掉 sortable）；把手变淡、光标变成不可拖。状态记在 localStorage，刷新后仍然锁着。解锁：再点一下。点条目名 / 铅笔照常能打开编辑器 |
| 编辑器里的「查找 / 替换」 | 只改这一条，`‹ ›` 跳处、单处替换、全部替换、撤销 |
| 列表底部「整体替换」 | 跨条目替换：改哪里（正文/名字/两样）× 改哪些（全部/已开启/已关闭），可撤销 |
| 插入点（聊天记录、世界书前后…） | 显示「插入点」，不能编辑正文，但**可以拖动**决定位置（锁定时不能），也可以开关 |
| 原生底部工具条 | **已隐藏**（Append prompt + 5 个图标，设计稿里没有）。新建走「条目」右边的 ＋，删除在行内编辑器里，导入/导出在顶部预设条 |

保存是两层的：每次停手写一次 settings，再等 1.5 秒把**预设文件**也写掉
（用的是 `savePreset(..., {skipUpdate:true})`，静默、不弹提示）。
所以改完直接切预设、切回来，内容还在。

## 顶栏（v1.9.0）

那排九个图标（预设 / 接口 / 格式化 / 世界书 / 用户 / 背景 / 扩展 / 人设 / 角色卡）+ 最左一颗折叠键，收进**靠左一条小玻璃胶囊**（约 390×40）；图标换成和皮肤同一套的线条 SVG。

**胶囊是浮层，不占正文的位置**（v1.9.0）：

- 桌面展开时正文从**屏幕最上方**开始铺满，胶囊像一片压在纸上的玻璃浮着 —— **只有它自己盖住的那块会挡字**，右边那一大片照常排正文，滚动时内容从它底下穿过去；
- 因为背后真的有文字在过，胶囊用了 `backdrop-filter: blur(16px)` 把字化成柔和色块（这才是磨砂玻璃）。实测 603 条消息滚动，开/关这个模糊都是 60fps（16.68 vs 16.65 ms/帧），开销可忽略；
- **手机相反**：宽 ≤768 或触屏时胶囊退回文档流、十颗均分**铺满整行**、正文从它下面开始。手机屏只有 390px，浮一条在字上会横着压住第一整行。

> **形态翻过两次，别再自己发挥**：v1.5 的胶囊被说「那么素」（填充近实心、没有受光面），v1.6 的横贯通栏被说「不太行、回归上一版」。v1.8 的定论是「形态要小、质感要真」，v1.9 又往前一步：**要小到能浮起来、让正文从旁边和底下流过去**。原因和改法都写在 `skin.css` 11.1 / 11.2 / 11.5b 的注释里。

| 想干什么 | 怎么做 |
|---|---|
| 收起全部图标 | 点**最左边那颗**（横线 + 箭头）。**整条收走**：顶栏高度归零，正文立刻顶到屏幕最上面，只剩左上角一颗半透明小浮片。箭头会掉头，展开时朝上、折叠时朝下。状态记住，重启还是上次那样 |
| 收起某几颗不用的 | **长按**或**右键**任意一颗图标 → 它当场收走，右上角弹「已隐藏「背景」· 撤销」，3 秒内点撤销就回来 |
| 批量管理 / 找回关掉的 | **长按**或**右键**顶栏任意位置（折叠键、图标、空白处都行）→ 打开「顶栏设置」清单。九行逐行开关，关掉的会划线标「已隐藏」，底部有「全部恢复」 |
| 正文字号不合适 | 同一张面板里「正文字号」那一行：`A−` / `A+` 每次 5%，范围 85%–160%，中间数字点一下回 100%。只放大正文，顶栏和输入框不动，记住上次的值 |
| 不想要这套改动 | 同一张清单底部「还原原生顶栏」→ 立刻回到酒馆原样（图标、九等分、底色全回来）。**字号是你自己调的，还原顶栏不会把它改回去** |
| 还原之后想换回来 | **酒馆自己的「扩展设置」抽屉里第一块就是「米白皮肤 · 顶栏」**，点「用回扩展顶栏」；或者长按 / 右键顶栏任意位置，面板底部那颗按钮这时会变成「用回扩展顶栏」 |

**为什么非要在扩展设置里放一块**

顶栏一还原，页面上就再没有皮肤的东西了 —— 折叠键跟着 `body.mf-tb-js` 一起消失，只剩「长按 / 右键」这种看不见的手法。v1.6.0 那版按钮还是单向的（点了只能关），用户点完就真找不到回来的路。所以 v1.7.0 做了三件事：

1. 那颗按钮变成**双向**：`还原原生顶栏` ⇄ `用回扩展顶栏`，文案跟着状态走；
2. 关掉时弹一条 **8 秒**的说明条「长按或右键顶栏图标可换回」，带一个「换回」按钮；
3. 在酒馆 `#extensions_settings` 里注入常驻卡片（**注入不判断 `isOn()`**，否则还原后它自己也消失，等于白做）。

**三条硬规则**

- **清单永远是全集**。只列当前看得见的，关掉的那颗就再也叫不回来了。
- **折叠键不参与隐藏**，它是管理入口，关掉就等于把自己锁在门外。
- **折叠必须是「整条收走」**，不能只是把图标宽度收成 0。只收图标的话，`--topBarBlockSize` 还占着 44px，正文会被一条空带挡在下面 —— 这才是用户说的「被顶部莫名其妙的栏遮住」。详见下面实现要点第 4 条。

**真机实现要点**（改这块之前先读）

- `#top-bar` 和 `#top-settings-holder` 是**兄弟节点**，不是父子。`#top-bar` 是个空壳，只负责背景和阴影；九个 `.drawer` 全在 `#top-settings-holder` 里。所以旧写法 `#top-bar .drawer-icon` 从来没生效过。
- 原生是「九等分整条」（`.drawer{width:100%}` + holder `justify-content:center`），要改成靠左一排必须同时改 holder 和 `.drawer`。
- 折叠键**刻意不用 `.drawer` / `.drawer-toggle` 结构**：酒馆的 `doNavbarIconClick` 绑在那个 class 上，会给我们那颗 toggle 一个 `openIcon`（白片），而它里面没有 `.drawer-content` 可以关掉，状态就永远错。
- 所有样式挂在 `body.mf-tb-js` 下面。class 一摘，第 11 节全部失效 → 完整回原生。**新加规则必须继续挂在这个前缀下。**
- 图标的 key 用抽屉 id（`backgrounds-button` 这种）；第三方扩展插进来的抽屉没有 id，用图标 class 兜底（`x:fa-cubes`）。**绝不能用下标**：扩展升级多插一颗，后面全体后移，用户之前藏的会变成别的按钮被藏掉。
- ★★ **`backdrop-filter` 会让这个元素变成所有 `position:fixed` 后代的包含块**（和 `filter` / `transform` 同罪）。实测：父级无模糊时，fixed 子元素 `height:100%` = 1080（视口高）；父级有 `backdrop-filter:blur()` 时 = **40**（父级自身高度）。
  酒馆的预设面板 `#left-nav-panel`（`.fillLeft`）、右侧面板（`.fillRight`）、`#WorldInfo`、`#floatingPrompt` 全是 `position:fixed`，靠 `height:100%` 撑满全高 —— 挂到胶囊下面后当场塌成 `min-height:100px` 的一条，窄用 `calc((100vw - sheldWidth)/2)` 算出来 480，就是用户报的「全屏打开预设，右上角小小一坨，像胶囊」。
  **所以胶囊的模糊只能挂在 `::before` 上，不能写在 holder 本身。** 伪元素没有 fixed 后代，视觉完全一样。改这块前先确认这两条别再被写回 holder。

**4. 折叠怎么做到「正文露出来」**：真机只有一个开关 —— `--topBarBlockSize`。`#sheld` 的 `top` 和 `height` 同时引用它（`st_style.css:775-779`），所以折叠时把它归零即可，聊天区自己撑满，不用手算高度：

```css
body.mf-tb-js.mf-tb-col { --topBarBlockSize: 0px !important; }
body.mf-tb-js.mf-tb-col #top-bar { display: none !important; }
body.mf-tb-js.mf-tb-col #top-settings-holder { position: fixed; top: 6px; left: 8px; }
```

变量写在 `body` 上而不是 `:root`：撤掉 class 就干净还原，不污染主题。

**5. 「淡」和「玻璃」是两个方向，得同时按住，而且要看形态**。同一个填充值，放在通栏和放在胶囊上观感完全不同：

| | 通栏（v1.6，已废） | 胶囊（v1.8，现行） |
|---|---|---|
| 边缘 | 没有边缘 → **不能**画描边/圆角/投影，一画就像贴纸 | 有边缘 → **必须**画出来，否则边界糊在纸里 |
| 填充 | `.93/.84/.76`（无边界就得实一点） | `.90/.78/.64` 竖向渐变 |
| 反光 | 不需要 | **必须有**：105° 斜向白光扫过前 46% 渐隐 |
| 投影 | 无 | 三层（贴地 1px / 近影 / 远影），最深只到 `.55` |
| blur | 无（性能） | 无（性能，且无视觉收益） |

胶囊被说「素」的真根因是**填充近实心（.96/.90/.88）+ 没有任何反光**：一块刷了漆的白板。玻璃的观感来自「透」和「受光面」，不来自亮度。所以现在 alpha 降下来、加一道斜向反光，边缘用 `1px rgba(186,170,141,.78)` 勾住。

**`backdrop-filter` 不是「能不能用」，是「背后有没有东西」。** 判断标准只有一条：

| 胶囊背后是什么 | 该不该开 blur |
|---|---|
| 纯米白纸面（v1.5~v1.8 的占位形态） | **不要**。模糊纯色等于没模糊，纯吃 GPU |
| **有正文在滚**（v1.9 的浮层形态） | **必须**。不开的话半透胶囊会透出字影（"A" 图标旁能看到「砚」字），比糊掉难看十倍 |

v1.7.1 那次「酒馆卡死」是 1280×44 的大面积模糊 + 三份 CSS 互压，不是 blur 本身的错；现在这块只有 390×40，实测 603 条消息滚动 60fps 不掉帧。**要删它之前先量尺寸、先看背后有没有内容。**

**6. 图标浓度是跟宽度联动的**。同一套图标，挤在 390px 胶囊里 `.70` 才清楚；铺满 1280 通栏时要降到 `.58` 才不吵。**改形态必须回头看这个值。** 图标尺寸同理：胶囊 34×34 / svg 21px，手机铺满时 svg 20px，窄屏 30、极窄 24。

## 世界书面板（v2.0.0，2026-11-05）

侧栏点「世界书」，抽屉里就是这一版 —— **原生那套书下拉 + 条目列表被整块替换**，
不是并排两套。原生控件仍然留在 DOM 里（只是 display:none），所以切书、全局启用、
书名刷新还是走酒馆自己的逻辑，不会打架。

### 能做什么

| 位置 | 做什么 |
|---|---|
| 一级（书列表） | 13 本书按「已启用 / 未启用」分组；点整本开关 = 加进全局世界书；星标置顶（本地记）；齿轮打开**全局激活设置**（扫描深度 / Context% / 预算 / 递归 / 区分大小写…改完直接写进酒馆设置） |
| 搜索框（一级） | 一处搜**所有书**的标题 / 关键词 / 正文，按书分组出结果；点结果直接跳进那本书并展开条目 |
| 二级（书内） | 共几条 / 启用几条 / 常驻几条 / 多少 token + 占比条；筛选「全部 / 常驻 / 关键词 / 禁用」；排序「自定义序 / 标题 / Token / Order / 触发%」；新建条目 |
| 条目行 | 点亮小圆点 = 启用/停用；点行 = 展开编辑区 |
| 编辑区 | 标题、正文（实时算 token）、三档（禁用 / 关键词 / 常驻）、主关键词、可选过滤、插入位置、深度、Order、触发%、包含组、组权重、Sticky / Cooldown / Delay；「高级设置」里还有关键词逻辑、选择性、向量化、递归、忽略预算、附加匹配源、Outlet |
| 底部 | 副本 / 删除 / 收起 |
| 书页顶栏 ⋯ | 导出本书 JSON / 删除整本世界书 / **临时切回原生面板**（改名、导入、应用排序用原生做，刷新回来） |

### 自动保存

- 改了任何东西 → 700ms 后自动写盘（走 `saveWorldInfo`，会同步原生缓存）
- 搜索框下面那行小字是状态：`正在保存…`（金点）/ `已保存`（绿点，1.6 秒后自己消失）/ 红字报错
- 关掉抽屉不会丢，因为已经存进去了
- 保存失败会在那行红字显示原因，不会静默坏掉

### 注意事项

- **新建书之后下拉里立刻有它**，但如果你马上在原生面板里按老路子找，可能要多等半秒
- 星标置顶存在 localStorage（`mfWbPins`），不进世界书文件
- token 数是「字符数 × 0.6」估算 —— 酒馆的 tokenizer 没暴露给扩展
- 删除都只弹一次确认，**没有回收站**
- 想回旧版（只有搜索栏那一版）：把 `boot()` 里 `initWorldPanel()` 换回 `initWorldSearch()`，
  旧函数还在 index.js 里没删

## 设计口径（别改回去）

- 米白偏白浅色系，**不要绿色**
- 强调色 = 暖灰褐 taupe `#8d8271`，只用在名字 / 焦点 / 图标
- 正文直排：无气泡框、无底色、无阴影、无头像
- 字号 17px、行高 1.9、消息块 93% 居中（正文可在顶栏设置里 85%–160% 微调，只动正文）
- 对话用淡米金高亮，只盖文字下半截，不盖「」引号
- 不换字体（楷体 / 宋体方案已被明确否决）

## 兼容性

- 目标环境：Android 12 / Chrome 97 WebView（以及桌面）
- **不用 `color-mix()`**：Chrome 111 才支持，旧内核上不报错、只是安静失效 → 全部写成固定 `rgba()`
- 需要 `<q>` 标签做对话高亮 —— 酒馆 `script.js` 的 `messageFormatting()` 会自动包，无需正则
- 不用任何第三方字体

## 卸载

删掉整个 `mf-tavern-skin` 文件夹，重启酒馆。
如果之前在 `data/_css/user.css` 里留过同一套样式，一并还原成空文件，否则皮肤还在。

## 排错

打开控制台（F12）看 `[米白护眼]` 开头的日志：

- `皮肤 v1.9.1 已就位（主题接管：开/关）` → 正常（旧版这里写「样式表提升 N 次」，已废弃）
- `皮肤 v1.3.0 已就位（样式表提升 N 次）` → 正常
- `预设面板已接管（1.3.0）` → 预设面板改造生效
- `skin.css 没找到` → 扩展没被加载，检查文件夹位置与 manifest
- 完全没有日志 → 扩展的 `index.js` 没执行，看扩展面板是否启用

## 三个补回来的入口（v2.5.0，2026-11-22）

这一版只做三件事：**把被我们盖住的原生入口补回来**，外加**堵掉误触重新生成**。

### ① 世界书「导入」

| 项 | 说明 |
|---|---|
| 位置 | 世界书面板**一级页**（书列表页），「新建」chip 右边紧挨着 |
| 支持格式 | 跟原生一样：`.json` / `.lorebook` / `.png`（PNG 角色卡里内嵌的世界书） |
| 实现 | JS 直接 click 那个「看不见的」原生 `#world_import_button` —— 它被我们用 `display:none` 藏起来的 `#wi-holder` 一起盖住了，但节点还在，click 照样派发，酒馆自己走原生导入通道（认得全部格式、还弹它自己的提示） |
| 导入完 | 自动把新书刷进面板（轮询书名清单 → `loadAll(true)` → 重绘），不用手动重开面板 |

> 为什么不自己解析文件：自己写解析器 = 把酒馆在 PNG/ lorebook 上的坑重踩一遍。
> 为什么不把原生那排按钮整个放出来：那排是酒馆的原始外观，跟这套面板不是一个东西。

### ② 角色墙「＋ 新建角色卡」

| 项 | 说明 |
|---|---|
| 位置 | 角色墙顶部那一行：**`[搜索框][＋ 新建][⋯]`**，新建常显，不再藏进「⋯」 |
| 为什么原来没有 | 原生 `#rm_button_create` 一直都在，但收起态整条 `#rm_button_bar` 被 CSS 藏了（`.mf-tools:not(.mf-tools-open) #rm_button_bar { display:none !important }`）→ 墙上只看得见卡片，找不到「新建」 |
| 实现 | 点它走原生 `#rm_button_create` 的 click（原生处理器 = `selected_button='create'; select_rm_create();`），新建表单完全由酒馆自己管，我们不重建 |
| 展开「⋯」后 | 原生那排（新建 / 导入 / 外链导入 / 建群 / 扩展按钮 / 排序 / 搜索切换）照旧全在，没动 |

### ③ 消息末尾 ⟳ 重新生成 + 禁滑动

| 项 | 说明 |
|---|---|
| 原来为什么误触 | 原生消息右边缘那个 › 箭头：点是「切下一条备选」，**当这条已经是最后一条备选时再点 = 重新生成**。它一直显示在最后一条消息上，看着像装饰，碰不得 |
| 现在 | 箭头藏起来（只藏 `.swipe_right`，**`.swipes-counter` 那个「1/3」的数字留着**，点它照样能开备选选择器换回旧回复）；改成**消息正文末尾一个 22px 的 ⟳ 小圆钮**，点它 = 重新生成这一条 |
| 按钮只出现在哪 | 只有**最后一条是 AI 消息**时才有（原生箭头也只对最后一条生效）。中间消息没有「原地重生成」这回事，硬塞会造成「点了却重生成最后一条」，比没有更误导 |
| 点它走哪 | 原生 `#option_regenerate`（原生入口 → `Generate('regenerate')`）。我们不自己调 `Generate()`：自己调要处理 `is_send_press`、swipe 状态、分组聊天等一堆分支，点原生那个 `<a>` 等于用户亲手点一次 |
| 滑动 | 在 `#chat` 上用**捕获阶段**监听 pointer/touch 事件，横向拖动（横向位移 > 18px 且明显大于纵向）就 `stopPropagation` 掐断，酒馆收不到这次拖动 |
| ★ 为什么只 stopPropagation | 不 `preventDefault` —— 那会把「鼠标拖动划词选中」和「竖向滚动」一起废掉 |
| ★ 为什么必须捕获阶段 | 冒泡阶段 `#chat` 已经是最后一个目标，酒馆绑在 `.mes` / `document` 上的监听器早就跑完了，拦不住 |

> 换回旧回复：点消息右下角那个「1/3」数字 → 备选选择器。
> 想换回原生箭头：把 `skin.css` 里 `#chat .swipe_right { display:none !important }` 这行删掉即可。

## 版本

1.0.0 — 2026-11-04 首次合并（皮肤 + 快捷操作把守）
1.1.0 — 2026-11-04 预设面板落地（折叠 / token 总览 / 搜索 / 行内编辑 / 替换 / 自动存）
1.1.1 — 2026-11-04 按真实 DOM 重排（上一版只折叠了 #openai_settings，
        漏掉滑杆所在的 #respective-ranges-and-temps，条目也被挤成横向溢出）
1.2.0 — 2026-11-04 推翻重做：条目行不再用 JS 建节点，改成「只写属性 + 纯 CSS」。
1.2.1 — 2026-11-04 找回设计稿里的工具条：折叠态被自己的 CSS 连坐隐藏，
        搜索 / 收起 / 新建三个按钮和 token 总览一起消失；顺带修了
        开关被酒馆原生 opacity:.4 压成浅灰、铅笔黑晕、窄面板摘要截断；
        隐藏酒馆原生底部工具条（Append prompt + 5 个 FA5 旧图标，设计稿里没有）。
        上一版每行都建 .mf-pm-main / .mf-pm-preview / 自绘铅笔按钮，60 多条 × 每次
        列表重画 = 几百次 DOM 操作 + 两轮重排（用户原话「不觉得这个很卡吗」），
        而且自造节点和原生 grid 抢位置，在真机 250px 窄面板里就叠在一起了。
        现在：
        · 预览行 = li::after { content: attr(data-mf-prev) }，JS 只 setAttribute
        · 拖动把手 = grid 第 1 列（原来是 absolute，窄面板下会压到文字上）
        · 铅笔 = 原生 .prompt-manager-edit-action（不再自建按钮），点它开行内编辑器
        · 折叠 = #ai_response_configuration 上一个 class + display:none，不搬节点
        · 列宽/字号/透明度按实测给 !important（原生是 2 个 id 的选择器）
        实测：250px 下四列 13/122/30/52 首尾相接零重叠；869px 下 13/747/34/56
1.1.3 — 2026-11-04 控件返工：隐藏酒馆自带的铅笔/拆链（FA6 缺字形，真机显示成两个
        灰方块），换成自家 SVG 铅笔按钮（常显，点它展开行内编辑器）；插入点行给锁；
        右侧顺序改成 token → 铅笔 → 开关（对齐设计稿）；token 列与开关宽度加
        !important（实测被原生 2-id 选择器压成 80px / 18px）；
        decorate 全部容错 + 1.5s 自愈轮询 + localStorage 自检快照
1.1.2 — 2026-11-04 条目可读性返工：预览行/token 由 #a9a49a 提到 #746d60 / #7e786b
        （原色在米白底上只有 2:1，等于看不到字）；去掉每行重复的「系统」标签和行底
        占比条；行间加 1px 细线；拖动把手用 SVG 六点替掉 `☰` 字符（真机字体缺字形，
        渲染成两块豆腐）；开关由 34×20 全圆胶囊改成 32×18 圆角槽（原来两端是半圆，
        看着像两个球）
1.9.2 — 2026-11-05 正文左右留白可调 + 抽屉面板让出胶囊（用户原话：「能不能加个
        间距，就是正文离两边屏幕的这些距离」「你点开扩展，那个工具栏是比扩展这个
        界面高的，这样的话好切换一点，而不是被拦着」）：
        ① 留白走 `--mf-read-pad`（百分比 0~12%，步进 0.5%，默认 3.5%）。
        `.mes` 宽度 = 100% − 2×留白。默认 3.5% 和旧版写死的 93% 完全等价，
        不调就还是原来的观感。**手机段原来写死 `width:100%`（左右只剩 2px
        padding），是「贴边」的真正原因**，这次一并改成同一套变量。
        用 % 不用 px：用户明确要「手机电脑都按比例」，px 在 1280 上看不出、
        在 390 上又会把正文挤成一列。
        ② 长按折叠键 →「左右留白」一组 −/+ 控件，点中间数字回默认 3.5%。
        ③ 抽屉面板下移 44px（相对 holder），胶囊永远露在外面可点。
        ★ 根因不是 z-index：`.drawer-content` 是 `absolute; top: var(--topBarBlockSize)`，
        而宽屏为了正文铺满把 `--topBarBlockSize` 归零了 → 面板从 y=0 开始，
        直接把胶囊盖住。调层级没用，得让位置。
        ④ ★ 修一个自己挖的坑：胶囊上的 `backdrop-filter` 让 holder 变成了
        **所有 position:fixed 后代的包含块**，于是 `.fillLeft`（预设面板）、
        `.fillRight`（右侧面板）、`#WorldInfo` 的 `height:100%` 从「视口 1080」
        变成「胶囊 40」，再被 `min-height:100px` 兜底 —— 全屏一开预设就是
        480×100 的一条横片（用户原话「小小的一坨，像胶囊」）。
        修法：模糊挪到 `#top-settings-holder::before`（视觉一样，零副作用），
        holder 自身 `backdrop-filter:none`；另外给 fillLeft/fillRight 显式写
        `top:52px; height:calc(100dvh - 52px)`，世界书 `#WorldInfo` 也挪到 52。
        ⑤ 实测（1920×1080，真机 DOM 快照）：预设面板 479×1028 @ (0,52)；
        右侧面板 479×1028 @ (1441,52)；世界书 960×436 @ (480,52)；
        普通抽屉 960×899 @ (11,53)；holder 的 backdrop-filter = none，
        ::before = blur(16px) saturate(1.08)。
1.9.1 — 2026-11-05 整套外观总开关 + 主题接管（用户原话：假设我另一个手机美化是
        「报纸」，我安装扩展了，它会直接覆盖在报纸上面，导致界面还有报纸的风格）：
        ① 病根一：旧版只是把米白「盖」上去（!important 压），没压到的属性仍然是
        主题的。报纸主题的 custom_css 有 14,912 字符，微信读书-米有 54,825 字符，
        同优先级下它在我们后面 → 它赢。
        ② 病根二：style-guard 为了让 link 排在最后，每次 head 有新增节点就
        `head.appendChild()` 挪一次；主题切换也会往末尾塞 <style>，两边来回抢 →
        打开酒馆时 米白→报纸→米白→报纸 连闪三四下（用户实测反馈）。
        ③ 改法：不抢顺序，直接关掉对方。`#custom-style` 是酒馆写死的 id
        （st_power.js 的 applyCustomCSS 里 styleId='custom-style'），<style> 支持
        disabled，设 true 后整张表不参与层叠计算 —— 报纸一行都不生效。
        ④ 开关：`mf_skin_on`（默认 '1'）。开 = 先启用 skin.css、再禁用主题、
        再开顶栏；关 = 先撤顶栏、再清掉注入的 SVG 与折叠键、再禁用 skin.css、
        最后恢复主题。顺序反了会出现「原生样式 + 改造后顶栏」的错位帧。
        ⑤ 关闭时必须手动清 `.mf-tb-svg` / `.mf-tb-tg`：link 一停用，CSS 里那条
        隐藏规则也没了，不清就是「原生 FA 图标 + 我们的 SVG」叠成两个。
        ⑥ 加载时也套一遍开关状态（applyLinkState），否则「关掉 → 重启酒馆」会
        变成「米白配色 + 原生顶栏」的半套状态。
        ⑦ 入口在扩展设置卡片第一行「整套外观」，旁边状态会写「已接管 · 整套米白」。
        ★ 已知边界：主题的 --SmartTheme* 是 JS 内联写到 html 上的，不在
        custom_css 里；avatar_style / chat_width 这类也是 JS 行为。禁用 custom_css
        只干掉 CSS 层，这些靠 skin.css 的 !important 压。如果用户反馈某处颜色
        还不对，要按他指的位置单独补变量，别再整张重写。
1.9.0 — 2026-11-04 胶囊改成浮层，正文铺满整屏（用户原话：这一横排你的只占二分
        之一，后面还有一半可以让它被正文露出来，展开的面积会挡着正文，但其他
        地方不会挡）：
        ① #top-settings-holder 从「文档流里的一条」改成 position:fixed（10, 8）
        + z-index 4000 —— 不再占位，正文可以流到它右边和下面。
        ② 新增 11.5b：`@media (min-width:769px) and (pointer:fine)` 下把
        --topBarBlockSize 归零，展开态 #sheld 也从 y=0 开始（原来只有折叠态归零）。
        **用媒体查询包住**是为了不碰手机：手机是铺满整行，浮上去会横着压住第一行，
        而且这样也不用把酒馆原始 --topBarBlockSize 存一份。
        ③ #top-bar 加 pointer-events:none —— 它 50vw×44px 透明但会拦点击，
        正文顶上来之后顶部那一片消息会点不动、选不了字。
        ④ 背后有正文了 → 加回 backdrop-filter: blur(16px) saturate(1.08)。
        不加会透出字影（实测 "A" 图标旁能看到「砚」字）。面积只有 390×40。
        ⑤ 手机媒体查询里把 holder 复位成 position:relative（否则 100% 宽的顶栏
        浮起来会压住正文第一整行）。
        ⑥ JS 一行没动。
        实测：1280 展开 holder fixed@(10,8)、sheldTop=0 高 799、topBarBlock=0px、
        #top-bar pointer-events=none、(600,14) 命中正文 ch_name、(300,14) 命中图标；
        滚动 603 条消息：开 blur 16.68ms/帧、关 blur 16.65ms/帧（都满 60fps）；
        390 手机：holder relative W=390、sheldTop=79、topBarBlock 为原值、blur=none。
1.8.0 — 2026-11-04 外观回归 v1.5 的靠左胶囊，功能一个不动（用户原话：把这一个
        顶部栏做成之前那样子吧，就是之前展开后那个小小的样子，那个胶囊的样子，
        你这个不太行，就是回归上一版，但是功能不要回归）：
        ① 11.1 #top-bar 从「横贯整屏的玻璃带」改回彻底透明 —— 胶囊自己画边缘，
        底下不能再垫一条 50vw 的色带。
        ② 11.2 holder 改回 width:max-content + margin:2px 0 0 10px +
        justify-content:flex-start，圆角 13 / 描边 1px；.drawer 回到 flex:0 0 auto。
        去掉均分和 max-width:104（那是通栏专用的）。
        ③ 质感不再直接拷 v1.5：填充从 .96/.90/.88（近实心，被说「素」）降到
        .90/.78/.64，并加一层 105° 斜向白光（前 46% 渐隐）当受光面；
        外影最深从 .95 降到 .55（原来那圈像块脏印子）。
        ④ 图标 36→34、svg 22→21；折叠键从「均分+max-width:104」回到
        flex:0 0 auto + 右侧 4px 分隔线；折叠键 svg 20→19。
        ⑤ 11.10 手机段把 v1.5 的「铺满整行」整套写回来（holder 100% / 九格
        flex:1 / 去胶囊 / 折叠键不分隔）。桌面小、手机满，形态翻转重新成为必需。
        ⑥ JS 一行没动，只改了两处注释 + 版本号。所有功能（折叠整条收走 / 单颗
        隐藏撤销 / 面板字号 / 还原原生三层回头路）实测全部保留。
        实测：1280 holder=369 高 40；折叠 topBarBlock=0 / sheldTop=0 / 浮片 30×30；
        字号 110% → 正文 16.9→18.6 而顶栏高仍 40；390 手机 holder=390、九格各 40；
        还原原生 holder=640（50vw）、tg/svg 全 none。
1.7.1 — 2026-11-04 卡死事故修复（用户报「酒馆卡死了，关掉重开也是」）：
        ① **真根因：备份目录被当成扩展加载了**。third-party 下同时存在
        mf-tavern-skin(1.7.0) / _backup_before_v160(1.5.0) / _snapshot_v170(1.7.0)
        三个目录 → 三份 skin.css 全注入，且 v1.5 的「max-content 靠左胶囊」
        与 v1.7 的「width:100% 通栏」同优先级互压 → 布局反复算。
        备份已移到 D:\tavern-skin\_backups\，扩展目录只留一个。
        ② 通栏删掉 backdrop-filter: blur(10px) —— 1280×44 的离屏模糊，
        底下是纯米白纸面，零视觉收益纯吃 GPU；alpha 提到 .93/.84/.76 补偿。
        折叠浮片的 blur(8px) 一并删。
        ③ apply() 全部改成「值不变就不写」（--mf-read-scale / data-mf-hid /
        aria-expanded / body class / 卡片文字）—— 它挂在 MutationObserver 上，
        无脑重写会让整页反复标脏。
        ④ 扩展卡片不再复用酒馆的 .extension_container，改 .mf-ext-wrap。
        实测（903 条 .mes_text）：旧写法每次 apply 连写 100 次 vs 新写法
        100 次 apply = 1ms，且新写法不再产生任何多余写入。
1.7.0 — 2026-11-04 补上「还原原生之后怎么回来」（用户原话：我没找到能的方向）：
        ① 那颗按钮原来是单向的 —— `wr(KEY_ON,'0')` 一把梭，点完只能关，文案还
        写着「还原原生顶栏」，再点还是 '0'，等于把自己锁在门外。改成 setOn(v)
        双向，文案跟着状态变：`还原原生顶栏` ⇄ `用回扩展顶栏`。
        ② 关掉时弹一条 8 秒说明条「长按或右键顶栏图标可换回」+ 一个「换回」按钮，
        点了当场回来。原来的 toast 只会说「已隐藏 X / 撤销」，拆成通用 notice()。
        ③ 酒馆 `#extensions_settings` 里注入常驻卡片「米白皮肤 · 顶栏」：
        状态标（扩展版 · 已接管 / 酒馆原生）+ 双向按钮 + 正文字号 A−/A+ +
        打开面板。**注入不判断 isOn()** —— 判断了还原后它自己也消失，白做。
        ④ 原生模式下长按/右键一律开面板，不再 hideOne：skin.css 第 11 节整体
        失效，data-mf-hid 不生效，图标根本不会消失，用户只会觉得长按坏了。
        实测：还原后 body 只剩 no-blur；卡片 st=「酒馆原生」/按钮=「用回扩展顶栏」；
        右键顶栏 → panelOn=true、btnTxt=「用回扩展顶栏」、cnt=「已还原原生」；
        点卡片字号 +10% → 110% / --mf-read-scale=1.1。
1.6.0 — 2026-11-04 顶栏第二代（用户三条原话：颜色淡一点 / 字号 / 铺一横屏）：
        ① 展开态从「靠左 380px 玻璃胶囊」改成「横贯整屏的极淡玻璃带」——
        填充 .96→.50 实心降到 .86→.52 渐变，去掉描边/圆角/外投影，只留底边
        1px 细线；十颗各 flex:1 均分，每格上限 104px（1280 两边各留 120）。
        ② 折叠键也均分（原来 flex:0 贴最左，跟第二颗间距 89px 而后面每格 136，
        一眼就歪）；图标 34→36 / svg 21→22 / opacity .70。
        ③ 顶栏设置面板新增「正文字号」A− / A+（85%–160%，步进 5%，点数值回
        100%），乘在校外单独的 --mf-read-scale 上，只放大 .mes_text，不动
        --fontScale（那是酒馆全局字号，会连顶栏高度一起改）。
        ④ 长按/右键顶栏空白处也能开面板（v1.6.0 铺满整屏后空白区很大，
        只认折叠键那 30px 太难按）。
        实测 1280：holder 1280、十格各 104、左 120 右 120 对称；折叠
        --topBarBlockSize=0 / sheld top=0 / 浮片 30×30；字号 110% 时正文
        16.9→18.6px 而顶栏高不变；空白右键 panelTop=44。
1.5.0 — 2026-11-04 顶栏三处返工：① 展开态从「一排裸图标」改成玻璃胶囊（三段渐变 +
        描边 + 内高光 + 三层投影），图标 21px/stroke 1.85/opacity .82，间距 2px；
        ② 折叠改成「整条收走」—— --topBarBlockSize 归零 + #top-bar 隐藏 +
        holder 变 fixed 浮片，正文从 y=0 开始（原来只收图标、仍占 44px，正文被空带挡住）；
        ③ 手机/触屏（≤768 或 pointer:coarse）展开时十颗均分铺满整行。
        实测 1280：holder 369×40；折叠 sheld top 44→0（测试页 82→0）、正文首段上移 82；
        390：holder 390、9 格各 40；250：格 25、icon 24 不重叠。
1.4.0 — 2026-11-04 顶栏改造：九个抽屉图标从「九等分居中」改成靠左一排，图标换成
        自家线条 SVG（掐掉 FA 的 ::before 字形，注入 <svg>）；最左插一颗折叠键
        （非 .drawer 结构，避开酒馆 drawer-toggle 的 openIcon 逻辑）；长按/右键
        单颗隐藏 + 撤销条，长按/右键折叠键打开「按钮管理」全集清单；顶栏底色带
        去掉。所有规则挂 body.mf-tb-js，可一键还原原生。实测 1280 宽：holder 1280、
        每颗 34px、间距 38px；折叠后 only-one 可见、箭头 matrix(-1,0,0,-1)。
1.3.0 — 2026-11-04 工具栏第四颗「锁定拖动」+ 搜索改成只留命中行（详见上面表格）。
        锁：桌面端 `sortable({handle:null})` 是整行可拖，所以不能只拦 .drag-handle，
        要 `$(list).sortable('disable')`；酒馆每次重画列表都会再调 makeDraggable()，
        因此在 decorateAll 末尾每轮重新贴一次锁状态。搜索时同样锁住 ——
        只剩几行时拖动会改到看不见的行，而顺序就是上下文顺序。
        搜索：不命中的 li 打 .mf-hide（display:none!important，压过原生 2 个 id 的 grid）、
        命中行 .mf-hit 加浅黄竖条，摘要以第一处命中为中心截取，列表头显示 4/21。
2.0.0 — 2026-11-05 世界书面板全功能版（用户原话：「就是这个 HTML 有的功能也要做进去。
        然后新建什么的，不止于这些，反正这功能要有，必须做进去」）：
        ① 直接替换原生 #WorldInfo 内容区（不是另开浮层），三档口径不变。
        ② 存档走 ctx.saveWorldInfo（会更新 worldInfoCache，自己 fetch 会被原生旧缓存覆盖）。
        ③ 新建条目带全 38 个字段（抄原生 newWorldInfoEntryDefinition），
           sticky/cooldown/delay/scanDepth 保持 null 而不是 0。
        ④ 自动保存 700ms 防抖 + 保存中排队；状态条三态。
        ⑤ 实测（真实 13 本 / 612 条）：149 条那本下钻、改标题 1.5s 内存盘、
           新建条目 150 条、跨书搜索命中、整本开关同步 #world_info、
           全局设置写进原生控件、删除条目即时存、导出文件名正确。
        ⑥ CSS 隔离用 `#mfWb *:not(svg):not(svg *) { all: revert }`
           —— 酒馆全局有 .list(21处)/.top(76处)/.ck(74处) 同名规则。
           ⚠ 必须排除 svg，否则 stroke/fill 被 revert 成空白，图标全没。
        ⑦ 其它踩坑：container-type 会杀 sticky；sticky 父高=自身高等于没 sticky
           （用 display:contents 拆层）；抽屉 height:auto 时面板不能自己当滚动容器。
        ⑧ 真机抽屉宽 960（不是 460），内容限宽 560 居中。
2.0.1 — 2026-11-05 修两个现场问题（用户截图：米色留白 + 开关点了没用）：
        ① #world_info 的 option value 是下标不是书名（上游 world-info.js:1005），
           原来按 value 匹配永远失败 → 显示「已启用 0 本」且点开关无反应。
           统一改 optName()=textContent，写入用 $(sel).val(索引).trigger('change')。
        ② 删掉 .wrap 的 max-width:560 + margin:auto（830 宽抽屉两侧各 135px 米色空条），改铺满。
        ③ 本地 mock 的 option.value 改成下标，避免再盖住这类 bug。
2.0.2 — 2026-11-05 容错 + 性能：
        ① 保存失败不再吞改动：只清当前批次，失败原样放回队列，1.2/2.4/4.8s 重试 3 次；
           仍失败则红字常驻 + 书行挂红色「未保存」标签；另加 20s 卡死保护。
        ② 展开条目改增量渲染（renderOne），只替换那一个 .world_entry：
           125ms → 1.8ms（冷），30ms → 0.9ms（热）。
        ③ 两个常驻 setInterval 收敛：快捷回复栏 1s→2s、预设自愈 2.5s→5s，
           并去掉 getClientRects()（强制同步布局），改查 .drawer-content 的 class。
        ④ 对 index.js 的独立改动做成 _patch_perf.py（幂等），注入后才能重放。
2.0.3 — 2026-11-06 手机顶栏对齐桌面 + 正文左右对称：
        ① 手机顶栏从「铺满通栏」改成照搬桌面靠左毛玻璃胶囊：删掉 11.10 的
           设备覆盖，11.5b（正文铺满 y=0）/ 11.11（抽屉让位）/ 11.12（毛玻璃）
           放宽到全设备；折叠态也跟桌面一致。<370px 胶囊横向滑动，
           折叠键 sticky 钉在最左，不随滚动滑走。
        ② 输入框彻底隐藏 ▶继续 / ⏸暂停（保留 ⏹停止），手机 + 桌面两端一致。
        ③ 修正文整体偏左、右边多一截空白：原生 .mes_text 带
           padding-right: var(--mes-right-spacing)=30px（原本给头像/操作按钮留位），
           本扩展隐藏头像后没归零 → 每条消息右侧恒定多一块空白
           （864×1920 手机截图实测：左留白 93px / 右留白 188px）。
           补 padding-right:0 后左右对称；「左右留白」滑块、字号、行高、
           用户消息左竖线一律未动。
        ④ 验收：headless Edge + CDP 计算样式，.mes_text 左右 padding 均为 0px、
           .mes 左右留白各 11.7px（390px 视口）；顶栏与折叠态回归通过，无 JS 异常。
2.0.4 — 2026-11-06 主题接管（启动时不再变三种主题） + 输入框 + 手机抽屉：
        ① ★ 核心：本扩展不再「在酒馆原主题上面抢顺序叠一层」。
           旧链路 = 启动早期 applyCustomCSS() 注入旧主题（报纸）
           → 扩展 JS 跑起来后 muteTheme() 把 #custom-style disabled=true
             （露出酒馆原版）→ pinOnce() 把 skin.css 挪到 head 末尾（米白）
           → [80,260,900,2200]ms 一串 tick 反复做，把三段拉长到肉眼可见。
           所以**每次退出重开都会变三种主题**，不是只有安装那一次。
           新做法：installAsTheme() 把 skin.css 全文写进酒馆自己的主题槽位
           power_user.custom_css（走 #customCSS 的 input 事件 → ST 落盘到
           settings/appearance.json）；下次冷启动 applyCustomCSS() 在扩展
           加载之前就注入，第一帧就是米白。同时删掉 muteTheme / 四段 tick，
           不再 disable #custom-style（它现在装的是皮肤自己）。
           已核对 ST 源码：public/scripts/power-user.js:3351-3355
           `$('#customCSS').on('input', ...)` → power_user.custom_css +
           saveSettingsDebounced() + applyCustomCSS()，与实现完全一致。
           配套：管理面板「整套外观」开关的 #custom-style disabled 语义
           一并反转（开=启用，关=停用），否则点一次开关就会把主题槽位关掉。
        ② 输入框再去掉 ⏹ 停止（#stscript_stop）。▶/⏸/⏹ 三颗现在全隐藏；
           ■ #mes_stop（生成中中断）保留，去了就没法中途停生成。
        ③ 手机预设/世界书抽屉补 11.11m：只让位、不钉死 height，
           max-height 改用 100vh（不再依赖 100dvh / --bottomFormBlockSize），
           强制 overflow-y:auto + iOS 惯性滚动；不加 touch-action 以免影响滑杆。
        ④ ★ 已知待确认（别当「已修复」宣传）：做了 v2.0.3 / v2.0.4 对照验收，
           390px 下**两版在模拟环境里都能滚**（原生 .drawer-content.openDrawer
           的 overflow-y:auto 特异性高于 .fillLeft 的 overflow:hidden）。
           真机「手指划完全没反应」的根因尚未复现，可能来自手机 WebView 的
           dvh 结算、手机酒馆版本差异、手机扩展未更新、或别的插件拦截 touch。
           11.11m 是防御性修复，需手机上更新到本版后目视确认。
        ⑤ 验收：_v204_check.py / _v204_check.js（内联真 skin.css + 真
           initStyleGuard 源码）。主题槽位 styleIsSkin=true / disabled=false /
           textareaLen=137460 / inputCount=1；三颗按钮均 display:none、
           mes_stop 仍 block；桌面 1280px 回归通过；无 JS 异常。

2.0.5 — 2026-11-07 世界书面板改走酒馆助手 API（`thFn()` 适配层，找不到函数就退老路、
        绝不 throw）；删掉搜索模块的启动 preload —— 一次开抽屉 = 2.8MB×2 全部 JSON.parse，
        这是当时的卡顿元凶之一
2.0.6 — 2026-11-07 「整本书未启用」黄条每展开一次条目就多叠一条：`bookHeadHTML()` 返回
        两个并列顶层 div（.bhead + .warn），增量渲染只替换 .bhead，旧 .warn 没人收走。
        拆成 `bookHeadHTML()` + `bookWarnHTML()` + `syncHead()`，viewBook/renderOne/paint 全走它
2.0.7 — 2026-11-07 连续关两个条目卡 / 关酒馆窗口会卡好几秒：点灯只改 1 个布尔，却整本
        `JSON.stringify` + POST + emit。改两档保存（markDirty / flushNow），
        「能接受改完不立刻写盘，只要别卡」是用户明确授权
2.0.8 — 2026-11-07 切面板卡：对照实验关掉 `#top-settings-holder::before` 的 `blur(16px)`。
        抽屉是从胶囊底下滑出来的，毛玻璃背后一直有东西在动；A 没关就切 B 时两个抽屉
        同时在跑过渡，模糊代价翻倍
2.0.9 — 2026-11-07 聊天区滚到底「被按住 1~2 秒」：本轮只补测量 —— 确认扩展没在 `#chat` 上
        绑 scroll/touch/wheel，也没有 `background-attachment: fixed`
2.0.10 — 2026-11-07 查「只渲染最近几层」：这是 ST 原生的 `chat_truncation` 机制
        （`power_user.chat_truncation`，默认 `Number.MAX_SAFE_INTEGER`），**不要自己造**
2.1.0 — 2026-11-13 角色墙 v3 + 角色详情页 v3 + 聊天照片真正落地（新增 chatPhoto 模块）；
        整套抽掉金色换砖红 `--accent: #9c4a35`（用户原话「金色的话太廉价了」），
        暗色下需提亮到 `#c9755c` 系
2.2.0 — 2026-11-13 角色墙接管角色列表：只加 3 个 class + 全 CSS，不重建 DOM，
        JS 只做标记（MutationObserver 只盯 childList，盯 attributes 会自激）
2.2.1 — 2026-11-13 墙的实机翻车三修：① flex 下 `.avatar` 被 2:3 固有高撑住不收缩 →
        名字条被顶出卡片裁掉（改 grid 两行 `minmax(0,1fr) auto`）；② 原生 `.flex-container`
        的 `gap:5px` 变成行间细缝；③ `.is_fav .avatar{outline:var(--golden)}` 黄边 +
        `.ch_fav_icon{padding-right:54px;order:-1}` 把星标压成红长条。
        ★ 验收必须**整表加载真实原生 CSS**，摘抄几条一定会漏
2.3.0 — 2026-11-13 角色面板顶部四排（新建/导入/群聊 · 排序+搜索 · 标签 chips · 分页）
        收进一个「⋯」，默认只剩「搜索框 + ⋯」；fixedTop 高 115 → 48。
        「⋯」append 进 `#form_character_search_form`（那个 div 原生就是 flex），
        不绝对定位、字号变了也不飘；展开态**必须显式写回原生 display**（`display:revert`
        会把按钮条退回 block，当场散架）
2.3.1 — 2026-11-13 点格子不再进编辑面板，改成滑入详情页：document **捕获阶段**拦
        `.character_select`（放行收藏星标 / 批量编辑 / 位移 > 6px 的拖拽；
        不能 stopImmediatePropagation，会打断别人的监听），
        数据全走真实接口 `getContext()` + `POST /api/characters/chats`，
        点哪段 → `selectCharacterById` + `openCharacterChat`
2.4.0 — 2026-11-13 详情页三连崩修：① 700 居中像弹窗 → 满宽；② 单击只高亮点不进去
        （手机上没双击）→ 单击即进；③ 退出卡 → 删满屏 `mix-blend-mode` 噪点与
        `backdrop-filter`，关闭 0.42s 后 `display:none`，进出加状态机。
        同时补上世界书 `#wiTopBlock` 与预设面板（采样滑条 / 预设标题行 / 图标簇）的折叠
2.4.1 — 2026-11-13 ★ 详情页不是整屏，是**右抽屉里的一层**：宽度不自己算，直接抄
        `#right-nav-panel` 的 `getBoundingClientRect()`（抽屉宽 = (100dvw - --sheldWidth
        - 2px)/2，1920 窗口 479、1360 窗口 339，`--sheldWidth` 被拖过就会变）。
        连带删掉按视口判断的两套媒体查询、三张数据卡改 `auto-fit`（窄到 339 自动两列）、
        封面渐隐终点从卡片白改成正文底色（原来接缝处亮 15 阶，一条白线横贯）
2.5.0 — 2026-11-22 ★ 补回三个被自己盖掉的入口 + 堵掉误触重新生成：
        ① 世界书一级页加「导入」chip —— 原生 `#world_import_button` 被我们用
           `display:none` 藏起来的 `#wi-holder` 一起盖住了，用户根本摸不到导入。
           做法是 JS 直接 click 那个看不见的原生按钮（display:none 也能派发 click），
           让酒馆自己走原生导入通道（.json / .lorebook / .png 都认），导入完轮询书名
           清单自动刷新面板。**不自己解析文件** —— 自己写 = 把酒馆的坑重踩一遍。
        ② 角色墙顶部常显「＋ 新建角色卡」（`[搜索框][＋ 新建][⋯]` 一行）。
           原生 `#rm_button_create` 一直在，但收起态整条 `#rm_button_bar` 被 CSS 藏了
           （`.mf-tools:not(.mf-tools-open) #rm_button_bar{display:none!important}`）
           → 墙上只看得见卡片。点它走原生 `#rm_button_create` 的 click。
        ③ 消息末尾 22px 的 ⟳ 小按钮 + 藏掉原生右箭头：
           原生 `.swipe_right` 箭头住在 `.swipeRightBlock` 里，点它 = 切下一条备选，
           **已经是最后一条备选时再点 = OVERSWIPE → REGENERATE = 重新生成**
           （原生 script.js 约 10410 行）→ 误触一次烧一次 token。
           现在箭头藏起来（**`.swipes-counter` 那个「1/3」必须留着**，点它是备选
           选择器，换回旧回复全靠它），改成消息正文末尾一个 ⟳ 小钮，
           点它走原生 `#option_regenerate` → `Generate('regenerate')`。
           按钮只给「最后一条是 AI 消息」时 —— 原生箭头也只对最后一条生效，
           中间消息硬塞会造成「点了却重生成最后一条」。
           横向拖动用**捕获阶段**监听 pointer/touch，横向位移 > 18px 且明显大于纵向
           就 stopPropagation 掐断酒馆手势；★ 只 stopPropagation 不 preventDefault
           （否则划词选中和竖向滚动一起废掉）。
        ★ 两个差点踩的坑：① 酒馆标记用户消息用的是**属性** `is_user="true"`，不是 class，
           用 classList 判会永远判错；② 消息 DOM 里 `.mes_text` 的父级是 `.mes_block`
           不是 `.mes`，「消息末尾」= 插在 `.mes_text` 之后。
        ★ 实机验证（TauriTavern + 探针法，CDP 端口对这个客户端无效）：
        5 条消息 / ⟳ 按钮 1 个且在最后一条 AI 消息上 / `.swipe_right` display:none /
        「导入」chip 在 / 「＋ 新建」在 / 8s·20s·45s 三次快照零异常。

2.6.0 — 2026-11-22 ★ 砍掉预设折叠 + 照片改全局 + 角色墙加号卡与默认图：
        ① **预设面板的折叠功能整个删掉**。
           用户口径：「我点进去它突然会一会儿详细一会儿简单的」。
           根因：折叠靠给节点打 .mf-pv-hide，**酒馆只要重建一次预设块**
           （切 API 类型 / 换预设 / 重连），新节点就没那个 class → 面板自己弹回详细态；
           而巡检因为 .mf-pv-fold 还在就直接 return，永远补不回来 → 反复横跳。
           现在预设面板完全交给酒馆原生，index.js 与 skin.css 里的 mf-pv-* 规则全删。
        ② **消息上的照片：从「每个角色一张」改成「全局一张」，挂点从第一条改成最后一条**。
           用户口径：「每个角色在最后的一条消息发一张图片，而不是第一条，
           因为是对话的形式，所以我要现场图片嘛」「默认这个图片是全局的，
           导入一张图片，其他新开对话、换一个角色，那个图片还是在，只有自己去换了才会换」。
           → 存储 key 固定成 `__global__`；挂载点 = 每个角色的**最后一条** AI 消息。
           老数据（按角色名存的）自动迁移：全局图为空时挑一张老图提升为全局，其余保留不删。
        ③ **角色墙末尾加一张「＋ 新建」卡**（用户口径：「在角色墙在最末尾也加一个相似的框，
           不过那个框里面是一个加号，这样的话就可以新建了」）。
           它复用 .character_select 的 class 好复用整套网格样式 → 必须在 mfMarkWall 里
           排除掉（否则会挤掉 hero / big 格的序号）；点它 stopPropagation 后走原生
           `#rm_button_create`；原生 printCharacters 每次重绘会 empty() 整块 → 靠已有的
           MutationObserver 补回来。
        ④ **没有头像的角色卡用默认图**（用户给了两张图，「随机一张当默认图」）。
           ★ 这个客户端**不提供** third-party 扩展的静态资源路由
             （/scripts/extensions/third-party/<name>/x.jpg 与 /extensions/... 全 404），
             图片放目录里浏览器根本取不到 → 只能 base64 内联成 data URI。
           图压到 360×540 jpeg q80（45KB / 37KB），base64 后 59KB / 48KB；
           注入脚本 `tools/inject_wall_imgs.js`（手写 base64 会把 diff 撑爆）。
           随机只在页面加载时选一次 —— 每次刷新面板都换图会像在抽卡。
        ⑤ **世界书抽屉头的「世界书」三个字删掉**（用户口径：「导入新建的上面有一个世界书这个字，
           我感觉它比较占地方」）。JS 清空文字 + CSS 藏 span 两道保险 ——
           那个 span 带 data-i18n="Worlds/Lorebooks"，酒馆切语言会往里写字，只清文字会白清。
        ★ v2.6.0 探针实测（t18 / t40 两次快照一致、零异常）：
          预设面板 `mf-pv-fold`/`mf-pv-hide`/预设 ⋯ 按钮**全部为 0**，采样滑条正常显示；
          世界书抽屉头 span 的 `text=""` 且 `display:none`，h3 可见文字为空；
          角色墙 16 格（15 角色 + 末尾 1 张「＋ 新建」，`lastElementChild` 就是它）；
          5 条消息里**只有最后一条 AI 消息**带「加张照片」入口。
        ★ v2.6.0 抓到的真 bug：抽屉标题的选择器 `#WorldInfoheader h3 span` 是**后代选择器**，
          而原生 h3 是 #WorldInfoheader 的**兄弟节点的子节点** → 那个选择器**永远返回 null**，
          「把抽屉标题改成世界书」从来没生效过（探针 `oldSelectorFound:false` 实锤）。
          已改成 `h3 > span[data-i18n="Worlds/Lorebooks"]`（退化为 `h3 > span`），
          并用自有 class `.mf-wi-hide` 让 CSS 藏。
        ★ v2.6.0 的已知缺陷（v2.7.0 已修）：默认图只在「src 为空」或「头像加载失败」时出现。
          而客户端给没上传头像的卡**烤进了默认图**，src 一直有值 → 判据永远判不中。
          → v2.7.0 改成按**图像内容**判定，详见下面 v2.7.0 条目。

2.7.0 — 2026-11-22 默认头像真判据（用户原话：「默认图是我新建了角色卡，我没有往里面
        加图片，但是酒馆那个里面有图片，它会把那个图片改成那个女子的，但是我不要这样子，
        我就是如果他没加图片的话，就是我的那些默认图，而不是说加载失败的时候才出现。
        就把酒馆那个默认的图片改成现在我给你的这两个。」）：
        ★ **根因（探针实证）**：客户端 `characters.js:1038` 有
          `if (!request.file) { await writeCharacterData(DEFAULT_AVATAR_PATH, ...) }`
          —— 新建卡没上传头像时，客户端把自带的 `default_Seraphina.png`（粉发少女，
          240×360）**烤进角色卡 PNG**。所以「没加图片」的卡照样有头像，只是那是默认图。
          证据：主人 19:33 新建的「快乐；‘」卡内嵌 ccv3 元数据 `{"avatar":"none",...}`，
          但其内嵌图与客户端 `default_Seraphina.png` 的 md5 前 12 位相同（`3e1646772025`）。
        ★ **三条错误判据被逐个证伪**（都写在代码注释里，别再走回头路）：
          ① 文件名 `ai4.png`：探针证明**所有卡 src 都是 `/thumbnail?type=avatar&file=xxx.png`，
             一张 ai4.png 都没有**；且 `img/ai4.png` 实际是紫色问号剪影（512×768），
             跟烤进卡的粉发少女**不是同一张图**。
          ② metadata 的 `avatar === 'none'`：服务端 `characters.js:413` 用文件名
             `jsonObject.avatar = item;` **覆盖了 'none'**，前端拿不到。
          ③ canvas 像素比对：跨域污染 canvas，`getImageData` 抛错。
        ★ **最终判据（字节指纹，探针 g 实测）**：
          `fetch(url)` → 总字节长度 + **步长 1013** 的抽样字节和。
          实测 12 张粉发卡：长度全 8800、采样和全 1415；4 张真头像分别
          10934 / 7017 / 4803 / 4976 —— 完全分得开。
          ★ **基准必须跟被判定对象走同一条渲染管线**：
          直接拿 `/characters/default_Seraphina.png`（原图 69296 字节）去比卡片缩略图
          （8800 字节）**永远对不上** → 基准改走 `/thumbnail?type=avatar&file=default_Seraphina.png`。
        ★ **用户（persona）头像要走像素判据**：
          用户槽位渲染的是 `/thumbnail?type=persona&file=1788261080182-.png`
          —— 文件名是上传时间戳，字节也和 `user-default.png` 缩略图差几字节（2756 vs 2762）
          → **文件名判据和字节指纹都判不出来**。
          改用 16×16 像素签名：同图平均绝对差 0.09，粉发少女 79.1 → 阈值取 8 绰绰有余。
          基准 `/thumbnail?type=persona&file=user-default.png`。
        ★ **哪些默认图不换**：`default_Assistant.png` 是客户端自带助手卡的 **TauriTavern Logo 图**
          （不是粉发少女）→ 按内容判据**不纳入**基准；`default_Seraphina.png` 是粉发少女 → **要换**
          （它自己也显示在角色墙上，且基准指纹已提前缓存，换 img.src 不会造成自循环）。
        ★ **只改显示，不动原文件**：只换 `<img>` 的 src，磁盘上的角色卡 PNG 一个字节不动。
        ★ **每个位置各自随机**：每张卡独立随机挑一张，`data-mf-default-avatar` 标记防重复抽卡。
        ★ v2.7.0 探针实测（i / j / k 三轮）：
          角色墙 17 格 → 13 张粉发少女卡全部替换（IMG1 10 张 + IMG2 3 张，两个随机图都有出现）；
          4 张真头像（全职猎人1.05 / 我在剑风传奇当大力 / 我在惊悚游戏里封神 / Assistant）
          原样保留，marker 为 null；聊天 5 条消息头像（AI + 用户）全部替换，marker=1；
          `type=persona` 的判定走通（用户消息头像也被换成默认图）；零异常。

2.8.0 — 2026-11-22 ★ 性能大修：把「酒馆卡」的三个真凶找出来并解决
        【主人的原话】
          「我想搞给酒馆搞得更加优化更快，就是你先找出问题，看看是哪里不对，
            然后输入框也搞得更加流畅的。这种之类的，反正现在太容易卡了。」
        【先说结论：卡有两个完全不同的元凶，实测数据】
          · 启动卡（打开要等好几秒）→ **RecentRequestLog 扩展**：最长长任务
            **6534ms**；禁用它 → **127ms**（降 98%）。实测它对**每一个** fetch 都做
            `response.clone()` + `clone.text()` + `JSON.parse`，启动阶段几十个请求
            被它复制解析一遍 → 几秒同步 JS 冻住页面。
          · 打字卡 → **输入框的实时 token 计数**：每敲一个字发一次
            `http://ipc.localhost/count_openai_tokens_batch`（实测打 24 字 = 21 次请求），
            输入框要等它回来。拦掉之后输入延迟 **72.4ms → 57.6ms**。
          · 扩链自己：CSS 加载两遍 + body 级全局观察器。
            修完输入延迟只快 **3ms**（诚实数据，见下）。
        【★ 这一版的四个改动】
          ① CSS 去双载 → 改用「首屏骨架」方案：
             主题槽位 `power_user.custom_css` 从 **137,460 字符**（整份皮肤）缩到
             **1,544 字符**（只有配色变量 + body 底色 + 聊天区全宽 + 顶栏），
             完整皮肤仍然只由 `<link>` 提供一份。解析量减半以上。
             ★ **为什么不是「直接删光」**：实测 `first-contentful-paint = 940ms`，
               而扩链 `index.js` 实际执行在 **13,853ms** —— 差 13 秒。
               直接删光 → 首帧是酒馆原版色，13 秒后才变米白，
               正是 2026-11-06 报的「报纸 → 原版 → 米白」三段变色。
               骨架方案两样都要：首帧即米白（实测 FCP **396ms**），解析量也省一半。
             ★ 改 `skin.css` 的 `:root` 变量后**必须**同步骨架：
               `node tools/check_boot_sync.js` 会检查并列出差异。
          ② JS 瘦身：
             · body 级全局 MutationObserver → 只观察 `#chat` /
               `#rm_print_characters_block` / `#avatar_load_preview` 三个容器
             · `mfSwapDefaultsIn()` 加早退：先 `querySelector('img')`，
               没有 img 就不遍历整棵子树
             · 字节指纹只对 `type=avatar` / `type=persona` 的缩略图做，
               表情 / 附件图 / 扩展图标一律跳过（原来每个新 src 都要 fetch 一次）
             · 兜底巡检 3s → 10s；其余巡检 1.2s/2s → 3s/5s，并全部加
               `document.hidden` 跳过；扩展入口观察器不再退化成 body 级
          ③ 新模块 13「最近请求记录」：把 RecentRequestLog 的功能收进扩链，
             这样电脑/手机同一份，**手机端就能把那个扩展卸掉**。
             ★ 刻意不学原扩展：只在 URL 命中 `/api/backends/` 且 `init.body` 是字符串时
               才读（零拷贝、零 clone、不读响应体），也不在 fetch 回调里碰 DOM。
               实测抓取与分组正确：`system / user / assistant` 三段齐全；
               装上后启动期长任务 **0 个**。
             功能：按 System/User/Assistant 分组、标记来源（原生/插件）、
             单条复制 / 整条复制、折叠、可拖动、可缩放、明暗切换、最多 10 条。
          ④ 新模块 14「输入框实时 token 计数拦截」：在 fetch 层拦掉
             `count_openai_tokens_batch`，本地直接回空结果。
             ★ ST 的 `power_user.message_token_count_enabled` 管的是
               「消息旁边显示 token 数」，**不是**输入框实时计数，改它没用（已实测）。
             ★ 想留着那个显示：`localStorage.mf_token_counter = '1'`。
        【首屏感知优化（主人原话：「把实际上的卡转换成眼光上的这种快」）】
          · `boot()` 拆两批：第一批 = 输入框 / 聊天区 / 头像 / 请求记录（马上要用），
            第二批 = 预设 / 顶栏 / API / 角色墙等面板类，走 `requestIdleCallback`
          · 启动期间 body 带 `.mf-booting`，非聊天区 0.4 透明度 ——
            看着像「正在就绪」而不是空白；1.5 秒后无论如何摘掉（防异常残留）
        【★ 诚实的收益数据（别夸大）】
          | 条件 | 输入延迟中位 | 备注 |
          |---|---|---|
          | 扩链完全缺席 | 32.5ms | 冷启动期打字的条件 |
          | 旧扩链（CSS 双载 + body 观察器） | 75.4ms | 稳定期打字 |
          | 新扩链（骨架 + 观察器瘦身） | 72.4ms | **只快 3ms** |
          | 新扩链 + 拦掉 token 计数 | **57.6ms** | **真正的大头** |
          → 扩链自身优化的直接收益是 **3ms 级**（比一开始估计的小很多）；
            真正的打字瓶颈是 ST 的实时 token 计数，以及那 6.5 秒启动长任务。
          → 扩链这轮的价值主要在：**解析量减半**、**去掉 body 级全局观察器**
            （长对话滚动/重绘时受益）、**首屏感知**、**替代掉那个 6.5 秒的扩展**。
        【附带处理】
          · `power_user.message_token_count_enabled` → False
          · `power_user.reduced_motion` → True
          · `settings.json` 从 **5,780,004** 字节缩到 **4,627,495** 字节：
            删掉 4 个完全同名的「预设管理器」重复副本（166K/174K/179K/197K 字符，
            都是 enabled=False），省 718,240 字符
          · `RecentRequestLog` 扩展已在电脑上禁用（手机端主人可自行卸载，
            扩链里已有同样功能）
