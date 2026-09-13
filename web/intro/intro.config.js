// Positions and sizes use the video's 1920 × 1080 coordinates.
export const introConfig = {
  // Viewport policy: top-left cover, scale >= 1 (see app.js fit).
  duration: 31.55,
  characterUrl: "./assets/wolong_sleeves_aligned.gif",
  characterPoster: "./assets/character-aligned-still.png",
  // Content revision in the URL invalidates only this music cache entry.
  musicUrl: "./assets/opening.mp3?v=2f00b4805ba824ab",
  musicVolume: 0.82,
  musicLoop: false,
  footerText:
    "《卧龙传·三国制霸之计》及原版游戏数据（图像、音乐、文本、剧本等）版权归NEO·GETEN及松岗所有。重制章节来自轩辕春秋文化论坛(www.xycq.org.cn)网友yanguodong发布，加载页音乐来自电影《少林足球》主题曲opening(黄英华作)<br>本项目为非官方重构，用于学习、研究与非商业怀旧交流。原创代码采用MIT许可，原作及第三方素材不在MIT范围内；维护者未取得原版图片、音乐等素材的公开再分发授权。学习或非商业用途不等于授权或免责，使用及部署前请确认所需许可。如权利人认为内容涉及其权益，请联系核实、移除或替换。在线体验：https://dragon.720108.xyz，代码仓库：https://github.com/tianyi092-jcza/dragon， 联系邮箱：fczllc@163.com。",
  subtitle: {
    text: "三国制霸之计",
    x: 328,
    y: 392,
    fontSize: 23,
    letterSpacing: 3,
    color: "#45473e",
    fontFamily: '"STKaiti", "KaiTi", "Noto Serif CJK SC", serif',
  },
};
