// The terminal Responses object still drives tools, usage, receipts and integrity.
export async function readModelRound(response, onDelta, textOnly = false) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  let final, pending = '', emitted = false;
  const phases = new Map();
  await readEvents(response.body, event => {
    if (event.type === 'response.output_item.added') phases.set(event.output_index, event.item?.phase);
    if (event.type === 'response.output_text.delta') {
      const phase = phases.get(event.output_index);
      if (phase === 'commentary') return;
      if (textOnly || phase === 'final_answer') {
        onDelta(event.delta);
        emitted = true;
      } else pending += event.delta;
    }
    if (['response.completed','response.incomplete','response.failed'].includes(event.type)) final = event.response;
    if (event.type === 'error') throw new Error('model_stream_failed');
  });
  if (!final) throw new Error('model_stream_interrupted');
  if (pending && !emitted && final.status === 'completed' && !final.output?.some(x => x.type === 'function_call')) onDelta(pending);
  return final;
}

async function readEvents(stream, consume) {
  if (!stream) throw new Error('empty_event_stream');
  const reader = stream.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const flush = () => {
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') consume(JSON.parse(data));
    }
  };
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value,{stream:true});
      flush();
    }
    buffer += decoder.decode()+'\n\n'; flush();
  } finally { reader.releaseLock(); }
}

/** @param {object} args @param {(emit: (delta:string)=>void)=>Promise<Response>} args.execute
 * @param {(terminal: any)=>Promise<void>} args.save @param {Record<string,string>} args.headers
 * @param {(task:Promise<void>)=>void} [args.keepAlive] */
export function finalRoundResponse({execute,save,headers,keepAlive}) {
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event, value) => {
        if (connected) try { controller.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(value)+'\n\n')); } catch { connected=false; }
      };
      const task = (async()=>{
        try {
          const response = await execute(delta=>{if(delta)send('delta',{text:delta})});
          const terminal = {status:response.status,body:await response.json()};
          // The turn already ran and the server already wrote its answer: a failed copy for recovery
          // must not turn a delivered result into an error (review of PR #310).
          try { await save(terminal); } catch { /* recovery falls back to the conversation itself */ }
          send(response.ok?'final':'error', terminal.body);
        } catch {
          send('error',{error:'final_round_unavailable',message:'No pude verificar el resultado. Comprueba el chat antes de repetir la petición.'});
        } finally { if(connected)controller.close(); }
      })();
      keepAlive?.(task);
    },
    cancel(){connected=false}
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
