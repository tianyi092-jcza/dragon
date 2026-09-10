# 《臥龍傳》音乐播放与导出

|月份角色|WAV试听|MIDI音符骨架|时长|
|---|---|---|---:|
|春（3–5月）|[BGM_02.wav](BGM_02.wav)|[BGM_02.mid](BGM_02.mid)|68.209秒|
|夏（6–8月）|[BGM_03.wav](BGM_03.wav)|[BGM_03.mid](BGM_03.mid)|102.317秒|
|秋（9–11月）|[BGM_04.wav](BGM_04.wav)|[BGM_04.mid](BGM_04.mid)|34.263秒|
|冬（12–2月）|[BGM_05.wav](BGM_05.wav)|[BGM_05.mid](BGM_05.mid)|54.861秒|

- WAV由原始YNSOUND指令产生的OPL3寄存器序列离线合成，**不是实机声卡录音**；49700Hz、双声道、16bit PCM。未验证真实硬件逐样本等价或听辨。
- MIDI保留原音符及细调，不保留FM音色，也不猜GM乐器；播放器默认钢琴不是原乐器。
- 音乐原本持续循环，此处截取到六声部均至少经过一次主循环；不保证首尾无缝，没有添加淡出。
- 另附 `BGM_00..10` 和 `OPENBGM/ENDBGM/OVERBGM` 的MIDI、VGM、原始事件JSON。未证实的用途按资源名/索引命名，不杜撰曲名。
- `.wav.json` 为合成核、输入/输出SHA256及波形统计；`manifest.json/validation.json`为解码证据。
- **已接入游戏**：标题0、四季2–5、交涉6、战术7–10、失败OVERBGM。系统选单按原版仅提供「音效」TYPE1/2/3/4/關閉音量设置；不另设音乐行，不切换音色或手动选曲，也不恢复OPEN/END过场。
- 正式播放用[playback.json](playback.json)与`loops/*.flac`，包含经原CPU第二周期验证的intro/loop；不是直接重复上述试听WAV。FLAC逐字节无损保存软件合成PCM，仍不等于实机音色或无接缝循环。TYPE音量用master gain近似原TL衰减；Web统一音乐关闭也抑制独立失败曲。
- 11首按需加载、单首解码缓存；FLAC减少下载体积，不减少解码PCM内存。原资源、循环证明、生命周期、复现命令与合成局限统一见[音频证据](../../../docs/re-notes-audio.md)。
