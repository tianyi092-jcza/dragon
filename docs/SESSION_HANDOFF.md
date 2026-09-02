# 卧龙传 Web 移植 — 项目记忆（PROJECT MEMORY）

> 长期有效的项目事实/命令/架构/约定/主线状态。新对话从这里开始。
> 配套：`docs/re-notes-kernel.md`（逆向细节）、`docs/game-mechanics.md`（机制）、`docs/CHECKPOINT_*.md`（会话 journal）。

## 一、项目概况

- **目标**：无模拟器、纯原生重写《卧龙传》(鬆岡1995繁中DOS版) 为 Web 版。
- **本体**：`E:/Dragon/Dragon/`（Borland C++ 实模式DOS程序 + 数据文件），外层 `E:/Dragon/` 是 DOSBox 启动器。
- **用户约束（重要）**：
  1. **不上传 GitHub**（整个系统不发布）
  2. **武将不复活**：无登庸/无复活；被俘武将月末脱逃，打散武将月初回归，势力灭亡时部分固定自杀（张任/曹操）其余流散
  3. 非商用个人项目；BGM 不复刻（SFX 已复刻）
  4. 原版 1:1 分辨率在 1920×1080 一屏显示全国地图
  5. `上/中/下/后/` 文件夹是**爱好者改版剧本**，`原版/` 才是官方基准
- **状态（2026-08-24）：可玩。核心闭环全部完成**——战略/命令/进言/外交/战斗/AI/俘虏/天灾暴动/月结/存读盘/开场结束动画/音效。剩余仅打磨可选项（见 §九）。

## 二、目录结构

```text
E:/Dragon/Dragon/          游戏本体数据
│   SINARIO.DAT            剧本 88832B=4×22208B（SAVE.DAT 同构,槽=slot×0x56C0）
│   MMAP.MAP/.MDL/.MCH     地图
│   GAMEPAL.BRG            四季调色板(4组×16色,BRG字节序)；ENDPAL/OVERPAL/OPENPAL.BRG 同族
│   KAOGRF.DAT             头像 150×2048B(64×64 16色 planar)
│   KYOGRF.DAT/IVENTGRF.DAT 城市风景×15/觐见背景×3(行交错双帧)
│   TALK.DAT               对白(1024×u16指针表,Big5,\x00分句需join,占位符\1..\4)
│   BATTLE.MAP/.MDL/.SCH/.DAT  战斗资源(.DAT=持续战场脚本VM 32块×256B)
│   OPEN_S1..6.DAT/END_S1..12.DAT/GAMEOVER.DAT  开场/结局图(成对触发RLE)
│   BGM.DAT/ENDBGM/OPENBGM/OVERBGM.DAT  音乐(YNSOUND.COM驱动,未复刻,见re-notes)
│   END_S13/14.DAT=遗留未引用  END_S15.DAT=自創軍師命名Big5码表
│   KI.EXE(int 61h)/D7OPEN·D7END·D7OVER.EXE(int A1h)  主程序+开场/通关/GameOver
│   YNSOUND.COM/YNVSHELL.COM/YNFONT.EXE  常驻驱动
└── web-port/
    ├── docs/              re-notes-kernel.md(逆向) game-mechanics.md SESSION_HANDOFF.md(本文件) CHECKPOINT_*.md
    ├── tools/             parse_sinario/kaogrf/kyoivent/battle/talk/save/end/open.py
    │                      disasm.py(反汇编★) render_map.py decode_mmap.py export_save_assets.py
    │                      extract_ui.py(开场UI素材提取→web/grf/ui/)
    │                      webserver.py(本地服务:静态+POST /api/save+GET /api/saves.json)
    └── web/
        ├── index.html  data.json  talk.json  battle_maps.json  battle_scripts.json
        │   scen_raw.json  big5_map.json  map_tiles_*.png  kao/  icon/  grf/
        │   grf/ui/  cloud.png+frame_*.png(ICONGRF提取的弹窗素材,勿手改)
        └── src/
            ├── main.js            装配入口+主循环+存读档+开场触发
            ├── core/              assets.js input.js speaker.js(WebAudio方波SFX)
            ├── game/              world.js clock.js economy.js ai.js battle.js
            │                      battlescript.js(开场VM解释器) commands.js(玩家命令+monthEnd)
            │                      advisor.js(军师解析) diplomacy.js(关系/迁都；提案交互在gamebar.js)
            │                      disaster.js(天灾/暴动) recruits.js(登庸) talk.js savegame.js
            ├── render/            mapview.js battleview.js openview.js endview.js
            ├── ui/hud.js          HUD(面板/图例/城池命令/势力卡/外交按钮行/存读盘对话框)
            └── ui/startmenu.js    开场选单(YES/NO→章节/读档)+通用同风格弹窗生成器 prompt()
```

