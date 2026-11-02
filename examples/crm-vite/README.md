# Morph CRM example (Vite + React)

The `crm` fixture's generated reports in a plain Vite app.

**Your own Supabase project:** copy `.env.example` to `.env`, fill in the URL and the anon key (never the service-role key), apply the fixture schema and the Morph migration, then `pnpm dev`.

**Local demo, no Supabase needed:** with the fixture Postgres running (`docker compose up -d` at the repo root) and `pnpm build` done, run `pnpm demo`. It copies the crm fixture into a throwaway database and replays every query as the user you pick (Thandi the manager, or Sipho and Ayesha the reps), so you can watch RLS change what each person sees. Add `?page=report&id=stuck-deals` or `?page=audit` to the URL for single pages.
