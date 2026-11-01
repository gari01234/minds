# Window connector (remote MCP)

Lets Claude (claude.ai web, desktop, mobile) — and later ChatGPT — work inside Window with Gari's own login.

- **Server**: `supabase/functions/window-mcp` (Streamable HTTP, stateless). Tool handlers in `supabase/functions/_shared/window-tools.mjs`.
- **URL to paste in Claude**: `https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/window-mcp`
- **Auth**: OAuth 2.1 via Supabase Auth's OAuth server. The MCP server answers `401` with
  `WWW-Authenticate: Bearer resource_metadata=".../window-mcp/.well-known/oauth-protected-resource"`;
  the metadata names `https://lodexwyyynlarkqgkyhy.supabase.co/auth/v1` as authorization server.
  Access tokens are Supabase JWTs for the owner, so every query runs under RLS as that user.
- **Consent page**: `apps/isabella/oauth-consent.html` → `https://gari01234.github.io/minds/isabella/oauth-consent.html`.

## Tools

| Tool | Kind | What it does |
| - | - | - |
| `overview` | read | Today: tasks due/overdue/in progress, events today+tomorrow, projects, recent threads |
| `list_projects` | read | Active projects |
| `project_context` | read | Buckets, open tasks, desktop folders/files (ids), project people, project memory, claims, threads |
| `search_files` | read | Full-text search in extracted file text (snippets + file ids) and file names |
| `read_file` | read | Extracted text of one file, paged by segment |
| `list_tasks` | read | `today` / `week` / `open` / `done_recent`, optional project and title filter |
| `list_events` | read | Calendar between two dates (Europe/Berlin) |
| `list_threads`, `read_thread` | read | Work threads and their messages (Gari / Isabella / Claude) |
| `create_task`, `update_task` | write | Real tasks; they sync to the PWA by `client_key` |
| `save_to_thread` | write | Store the exchange (and a summary) in a Work thread; replies are signed "Claude" in Window |

Out of scope by design: Isabella's personal chat history and personal memories.

## One-time setup

1. **Deploy**: GitHub → Actions → **Deploy Supabase Edge Functions** → Run workflow with `window-mcp`
   (needs the `SUPABASE_ACCESS_TOKEN` secret in the `supabase` environment). Equivalent CLI:
   `supabase functions deploy window-mcp --no-verify-jwt`. `config.toml` sets `verify_jwt = false`:
   the function must answer the unauthenticated `401` itself; the workflow checks that after deploying.
2. **Supabase dashboard → Authentication → URL Configuration**: Site URL `https://gari01234.github.io/minds/isabella`.
3. **Authentication → OAuth Server**: turn it on; Authorization Path `/oauth-consent.html`
   (Site URL + path must equal the consent page URL). Allow dynamic client registration, or create one
   client manually with redirect URI `https://claude.ai/api/mcp/auth_callback` and enter its Client ID in
   Claude's advanced settings.
4. **Claude → Settings → Connectors → Add custom connector**: name `Window`, the URL above → Connect →
   sign in if asked → **Permitir**.

## Revoking

Disconnect in Claude, or end the connector's sessions in Supabase (Authentication → Users → sessions).
Tokens carry the owner's full RLS privileges (Supabase OAuth has no scopes yet); the connector code is what
limits what Claude can see and do.
