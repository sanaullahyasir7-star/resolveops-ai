# ResolveOps AI

An incident-response workbench portfolio project by Sanaullah Yasir. It shows a transparent triage flow: report intake, evidence review, suggested next steps, reviewer decision, and an activity history.

## Open the portfolio app

[Launch ResolveOps AI on GitHub Pages](https://sanaullahyasir7-star.github.io/resolveops-ai/)

The Pages app is a zero-cost browser application. It includes curated example cases and a deterministic keyword-rule triage flow for incidents you add. **It does not use an AI model.** User-added reports and review decisions are kept in local browser storage on that device; they are not uploaded or synchronized. The UI and README label sample data and rule-based results clearly.

Never enter real customer information, credentials, security incidents, or production data. Suggested steps are prompts for human review, not operational advice. The app does not connect to monitoring tools or execute changes.

## Full-stack source

The repository also contains the full-stack source implementation built with React, TypeScript, Vinext, Cloudflare Workers and D1, Drizzle ORM, and the OpenAI Responses API. That server-backed version is **not what GitHub Pages runs**. It requires a trusted sign-in host, a provisioned D1 database, and server-side API secrets. The repository does not include credentials, and the source does not provide a general-purpose login system. Do not expose it publicly until those pieces are configured and reviewed.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

The local HTML portfolio app is `github-pages/index.html` and can also be opened directly in a browser. The full-stack app uses the configured framework runtime; its AI endpoint requires `OPENAI_API_KEY`, and database routes require the D1 binding plus trusted identity context. Never commit secrets.

## Checks

```bash
pnpm lint
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

GitHub Actions runs these checks on pushes and pull requests to `main`. GitHub Pages publishes only the `github-pages/` folder.

## Scope and limits

- The local triage logic is keyword-based and is not AI.
- Example incidents and service-health figures are illustrative, not measured.
- Source API routes validate inputs and model output, but this is not a production security review.
- Reviewer approval is recorded only; no external action is executed.
- There is no connected observability, ticketing, or incident-management provider.
- This project is not suitable for real incident response or sensitive data.

## License

No license has been added. All rights reserved unless the owner adds one.
