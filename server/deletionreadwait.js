// Internal current-instance authorized byte-read invocation waiting only.
// Returned/rejected/cancelled calls are NOT proof of native/body/legacy drain.
import { ImmutableBlobStore } from './blobs.js';
import { GameDeletionValidatedFreeze } from './deletionvalidatedfreeze.js';
import { fields } from './security.js';
export class GameDeletionReadWait {
 #freeze;#wait;#timeout;
 constructor({storage,principal,requestKey,blobs,timeoutMs=5000}) {
  if(!(blobs instanceof ImmutableBlobStore))throw new TypeError('actual Root BlobStore required');
  ImmutableBlobStore.prototype.assertReadStorage.call(blobs,storage);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new TypeError('finite engineering wait budget required');
  this.#freeze=new GameDeletionValidatedFreeze({storage,principal,requestKey});
  this.#wait=ImmutableBlobStore.prototype.waitCurrentReadCalls.bind(blobs);this.#timeout=timeoutMs;
 }
 async wait(tokenHash,input) {
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input,target=Object.freeze({gameId,expectedRowRevision});
  const current=()=>this.#freeze.freeze(tokenHash,target);
  current();const readsWaited=await this.#wait(gameId,{timeoutMs:this.#timeout,assertCurrent:current});
  const after=current();
  return Object.freeze({gameId,rowRevision:after.rowRevision,readsWaited,bodyDrainVerified:false,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_INSTANCE_REGISTERED_READ_CALLS_RETURNED_BODY_DRAIN_UNKNOWN'});
 }
}
