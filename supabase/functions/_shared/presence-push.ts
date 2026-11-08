// Window · the push banner for Isabella's own daily message (isabella-presence).
// Shared by the presence function (manual runs) and the heartbeat (every 15 minutes, pg_cron).
import {sendPushNotification} from "npm:@mmmike/web-push@1.3.0/send";
import {ensureVapidKeys,VAPID_SUBJECT} from "./webpush.ts";

// A short banner to Gari's devices; the message itself is in the chat.
export function presencePusher(sb:any){
  return async(userId:string,text:string,day:string)=>{
    const vapid=await ensureVapidKeys(sb);
    const {data:subs,error}=await sb.from("minds_push_subscriptions").select("id,endpoint,p256dh,auth_key")
      .eq("user_id",userId).eq("active",true).order("last_seen_at",{ascending:false}).limit(8);
    if(error)return {sent:0};
    let sent=0;
    for(const sub of subs||[]){
      try{
        const ok=await sendPushNotification({endpoint:String(sub.endpoint),keys:{p256dh:String(sub.p256dh),auth:String(sub.auth_key)}},
          {title:"Isabella",body:text.length>140?text.slice(0,139)+"…":text,url:"/minds/isabella/",tag:"presence-"+day},
          {publicKey:vapid.publicKey,privateKey:vapid.privateKey,subject:VAPID_SUBJECT},{ttl:4*3600,urgency:"normal"});
        if(ok)sent++;
      }catch{/* a gone device is cleaned up by the delivery runner */}
    }
    return {sent};
  };
}

