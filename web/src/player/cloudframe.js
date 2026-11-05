// 原版雲紋金框（素材：ICONGRF.DAT 提取 → web/grf/ui/{cloud,frame_sq,frame_col,frame_cap}.png）。
// 標題頁的遊戲名標籤與「不可用存檔」彈窗共用同一套拼法：16px 格、
// 上下用方框鏈片 frame_sq，左右用柱帽 frame_cap + 柱身 frame_col，
// 內部 32×32 雲紋平鋪。這裡只畫框與底，不畫文字、不接管互動。
let cache = null;
export function loadCloudFrameImages(base = 'grf/ui/') {
  if (cache) return cache;
  const load = name => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`cloud frame asset unavailable: ${name}`));
    image.src = base + name;
  });
  cache = Promise.all([load('cloud.png'), load('frame_sq.png'), load('frame_col.png'), load('frame_cap.png')])
    .then(([cloud, sq, col, cap]) => Object.freeze({ cloud, sq, col, cap }));
  // 失敗不留下壞快取：下一次還能重試。
  cache.catch(() => { cache = null; });
  return cache;
}
export function paintCloudWindow(ctx, images, width, height) {
  const { cloud, sq, col, cap } = images;
  for (const y of [0, height - 8]) for (let x = 8; x < width - 8; x += 8) ctx.drawImage(sq, x, y);
  for (const x of [0, width - 8]) {
    ctx.drawImage(cap, x, 0);
    for (let y = 8; y < height - 8; y += 8) ctx.drawImage(col, x, y);
    ctx.drawImage(cap, x, height - 8);
  }
  ctx.fillStyle = ctx.createPattern(cloud, 'repeat');
  ctx.fillRect(8, 8, width - 16, height - 16);
}
