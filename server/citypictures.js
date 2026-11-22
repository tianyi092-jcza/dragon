// 目錄索引沿用據點 view；檔名僅來自固定目錄，不採用請求路徑。
export const cityPictures = Array.from({ length: 15 }, (_, id) => `kyo_${String(id).padStart(2, '0')}.png`);
