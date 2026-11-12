// Shared editor application. Platforms supply storage/blob/base ports;
// Node never imports cloudflare:workers or forks the business/auth routes.
import { createHash } from 'node:crypto';
import { GameMetadataStore } from './metadata.js';
import { GameDeletionFence } from './deletionfence.js';
import { GamePurge } from './gamepurge.js';
import { GameManagement } from './management.js';
import { ImmutableBlobStore } from './blobs.js';
import { InstalledSourceCatalog } from './sourcecatalog.js';
import { OwnedRuntimeAssets } from './runtimeassets.js';
import { installedSourcePolicy, installedAvailableLibraryPolicy } from './sourcecatalogpolicy.js';
import availableLibraryManifest from './available-library.txt';
import { AdminFullCopy } from './admincopy.js';
import { createPinnedCopyLoader } from '../tools/editor_trusted_copy.mjs';
import { FIXED_TEMPLATE_PROFILE } from './copyprofile.js';
import { GameSnapshotVerifier } from './snapshots.js';
import { PrivateDrafts } from './drafts.js';
import { GameCopyStore } from './gamecopy.js';
import { FixedCopyDataCompiler } from './datacompiler.js';
import { FixedCopyImages } from './copyimages.js';
import { FixedCopyImageJobs } from './imagejobs.js';
import { FixedCopyFallbackJobs } from './fallbackjobs.js';
import { StageJobsAPI } from './stageapi.js';
import { collectFixedStageAssets } from './stageassetcollection.js';
import { HttpCommandTargets } from './commandtargets.js';
import { PrivateWriteJournal } from './privatewrites.js';
import { PrivateLibraryAssets } from './libraryassets.js';
import { ValidationStore } from './validations.js';
import { PublishProgress, PUBLISH_STEPS } from './publishprogress.js';
// T6 试运行已取消：不再引用 TrialSessions，所有 /api/trial/* 一律 410。
import { PublishedGames } from './published.js';
import { PublishOperations } from './publishoperations.js';
import { AnnouncementStore } from './announcements.js';
import { ReleaseLedger } from './releases.js';
import { DistributionOutbox } from './distribution.js';
import { FrozenDistributionLedger } from './distributionledger.js';
import { FrozenPublicationProducer } from './publicationproducer.js';
import { PublishedPacks, RESERVED_ASSET_IDS } from './playpacks.js';
import { GamePortraits } from './portraits.js';
import { DraftTopology } from './topology.js';
import { validateGameSource, chapterReferenceReport } from '../web/src/content/authoring/gamesource.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';
import worldManifest from './pinned/world-manifest.txt';
import entityManifest from './pinned/entity-manifest.txt';
import { HttpError, fail, config, fields, body, account, password, passwordHash, passwordMatches, randomToken, sha, mac, seal, unseal, equal } from './security.js';
import { hasPendingMoves } from './topology.js';
import page from './public/index.html';
import client from './public/client.txt';
import draftClient from './public/draft.txt';
import stageClient from './public/stage.txt';
import libraryClient from './public/library.txt';
import catalogClient from './public/catalog.txt';
import managementClient from './public/management.txt';
import publishClient from './public/publish.txt';
import reviewClient from './public/review.txt';
import strongholdClient from './public/stronghold.txt';
import generalsClient from './public/general.txt';
import mapviewClient from './public/mapview.txt';
import stageAssetsClient from './public/stageassets.txt';
import style from './public/style.css';
import shellUI from './public/shell-ui.txt';
import shellStyle from './public/shell-ui.css';
import shellLicenses from './public/shell-ui-licenses.txt';
import trialwebBundle from './public/trialweb.txt';
// T6 试运行已取消：trialapp 已下线，不再导入 trialapp.txt。
import playappShell from './public/playapp.txt';
import { decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const COOKIE = '__Secure-dragon-editor';
function requestURL(request) { try { return new URL(request.url); } catch { fail(400, 'INVALID_URL'); } }
// Management previews use local object URLs; scripts remain self-only, no remote/data image sources.
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
// Trial-window shell/bundle routes: same policy plus the image/media/font sources the App actually needs.
// style-src allows inline: the App applies element.style inline (faction panel cssText, in-document styles);
// script-src stays strict 'self' (no inline script, no eval).
const trialHeaders = { ...headers, 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const trialWebFiles = new Map(parseTrialJson(trialwebBundle, 'trial web bundle').files.map(file => [file.path, file]));
const playAppPage = parseTrialJson(playappShell, 'play app shell').html;
// Only the pinned shared client resource paths are public; never expose source/draft registry roles.
const playLibraryPaths = new Set(Object.keys(parseTrialJson(availableLibraryManifest, 'available library').resources));
// Entry-level play-origin read (never throws: unset/invalid means no play
// domain; hard misconfiguration still surfaces as 503 on /api/* via config).
function playOriginOf(env) {
  try {
    const raw = env?.EDITOR_PLAY_ORIGIN;
    if (raw === undefined || raw === '') { return null; }
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) { return null; }
    return u.origin;
  } catch { return null; }
}
function parseTrialJson(text, label) { try { return JSON.parse(text); } catch (cause) { throw new Error(`${label} corrupt`, { cause }); } }
// T6 试运行已取消：TRIAL_WAIT_PAGE 已删除，所有 trial 入口 410。
const TRIAL_WEB_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.flac': 'audio/flac', '.wav': 'audio/wav' };
const trialWebType = path => TRIAL_WEB_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream';
function staticAsset(pathname) {
  if (pathname === '/shell-ui.js') { return { content: shellUI, type: 'text/javascript' }; }
  if (pathname === '/shell-ui.css') { return { content: shellStyle, type: 'text/css' }; }
  if (pathname === '/shell-ui-licenses.txt') { return { content: shellLicenses, type: 'text/plain' }; }
  if (pathname === '/client.js') { return { content: client, type: 'text/javascript' }; }
  if (pathname === '/draft.js') { return { content: draftClient, type: 'text/javascript' }; }
  if (pathname === '/stage.js') { return { content: stageClient, type: 'text/javascript' }; }
  if (pathname === '/library.js') { return { content: libraryClient, type: 'text/javascript' }; }
  if (pathname === '/catalog.js') { return { content: catalogClient, type: 'text/javascript' }; }
  if (pathname === '/management.js') { return { content: managementClient, type: 'text/javascript' }; }
  if (pathname === '/publish.js') { return { content: publishClient, type: 'text/javascript' }; }
  if (pathname === '/review.js') { return { content: reviewClient, type: 'text/javascript' }; }
  if (pathname === '/stronghold.js') { return { content: strongholdClient, type: 'text/javascript' }; }
  if (pathname === '/general.js') { return { content: generalsClient, type: 'text/javascript' }; }
  if (pathname === '/mapview.js') { return { content: mapviewClient, type: 'text/javascript' }; }
  if (pathname === '/stage-assets.js') { return { content: stageAssetsClient, type: 'text/javascript' }; }
  if (pathname === '/style.css') { return { content: style, type: 'text/css' }; }
  return { content: page, type: 'text/html' };
}
function response(value, status = 200, token) {
  const h = new Headers(headers); h.set('Content-Type', 'application/json; charset=utf-8');
  if (token !== undefined) { h.set('Set-Cookie', `${COOKIE}=${token}; Path=/api; Secure; HttpOnly; SameSite=Strict${token ? '' : '; Max-Age=0'}`); }
  return new Response(JSON.stringify(value), { status, headers: h });
}
// 错误封包：结构化拒绝理由（detail，目前仅上架的全章引用清单）只随同类错误返回，
// 成功响应与既有无 detail 的错误形状不变。
function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  // 非 HttpError 一律压成 INTERNAL_ERROR（不泄露内部细节），但把堆栈写到 stderr：
  // 没有它，上架编译阶段的 500 在库里全表无痕，只能靠猜。EDITOR_ERROR_DEBUG=0 可关。
  if (!(error instanceof HttpError) && process.env.EDITOR_ERROR_DEBUG !== '0') {
    const record = { event: 'internal-error', code: String(error?.code ?? ''), message: String(error?.message ?? error), stack: String(error?.stack ?? '') };
    process.stderr.write(JSON.stringify(record) + String.fromCharCode(10));
  }

  const detail = error instanceof HttpError ? error.detail : undefined;
  return response(detail === undefined ? { error: code } : { error: code, detail }, status);
}
function dto(user) { return { id: user.id, account: user.account, role: user.role, disabled: Boolean(user.disabled), mustChangePassword: Boolean(user.must_change), version: user.version, displayName: user.display_name ?? '', email: user.email ?? '', phone: user.phone ?? '', note: user.note ?? '' }; }
// §4.6 optional profile fields: interface-length bounds only, content untouched.
function profileField(value) { if (value === undefined) { return undefined; } if (typeof value !== 'string' || value.length > 128) { fail(422, 'PROFILE_FIELD'); } return value; }
function isLegacyPlayRoute(method, path) {
  return method === 'GET' && (path === '/api/published-games' || path === '/api/announcements' || path === '/api/trial-pack' || path === '/api/trial-asset' || path.startsWith('/api/play/web/') || path.startsWith('/content/builtin/compiled/'));
}
function cookie(request) {
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`));
  if (values.length !== 1 || !/^[a-f0-9]{64}$/.test(values[0].slice(COOKIE.length + 1))) { fail(401, 'LOGIN_REQUIRED'); }
  return values[0].slice(COOKIE.length + 1);
}
// A 路線第一版（可回滾）：上架／同意提交後在本次 HTTP 內把分發帳本推進到可見。
// 一步最多推進一代；次數與牆鐘雙重上限，卡死的傳輸層不會把連線拖到 Cloudflare 逾時。
const DISTRIBUTION_SYNC_STEPS = 8;
const DISTRIBUTION_SYNC_BUDGET_MS = 25000;
const VALIDATION_LAYER_CODES = new Map([['chapter', 'CHAPTER_MISSING'], ['general', 'CHAPTER_GENERAL_MISSING'], ['city', 'CHAPTER_CITY_MISSING'], ['slot', 'CHAPTER_CITY_SLOT_MISSING']]);
const VALIDATION_LAYER_KEYS = new Set(VALIDATION_LAYER_CODES.keys());
const VALIDATION_JOB_TTL_MS = 120000, VALIDATION_JOB_LIMIT = 8;
const DISTRIBUTION_SYNC_STATES = new Set(['IDLE', 'VISIBLE_CONFIRMED', 'COMMITTED_SYNC_PENDING']);
export function createEditorApplication(PlatformBase, { runtimeStager, frozenPublication = false, readSharedPortrait, purgeReclaimer, distributionDrain } = {}) {
  if (readSharedPortrait !== undefined && typeof readSharedPortrait !== 'function') throw new TypeError('trusted shared portrait reader required');
  // 刪除後的 R2 回收埠（方案 B）：只清本遊戲的位元組與在架指針條目，不是刪除權限。
  if (purgeReclaimer !== undefined && typeof purgeReclaimer !== 'function') throw new TypeError('trusted purge reclaimer required');
  // 同步分發埠只由可信組裝注入，不接受 HTTP／env 選擇；它只讀寫既有帳本，
  // 不發新代次、不改回執、不解除 recovery 鎖。未注入＝舊協議（回滾態）。
  if (distributionDrain !== undefined && (typeof distributionDrain !== 'function' || !frozenPublication)) { throw new TypeError('trusted frozen distribution drain required'); }
  if (typeof frozenPublication !== 'boolean' || frozenPublication && !runtimeStager) { throw new TypeError('frozen publication requires trusted runtime staging'); }
  // Trusted platform injection only, never an HTTP/env-selected capability.
  // Unconfigured legacy adapters do not claim R2 staging or visibility.
  if (runtimeStager !== undefined && (typeof runtimeStager?.stage !== 'function' || typeof runtimeStager?.verifyStaged !== 'function' || runtimeStager.verifyStaged.constructor?.name === 'AsyncFunction')) { throw new TypeError('runtime staging and synchronous proof ports required'); }
  const stageRuntime = runtimeStager?.stage.bind(runtimeStager);
  const verifyStaged = runtimeStager?.verifyStaged.bind(runtimeStager);
return class EditorMetadata extends PlatformBase {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    // Single-seat login gate (整站单用户在线), same semantics as vps/auth-server:
    // a live session rejects any new login with 409 SINGLE_USER_ONLINE.
    // Default off to preserve existing multi-session harnesses and dev flows;
    // production enables it with EDITOR_SINGLE_USER=1 (user decision 2026-10-30).
    this.singleUser = env.EDITOR_SINGLE_USER === '1';
    // Set once the available-library row exists; a virgin database has no owner
    // yet at construction time, so the first request retries (see handle()).
    this.libraryBootstrapped = false;
    ctx.storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY CHECK(version=1))');
      this.sql.exec('INSERT OR IGNORE INTO schema_version VALUES(1)');
      this.sql.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','author')), password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')");
      // §4.6 profile columns for databases created before B2.
      const userColumns = new Set(this.sql.exec('PRAGMA table_info(users)').toArray().map(column => column.name));
      for (const column of ['display_name', 'email', 'phone', 'note']) { if (!userColumns.has(column)) { this.sql.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`); } }
      this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), epoch INTEGER NOT NULL, absolute_until INTEGER NOT NULL, idle_until INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS login_rates (bucket TEXT PRIMARY KEY, start_at INTEGER NOT NULL, attempts INTEGER NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, sealed_result TEXT NOT NULL, epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(actor,op_key))');
    });
    // Fixed-copy drafts and bounded stage artifacts only; runtime/Trial/publish stay closed.
    let copies, runtimeAssets = null;
    this.games = new GameMetadataStore({ storage: ctx.storage, principal: hash => this.principal(hash),
      verifySnapshot: env.EDITOR_BLOBS ? context => new GameSnapshotVerifier({ blobs: this.blobs }).verify(context.tokenHash, context) : undefined,
      recoverAllocation: (hash, cap) => {
        if (!copies) { fail(503, 'COPY_NOT_CONFIGURED'); }
        try { return copies.resolveAllocation(hash, cap); }
        catch (error) {
          // Only an unrecognized private capability may try the other owner.
          // Never hide a recognized lease's revocation, expiry or role failure.
          if (!(error instanceof HttpError) || error.code !== 'COPY_LEASE_REQUIRED' || !this.authorCopies) throw error;
          return this.authorCopies.resolveAllocation(hash, cap);
        }
      } });
    // Reuses permanent content reservation slots; historical 'copy' namespace name is not a copy capability.
    this.management = new GameManagement({ storage: ctx.storage, principal: hash => this.principal(hash), operationGuard: (actor, key) => this.contentKey(actor, key, 'copy') });
    // §4.1 game-list deletion: fence-only backend (no physical-delete API).
    this.deletionFence = new GameDeletionFence({ storage: ctx.storage, principal: hash => this.principal(hash), operationGuard: (actor, key) => this.contentKey(actor, key, 'delete'), requestKey: env.EDITOR_REQUEST_KEY });
    this.gamePurge = new GamePurge({ storage: ctx.storage, principal: hash => this.principal(hash), distribution: () => this.frozenDistribution });
    // Published-game registry (node publish.json counterpart); pure SQLite, no blob dependency.
    this.publishedGames = new PublishedGames({ storage: ctx.storage, principal: hash => this.principal(hash) });
    // Formal release ordinals (Q18/Q24) + history (Q23), no rollback (Q42).
    this.releases = new ReleaseLedger({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games });
    // D组公告 (Q31–Q36, §8.3): unique(gameId,releaseId) rows + registry revision.
    this.announcements = new AnnouncementStore({ storage: ctx.storage });
    // 上架前整遊戲檢驗的服務端記錄（產品決定 2026-11）：清單與上架門都讀這裡。
    this.validations = new ValidationStore({ storage: ctx.storage });
    this.publishProgress = new PublishProgress();
    this.validationJobs = new Map();
    // 分发账本 Outbox（V5 前置）：发布事务内 enqueue，同原子。
    this.distribution = new DistributionOutbox({ storage: ctx.storage });
    // Same authority database; no public producer/drainer or receipt trust added.
    // Only an explicitly assembled publisher can authenticate remote receipts.
    this.frozenDistribution = new FrozenDistributionLedger({ storage: ctx.storage, verifyReceipt: () => fail(503, 'DISTRIBUTION_NOT_CONFIGURED') });
    this.publicationProducer = frozenPublication ? new FrozenPublicationProducer({ storage: ctx.storage }) : null;
    // A 路線第一版（可回滾）：null＝不在 HTTP 內推進，回應與舊協議逐位元相同。
    // tail 把同一個應用實例內的推進串行化，避免兩筆請求同時 drainOne。
    this.distributionDrain = distributionDrain ?? null;
    this.distributionDrainTail = Promise.resolve();
    // Reuse permanent content reservations; historical 'copy' denotes the table family.
    this.publishOperations = new PublishOperations({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, operationGuard: (actor, key) => this.contentKey(actor, key, 'copy') });
    // 共用画像庫（B 決策）：manifest 唯讀，無 SQL 表、無上傳管線。
    this.portraits = new GamePortraits({ reservedIds: RESERVED_ASSET_IDS });
    // B-1/Q14 draft topology intents (moves + rebuild records live outside
    // the canonical game object; any pending move blocks save/publish).
    this.topology = new DraftTopology({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games });
    // T1–T8 简化副本：copy 单套可变草稿（无修订号），单写者覆盖写。
    this.gameCopies = new GameCopyStore({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games });
    // T6 试运行已取消：不再实例化 TrialSessions，所有 /api/trial/* 一律 410。
    this.trialSessions = null;
    this.blobs = null; this.installedSources = null; this.adminCopies = null; this.authorCopies = null; this.privateDrafts = null; this.stageApi = null; this.availableLibrary = null; this.libraryBrowser = null; this.libraryAssets = null;
    if (env.EDITOR_BLOBS) {
      const maxBytes = env.EDITOR_BLOB_MAX_BYTES === undefined ? 16 * 1024 * 1024 : Number(env.EDITOR_BLOB_MAX_BYTES);
      // Optional per-owner game cap; unset keeps the historical unlimited behaviour.
      // AdminFullCopy rejects a malformed value (COPY_QUOTA_POLICY) instead of
      // silently treating it as unlimited.
      const gameLimit = env.EDITOR_GAME_LIMIT === undefined ? 0 : Number(env.EDITOR_GAME_LIMIT);
      this.privateWrites = new PrivateWriteJournal({ storage: ctx.storage, bucket: env.EDITOR_BLOBS });
      this.blobs = new ImmutableBlobStore({ bucket: this.privateWrites, authority: (hash, context) => this.games.blobAuthority(hash, context), storage:ctx.storage, maxBytes });
      const policy = installedSourcePolicy(new TextEncoder().encode(worldManifest), new TextEncoder().encode(entityManifest));
      this.installedSources = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy, operationGuard: (actor, key) => this.contentKey(actor.id, key, 'source') });
      runtimeAssets = new OwnedRuntimeAssets({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), games: this.games, policy, kind: 'visuals' });
      const libraryPolicy = installedAvailableLibraryPolicy(new TextEncoder().encode(availableLibraryManifest));
      this.availableLibrary = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy: libraryPolicy, operationGuard: (actor, key) => this.contentKey(actor.id, key, 'source') });
      // 工作台級「系統資源」是唯讀瀏覽，合約上不限定管理員（沿用「新建遊戲」對
      // admin／author 都開放的口徑）。單獨的唯讀目錄實例讓作者也能讀角色位元組，
      // 而不放寬 availableLibrary 的安裝／登記權限（install 另有 admin 守衛）。
      this.libraryBrowser = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy: libraryPolicy, readRole: ['admin', 'author'] });
      this.#bootstrapLibrary(env);
      copies = this.adminCopies = new AdminFullCopy({ storage: ctx.storage, principal: hash => this.principal(hash), catalog: this.installedSources, games: this.games, blobs: this.blobs, leaseMs: 300000, gameLimit });
      const authorSource = new InstalledSourceCatalog({ storage: ctx.storage, bucket: env.EDITOR_BLOBS, principal: hash => this.principal(hash), policy, readRole: ['admin', 'author'] });
      this.loadBuiltinGeneralSource = async (tokenHash, gameId) => {
        const actor = this.principal(tokenHash);
        const source = await authorSource.loadFull(tokenHash, authorSource.definition().registryId);
        authorSource.assertCapture(tokenHash, source);
        const { game } = await createPinnedCopyLoader({ readWeb: source.readWeb })({ gameId, ownerId: actor.id });
        authorSource.assertCapture(tokenHash, source);
        return game;
      };
      // Web 產品決定 2026-11（工作台結構合同 §2／批次 B6，取代 2026-10-31 的
      // 「新建遊戲產出完整 20 章副本」）：工作台級「新建遊戲」只複製底層地圖
      // （含據點），章節與武將庫為空（FIXED_TEMPLATE_PROFILE）；管理員「複製遊戲」
      // 才整套複製（地圖＋章節＋武將），走既有 /api/admin/copies 完整副本管線。
      // 兩種 profile 的歷史行仍各自按其 profile 讀取。
      this.authorCopies = new AdminFullCopy({ storage: ctx.storage, principal: hash => this.principal(hash), catalog: authorSource, games: this.games, blobs: this.blobs, leaseMs: 300000, roles: ['admin', 'author'], profileRevision: FIXED_TEMPLATE_PROFILE, gameLimit });
      this.commandTargets = new HttpCommandTargets(ctx.storage, env.EDITOR_REQUEST_KEY);
      ctx.storage.transactionSync(() => this.sql.exec('CREATE TABLE IF NOT EXISTS copy_http_commands (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))'));
      this.privateDrafts = new PrivateDrafts({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, blobs: this.blobs, definition: () => this.installedSources.definition(), operationGuard: (actor, key) => this.contentKey(actor, key, 'draft'),
        atlas: async (tokenHash, registryId, season) => {
          const catalog = this.principal(tokenHash).role === 'admin' ? this.installedSources : authorSource;
          const source = await catalog.loadFull(tokenHash, registryId);
          const path = `content/builtin/compiled/${policy.revision}/map_atlas_${season}.png`;
          const role = policy.roles.find(row => row.path === path);
          if (!role) fail(503, 'DRAFT_ATLAS_NOT_CONFIGURED');
          return { registryId: source.registryId, definitionDigest: source.definitionDigest, rootDigest: source.rootDigest, sha256: role.sha256, bytes: source.readWeb(path) };
        } });
      // T6 试运行已取消：保留 privateDrafts 供迁移脚本只读 head→copy，不再建 TrialSessions。
      this.libraryAssets = new PrivateLibraryAssets({ storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, drafts: this.privateDrafts, catalog: this.availableLibrary, policy: libraryPolicy });
      const ports = { storage: ctx.storage, principal: hash => this.principal(hash), games: this.games, blobs: this.blobs, operationGuard: (actor, key) => this.contentKey(actor, key, 'compile') };
      const imagePlanner = new FixedCopyImages({ ...ports, drafts: this.privateDrafts, catalog: this.installedSources, policy });
      const fallbacks = Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => [`fallback-${season}`, new FixedCopyFallbackJobs({ ...ports, images: imagePlanner, season })]));
      this.stageApi = new StageJobsAPI({ ...ports, requestKey: env.EDITOR_REQUEST_KEY, services: { data: new FixedCopyDataCompiler({ ...ports, drafts: this.privateDrafts }), images: new FixedCopyImageJobs({ ...ports, images: imagePlanner }), ...fallbacks }, operationGuard: (actor, key) => this.contentKey(actor, key, 'stage-command') });
    }
    // Frozen public play snapshots. Blobless development has no owned runtime
    // reader, so preparing a publication remains closed rather than bypassed.
    this.playPacks = new PublishedPacks({ storage: ctx.storage, principal: hash => this.principal(hash), runtimeAssets, portraits: this.portraits });
  }
  one(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  // Read-only public registry role bytes for the trial web route: pinned index roles, chunked R2 reads, sha re-verified.
  async #fetchRegistryChunks(registryId, role) {
    const pieces = [];
    for (const chunk of role.chunks) {
      if (!/^[a-f0-9]{64}$/.test(chunk.sha256 ?? '') || !Number.isSafeInteger(chunk.byteLength)) { fail(503, 'TRIAL_WEB_REGISTRY'); }
      const object = await this.env.EDITOR_BLOBS.get(`installed/${registryId}/${chunk.sha256}`);
      if (!object || object.size !== chunk.byteLength) { fail(503, 'TRIAL_WEB_REGISTRY'); }
      pieces.push(new Uint8Array(await object.arrayBuffer()));
    }
    return pieces;
  }
  async trialRegistryBytes(catalog, path) {
    const registryId = catalog.definition().registryId;
    const row = this.one('SELECT * FROM installed_sources WHERE registry_id=?', registryId);
    if (!row) { fail(404, 'TRIAL_WEB_PATH'); }
    const root = await this.env.EDITOR_BLOBS.get(`installed/${registryId}/${row.root_digest}`);
    if (!root || root.size !== row.root_byte_length) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    const rootBytes = new Uint8Array(await root.arrayBuffer());
    if (createHash('sha256').update(rootBytes).digest('hex') !== row.root_digest) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    let index; try { index = decodeSourceChunks([rootBytes]); } catch { fail(503, 'TRIAL_WEB_REGISTRY'); }
    const role = index?.roles?.find(item => item.path === path);
    if (!role || !/^[a-f0-9]{64}$/.test(role.sha256 ?? '') || !Number.isSafeInteger(role.byteLength) || !Array.isArray(role.chunks) || role.chunks.length < 1) { fail(404, 'TRIAL_WEB_PATH'); }
    const pieces = await this.#fetchRegistryChunks(registryId, role);
    const bytes = Buffer.concat(pieces);
    if (bytes.length !== role.byteLength || createHash('sha256').update(bytes).digest('hex') !== role.sha256) { fail(503, 'TRIAL_WEB_REGISTRY'); }
    return bytes;
  }
  seed(policy) {
    if (this.one("SELECT id FROM users WHERE account='tianyi'")) { return; }
    const id = crypto.randomUUID(), encoded = passwordHash(policy.defaultPassword);
    this.ctx.storage.transactionSync(() => { if (!this.one("SELECT id FROM users WHERE account='tianyi'")) { this.sql.exec("INSERT INTO users VALUES(?,?,'admin',?,0,1,1,1,'','','','')", id, 'tianyi', encoded);  }});
  }
  rate(accountName, source, policy) {
    const now = Date.now(); let denied = false;
    this.ctx.storage.transactionSync(() => {
      for (const [bucket, limit] of [[`account:${accountName}`, policy.accountLimit], [`source:${source}`, policy.sourceLimit]]) {
        const row = this.one('SELECT * FROM login_rates WHERE bucket=?', bucket);
        const start = row && now - row.start_at < policy.rateMs ? row.start_at : now;
        const attempts = row && start === row.start_at ? row.attempts : 0;
        if (attempts >= limit) { denied = true; }
        this.sql.exec('INSERT OR REPLACE INTO login_rates VALUES(?,?,?)', bucket, start, Math.min(attempts + 1, limit));
      }
    });
    if (denied) { fail(429, 'LOGIN_RATE_LIMIT'); }
  }
  principal(tokenHash) {
    const row = this.one('SELECT s.*,u.account,u.role,u.disabled,u.must_change,u.version,u.epoch AS user_epoch,u.password_hash,u.display_name,u.email,u.phone,u.note FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=?', tokenHash);
    const now = Date.now();
    if (!row || row.disabled || row.epoch !== row.user_epoch || now >= row.absolute_until || now >= row.idle_until) { fail(401, 'SESSION_INVALID'); }
    return { ...row, id: row.user_id, epoch: row.user_epoch };
  }
  touch(tokenHash, policy) { this.sql.exec('UPDATE sessions SET idle_until=MIN(absolute_until,?) WHERE token_hash=?', Date.now() + policy.idleMs, tokenHash); }
  async sessionData(user, policy) {
    const token = randomToken(), hash = await sha(token), now = Date.now();
    return { token, hash, absolute: now + policy.sessionMs, idle: Math.min(now + policy.idleMs, now + policy.sessionMs), csrf: await mac(`csrf:${token}`, policy.secret), user };
  }
  insertSession(s, user) { this.sql.exec('INSERT INTO sessions VALUES(?,?,?,?,?)', s.hash, user.id, user.epoch, s.absolute, s.idle); }
  async fetch(request) {
    try { return await this.handle(request); }
    catch (error) { return errorResponse(error); }
  }
  #gateEntry(request, policy, url, method, path) {
    // Dual-domain: the bound play origin is welcome wherever the editor
    // origin is (route-level split happens in handle, not here).
    const welcome = value => value === policy.origin || (policy.playOrigin !== null && value === policy.playOrigin);
    if (!welcome(url.origin)) { fail(403, 'ORIGIN_REJECTED'); }
    if (method === 'GET' && path === '/api/health') { return response({ service: 'dragon-editor', stage: 'accounts-sessions', initialized: Boolean(this.one("SELECT id FROM users WHERE account='tianyi'")) }); }
    if (method !== 'GET' && (method !== 'POST' || !welcome(request.headers.get('Origin')))) { fail(403, 'ORIGIN_REJECTED'); }
    const suppliedOrigin = request.headers.get('Origin'); if (suppliedOrigin && !welcome(suppliedOrigin)) { fail(403, 'ORIGIN_REJECTED'); }
    return null;
  }
  // Anonymous play surface (task 4 extends with play sessions/pack). Trial
  // and editor routes never match here, so they 404 on the play domain.
  #isPlayRoute(method, path) { return isLegacyPlayRoute(method, path); }
  #getPlayAnonymous(url, path) {
    if (path === '/api/published-games') {
      // Node parity: query ignored; builtin head first, registry pins after.
      return response({ games: [{ gameId: 'wolong-builtin', name: '卧龙传·制霸天下', builtin: true }, ...this.publishedGames.list()] });
    }
    if (path === '/api/announcements') {
      for (const key of url.searchParams.keys()) { if (key !== 'cursor') { fail(422, 'ANNOUNCE_QUERY'); } }
      const cursor = url.searchParams.get('cursor');
      return response(this.announcements.list(cursor === null ? {} : { cursor }));
    }
    if (path === '/api/trial-pack') { return response(this.#getPlayPack(url)); }
    if (path === '/api/trial-asset') { return this.#getPlayAsset(url); }
    if (path.startsWith('/content/builtin/compiled/')) { return this.#getPlayRegistryFile(url, path); }
    return this.#getPlayWebFile(url, path);
  }
  #getPlayPack(url) {
    // Node parity: revision defaults to the pin, chapter to the first;
    // unknown extras ignored, known keys validated.
    const game = url.searchParams.get('game'), revision = url.searchParams.get('revision'), chapter = url.searchParams.get('chapter');
    if (typeof game !== 'string' || !game) { fail(422, 'PLAY_PACK_GAME'); }
    if (url.searchParams.has('revision') && typeof revision !== 'string') { fail(422, 'PLAY_PACK_REVISION'); }
    if (url.searchParams.has('chapter') && typeof chapter !== 'string') { fail(422, 'PLAY_PACK_CHAPTER'); }
    return this.playPacks.pack(game, revision, chapter);
  }
  #getPlayAsset(url) {
    const game = url.searchParams.get('game'), revision = url.searchParams.get('revision'), sourceDigest = url.searchParams.get('digest'), assetId = url.searchParams.get('asset');
    if (typeof game !== 'string' || !game) { fail(422, 'PLAY_ASSET_GAME'); }
    const served = this.playPacks.asset(game, revision, sourceDigest, assetId);
    return new Response(served.bytes, { headers: { ...headers, 'Content-Type': served.mime, 'X-Content-SHA256': served.sha256 } });
  }
  async #getPlayRegistryFile(url, path) {
    // Anonymous season-visual art for play manifests: exact installed-policy
    // role paths only, bytes re-verified (same registry, no game data).
    if (!this.installedSources) { fail(503, 'PLAY_NOT_CONFIGURED'); }
    if (url.search) { fail(422, 'PLAY_QUERY'); }
    const rel = path.slice(1);
    const policy = this.playPacks.policy;
    const role = policy.roles.find(item => item.path === rel);
    if (!role || !/^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/(map_atlas|map_tiles)_(spring|summer|autumn|winter)\.png$/.test(rel)) { fail(404, 'PLAY_REGISTRY_PATH'); }
    const bytes = await this.trialRegistryBytes(this.installedSources, rel);
    return new Response(bytes, { headers: { ...trialHeaders, 'Content-Type': trialWebType(rel), 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') } });
  }
  async #getPlayWebFile(url, path) {
    // Anonymous read-only engine bundle and pinned shared library. Per-game
    // published assets use the frozen pack routes; draft assets remain private.
    if (url.search && !([...url.searchParams.keys()].join(',') === 'v' && url.searchParams.get('v') === 'original-sprites-1')) { fail(422, 'PLAY_QUERY'); }
    const rel = path.slice('/api/play/web/'.length);
    if (!/^[A-Za-z0-9_][A-Za-z0-9_/.-]{0,255}$/.test(rel) || rel.includes('..') || rel.includes('\\') || rel.endsWith('/')) { fail(404, 'PLAY_WEB_PATH'); }
    const bundled = trialWebFiles.get(rel);
    if (bundled) { return new Response(bundled.text, { headers: { ...trialHeaders, 'Content-Type': `${trialWebType(rel)}; charset=utf-8`, 'X-Content-SHA256': bundled.sha256 } }); }
    // The generated document base also prefixes registry-relative seasonal art.
    // Reuse the existing exact eight-role public visual gate, not arbitrary source roles.
    if (rel.startsWith('content/builtin/compiled/')) { return this.#getPlayRegistryFile(url, `/${rel}`); }
    if (!playLibraryPaths.has(rel)) { fail(404, 'PLAY_WEB_PATH'); }
    if (!this.availableLibrary) { fail(503, 'PLAY_NOT_CONFIGURED'); }
    const bytes = await this.trialRegistryBytes(this.availableLibrary, rel);
    return new Response(bytes, { headers: { ...trialHeaders, 'Content-Type': trialWebType(rel), 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') } });
  }
  async #postPublishRoutes(rt) {
    const { request, tokenHash, user, policy, url, path, value } = rt;
    if (path !== '/api/publish' && path !== '/api/unpublish') { return null; }
    if (url.search) { fail(422, 'PUBLISH_QUERY'); }
    if (path === '/api/unpublish') { fields(value, ['gameId']); } else { fields(value, ['gameId', 'name']); }
    // A pin upsert is not idempotent release allocation. Publish stores a permanent
    // request/result pair in the SAME transaction as the formal release.
    const key = request.headers.get('Idempotency-Key');
    this.contentKey(user.id, key, path === '/api/unpublish' ? 'publish' : 'copy');
    let result;
    if (path === '/api/unpublish') {
      // The legacy destructive command has no frozen-publication contract.
      if (this.publicationProducer || this.frozenDistribution.status().tailGeneration > 0) { fail(503, 'DISTRIBUTION_UNSUPPORTED'); }
      result = this.publishedGames.unpublish(tokenHash, value.gameId);
      this.playPacks.retire(value.gameId);
    } else {
      const committed = await this.#publishPin(tokenHash, value.gameId, value.name, key, user).catch(error => {
        this.publishProgress.fail(user.id, key, typeof error?.code === 'string' ? error.code : 'PUBLISH_FAILED');
        throw error;
      });
      result = committed.pin;
      // A 路線第一版（可回滾）：只有注入 drain 時才在本次請求內推進分發並多帶
      // 一個可選分發描述子；未注入＝舊協議回應逐位元相同。
      if (this.distributionDrain) {
        // 重放只觀測、不再推進（不多寫一次遠端），但要等同一實例已排隊的推進落地：
        // 否則同一個請求的兩個並发呼叫會拿到 pending／confirmed 兩種答案。
        if (committed.replayed) { await this.distributionDrainTail; } else { await this.#advanceDistribution(); }
        const distribution = this.#distributionDescriptor(committed.gameId, committed.releaseId);
        if (distribution) { result = { ...result, distribution }; }
      }
    }
    this.touch(tokenHash, policy);
    return response(result);
  }
  async #publishPin(tokenHash, gameId, name, key, actor) {
    // 对标 node publish：owner 当前修订＋快照存在＋严格校验＋即时编译，
    // 任一不满足即拒（未编译/坏草稿 422；空名先于权属判 422，
    // 与 node 先验名后查 draft 的可观察顺序一致）。
    if (!this.privateDrafts) { fail(503, 'PUBLISH_NOT_CONFIGURED'); }
    if (typeof name !== 'string' || !name.trim()) { fail(422, 'PUBLISH_NAME'); }
    const operation = this.publishOperations.capture(tokenHash, { key, gameId, name });
    if (operation.replay) { return { pin: operation.replay.pin, gameId: operation.replay.gameId, releaseId: operation.replay.releaseId, replayed: true }; }
    // ①–⑥ 逐段記在服務端：只記真正執行到的階段，客戶端輪詢顯示，不推測進度。
    this.publishProgress.start({ actorId: actor.id, opKey: key, gameId });
    this.publicationProducer?.assertPublishable(gameId);
    const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
    if (!owned) { fail(404, 'GAME_NOT_FOUND'); }
    if (hasPendingMoves(this.ctx.storage, gameId)) { fail(422, 'DRAFT_TOPOLOGY_BROKEN'); }
    const reference = this.games.snapshotReference(tokenHash, gameId, owned.draftRevision);
    // 回執遺失後重送（不同鍵、同一份內容、仍未經審核決定）不該多佔一個序號：
    // 把那一版原本的永久回執綁定到這把新鍵，不重跑約 4 s 驗證與約 190 s 編譯。內容身分
    // 由 draftRevision＋sourceDigest 唯一確定（與下方 reference 比對同源），改名則不復用，
    // 而「同意」仍是管理員的門，所以復用不等於自行上架。
    const identical = this.releases.pendingIdentical(tokenHash, gameId, owned.draftRevision, reference.sourceDigest);
    const sameReceipt = identical && this.publishOperations.bindIdentical(tokenHash, operation.ticket, identical.releaseId);
    if (sameReceipt) { return { pin: sameReceipt.pin, gameId: sameReceipt.gameId, releaseId: sameReceipt.releaseId, replayed: true }; }
    const captured = await this.privateDrafts.captureForCompile(tokenHash, gameId, owned.draftRevision);
    if (captured.reference.rootKey !== reference.rootKey || captured.reference.sourceDigest !== reference.sourceDigest) { fail(503, 'PUBLISH_REFERENCE_CORRUPT'); }
    this.publishProgress.advance(actor.id, key, 1);
    // B8 全章匯總校驗：先列出「哪些章因基礎資料缺失而引用不到」，再跑結構／active 門。
    // 順序必須先清單後通用錯誤，否則單一的 192 據點鎖訊息會蓋掉逐章原因。
    const references = chapterReferenceReport(captured.game);
    if (references.length) { fail(422, 'PUBLISH_CHAPTER_REFERENCES', { chapters: references }); }
    this.publishProgress.advance(actor.id, key, 2);
    // 產品決定（2026-11）：檢驗結果存服務端並綁定草稿修訂；上架只認這份記錄，
    // 客戶端不得自行宣告已檢驗。記錄過期（修訂或摘要不符）與未檢驗同樣拒絕。
    const validation = this.validations.readFresh(gameId, owned.draftRevision);
    if (!validation || validation.state !== 'passed' || validation.sourceDigest !== captured.reference.sourceDigest) { fail(409, 'PUBLISH_VALIDATION_REQUIRED'); }
    this.publishProgress.advance(actor.id, key, 3);
    try { validateGameSource(captured.game); }
    catch { fail(422, 'PUBLISH_NOT_COMPILED'); }
    let compiled;
    try { compiled = compileTrialSource(captured.game, bytes => createHash('sha256').update(bytes).digest('hex')); }
    catch { fail(422, 'PUBLISH_NOT_COMPILED'); }
    if (compiled?.sourceDigest !== reference.sourceDigest) { fail(503, 'PUBLISH_REFERENCE_CORRUPT'); }
    if (!Array.isArray(captured.game.chapterOrder) || !captured.game.chapterOrder.length) { fail(422, 'PUBLISH_NOT_COMPILED'); }
    this.publishProgress.advance(actor.id, key, 4);
    // Prepare without SQL writes, then commit pack + ordinal + pin atomically.
    // Replacing a game-keyed pack before this transaction would destroy the
    // previous live release if a later authority/issue/outbox step failed.
    const candidate = this.releases.prepare(tokenHash, gameId, reference.draftRevision, reference.sourceDigest);
    const prepared = await this.playPacks.prepare(tokenHash, { game: captured.game, reference, compiled });
    const replayReady = new Error('concurrent publication already committed');
    const assertSourceCurrent = () => {
      if (hasPendingMoves(this.ctx.storage, gameId)) { fail(422, 'DRAFT_TOPOLOGY_BROKEN'); }
      const current = this.games.snapshotReference(tokenHash, gameId, reference.draftRevision);
      if (current.rootKey !== reference.rootKey || current.sourceDigest !== reference.sourceDigest) { fail(409, 'PUBLISH_STALE'); }
    };
    const assertCurrent = () => this.ctx.storage.transactionSync(() => {
      if (this.publishOperations.inspect(tokenHash, operation.ticket)) { throw replayReady; }
      assertSourceCurrent();
    });
    let staged;
    if (stageRuntime) {
      try { staged = await stageRuntime(candidate.identity, this.playPacks.snapshotPrepared(tokenHash, prepared), assertCurrent); }
      catch (error) {
        // A sibling may commit while this attempt is awaiting I/O, even when
        // that I/O fails. Reauthenticate before returning the exact old result.
        const replay = this.publishOperations.inspect(tokenHash, operation.ticket);
        if (replay) { return { pin: replay.pin, gameId: replay.gameId, releaseId: replay.releaseId, replayed: true }; }
        throw error;
      }
    }
    const result = this.publishOperations.commit(tokenHash, operation.ticket, () => {
      if (stageRuntime) {
        // commit has reauthenticated and inserted its reservation in this SAME
        // transaction. Do not inspect that deliberately not-yet-complete pair.
        assertSourceCurrent();
        const proof = verifyStaged(staged?.ticket, candidate.identity);
        if (!proof || proof.then || proof !== staged?.runtime) { fail(503, 'PUBLISH_STAGE_PROOF'); }
      }
      const fresh = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
      if (!fresh) { fail(404, 'GAME_NOT_FOUND'); }
      if (fresh.draftRevision !== owned.draftRevision) { fail(409, 'PUBLISH_STALE'); }
      const ref2 = this.games.snapshotReference(tokenHash, gameId, owned.draftRevision);
      if (ref2.rootKey !== reference.rootKey || ref2.sourceDigest !== reference.sourceDigest) { fail(409, 'PUBLISH_STALE'); }
      this.playPacks.installPreparedInTxn(tokenHash, prepared);
      const issued = this.releases.issuePreparedInTxn(tokenHash, candidate.ticket);
      const pin = this.publishedGames.publishInTxn(tokenHash, { gameId, name, revision: ref2.draftRevision, sourceDigest: ref2.sourceDigest, chapters: captured.game.chapterOrder, ordinal: issued.ordinal });
      this.games.setFormalMetadataInTxn(tokenHash, { gameId, draftRevision: ref2.draftRevision, name: pin.name });
      this.releases.pruneExceptInTxn(tokenHash, gameId, issued.releaseId);
      if (this.#recordPublication('publish', gameId, staged?.runtime)) {
        // The exact projection/catalog joins the permanent operation receipt.
        // No local timestamp is substituted for actual public visibility.
        return { version: 1, gameId, releaseId: issued.releaseId, pin };
      }
      // Outbox：发号/pin/剪枝同事务入列，崩溃后 publisher 重放（幂等）。
      this.distribution.enqueueInTxn({ gameId, ordinal: issued.ordinal, releaseId: issued.releaseId });
      // Q31/Q32: current-only play retains every previously public announcement.
      // Hidden updates add none; current announcement joins this SAME transaction.
      const live = this.one('SELECT g.listed,u.account FROM content_games g JOIN users u ON u.id=g.owner_id WHERE g.game_id=?', gameId);
      if (live && Number(live.listed) === 1) {
        const nowIso = new Date().toISOString();
        if (this.announcements.announceInTxn({ gameId, releaseId: issued.releaseId, ordinal: issued.ordinal, name: pin.name, creatorAccount: live.account, publishedAt: issued.createdAt, firstOnlineAt: nowIso })) {
          this.announcements.bumpRegistryInTxn();
        }
      }
      return { version: 1, gameId, releaseId: issued.releaseId, pin };
    });
    // ⑤ 封包與版本序號、⑥ 帳本與排隊都在上面同一個事務內完成，完成後才標記。
    this.publishProgress.advance(actor.id, key, 5);
    this.publishProgress.advance(actor.id, key, 6);
    this.publishProgress.finish(actor.id, key);
    return { pin: result.pin, gameId: result.gameId, releaseId: result.releaseId, replayed: false };
  }
  // A 路線第一版（可回滾）：只呼叫同一個 publisher.drainOne，一步一代次，直到
  // IDLE／待確認或達到上限。任何失敗都只降級為「待確認」並留給仍在跑的排程器，
  // 絕不把已提交的本機操作判成失敗，也不改動帳本語意。
  async #advanceDistribution() {
    if (!this.distributionDrain) { return null; }
    const run = this.distributionDrainTail.then(async () => {
      const startedAt = Date.now(); const states = []; let code = null;
      for (let step = 0; step < DISTRIBUTION_SYNC_STEPS && Date.now() - startedAt < DISTRIBUTION_SYNC_BUDGET_MS; step += 1) {
        let outcome;
        try { outcome = await this.distributionDrain(); }
        catch (error) { code = typeof error?.code === 'string' ? error.code : 'DISTRIBUTION_SYNC_FAILED'; break; }
        const state = typeof outcome?.state === 'string' ? outcome.state : '';
        if (!DISTRIBUTION_SYNC_STATES.has(state)) { code = 'DISTRIBUTION_SYNC_UNKNOWN'; break; }
        states.push(state);
        // IDLE＝沒有待推進的代次；COMMITTED_SYNC_PENDING＝已提交但尚未可見，
        // 兩者都不必立刻再試。只有 VISIBLE_CONFIRMED 才表示可能還有下一件。
        if (state !== 'VISIBLE_CONFIRMED') { break; }
      }
      let status;
      try { status = this.frozenDistribution.status(); }
      catch { return Object.freeze({ state: 'pending', code: code ?? 'DISTRIBUTION_STATUS_UNAVAILABLE', states: Object.freeze(states) }); }
      const drained = status.tailGeneration > 0 && status.confirmedGeneration === status.tailGeneration;
      return Object.freeze({ state: drained ? 'confirmed' : 'pending', code, states: Object.freeze(states), ms: Date.now() - startedAt });
    });
    // 串行化只影響排隊，不把一次失敗帶給下一次請求。
    this.distributionDrainTail = run.then(() => undefined, () => undefined);
    return run;
  }
  // 觀測單一操作的分發狀態；帳本沒有這筆（例如後續代次已剪枝）時回 null，
  // 讓回應退回舊協議，而不是把上架偽裝成失敗。
  #distributionDescriptor(gameId, releaseId) {
    try { return this.frozenDistribution.operationStatus(gameId, releaseId); }
    catch { return null; }
  }
  #recordPublication(kind, gameId, runtime) {
    if (this.publicationProducer) { return this.publicationProducer.recordInTxn(kind, gameId, runtime); }
    // A legacy adapter cannot silently omit events after frozen mode has begun.
    if (this.frozenDistribution.status().tailGeneration > 0) { fail(503, 'DISTRIBUTION_MODE_REQUIRED'); }
    return null;
  }
  #assertPasswordCurrent(user, path) {
    if (user.must_change && path !== '/api/auth/password' && path !== '/api/auth/logout') { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
  }
  async #postLogin(request, policy) {
    const value = await body(request); fields(value, ['account', 'password']); const name = account(value.account);
    const source = await mac(`source:${request.headers.get('X-Editor-Source')}`, policy.secret); this.rate(name, source, policy);
    const user = this.one('SELECT * FROM users WHERE account=?', name);
    // Equal-cost verification on unknown accounts; disabled state does not skip the KDF.
    const encoded = user?.password_hash ?? this.one("SELECT password_hash FROM users WHERE account='tianyi'").password_hash;
    const matches = passwordMatches(value.password, encoded);
    if (!user || !matches || user.disabled) { fail(401, 'INVALID_LOGIN'); }
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy);
    const old = await this.replay(op, policy); if (old) { this.principal(await sha(old.token)); return response(old.body, 200, old.token); }
    const s = await this.sessionData(user, policy), result = { body: { user: dto(user), csrf: s.csrf }, token: s.token };
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => {
      if (!this.canCommit(op)) { return false; }
      const current = this.one('SELECT * FROM users WHERE id=?', user.id); if (current.epoch !== user.epoch || current.disabled) { fail(401, 'SESSION_INVALID'); }
      // Single-seat with last-login-wins (user decision 2026-10-31): purge
      // expired rows, then evict every live session so the newest login always
      // succeeds. Only one session stays valid at any moment, and closing a
      // browser without logging out can never lock the account out.
      if (this.singleUser) {
        const stamp = Date.now();
        this.sql.exec('DELETE FROM sessions WHERE absolute_until<=? OR idle_until<=?', stamp, stamp);
        this.sql.exec('DELETE FROM sessions WHERE user_id<>?', current.id);
      }
      this.insertSession(s, current); this.remember(op, sealed, policy); return true;
    });
    const chosen = committed ? result : await this.replay(op, policy); this.principal(await sha(chosen.token)); return response(chosen.body, 200, chosen.token);
  }
  async #getTrialRoutes(rt) {
    const { method, path } = rt;
    // T6 试运行已取消：所有 trial 入口一律 410，不再提供页面/资源/会话。
    if (method === 'GET' && (path === '/api/trial/wait' || path === '/api/trial/web/' || path.startsWith('/api/trial/web/'))) fail(410, 'TRIAL_RETIRED');
    return null;
  }
  async #getAdminAccounts(rt) {
    const { tokenHash, policy, user } = rt;
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    this.touch(tokenHash, policy); return response({ accounts: this.sql.exec('SELECT * FROM users ORDER BY account').toArray().map(dto) });
  }
  async #getManagementCopy(rt) {
    const { method, url, tokenHash, user, policy, managementQuery, copyPath, authorCopyPath } = rt;
    // 上架申請的逐步進度：只讀本次 op key 的服務端記錄；沒有記錄不代表失敗。
    const publicationProgress = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/publish-operations\/([A-Za-z0-9_-]{16,128})\/progress$/.exec(url.pathname);
    if (method === 'GET' && publicationProgress) {
      if (url.search) { fail(422, 'PUBLISH_QUERY'); }
      const [, gameId, key] = publicationProgress;
      if (!this.games.listOwn(tokenHash).some(entry => entry.gameId === gameId)) { fail(404, 'GAME_NOT_FOUND'); }
      this.touch(tokenHash, policy);
      return response({ version: 1, gameId, key, total: PUBLISH_STEPS.length, steps: PUBLISH_STEPS, progress: this.publishProgress.read(user.id, gameId, key) });
    }
    const publicationQuery = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/publish-operations\/([A-Za-z0-9_-]{16,128})$/.exec(url.pathname);
    if (method === 'GET' && publicationQuery) {
      if (url.search) { fail(422, 'PUBLISH_QUERY'); }
      const result = this.ctx.storage.transactionSync(() => {
        const receipt = this.publishOperations.query(tokenHash, { gameId: publicationQuery[1], key: publicationQuery[2] });
        if (!this.publicationProducer) { fail(503, 'DISTRIBUTION_NOT_CONFIGURED'); }
        let distribution;
        try { distribution = this.frozenDistribution.operationStatus(receipt.gameId, receipt.releaseId); }
        catch (error) {
          if (error?.code === 'DISTRIBUTION_UNKNOWN') { fail(503, 'DISTRIBUTION_STATUS_UNAVAILABLE'); }
          throw error;
        }
        if (distribution.kind !== 'publish') { fail(503, 'DISTRIBUTION_STATUS_CORRUPT'); }
        return { ...receipt, distribution };
      });
      this.touch(tokenHash, policy); return response(result);
    }
    const managementDistribution = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/management-operations\/([A-Za-z0-9_-]{16,128})\/distribution$/.exec(url.pathname);
    if (method === 'GET' && managementDistribution) {
      if (url.search) { fail(422, 'MANAGEMENT_QUERY'); }
      const result = this.ctx.storage.transactionSync(() => {
        const [, gameId, key] = managementDistribution;
        this.management.query(tokenHash, gameId, key);
        if (!this.publicationProducer) { fail(503, 'DISTRIBUTION_NOT_CONFIGURED'); }
        const receipt = this.management.queryDistribution(tokenHash, gameId, key);
        const distribution = receipt.distribution === null ? null : this.frozenDistribution.operationStatus(gameId, receipt.distribution.operationId);
        if (distribution && distribution.generation !== receipt.distribution.generation) { fail(503, 'DISTRIBUTION_STATUS_CORRUPT'); }
        return { version: 1, gameId, result: receipt.result, distribution };
      });
      this.touch(tokenHash, policy); return response(result);
    }
    if (method === 'GET' && managementQuery) { if (url.search) { fail(422, 'MANAGEMENT_QUERY'); } const result = this.management.query(tokenHash, managementQuery[1], managementQuery[2]); this.touch(tokenHash, policy); return response(result); }
    if (method === 'GET' && copyPath && !copyPath[2]) { this.copyAccess(tokenHash); const result = this.adminCopies.query(tokenHash, copyPath[1]); this.touch(tokenHash, policy); return response(result); }
    if (method === 'GET' && authorCopyPath && !authorCopyPath[2]) { this.authorCopyAccess(tokenHash); const result = this.authorCopies.query(tokenHash, authorCopyPath[1]); this.touch(tokenHash, policy); return response(result); }
    return null;
  }
  // The supervisor already staged the pinned library through env. Registering it
  // is operator configuration, not an author action (Web product decision
  // 2026-10-31), so it runs once per instance and self-heals a stale digest.
  #bootstrapLibrary(env) {
    if (this.libraryBootstrapped) return;
    if (!env.EDITOR_AVAILABLE_LIBRARY_ROOT) { this.libraryBootstrapped = true; return; }
    let staged; try { staged = JSON.parse(env.EDITOR_AVAILABLE_LIBRARY_ROOT); } catch { return; }
    const definition = this.availableLibrary.definition();
    const owner = this.one("SELECT id FROM users WHERE account='tianyi'");
    // No owner yet (fresh install): stay unset so the first request retries.
    if (!owner) return;
    const row = this.one('SELECT * FROM installed_sources WHERE registry_id=?', definition.registryId);
    if (!row) {
      this.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', definition.registryId, definition.definitionDigest, staged.root.sha256, staged.root.byteLength, '1', owner.id, new Date().toISOString());
    } else if (row.definition_digest !== definition.definitionDigest || row.root_digest !== staged.root.sha256 || row.root_byte_length !== staged.root.byteLength) {
      this.sql.exec('UPDATE installed_sources SET definition_digest=?,root_digest=?,root_byte_length=? WHERE registry_id=?', definition.definitionDigest, staged.root.sha256, staged.root.byteLength, definition.registryId);
    }
    this.libraryBootstrapped = true;
  }
  // Built-in read-only resource browser. Lists the pinned library roles with a
  // coarse category; no draft binding, no registration semantics.
  async #getResources(rt) {
    const { tokenHash, url, policy } = rt;
    if (url.search) { fail(422, 'RESOURCE_QUERY'); }
    const roles = this.libraryBrowser.resourceRoles();
    const category = path => {
      if (path.startsWith('kao/')) return 'portrait';
      if (path.startsWith('grf/') && path.endsWith('.png')) return 'image';
      if (path.endsWith('.flac') || path.endsWith('.wav') || path.endsWith('.mp3')) return 'audio';
      if (path.startsWith('font/')) return 'font';
      return 'data';
    };
    const resources = roles.map(role => Object.freeze({ path: role.path, byteLength: role.byteLength, sha256: role.sha256, category: category(role.path) }));
    // 使用者 m1107：「系統資源」的頭像要與共用畫像庫（`web/kao`，現為數字
    // `0..620.png`，含新增471張）合為同一份。已釘進 available-library 的 kao 條目保持原樣
    // （bytes 仍從圖書館讀），只補上尚未收錄的 ID；不重算任何 pin 摘要。
    const listed = new Set(resources.map(row => row.path));
    for (const portrait of this.portraits.list()) {
      const path = `kao/${portrait.assetId}.png`;
      if (!listed.has(path)) resources.push(Object.freeze({ path, byteLength: portrait.byteLength, sha256: portrait.sha256, category: 'portrait' }));
    }
    this.touch(tokenHash, policy);
    return response({ mode: 'BUILTIN_READONLY', registryId: this.libraryBrowser.definition().registryId, resources });
  }
  // 共用畫像（`kao/<id>.png`）直接從 shared portrait reader 取；未收錄進圖書館
  // 的 ID 只能走這條路，已收錄的走圖書館或這條都同字節，所以統一先試畫像。
  async #portraitBytes(assetId) {
    if (typeof readSharedPortrait !== 'function') return null;
    const descriptor = this.portraits.get(assetId);
    const bytes = await readSharedPortrait(descriptor);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) fail(503, 'PORTRAIT_BYTES_CORRUPT');
    return Object.freeze({ bytes, byteLength: descriptor.byteLength, sha256: descriptor.sha256 });
  }
  async #getResourceAsset(rt) {
    const { tokenHash, url, policy, request } = rt;
    if ([...url.searchParams.keys()].join(',') !== 'path') { fail(422, 'RESOURCE_QUERY'); }
    const path = url.searchParams.get('path');
    if (typeof path !== 'string' || !path) { fail(422, 'RESOURCE_QUERY'); }
    const portraitId = /^kao\/([A-Za-z0-9]{1,32})\.png$/.exec(path)?.[1];
    let role = null;
    if (portraitId !== undefined && typeof readSharedPortrait === 'function') {
      try { role = await this.#portraitBytes(portraitId); }
      catch (error) { if (!this.libraryBrowser.resourceRoles().some(row => row.path === path)) throw error; }
    }
    role ??= await this.libraryBrowser.readRole(tokenHash, path);
    if (!role) fail(404, 'RESOURCE_NOT_FOUND');
    let type = 'application/octet-stream';
    if (path.endsWith('.png')) type = 'image/png';
    else if (path.endsWith('.woff2')) type = 'font/woff2';
    else if (path.endsWith('.flac')) type = 'audio/flac';
    else if (path.endsWith('.wav')) type = 'audio/wav';
    else if (path.endsWith('.mp3')) type = 'audio/mpeg';
    else if (path.endsWith('.json')) type = 'application/json; charset=utf-8';
    const total = role.byteLength;
    const common = { 'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600', 'X-Content-SHA256': role.sha256,
      'X-Content-Type-Options': 'nosniff' };
    // Browsers stream media with byte ranges; without 206 support <audio> refuses
    // to play even though the bytes are fine.
    const range = request.headers.get('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match && (match[1] !== '' || match[2] !== '')) {
        let from = match[1] === '' ? null : Number(match[1]);
        let to = match[2] === '' ? null : Number(match[2]);
        if (from === null) { from = Math.max(0, total - to); to = total - 1; }
        else if (to === null || to >= total) { to = total - 1; }
        if (Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && from <= to && from < total) {
          const slice = role.bytes.subarray(from, to + 1);
          this.touch(tokenHash, policy);
          return new Response(slice, { status: 206, headers: { ...common,
            'Content-Range': `bytes ${from}-${to}/${total}`, 'Content-Length': String(slice.length) } });
        }
        this.touch(tokenHash, policy);
        return new Response(null, { status: 416, headers: { ...common, 'Content-Range': `bytes */${total}` } });
      }
    }
    this.touch(tokenHash, policy);
    return new Response(role.bytes, { headers: common });
  }
  async #getPrimaryRoutes(rt) {
    const { method, path, tokenHash, policy, user, csrf, url, releasesPath, releaseHistoryPath } = rt;
    if (method === 'GET' && path === '/api/session') { this.touch(tokenHash, policy); return response({ user: dto(user), csrf }); }
    if (method === 'GET' && path === '/api/admin/accounts') { return this.#getAdminAccounts(rt); }
    if (method === 'GET' && path === '/api/games') { const games = this.games.listOwn(tokenHash); this.touch(tokenHash, policy); return response({ games }); }
    if (method === 'GET' && path === '/api/games/submissions') { const games = this.games.submissionSummaries(tokenHash); this.touch(tokenHash, policy); return response({ games }); }
    if (method === 'GET' && path === '/api/admin/games') { const games = this.games.managementSummaries(tokenHash); this.touch(tokenHash, policy); return response({ games }); }
    if (method === 'GET' && path === '/api/admin/reviews') { const games = this.games.adminSubmissionSummaries(tokenHash); this.touch(tokenHash, policy); return response({ games }); }
    if (method === 'GET' && path === '/api/admin/copy/submissions') { if (!this.gameCopies) { fail(503, 'COPY_NOT_CONFIGURED'); } const queue = this.gameCopies.reviewQueue(tokenHash); this.touch(tokenHash, policy); return response({ queue }); }
    if (method === 'GET' && releaseHistoryPath) { return this.#getReleaseHistory(rt); }
    if (method === 'GET' && path === '/api/admin/source') { return this.#getAdminSource(rt); }
    if (method === 'GET' && path === '/api/admin/library') { return this.#getAdminLibrary(rt); }
    if (method === 'GET' && path === '/api/resources') { return this.#getResources(rt); }
    if (method === 'GET' && path === '/api/resources/asset') { return this.#getResourceAsset(rt); }
    if (method === 'GET' && releasesPath) { if (url.search) { fail(422, 'RELEASE_QUERY'); } this.touch(tokenHash, policy); return response({ releases: this.releases.history(tokenHash, releasesPath[1]) }); }
    return (await this.#getManagementCopy(rt)) ?? null;
  }
  async #getAdminSource(rt) {
    const { tokenHash, policy } = rt;
    this.copyAccess(tokenHash); let staged = null;
    if (this.env.EDITOR_INSTALLED_SOURCE_ROOT) { try { staged = JSON.parse(this.env.EDITOR_INSTALLED_SOURCE_ROOT); } catch { fail(503, 'SOURCE_BOOTSTRAP_CONFIG'); } }
    let registered = null; try { registered = this.installedSources.status(tokenHash, this.installedSources.definition().registryId); } catch (error) { if (!(error instanceof HttpError) || error.code !== 'SOURCE_NOT_REGISTERED') { throw error; } }
    const result = { definition: this.installedSources.definition(), staged, registered };
    this.touch(tokenHash, policy); return response(result);
  }
  async #getAdminLibrary(rt) {
    const { url, tokenHash, policy } = rt;
    this.copyAccess(tokenHash); if (url.search) { fail(422, 'LIBRARY_QUERY'); }
    let staged = null; if (this.env.EDITOR_AVAILABLE_LIBRARY_ROOT) { try { staged = JSON.parse(this.env.EDITOR_AVAILABLE_LIBRARY_ROOT); } catch { fail(503, 'LIBRARY_BOOTSTRAP_CONFIG'); } }
    let registered = null; try { registered = this.availableLibrary.status(tokenHash, this.availableLibrary.definition().registryId); } catch (error) { if (!(error instanceof HttpError) || error.code !== 'SOURCE_NOT_REGISTERED') { throw error; } }
    const result = { definition: this.availableLibrary.definition(), mode: 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE', unresolvedReferences: 20, staged, registered };
    this.touch(tokenHash, policy); return response(result);
  }
  // A 路線發布日誌的唯讀入口（第 2 檔）：管理員看某個遊戲的發布歷史。日誌只覆蓋
  // A 路線之後的上架，不回填舊版本，所以空清單是常態而不是故障。
  // 內建遊戲不可發布，也回 403 而不是 404 假裝不存在（與 purge／review 一致）。
  async #getReleaseHistory(rt) {
    const { url, tokenHash, policy, user, releaseHistoryPath } = rt;
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    if (releaseHistoryPath[1] === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (url.search) { fail(422, 'RELEASE_HISTORY_QUERY'); }
    this.touch(tokenHash, policy);
    return response({ gameId: releaseHistoryPath[1], releases: this.frozenDistribution.releaseLog(releaseHistoryPath[1]) });
  }
  async #getCollectionRoutes(rt) {
    const { method, stageAssetsPath, libraryPath, stagePath } = rt;
    if (stageAssetsPath) { return this.#getStageAssets(rt); }
    if (method === 'GET' && libraryPath) { return this.#getLibraryAsset(rt); }
    if (method === 'GET' && stagePath) { return this.#getStageRead(rt); }
    return null;
  }
  #checkStageCollectionQuery(url, gameId) {
    if (gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(gameId)) { fail(422, 'GAME_ID'); }
    const purposes = ['data', 'images', 'fallback-spring', 'fallback-summer', 'fallback-autumn', 'fallback-winter'];
    const names = [...url.searchParams.keys()], expected = ['revision', ...purposes];
    if (names.length !== expected.length || new Set(names).size !== expected.length || names.some(name => !expected.includes(name))) { fail(422, 'STAGE_COLLECTION_QUERY'); }
    const draftRevision = url.searchParams.get('revision');
    if (!/^[1-9][0-9]{0,63}$/.test(draftRevision)) { fail(422, 'DRAFT_REVISION'); }
    const operations = Object.fromEntries(purposes.map(purpose => [purpose, url.searchParams.get(purpose)]));
    if (new Set(Object.values(operations)).size !== purposes.length || Object.values(operations).some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))) { fail(422, 'STAGE_COLLECTION_OPERATION'); }
    return { draftRevision, operations };
  }
  async #getStageAssets(rt) {
    const { method, url, tokenHash, policy, stageAssetsPath } = rt;
    if (method !== 'GET') { fail(404, 'NOT_FOUND'); }
    const actor = this.principal(tokenHash);
    if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
    if (actor.role !== 'admin') { fail(403, 'FIXED_LIBRARY_ADMIN_REQUIRED'); }
    const gameId = stageAssetsPath[1];
    const { draftRevision, operations } = this.#checkStageCollectionQuery(url, gameId);
    if (!this.stageApi || !this.libraryAssets) { fail(503, 'STAGE_COLLECTION_NOT_CONFIGURED'); }
    this.touch(tokenHash, policy);
    let result;
    try { result = await collectFixedStageAssets(tokenHash, { gameId, draftRevision, operations }, { games: this.games, stageApi: this.stageApi, libraryAssets: this.libraryAssets }); }
    catch (error) {
      if (error instanceof TypeError && error.message === 'STAGE_COLLECTION_READY') { fail(409, 'JOB_NOT_READY'); }
      if (error instanceof TypeError && error.message === 'STAGE_COLLECTION_REVISION') { fail(409, 'JOB_SNAPSHOT_CHANGED'); }
      throw error;
    }
    result.assertCurrent();
    const reply = response({ plan: result.plan, admission: result.admission, runtimeAllowed: false, trialAllowed: false, releaseAllowed: false, deleteAllowed: false });
    // Serialization is synchronous; recheck the ORIGINAL captured services and
    // actual Root session, never mint a read capability from the JSON response.
    result.assertCurrent(); const current = this.principal(tokenHash);
    if (current.id !== actor.id || current.epoch !== actor.epoch || current.role !== actor.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
    return reply;
  }
  async #getLibraryAsset(rt) {
    const { url, tokenHash, user, policy, libraryPath } = rt;
    if ([...url.searchParams.keys()].join(',') !== 'revision') { fail(422, 'DRAFT_REVISION'); }
    this.touch(tokenHash, policy);
    const result = await this.libraryAssets.read(tokenHash, libraryPath, url.searchParams.get('revision'));
    result.assertCurrent();
    if (result.artifact) {
      const ref = this.games.snapshotReference(tokenHash, result.artifact.gameId, result.artifact.draftRevision);
      result.assertCurrent(); const current = this.principal(tokenHash);
      if (current.id !== user.id || current.epoch !== user.epoch || current.role !== user.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
      return new Response(result.artifact.bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${result.artifact.assetId}.bin"`, 'X-Content-SHA256': result.artifact.sha256, 'X-Game-ID': ref.gameId, 'X-Draft-Revision': ref.draftRevision, 'X-Source-SHA256': ref.sourceDigest, 'X-Dependency-SHA256': ref.dependencyDigest, 'X-Library-Root': result.artifact.catalogRoot, 'X-Content-Admission': result.artifact.admission } });
    }
    return response(result.body);
  }
  async #getStageRead(rt) {
    const { url, tokenHash, user, policy, stagePath } = rt;
    if (url.search) { fail(422, 'STAGE_QUERY'); }
    this.touch(tokenHash, policy);
    const result = await this.stageApi.read(tokenHash, stagePath);
    this.stageApi.assertCurrent(tokenHash, stagePath, result);
    if (result.artifact) {
      const job = this.stageApi.assertCurrent(tokenHash, stagePath, result);
      const ref = this.games.snapshotReference(tokenHash, job.gameId, job.draftRevision);
      this.stageApi.assertCurrent(tokenHash, stagePath, result); const current = this.principal(tokenHash);
      if (current.id !== user.id || current.epoch !== user.epoch || current.role !== user.role || current.must_change) { fail(401, 'SESSION_INVALID'); }
      return new Response(result.artifact.bytes, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${result.artifact.assetId}"`, 'X-Content-SHA256': result.artifact.sha256, 'X-Game-ID': ref.gameId, 'X-Draft-Revision': ref.draftRevision, 'X-Source-SHA256': ref.sourceDigest, 'X-Dependency-SHA256': ref.dependencyDigest, 'X-Content-Admission': 'stage-only' } });
    }
    return response(result.body);
  }
  async #getDraftRead(rt) {
    const { url, tokenHash, policy, draftPath } = rt;
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    if (draftPath[2] === 'map-atlas') {
      if ([...url.searchParams.keys()].sort().join(',') !== 'revision,season') fail(422, 'DRAFT_MAP_ATLAS');
      this.touch(tokenHash, policy);
      return response(await this.privateDrafts.readMapAtlas(tokenHash, draftPath[1], url.searchParams.get('revision'), url.searchParams.get('season')));
    }
    if (draftPath[2] === 'map-scene') {
      if ([...url.searchParams.keys()].sort().join(',') !== 'layers,revision') fail(422, 'DRAFT_MAP_WINDOW');
      this.touch(tokenHash, policy);
      return response(await this.privateDrafts.readMapScene(tokenHash, draftPath[1], url.searchParams.get('revision'), url.searchParams.get('layers')));
    }
    if (['map-window', 'map-layer-window', 'decoration-selection'].includes(draftPath[2])) {
      const layered = draftPath[2] === 'map-layer-window';
      const error = draftPath[2] === 'decoration-selection' ? 'DRAFT_DECORATION_SELECTION' : 'DRAFT_MAP_WINDOW';
      const keys = layered ? 'height,layers,revision,width,x,y' : 'height,revision,width,x,y';
      if ([...url.searchParams.keys()].sort().join(',') !== keys) fail(422, error);
      const rectangle = {};
      for (const key of ['x', 'y', 'width', 'height']) {
        const value = url.searchParams.get(key);
        if (!/^(0|[1-9][0-9]{0,2})$/.test(value)) fail(422, error);
        rectangle[key] = Number(value);
      }
      this.touch(tokenHash, policy);
      if (draftPath[2] === 'decoration-selection') return response(await this.privateDrafts.readDecorationSelection(tokenHash, draftPath[1], url.searchParams.get('revision'), rectangle));
      return response(await this.privateDrafts.readMapWindow(tokenHash, draftPath[1], url.searchParams.get('revision'), rectangle, layered ? url.searchParams.get('layers') : undefined));
    }
    if (draftPath[2] === 'minimap') { if ([...url.searchParams.keys()].join(',') !== 'revision') { fail(422, 'DRAFT_REVISION'); } this.touch(tokenHash, policy); return response(await this.privateDrafts.readMinimap(tokenHash, draftPath[1], url.searchParams.get('revision'))); }
    // B8 全章匯總校驗的唯讀入口：修訂由服務端取當前已保存值，客戶端不能挑版本；
    // 與上架共用同一 captureForCompile，因此摘要與 profile 口徑一致。不改資料、
    // 不發 Trial、不寫收據，只回逐章問題清單。
    if (draftPath[2] === 'chapter-references') {
      if (url.search) { fail(422, 'DRAFT_REVISION'); }
      const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === draftPath[1]);
      if (!owned) { fail(404, 'GAME_NOT_FOUND'); }
      this.touch(tokenHash, policy);
      return response(await this.privateDrafts.chapterReferences(tokenHash, draftPath[1], owned.draftRevision));
    }
    if (!draftPath[2]) { if ([...url.searchParams.keys()].join(',') !== 'revision') { fail(422, 'DRAFT_REVISION'); } this.touch(tokenHash, policy); return response(await this.privateDrafts.read(tokenHash, draftPath[1], url.searchParams.get('revision'))); }
    if (draftPath[3]) { this.touch(tokenHash, policy); return response(this.privateDrafts.query(tokenHash, draftPath[1], draftPath[3])); }
    return null;
  }
  async #getTrialStatusPack(rt) {
    const { method, trialPath } = rt;
    // T6 试运行已取消。
    if (method === 'GET' && (trialPath?.[2] === 'status' || trialPath?.[2] === 'pack')) fail(410, 'TRIAL_RETIRED');
    return null;
  }
  async #getRecordRoutes(rt) {
    const { method, draftPath, trialAssetPath } = rt;
    const hit = await this.#getGameCopy(rt);
    if (hit) { return hit; }
    if (method === 'GET' && draftPath) { return this.#getDraftRead(rt); }
    const statusPack = await this.#getTrialStatusPack(rt);
    if (statusPack) { return statusPack; }
    if (method === 'GET' && trialAssetPath) { return this.#getTrialAsset(rt); }
    return null;
  }
  // T1–T8 简化副本：copy 单套可变草稿读 + 提交状态机读。
  async #getGameCopy(rt) {
    const { method, url, tokenHash, policy, gameCopyPath } = rt;
    if (!gameCopyPath || method !== 'GET') { return null; }
    if (!this.gameCopies) { fail(503, 'COPY_NOT_CONFIGURED'); }
    const gameId = gameCopyPath[1], sub = gameCopyPath[2];
    if (sub === 'submission') {
      if (url.search) { fail(422, 'COPY_QUERY'); }
      this.touch(tokenHash, policy);
      return response(this.gameCopies.submission(tokenHash, gameId));
    }
    if (!sub) {
      if (url.search) { fail(422, 'COPY_QUERY'); }
      this.touch(tokenHash, policy);
      return response(this.gameCopies.read(tokenHash, gameId));
    }
    return null;
  }
  // T1–T8 简化副本：模块覆盖写 + 整包检验 + 单槽提交。
  async #postGameCopy(rt) {
    const { url, tokenHash, policy, gameCopyPath, value } = rt;
    if (!gameCopyPath) { return null; }
    if (!this.gameCopies) { fail(503, 'COPY_NOT_CONFIGURED'); }
    const gameId = gameCopyPath[1], sub = gameCopyPath[2];
    if (url.search) { fail(422, 'COPY_QUERY'); }
    if (!sub) {
      fields(value, ['module', 'patch']);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.writeModule(tokenHash, gameId, value.module, value.patch));
    }
    if (sub === 'validate') {
      fields(value, []);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.validateWhole(tokenHash, gameId));
    }
    if (sub === 'submission') {
      fields(value, ['ticket', 'description']);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.submit(tokenHash, gameId, value));
    }
    if (sub === 'reject') {
      fields(value, []);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.rejectSlot(tokenHash, gameId));
    }
    if (sub === 'approve') {
      // 方案 B：事务外准备 pack（compile＋prepare 皆为 async），事务内原子提交。
      // pack 身份的修订号取预检 nextVersion；真正的新鲜度与序号由 approveSlot 在事务内复核＋配发。
      fields(value, []);
      const preview = this.gameCopies.approvePreview(tokenHash, gameId);
      const compiled = compileTrialSource(preview.data, bytes => createHash('sha256').update(bytes).digest('hex'));
      const ticket = await this.playPacks.prepare(tokenHash, { game: preview.data, reference: { gameId, draftRevision: preview.nextVersion, sourceDigest: preview.copyDigest }, compiled });
      this.touch(tokenHash, policy);
      return response(this.gameCopies.approveSlot(tokenHash, gameId, () => this.playPacks.installPreparedInTxn(tokenHash, ticket)));
    }
    if (sub === 'import-generals') {
      fields(value, []);
      this.gameCopies.read(tokenHash, gameId); // 先验目标归属，再读受信内置来源。
      if (!this.loadBuiltinGeneralSource) fail(503, 'COPY_NOT_CONFIGURED');
      const source = await this.loadBuiltinGeneralSource(tokenHash, gameId);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.replaceGenerals(tokenHash, gameId, source));
    }
    if (sub === 'ensure') {
      // B4 迁移/首建：draft 头修订只种一次，已有 copy 行直接返回不覆盖。
      fields(value, []);
      if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
      const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
      if (!owned) { fail(404, 'GAME_NOT_FOUND'); }
      const head = await this.privateDrafts.captureForCompile(tokenHash, gameId, owned.draftRevision);
      this.touch(tokenHash, policy);
      return response(this.gameCopies.seedFromGame(tokenHash, gameId, head.game));
    }
    return null;
  }
  async #getTrialAsset(rt) {
    const { trialAssetPath } = rt;
    // T6 试运行已取消。
    if (trialAssetPath) fail(410, 'TRIAL_RETIRED');
    return null;
  }
  async #postManagement(rt) {
    const { request, tokenHash, user, policy, url, value, managementPath } = rt;
    if (url.search) { fail(422, 'MANAGEMENT_QUERY'); }
    // 上架专属管理员（用户决策①A，2026-10-15）：作者自助上架已关闭。
    if (managementPath[2] === 'listing') {
      if (!value || (value.action !== 'list' && value.action !== 'unlist')) { fail(422, 'MANAGEMENT_ACTION'); }
      if (user.role === 'admin' && value.action === 'unlist') { return this.#postAdminUnlist(rt); }
      if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
      fields(value, ['action', 'expectedRowRevision']);
      this.touch(tokenHash, policy);
      const op = await this.operation(request, value, user.id, user.epoch, policy);
      // Flag, announcement/registry, distribution identity and permanent result
      // share one transaction. Replays invoke neither callback.
      let distribution;
      const receipt = this.management.list(tokenHash, op, { gameId: managementPath[1], expectedRowRevision: value.expectedRowRevision }, () => {
        const done = this.games.setListedInTxn(tokenHash, managementPath[1], value.action === 'list', value.expectedRowRevision);
        if (value.action === 'list') { this.publishedGames.assertListableInTxn(managementPath[1]); }
        if (done.changed) { distribution = this.#recordPublication('listing', managementPath[1]); }
        if (distribution) { this.announcements.bumpRegistryInTxn(); }
        else if (done.becameListed) { if (!this.announcements.announceCurrentInTxn(managementPath[1])) { this.announcements.bumpRegistryInTxn(); } }
        else if (done.changed) { this.announcements.bumpRegistryInTxn(); }
        return done.summary;
      }, this.publicationProducer ? () => distribution ?? null : undefined);
      // A 路線第一版（可回滾）：同意上架提交後在本次請求內推進到可見。回應形狀
      // 不變（管理回執仍由既有嚴格欄位集校驗），重放不會重跑推進。
      if (this.distributionDrain && distribution) { await this.#advanceDistribution(); }
      return response(receipt);
    }
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    fields(value, []);
    return this.#postAdminUnlist({ ...rt, adminAction: managementPath[2] === 'listing' ? 'unlist' : 'clear-restriction' });
  }
  // §4.1/Q20 admin unlist (down + restrict) and clear-restriction (stays down).
  async #postAdminUnlist(rt) {
    const { request, tokenHash, user, policy, url, value, managementPath, adminAction } = rt;
    const action = adminAction ?? 'unlist';
    if (url.search) { fail(422, 'MANAGEMENT_QUERY'); }
    // The UI contract sends {action:'unlist'} for unlist and {} for
    // clear-restriction (dba2210 regressed the latter by requiring 'unlist'
    // on both paths; A1-browser-r5 caught it).
    if (action === 'unlist') { fields(value, ['action']); if (value.action !== 'unlist') { fail(422, 'MANAGEMENT_ACTION'); } }
    else { fields(value, []); }
    const expected = /^"([1-9][0-9]*)"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected || expected[1].length > 8192) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], user.id, user.epoch, policy);
    return response(this.ctx.storage.transactionSync(() => {
      const gameId = managementPath[1], before = this.one('SELECT row_revision FROM content_games WHERE game_id=?', gameId);
      let recordDistribution;
      if (this.publicationProducer) {
        recordDistribution = changed => {
          if (!changed) { return null; }
          return this.#recordPublication('restriction', gameId);
        };
      }
      const result = this.management.apply(tokenHash, op, { gameId, action, expectedRowRevision: expected[1] }, recordDistribution);
      const after = this.one('SELECT row_revision FROM content_games WHERE game_id=?', gameId);
      if (!this.publicationProducer && before?.row_revision !== after?.row_revision) { this.#recordPublication('restriction', gameId); }
      return result;
    }));
  }
  // B3 上架審核 (Web product decision 2026-11): 同意 goes through the existing
  // admin listing route; this route records the rejection decision only.
  async #postReview(rt) {
    const { request, tokenHash, user, policy, url, value, reviewPath } = rt;
    if (url.search) { fail(422, 'REVIEW_QUERY'); }
    fields(value, ['action', 'expectedRowRevision']);
    if (value.action !== 'reject') { fail(422, 'REVIEW_ACTION'); }
    if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
    // Key format and cross-namespace conflicts are enforced by GameManagement#keySpace
    // (the same guard every admin management operation uses); no second namespace here.
    this.touch(tokenHash, policy);
    const op = await this.operation(request, value, user.id, user.epoch, policy);
    return response(this.management.reject(tokenHash, op, { gameId: reviewPath[1], expectedRowRevision: value.expectedRowRevision }));
  }
  // §4.1/Q43 game deletion (fence-only): begin needs name confirmation;
  // listed games refuse (GAME_LISTED); builtin and others' games refused.
  async #postDeletion(rt) {
    const { request, tokenHash, user, policy, url, value, deletionPath } = rt;
    if (deletionPath[2]) { fail(404, 'NOT_FOUND'); }
    if (url.search) { fail(422, 'DELETE_QUERY'); }
    this.touch(tokenHash, policy);
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'delete');
    return response(this.ctx.storage.transactionSync(() => {
      const gameId = deletionPath[1], before = this.one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', gameId);
      // B3 §6 任何狀態可刪：已上架的刪除同時將 listed 置 0（deletionfence 內），
      // 公告讀取按 listed 過濾，但仍需推進 registry revision 讓玩家端重讀目錄。
      const listed = Number(this.one('SELECT listed FROM content_games WHERE game_id=?', gameId)?.listed) === 1;
      const recordDistribution = this.publicationProducer ? () => this.#recordPublication('delete-fence', gameId) : undefined;
      const result = this.deletionFence.begin(tokenHash, request.headers.get('Idempotency-Key'), { gameId, expectedRowRevision: value?.expectedRowRevision, confirmationName: value?.confirmationName }, recordDistribution);
      if (!this.publicationProducer && !before) { this.#recordPublication('delete-fence', gameId); }
      if (listed && result.state === 'fenced') { this.announcements.bumpRegistryInTxn(); }
      return result;
    }));
  }
  // 物理刪除（用戶決定 2026-11）：只接在既有 fence 之後，把遊戲從資料庫徹底移除，
  // 先核權並回收遊戲專屬檔案／目錄指標，再以單一交易刪庫行。
  // 回收失敗不刪庫行，保留不可逆 fence 與管理入口，允許重試完成清理。
  async #postPurge(rt) {
    const { request, tokenHash, user, policy, url, purgePath, value } = rt;
    if (url.search) { fail(422, 'PURGE_QUERY'); }
    this.touch(tokenHash, policy);
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'delete');
    const gameId = purgePath[1], input = value ?? {};
    this.gamePurge.check(tokenHash, gameId, input);
    if (purgeReclaimer === undefined) fail(503, 'RECLAIMER_UNCONFIGURED');
    let facts;
    try { facts = await purgeReclaimer(gameId); }
    catch (error) {
      fail(503, 'RECLAIM_FAILED', { reason: String(error?.code || error?.message || 'RECLAIM_FAILED').slice(0, 200) });
    }
    const result = this.gamePurge.purge(tokenHash, gameId, input);
    this.ctx.storage.transactionSync(() => this.announcements.bumpRegistryInTxn());
    return response({ ...result, reclamation: { state: 'completed', pointer: facts.pointer, objects: facts.objects, privateObjects: facts.privateObjects ?? 0 } });
  }
  // §4.1/Q43 deletion query (GET fence receipt).
  async #getDeletion(rt) {
    const { tokenHash, policy, url, deletionPath } = rt;
    const preview = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/deletion-preview$/.exec(url.pathname);
    if (preview) {
      if (url.search) { fail(422, 'DELETE_QUERY'); }
      this.touch(tokenHash, policy);
      return response(this.deletionFence.previewForAdmin(tokenHash, preview[1]));
    }
    if (!deletionPath?.[2]) { return null; }
    if (url.search) { fail(422, 'DELETE_QUERY'); }
    this.touch(tokenHash, policy);
    return response(this.ctx.storage.transactionSync(() => {
      const result = this.deletionFence.query(tokenHash, deletionPath[3]);
      if (result.gameId !== deletionPath[1]) { fail(404, 'DELETE_OPERATION_NOT_FOUND'); }
      if (!deletionPath[4]) { return result; }
      if (!this.publicationProducer) { fail(503, 'DISTRIBUTION_NOT_CONFIGURED'); }
      const bound = this.deletionFence.queryDistribution(tokenHash, deletionPath[3], deletionPath[1]);
      const distribution = this.frozenDistribution.operationStatus(result.gameId, bound.distribution.operationId);
      if (distribution.kind !== 'delete-fence' || distribution.generation !== bound.distribution.generation) { fail(503, 'DELETE_DISTRIBUTION_CORRUPT'); }
      return { version: 1, gameId: result.gameId, result, distribution };
    }));
  }
  // 共用画像庫（B 決策）：owner 唯讀 manifest＋草稿在用標記；禁上傳／刪除。
  async #portraitUsedKeys(tokenHash, gameId) {
    if (!this.privateDrafts) { return []; }
    try {
      const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
      if (!owned) { return []; }
      const receipt = await this.privateDrafts.read(tokenHash, gameId, owned.draftRevision);
      // Author references only: the public draft DTO does not expose native
      // portrait bytes. Inactive chapter configurations still retain references.
      return [...new Set([
        ...(receipt.chapters ?? []).flatMap(chapter => (chapter.generals ?? []).map(general => general.portraitKey)),
        ...(receipt.generalDefinitions ?? []).map(definition => definition.portraitRef?.assetId),
        ...(receipt.chapterPeople ?? []).flatMap(chapter => chapter.people.map(person => person.values.portraitRef?.assetId)),
      ].filter(id => typeof id === 'string'))];
    } catch (error) {
      this.principal(tokenHash);
      throw error;
    }
  }
  async #getPortraits(rt) {
    const { tokenHash, policy, url, portraitPath } = rt;
    if (!portraitPath) { return null; }
    const catalogOnly = !portraitPath[2] && url.searchParams.get('usage') === '0' && [...url.searchParams.keys()].join(',') === 'usage';
    if (url.search && !portraitPath[3] && !catalogOnly) { fail(422, 'PORTRAIT_QUERY'); }
    this.touch(tokenHash, policy);
    this.games.assertNotDeleting(portraitPath[1]);
    if (portraitPath[3]) {
      const descriptor = this.portraits.get(portraitPath[2]);
      if ([...url.searchParams.keys()].join(',') !== 'sha256' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('sha256') ?? '')) fail(422, 'PORTRAIT_QUERY');
      if (url.searchParams.get('sha256') !== descriptor.sha256) fail(409, 'PORTRAIT_CHANGED');
      if (!readSharedPortrait) fail(503, 'PORTRAIT_BYTES_NOT_CONFIGURED');
      let bytes;
      try { bytes = await readSharedPortrait(descriptor); }
      catch (error) { this.principal(tokenHash); throw error; }
      this.principal(tokenHash);
      this.games.assertNotDeleting(portraitPath[1]);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) fail(503, 'PORTRAIT_BYTES_CORRUPT');
      return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Content-SHA256': descriptor.sha256 } });
    }
    if (portraitPath[2]) {
      return response(this.portraits.get(portraitPath[2]));
    }
    const list = this.portraits.list();
    // The copy picker needs resource descriptors only; do not load/validate a
    // whole legacy draft just to compute an unused inUse flag.
    if (catalogOnly) { return response({ gameId: portraitPath[1], portraits: list }); }
    const used = await this.#portraitUsedKeys(tokenHash, portraitPath[1]);
    this.principal(tokenHash);
    this.games.assertNotDeleting(portraitPath[1]);
    return response({ gameId: portraitPath[1], portraits: list.map(entry => ({ ...entry, inUse: used.includes(entry.assetId) })) });
  }
  async #topologyGame(tokenHash, gameId) {
    const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
    if (!owned) { fail(404, 'GAME_NOT_FOUND'); }
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    return (await this.privateDrafts.captureForCompile(tokenHash, gameId, owned.draftRevision)).game;
  }
  async #getTopology(rt) {
    const { tokenHash, policy, url, topologyPath } = rt;
    if (!topologyPath || topologyPath[2]) { return null; }
    if (url.search) { fail(422, 'TOPOLOGY_QUERY'); }
    this.touch(tokenHash, policy);
    const gameId = topologyPath[1];
    return response({ gameId, moves: this.topology.list(tokenHash, gameId), rebuilds: this.topology.listRebuilds(tokenHash, gameId), blocked: hasPendingMoves(this.ctx.storage, gameId) });
  }
  async #postTopology(rt) {
    const { request, tokenHash, user, policy, url, value, topologyPath } = rt;
    if (!topologyPath?.[2]) { return null; }
    if (url.search) { fail(422, 'TOPOLOGY_QUERY'); }
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'topology');
    this.touch(tokenHash, policy);
    const gameId = topologyPath[1], kind = topologyPath[2], clear = topologyPath[3] === 'clear';
    if (!value || Array.isArray(value) || typeof value !== 'object') { fail(422, 'REQUEST_FIELDS'); }
    if (kind === 'move' && clear) {
      if (Object.keys(value).length > 1 || (value.cityId !== undefined && typeof value.cityId !== 'string')) { fail(422, 'REQUEST_FIELDS'); }
      return response({ gameId, cleared: this.topology.clear(tokenHash, gameId, value.cityId) });
    }
    if (kind === 'rebuild' && clear) {
      fields(value, ['roadId']);
      return response({ gameId, cleared: this.topology.clearRebuild(tokenHash, gameId, value.roadId) });
    }
    const game = await this.#topologyGame(tokenHash, gameId);
    if (kind === 'move') {
      fields(value, ['cityId', 'x', 'y']);
      return response(this.topology.record(tokenHash, game, value));
    }
    fields(value, ['roadId', 'geometry', 'travelKind']);
    return response(this.topology.rebuild(tokenHash, game, value));
  }
  async #postDraftSave(rt) {
    const { request, tokenHash, user, policy, value, draftPath } = rt;
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'draft');
    const expected = /^"([1-9][0-9]{0,63})"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected) { fail(428, 'IF_MATCH_REQUIRED'); }
    // Authenticated editing is activity, like the other editor routes. Touch
    // before asynchronous work, never revive an expired/revoked session after it.
    this.touch(tokenHash, policy);
    const op = await this.operation(request, [value, expected[1]], user.id, user.epoch, policy);
    return response(await this.privateDrafts.save(tokenHash, draftPath[1], expected[1], op.key, op.digest, value));
  }
  // 校驗＝在服務端跑一次整遊戲引用檢查，並把結果（狀態／時間／逐章問題）落庫，
  // 綁定當下已保存的草稿修訂。回傳形狀與唯讀 GET 相同，客戶端同一套回執驗證。
  // 檢驗的四層就是 chapterBaseReferenceGaps 的四個 code。逐層各回一次，讓畫面能在
  // 同一個遮罩裡「算完一層就更新一層」；四層都到齊才落庫，避免半套記錄被上架門當成通過。
  #validationJob(tokenHash, gameId, draftRevision) {
    const key = tokenHash + ':' + gameId;
    const cached = this.validationJobs.get(key);
    if (cached && cached.draftRevision === draftRevision && Date.now() - cached.at < VALIDATION_JOB_TTL_MS) { return cached; }
    return this.privateDrafts.chapterReferences(tokenHash, gameId, draftRevision).then(checked => {
      const job = { draftRevision: checked.draftRevision, sourceDigest: checked.sourceDigest, chapterCount: checked.chapterCount, report: checked.chapters, layers: new Set(), at: Date.now() };
      this.validationJobs.delete(key);
      this.validationJobs.set(key, job);
      while (this.validationJobs.size > VALIDATION_JOB_LIMIT) { this.validationJobs.delete(this.validationJobs.keys().next().value); }
      return job;
    });
  }
  #recordValidation(tokenHash, gameId, job) {
    this.ctx.storage.transactionSync(() => this.validations.recordInTxn({ gameId, draftRevision: job.draftRevision, sourceDigest: job.sourceDigest, chapterCount: job.chapterCount, chapters: job.report, checkedAt: new Date().toISOString() }));
    this.validationJobs.delete(tokenHash + ':' + gameId);
  }
  async #postValidation(rt) {
    const { tokenHash, policy, url, value, draftPath } = rt;
    if (!this.privateDrafts) { fail(503, 'DRAFT_NOT_CONFIGURED'); }
    if (url.search) { fail(422, 'DRAFT_REVISION'); }
    const layered = value !== null && typeof value === 'object' && Object.hasOwn(value, 'layer');
    if (layered) { fields(value, ['layer']); if (!VALIDATION_LAYER_KEYS.has(value.layer)) { fail(422, 'VALIDATION_LAYER'); } } else { fields(value, []); }
    this.touch(tokenHash, policy);
    const gameId = draftPath[1];
    const owned = this.games.listOwn(tokenHash).find(entry => entry.gameId === gameId);
    if (!owned) { fail(404, 'GAME_NOT_FOUND'); }
    // 不帶 layer＝一次算完四層（既有契約，供程式與回放使用）。
    if (!layered) {
      const checked = await this.privateDrafts.chapterReferences(tokenHash, gameId, owned.draftRevision);
      this.ctx.storage.transactionSync(() => this.validations.recordInTxn({ gameId, draftRevision: checked.draftRevision, sourceDigest: checked.sourceDigest, chapterCount: checked.chapterCount, chapters: checked.chapters, checkedAt: new Date().toISOString() }));
      return response(checked);
    }
    const job = this.#validationJob(tokenHash, gameId, owned.draftRevision);
    const checked = await job;
    // 逐層真的只用該層的 code 過濾；未檢查過的層不會被回成通過。
    const code = VALIDATION_LAYER_CODES.get(value.layer);
    const chapters = checked.report
      .filter(chapter => chapter.problems.some(problem => problem.code === code))
      .map(chapter => ({ chapterId: chapter.chapterId, chapterName: chapter.chapterName, problems: chapter.problems.filter(problem => problem.code === code) }));
    checked.layers.add(value.layer);
    if (checked.layers.size === VALIDATION_LAYER_KEYS.size) { this.#recordValidation(tokenHash, gameId, checked); }
    return response({ version: 1, gameId, draftRevision: checked.draftRevision, sourceDigest: checked.sourceDigest, chapterCount: checked.chapterCount, chapters });
  }
  async #postLibraryInstall(rt) {
    const { tokenHash, url, value, request, user } = rt;
    this.copyAccess(tokenHash); if (url.search) { fail(422, 'LIBRARY_QUERY'); } fields(value, []); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'source');
    let staged; try { staged = JSON.parse(this.env.EDITOR_AVAILABLE_LIBRARY_ROOT); } catch { fail(503, 'LIBRARY_NOT_STAGED'); }
    fields(staged, ['registryId', 'root']);
    return response({ ...(await this.availableLibrary.install(tokenHash, staged.registryId, staged.root, request.headers.get('Idempotency-Key'))), mode: 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE', unresolvedReferences: 20 });
  }
  async #postEntryRoutes(rt) {
    const { request, tokenHash, user, policy, url, path, value, managementPath, reviewPath, deletionPath, purgePath, stagePath, copyPath, authorCopyPath, draftPath } = rt;
    const gameCopyHit = await this.#postGameCopy(rt);
    if (gameCopyHit) { return gameCopyHit; }
    if (managementPath) { return this.#postManagement(rt); }
    if (purgePath) { return this.#postPurge(rt); }
    if (reviewPath) { return this.#postReview(rt); }
    if (deletionPath) { return this.#postDeletion(rt); }
    if (stagePath) {
      if (url.search) { fail(422, 'STAGE_QUERY'); }
      const result = await this.stageApi.write(tokenHash, stagePath, value, request.headers.get('Idempotency-Key'), request.headers.get('If-Match')); this.stageApi.assertCurrent(tokenHash, stagePath, result); return response(result, stagePath.id ? 200 : 202);
    }
    if (path === '/api/admin/source/install') {
      this.copyAccess(tokenHash); fields(value, []); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'source');
      let staged; try { staged = JSON.parse(this.env.EDITOR_INSTALLED_SOURCE_ROOT); } catch { fail(503, 'SOURCE_NOT_STAGED'); }
      fields(staged, ['registryId', 'root']);
      return response(await this.installedSources.install(tokenHash, staged.registryId, staged.root, request.headers.get('Idempotency-Key')));
    }
    if (path === '/api/admin/library/install') { return this.#postLibraryInstall(rt); }
    if (path === '/api/admin/copies') {
      this.copyAccess(tokenHash); fields(value, ['registryId', 'name', 'introduction']); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'copy');
      return response(this.adminCopies.reserve(tokenHash, request.headers.get('Idempotency-Key'), value), 202);
    }
    if (path === '/api/games') {
      this.authorCopyAccess(tokenHash); fields(value, ['name', 'introduction']); this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'copy');
      return response(this.authorCopies.reserve(tokenHash, request.headers.get('Idempotency-Key'), { registryId: this.installedSources.definition().registryId, name: value.name, introduction: value.introduction }), 202);
    }
    if (copyPath?.[2]) { return this.copyCommand(request, tokenHash, user, policy, value, copyPath[1], copyPath[2]); }
    if (authorCopyPath?.[2]) { return this.authorCopyCommand(request, tokenHash, user, policy, value, authorCopyPath[1], authorCopyPath[2]); }
    if (draftPath?.[2] === 'save') { return this.#postDraftSave(rt); }
    if (draftPath?.[2] === 'chapter-references') { return this.#postValidation(rt); }
    return null;
  }
  async #postTrialStart(rt) {
    const { trialStartPath } = rt;
    if (!trialStartPath) { return null; }
    // T6 试运行已取消。
    fail(410, 'TRIAL_RETIRED');
  }
  async #postTrialEnd(rt) {
    const { trialPath } = rt;
    if (trialPath?.[2] !== 'end') { return null; }
    // T6 试运行已取消。
    fail(410, 'TRIAL_RETIRED');
  }
  async #buildPasswordMutation(user, value, policy) {
    fields(value, ['oldPassword', 'newPassword']); password(value.newPassword);
    if (value.newPassword === value.oldPassword || value.newPassword === policy.defaultPassword) { fail(422, 'NEW_PASSWORD_REQUIRED'); }
    if (!passwordMatches(value.oldPassword, user.password_hash)) { fail(401, 'INVALID_PASSWORD'); }
    const encoded = passwordHash(value.newPassword), changed = { ...user, must_change: 0, epoch: user.epoch + 1, version: user.version + 1 }, s = await this.sessionData(changed, policy);
    const mutation = () => { this.sql.exec('UPDATE users SET password_hash=?,must_change=0,epoch=epoch+1,version=version+1 WHERE id=?', encoded, user.id); this.sql.exec('DELETE FROM sessions WHERE user_id=?', user.id); this.insertSession(s, changed); };
    return { mutation, result: { body: { user: dto(changed), csrf: s.csrf }, token: s.token }, operationEpoch: changed.epoch };
  }
  // §4.6 self profile: optional fields only; version bumps, sessions survive.
  #buildProfileMutation(user, value) {
    if (!value || Array.isArray(value) || typeof value !== 'object' || !Object.keys(value).every(key => ['displayName', 'email', 'phone', 'note'].includes(key))) { fail(422, 'REQUEST_FIELDS'); }
    const patch = {};
    for (const [key, column] of [['displayName', 'display_name'], ['email', 'email'], ['phone', 'phone'], ['note', 'note']]) {
      if (!(key in value)) { continue; }
      patch[column] = profileField(value[key]);
    }
    if (Object.keys(patch).length === 0) { fail(422, 'PROFILE_EMPTY'); }
    const changed = { ...user, ...patch, version: user.version + 1 };
    const mutation = () => { const current = this.one('SELECT version FROM users WHERE id=?', user.id); if (current.version !== user.version) { fail(409, 'ACCOUNT_CHANGED'); } this.sql.exec(`UPDATE users SET ${Object.keys(patch).map(column => `${column}=?`).join(',')},version=version+1 WHERE id=?`, ...Object.values(patch), user.id); };
    return { mutation, result: { body: { user: dto(changed) } } };
  }
  #buildAccountMutation(user, match, value, policy) {
    fields(value, match[2] === 'disable' ? ['expectedVersion', 'disabled'] : ['expectedVersion']);
    if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1) { fail(422, 'ACCOUNT_VERSION'); }
    if (match[2] === 'disable' && typeof value.disabled !== 'boolean') { fail(422, 'DISABLED_BOOLEAN'); }
    const target = this.one('SELECT * FROM users WHERE id=?', match[1]); if (!target) { fail(404, 'ACCOUNT_NOT_FOUND'); }
    if (target.account === 'tianyi') { fail(403, 'ADMIN_PROTECTED'); } if (target.version !== value.expectedVersion) { fail(409, 'ACCOUNT_CHANGED'); }
    // §4.6: the last enabled admin cannot be disabled.
    if (match[2] === 'disable' && value.disabled && target.role === 'admin' && !target.disabled && this.one("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0").n < 2) { fail(403, 'ADMIN_LAST'); }
    const encoded = match[2] === 'reset' ? passwordHash(policy.defaultPassword) : target.password_hash;
    const changed = { ...target, disabled: match[2] === 'disable' ? Number(value.disabled) : target.disabled, must_change: match[2] === 'reset' ? 1 : target.must_change, epoch: target.epoch + 1, version: target.version + 1 };
    const mutation = () => { const current = this.one('SELECT version FROM users WHERE id=?', target.id); if (current.version !== value.expectedVersion) { fail(409, 'ACCOUNT_CHANGED'); } this.sql.exec('UPDATE users SET password_hash=?,disabled=?,must_change=?,epoch=?,version=? WHERE id=?', encoded, changed.disabled, changed.must_change, changed.epoch, changed.version, changed.id); this.sql.exec('DELETE FROM sessions WHERE user_id=?', target.id); };
    return { mutation, result: { body: { account: dto(changed) } }, operationEpoch: user.epoch };
  }
  async #postAuthMutation(rt) {
    const { request, tokenHash, user, policy, path, value } = rt;
    this.contentKey(user.id, request.headers.get('Idempotency-Key'), 'auth');
    const op = await this.operation(request, value, user.id, user.epoch, policy), old = await this.replay(op, policy);
    if (old) { return response(old.body, 200, old.token); }
    let mutation, result, operationEpoch = user.epoch;
    if (path === '/api/auth/logout') {
      fields(value, []); mutation = () => this.sql.exec('DELETE FROM sessions WHERE token_hash=?', tokenHash); result = { body: { loggedOut: true }, token: '' };
    } else if (path === '/api/auth/password') {
      const built = await this.#buildPasswordMutation(user, value, policy);
      mutation = built.mutation; result = built.result; operationEpoch = built.operationEpoch;
    } else if (path === '/api/auth/profile') {
      const built = this.#buildProfileMutation(user, value);
      mutation = built.mutation; result = built.result;
    } else if (path === '/api/admin/accounts') {
      if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); } fields(value, ['account']); const name = account(value.account);
      const created = { id: crypto.randomUUID(), account: name, role: 'author', disabled: 0, must_change: 1, epoch: 1, version: 1 }, encoded = passwordHash(policy.defaultPassword);
      mutation = () => { if (this.one('SELECT id FROM users WHERE account=?', name)) { fail(409, 'ACCOUNT_EXISTS'); } this.sql.exec("INSERT INTO users VALUES(?,?,'author',?,0,1,1,1,'','','','')", created.id, name, encoded); };
      result = { body: { account: dto(created) } };
    } else {
      const match = /^\/api\/admin\/accounts\/([a-f0-9-]{36})\/(disable|reset)$/.exec(path);
      if (!match) { fail(404, 'NOT_FOUND'); } if (user.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
      const built = this.#buildAccountMutation(user, match, value, policy);
      mutation = built.mutation; result = built.result; operationEpoch = built.operationEpoch;
    }
    const sealed = await seal(result, policy.secret, op.aad);
    const committed = this.ctx.storage.transactionSync(() => { if (!this.canCommit(op)) { return false; } const current = this.principal(tokenHash); if (current.epoch !== user.epoch) { fail(401, 'SESSION_INVALID'); } mutation(); this.touch(tokenHash, policy); this.remember({ ...op, epoch: operationEpoch }, sealed, policy); return true; });
    if (!committed) { result = await this.replay({ ...op, epoch: operationEpoch }, policy); }
    return response(result.body, 200, result.token);
  }
  async handle(request) {
    const policy = config(this.env), url = requestURL(request), path = url.pathname, method = request.method;
    const gate = this.#gateEntry(request, policy, url, method, path);
    if (gate) { return gate; }
    // Frozen publication is readable only through the R2 reader's admission and
    // current-root gates, never through live VPS pins or local announcements.
    if (frozenPublication && this.#isPlayRoute(method, path)) { fail(503, 'PLAY_READER_REQUIRED'); }
    this.seed(policy);
    // The owner row exists only after seed(), so a fresh install registers the
    // available library here instead of never (self-healing, one-shot).
    if (this.availableLibrary) this.#bootstrapLibrary(this.env);
    if (method === 'POST' && path === '/api/auth/login') { return this.#postLogin(request, policy); }
    // Dual-domain split: on the play domain only the anonymous play routes
    // exist; the editor domain keeps every route with its own auth.
    if (policy.playOrigin !== null && url.origin === policy.playOrigin && !this.#isPlayRoute(method, path)) { fail(404, 'NOT_FOUND'); }
    if (this.#isPlayRoute(method, path)) { return this.#getPlayAnonymous(url, path); }
    const token = cookie(request), tokenHash = await sha(token), user = this.principal(tokenHash), csrf = await mac(`csrf:${token}`, policy.secret);
    this.#assertPasswordCurrent(user, path);
    const managementQuery = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/management-operations\/([A-Za-z0-9_-]{16,128})$/.exec(path);
    const managementPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/(listing|restriction\/clear)$/.exec(path);
    const reviewPath = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/review$/.exec(path);
    const deletionPath = /^\/api\/games\/([a-f0-9-]{36})\/deletion(-operations\/([A-Za-z0-9_-]{16,128})(\/distribution)?)?$/.exec(path);
    // 內置也在這條 pattern 內，才能回 403 BUILTIN_PROTECTED 而不是 404 假裝不存在。
    const purgePath = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/purge$/.exec(path);
    const portraitPath = /^\/api\/games\/([a-f0-9-]{36})\/portraits(?:\/([A-Za-z0-9]{1,32})(?:\/(bytes))?)?$/.exec(path);
    const topologyPath = /^\/api\/games\/([a-f0-9-]{36})\/topology(?:\/(move|rebuild)(?:\/(clear))?)?$/.exec(path);
    const copyPath = /^\/api\/admin\/copies\/([A-Za-z0-9_-]{16,128})(?:\/(run|cancel))?$/.exec(path);
    const authorCopyPath = /^\/api\/games\/create\/([A-Za-z0-9_-]{16,128})(?:\/(run|cancel))?$/.exec(path);
    const stageAssetsPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/stage-assets$/.exec(path);
    const libraryPath = this.libraryAssets?.match(path);
    const stagePath = this.stageApi?.match(path);
    const trialStartPath = /^\/api\/games\/([a-f0-9-]{36})\/trials$/.exec(path);
    const trialPath = /^\/api\/trials\/([a-f0-9-]{36})(?:\/(status|end|pack))?$/.exec(path);
    const trialAssetPath = /^\/api\/trials\/([a-f0-9-]{36})\/assets\/([A-Za-z0-9]{1,32})$/.exec(path);
    const draftPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/draft(?:\/(save|minimap|map-window|map-layer-window|map-scene|map-atlas|decoration-selection|chapter-references|operations\/([A-Za-z0-9_-]{16,128})))?$/.exec(path);
    const gameCopyPath = /^\/api\/games\/([a-f0-9-]{36})\/copy(?:\/(validate|submission|ensure|reject|approve|import-generals))?$/.exec(path);
    const releasesPath = /^\/api\/games\/([a-f0-9-]{36}|wolong-builtin)\/releases$/.exec(path);
    // 發布歷史（game_releases 日誌）與上面 content_releases 的 /releases 是兩件事：
    // 前者是「上架歷史」（admin 唯讀、A 路線之後才有），後者是內容修訂清單。
    const releaseHistoryPath = /^\/api\/admin\/games\/([a-f0-9-]{36}|wolong-builtin)\/releases$/.exec(path);
    const rt = { request, policy, url, path, method, tokenHash, user, csrf, managementQuery, managementPath, reviewPath, deletionPath, purgePath, portraitPath, copyPath, authorCopyPath, stageAssetsPath, libraryPath, stagePath, trialStartPath, trialPath, trialAssetPath, draftPath, gameCopyPath, releasesPath, releaseHistoryPath, topologyPath };
    if (method === 'GET') {
      const hit = (await this.#getTrialRoutes(rt)) ?? (await this.#getPrimaryRoutes(rt)) ?? (await this.#getDeletion(rt)) ?? (await this.#getPortraits(rt)) ?? (await this.#getTopology(rt)) ?? (await this.#getCollectionRoutes(rt)) ?? (await this.#getRecordRoutes(rt));
      if (hit) { return hit; }
      fail(404, 'NOT_FOUND');
    }
    if (method !== 'POST') { fail(404, 'NOT_FOUND'); }
    if (!equal(request.headers.get('X-CSRF-Token'), csrf)) { fail(403, 'CSRF_REJECTED'); }
    const value = await body(request);
    return (await this.#postEntryRoutes({ ...rt, value })) ?? (await this.#postTopology({ ...rt, value })) ?? (await this.#postTrialStart({ ...rt, value })) ?? (await this.#postTrialEnd({ ...rt, value })) ?? (await this.#postPublishRoutes({ ...rt, value })) ?? (await this.#postAuthMutation({ ...rt, value }));
  }
  #checkContentKeyNamespaces(actor, key, namespace) {
    for (const [table, kind, actorColumn] of [['operations', 'auth', 'actor'], ['source_operations', 'source', 'actor'], ['content_reservations', 'copy', 'actor'], ['copy_http_commands', 'command', 'actor'], ['draft_requests', 'draft', 'actor'], ['compile_operations', 'compile', 'actor_id'], ['stage_http_commands', 'stage-command', 'actor']]) {
      if (kind !== namespace && this.one(`SELECT op_key FROM ${table} WHERE ${actorColumn}=? AND op_key=?`, actor, key)) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    }
  }
  contentKey(actor, key, namespace) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    if (namespace !== 'delete' && this.one('SELECT op_key FROM content_deletion_operations WHERE actor=? AND op_key=?', actor, key)) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (!this.adminCopies) { return; }
    this.#checkContentKeyNamespaces(actor, key, namespace);
  }
  copyAccess(tokenHash) { const actor = this.principal(tokenHash); if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED');  }if (actor.role !== 'admin') { fail(403, 'FULL_COPY_ADMIN_REQUIRED');  }if (!this.installedSources || !this.adminCopies) { fail(503, 'COPY_NOT_CONFIGURED');  }return actor; }
  // Q26 author self-service creation: same fixed pipeline as admin copies,
  // pinned to the installed source server-side (no client registry choice).
  authorCopyAccess(tokenHash) { const actor = this.principal(tokenHash); if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED');  }if (actor.role !== 'admin' && actor.role !== 'author') { fail(403, 'FULL_COPY_ADMIN_REQUIRED');  }if (!this.installedSources || !this.authorCopies) { fail(503, 'COPY_NOT_CONFIGURED');  }return actor; }
  #recordCopyCommand(tokenHash, prior, op, target, action) {
    const actor = this.copyAccess(tokenHash); if (actor.epoch !== prior.epoch) { fail(401, 'SESSION_INVALID'); }
    this.contentKey(actor.id, op.key, 'command');
    if (action === 'run') { this.adminCopies.query(tokenHash, target); } // Run requires the captured epoch.
    else { // A newly authenticated owner may explicitly cancel stale pending work, not resume it.
      const targetRow = this.one('SELECT game_id FROM copy_requests WHERE actor=? AND op_key=?', actor.id, target);
      if (!targetRow) { fail(409, 'COPY_CHANGED'); }
      this.games.assertNotDeleting(targetRow.game_id);
    }
    const old = this.one('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?', actor.id, op.key);
    if (old && old.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (old && old.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
    if (!old) { this.sql.exec('INSERT INTO copy_http_commands VALUES(?,?,?,?)', actor.id, op.key, op.digest, actor.epoch); }
    this.commandTargets.record('copy', actor.id, op.key, target);
  }
  async #cancelCopy(tokenHash, target, expected) {
    try { return response(this.adminCopies.cancel(tokenHash, target, expected[1])); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED'); } throw error; }
  }
  async copyCommand(request, tokenHash, prior, policy, value, target, action) {
    fields(value, []); this.copyAccess(tokenHash); this.contentKey(prior.id, request.headers.get('Idempotency-Key'), 'command');
    const expected = /^"([1-9][0-9]*)"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], prior.id, prior.epoch, policy);
    this.ctx.storage.transactionSync(() => { this.#recordCopyCommand(tokenHash, prior, op, target, action); });
    const row = this.one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', prior.id, target);
    if (action === 'run' && row?.state === 'committed') { return response(this.adminCopies.query(tokenHash, target)); }
    if (action === 'cancel' && row?.state === 'canceled') { return response({ gameId: row.game_id, state: row.state, rowRevision: row.row_revision, generation: row.generation, leaseUntil: row.lease_until, registryId: row.registry_id }); }
    if (action === 'cancel') { return this.#cancelCopy(tokenHash, target, expected); }
    let cap; try { cap = this.adminCopies.claim(tokenHash, target, expected[1]); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED');  }throw error; }
    // The fixed full-source pipeline has synchronous sections: timers cannot be
    // relied upon to renew a lease inside this request. A bounded5minute lease is
    // the already-tested internal policy, not a Cloudflare execution/SLA promise.
    return response(await this.adminCopies.execute(tokenHash, cap));
  }
  async #cancelAuthorCopy(tokenHash, target, expected) {
    try { return response(this.authorCopies.cancel(tokenHash, target, expected[1])); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED'); } throw error; }
  }
  async authorCopyCommand(request, tokenHash, prior, policy, value, target, action) {
    fields(value, []); this.authorCopyAccess(tokenHash); this.contentKey(prior.id, request.headers.get('Idempotency-Key'), 'command');
    const expected = /^"([1-9][0-9]*)"$/.exec(request.headers.get('If-Match') ?? ''); if (!expected) { fail(428, 'IF_MATCH_REQUIRED'); }
    const op = await this.operation(request, [value, expected[1]], prior.id, prior.epoch, policy);
    this.ctx.storage.transactionSync(() => { this.#recordAuthorCopyCommand(tokenHash, prior, op, target, action); });
    const row = this.one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', prior.id, target);
    if (action === 'run' && row?.state === 'committed') { return response(this.authorCopies.query(tokenHash, target)); }
    if (action === 'cancel' && row?.state === 'canceled') { return response({ gameId: row.game_id, state: row.state, rowRevision: row.row_revision, generation: row.generation, leaseUntil: row.lease_until, registryId: row.registry_id }); }
    if (action === 'cancel') { return this.#cancelAuthorCopy(tokenHash, target, expected); }
    let cap; try { cap = this.authorCopies.claim(tokenHash, target, expected[1]); } catch (error) { if (error instanceof HttpError && error.code === 'COPY_CHANGED') { fail(412, 'COPY_CHANGED');  }throw error; }
    return response(await this.authorCopies.execute(tokenHash, cap));
  }
  #recordAuthorCopyCommand(tokenHash, prior, op, target, action) {
    const actor = this.authorCopyAccess(tokenHash); if (actor.epoch !== prior.epoch) { fail(401, 'SESSION_INVALID'); }
    this.contentKey(actor.id, op.key, 'command');
    if (action === 'run') { this.authorCopies.query(tokenHash, target); }
    else {
      const targetRow = this.one('SELECT game_id FROM copy_requests WHERE actor=? AND op_key=?', actor.id, target);
      if (!targetRow) { fail(409, 'COPY_CHANGED'); }
      this.games.assertNotDeleting(targetRow.game_id);
    }
    const old = this.one('SELECT * FROM copy_http_commands WHERE actor=? AND op_key=?', actor.id, op.key);
    if (old && old.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (old && old.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
    if (!old) { this.sql.exec('INSERT INTO copy_http_commands VALUES(?,?,?,?)', actor.id, op.key, op.digest, actor.epoch); }
    this.commandTargets.record('copy', actor.id, op.key, target);
  }
  async operation(request, value, actor, epoch, policy) {
    const key = request.headers.get('Idempotency-Key'); if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    const digest = await mac(JSON.stringify([request.method, requestURL(request).pathname, value]), policy.secret);
    return { actor, key, digest, epoch, aad: JSON.stringify([actor, key, digest]) };
  }
  async replay(op, policy) {
    const row = this.one('SELECT * FROM operations WHERE actor=? AND op_key=?', op.actor, op.key); if (!row) { return null; }
    if (row.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (row.epoch !== op.epoch || Date.now() >= row.expires_at) { fail(409, 'OPERATION_EXPIRED'); }
    return unseal(row.sealed_result, policy.secret, op.aad);
  }
  canCommit(op) {
    this.contentKey(op.actor, op.key, 'auth');
    const row = this.one('SELECT * FROM operations WHERE actor=? AND op_key=?', op.actor, op.key); if (!row) { return true; }
    const actor = this.one('SELECT epoch,disabled FROM users WHERE id=?', op.actor);
    if (row.request_digest !== op.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    if (!actor || actor.disabled || row.epoch !== actor.epoch || Date.now() >= row.expires_at) { fail(409, 'OPERATION_EXPIRED'); }
    return false; // Same operation won during an await; replay its sealed response without a second mutation.
  }
  remember(op, sealed, policy) { this.sql.exec('INSERT INTO operations VALUES(?,?,?,?,?,?)', op.actor, op.key, op.digest, sealed, op.epoch, Date.now() + policy.sessionMs); }
};
}
export function createEditorGateway({ frozenPublication = false } = {}) {
  if (typeof frozenPublication !== 'boolean') { throw new TypeError('trusted frozen publication flag required'); }
  return {
  async fetch(request, env) {
    const url = requestURL(request);
    if (frozenPublication && request.method === 'GET' && (url.pathname === '/play' || isLegacyPlayRoute(request.method, url.pathname))) { return response({ error: 'PLAY_READER_REQUIRED' }, 503); }
    // Play domain serves the shell only; /api/* play routes are gated in the DO.
    if (playOriginOf(env) !== null && url.origin === playOriginOf(env) && request.method === 'GET' && !url.pathname.startsWith('/api/') && url.pathname !== '/play' && !url.pathname.startsWith('/content/builtin/compiled/')) { return response({ error: 'NOT_FOUND' }, 404); }
    if (request.method === 'GET' && url.pathname === '/play') {
      // Anonymous play shell: fixed same-origin base for document-relative engine resources.
      // Only this shell allows its generated base; Trial/management retain base-uri 'none'.
      return new Response(playAppPage, { headers: { ...trialHeaders, 'Content-Security-Policy': trialHeaders['Content-Security-Policy'].replace("base-uri 'none'", "base-uri 'self'"), 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (request.method === 'GET' && ['/', '/client.js', '/draft.js', '/stage.js', '/library.js', '/catalog.js', '/management.js', '/publish.js', '/review.js', '/stronghold.js', '/general.js', '/mapview.js', '/stage-assets.js', '/style.css', '/shell-ui.js', '/shell-ui.css', '/shell-ui-licenses.txt'].includes(url.pathname)) {
      const asset = staticAsset(url.pathname);
      return new Response(asset.content, { headers: { ...headers, 'Content-Type': `${asset.type}; charset=utf-8` } });
    }
    // Anonymous season-visual art for play manifests resolves registry-
    // relative against /play; only the DO serves it (role-checked, task 4).
    if (!url.pathname.startsWith('/api/') && !(request.method === 'GET' && url.pathname.startsWith('/content/builtin/compiled/'))) { return response({ error: 'NOT_FOUND' }, 404); }
    // CF supplies this header at the ingress. Never accept caller-selected X-Editor-Source.
    // Capture bounded POST input before the DO RPC. Early authorization rejection must
    // not abandon a still-streaming RPC request and truncate the HTTP error response.
    try {
      const captured = request.method === 'POST' ? JSON.stringify(await body(request)) : undefined;
      const forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: captured });
      forwarded.headers.delete('Content-Length');
      forwarded.headers.set('X-Editor-Source', request.headers.get('CF-Connecting-IP') ?? 'local-shared');
      return await env.EDITOR_METADATA.get(env.EDITOR_METADATA.idFromName('editor-authority-v1')).fetch(forwarded);
    } catch (error) { return errorResponse(error); }
  }
};
}
export default createEditorGateway();
