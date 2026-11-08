// Profile-specific Office Terminplan adapter. No Office state is fetched in Window.
// Every query begins with the authenticated member's explicit project allocations.
import {addDays} from './window-tools.mjs';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const day=s=>typeof s==='string'&&DAY.test(s.slice(0,10))?s.slice(0,10):null;
const safe=s=>String(s??'').trim().slice(0,160);
export const OFFICE_TERMINPLAN_LIMITS=Object.freeze({projects:100,plans:150,milestones:40,windowDays:45});

/** Pure mapping, never a permission decision. The reader must first restrict plan rows
 * by project_ids resolved for the current user. */
export function officeMilestonesFromPlans(plans=[],projects=[],{from,to,limit=OFFICE_TERMINPLAN_LIMITS.milestones,query=''}={}){
  const names=new Map((Array.isArray(projects)?projects:[]).map(p=>[String(p.id),safe(p.name)]));
  const q=safe(query).toLocaleLowerCase('de-DE');
  const rows=[],seen=new Set();
  for(const plan of Array.isArray(plans)?plans:[]){
    if(plan?.is_archived===true||!names.has(String(plan?.project_id)))continue;
    for(const milestone of Array.isArray(plan?.state?.tasks)?plan.state.tasks:[]){
      if(milestone?.type!=='milestone')continue;
      const date=day(milestone.start||milestone.end),title=safe(milestone.name);
      if(!date||!title||(from&&date<from)||(to&&date>to))continue;
      const project=names.get(String(plan.project_id));
      if(q&&!(title+' '+project).toLocaleLowerCase('de-DE').includes(q))continue;
      const key=String(plan.id)+':'+String(milestone.id??title)+':'+date;
      if(seen.has(key))continue;
      seen.add(key);
      rows.push({id:key,project_id:plan.project_id,project:project,title,date,kind:'terminplan_milestone',source:'office_terminplan_instances'});
    }
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'de-DE'));
  return rows.slice(0,Math.max(0,Math.min(OFFICE_TERMINPLAN_LIMITS.milestones,Number(limit)||0)));
}

/** @param {any} sb Authenticated user-scoped Supabase client.
 * @param {{userId:string,from?:string,to?:string,query?:string,limit?:number}} opts */
export async function readOfficeTerminplanMilestones(sb,{userId,from,to,query='',limit=40}={}){
  if(!sb||!userId)return {status:'unavailable',milestones:[]};
  const lower=day(from)||day(new Date().toISOString()),upper=day(to)||addDays(lower,OFFICE_TERMINPLAN_LIMITS.windowDays);
  if(!lower||!upper||upper<lower)return {status:'invalid_range',milestones:[]};
  try{
    const member=await sb.from('office_project_members').select('project_id')
      .eq('user_id',userId).limit(OFFICE_TERMINPLAN_LIMITS.projects);
    if(member.error)return {status:'unavailable',milestones:[]};
    const ids=[...new Set((member.data||[]).map(x=>String(x.project_id)).filter(x=>/^[0-9a-f-]{36}$/i.test(x)))];
    if(!ids.length)return {status:'ok',milestones:[]};
    const [plans,projects]=await Promise.all([
      sb.from('office_terminplan_instances')
        .select('id,project_id,state,is_archived').eq('is_archived',false)
        .in('project_id',ids).limit(OFFICE_TERMINPLAN_LIMITS.plans),
      sb.from('office_projects').select('id,name').in('id',ids).limit(OFFICE_TERMINPLAN_LIMITS.projects)
    ]);
    if(plans.error||projects.error)return {status:'unavailable',milestones:[]};
    return {status:'ok',milestones:officeMilestonesFromPlans(plans.data||[],projects.data||[],{from:lower,to:upper,query,limit})};
  }catch{return {status:'unavailable',milestones:[]}}
}
