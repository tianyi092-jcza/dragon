# E-03-VIEWPORT-1：编辑器视口导航

用户“继续完成剩下的所有任务”后，完成当前profile的独立桌面编辑器切片。属于Web显示工程，不是KI缩放/容量规则；完整任务一和goal仍未完成，逐项剩余见[工作表](editor-goal-completion.md)。原件844e…/compiler0.6/current39/switch保持不变。

## 实际产物及几何合同

- `web/src/editor/viewport.js`：camera保存世界pixel左上与zoom，source格仍16px。`screen=(world-cam)*zoom`与逆变换共用，拾取/拖放/框选/道路/全footprint预览均由同camera转换；DOM border与CSS canvas尺寸另按真实矩形/offset/client比例换算，不假定屏幕1px就是backing1px。
- `studio.js`及HTML：游标滚轮缩放、放大/缩小、100%、整图置中；显示支持1/16–4倍。缩放锚点在未触及真实边界时不漂移，边界夹取优先，不伪造外部区域。整图留边不拾取，camera上限由真实地图和当前canvas/zoom算，不再写死5184/3496。
- 平移用pointer capture和屏幕位移/zoom；素材HTML5拖动、框选或已选整实例待移目标靠32px视口边缘自动平移（最大640屏幕px/s）。编辑RAF预算每次最多50ms，无后台补跑；这些均为纯显示参数，未使用游戏clock/Scenario/规则RNG，也不推进路线。实际边界不扩图；全图已完整显示时不能平移出图。
- 自动平移只在当前明确输入活动/新鲜指针下进行，素材离开/拖动结束、Esc、pointer cancel/lost capture、窗口blur、隐藏及resize清理。隐藏恢复不会自动重放旧指针。移动工具仍是选实例→点目标，不把预览移动写入源；ghost与真实落点同坐标。启动未就绪不接受drag/drop。
- 隐藏层合成只在内容或显隐变化时失效，不每次平移重合成98,304格；大图绘制只遍当前可见范围。素材/组合/地图源、mini像素、保存修订均不因导航改变。未提供完整性能SLA、大图扩容、多格子实例拆分或批量变换。

## 本轮验证（2026-10-01）

先审入口/I/O并登记[本地库存](editor-local-validation.md)，再串行执行。

- [完整53门机器收据](../.dragon-analysis/map-migration-2/viewport-machine-r1/receipt.json)：17:42:52.104Z–18:03:57.449Z全部exit0；98源码/current39资源前后SHA同。原51门全部执行，加pure viewport及actual viewport browser两门。相对旧95仅HTML/studio/runner三差、三新增，游戏规则/RNG/App/保存/编译/源资料未改。5退休road skip不作通过；固定RNG不作CPU或完整战役证书。
- [视口实际浏览器收据](../.dragon-analysis/editor-phase/viewport-machine-r1-viewport/receipt.json)：全新owned context/loopback/temp副本，真实滚轮锚点与原子拾取、按钮zoom/fit、CSS缩放逆变换/留边不拾取、捕获平移、真实HTML5素材边缘drag及Escape取消、待移动ghost、blur清理、1024resize。draft全文/服务草稿/mini像素不变，dirty=false，IDB open0、errors/forbidden0，current39/switch同SHA。[截图](../.dragon-analysis/editor-phase/viewport-machine-r1-viewport/viewport-workspace.png)是owned副本导航，不是原件新美术认可。
- pure门31几何检查/6非法参数负控（以实际unit日志计数为准），输入不变，Math.random/Date.now禁止；同一view正逆、游标锚点、动态bounds、fit留边、有限时间预算与屏幕速度一致。这里没有原规则预期值。
- 浏览器blur明确为注入事件，只证明该生命周期处理器，不冒称真实账户撤销/网络暂停/认证Trial。窗口后台冻结、移动设备、全部DOM变形与完整性能验收未覆盖。
- 主动6代码/HTML检查：querySelector及三正确await括号hint；2有finding、4inconclusive（1timeout/3push-only）、0confirmed-clean。既有常量`window.open("/trial-wait")`误报保留原裁决（无新增ignore/规则禁用），不改正确同源等待页行为。Markdown/session最终覆盖及语法/链接/diff由[本轮静态记录](../.dragon-analysis/editor-phase/viewport-session-r1/static-receipt.json)核签，不声称全LSP清洁。
- Jev审过2467B人工工程摘要/preview0redactions后固定1.13.0发送，结果advisoryOnly；不含资源/代码/真实profile/凭据，不作验收、原证或命令来源。

## 不完成项与接续

本批未动账户/可靠后台、单章依赖、实体初始化、发布/多游戏存档或任何G门。只读wrangler.jsonc确认仓库当前无后台绑定接线，但不宣称线上没有能力，也不读取部署缓存/凭据或新增平台服务。下一独立切片为素材实例拆成子实例/批量平移及素材管理；原证不足的角色/空章/扩容不补默认值。本轮无再次commit/push/fetch/deploy/真实SAVE/profile/DOS写入或全局配置改变。
