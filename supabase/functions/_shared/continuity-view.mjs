// Only live, bounded values leave the preferences table. Stored quotes are data.
export const continuityKeys=['isabella_estado','isabella_ayer'];
export function continuityView(rows,stamp=Date.now()){
  const value=key=>(rows||[]).find(r=>r.preference_key===key)?.value;
  const states=(value('isabella_estado')?.items||[]).filter(x=>x?.cita&&x.texto===x.cita&&Date.parse(x.expires_at)>stamp)
    .slice(-3).map(({cita,fecha})=>({cita,fecha}));
  const yesterday=value('isabella_ayer');
  return {...(states.length?{como_esta:states}:{}),...(yesterday?.resumen&&Date.parse(yesterday.expires_at)>stamp?
    {ayer:{fecha:yesterday.fecha,resumen:yesterday.resumen,abierto:yesterday.abierto||[]}}:{})};
}
