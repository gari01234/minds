# Isabella Presence

Thin native desktop shell de Build 80.

No es otra Isabella. La ventana observa el estado canónico de MINDS con una sesión normal de Supabase, representa trabajo/Attention Economy y abre la Isabella principal cuando hace falta conversar o decidir.

La UI vive en `ui/`. Tauri aporta ventana always-on-top, tray y lifecycle. El backend continúa siendo el Supabase productivo existente.

Para compilar localmente se necesita Rust 1.90+ y las dependencias de sistema de Tauri para la plataforma. Desde `src-tauri`, `cargo build` compila el cliente. No hay `service_role`, OpenAI key ni runtime propio en esta app.
