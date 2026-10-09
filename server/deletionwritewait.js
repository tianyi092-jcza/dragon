// Internal current-instance PUT waiting after SQL freeze. NOT all-writer/native drain or deletion permission.
import { PrivateWriteJournal } from './privatewrites.js';
import { GameDeletionValidatedFreeze } from './deletionvalidatedfreeze.js';
import { fail, fields } from './security.js';
export class GameDeletionWriteWait {
 #freeze;#wait;#timeout;
 constructor({storage,principal,requestKey,journal,timeoutMs=5000}) {
  if(!(journal instanceof PrivateWriteJournal))throw new TypeError('actual Root journal required');
  PrivateWriteJournal.prototype.assertStorage.call(journal,storage);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new TypeError('finite engineering wait budget required');
  this.#freeze=new GameDeletionValidatedFreeze({storage,principal,requestKey});
  this.#wait=PrivateWriteJournal.prototype.waitCurrentPuts.bind(journal);this.#timeout=timeoutMs;
 }
 async wait(tokenHash,input) {
  fields(input,['gameId','expectedRowRevision']);const {gameId,expectedRowRevision}=input,target=Object.freeze({gameId,expectedRowRevision});
  const current=()=>this.#freeze.freeze(tokenHash,target);
  current();const writesWaited=await this.#wait(gameId,{timeoutMs:this.#timeout,assertCurrent:current});
  const after=current();
  if(after.privateWritesPending!==0||after.privateWritesUncertain!==0)fail(503,'PRIVATE_WRITE_WAIT_UNKNOWN');
  return Object.freeze({gameId,rowRevision:after.rowRevision,writesWaited,privateWritesPending:0,privateWritesUncertain:0,nativeDrainVerified:false,deleteAllowed:false,mode:'CURRENT_INSTANCE_REGISTERED_PUTS_RETURNED_LEGACY_UNKNOWN'});
 }
}