## 三、SINARIO.DAT / SAVE.DAT 格式（实锤）

文件=88832B=4剧本×22208B；**状态段偏移 = 文件偏移 − 0x80**（KI.EXE 0x8CAE）。SAVE.DAT 槽偏移=slot×0x56C0 无基址；槽头前 0x3B 字节=CS:[0xCF0] 全局块镜像（日word=本月天数<<8|当日/子刻度/时刻/月/年）。

| 区 | 偏移 | 要点 |
| --- | --- | --- |
| 文件头 | 3/4/6, F, 10, 18, 1A-1F, 20, 22-27, 3A, 40-5F | 日月年/玩家势力→CS:0xCFF/**信赖→CS:0xD00**/税率→0xD08/征兵/势力数/剧本名(Big5) |
| 势力 0x80 | 24×64B | +1君主 +2军师(7F无) +3首都 +4-9兵 +18武将数(影响投奔) +20-22**钱24bit上限65万** +23城数 +3A外交官 |
| 外交 0x680 | 每势力24B | 友好度矩阵，自己=FF；NEUTRAL=0xB7/恶劣≤0x9F/友好≥0xD8 |
| 城池 0x8C0 | 200×32B | +1所属(18空城) +2-7名 +8-B坐标(x4-370/y9-248,×16像素) +C/E生产力 +10上升值(显示=值-100) +11防灾 +12/13城兵 +17类型(0-2城/3关卡) +19内政官 |
| 军团 | **剧本无军团** | 运行时状态段 0x2240 起 64B×128（SAVE 槽文件偏移 0x22C0）；新游戏保持空表，实际编成/读档后才产生 |
| 武将 0x42C0 | 128×32B | +0属性(bit7登场/bit6君主/bit4自杀) +1头像 +2-7名 +8-D号 +E城塞(高4位,maxA0,隐藏) +F野战 +10水战 +11-13武统政(低4位) +17状态(0待命1军团长2内政官3外交官4被俘) +18登场倒计时月 +19投奔势力(一次性后FF) +1C所属(FF自由) |

**×10 显示规则**贯穿兵力/钱；能力位宽：武统政低4位、城塞野战水战高4位。

## 四、KI.EXE 关键地址速查（详见 re-notes-kernel.md）

