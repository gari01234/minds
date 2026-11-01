// Window connector: a remote MCP server that lets Claude (or ChatGPT) work inside Gari's Window.
// Auth: OAuth 2.1 through Supabase Auth's OAuth server. The access token is a Supabase JWT for
// the signed-in owner, so every query below runs under Row Level Security as that user.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createMcpHandler,McpServer} from "npm:@modelcontextprotocol/server@2.2.0";
import * as z from "npm:zod@4.6.5";
import {createWindowTools,ToolError} from "../_shared/window-tools.mjs";
import {createAkteTools} from "../_shared/window-akte.mjs";

const SUPABASE_URL=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
// The public URL Gari pastes into Claude; the protected-resource metadata must repeat it exactly.
const RESOURCE=SUPABASE_URL+"/functions/v1/window-mcp";
const METADATA_URL=RESOURCE+"/.well-known/oauth-protected-resource";
const CORS:Record<string,string>={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers":"WWW-Authenticate, mcp-session-id, mcp-protocol-version"
};
function json(data:unknown,status=200,headers:Record<string,string>={}){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...CORS,...headers}});
}
function publishableKey(){
  let key=Deno.env.get("SUPABASE_ANON_KEY")||"";
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
  return key;
}
// A 401 with a resource_metadata pointer is what starts Claude's sign-in flow.
function unauthorized(error="invalid_token",description="Inicia sesión en Window para continuar."){
  return json({error,error_description:description},401,{"WWW-Authenticate":`Bearer resource_metadata="${METADATA_URL}", error="${error}"`});
}
export function protectedResourceMetadata(){
  return {resource:RESOURCE,authorization_servers:[SUPABASE_URL+"/auth/v1"],bearer_methods_supported:["header"],
    resource_name:"Window",resource_documentation:"https://gari01234.github.io/minds/isabella/"};
}

const INSTRUCTIONS=`Window is Gari's personal work environment: his architecture projects (e.g. Bernried, Schwarz), kept as a Projektakte, plus his tasks and calendar.
The Projektakte has three layers: (1) always at hand: a Projektsteckbrief per project and a Themenblatt per topic; (2) history: the topic thread; (3) archive: the Work desktop documents, searched just in time.
Language: talk to Gari in Spanish unless he writes otherwise. Everything you WRITE into Window (Themenblatt, decisions, deadlines, Steckbrief, filed documents' titles) is in German.
How to work:
- Start of a project conversation: open_project. Continuing a topic: open_topic (it matches names loosely; if unclear, ask Gari or propose a title, never guess).
- Before stating anything about documents: search, then fetch. Cite file names. Never invent files, dates or decisions.
- Topics are stable themes (Lichtplanung, Behinderungsanzeige, HLS & TWP…), not chat titles. Many Claude chats can feed one topic.
- When a piece of work is done, or Gari says "guárdalo"/"cierra": close_session with stand, entscheidungen (bestaetigt=true only for what Gari explicitly decided), offene_fragen, naechste_schritte, fristen. Show Gari in 3–5 lines what you are saving.
- E-mails or texts Gari pastes to keep: file_document (art "email", with von/an/datum/betreff), then point out deadlines and decisions you noticed and offer to record them.
- create_task / update_task change Gari's real task list: do it when he asks; otherwise propose.
- Keep tool calls lean: prefer open_topic over reading whole threads, and fetch only what you need.`;

