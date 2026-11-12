import { createApp, reactive } from 'vue';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/tag/style/css';
import 'element-plus/es/components/text/style/css';
import 'element-plus/es/components/link/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/overlay/style/css';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/checkbox-group/style/css';
import 'element-plus/es/components/select/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/form/style/css';
import 'element-plus/es/components/tooltip/style/css';
import 'element-plus/es/components/scrollbar/style/css';
import 'element-plus/es/components/progress/style/css';
import 'element-plus/es/components/popover/style/css';
import 'element-plus/es/components/loading/style/css';
import 'element-plus/es/components/pagination/style/css';
import './theme.css';
import Workbench from './Workbench.vue';
export { createAccountController } from './accounts.js';
export { createCopyController } from './copy.js';

// The shell receives display facts only, never CSRF tokens, passwords, source
// objects or live game state. Server permissions remain the authority.
export function mountWorkbench({ root, views, navigate, logout, accounts, draft, stageAssets, stageJobs, library, stronghold, mapview, catalog, generals, copy, fullCopy, publication, management, review, deletion }) {
  // The legacy page link belongs to the player. Detach it only in the editor;
  // do not override its theme variables or change the shared server asset.
  document.querySelector('link[rel="stylesheet"][href="/style.css"]')?.remove();
  // Dialogs/popovers are teleported outside the workbench root.
  Object.assign(document.body.style, { fontFamily: 'var(--el-font-family)', fontSize: 'var(--el-font-size-base)' });
  const state = reactive({ authenticated: false, mustChange: false, admin: false, account: '', view: null, busy: false, feedback: 'global', loading: false, views });
  const accountsModel = reactive({ rows: [], loaded: false, stale: false, message: '', generation: 0 });
  const draftModel = reactive({ fields: {}, games: [], chapters: [], resources: [], context: null, locked: true });
  const stageAssetsModel = reactive({ loadDisabled: true, clearDisabled: true, context: '', message: '', summary: '', outputs: [], missing: [], unresolved: [] });
  const stageJobsModel = reactive({ purpose: 'data', locked: true, artifacts: [] });
  const libraryModel = reactive({ assets: [], missing: [], loadDisabled: true, filterDisabled: true, downloadDisabled: true, serial: 0 });
  const strongholdModel = reactive({ games: [], chapters: [], cities: [], locked: true, saveDisabled: true });
  const mapviewModel = reactive({games:[],lines:[],locked:true});
  const catalogModel = reactive({categories:[],category:'portrait',filter:'',rows:[],total:0,loaded:false,message:'',loading:false});
  const generalsModel = reactive({games:[],chapters:[],generals:[],factions:[],library:[],locked:true,saveDisabled:true});
  const copyModel = reactive({name:'',introduction:'',games:[],locked:true,createDisabled:true,tracking:false,message:''});
  // B6 管理員「複製遊戲」：獨立控制器與模型，不與「新建遊戲」共用輸入或追蹤鍵。
  const fullCopyModel = reactive({visible:false,name:'',introduction:'',message:'',locked:true,createDisabled:true,tracking:false});
  const publicationModel = reactive({rows:[],locked:true,refreshDisabled:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true,operation:'',result:'',message:''});
  const managementModel = reactive({games:[],locked:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true});
  const reviewModel = reactive({ rows: [], message: '', result: '', locked: true, refreshDisabled: true, history: { gameId: null, loading: false, message: '', rows: [] } });
  const deletionModel = reactive({games:[],admin:false,locked:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true});
  const app = createApp(Workbench, { state, accountsModel, accounts, draftModel, draft, stageAssetsModel, stageAssets, stageJobsModel, stageJobs, libraryModel, library, strongholdModel, stronghold, mapviewModel, mapview, catalogModel, catalog, generalsModel, generals, copyModel, copy, fullCopyModel, fullCopy, publicationModel, publication, managementModel, management, reviewModel, review, deletionModel, deletion, navigate, logout });
  const instance = app.mount(root);
  return Object.freeze({
    accounts: model => Object.assign(accountsModel, model),
    draft: model => Object.assign(draftModel, model),
    stageAssets: model => Object.assign(stageAssetsModel, model),
    stageJobs: model => Object.assign(stageJobsModel, model),
    library: model => Object.assign(libraryModel, model),
    stronghold: model => Object.assign(strongholdModel, model),
    mapview: model => Object.assign(mapviewModel, model),
    catalog: model => Object.assign(catalogModel, model),
    generals: model => Object.assign(generalsModel, model),
    copy: model => Object.assign(copyModel, model),
    fullCopy: model => Object.assign(fullCopyModel, model),
    publication: model => Object.assign(publicationModel, model),
    management: model => Object.assign(managementModel, model),
    review: model => Object.assign(reviewModel, model),
    deletion: model => Object.assign(deletionModel, model),
    loading: value => { state.loading = value; },
    accountDirty: () => instance.accountDirty(),
    mapInputs: () => instance.mapInputs(),
    sync({ current, view, busy, feedback = 'global' }) {
      Object.assign(state, {
        authenticated: Boolean(current), mustChange: Boolean(current?.user.mustChangePassword),
        admin: current?.user.role === 'admin', account: current?.user.account ?? '', view, busy, feedback,
      });
    },
  });
}