- 主循环 0x1D8E（历法表@0x98AC）；势力调度 0x3E11；城每日 tick 0x4194/0x4269
- **战斗判定 0x2920**：`rand()&0x7F < 军师政治>>1 + 0x28`；月结 0x5358（税收 0x53C6 链/天灾 0x22DB+0x237E/暴动 0x2286/武将月度 0x585F）
- 外交：菜单跳转表 cs:[0x625B]（宣战0x6405/停战0x64F1/请援0x6623/迁都0x6909→0x33FD）；觐见场景 0x3830/0x3C99（行=cx+偏移，**对象是己方君主**）；信赖分档 0x3C1E(≥0xE0/≥0x90/≥0x20)；事件队列 cs:[0x31F2]
- 战斗屏 init 0x1B5A→0x9946；脚本 VM 执行器 0xA426/0xA436（op=低5位,cc=次3位,ah=高8位；op10 跳转目标 t&0xFF==0→si=bh*2 字节偏移）；画军旗 0xC315
- 0xCDE/0xCE7=PC喇叭音效封装（0xEB11 忙等短哔）；0xEC82=VGA DAC 渐变；VRAM blit 0xFA37
- 音乐：int 61h(KI)/int A1h(D7系)→YNSOUND.COM（钩INT8+PIT ch0分频0x100音序时钟）；端口布局为Sound Blaster Pro双OPL2：220/221左FM、222/223右FM、224/225 mixer。BGM.DAT 5轨道偏移+10B轨头 `80 0F A0 00 F0 00 00 06 D0 00`，音符编码与双YM3812可听输出尚未产品化（不复刻）
- 内存段分配器 0xDF（槽位[0xD38]起13段）

## 五、功能状态总表（全部 playwright 验证）

| 模块 | 状态 | 要点 |
| --- | --- | --- |
| 地图/四季/时钟 | ✅ | 192城标记、按月换季；系统选单提供五档战略速度（Web表现值240/140/80/40/12.5ms 每次战略主更新），模态暂停独立于速度档 |
| 月结经济 | ✅ | 真公式0x5358：距离衰减税收+税率→发展度联动 |
| AI | ✅ | 三态机+威胁感知；AI互斗用0x2920速算 |
| 战斗 | ✅ | 1024²战场实时战斗+五军编制；玩家参战开交互层，全軍突擊/自動決戰/撤軍 |
| 战场脚本VM | ✅ | battlescript.js逐帧解释器；BattleView在整个战斗中持续执行输入→A426→A065，不允许点击/墙钟截断规则脚本 |
| 玩家命令 | ✅ | develop/recruit/setTax/dispatch(出征)/moveCapital(遷都) |
| 进言系统 | ✅ | GameBar敌对/停战/请援/迁都/君主出阵原版提案链；已删除旧Web随机“诚实/劣质建议”替代入口 |
| 外交 | ✅ | 遣使(政治≥13才有效)/宣戰/停戰/請援觐见(IVENTGRF双帧背景+信赖四档台词,对象=己方君主) |
| 天灾/暴动 | ✅ | disaster.js 复刻0x22DB门控(50%×75%)+0x2286(9.4%×稳定度) |
| 俘虏/登庸 | ✅ | 月初回归/流散改投/灭亡解散；recruits.js appear_months 真实登场 |
| 存读盘 | ✅ | 正式存档仅使用浏览器 IndexedDB 四槽；Web服务器不读取或写入 DOS SAVE.DAT |
| 标题启动 | ✅ | 不播放开场动画；确认新游戏/有效存档前仅显示 `grf/ui/loginbg.jpg` 与标题选单，确认后延迟加载地图和战斗资源 |
| 结束动画 | ✅ | endview.js：灭亡/统一/信赖归零三触发；S13/14/15 回退 S12 图=原版行为 |
| 音效 | ✅ | speaker.js 方波近似0xCDE(0x101短哔/0x202两声)；unlockSfx+🔇开关 |
| BGM | ✗不复刻 | 驱动已逆向留档（re-notes「音乐系统定论」节） |

## 六、常用命令

```bash
# 本地静态服务（正式存档由浏览器 IndexedDB 管理）
cd E:/Dragon/web-port && python tools/webserver.py 8321
# 浏览器: http://127.0.0.1:8321/index.html

# playwright 冒烟/验证
playwright-cli open http://127.0.0.1:8321/index.html
playwright-cli run-code --filename=E:/Dragon/web-port/tools/_t1.js   # 文件必须是裸 async(page)=>{} 表达式
playwright-cli eval "<单表达式>" ; playwright-cli console error ; playwright-cli close

# 反汇编
python -i tools/disasm.py   # print(va_range(a,b)) 返回字符串; callers(x); VA=文件偏移-512

# 资产再生成
python tools/parse_open.py          # 开场50帧→web/grf/open_*.png
python tools/parse_battle.py        # 战斗地图/脚本
python tools/parse_save.py [路径]   # SAVE.DAT→save.json
```

