# E-01：本地三模块上下文壳（N2限定交付）

只补已存在的**游戏资料、地图工作台、唯读来源检查**的左菜单/右主窗与“当前游戏”上下文。不是完整据点/人物/章节编辑器、账号或正式发布；本地`editable` DTO不构成作者认证，未来真实后台仍须落实所有权限/事务。

## 实际行为与边界

- `web/src/editor/navigation.js`固定三个模块路径，只编码一个game参数；不接任意跳转URL。文字用textContent，readonly/error记录不进可选清单，重复/坏DTO拒收；未选游戏时地图/来源链接禁用，同游戏/当前模块不刷新。
- 选择另一游戏完整导航到新文档，不热替换旧草稿、世界或Trial。导航前恢复原选择值，原dirty/busy的beforeunload取消不会留下假“新游戏”标签。资料页原管理按钮同步壳及规范同源URL，刷新仍开同一游戏；不隐式保存/编译。空game参数按未选处理。
- 壳不增加全局章节选择，游戏级资料与章节不混淆。唯读来源页仍使用自己的原章检查选择，地图工作台仍使用原试运章选择；它们不冒完整章节所属/首都/资源编辑能力。
- 列表加载错误只更新壳提示，不停用已经载入的模块；可手动重试。刷新代次防旧列表覆盖，不能把此客户端门当认证/CAS。来源/实体/章初始化仍保原证缺口。
- 左菜单固定桌面宽度，canvas按主窗实际剩余宽度钳位；旧四层、配方、正逆变换/unknown/锁门保持。没有共享composer/compiler/App/规则/AI/RNG/Clock/save/default资产修改。

## 实际验证

[I/O先登记](editor-local-validation.md#e-01-local-context-1n2限定模块壳先审io)，两新入口进入显式75入口/170源码库存；**库存不是新75全轮通过**。最终白名单env `navigation-context-session-r1/run-focused-r5.mjs`实际八项串行exit0：navigation pure/browser、game-management、entity-inspection browser、viewport pure/browser、component browser、unified workspace。最终收据/源码/日志/图片/SHA在同session `static-receipt-r1.json`另签，不拼旧菜单五门。

- 新纯门4组/11拒收，路由/编码/同上下文/DTO只内存，IDB getter访问0；不作DOM或权限证明。
- `navigation-context-browser-r5`实际六组流程：空上下文/作者`<img>`原文/readonly DTO明确夹具、三个模块同game、native离开取消与确认保源/标签、真正新Realm换game、资料管理同步规范URL/reload、当前模块no-op、minimal来源仍明确不可用、full128记录/20章与原选择。1280/1024左菜单及主窗/aside不重叠。
- 一次owned导航清单503及其console错误明确预期；已有资料页继续工作，手动重试成功，其余page/console/outside0。浏览器IDB hook立即抛拒，末Realm计数0；各旧focused按其原隔离合同核IDB。新测试两owned草稿文件前后同SHA，没有隐式保存；旧管理测试实际保存仅自己的夹具。
- component和统一工作台20章生产fresh/JSON、既有viewport拖放/CSS/edge/menu/显式左编辑保存及来源检查重验。当前170声明源码语法、82 current/archive Web资产保全和实际日志/图片/差异/LSP另核；不认证全引擎消费者、战役或完整桌面矩阵。
- r1等待夹具在DOM挂载前读null控件，失败保留，改存在门；minimal提示使用原明确未保存来源文本。r3视口旧夹具误把主窗左边界当水平留边，实际新比例是上下留边；按当前相机选择真实空白边，未改变生产变换迎合断言。r4八门通过后补管理选择URL/reload与空query，r5**全部八门再次执行**。
- Jev只2953B人工工程摘要，preview后fixed1.13/advisory；不发送资源、原数据/图像或完整日志，不作机制/完成/权限门。诊断unavailable/inconclusive不等clean，固定等待URL的既有误报不改语义来迎合工具。

完整N2各可写模块、Q15并发/离开全矩阵、真正后台/空章初始化/资源闭包/Trial网络/发布与匿名玩家链仍按[差距索引](editor-requirements-matrix.md)开放；goal active，无commit/push/deploy。
