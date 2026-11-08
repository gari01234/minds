# Romy · Fase 1 · Inventario de RPC del motor (metadatos, sin datos)

Extraído el 08.11.2026 mediante consulta de solo lectura al catálogo de funciones de Window y contrastado con las firmas disponibles en Office. No incluye cuerpos SQL, secretos ni registros. La presencia en el catálogo no equivale a permiso seguro para usar la función en Office.

Superficie inspeccionada: 50 nombres referenciados; 50 encontrados en Window, 2 ya existentes en Office, 48 pendientes. Las funciones `SECURITY DEFINER` requieren auditoría de identidad y ámbito antes de conceder `EXECUTE`; los RPC con acceso a otras áreas de Window no se trasplantan automáticamente.

| RPC | Office | SECURITY DEFINER en Window | Firma Window |
| --- | --- | --- | --- |
| `claim_due_isabella_routines` | pendiente | no | `p_limit integer` |
| `isabella_entity_recall` | pendiente | no | `p_query text, p_limit integer` |
| `isabella_recall_scoped` | pendiente | no | `p_query text, p_scope_key text, p_allow_cross_scope boolean, p_limit integer` |
| `isabella_semantic_recall_scoped` | pendiente | no | `p_embedding vector, p_scope_key text, p_allow_cross_scope boolean, p_limit integer` |
| `minds_admit_shadow_decision` | pendiente | sí | `p_user uuid, p_request_id uuid, p_action text, p_candidate jsonb, p_context jsonb` |
| `minds_append_commitment_workspace_item` | pendiente | sí | `p_workspace_id uuid, p_kind text, p_content text, p_provenance_class text, p_source_kind text, p_source_ref text, p_metadata jsonb` |
| `minds_apply_mission_step_v2` | pendiente | sí | `p_run_id uuid, p_lease_token uuid, p_result jsonb` |
| `minds_claim_delivery_intents` | pendiente | sí | `p_limit integer` |
| `minds_claim_mission_runs` | pendiente | sí | `p_limit integer` |
| `minds_claim_work_ingest` | pendiente | sí | `p_limit integer` |
| `minds_commit_direct_calendar_create_v01` | pendiente | sí | `p_request_id uuid, p_candidate jsonb` |
| `minds_commit_project_source_comparison` | pendiente | no | `p_user_id uuid, p_project_id uuid, p_ingestion_id uuid, p_baseline_revision_id uuid, p_baseline_fingerprint text, p_model text, p_coverage jsonb, p_items jsonb` |
| `minds_commit_project_source_extraction` | pendiente | no | `p_user_id uuid, p_project_id uuid, p_file_id uuid, p_source_version text, p_model text, p_referents jsonb, p_claims jsonb` |
| `minds_commit_work_source_segments` | pendiente | no | `p_user_id uuid, p_project_id uuid, p_file_id uuid, p_source_version text, p_extractor text, p_coverage text, p_locator_class text, p_metadata jsonb, p_segments jsonb` |
| `minds_consume_attention_briefing` | pendiente | no | `p_user uuid, p_event_ids uuid[], p_delivery_id uuid` |
| `minds_deliver_routine` | pendiente | no | `p_delivery_id uuid` |
| `minds_ensure_commitment_workspace` | pendiente | sí | `p_commitment_id uuid` |
| `minds_ensure_work_thread_conversation` | ya existe | no | `p_thread_id uuid` |
| `minds_expire_prospective_memory` | pendiente | sí | `p_user uuid, p_now timestamp with time zone` |
| `minds_expire_review_items` | pendiente | sí | `p_user uuid, p_now timestamp with time zone` |
| `minds_fail_mission_step` | pendiente | sí | `p_run_id uuid, p_lease_token uuid, p_error text` |
| `minds_finalize_watch_fire` | pendiente | sí | `p_user uuid, p_watch uuid, p_check uuid, p_publication jsonb` |
| `minds_find_work_source_occurrences` | pendiente | no | `p_project_id uuid, p_terms text[], p_limit integer, p_offset integer, p_expected_fingerprint text` |
| `minds_finish_delivery_intent` | pendiente | sí | `p_intent_id uuid, p_lease_token uuid, p_results jsonb` |
| `minds_get_contextual_autonomy` | pendiente | sí | `` |
| `minds_heartbeat_users` | pendiente | no | `` |
| `minds_lock_conversation` | pendiente | no | `p_id uuid, p_token uuid` |
| `minds_mark_mission_notified` | pendiente | sí | `p_run_id uuid, p_event text` |
| `minds_project_model_snapshot` | pendiente | no | `p_project_id uuid` |
| `minds_propose_operating_model_hypothesis` | pendiente | sí | `p_dimension text, p_claim_type text, p_statement text, p_rationale text, p_source_kind text, p_source_ref text, p_evidence_note text` |
| `minds_publish_attention` | pendiente | no | `p_user uuid, p_candidate jsonb` |
| `minds_publish_heartbeat` | pendiente | no | `p_user uuid, p_candidate jsonb` |
| `minds_publish_project_model_revision_from_comparison` | pendiente | no | `p_user_id uuid, p_comparison_id uuid` |
| `minds_reactivate_mission_waits` | pendiente | sí | `p_limit integer` |
| `minds_read_task_origin_v01` | pendiente | no | `p_task_ref text` |
| `minds_recent_scoped_messages` | pendiente | no | `p_conversation_id uuid, p_scope_key text, p_limit integer` |
| `minds_reconcile_work_ingest` | pendiente | no | `p_limit integer, p_docling_ready boolean` |
| `minds_record_watch_check` | pendiente | sí | `p_user uuid, p_watch uuid, p_channel uuid, p_result jsonb` |
| `minds_rename_work_thread` | ya existe | no | `p_thread_id uuid, p_title text` |
| `minds_save_memory_checkpoint` | pendiente | no | `p_agent text, p_conversation_id uuid, p_message_ids uuid[], p_summary text, p_open_loops jsonb` |
| `minds_scoped_message_count` | pendiente | no | `p_conversation_id uuid, p_scope_key text` |
| `minds_search_work_source_segments` | pendiente | no | `p_project_id uuid, p_query text, p_limit integer` |
| `minds_start_mission_run_with_attention` | pendiente | sí | `p_workspace_id uuid, p_instruction text, p_request_id uuid, p_max_iterations integer, p_notify_mode text` |
| `minds_store_vapid_pair_if_absent` | pendiente | sí | `p_public text, p_private text` |
| `minds_undo_direct_calendar_batch_v01` | pendiente | sí | `p_items jsonb` |
| `minds_undo_direct_calendar_create_v01` | pendiente | sí | `p_request_id uuid, p_receipt_id uuid` |
| `minds_unlock_conversation` | pendiente | no | `p_id uuid, p_token uuid` |
| `minds_update_commitment_workspace_summary` | pendiente | sí | `p_workspace_id uuid, p_summary text` |
| `minds_validate_presence_reply_v01` | pendiente | no | `p_attention_id uuid, p_request_revision integer` |
| `minds_watch_capabilities` | pendiente | no | `` |

