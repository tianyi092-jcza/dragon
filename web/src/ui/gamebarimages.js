import { createOwnedImageResources } from "../render/ownedimages.js";

// Presentation roles only. World URLs and ports do not confer server authority.
export const GAMEBAR_UI_IMAGES = Object.freeze([
  "grf/ui/tool_bar.png", "grf/ui/tool_ico1.png", "grf/ui/tool_ico2.png",
  "grf/ui/tool_ico3.png", "grf/ui/tool_ico4.png", "grf/ui/ico_money.png",
  "grf/ui/ico_cavalry.png", "grf/ui/ico_archer.png", "grf/ui/ico_infantry.png",
  "grf/ui/cloud.png", "grf/ui/frame_sq.png", "grf/ui/frame_col.png",
  "grf/ui/frame_cap.png", "grf/ui/message_npc.png",
  "grf/ivent_0.png", "grf/ivent_1.png", "grf/ivent_2.png",
]);

export function createGameBarImageResources(app, { loadImage, assertCurrent }) {
  if (typeof loadImage !== "function" || typeof assertCurrent !== "function") {
    throw new TypeError("GAMEBAR_IMAGE_PORTS");
  }
  const world = app.world, definition = world?.definition,
    mini = definition?.assets?.minimap, base = mini?.base, large = mini?.large;
  if (typeof base !== "string" || !base || typeof large !== "string" || !large ||
      base === large || GAMEBAR_UI_IMAGES.includes(base) || GAMEBAR_UI_IMAGES.includes(large)) {
    throw new TypeError("GAMEBAR_MINIMAP_ROLES");
  }
  const urls = Object.freeze([
    ...GAMEBAR_UI_IMAGES.slice(0, 13), base,
    ...GAMEBAR_UI_IMAGES.slice(13), large,
  ]);
  const worldCurrent = () => {
    if (app.world !== world || world.definition !== definition ||
        definition.assets.minimap !== mini || mini.base !== base || mini.large !== large) {
      throw new Error("GAMEBAR_IMAGE_WORLD_STALE");
    }
  };
  const current = () => { worldCurrent(); assertCurrent(); worldCurrent(); };
  const escaped = urls.map(url => url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const owned = createOwnedImageResources({ loadImage, assertCurrent: current }, {
    role: new RegExp(`^(?:${escaped.join("|")})$`), limit: 19, prefix: "GAMEBAR_IMAGE",
  });
  return Object.freeze({
    loadImages: () => owned.loadImages(urls),
    assertCurrent: owned.assertCurrent,
    close: owned.close,
  });
}
