# 研究参考资源

`ui-probes/` 从原 `web/grf/uiprobe/` 迁入，保存原版参考裁图、解码实验、对比图与 NPY 测量数据。它们不被游戏加载，但不能仅按“运行时无引用”删除，也不能把其中所有文件都称为可再生成素材。

`tools/probe_icongrf.py` 今后的实验输出写入被忽略的 `.dragon-analysis/ui-probes/`。经核对需要长期保留的证据再人工归档到本目录，不自动覆盖现有参考图。

三张 README 展示截图统一位于 `docs/screenshots/`。结束画面仍位于 `web/grf/end_s*.png`，失败画面为 `web/grf/gameover.png`；结束音乐导出保留在 `web/grf/music/ENDBGM.*`。未接入统一过场不构成删除这些资源的理由。

版权范围见根目录 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。
