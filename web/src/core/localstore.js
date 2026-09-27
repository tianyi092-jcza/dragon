// Default composition and compatibility facade. The App can inject a repository
// without coupling game snapshot/admission rules to IndexedDB.
import { createSaveRepository } from './saverepository.js';
import { createIndexedDbSaveBackend } from './indexeddbsavebackend.js';
export { emptySaveSlots } from './saverepository.js';

export const localSaveRepository = createSaveRepository(createIndexedDbSaveBackend());
export const loadLocalSaveSlots = () => localSaveRepository.load();
export const saveLocalSaveSlots = (saves) => localSaveRepository.save(saves);
