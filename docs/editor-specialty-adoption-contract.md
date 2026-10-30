# E-04-SPECIALTY-ADOPTION-1：专长低位本地采纳合同（已批准）

用户批准专长低位数据的本地采纳。旧副本不保留、不迁移、不再使用，直接删除；因此不再为旧副本建设新旧来源兼容分派。清理必须核对归属与引用，不能误删共享资源。本合同是可执行差异合同，不是视觉认可、部署／提交授权或能力编辑证书。

父源与候选身份（固定，不通用放宽）：

- 父修订 `map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23`，父 `sourceDigest=87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1`，父 `manifestSHA=bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9`。
- 候选修订 `map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe`，候选 `sourceDigest=19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b`，两轮 `specialty-runtime-20261029-r1/r2` 44 产物逐 byte 相同。
- 候选 `runtimeDataSha256=537e6af3e18c0f4b736c6c0b7f4cb4d2fa7c50a3b6470a86e1267afdced1b213`，`authorResourceSha256=7e7fad151010a33fd455b81971c8e976c99d2fd265bd6c31625a68326c6de00c`。

## 放行的充要工程条件（固定本批）

1. 只允许给 2560 条记录新增 `specialty_low_bits`（三小写 hex，按 G+0E／0F／10 顺序），五条非零；高位能力、General32 其它字节、City32／Faction64／header、事件尾、元数据保持。删除新增字段后候选整个 GameSource 与旧源 deepEqual。
2. 38 角色中仅 24 项可变：20 章＋`game-source.json`＋`data.json`＋`world-definition.json`＋`catalog.json`；其余 14 项（terrain／roads／road_cost／road_offset／四季 atlas×4／四季 tiles×4／minimap×2）逐 byte 相同；`world/catalog` 只允许 revision／所属 URI 重绑定。14 地图资源 byte 保持是地图不变的必要条件。
3. 两独立候选产物一致；`compileGameSource` 接受候选且新 `sourceDigest` 与 `canonicalDigest` 相等；地形／道路图／cost／offset 与旧资产一致。
4. 新作者输入 body 只能改 `runtimeDataSHA`；全部原始 General32／City32／Faction64 原 byte 不变，新 manifest／URI／SHA／长度真实重绑定。旧作者描述符不能充当新 runtimeData 描述符。
5. 候选 `geographyReview/visualReview/authorDisplayData.status` 均为 `PENDING-SPECIALTY-DELTA`，不含 `displayAcceptance` 或日期专用 `displayAcceptanceInheritance`；不把原视觉认可直接改名重用，不声称对白已修复。

## 正式证书分离

满足条件后由 `tools/install_editor_specialty_adoption.mjs` 产生正式证书 `specialty-adoption-certificate.json`：精确 parent／new revision、`sourceDigest`、父认可原 SHA、24／14 角色 SHA、五条非零清单、验证产物 SHA 与本合同 SHA。证书使 `manifest`／作者绑定等产物重新冻结，不能沿用候选 `PENDING` manifest SHA 作最终发行摘要。任何非低位变更、地图变化、错配候选均拒收并走新审阅。

## 旧副本处理（已批准，不做兼容分派）

- 旧副本不保留、不迁移、不再使用，直接删除；不在 `PrivateDrafts`／`InstalledRuntimeAssets` 建设按持久 origin 的多来源分派，不按 latest 回退，不新增来源准入。
- 清理前必须核对归属与引用：按 `gameId` 归属、跨游戏 payload、publisher `checkHead`、前代收据、跨游戏资源引用逐项核对；未知 legacy 引用阻断相关清理。摘要相同不代表同一物理对象；只有完整闭包成立时才执行目标独占删除。
- 共享保护：14 地图资源 byte 虽相同但分属不同 revision 前缀键，不得按 hash 合并删除；跨游戏共享画像 `kao/`、程序资源、其它游戏历史事实不得删除。`deleteAllowed` 与完成 410 只在实际闭包及验证后开放，不得直接删除仍被旧键重放、publisher `checkHead`、前代收据或跨游戏引用依赖的历史正文。

## 安装边界（实施前必须验证）

安装新 immutable 角色及新作者输入后再切默认身份；资源与作者描述符须使用同一冻结 release 模块作为一个切换点；失败／中断保原默认或明确 fail-closed。任何自有 temp 写失败清理仅限本次 owned 文件。Web 旧会话已缓存旧模块时继续旧二元组；不热替换实际对局或批量清用户存档。版本性旧存档处理仍按现行合同，不能为本次来源采纳偷偷迁移数据或清用户存档。

真实采纳后必须实际验证新默认、新完整副本、精确保存历史与两端资源绑定；程序束／固定消费者身份按实际变更核验。候选 20 章核心／四章 App 历史证据只作前置，不冒真实升级成绩。

本合同不是安装已完成证明，交付状态由验收台账及实际收据维护。生产来源登记／上传／部署、commit 或 push 不因批准本节自动获得授权。
