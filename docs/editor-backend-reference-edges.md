# 当前显式引用多重边（E-01-BACKEND-REFERENCE-EDGES-1，内部限定）

接续[列布局门](editor-backend-deletion-columns.md)和[只读观察](editor-backend-deletion-inventory.md)。新增`server/deletionreferences.js#buildPrivateReferenceEdges`，inventory把原引用提取委托同helper，并增加可信内部同步`referenceSummary`；没有公开API、持久计划、SQL新增表或清理权限。其它465旧输入含375玩家不变，468声明。

## 归属与重复引用

- 输入只来自当前inventory的实际同SQL principal／owner或admin管理／非内置／未listed／used ID／永久fence及固定列布局捕获。helper本身是数据函数，不接受client权限，也不赋管理／私有bytes权限。
- 当前六对象表的每行hash/长度、全部snapshot根、copy baseline根/长度、各Job根及每个checkpoint output均记录一条显式边。intent/其它状态的已存描述仍是观察对象，不能假定可用或删去；private write journal不是资源边。
- 同游戏固定`private/<gameId>/`的节点按hash合并**对象身份**，边不合并：保table、实际整行fingerprint及字段／checkpoint数组路径。多保存修订或同Job多输出同hash仍各留一边；未知根长度可由该同节点已知描述补足，已知长度矛盾维持原`DELETE_INVENTORY_LENGTH`拒收。
- 跨game或installed同hash位于不同物理key，不能仅凭hash判共享。其它game显式root-key指入本namespace另计foreignRootReferences，不混成目标所有边；外部root具体identity／key不出summary。未知legacy／其它字段／未来内容仍未知，不冒完整跨游戏引用图或物理refcount。
- graph所有node/edge/array及结果冻结，仅当前捕获数据。digest绑定game、fence row、整个SQLcapture digest及有序多重边；row/field fingerprint不是成功receipt或能力，读取成功不注册新引用。没有授权缓存或将旧digest当当前提交条件。
- 10000节点／50000边／4MiB单次编码是工程预算，非机制或整堆／SQL取数／CPU／云SLA。row fingerprint在本次projection缓存避免同Job重复SHA，但不缓存权限。原observer引用/JSON/长度错误维持；新增超budget拒收，不忽略边。

## 最小返回及严格限制

内部同步summary的12字段：gameId、rowRevision、sqlDigest、referenceDigest、referencedObjects、referenceEdges、multiplyReferencedObjects、unknownLengthObjects、foreignRootReferences、deleteAllowed(false)、coverage(`CURRENT_EXPLICIT_EDGES_ONLY_LEGACY_UNKNOWN`)、mode(`OBSERVED_SQL_REFERENCE_EDGES_NOT_DELETE_PLAN`)。不返raw图／keys／正文／actor／操作秘密；同步授权和SQL捕获不调用R2；SQL捕获事务返回后才纯投影／哈希，期间本方法无await，但不宣称哈希过程仍持有SQL事务或跨服务锁。

这是当前显式SQL边，不读取body或媒体、不证R2对象存在、全DDL／trigger语义、ABA排除、native drain／所有writer或提交计划。真正物理删除仍需完整legacy/共享归属、排空、专属幂等delete/readback、SQL内容及receipt scrub、minimalcompleted410／cache／实际backup与隔离restore。Blob.delete仍关，所有旧UNKNOWN及四资源只读保持，不关闭Q43／Q46／E09／工程5.4／主goal。

## 当前实际验证

`.dragon-analysis/editor-phase/backend-reference-edges-session-r1`：白OS环境、已装MF/OpenSSL／owned tempSQLite-R2／random工程配置／loopbackHTTPS8787，各producer1800s不延，source snapshots／日志／报告wx。无UI/玩家改，不跑无关browser／IDB／DOS／媒体／原机制。

最终main-r2完整52组477记录Nodecalls；35metadata／10byte／10command／10freeze／6reference结果。原46完整业务流程、期待与预算保留：真实20章全副本／baseline／saved2/data29-images7，85私有对象50,665,541B完整native hash、权限／journal／command MAC／Job freeze／列布局、provider故障／SQL-R2 await／actual改密及restart。计数是本轮记录，不是需碰绿的网络次数规范。

新增六组：

1. 真实SQL按各表COUNT加SQLite json_each独立计checkpoint outputs，同52组当前full源85对象／215边／83多引用节点／0未知长度。该样本不是产品常数；同旧native inventory unique数相等，边数未丢；同步summary前后实际SQL及native list计数全同。
2. fixture注入第二snapshot同一根，真实同对象新增一边、对象数不增／digest变；仅移除故障行后精确原观察同。不是产品可重复修订／删除接口。
3. 真实foreign author404、builtin/UUID/unknown先拒，不泄图或schema，不把客户端捕获当权限。
4. 其它实际game root故意指入目标，foreign1但owned边／对象数不变，绑定SQLdigest变化；原root精确恢复仅fixture。
5. 实际starter/workerd重启后同完整summary，不凭内存图批准。
6. **另标纯capture模型**：同hash的四来源／字段边保留、深冻结、未知长度由已知值落实、长度冲突／foreign根／坏JSON或缺长度／10001节点拒；不作实际DB/native或完整refs证书。

## 失败先定位

main-r1 status1/signal null/error null，无成功receipt：派生器改了新artifact目录，原column兼容流程读取`dir+ddl-origin.txt`被错误重定向到不存在的manifest，实际ENOENT。fixture仍正确import旧原DDL。原producer／snapshots／partial failure JSON／stdout-stderr-meta保留；将旧DDL bytes按前批receipt历史SHA核并记录`ddl-input.json`，只改producer这一明确读取路径，无产品、fixture、期待或预算变化。main-r2从fresh owned状态全部52组独立重验，不拼r1前缀或重跑追计数。派生逆差与最终单路径差另签。

静态collector-r1另有manifest范围误比较：actual report签12源、runner wx签四owned源，四相同但key集合不同；保旧collector/log/meta后改为四key精确投影相等，并逐项核全部12源当前SHA，不删依赖或接受漂移，不重跑actual52追数。

Jev只发送3323B人工工程摘要，经preview审后advisory封存；其中「under capture transaction」只是捕获来自同步SQL事务的简述，实际投影在事务返回后，本节明确边界，不据advisory扩称锁保障。适用LSP/session-all、全部基准/imports/current-report SHA、语法/文档链接/73Q及inventory精确逆差另签；LSP unconfirmed不是clean。无commit/push/deploy/cloud/install/trust/SDK／真实profile-IDB/SAVE或共享清理，主goal继续active。
