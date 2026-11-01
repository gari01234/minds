// Window connector: a remote MCP server that lets Claude (or ChatGPT) work inside Gari's Window.
// Auth: OAuth 2.1 through Supabase Auth's OAuth server. The access token is a Supabase JWT for
// the signed-in owner, so every query below runs under Row Level Security as that user.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createMcpHandler,McpServer} from "npm:@modelcontextprotocol/server@2.2.0";
import * as z from "npm:zod@4.6.5";
import {createWindowTools,ToolError} from "../_shared/window-tools.mjs";

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

const INSTRUCTIONS=`Window is Gari's personal work environment (formerly MINDS): his architecture projects (for example Bernried and Schwarz), each with a Work desktop of folders and files with extracted text, project memory, open tasks, people, and Work threads; plus his task list and calendar.
How to work with it:
- Answer Gari in Spanish unless he writes in another language.
- When a conversation is about a project, call project_context first, then search_files / read_file before stating anything about documents. Cite file names. Never invent files, dates, or decisions.
- Tasks and calendar: use list_tasks and list_events; dates are Europe/Berlin.
- create_task and update_task change Gari's real task list. Do it when he asks; for anything he did not explicitly ask for, propose first.
- Threads are shared with Window: a thread may already contain earlier work with Isabella. Read it with read_thread before continuing it.
- When a substantial piece of work is done, or when Gari asks, save it with save_to_thread: the key questions and your answers, condensed but complete enough to resume later, plus a short summary. Save to the thread he names, or propose a title.`;

const text=(value:unknown)=>({content:[{type:"text" as const,text:typeof value==="string"?value:JSON.stringify(value)}]});
const READ={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
const WRITE={readOnlyHint:false,destructiveHint:false,openWorldHint:false};

function buildServer(tools:ReturnType<typeof createWindowTools>){
  const server=new McpServer({name:"Window",version:"1.0.0"},{instructions:INSTRUCTIONS});
  const run=(fn:(args:any)=>Promise<unknown>)=>async(args:any)=>{
    try{return text(await fn(args||{}))}
    catch(e){
      if(e instanceof ToolError)return {...text(e.message),isError:true};
      console.error("window_tool_failed",e instanceof Error?e.message:String(e));
      return {...text("Window no pudo completar esta operación. Inténtalo de nuevo en un momento."),isError:true};
    }
  };
  server.registerTool("overview",{title:"Resumen de hoy",description:"Today in Window: open tasks due today or overdue (including multi-day tasks in progress), events today and tomorrow, projects, and recently active threads. A good first call when Gari asks what is on his plate.",inputSchema:z.object({}),annotations:READ},run(()=>tools.overview()));
  server.registerTool("list_projects",{title:"Proyectos",description:"List Gari's active projects in Window.",inputSchema:z.object({}),annotations:READ},run(()=>tools.listProjects()));
  server.registerTool("project_context",{title:"Contexto del proyecto",description:"Everything Window knows about one project: buckets, open tasks, desktop folders and files (with file ids), people, project memory (facts, decisions, open questions), claims extracted from documents, and active threads.",
    inputSchema:z.object({project:z.string().describe("Project name or id, e.g. 'Bernried'")}),annotations:READ},run(a=>tools.projectContext(a)));
  server.registerTool("search_files",{title:"Buscar en el escritorio",description:"Full-text search across the extracted text of desktop files (PDFs, Word, Excel, emails). Returns snippets with file ids; also lists files whose name matches. Use German or Spanish terms as they appear in the documents.",
    inputSchema:z.object({query:z.string().describe("Words to search for"),project:z.string().optional().describe("Limit to one project"),limit:z.number().int().min(1).max(30).optional()}),annotations:READ},run(a=>tools.searchFiles(a)));
  server.registerTool("read_file",{title:"Leer archivo",description:"Read the extracted text of a desktop file by file_id. Long files are paged: pass from_segment from the previous result's more.next_from_segment.",
    inputSchema:z.object({file_id:z.string(),from_segment:z.number().int().min(0).optional(),max_chars:z.number().int().min(2000).max(60000).optional()}),annotations:READ},run(a=>tools.readFile(a)));
  server.registerTool("list_tasks",{title:"Tareas",description:"Gari's tasks. range: 'today' (due today, overdue, or multi-day in progress), 'week' (next 7 days), 'open' (all open), 'done_recent' (completed in the last 14 days). Optional project and title filter.",
    inputSchema:z.object({range:z.enum(["today","week","open","done_recent"]).optional(),project:z.string().optional(),query:z.string().optional(),limit:z.number().int().min(1).max(200).optional()}),annotations:READ},run(a=>tools.listTasks(a)));
  server.registerTool("list_events",{title:"Calendario",description:"Calendar events between from and to (YYYY-MM-DD, Europe/Berlin). Defaults to the next 7 days.",
    inputSchema:z.object({from:z.string().optional(),to:z.string().optional()}),annotations:READ},run(a=>tools.listEvents(a)));
  server.registerTool("list_threads",{title:"Threads del proyecto",description:"Active Work threads of a project, with summaries.",
    inputSchema:z.object({project:z.string()}),annotations:READ},run(a=>tools.listThreads(a)));
  server.registerTool("read_thread",{title:"Leer thread",description:"Read a Work thread's recent messages (from Gari, Isabella, or Claude) to continue it.",
    inputSchema:z.object({thread_id:z.string(),limit:z.number().int().min(1).max(120).optional()}),annotations:READ},run(a=>tools.readThread(a)));
  server.registerTool("create_task",{title:"Crear tarea",description:"Create a task in Gari's Window task list. Dates YYYY-MM-DD; start_date makes it a multi-day task.",
    inputSchema:z.object({title:z.string(),project:z.string().optional(),due_date:z.string().optional(),start_date:z.string().optional(),notes:z.string().optional()}),annotations:WRITE},run(a=>tools.createTask(a)));
  server.registerTool("update_task",{title:"Actualizar tarea",description:"Change a task's title, dates, or notes, or mark it done/undone. Pass only the fields to change; use null to clear a date.",
    inputSchema:z.object({task_id:z.string(),title:z.string().optional(),due_date:z.string().nullable().optional(),start_date:z.string().nullable().optional(),notes:z.string().optional(),done:z.boolean().optional()}),annotations:WRITE},run(a=>tools.updateTask(a)));
  server.registerTool("save_to_thread",{title:"Guardar en un thread",description:"Save this conversation into a Window Work thread so it is part of the project record and Isabella can see it. Use thread_id to continue an existing thread, or project + thread_title to find or create one. entries are the messages to store in order (role 'user' for Gari, 'assistant' for you); summary replaces the thread summary.",
    inputSchema:z.object({project:z.string().optional(),thread_id:z.string().optional(),thread_title:z.string().optional(),
      entries:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string()})).max(40).optional(),summary:z.string().optional()}),annotations:WRITE},run(a=>tools.saveToThread(a)));
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
  const handler=createMcpHandler(()=>buildServer(tools));
  const res=await handler.fetch(req);
  const headers=new Headers(res.headers);for(const [k,v] of Object.entries(CORS))headers.set(k,v);
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
});
