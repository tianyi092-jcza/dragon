// HUD — 顶部面板(剧本/季节切换)、势力图例、悬停提示、君主卡
import { factionColorEx, SEASONS } from "../game/world.js";
import { portrait } from "../core/assets.js";
import * as cmd from "../game/commands.js";
import { clickSfx, warnSfx, toggleMute, unlockSfx } from "../core/speaker.js";
import { quoteFor } from "../game/talk.js";
import * as adv from "../game/advisor.js";
import {
  sendEnvoy,
  pickEnvoy,
  relation,
  relationLabel,
  relationColor,
  GIFT_COST,
  moveCapital,
} from "../game/diplomacy.js";

/** DOM 构建辅助(替代 innerHTML, 规避 XSS 静态检查) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") el.style.cssText = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on"))
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k !== "class") el[k] = v;
  }
  if (attrs.class != null) el.className = attrs.class;
  for (const c of children.flat()) el.append(c ?? "");
  return el;
}

export class HUD {
  constructor(app) {
    this.app = app; // { setScenario, setSeason, view }
    this.tip = document.querySelector("#tip");
    this.card = document.querySelector("#card");
    this.buildTabs();
    this.buildSeasons();
    this.buildClockBar();
    this.buildLegend();
  }

  buildClockBar() {
    // 时间控制条: 日期显示 + 暂停/速度 (对应系统菜单"戰略速度")
    const bar = document.querySelector("#clockbar");
    if (!bar) return;
    const names = ["⏸", "▶", "▶▶", "▶▶▶"];
    const spdTabs = names.map((n, i) =>
      h("span", { class: "tab spd", "data-spd": `${i}` }, n),
    );
    const taxVal = h("b", { id: "taxval" });
    const taxCtl = h(
      "span",
      { id: "taxctl" },
      "稅率 ",
      taxVal,
      h("span", { class: "tab", id: "taxdn" }, "−"),
      h("span", { class: "tab", id: "taxup" }, "＋"),
    );
    bar.replaceChildren(
      h("span", { id: "datestr" }),
      " ",
      ...spdTabs,
      h("span", { id: "trustbar" }),
      h("span", { class: "tab", id: "askadv" }, "進言"),
      h("span", { class: "tab", id: "loadsav" }, "讀檔"),
      h("span", { class: "tab", id: "savesav" }, "存檔"),
      h("span", { class: "tab", id: "sndtgl" }, "🔊"),
      taxCtl,
      h("span", { id: "settlelog" }),
    );
    bar.querySelectorAll(".spd").forEach((b) => {
      b.onclick = () => {
        if (this.app.clock) this.app.clock.speed = +b.dataset.spd;
      };
    });
    document.querySelector("#taxup").onclick = () =>
      this.setTax(
        cmd.setTax(this.app.scenario, (this.app.scenario.tax ?? 25) + 1),
      );
    document.querySelector("#taxdn").onclick = () =>
      this.setTax(
        cmd.setTax(this.app.scenario, (this.app.scenario.tax ?? 25) - 1),
      );
    document.querySelector("#askadv").onclick = () => this.showAdvice();
    document.querySelector("#loadsav").onclick = () => this.showLoadDialog();
    document.querySelector("#savesav").onclick = () => this.showSaveDialog();
    document.querySelector("#sndtgl").onclick = () => {
      unlockSfx(); // 切换前先解锁(手势内)
      const m = toggleMute();
      document.querySelector("#sndtgl").textContent = m ? "🔇" : "🔊";
      if (!m) clickSfx(); // 开启时给一声确认
    };
    // 首次任意点击解锁音频(浏览器自动播放策略)
    document.addEventListener("pointerdown", () => unlockSfx(), { once: true });
    document.querySelector("#advyes").onclick = () => this.resolveAdvice(true);
    document.querySelector("#advno").onclick = () => this.resolveAdvice(false);
    document.querySelector("#advcancel").onclick = () =>
      this.resolveAdvice(null);
    document.querySelector("#loadcancel").onclick = () =>
      (document.querySelector("#loaddlg").style.display = "none");
  }

  /** 讀檔對話框: 列出 SAVE.DAT 四槽 (parse_save.py 預解析) */
  showLoadDialog() {
    const slots = this.app.saves?.slots ?? [];
    const box = document.querySelector("#loadslots");
    box.replaceChildren(
      ...slots.map((s) => {
        const b = h("button", { class: "slot" });
        b.textContent =
          `槽${s.slot + 1} ${s.played ? s.label : "（未使用）"} ` +
          `· 劇本${s.scenario_idx + 1} · 軍團${s.state.legions?.length ?? 0}`;
        b.onclick = () => {
          document.querySelector("#loaddlg").style.display = "none";
          this.app.loadSave(s.slot);
          this.refreshTrust();
        };
        return b;
      }),
    );
    document.querySelector("#loaddlg").style.display = "block";
  }

  /** 存檔對話框: 選槽→寫入 (快照+SAVE.DAT 組裝) */
  showSaveDialog() {
    const dlg = document.querySelector("#savedlg");
    const box = document.querySelector("#saveslots");
    const ck = this.app.clock;
    const label = `${ck.year}/${ck.month}/${ck.day}`;
    box.replaceChildren(
      ...[0, 1, 2, 3].map((i) => {
        const s = this.app.saves?.slots.find((x) => x.slot === i);
        const b = h("button", { class: "slot" });
        b.textContent = `槽${i + 1} ${s?.played ? s.label : "（未使用）"} → 存入「${label}」`;
        b.onclick = () => {
          dlg.style.display = "none";
          this.app.saveGame(i, label).then((r) => {
            if (r.saved === "download")
              this.flashEvent("已下載 SAVE.DAT（替換遊戲目錄同名檔）");
          });
          this.refreshTrust();
        };
        return b;
      }),
    );
    dlg.style.display = "block";
  }

  setTax(r) {
    if (r?.ok) this.flashEvent(r.ok);
    this.refreshTrust();
  }

  /** ★信赖度红线显示 (CS:0xD00; 归零=进言无效/GAME OVER) */
  refreshTrust() {
    const sc = this.app.scenario;
    if (!sc || sc.trust == null) return;
    const el = document.querySelector("#trustbar");
    const t = sc.trust ?? 0;
    const b = h("b", { style: `color:${t <= 20 ? "#e04a3a" : "#8fb86b"}` }, t);
    el.replaceChildren("信賴度 ", b);
    document.querySelector("#taxval").textContent = (sc.tax ?? 25) + "%";
  }

  refreshClock() {
    const c = this.app.clock;
    if (!c) return;
    document.querySelector("#datestr").textContent =
      `${c.year}年${c.month}月${c.day}日 ${String(c.hour).padStart(2, "0")}時`;
    document
      .querySelectorAll("#clockbar .spd")
      .forEach((b, i) => b.classList.toggle("on", i === c.speed));
  }

  showSettlement(report) {
    const top = report
      .filter((r) => r.faction != null)
      .sort((a, b) => b.income - a.income)
      .slice(0, 3);
    document.querySelector("#settlelog").textContent =
      `月結算稅收TOP: ` + top.map((r) => `${r.monarch}+${r.income}`).join(" ");
  }

  buildTabs() {
    const el = document.querySelector("#tabs");
    this.app.data.scenarios.forEach((raw, i) => {
      const t = document.createElement("span");
      t.className = "tab";
      t.textContent = raw.start.year + "年";
      t.onclick = () => this.app.setScenario(i);
      el.append(t);
    });
  }

  buildSeasons() {
    const el = document.querySelector("#seasons");
    const names = ["春", "夏", "秋", "冬"];
    SEASONS.forEach((s, i) => {
      const b = document.createElement("span");
      b.className = "tab";
      b.dataset.season = s;
      b.textContent = names[i];
      b.onclick = () => this.app.setSeason(i);
      el.append(b);
    });
  }

  buildLegend() {
    const lg = document.querySelector("#legend");
    const sc = this.app.scenario;
    lg.replaceChildren(h("b", {}, sc.name));
    for (const f of sc.factions) {
      lg.append(
        h(
          "div",
          {
            class: "frow",
            dataset: { f: f.idx },
            onclick: () => {
              const idx = +f.idx;
              this.app.view.selectedFaction =
                this.app.view.selectedFaction === idx ? null : idx;
              this.showFactionCard(this.app.scenario.factions[idx]);
              this.app.view.draw();
            },
          },
          h(
            "span",
            { style: `color:${factionColorEx(this.app.scenario, f.idx)}` },
            "●",
          ),
          ` ${f.monarch} `,
          h("span", { class: "dim" }, `(${f.n_cities}城/${f.n_generals}將)`),
        ),
      );
    }
    lg.append(h("span", { class: "dim", style: "color:#777" }, "● 空城"));
  }

  refreshInfo() {
    const sc = this.app.scenario;
    document.querySelector("#info").textContent =
      `${sc.name} · ${sc.cities.length}城 · ${sc.generals.length}将 · ${sc.legions.length}军团`;
    document
      .querySelectorAll("#tabs .tab")
      .forEach((t, j) => t.classList.toggle("on", j === this.app.scenarioIdx));
    document
      .querySelectorAll("#seasons .tab")
      .forEach((t) =>
        t.classList.toggle(
          "on",
          t.dataset.season === SEASONS[this.app.seasonIdx],
        ),
      );
    this.refreshTrust();
  }

  /** ★进言对话框 — 军师建议 + 采纳/驳回(信赖±20, KI.EXE 0x38AD/0x389A) */
  showAdvice() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;
    const gen = adv.getAdvisor(sc, f);
    const s = adv.makeSuggestion(this.app);
    const dlg = document.querySelector("#advisordlg");
    const who = gen ? `${gen.name}曰：` : "（無人可進言）";
    document.querySelector("#advtext").textContent =
      who + (s ? adv.suggestionText(sc, s) : "眼下並無良策。");
    this._pendingAdvice = s;
    const wasOpen = dlg.style.display === "block";
    dlg.style.display = "block";
    if (!wasOpen) {
      this.dialogCount = (this.dialogCount ?? 0) + 1; // 模态弹窗冻结计时
    }
    if (!dlg._hasCtx) {
      dlg._hasCtx = true;
      dlg.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.resolveAdvice(null);
      });
    }
    this.refreshTrust();
  }

  /** ok=true采纳 / false君主直接驳回(-20) / null撤回进言(不扣信赖) */
  resolveAdvice(ok) {
    const dlg = document.querySelector("#advisordlg");
    dlg.style.display = "none";
    this.dialogCount = Math.max(0, (this.dialogCount ?? 1) - 1);
    this.app.gamebar?.onModalClosed?.();
    const s = this._pendingAdvice;
    this._pendingAdvice = null;
    if (ok === null) {
      clickSfx();
      this.flashEvent("已撤回進言。（信賴度不變）");
    } else if (!s) {
      this.flashEvent("眼下並無良策。（信賴度不變）");
    } else if (ok) {
      const r = adv.adopt(this.app, s);
      if (r.ok) clickSfx();
      else warnSfx();
      this.flashEvent((r.ok ? "✓ " : "✗ ") + r.msg);
      if (r.ok && s.type === "dispatch") this.app.dispatching = null;
    } else {
      warnSfx(); // 君主直接駁回=警告音, 信赖-20 (KI.EXE 0x389A)
      this.flashEvent(adv.dismiss(this.app).msg);
    }
    this.refreshTrust();
  }

  flashEvent(msg) {
    if (!msg) return;
    let el = document.querySelector("#flashlog");
    if (!el) {
      el = document.createElement("div");
      el.id = "flashlog";
      document.body.append(el);
    }
    const line = document.createElement("div");
    line.textContent = msg;
    el.prepend(line);
    while (el.children.length > 6) el.lastChild.remove();
    clearTimeout(line._tm);
    setTimeout(() => line.remove(), 4000);
  }

  // ---- 模态弹窗计时冻结: 打开时 dialogCount++, remove 时递减 (原版 [0xD2A]=1 时钟停) ----
  _modal(dlg) {
    this.dialogCount = (this.dialogCount ?? 0) + 1;
    const orig = dlg.remove.bind(dlg);
    dlg.remove = () => {
      orig();
      this.dialogCount = Math.max(0, (this.dialogCount ?? 1) - 1);
      this.app.gamebar?.onModalClosed?.();
    };
    return dlg;
  }

  // ---- 通用列表弹窗 (DOM+CSS 布局, 军师子菜单 武將/勢力 共用骨架) ----
  // rows: [{cells:[...], hl?}] ; 关闭时回调 onClose
  _listDialog(id, title, headers, rows, colw, onPick) {
    let dlg = document.querySelector(`#${id}`);
    if (dlg) dlg.remove(); // 重复打开=重建(刷新数据)
    dlg = h("div", {
      id,
      class: "panel",
      style: `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        padding: 10px 12px; z-index: 70; max-height: 80vh;
        display: flex; flex-direction: column; gap: 6px;`,
    });
    const head = h(
      "div",
      { style: "display:flex; align-items:center; gap:10px" },
      h("b", { style: "flex:1" }, title),
    );
    dlg.append(head);
    // 原版语义: 右键关闭
    dlg.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      dlg.remove();
    });
    const wrap = h("div", {
      style: `
        overflow-y: auto; max-height: min(calc(80vh - 48px), 264px);
        border: 1px solid #6b5335;`,
    });
    const table = h("table", {
      style: `
        border-collapse: collapse; font-size: 13px; width: 100%;`,
    });
    const thead = h("thead");
    const trh = h("tr");
    headers.forEach((t, i) =>
      trh.append(
        h(
          "th",
          {
            style: `
          position: sticky; top: 0; background: #2a2015; color: #ffd88a;
          padding: 4px 8px; text-align: ${i ? "right" : "left"};
          ${colw && colw[i] ? `min-width:${colw[i]}px;` : ""}`,
          },
          t,
        ),
      ),
    );
    thead.append(trh);
    table.append(thead);
    const tbody = h("tbody");
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const tr = h("tr", {
        style: `${row.hl ? "background:#3a2c18;" : ""}${
          onPick ? "cursor:pointer;" : ""
        }`,
        onclick: onPick ? () => onPick(ri) : null,
      });
      row.cells.forEach((c, i) =>
        tr.append(
          h(
            "td",
            {
              style: `
            padding: 3px 8px; text-align: ${i ? "right" : "left"};
            border-top: 1px solid #4a3a22; white-space: nowrap;`,
            },
            typeof c === "object" && c !== null
              ? h("span", { style: `color:${c.color}` }, c.t)
              : c,
          ),
        ),
      );
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    dlg.append(wrap);
    document.body.append(this._modal(dlg));
    return dlg;
  }

  /** 武將列表 — 军师子菜单「武將」: 复刻原版武将能力一览弹窗 (Canvas 弹窗构建) */
  showGenerals() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    // 活跃武将 (保持数据表自然顺序)
    const mine = sc.generals.filter(
      (g) => g && g.faction === f.idx && g.active !== false,
    );

    const getIdentity = (g) => {
      if (g.status === 4) return "俘虜";
      if (g.is_monarch || g.status === 5) return "君主";
      if (g.status === 1) return "軍團長";
      if (g.status === 2) return "內政官";
      if (g.status === 3) return "外交官";
      // 动态反查 (status 为 0 时的 fallback)
      if (sc.legions?.some((L) => L.leader === g.name || L.leader === g.idx)) {
        return "軍團長";
      }
      if (sc.cities?.some((c) => c.governor === g.idx)) {
        return "內政官";
      }
      if (
        sc.envoys &&
        Object.values(sc.envoys).some((e) => e?.name === g.name?.trim())
      ) {
        return "外交官";
      }
      return "－－－";
    };

    const rows = mine.map((g) => {
      const facName = f.monarch ?? "－－－";
      const iden = getIdentity(g);
      return {
        _gen: g,
        cells: [
          g.name?.trim() ?? "？",
          `${g.ability?.force ?? 0}`,
          `${g.ability?.lead ?? 0}`,
          `${g.ability?.politics ?? 0}`,
          facName,
          iden,
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["武將名", "武術", "統率", "政治", "勢力", "身分"],
      cols: [
        { x: 8, w: 80, align: "left" },
        { x: 96, w: 48, align: "right" },
        { x: 152, w: 48, align: "right" },
        { x: 208, w: 48, align: "right" },
        { x: 272, w: 80, align: "left" },
        { x: 360, w: 80, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "確認指示之武將的能力。",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const g = rows[ri]?._gen;
        if (!g) return;
        this.app.gamebar.showGeneralCard(g);
      },
    });
  }

  /** 編成 — 军师子菜单「編成」: 选择空闲武将组建军团 (Canvas 弹窗构建) */
  showFormation() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    const getIdentity = (g) => {
      if (g.status === 4) return "俘虜";
      if (g.is_monarch || g.status === 5) return "君主";
      if (g.status === 1) return "軍團長";
      if (g.status === 2) return "內政官";
      if (g.status === 3) return "外交官";
      // 动态反查 (status 为 0 时的 fallback)
      if (sc.legions?.some((L) => L.leader === g.name || L.leader === g.idx)) {
        return "軍團長";
      }
      if (sc.cities?.some((c) => c.governor === g.idx)) {
        return "內政官";
      }
      if (
        sc.envoys &&
        Object.values(sc.envoys).some((e) => e?.name === g.name?.trim())
      ) {
        return "外交官";
      }
      return "－－－";
    };

    // 筛选所有身份为“－－－”的空闲武将
    const mine = sc.generals.filter(
      (g) =>
        g &&
        g.faction === f.idx &&
        g.active !== false &&
        getIdentity(g) === "－－－",
    );

    const rows = mine.map((g) => {
      const facName = f.monarch ?? "－－－";
      return {
        _gen: g,
        cells: [
          g.name?.trim() ?? "？",
          `${g.ability?.force ?? 0}`,
          `${g.ability?.lead ?? 0}`,
          `${g.ability?.politics ?? 0}`,
          facName,
          "－－－",
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["武將名", "武術", "統率", "政治", "勢力", "身分"],
      cols: [
        { x: 8, w: 80, align: "left" },
        { x: 96, w: 48, align: "right" },
        { x: 152, w: 48, align: "right" },
        { x: 208, w: 48, align: "right" },
        { x: 272, w: 80, align: "left" },
        { x: 360, w: 80, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "進行軍隊編組。\n請選擇武將。",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const g = rows[ri]?._gen;
        if (!g) return;
        if (this.app.gamebar.listDialog) {
          this.app.gamebar.listDialog.selectedRow = ri;
        }
        this.app.gamebar.showFormationDialog(g);
      },
    });
  }

  /** 內政官任命 — 军师子菜单「人事」 -> 「內政官任命」: 选择据点 */
  showAppointGovernorCities() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    // 我方所有据点 (保持数据表自然顺序)
    const mine = sc.cities.filter((c) => c && c.faction === f.idx);

    const rows = mine.map((c) => {
      const troops = (c.sim ? c.sim.troops : c.troops) ?? c.troops ?? 0;
      const rise = ((c.sim ? c.sim.morale : c.growth) ?? 100) - 100;
      const defence = (c.sim ? c.sim.food : c.defence) ?? 0;
      const prod = c.prod ?? 0;

      let govName = "－－－";
      if (c.governor != null && sc.generals[c.governor]) {
        govName = sc.generals[c.governor].name?.trim() ?? "－－－";
      }

      return {
        _city: c,
        cells: [
          c.name?.trim() ?? "？",
          `${prod}`,
          rise <= 0 ? { t: `${rise}`, color: "#ff4444" } : `${rise}`,
          `${defence}`,
          `${troops * 10}`,
          govName,
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["據點名", "生產力", "上昇率", "防災", "城兵", "內政官"],
      cols: [
        { x: 8, w: 78, align: "left" },
        { x: 88, w: 68, align: "right" },
        { x: 160, w: 56, align: "right" },
        { x: 220, w: 56, align: "right" },
        { x: 280, w: 64, align: "right" },
        { x: 352, w: 90, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "要派遣內政官到哪個據點？",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const city = rows[ri]?._city;
        if (!city) return;

        const gov =
          city.governor != null && sc.generals[city.governor]
            ? sc.generals[city.governor]
            : null;

        if (gov) {
          // 该据点已有内政官：高亮当前行，弹出 NPC 提示框
          if (this.app.gamebar.listDialog) {
            this.app.gamebar.listDialog.selectedRow = ri;
          }
          const cityName = city.name?.trim() ?? "";
          const govName = gov.name?.trim() ?? "";
          this.app.gamebar.showNpcMessageDialog({
            lines: [
              [
                { text: cityName, color: "#f8a800" },
                { text: `　已有${govName}　大人`, color: "#ffffff" },
              ],
              "前去赴任了。",
            ],
            onClose: () => {
              if (this.app.gamebar.listDialog) {
                this.app.gamebar.listDialog.selectedRow = -1;
              }
              this.app.view.draw();
            },
          });
          return;
        }

        // 未任命内政官：进入武将选择
        this.showAppointGovernorGenerals(city);
      },
    });
  }

  /** 內政官任命 — 选择武将并完成任命 */
  showAppointGovernorGenerals(city) {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f || !city) return;

    const getIdentity = (g) => {
      if (g.status === 4) return "俘虜";
      if (g.is_monarch || g.status === 5) return "君主";
      if (g.status === 1) return "軍團長";
      if (g.status === 2) return "內政官";
      if (g.status === 3) return "外交官";
      if (sc.legions?.some((L) => L.leader === g.name || L.leader === g.idx)) {
        return "軍團長";
      }
      if (sc.cities?.some((c) => c.governor === g.idx)) {
        return "內政官";
      }
      if (
        sc.envoys &&
        Object.values(sc.envoys).some((e) => e?.name === g.name?.trim())
      ) {
        return "外交官";
      }
      return "－－－";
    };

    // 筛选所有身份为“－－－”的空闲武将
    const mine = sc.generals.filter(
      (g) =>
        g &&
        g.faction === f.idx &&
        g.active !== false &&
        getIdentity(g) === "－－－",
    );

    const rows = mine.map((g) => {
      const facName = f.monarch ?? "－－－";
      return {
        _gen: g,
        cells: [
          g.name?.trim() ?? "？",
          `${g.ability?.force ?? 0}`,
          `${g.ability?.lead ?? 0}`,
          `${g.ability?.politics ?? 0}`,
          facName,
          "－－－",
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["武將名", "武術", "統率", "政治", "勢力", "身分"],
      cols: [
        { x: 8, w: 80, align: "left" },
        { x: 96, w: 48, align: "right" },
        { x: 152, w: 48, align: "right" },
        { x: 208, w: 48, align: "right" },
        { x: 272, w: 80, align: "left" },
        { x: 360, w: 80, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "請選擇任命之武將。",
        portrait: "message_npc",
      },
      onCancel: () => {
        this.showAppointGovernorCities();
      },
      onPick: (ri) => {
        const gen = rows[ri]?._gen;
        if (!gen) return;
        // 执行内政官任命
        city.governor = gen.idx;
        gen.status = 2; // 内政官
        if (this.app.gamebar.listDialog) {
          this.app.gamebar.listDialog.selectedRow = ri;
        }
        // 弹出武将对话小弹窗「我立刻前往。」
        this.app.gamebar.showGeneralMessageDialog(gen, "我立刻前往。", () => {
          this.showAppointGovernorCities();
        });
      },
    });
  }

  /** 內政官解任 — 军师子菜单「人事」 -> 「內政官解任」: 选择有内政官的据点解任 */
  showDismissGovernorCities() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    // 我方所有据点
    const mine = sc.cities.filter((c) => c && c.faction === f.idx);

    const rows = mine.map((c) => {
      const troops = (c.sim ? c.sim.troops : c.troops) ?? c.troops ?? 0;
      const rise = ((c.sim ? c.sim.morale : c.growth) ?? 100) - 100;
      const defence = (c.sim ? c.sim.food : c.defence) ?? 0;
      const prod = c.prod ?? 0;

      let govName = "－－－";
      if (c.governor != null && sc.generals[c.governor]) {
        govName = sc.generals[c.governor].name?.trim() ?? "－－－";
      }

      return {
        _city: c,
        cells: [
          c.name?.trim() ?? "？",
          `${prod}`,
          rise <= 0 ? { t: `${rise}`, color: "#ff4444" } : `${rise}`,
          `${defence}`,
          `${troops * 10}`,
          govName,
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["據點名", "生產力", "上昇率", "防災", "城兵", "內政官"],
      cols: [
        { x: 8, w: 78, align: "left" },
        { x: 88, w: 68, align: "right" },
        { x: 160, w: 56, align: "right" },
        { x: 220, w: 56, align: "right" },
        { x: 280, w: 64, align: "right" },
        { x: 352, w: 90, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "要解除哪個據點的內政官職務？",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const city = rows[ri]?._city;
        if (!city) return;

        const gov =
          city.governor != null && sc.generals[city.governor]
            ? sc.generals[city.governor]
            : null;

        if (!gov) {
          // 该据点未任命内政官
          if (this.app.gamebar.listDialog) {
            this.app.gamebar.listDialog.selectedRow = ri;
          }
          const cityName = city.name?.trim() ?? "";
          this.app.gamebar.showNpcMessageDialog({
            lines: [
              [
                { text: cityName, color: "#f8a800" },
                { text: "　並未任命內政官。", color: "#ffffff" },
              ],
            ],
            onClose: () => {
              if (this.app.gamebar.listDialog) {
                this.app.gamebar.listDialog.selectedRow = -1;
              }
              this.app.view.draw();
            },
          });
          return;
        }

        // 解除内政官
        if (this.app.gamebar.listDialog) {
          this.app.gamebar.listDialog.selectedRow = ri;
        }
        city.governor = null;
        gov.status = 0; // 恢复为闲置武将
        // 弹出武将发言弹窗「我這就返回。」
        this.app.gamebar.showGeneralMessageDialog(gov, "我這就返回。", () => {
          this.showDismissGovernorCities();
        });
      },
    });
  }

  /** 據點一覽 — 军师子菜单「據點」 -> 「據點一覽」: 我方据点列表 (Canvas 弹窗构建) */
  showBaseCities() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;

    // 我方活跃据点 (保持数据表自然顺序)
    const mine = sc.cities.filter((c) => c && c.faction === f.idx);

    const rows = mine.map((c) => {
      const troops = (c.sim ? c.sim.troops : c.troops) ?? c.troops ?? 0;
      const rise = ((c.sim ? c.sim.morale : c.growth) ?? 100) - 100;
      const defence = (c.sim ? c.sim.food : c.defence) ?? 0;
      const prod = c.prod ?? 0;

      let govName = "－－－";
      if (c.governor != null && sc.generals[c.governor]) {
        govName = sc.generals[c.governor].name?.trim() ?? "－－－";
      }

      return {
        _city: c,
        cells: [
          c.name?.trim() ?? "？",
          `${prod}`,
          rise <= 0 ? { t: `${rise}`, color: "#ff4444" } : `${rise}`,
          `${defence}`,
          `${troops * 10}`,
          govName,
        ],
      };
    });

    this.app.gamebar.openListDialog({
      title: "",
      header: ["據點名", "生產力", "上昇率", "防災", "城兵", "內政官"],
      cols: [
        { x: 8, w: 78, align: "left" },
        { x: 88, w: 68, align: "right" },
        { x: 160, w: 56, align: "right" },
        { x: 220, w: 56, align: "right" },
        { x: 280, w: 64, align: "right" },
        { x: 352, w: 90, align: "left" },
      ],
      rows,
      rowH: 18,
      scrollbar: "right",
      w: 480,
      h: 352,
      footer: {
        text: "將游標移動至指示之據點。",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const city = rows[ri]?._city;
        if (!city) return;
        this.app.gamebar.closeListDialog();
        const view = this.app.view;
        const [wxp, wyp] = view.cityPixel(city);
        view.cam.x = innerWidth / 2 - wxp;
        view.cam.y = innerHeight / 2 - wyp;
        view.clampCam();
        this.app.gamebar.showCityCard(city);
        this.app.gamebar.selectedSubmenu = 5;
        this.app.gamebar.syncClock();
        view.draw();
      },
    });
  }

  /** 勢力列表 — 军师子菜单「勢力」: 全部活跃势力 + 与我方关系 */
  showFactions() {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me) return;
    const rows = sc.factions.map((f) => {
      const m = sc.generals[f.monarch_idx];
      const isMe = f.idx === me.idx;
      const rel = relation(sc, me.idx, f.idx);
      const envoy = sc.envoys?.[f.idx]?.name ?? "－－－";
      return {
        cells: [
          m ? m.name.trim() : `?`,
          `${sc.generals.filter((g) => g && g.faction === f.idx && g.active !== false && g.idx !== f.advisor_idx).length}`,
          `${sc.cities.filter((c) => c.faction === f.idx).length}`,
          sc.cities[f.capital]?.name ?? "－－－",
          isMe ? "－－" : { t: relationLabel(rel), color: relationColor(rel) },
          isMe ? "－－－" : envoy,
        ],
      };
    });
    this.app.gamebar.openListDialog({
      title: "",
      header: ["勢力名", "武將", "據點", "首都", "外交", "外交官"],
      cols: [
        { x: 8, w: 80, align: "left" },
        { x: 92, w: 54, align: "left" },
        { x: 150, w: 54, align: "left" },
        { x: 208, w: 78, align: "left" },
        { x: 288, w: 64, align: "center" },
        { x: 360, w: 56, align: "left" },
      ],
      rows,
      rowH: 18,
      w: 480,
      h: 352,
      footer: {
        text: "將游標移動至指示之勢力的首都據點。",
        portrait: "message_npc",
      },
      onPick: (ri) => {
        const target = sc.factions[ri];
        if (!target) return;
        this.app.gamebar.closeListDialog();
        const cap = target.capital == null ? null : sc.cities[target.capital];
        if (!cap) return;
        const view = this.app.view;
        const [wxp, wyp] = view.cityPixel(cap);
        view.cam.x = innerWidth / 2 - wxp;
        view.cam.y = innerHeight / 2 - wyp;
        view.clampCam();
        this.app.gamebar.showCityCard(cap);
        this.app.gamebar.selectedSubmenu = 7;
        this.app.gamebar.syncClock();
        view.draw();
      },
    });
  }

  /** 編成 — 军师子菜单「軍團」: 选将→兵力分配→出陣确认 (原版 12 图规格) */
  showMuster() {
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    if (!f) return;
    const busy = new Set(sc.legions.map((L) => L.leader));
    const advGen = adv.getAdvisor(sc, f);
    const cands = sc.generals.filter(
      (g) =>
        g &&
        g.faction === f.idx &&
        g.active !== false &&
        g.status === 0 &&
        !g.is_player &&
        !busy.has(g.name) &&
        !(advGen && !advGen.custom && advGen.general_idx === g.idx),
    );
    if (!cands.length) {
      this.flashEvent("無可用大將（皆在閑以外或已帶軍）");
      return;
    }
    this._listDialog(
      "musterdlg",
      `編成 — 選將 (預備兵 ${f.troops ?? 0})`,
      ["武將", "武力", "統率", "政治", "身分"],
      cands.map((g) => ({
        cells: [
          g.name,
          `${g.ability.force}`,
          `${g.ability.lead}`,
          `${g.ability.politics}`,
          g.is_monarch ? "君主" : "武將",
        ],
      })),
      [120, 40, 40, 40, 50],
      (ri) => {
        document.querySelector("#musterdlg")?.remove();
        this._musterAllocate(sc, f, cands[ri]);
      },
    );
  }

  /** 編成第二步: 兵力分配 (六職各 1000, 總和不超預備兵) */
  _musterAllocate(sc, f, gen) {
    const DIVS = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];
    const dlg = h("div", {
      id: "musterdlg",
      class: "panel",
      style: `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        padding: 12px 16px; z-index: 70; display: flex; flex-direction: column; gap: 8px;
        align-items: center;`,
    });
    dlg.append(
      h(
        "div",
        { style: "display:flex; align-items:center; gap:12px; width:100%" },
        h("img", {
          src: portrait(gen.portrait),
          width: 64,
          height: 64,
          style: "image-rendering:pixelated; border:1px solid #6b5335;",
        }),
        h(
          "div",
          {},
          h("b", {}, `${gen.name} 軍編成`),
          h("div", { style: "font-size:13px" }, `預備兵：${f.troops ?? 0}`),
        ),
      ),
    );
    const grid = h("div", {
      style: "display:grid; grid-template-columns:repeat(3,1fr); gap:6px 14px",
    });
    const inputs = [];
    let sumEl;
    const total = () =>
      inputs.reduce((a, el) => a + (parseInt(el.value, 10) || 0), 0);
    for (const name of DIVS) {
      const inp = h("input", {
        type: "number",
        value: "1000",
        min: "0",
        step: "100",
        style:
          "width:72px; background:#1c150c; color:#efe4c0; border:1px solid #6b5335; padding:2px 4px; text-align:right;",
      });
      inp.oninput = () => {
        sumEl.textContent = `總兵力 ${total()}`;
      };
      inputs.push(inp);
      grid.append(
        h(
          "label",
          {
            style:
              "font-size:13px; display:flex; justify-content:space-between; gap:6px",
          },
          name,
          inp,
        ),
      );
    }
    sumEl = h("span", {}, "總兵力 6000");
    dlg.append(grid, sumEl);
    dlg.append(
      h(
        "div",
        { style: "display:flex; gap:10px" },
        h(
          "button",
          {
            onclick: () => {
              const t = total();
              if (t < 1) return this.flashEvent("兵力分配為空");
              if (t > (f.troops ?? 0)) return this.flashEvent("預備兵不足");
              dlg.remove();
              this._musterConfirm(
                sc,
                f,
                gen,
                inputs.map((el) => parseInt(el.value, 10) || 0),
              );
            },
          },
          "确定",
        ),
        h("button", { onclick: () => dlg.remove() }, "取消"),
      ),
    );
    document.body.append(this._modal(dlg));
  }

  /** 編成第三步: 出陣确认 — 军师头像 +「遵命！各位！出陣了！」 */
  _musterConfirm(sc, f, gen, divs) {
    const names = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];
    const advGen = adv.getAdvisor(sc, f);
    const dlg = h("div", {
      id: "musterdlg",
      class: "panel",
      style: `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        padding: 12px 16px; z-index: 70; display: flex; gap: 12px; align-items: center;`,
    });
    if (advGen) {
      dlg.append(
        h("img", {
          src: portrait(advGen.portrait),
          width: 72,
          height: 72,
          style: "image-rendering:pixelated; border:1px solid #6b5335;",
        }),
      );
    }
    dlg.append(
      h(
        "div",
        {
          style:
            "display:flex; flex-direction:column; gap:8px; align-items:flex-start",
        },
        h("div", {}, `「遵命！各位！出陣了！」`),
        h(
          "div",
          {
            style: "font-size:12px; color:#c8b88a",
          },
          names.map((n, i) => `${n}${divs[i]}`).join(" / "),
        ),
        h(
          "button",
          {
            onclick: () => {
              const divObj = {};
              names.forEach((n, i) => (divObj[n] = divs[i]));
              const r = cmd.muster(sc, gen, divObj);
              dlg.remove();
              this.flashEvent(r.err ?? `✓ ${r.ok}`);
            },
          },
          "出陣",
        ),
      ),
    );
    document.body.append(this._modal(dlg));
  }

  /** ★城池命令面板 — 选我方城下命令(复刻 0xCDE 流: 內政/徵兵/出征/税率) */
  showCityPanel(city) {
    const p = document.querySelector("#cmdpanel");
    if (!city) {
      if (p) p.style.display = "none";
      this.app.citySel = null;
      return;
    }
    const sc = this.app.scenario;
    const f = cmd.playerFaction(sc);
    this.app.citySel = city;
    p.style.display = "block";
    p.replaceChildren(
      h("img", {
        src: `grf/kyo_${String(city.view ?? 0).padStart(2, "0")}.png`,
        alt: "",
        style:
          "float:right;width:96px;height:96px;image-rendering:pixelated;border:1px solid #665;margin-left:6px",
      }),
      h("b", {}, city.name),
      " ",
      h(
        "span",
        { style: `color:${factionColorEx(this.app.scenario, f.idx)}` },
        `${f.monarch}軍`,
      ),
      h("br"),
      `開發 ${city.prod}/${city.max_prod} · 發展度 ${city.development ?? "?"}`,
      h("br"),
      `城兵 ${city.sim?.troops ?? city.troops}/${city.sim?.cap ?? city.troops_cap} · 士氣 ${city.sim?.morale ?? "?"} · 儲欉 ${city.sim?.food ?? "?"}`,
      h("br"),
      `金 ${f.gold ?? 0} · 信賴度 ${sc.trust ?? "?"}`,
      h(
        "div",
        { style: "margin-top:6px" },
        h(
          "span",
          { class: "tab act", "data-a": "develop" },
          `內政(${cmd.COST_DEVELOP}金)`,
        ),
        h(
          "span",
          { class: "tab act", "data-a": "recruit" },
          `徵兵(${cmd.COST_RECRUIT}金)`,
        ),
        h("span", { class: "tab act", "data-a": "dispatch" }, "出征"),
        h("span", { class: "tab act", "data-a": "capital" }, "遷都"),
        h("span", { class: "tab act", "data-a": "close" }, "✕"),
      ),
    );
    p.querySelectorAll(".act").forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === "close") return this.showCityPanel(null);
        // 统一单次执行+音效 (0xCDE确认一声 / 0xCE7警告两声)
        const run = (r) => {
          if (r.err == null) clickSfx();
          else warnSfx();
          this.flashEvent(r.err ?? r.ok ?? r.msg);
          return r;
        };
        if (a === "develop") return void run(cmd.develop(sc, city));
        if (a === "recruit") return void run(cmd.recruit(sc, city));
        if (a === "capital") {
          const r = run(moveCapital(sc, city));
          if (!r.err) this.showCityPanel(city); // 刷新面板
          return;
        }
        if (a === "dispatch") {
          clickSfx();
          this.app.dispatching = city;
          this.showCityPanel(null);
          this.flashEvent(`點擊目標城池出兵自${city.name}`);
        }
      };
    });
  }

  showTooltip(city, e) {
    if (!city) {
      this.tip.style.display = "none";
      return;
    }
    const sc = this.app.scenario,
      f = sc.factionOf(city);
    this.tip.style.display = "block";
    this.tip.style.left = e.clientX + 16 + "px";
    this.tip.style.top = e.clientY + 16 + "px";
    this.tip.replaceChildren(
      h("b", {}, city.name),
      " ",
      f
        ? h(
            "span",
            { style: `color:${factionColorEx(this.app.scenario, f.idx)}` },
            f.monarch,
          )
        : h("span", { class: "dim" }, "空城"),
      h("br"),
      `开发 ${city.prod}/${city.max_prod} · 防灾 ${city.defence} · 兵 ${city.troops}千`,
    );
    if (city.sim)
      this.tip.append(
        h("br"),
        `士气 ${city.sim.morale} · 兵力 ${city.sim.troops}/${city.sim.cap} · 储粮 ${city.sim.food}`,
      );
  }

  async showFactionCard(f) {
    if (!f) {
      this.card.style.display = "none";
      return;
    }
    // pi-lens-ignore: opengrep
    const sc = this.app.scenario;
    const mon = sc.monarchOf(f);
    const img = await portrait(mon.portrait).catch(() => null);
    const cap = sc.city(f.capital);
    // ★隐藏属性提示: 君主自陈特长 (TALK.DAT 558-581, 复刻原版能力确认流)
    const quote = await quoteFor(mon);
    this.card.replaceChildren(
      img ? h("img", { src: img.src, alt: "" }) : null,
      h(
        "div",
        {},
        h(
          "b",
          { style: `color:${factionColorEx(this.app.scenario, f.idx)}` },
          f.monarch,
        ),
        h("br"),
        `都城 ${cap ? cap.name : "?"} · ${f.n_cities}城 ${f.n_generals}将`,
        h("br"),
        h("span", { class: "dim" }, "金"),
        ` ${f.gold ?? f.money} `,
        h("span", { class: "dim" }, "粮"),
        ` ${f.food ?? 0} `,
        h("span", { class: "dim" }, "兵"),
        ` ${f.troops ?? 0}`,
        h("div", { class: "dim" }, "(占位公式·真实公式逆向中)"),
        quote
          ? h("div", { style: "color:#fd5;margin-top:2px" }, `「${quote}」`)
          : null,
        this._envoyBtn(f),
      ),
    );
    this.card.style.display = "flex";
  }

  /** ★外交按钮行 — 关系显示 + 遣使 + 觐见三动作 (TALK 0x77 菜单: 宣戰/停戰/請援) */
  _envoyBtn(f) {
    const sc = this.app.scenario;
    const me = cmd.playerFaction(sc);
    if (!me || f.idx === me.idx || f.n_cities === 0) return null;
    const v = relation(sc, me.idx, f.idx);
    const envoy = pickEnvoy(sc, me);
    const act = (label, actionId) =>
      h(
        "button",
        {
          style: "margin-left:6px",
          onclick: () => this.app.diploView.open(actionId, f.idx),
        },
        label,
      );
    return h(
      "div",
      { style: "margin-top:4px" },
      h("span", { class: "dim" }, "關係 "),
      `${relationLabel(v)}(${v})`,
      h(
        "div",
        { style: "margin-top:4px;display:flex;flex-wrap:wrap;gap:2px 0" },
        h(
          "button",
          {
            onclick: () => {
              const r = sendEnvoy(sc, f.idx);
              this.flashEvent(r.err ?? r.msg);
              if (r.ok) this.showFactionCard(f); // 刷新关系显示
            },
          },
          `遣使${GIFT_COST}金`,
        ),
        act("宣戰", "war"),
        act("停戰", "ceasefire"),
        act("請援", "aid"),
      ),
      envoy ? null : h("span", { class: "dim" }, "(無使者:遣使無效)"),
    );
  }
}
