# 臥龍傳 Web 移植 (Web Port of "Dragon: The Legend" / 臥竜伝)

将 1995 年松岗发行的 DOS 三国策略游戏《卧龙传》(臥竜伝〜三国制覇の計〜) 移植为 Web 版。
**不含任何原版游戏数据文件**——所有资产均由逆向提取脚本从用户合法持有的原版生成。

## 运行

在 `web-port` 仓库根目录启动正式本地服务：

```bash
python tools/webserver.py 8321
# 浏览器打开 http://127.0.0.1:8321/
```

正式入口需要服务端单实例 lease 和受保护的 SAVE API；普通 `python -m http.server` 不提供这些接口，应用会按安全策略拒绝启动。

## 目录结构

```
Dragon/            原版游戏(用户提供，不入库)
web-port/
├─ tools/          资产提取管线 (Python)
│  ├─ parse_sinario.py   SINARIO.DAT → web/data.json (剧本/势力/城池/武将/军团)
│  ├─ decode_mmap.py     MMAP.MAP/.MDL RLE+planar 解码 → web/mmap_*.bin
│  ├─ render_map.py      地形图块+四季调色板(GAMEPAL.BRG) → map_tiles_{四季}.png
│  └─ parse_kaogrf.py    KAOGRF.DAT 64×64×16色 planar 头像 → web/kao/*.png
└─ web/
   ├─ index.html   引擎入口 (ES Modules)
   ├─ demo.html    早期单文件原型(存档参考)
   └─ src/
      ├─ main.js            装配：数据→视图→输入→HUD
      ├─ core/assets.js     资源加载器(缓存)
      ├─ core/input.js      缩放/平移/拾取
      ├─ game/world.js      世界常量 + SINARIO 布局文档 + Scenario 模型
      ├─ render/mapview.js  相机与分层绘制(地形/城池/标签)
      └─ ui/hud.js          面板/图例/提示/君主卡
```

## 已破解的格式速查

| 文件          | 格式                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SINARIO.DAT | 88832B = 4剧本×22208B；Big5(A140/U+3000填充)；势力24×64B@0x80(byte1=君主武将idx)、城池200×32B@0x8C0(xy=u16对,范围4-370/9-248)、军团128×64B@0x21C0、武将128×32B@0x42C0 |
| MMAP.MAP    | 头4字节=解压后大小(98304=384×256)；RLE：连续两相同字节后跟计数c(c=0转义,c>0重复c次)                                                                                     |
| MMAP.MDL    | 256个16×16 4平面图块裸数据，平面p在 p*32+y*2(+1)                                                                                                          |
| GAMEPAL.BRG | 384B = 四季×16色×3字节(BRG序)，分量低4位有效，DAC=((n<<4)*亮度+80h)>>8<<2，值域0-60步长4；游戏按月换季(3-5春/6-8夏/9-11秋/12-2冬)                                             |
| KAOGRF.DAT  | 每头像2048B定长块(idx×2048偏移)；64×64 4平面：平面p在p*512+y*8，每行8字节高位在前                                                                                     |
| ICONGRF.DAT | mode12h VRAM布局：每行80字节按i&3轮转4平面，字节i覆盖像素(i>>2)*32+(i&3)*8+k                                                                                     |

## 显示模式与 blit (KI.EXE)

- 主画面 VGA mode 12h (640×480×16色)
- FA37 blit 约定：AX=高度<<8|宽度字节，BX=VRAM目标偏移(行距0x50)，DS:SI=源；GC set/reset 门控逐平面写
- 未解决：KYOGRF.DAT / IVENTGRF.DAT 的精确布局（需 DOSBox Debugger 动态验证）

## 待办

- [ ] 战斗系统素材 (BATTLE.MAP/.MDL/.SCH/.DAT)
- [ ] KI.EXE 内政/战斗数值公式逆向
- [ ] KYOGRF / IVENTGRF / TALK.DAT / SOUND(DGM) 

## 
