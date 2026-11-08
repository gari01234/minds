// Project ingest admission for the Office profile only.
// A worker with service_role privileges must not process a file whose
// originating employee no longer belongs to that project. Default Window
// never imports or calls this module's check.
export async function officeIngestAuthorized(sb,job){
  if(!sb||!job?.project_id||!job?.user_id||!job?.file_id)return false;
  const [membership,owner,project,file]=await Promise.all([
    sb.from('office_project_members').select('project_id')
      .eq('project_id',job.project_id).eq('user_id',job.user_id).maybeSingle(),
    sb.from('office_members').select('is_active')
      .eq('user_id',job.user_id).maybeSingle(),
    sb.from('office_projects').select('status')
      .eq('id',job.project_id).maybeSingle(),
    sb.from('minds_work_files').select('id')
      .eq('id',job.file_id).eq('user_id',job.user_id)
      .eq('project_id',job.project_id).maybeSingle()
  ]);
  if([membership,owner,project,file].some(x=>x.error))return false;
  return membership.data?.project_id===job.project_id &&
    owner.data?.is_active===true &&
    project.data?.status==='aktiv' &&
    file.data?.id===job.file_id;
}