## 七、架构约定

- ES modules 无构建步骤；`window.__app`/`__aiTick()`/`__monthlyAI()` 为调试句柄
- 模态层统一模式：open 暂停时钟(`_prevSpeed`)→finish 恢复+flashEvent；**异步序列播放器 finish() 必须 resolve 挂起的 await（保存 _wake resolver）**
- 可测性：随机逻辑 rng 参数注入（disaster.js）；纯函数+io 钩子分离（battlescript.js）
- 玩家势力=序号 number（非对象）；`sc.player_faction`；playerFaction(sc) 取势力
- flashEvent=右下事件浮窗；HUD 刷新走 refreshTrust/refreshClock
- 存档=浏览器 IndexedDB JSON 快照；`snapshotState` 过滤 dead 军团及纯表现字段，禁止写 DOS SAVE.DAT

**23.** 开场选单 UI 系统（弹窗引擎）✅ (2026-08-24 续)

**★新对话构建后续弹窗必读**：所有同风格弹窗用 `ui/startmenu.js` 的 `StartMenu.prompt(opt)`，不要自建组件：

```js
// opt = { x, y, w, h, title, rows }  游戏坐标 640×400
//   x,y   云窗左上角；w,h 云窗尺寸（金框自动外包 8px，建议 16 倍数）
//   title 顶部白字全角标题（自动居中）
//   rows  [{ name, date?:{year,month,day} }] 行（≤(h-38)/48 行；date→右侧绿日期钮）
// 返回 Promise<行号 | -1(右键取消)>；name 空的行显示黑带不可选
await app.startMenu.prompt({ x:200, y:120, w:240, h:160,
  title:"測試視窗", rows:[{name:"選項甲", date:{year:196,month:4,day:1}}] });
```

- **原版 UI 引擎逆向**（KI.EXE，全部实锤）：弹窗=图元拼组非整图。0x337(al=组件号,dx,bx=组原点)→0xE9C1 分发 CS:0xE16 组件表（每记录12B=type,u8,dx,dy,w,h,extra；type=0组头；handler表0xEA0D）：type3=纯色矩形(0xF1A3)/4=矩形描边(0xF465,色=extra高字节)/5=横线(extra低字节=色)/6=竖线/7=云纹窗(0xF26E,32×32屏对齐平铺)/8=文字(0xF6DC: ax高位=色,全角16px半角8px节进)/9=blit 16×24金纹块。组件：comp2=系統選單(192×176)、comp6=章节/读档共用(288×224)、comp7=YES/NO(192×80)。0x895D(al,dx,bx,cx)=画窗wrapper（0xC14金框+背景恢复）；0x8DC8=YES/NO菜单引擎@0x1AC3调用(208,128)；0x8B7C(al=0/1/2章节/读/存,dx=CS标题串)=选择窗引擎@comp6(104,88)；标题串表CS:0x98C8="NEW GAME\0LOAD DATA\0SAVE DATA\0"每串19B；0x1AC3 主循环=YES/NO→0x8B12章节/0x8B40读档→0x8E5A势力选择→0x8FC9自定军师（后两者未复刻）
- **素材**（tools/extract_ui.py→web/grf/ui/，全部 ICONGRF.DAT 提取禁止截图裁剪，颜色经原版放大图逐像素定色）：cloud.png=0xBA20 128B 1bpp 32×32盘龙纹章(位0=蓝idx8底/位1=黑龙,32px平铺屏对齐)；frame_sq.png=0x9DC8回形□链(1位=金idx11/0位=红idx10,不透明,顶/底带逐8px)；frame_cap.png=0x9DF8实心金块(柱顶/底帽)；frame_col.png=0x9DE0编织纹(6c 56×6 6c=绳纹链,1位=浅绿idx13高光/0位=绿idx5底,不透明)。金框=0xC14(dx,bx,cx) 16px格单位：顶/底带=□链(起+8)，左右柱=帽+柱身交替
- **实现**：startmenu.js _frame/_cloud/_rect/_outline/_fwText/_text 原语+prompt()生成器；YES/NO=comp7@(216,136)框(208,128)13×6格；章节/读档=comp6@(104,88)框(96,80)19×15格；#startv 640×400画布1:1居中(游戏坐标→屏幕+(320,160))；全局 contextmenu preventDefault；右键取消用 pointerdown（click 收不到 button=2）；悬停行反白；空存档槽不可选(0x8BB3 0xD0A1检查)
- **流程（后续实现已勘误）**：main.js 启动后直接在背景图上 `await app.startMenu.show()`；YES→20章选择→势力/军师确认→`beginNewGame`，NO→浏览器 IndexedDB 四槽→`beginSavedGame`。两路确认前均不装配默认地图，确认后共用 `enterGame→loadState` 延迟加载资源；右键二级窗回 YES/NO。

