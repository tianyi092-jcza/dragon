import { createApp, reactive } from 'vue';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/tag/style/css';
import Workbench from './Workbench.vue';
export { createAccountController } from './accounts.js';
export { createCopyController } from './copy.js';

// The shell receives display facts only, never CSRF tokens, passwords, source
// objects or live game state. Server permissions remain the authority.
export function mountWorkbench({ root, views, navigate, logout, accounts, draft, stageAssets, stageJobs, library, stronghold, mapview, catalog, generals, copy, publication, management, deletion }) {
  const state = reactive({ authenticated: false, mustChange: false, admin: false, account: '', view: null, busy: false, views });
  const accountsModel = reactive({ rows: [], loaded: false, stale: false, message: '', generation: 0 });
  const draftModel = reactive({ fields: {}, games: [], chapters: [], resources: [], context: null, locked: true });
  const stageAssetsModel = reactive({ loadDisabled: true, clearDisabled: true, context: '', message: '', summary: '', outputs: [], missing: [], unresolved: [] });
  const stageJobsModel = reactive({ purpose: 'data', locked: true, artifacts: [] });
  const libraryModel = reactive({ assets: [], missing: [], loadDisabled: true, filterDisabled: true, downloadDisabled: true, serial: 0 });
  const strongholdModel = reactive({ games: [], chapters: [], cities: [], locked: true, saveDisabled: true });
  const mapviewModel = reactive({games:[],lines:[],locked:true});
  const catalogModel = reactive({readDisabled:true,installDisabled:true,replayDisabled:true,forgetDisabled:true});
  const generalsModel = reactive({games:[],chapters:[],generals:[],factions:[],library:[],locked:true,saveDisabled:true});
  const copyModel = reactive({games:[],locked:true,createDisabled:true,runDisabled:true,cancelDisabled:true});
  const publicationModel = reactive({games:[],versions:[],locked:true,publishDisabled:true,readDisabled:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true});
  const managementModel = reactive({games:[],locked:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true});
  const deletionModel = reactive({games:[],admin:false,locked:true,queryDisabled:true,retryDisabled:true,forgetDisabled:true});
  const app = createApp(Workbench, { state, accountsModel, accounts, draftModel, draft, stageAssetsModel, stageAssets, stageJobsModel, stageJobs, libraryModel, library, strongholdModel, stronghold, mapviewModel, mapview, catalogModel, catalog, generalsModel, generals, copyModel, copy, publicationModel, publication, managementModel, management, deletionModel, deletion, navigate, logout });
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
    publication: model => Object.assign(publicationModel, model),
    management: model => Object.assign(managementModel, model),
    deletion: model => Object.assign(deletionModel, model),
    accountDirty: () => instance.accountDirty(),
    mapInputs: () => instance.mapInputs(),
    sync({ current, view, busy }) {
      Object.assign(state, {
        authenticated: Boolean(current), mustChange: Boolean(current?.user.mustChangePassword),
        admin: current?.user.role === 'admin', account: current?.user.account ?? '', view, busy,
      });
    },
  });
}