const text=(value:unknown)=>({content:[{type:"text" as const,text:typeof value==="string"?value:JSON.stringify(value)}]});
const READ={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const WRITE={readOnlyHint:false,destructiveHint:false,openWorldHint:false};
const prompt=(t:string)=>({messages:[{role:"user" as const,content:{type:"text" as const,text:t}}]});

function buildServer(tools:ReturnType<typeof createWindowTools>,akte:ReturnType<typeof createAkteTools>){
  const server=new McpServer({name:"Window",version:"2.0.0"},{instructions:INSTRUCTIONS});
  const run=(fn:(args:any)=>Promise<unknown>)=>async(args:any)=>{
    try{return text(await fn(args||{}))}
    catch(e){
      if(e instanceof ToolError)return {...text(e.message),isError:true};
      console.error("window_tool_failed",e instanceof Error?e.message:String(e));
      return {...text("Window no pudo completar esta operación. Inténtalo de nuevo en un momento."),isError:true};
    }
  };
  const decision=z.object({text:z.string(),datum:z.string().optional().describe("YYYY-MM-DD"),quelle:z.string().optional().describe("Source: file name, page, meeting"),bestaetigt:z.boolean().optional().describe("true only if Gari explicitly decided it")});
  const frist=z.object({titel:z.string(),datum:z.string().describe("YYYY-MM-DD"),quelle:z.string().optional(),bestaetigt:z.boolean().optional()});
  server.registerTool("overview",{title:"Heute",description:"Today in Window: tasks due today or overdue (incl. multi-day tasks in progress), events today and tomorrow, projects, recently active topics.",inputSchema:z.object({}),annotations:READ},run(()=>tools.overview()));
  server.registerTool("open_project",{title:"Projekt öffnen",description:"Compact view of one project: Projektsteckbrief, topics with their one-line state, register (deadlines, recent decisions, items awaiting Gari's confirmation), tasks for the next 14 days, and a desktop summary (folders, newest files with ids). Call this first in a project conversation.",
    inputSchema:z.object({project:z.string().describe("Project name or id, e.g. 'Bernried'")}),annotations:READ},run(a=>akte.openProject(a)));
  server.registerTool("open_topic",{title:"Thema öffnen",description:"Open one topic of a project: its Themenblatt (state, decisions, open questions, next steps, key documents) and the latest history. Topic names match loosely; if no clear match it returns candidates.",
    inputSchema:z.object({project:z.string(),topic:z.string().describe("Topic name, e.g. 'Lichtplanung'")}),annotations:READ},run(a=>akte.openTopic(a)));
  server.registerTool("search",{title:"Suchen",description:"Search the Projektakte: document text on the desktop (PDFs, Word, Excel, e-mails), file names, topics, decisions, deadlines. Returns results with ids for fetch. Use the words as they appear in the documents (often German).",
    inputSchema:z.object({query:z.string(),project:z.string().optional(),limit:z.number().int().min(1).max(25).optional()}),annotations:READ},run(a=>akte.search(a)));
  server.registerTool("fetch",{title:"Abrufen",description:"Fetch one item by id from search or open_project: file:… (document text, paged; pass offset to continue), topic:… (Themenblatt and history), memo:… (decision, deadline or Steckbrief), folder:… (files in a desktop folder).",
    inputSchema:z.object({id:z.string(),offset:z.number().int().min(0).optional()}),annotations:READ},run(a=>akte.fetchItem(a)));
  server.registerTool("list_tasks",{title:"Aufgaben",description:"Gari's tasks. range: 'today', 'week', 'open', 'done_recent'. Optional project and title filter.",
    inputSchema:z.object({range:z.enum(["today","week","open","done_recent"]).optional(),project:z.string().optional(),query:z.string().optional(),limit:z.number().int().min(1).max(200).optional()}),annotations:READ},run(a=>tools.listTasks(a)));
  server.registerTool("list_events",{title:"Kalender",description:"Calendar events between from and to (YYYY-MM-DD, Europe/Berlin). Defaults to the next 7 days.",
    inputSchema:z.object({from:z.string().optional(),to:z.string().optional()}),annotations:READ},run(a=>tools.listEvents(a)));
  server.registerTool("create_task",{title:"Aufgabe anlegen",description:"Create a task in Gari's task list (title in German unless he wrote it otherwise). Dates YYYY-MM-DD; start_date makes it a multi-day task.",
    inputSchema:z.object({title:z.string(),project:z.string().optional(),due_date:z.string().optional(),start_date:z.string().optional(),notes:z.string().optional()}),annotations:WRITE},run(a=>tools.createTask(a)));
  server.registerTool("update_task",{title:"Aufgabe ändern",description:"Change a task's title, dates or notes, or mark it done/undone. Pass only fields to change; null clears a date.",
    inputSchema:z.object({task_id:z.string(),title:z.string().optional(),due_date:z.string().nullable().optional(),start_date:z.string().nullable().optional(),notes:z.string().optional(),done:z.boolean().optional()}),annotations:WRITE},run(a=>tools.updateTask(a)));
  server.registerTool("close_session",{title:"Sitzung abschließen",description:"Save the result of this work session into the topic's Themenblatt (in German): stand replaces the state; entscheidungen are added (and go to the project register, proposed unless bestaetigt); offene_fragen and naechste_schritte replace the previous lists; fristen go to the register. Also writes a handoff message into the topic thread. Optional verlauf stores key exchanges. If the topic does not exist, set neues_thema=true only after Gari agreed to the title.",
    inputSchema:z.object({project:z.string(),topic:z.string().optional(),topic_id:z.string().optional(),neues_thema:z.boolean().optional(),
      stand:z.string().describe("1–3 sentences in German: where the topic stands now"),entscheidungen:z.array(decision).max(20).optional(),
      offene_fragen:z.array(z.string()).max(20).optional(),naechste_schritte:z.array(z.string()).max(20).optional(),fristen:z.array(frist).max(10).optional(),
      dokumente:z.array(z.string()).max(20).optional().describe("Key document names"),
      verlauf:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string()})).max(30).optional()}),annotations:WRITE},run(a=>akte.closeSession(a)));
  server.registerTool("record_decision",{title:"Entscheidung/Frist eintragen",description:"Add one decision (art 'entscheidung') or deadline (art 'frist') to the project register, in German, with date and source. Proposed unless bestaetigt.",
    inputSchema:z.object({project:z.string(),titel:z.string(),art:z.enum(["entscheidung","frist"]).optional(),details:z.string().optional(),datum:z.string().optional(),quelle:z.string().optional(),thema:z.string().optional(),bestaetigt:z.boolean().optional()}),annotations:WRITE},run(a=>akte.recordDecision(a)));
  server.registerTool("file_document",{title:"Dokument ablegen",description:"File a text into the project desktop as a document (e-mail, note, letter, protocol). Duplicates are detected by content. E-mails go to 'Emails' unless ordner is given. Text extraction follows automatically.",
    inputSchema:z.object({project:z.string(),art:z.enum(["email","notiz","brief","protokoll","dokument"]).optional(),titel:z.string().optional(),inhalt:z.string(),von:z.string().optional(),an:z.string().optional(),
      datum:z.string().optional().describe("YYYY-MM-DD"),betreff:z.string().optional(),ordner:z.string().optional().describe("Folder path, e.g. 'Emails' or 'Korrespondenz/Bauherr'"),thema:z.string().optional()}),annotations:WRITE},run(a=>akte.fileDocument(a)));
  server.registerTool("update_project_brief",{title:"Projektsteckbrief aktualisieren",description:"Create or update the project's Steckbrief (German): phase, meilensteine [{datum,was}], beteiligte [{rolle,name}], prioritaeten, notizen. Only given fields change.",
    inputSchema:z.object({project:z.string(),phase:z.string().optional(),meilensteine:z.array(z.object({datum:z.string().optional(),was:z.string()})).max(30).optional(),
      beteiligte:z.array(z.object({rolle:z.string().optional(),name:z.string()})).max(30).optional(),prioritaeten:z.array(z.string()).max(15).optional(),notizen:z.string().optional()}),annotations:WRITE},run(a=>akte.updateProjectBrief(a)));
  server.registerTool("rename_topic",{title:"Thema umbenennen",description:"Rename a topic (thread) in Window.",
    inputSchema:z.object({topic_id:z.string(),titel:z.string()}),annotations:WRITE},run(a=>akte.renameTopic(a)));

  // One-click starters in Claude's "+" menu → Window.
  server.registerPrompt("thema_fortsetzen",{title:"Thema fortsetzen",description:"Retomar un tema de un proyecto en Window",argsSchema:z.object({projekt:z.string(),thema:z.string()})},
    ({projekt,thema}:any)=>prompt(`Retoma en Window el proyecto ${projekt}, tema «${thema}»: abre el tema (open_topic), resúmeme en 5 líneas dónde estamos y propón el siguiente paso.`));
  server.registerPrompt("sitzung_abschliessen",{title:"Sitzung abschließen",description:"Guardar el resultado de esta conversación en el Themenblatt",argsSchema:z.object({projekt:z.string(),thema:z.string().optional()})},
    ({projekt,thema}:any)=>prompt(`Cierra esta sesión en Window (proyecto ${projekt}${thema?`, tema «${thema}»`:''}): enséñame en 3–5 líneas lo que vas a guardar (Stand, Entscheidungen, offene Fragen, nächste Schritte, Fristen — en alemán) y, cuando te diga que sí, usa close_session. Marca como bestätigt solo lo que yo haya decidido explícitamente.`));
  server.registerPrompt("emails_ablegen",{title:"E-Mails ablegen",description:"Archivar correos en el escritorio del proyecto",argsSchema:z.object({projekt:z.string()})},
    ({projekt}:any)=>prompt(`Voy a pegarte uno o varios correos. Archívalos en el escritorio de ${projekt} en Window con file_document (art email, von, an, datum, betreff; un documento por correo). Después dime qué plazos, decisiones o tareas detectas y pregúntame cuáles registro.`));
  server.registerPrompt("jour_fixe_vorbereiten",{title:"Jour fixe vorbereiten",description:"Preparar la agenda de una reunión del proyecto",argsSchema:z.object({projekt:z.string(),termin:z.string().optional()})},
    ({projekt,termin}:any)=>prompt(`Prepara la agenda del Jour fixe de ${projekt}${termin?` (${termin})`:''}: usa open_project, los temas abiertos, las preguntas abiertas de los Themenblätter, los plazos del registro y los correos recientes del escritorio. Agenda en alemán, ordenada por prioridad, con quién debe aportar qué.`));
  server.registerPrompt("protokoll_erstellen",{title:"Protokoll erstellen",description:"Convertir notas de una reunión en protocolo, decisiones y tareas",argsSchema:z.object({projekt:z.string(),thema:z.string().optional()})},
    ({projekt,thema}:any)=>prompt(`Te paso mis notas de una reunión de ${projekt}${thema?` (tema «${thema}»)`:''}. Redacta el Protokoll en alemán (Teilnehmer, Punkte, Entscheidungen, Aufgaben mit Verantwortlichen und Terminen), archívalo con file_document (art protokoll) y propón qué decisiones, plazos y tareas registro.`));
  return server;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const path=new URL(req.url).pathname;
  if(path.endsWith("/.well-known/oauth-protected-resource"))return json(protectedResourceMetadata());
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return unauthorized("invalid_request","Window necesita que inicies sesión.");
  const key=publishableKey();
  if(!SUPABASE_URL||!key)return json({error:"server_not_configured"},503);
  const sb=createClient(SUPABASE_URL,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.auth.getUser(token);
  if(error||!data?.user)return unauthorized();
  const tools=createWindowTools({sb,userId:data.user.id});
  const akte=createAkteTools({sb,userId:data.user.id,base:tools});
  const handler=createMcpHandler(()=>buildServer(tools,akte));
  const res=await handler.fetch(req);
  const headers=new Headers(res.headers);for(const [k,v] of Object.entries(CORS))headers.set(k,v);
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
});
