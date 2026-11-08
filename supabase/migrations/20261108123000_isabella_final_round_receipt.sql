-- El propietario ya puede leer su comprobante durante 24 h. Solo el servidor escribe.
alter table public.minds_chat_stream_delivery_receipts
  add column if not exists final_delivery jsonb;
