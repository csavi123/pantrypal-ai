<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All data access goes through the browser Supabase client with RLS; no createServerFn (owner's choice: AI lives in their own Supabase edge function).
- Signed-in pages live under src/routes/_authenticated/ (client-only gate in route.tsx); shared query definitions live in src/lib/queries.ts.
