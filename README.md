# ResolveOps AI

ResolveOps AI is a production-style incident response copilot. It turns noisy operational incident reports into a structured diagnosis, evidence-backed recommendations, an execution trace, and a human-approved action plan.

## Live demo

[Open ResolveOps AI](https://resolveops-ai-sanaullah.sanuallah.chatgpt.site)

## Why this project stands out

This is not a basic chatbot wrapper. The application demonstrates the engineering patterns used in real AI products:

- structured model outputs validated with Zod
- evidence-linked recommendations
- visible execution traces for observability
- prompt-injection defenses around untrusted incident text
- explicit human approval before operational actions
- persistent incident and audit history
- graceful demo-mode fallback when the model service is unavailable

## Product workflow

1. Create an incident with severity, service, title, and diagnostic context.
2. Run AI analysis to produce a diagnosis and recommended actions.
3. Inspect the evidence and execution trace behind the result.
4. Approve or reject the proposed action plan.
5. Review the decision in the audit history.

## Tech stack

- Next.js 16, React 19, and TypeScript
- Tailwind CSS and accessible UI components
- OpenAI Responses API with structured output
- Cloudflare Workers, D1, Drizzle ORM, and Vinext
- Zod validation

## Local development

Requirements: Node.js 22.13 or newer and pnpm 11.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Add your OpenAI API key to `.env.local`:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
```

Never commit `.env.local` or any API key.

## Quality checks

```bash
pnpm lint
pnpm build
```

## Architecture

The browser sends incident data to server routes. The server applies input boundaries, calls the OpenAI Responses API, validates the structured response, and stores incident and audit events in D1. The UI renders the result with evidence, traceability, and an approval gate.

## Security notes

- Incident text is always treated as untrusted data, not instructions.
- Model output is parsed and validated before use.
- API keys remain server-side.
- Operational recommendations require explicit human approval.
- The repository intentionally excludes local environment files and deployment secrets.

## License

This project is provided as a portfolio demonstration. Add a license before reusing it in another product.
