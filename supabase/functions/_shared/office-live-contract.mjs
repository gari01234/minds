// Profile-safe Live voice admission. This module has no credentials, network,
// browser globals, or side effects and is shared by the Window and Office broker.
import {resolveAssistantProfile,profileFirstName} from './assistant-profile.mjs';
export const WINDOW_LIVE_ORIGIN='https://gari01234.github.io';
export const OFFICE_LIVE_ORIGIN='https://tbarchitekten.github.io';
export function liveOriginAllowed(origin,profile='window'){
  const p=resolveAssistantProfile(profile);
  return origin===WINDOW_LIVE_ORIGIN ||
    (p.multi_user && origin===OFFICE_LIVE_ORIGIN);
}
export function liveCorsOrigin(origin,profile='window'){
  return liveOriginAllowed(origin,profile)?origin:null;
}
// The Office account is also selectable inside the Window browser shell.
// Origin is a CORS boundary, not an identity; both hosts still require an
// Office JWT, an active member row and completed initial password rotation.
export async function liveOwner(sb,userId,profile='window'){
  const p=resolveAssistantProfile(profile);
  if(!userId||!sb)return null;
  if(!p.multi_user)return p.owner_name;
  const {data,error}=await sb.from('office_members')
    .select('display_name,is_active,must_change_password')
    .eq('user_id',userId).maybeSingle();
  if(error||data?.is_active!==true||data.must_change_password!==false)
    return null;
  return profileFirstName(data.display_name);
}
export function liveOriginalVoiceAllowed(profile='window'){
  return !resolveAssistantProfile(profile).multi_user;
}
// Never turn a browser-authored transcript into a canonical agent statement.
// Office can persist owner speech; an agent reply must come from the actual
// canonical backend, not from client-supplied 'isabella'/'romy' text.
export function liveTranscriptAuthorAllowed(author,profile='window'){
  return !resolveAssistantProfile(profile).multi_user ||
    author==='gari'||author==='owner';
}
