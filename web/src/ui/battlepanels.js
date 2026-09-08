// Tactical popup geometry shared by DOM layout and GameBar's textured window builder.
// Values are modern product UI properties, not claims about KI.EXE layout.
export const BATTLE_PANEL_TILE_PX = 16;
export const POPUP_FONT_PX = 16;
export const BATTLE_FRAME_INSET_PX = 8;

function framedPanel(selector, cols, rows, anchors = {}) {
  const panel = Object.freeze({
    selector,
    cols,
    rows,
    width: cols * BATTLE_PANEL_TILE_PX,
    height: rows * BATTLE_PANEL_TILE_PX,
    ...anchors,
  });
  if (
    panel.width !== panel.cols * BATTLE_PANEL_TILE_PX ||
    panel.height !== panel.rows * BATTLE_PANEL_TILE_PX
  )
    throw new Error("invalid tactical panel tile geometry");
  return panel;
}

export const BATTLE_PANEL_SPECS = Object.freeze({
  title: framedPanel(".battle-operation-header", 12, 5, {
    top: 16,
    left: 16,
  }),
  enemy: framedPanel(".battle-enemy-window", 12, 7, {
    top: 16,
    right: 16,
  }),
  player: framedPanel(".battle-player-window", 12, 18, {
    right: 16,
    bottom: 16,
  }),
  cards: Object.freeze({
    selector: "#battle-bottom-bar",
    width: 624,
    height: 36,
    left: 16,
    bottom: 16,
  }),
  dialogue: Object.freeze({
    ...framedPanel(".battle-dialogue", 30, 5),
    inset: BATTLE_FRAME_INSET_PX,
    portrait: 64,
    copyGap: 8,
    lineHeight: 20,
    nameMargin: 3,
    copyAlign: "center",
    topAnchor: "title",
    bottomAnchor: "cards",
  }),
});

const dialogue = BATTLE_PANEL_SPECS.dialogue;
if (dialogue.portrait !== dialogue.height - dialogue.inset * 2)
  throw new Error("tactical dialogue portrait must fill the framed interior");