**22.** LSP 清理轮 ✅ (2026-08-24 续)

- ai.js weightedPick(sc,candidates) 提取（两处流散投奔重复 11 行）；advisor.js playerContext(app) 提取；endview/diploview/openview 时钟暂停恢复去重→core/modalclock.js；battleview/economy/talk 嵌套三元全清；ai.js 末行 TS 误报已标 false-positive
- 回归：playwright adv/diplo(时钟暂停恢复)/battle(formation=3)/end 全 true；console 0 error。教训：endview.finish() 会 location.reload() 销毁上下文，测试须放最后

## 八、易错点备忘

- **×10 显示规则**；能力位宽（武统政低4位/城野水高4位）
- **浏览器 ES module 缓存顽固**：改 js/data 后 reload 可能跑旧模块；判新旧看 `performance.getEntriesByType('resource')` transferSize 或行为特征；彻底解法 playwright-cli close 后重新 open
- **clock.advance(dt) 参数是毫秒**；别喂大数
- disasm.py va_range 返回字符串需 print；COM 文件反汇编先加 512B 零前缀对齐 VA
- 测试 harness：player_faction 取 .idx 得 undefined 是测试 bug；回归时 AI 会实时开新战斗重开覆盖层，需隔离
- run-code 测试文件=裸 async 函数表达式（pi-lens no-unused-expressions 已标 false-positive）
- 两个 SAVE.DAT 勿混淆：`E:/Dragon/SAVE.DAT`(1995旧) vs `E:/Dragon/Dragon/SAVE.DAT`(现用)；工具统一绝对路径
- 原版剧本头 player_faction/trust=FF → initPlayer 兜底(势力0/信赖100/税率25)
- 武将死亡=永久；军团=运行时数据（剧本无军团）
- 新对话首选读：本文件 + re-notes-kernel.md + game-mechanics.md 三件套

## 九、剩余可选项（全部非必须）

1. 开场动画打磨（历史记录已被后续勘误）：CBE5脚本块现确认由对手武将`+0x16`×4+variant选择，不再使用单位数或军团UI formation近似；VM状态已改读Session，军旗仍属表现细分。
2. BGM 音符编码破解（YNSOUND.COM 解析器 0x1xx-0x7xx 区）——若将来要复刻音乐
3. 自創軍師命名功能（END_S15 码表已破解留档）

**21.** 开场动画编制类型真实判定 ✅ (2026-08-24 续)

- **后续勘误**：0xCBE5的`[D30-0x2240>>1 + 0x4256]`实际落到对手武将`general[+0x16]`，block=`field*4+variant`；旧“军团formation 1..4”解释无效。
- 当前实现：`parse_sinario.py`解析`battle_formation`，战术创建按玩家攻守/mode计算variant；军团`formation`仅保留Web UI编成字段。
