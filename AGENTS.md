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

- Document analysis uses authenticated server functions, checks the assigned financier role and active profile on the server, and keeps AI results separate from document approval so extraction never validates a document.
- AI Gateway Responses uses request-local server-only SDK helpers, structured output and no automatic retries; provider access denials are persisted and block future analysis until access is restored.
