// Trusted presentation I/O only. No session, RuntimeManifest or Rule authority.
import {createOwnedImageResources} from './ownedimages.js';
const ROLE = /^grf\/(?:ui\/icon-(?:empty|player|other)_city\.png|march_markers\/style_(?:0[0-9]|1[0-9]|2[0-3])_frame_[0-4]\.png|engage\/group_0_frame_[0-3]\.png)$(?![\s\S])/;
export function createMapImageResources(ports) {
  return createOwnedImageResources(ports,{role:ROLE,limit:127,prefix:'MAP_IMAGE'});
}
