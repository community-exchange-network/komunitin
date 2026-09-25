# Static generation

Production uses Quasar SSG to generate only `/` in English (`en-us`). The browser
replaces that content with the normal application, using the visitor's language
and session; it does not hydrate the static HTML. Other routes use `csr.html`.
The final auth boot awaits initial navigation before mounting, keeping the static
page visible while authentication and lazy-loaded route components resolve.
Deploy the whole `dist/ssg` directory with the Nginx configuration in `docker/`.
`pnpm dev` continues to use PWA mode without static generation.

Once the service worker controls the page, navigations use the cached application
shell directly, online or offline. First visits and crawlers receive the generated
root HTML from the server.

Run these commands from `app/` to build and test the application. `pnpm test`
also checks the generated page, styles, shell and service-worker manifest, so
it requires a production build for the current flavor:

```bash
pnpm build
pnpm test
```

The renderer removes Quasar's `data-server-rendered` body attribute to select normal
client mounting. Recheck that behavior when upgrading Quasar. Generation uses
build-time footer URLs; container runtime configuration takes effect when JS mounts.
