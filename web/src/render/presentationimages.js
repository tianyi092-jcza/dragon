// Fixed disaster/weather roles only. Caller ports cannot grant Root authority.
import {createOwnedImageResources} from './ownedimages.js';
const ROLE = /^grf\/(?:disaster\/(?:fire|riot)_frame_[0-7]\.png|weather\/cloud_frame_[0-7]\.png)$(?![\s\S])/;
export function createPresentationImageResources(ports) {
  return createOwnedImageResources(ports,{role:ROLE,limit:24,prefix:'PRESENTATION_IMAGE'});
}
