// Who carries each task (Work team), so «¿es todo para mí?» has an answer. 08.11.2026: the agenda Isabella
// reads had no assignees and she told Gari none were recorded, while Work showed Yvonne and Antonia.
// Sources: the task's assignee text, its main person and the team assignees (minds_work_task_assignees).
// Best effort: without them the agenda still answers. With a service client pass userId.
/** @param {any} sb @param {any[]} rows tasks with id, assignee, assignee_person_id @param {{userId?:string}} [o]
 * @returns {Promise<Map<string,string[]>>} */
export async function taskResponsibles(sb,rows,{userId}={}){
  const out=new Map();
  try{
    const list=Array.isArray(rows)?rows:[];
    const ids=list.map(r=>r&&r.id).filter(Boolean).slice(0,200);
    if(!sb||!ids.length)return out;
    let aq=sb.from('minds_work_task_assignees').select('task_id,person_id').in('task_id',ids);
    let pq=sb.from('isabella_people').select('id,name').limit(200);
    if(userId){aq=aq.eq('user_id',userId);pq=pq.eq('user_id',userId)}
    const [assignees,people]=await Promise.all([aq,pq]);
    const names=new Map((people&&people.data||[]).map(p=>[String(p.id),String(p.name||'').trim()]));
    const add=(task,name)=>{const n=String(name||'').trim();if(!n)return;const l=out.get(task)||[];if(!l.includes(n))l.push(n);out.set(task,l)};
    for(const r of list){if(r.assignee)add(String(r.id),r.assignee);if(r.assignee_person_id)add(String(r.id),names.get(String(r.assignee_person_id)))}
    for(const a of (assignees&&assignees.data||[]))add(String(a.task_id),names.get(String(a.person_id)));
  }catch{/* the agenda answers without them */}
  return out;
}
/** The field the model sees: only when someone is assigned. @param {Map<string,string[]>} map @param {any} row */
export const responsibleField=(map,row)=>{const l=map.get(String(row&&row.id));return l&&l.length?{responsable:l}:{}};
