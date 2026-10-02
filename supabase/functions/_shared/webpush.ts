import { generateVapidKeys } from "npm:@mmmike/web-push@1.3.0/vapid";

export const VAPID_SUBJECT = "https://gari01234.github.io/minds/";

export async function ensureVapidKeys(sb:any){
  const {data,error}=await sb.from("isabella_runtime_secrets")
    .select("key,value")
    .in("key",["push_vapid_public","push_vapid_private"]);
  if(error)throw new Error("vapid_read_failed:"+error.message);
  const map=new Map<string,string>((data||[]).map((row:any)=>[String(row.key),String(row.value||"")] as [string,string]));
  const existingPublic=map.get("push_vapid_public")||"";
  const existingPrivate=map.get("push_vapid_private")||"";
  if(existingPublic&&existingPrivate)return {publicKey:existingPublic,privateKey:existingPrivate};

  const generated=await generateVapidKeys();
  const {data:stored,error:storeError}=await sb.rpc("minds_store_vapid_pair_if_absent",{
    p_public:generated.publicKey,
    p_private:generated.privateKey
  });
  if(storeError)throw new Error("vapid_store_failed:"+storeError.message);
  if(!stored?.public_key||!stored?.private_key)throw new Error("vapid_pair_unavailable");
  return {publicKey:String(stored.public_key),privateKey:String(stored.private_key)};
}

function quotedSubject(title:string,prefix:string){
  const value=String(title||"").replace(prefix,"").trim();
  return value?"“"+value+"”":"esto";
}

export function humanPushBody(payload:any){
  const type=String(payload?.event_type||"");
  const title=String(payload?.title||"").trim();
  if(type==="mission_waiting_for_user")return "Necesito que decidas algo para poder seguir con "+quotedSubject(title,"Necesito tu decisión:")+".";
  if(type==="mission_completed")return "Terminé "+quotedSubject(title,"Mission terminada:")+".";
  if(type==="mission_failed")return "No pude terminar "+quotedSubject(title,"Mission detenida:")+". El progreso sigue guardado.";
  if(type==="upcoming_event")return title||"Tienes un evento próximo.";
  return title||"Hay algo que merece tu atención.";
}

export async function endpointHash(endpoint:string){
  const bytes=new TextEncoder().encode(endpoint);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
