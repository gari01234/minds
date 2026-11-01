/* Window · OAuth consent for connectors (Claude, ChatGPT).
   Supabase Auth's OAuth 2.1 server sends the browser here with ?authorization_id=…
   We make sure Gari is signed in, show which app asks and where it will return, and approve or deny. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const sb=window.MINDS_SUPABASE;
const params=new URLSearchParams(location.search);
const authorizationId=params.get('authorization_id')||'';
const show=id=>{for(const s of ['loading','signin','consent','done'])$(s).hidden=s!==id};
const status=(text,isError=false)=>{const el=$('status');el.textContent=text||'';el.classList.toggle('error',!!isError)};
const errorText=e=>String(e?.message||e||'Error desconocido');
function go(url){
  try{const u=new URL(url);if(!/^https?:$/.test(u.protocol))throw new Error('redirect')}catch{status('La dirección de vuelta no es válida.',true);return}
  show('done');location.replace(url);
}
function hostOf(uri){try{return new URL(uri).host}catch{return ''}}
async function session(){const {data}=await sb.auth.getSession();return data?.session||null}

async function loadConsent(){
  show('loading');status('');
  const api=sb?.auth?.oauth;
  if(!api?.getAuthorizationDetails){show('done');$('doneTitle').textContent='No puedo completar la conexión';$('doneText').textContent='Esta versión del cliente de Supabase no admite el servidor OAuth. Recarga la página en unos minutos.';return}
  const {data,error}=await api.getAuthorizationDetails(authorizationId);
  if(error){show('done');$('doneTitle').textContent='La solicitud ya no es válida';$('doneText').textContent='Vuelve a la app e inicia la conexión otra vez. ('+errorText(error)+')';return}
  // Already approved earlier: Supabase hands back the redirect straight away.
  if(data?.redirect_url&&!data?.authorization_id){go(data.redirect_url);return}
  const client=data?.client||{};
  const name=client.name||client.client_name||data?.client_name||'Una aplicación';
  const redirect=data?.redirect_uri||client.redirect_uri||'';
  $('clientName').textContent=name;
  $('consentTitle').textContent='¿Conectar '+name+' con Window?';
  $('clientHost').textContent=redirect?'Volverá a: '+hostOf(redirect):'';
  const s=await session();
  $('account').textContent=s?.user?.email?'Cuenta: '+s.user.email:'';
  show('consent');
}
async function decide(approve){
  $('approve').disabled=$('deny').disabled=true;
  status(approve?'Conectando…':'Cancelando…');
  const api=sb.auth.oauth;
  const {data,error}=approve?await api.approveAuthorization(authorizationId):await api.denyAuthorization(authorizationId);
  if(error||!data?.redirect_url){$('approve').disabled=$('deny').disabled=false;status('No pude completar la respuesta: '+errorText(error||'sin dirección de vuelta'),true);return}
  go(data.redirect_url);
}
function signIn(){
  show('signin');
  $('sendCode').onclick=async()=>{
    const email=$('email').value.trim();
    if(!email){status('Escribe tu correo.',true);return}
    $('sendCode').disabled=true;status('Enviando código…');
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
    if(error){$('sendCode').disabled=false;status(errorText(error),true);return}
    $('email').disabled=true;$('codeStep').hidden=false;$('sendCode').hidden=true;$('verify').hidden=false;
    status('Revisa tu correo e introduce el código.');setTimeout(()=>$('code').focus(),50);
  };
  $('verify').onclick=async()=>{
    const email=$('email').value.trim(),token=$('code').value.trim();
    if(!/^\d{6,10}$/.test(token)){status('Introduce el código numérico completo.',true);return}
    $('verify').disabled=true;status('Verificando…');
    const {error}=await sb.auth.verifyOtp({email,token,type:'email'});
    if(error){$('verify').disabled=false;status(errorText(error),true);return}
    await loadConsent();
  };
}
async function start(){
  if(!sb){show('done');$('doneTitle').textContent='Window no está disponible';$('doneText').textContent='No se pudo cargar la conexión con Window. Recarga la página.';return}
  if(!/^[A-Za-z0-9_-]{8,200}$/.test(authorizationId)){show('done');$('doneTitle').textContent='Falta la solicitud de conexión';$('doneText').textContent='Abre esta página desde la app que quieres conectar (por ejemplo, Claude → Conectores).';return}
  $('approve').onclick=()=>void decide(true);
  $('deny').onclick=()=>void decide(false);
  try{(await session())?await loadConsent():signIn()}catch(e){status(errorText(e),true)}
}
void start();
})();
