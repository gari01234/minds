// Window connector: a remote MCP server that lets Claude (or ChatGPT) work inside Gari's Window.
// Auth: OAuth 2.1 through Supabase Auth's OAuth server. The access token is a Supabase JWT for
// the signed-in owner, so every query below runs under Row Level Security as that user.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createMcpHandler,McpServer} from "npm:@modelcontextprotocol/server@2.2.0";
import * as z from "npm:zod@4.6.5";
import {createWindowTools,ToolError} from "../_shared/window-tools.mjs";
import {createAkteTools,ARBEITSWEISE_BEREICHE} from "../_shared/window-akte.mjs";
import {AKTE_SKILLS,AKTE_SKILL_PREFIX,akteSkillMessage} from "../_shared/akte-skills.mjs";

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
- If Gari explicitly said how he wants to work (e.g. "mándame siempre primero un borrador corto"), pass it as arbeitsweise in close_session, in Spanish and in his words. Never infer personality or anything sensitive.
- open_project lists entries waiting for Gari (offen_zu_bestaetigen, vorgeschlagene_aufgaben, widersprueche, found by Isabella's nightly Akte-Pflege). Mention them briefly at the start; Gari confirms them in Window.
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
      verlauf:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string()})).max(30).optional(),
      arbeitsweise:z.array(z.object({aussage:z.string().describe("In Spanish, Gari's own words: how he wants Claude/Isabella to work with him"),bereich:z.enum(ARBEITSWEISE_BEREICHE as [string,...string[]]).optional(),zitat:z.string().optional().describe("What Gari literally said")})).max(5).optional()
        .describe("Only what Gari explicitly said about how he wants to work. Becomes a proposal he confirms in Window.")}),annotations:WRITE},run(a=>akte.closeSession(a)));
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

  // One-click starters in Claude's "+" menu → Window. They come from the shared Projektakte skill library;
  // if Gari installed the pack in Window and edited a skill there, his version is used.
  for(const skill of AKTE_SKILLS){
    const shape:Record<string,any>={};
    for(const arg of skill.args)shape[arg.name]=arg.optional?z.string().optional():z.string();
    server.registerPrompt(skill.prompt,{title:skill.name,description:skill.description,argsSchema:z.object(shape)},
      async(args:any)=>{
        let override=null;try{override=await akte.personalSkill(AKTE_SKILL_PREFIX+skill.slug)}catch{}
        return prompt(akteSkillMessage(skill,args,override));
      });
  }
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
