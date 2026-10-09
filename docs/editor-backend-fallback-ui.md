# 固定季节阶段界面（E-01-BACKEND-FALLBACK-UI-1）

沿用[固定季节认证API](editor-backend-fallback-api.md)，只扩展后台阶段模块和HTML选择，新增显式浏览器验证。Root、六用途服务、认证／目录／草稿／生成器／引擎及375玩家输入不改；主目标仍active，不授RuntimeManifest、Q69、Trial或发布资格。

## 固定用途与旧关联

`stage-purpose`固定data、images及spring/summer/autumn/winter四个`fallback-`用途。只有data可供普通作者选择；另外五项限管理员，真实服务继续核实际owner／epoch。选项禁用不是权限证明，伪DOM／SessionStorage不能给服务授权。

每用途只保gameId、明确draftRevision、purpose、原enqueueKey、返回Job ID和未确认command（action/key/revision）。旧精确data/images二项关联先逐字段检查，再保原键／ID／body语义并增加四个空关联；不迁移或重贴原Job版本。新六项关联预算4096字符，未知用途／非法字段fail-closed。无作者输入、凭据或产物持久化，reload不自动POST、执行或下载；purpose重新选择也是明确操作。

沿用实际读取的saved context。dirty可取消，确认只处理所读保存修订，不保存输入或选latest。失去202时明确按原key和原固定完整body确认；若服务未收过，会建立原请求，提示不冒查无记录等于未执行。失去run回应先GET实际Job，不把command key当执行成功收据。单季ready只表示该季两产物阶段事实，不表示四季／全部依赖完成。

## 附件与失效

沿用服务完整source／checkpoint／R2重建核验后的私有附件。UI按描述有界读取长度，全SHA及响应SHA头均一致才创建owned blob下载；PNG不装入场景或反算规则。用途／身份代次与owned URL释放规则不改。实际改密成功撤销旧epoch，旧用途run/download禁用；实际oldJob409不能复活，可明确另约所读修订，不声称删除旧对象。

## 实际验证与失败定位

独立`.dragon-analysis/editor-phase/backend-fallback-ui-session-r1`、owned SQL/R2及随机工程配置、loopback HTTPS／已装MF/OpenSSL/Playwright、fresh Chromium；没有用户profile-IDB或DOS-SAVE。新UI r2八组通过：

- 六固定选择，真实原data Job的旧二项关联恢复／明确GET，保原ID/key并只增加四空项。
- saved1已读而服务保存2、dirty取消无请求；真实202被浏览器丢弃后reload，明确同key/body确认，无自动保存或latest。
- 真实spring run200后丢回应、原command/CAS恢复，reload无产物／autorun，明确GET显示ready两项。
- 完整spring PNG／fallback_report实际下载；独立byte flip和错误SHA头均拒，不创建新文件。
- winter独立真实执行与完整下载，spring关联不被覆盖；未使用summer/autumn无关联／产物，saved2 metadata/modifiedAt不改。
- 独立实际author五项禁用、无他人关联；未知用途关联fail-closed。
- 实际改密及oldwinter409、旧run/download禁用，仍可明确新预约。

只在新浏览器执行spring/winter；其它两季API证明来自已封存API批，不冒本轮四季浏览器执行。三下载及两完整PNG字节与原独立Pillow封存一致，诚实复用旧像素oracle，没有本轮新Pillow／DPR视觉验收。

原data/images阶段浏览器验证当前同产品SHA另跑八组通过，覆盖原data29/image7、两下载、未知回应／reload／两个SHA负控、author及实际改密。两producer各13记录Node请求、5 browser阶段POST，新3／原2下载；不是全部浏览器HTTP计数。主页面console/page errors和外网0，实际受测隔离IDB访问0；各页面观察范围按producer，不用空诊断冒全站clean。

首轮三组后spring PNG已下载，报告选择器误用六图`source_report`，原单季执行器实际声明`fallback_report`；主catch保存的首错是locator超时。未立即处理download event promise的拒绝又在finally关闭浏览器时掩盖stderr首错。原producer、meta、失败JSON、日志及spring产物均保留；仅修测试实际assetId及立即捕获promise outcome，不改产品、期待、权限或超时。r2通过后未重跑底层碰绿。

两旧UI源码先wx归档并准确逆差；444旧声明中442未改（含375玩家），一新增producer使声明445。诊断／语法／HTML IDs／imports／链接／所有SHA另封存；unsupported/unavailable/inconclusive不是clean。无commit/push、云创建部署、安装／全局trust、真实档或共享清理。

## 仍缺

完整工作台、人物／章节初始化、全部loader/CSS/audio／G127/255消费者、统一RuntimeManifest及实际Trial所有mutation/async门、发布玩家存档删除备份和全部Q验收未完成；不写“只差上线”。
