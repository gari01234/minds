# Isabella Skills

Reusable workflows for Isabella.

These skills follow the Agent Skills convention: each skill lives in its own directory and has a `SKILL.md` manifest with a name, description and workflow instructions.

Runtime note: Isabella currently discovers the skill catalog from Supabase and loads the full instructions on demand through the `load_skill` tool. These files are the repository-side source/documentation mirror so the workflows remain versionable and portable. They can later be mounted as native OpenAI Agent Skills without changing their conceptual structure.
