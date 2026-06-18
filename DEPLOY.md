# Deploy the demo (share a link with the business team)

This app is a fully static site (no backend), so it hosts for free on GitHub Pages and is safe
to share. It is built for static export already (`next.config.ts` has `output: "export"`), and a
GitHub Actions workflow is included that builds and publishes on every push.

## One-time setup

1. Create a new, empty GitHub repo, for example `saber-unified-demo` (public or private; Pages
   works on private repos with GitHub Pro/Team/Enterprise, otherwise make it public).
2. From this folder, push the code:

   ```bash
   cd Prototypes/transaction-api
   git init
   git add .
   git commit -m "Unified transaction demo"
   git branch -M main
   git remote add origin https://github.com/<your-user>/saber-unified-demo.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

That's it. The included workflow (`.github/workflows/deploy.yml`) runs on each push to `main`,
builds the static site with the correct subpath, and deploys it.

## The link to share

After the first workflow run finishes (Actions tab → the "Deploy demo to GitHub Pages" run), the
live URL appears in **Settings → Pages** and on the deploy job. It looks like:

```
https://<your-user>.github.io/<repo-name>/
```

Share that link. Every later `git push` to `main` updates it automatically.

## Notes

- The site uses the repo name as its base path automatically (the workflow sets `BASE_PATH`), so
  links and the logo resolve correctly under `/<repo-name>/`.
- It is internal and not production: no real keys, no real money, all numbers are illustrative.
- Run locally any time with `npm install && npm run dev` (no `BASE_PATH` needed locally).
