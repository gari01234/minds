import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "missing_openai_key" }, 500);

  try {
    const form = await req.formData();
    const input = form.get("file");
    if (!(input instanceof File)) return json({ error: "missing_audio_file" }, 400);
    if (input.size <= 0) return json({ error: "empty_audio_file" }, 400);
    if (input.size > 20 * 1024 * 1024) return json({ error: "audio_too_large" }, 413);

    const type = input.type || "audio/webm";
    const ext =
      type.includes("mp4") || type.includes("m4a") ? "m4a" :
      type.includes("ogg") ? "ogg" :
      type.includes("wav") ? "wav" : "webm";

    const openaiForm = new FormData();
    openaiForm.append("file", input, `isabella-voice.${ext}`);
    openaiForm.append("model", "gpt-4o-transcribe");
    openaiForm.append(
      "prompt",
      "Transcribe faithfully. The speaker may switch naturally between Spanish and German, including within the same sentence. Preserve German names, architectural terms, project names, times, dates and proper nouns exactly when possible. Do not translate."
    );
    openaiForm.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openaiForm
    });

    const payload = await response.json();
    if (!response.ok) {
      return json({
        error: "openai_transcription_error",
        status: response.status,
        detail: payload?.error?.message || "Transcription failed"
      }, 502);
    }

    return json({ text: String(payload?.text || "").trim() });
  } catch (error) {
    return json({ error: "transcription_failed", detail: String(error) }, 500);
  }
});