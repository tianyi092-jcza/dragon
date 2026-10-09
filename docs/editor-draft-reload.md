# E-03：明确重新载入已保存草稿（Q15限定切片）

工作台新增繁体“重新載入／放棄未保存”按钮，补直接取消未保存预览的入口，不只依赖导航离开。按钮只调用当前文档的`location.reload()`，由原`beforeunload`处理未保存确认：取消留在旧文档，确认才重新读取同一游戏的已保存草稿。干净时直接重载。没有清dirty绕确认、内存热换源、自动保存/编译、替换其它窗口或恢复历史版本；其它窗口已保存的新修订可以在此次**明确重载**后被读取，不追随模板默认更新。

## 输入与请求边界

- 未就绪、busy由handler独立拒绝。原保存/校验/编译请求以及Trial启动期间按钮禁用，finally恢复；源码仍用原共同服务/compiler与禁用门，无新API/模块/入口。busy持久化处理未改，允许的后续编辑仍按原issued快照判dirty。
- 原新页加载流程再次核图集长度/SHA与配方，不偷偷回退legacy资产；map/未知底层/定义/水组等从已保存源重新读取。原保存/编译失败仍保原表单，重新载入不是自动冲突合并/后台CAS。
- 游戏/Trial仍使用各自游戏交互；此按钮只属于已批准的编辑器常规取消例外。没有给游戏弹窗加关闭按钮、改hold/计时或释放Trial/其它对局。

## 本批实际证据

[I/O先登记](editor-local-validation.md#e-03-draft-reload-1明确取消预览先审io)。`draft-reload-session-r1/run-focused-r1.mjs`白名单OS/已装Playwright环境，六focused实际串行exit0：viewport pure/browser、component pure/browser、unified workspace、navigation browser。80/281库存未增加，**不是新80全轮或完整Q15完成**。

- `draft-reload-viewport-r1`实际保存owned副本为修订2（唯一POST `/api/save`）；自有route暂留该请求，按钮disabled及直接onclick不导航/不绕busy，释放后正常完成。此为实际保存busy证据，不冒Trial/所有API延迟矩阵。
- 干净点击新按钮取得新Realm；实际左键放置使dirty，再点击新按钮，原生beforeunload dismiss保完整source摘要/dirty/选择与旧Realm；accept进入新Realm，完整已保存draft相等/dirty清除、同game与修订2、mini像素保持。三次重载不新增save/compile POST，owned源文件SHA始终同；不承诺旧外引用/heap/像素即时擦除。
- 既有右/中键屏障、8项工具菜单、原viewport变换/边移及真实左编辑、素材图卡与原115检查/36拒、视口31/6、两条20章生产fresh/JSON及导航六组重验；本批导航503仅原owned负控，其它错误按各门原合同为0。浏览器fresh自有context/loopback/temp，IDB.open抛拒且计0，不碰SAVE/真实profile/存档，最终仅关闭自己的listener/browser。
- 静态证据在同session `static-receipt-r1.json`：281声明语法/82资产同SHA、278旧源同SHA、三个旧文件有界delta、六当前日志/四browser收据与图/链接/HEAD另核。没有共享规则/App/初始化/RNG/仓储/默认资源修改。截图仅流程，不冒m1668新地图视觉批准。
- 支持文件主动LSP与session all另记；不可用/超时/push-only或空诊断不等clean，正确await括号/既有selector不为工具改语义。Jev仅人工工程摘要/preview/fixed1.13/advisory，不发源数据/图/快照/完整日志或作规则oracle。

完整Q15各可写模块、失败/并发/离开及账号后台流程仍按[差距索引](editor-requirements-matrix.md)开放，goal active。无commit/push/deploy。
