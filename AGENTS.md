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

- Home-screen installation uses a static manifest and raster icons only, without an app-shell service worker, to keep previews and updates safe.
- Authenticated access monitoring uses aggregated per-account daily counters and fixed page groups; only admins read totals, and no IPs, query strings or request contents are stored.
- App-owned account access counters are separate from Lovable visitor analytics; never emit duplicate visitor page-view events.