Estado: inventario, no implementación. No se aplicó migración ni cambió ningún permiso. Antes de la activación, las funciones invocadas por el motor deben tener paridad comprobada, con controles de propietario y membresía por proyecto. Cualquier función ausente es un bloqueo explícito para las rutas que la requieren.

## Conciliación posterior al inventario (08.11.2026)

El inventario anterior es el punto de partida, no una fotografía del código de Office ya migrado. El PR Office #57 incorpora las firmas necesarias del motor en los archivos `20261108211000` a `20261108212700`, con dos RPC ya disponibles del contrato Office. Los procedimientos de trabajo nocturno y Watches se verifican con PostgreSQL efímero y permisos `EXECUTE` denegados a `authenticated` salvo lectura explícita de capacidades personales. Así, 49 de los 50 nombres del catálogo están cubiertos por las migraciones y el esquema Office existente. La excepción deliberada es `minds_store_vapid_pair_if_absent`, que administra un secreto privado de push y no corresponde a Office sin push móvil. El despliegue del motor debe volver a verificar que ninguna ruta habilitada lo invoca.

Las firmas, permisos y efectos deben revisarse de nuevo frente al esquema definitivo antes de aplicar migraciones. Tests SQL en verde no demuestran todavía autorización de una sesión real ni paridad de negocio de la PWA. No se ha migrado ni desplegado nada.
