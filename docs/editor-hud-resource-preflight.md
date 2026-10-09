# HUD 私有资源接线前置排查（仅只读，未实施）

范围：继续共同资源消费者接线前，核实际HUD和GameBar，避免把新ImageBitmap端口误当DOM图片URL。详细证据在`.dragon-analysis/editor-phase/hud-resource-preflight-r1/report.json`，八个当前源码wx副本及执行源码/stdout/stderr/meta均保持；主goal仍active。

- 前继灾害/天气限定批次`static-receipt-r3.json`实读SHA：`83a5a7957ddf8235bb9b8261564575b24a814f7575ab48708c181fdfed5f22e4`；536声明输入/139imports/375谱系，finish.phaseClosed实读true，本次独立重新核2535图项。未重跑已封存codec/native套件。
- `main.js:178`实际`new HUD(this)`；CodeGraph没找到HUD callers不能据此断言死代码，随后scoped AST实找到入口。
- `hud.js`三个portrait分支：`_musterAllocate`、`_musterConfirm`直接把`portrait(...)`放到DOM img.src；`showFactionCard`先await portrait、随后await quoteFor、用image.src建DOM img。`core/assets.js`实际portrait返回loadImage的Promise。前两处源层类型不一致已记录，但**没有浏览器复现、没有推断原版规则、没有本轮修复或“已验证死分支”结论**。
- `showFactionCard`有两个异步边界，当前没有该函数内的请求代次/原scenario复查；未来私有取图不能照搬该写回方式。只能称源层观察，不能反向证明已发生跨场景写回。
- 现私有PNG上下文产物是ImageBitmap及owned dispose；不是可复制到DOM img.src的URL。需明确DOM-ready私有图片所有权/clone-src/离开取消/末次生命周期复查。不能用公共固定路径兜底，不能把局部assert当Root/session授权。
- GameBar是不同Canvas消费者：构造器17个共享UI图片和两个精确world小地图，以及独立portrait工作流。HUD改动不自动覆盖GameBar或其对话/hold。

下一最小候选：先闭合DOM-ready private portrait资源/释放合同和HUD faction-card双await边界，再做受认证真实GET的单消费者验证；不顺便改募兵机制、其它模态、portrait255/G127初始化或默认头像。方案/此排查不是完整运行准入或额外部署授权。

本次无产品修改、无游戏规则运行、无browser/SQL-R2调用或真实存档/profile；没有实现HUD/private DOM adapter、GameBar、App/Trial、RuntimeManifest/profile/全部portrait依赖、发布/删除。诊断、源码类型判断与2560原槽数据不能给未知初始化补值。主目标其它73Q保持开放。
