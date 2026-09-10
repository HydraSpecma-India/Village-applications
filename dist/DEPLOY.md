# Redeploying village-applications

Your project is already live:

- **https://village-applications.vercel.app**
- Vercel team `hydra-specma`, project `village-applications` (`prj_bpuxAIjlYxNNHFYFnq7hgj2M01G3`)
- Deployed manually (no Git repository linked)

This folder is the new build, with the Rejection % clipping fixed.

```
dist/
  index.min.html   ← rename to index.html
  app.min.css
  app.min.js       ← this is the file that changed
  logo.jpg
```

## Redeploy — drag and drop

1. Rename `index.min.html` to `index.html`.
2. Open https://vercel.com/hydra-specma/village-applications
3. **Deployments → New deployment → Deploy without Git**, drag the folder in.
4. Promote it to production when it finishes.

Or from a terminal, in this folder:

```bash
mv index.min.html index.html
npx vercel --prod --scope hydra-specma
```

## Make future changes deploy themselves

Right now every change needs a manual upload. Connect a repository once and
that stops:

1. Create a GitHub repo, e.g. `village-applications`.
2. Put these four files in it (`index.min.html` renamed to `index.html`) and push.
3. Tell me the repo name — I will link it to the existing Vercel project, and
   from then on every push deploys automatically.

---

## What changed in this build

**Rejection % was cut off the exported PDF and image.**

The export sizes each page before capturing it, shrinking the table until every
column fits the sheet. That sizing step never ran: the page element carries
`min-height: 720px`, so `page.scrollHeight` was *always* at least the target
height, and the function returned early on its "already full" check before it
reached the width fitting.

Now the width is fitted first and unconditionally, and the content height is
measured with the `min-height` constraint temporarily removed, so the
grow-to-fill-the-page step works too.

---

## Supabase — already configured, nothing to do

| | |
|---|---|
| Project | `ollhtyeflpggdazrsqsq` (ManiSarathy121's Project) |
| URL | `https://ollhtyeflpggdazrsqsq.supabase.co` |
| Key in the page | publishable — safe to ship; access is enforced by row-level security |

Tables are prefixed `isd_` so they cannot clash with the IT-asset and petition
apps already in that project:

- `isd_users` — role (`admin` / `user`), assigned taluks, active flag
- `isd_invites` — emails an admin has authorised, consumed on first sign-in
- `isd_datasets` — latest upload per `(kind, taluk)`; re-uploading replaces it
- `isd-uploads` storage bucket — the original files, private

### First sign-in

1. Open the site, click **Set a password**.
2. Use `mani.sarathy121@gmail.com` — that address is seeded as **admin**.
3. The people icon in the header then manages users and stored files.

Anyone signing up with an address you have not added is created **inactive** and
sees nothing until you enable them.

If you want people to sign in without confirming their email first, turn
**Confirm email** off under *Authentication → Providers → Email* in Supabase.
