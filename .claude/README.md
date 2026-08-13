# Claude Code configuration

## `agents/` — the Agentic Product Studio team

37 subagents, committed deliberately rather than installed per-machine.

Claude Code discovers subagents from two places: `~/.claude/agents/` (your
machine, every project) and a repo's `.claude/agents/` (this project, any
machine). Only the second survives a fresh clone — which is what Claude Code on
the web does for every session. Committing them here is what makes the team
available from the browser and the Claude mobile app, not just a laptop where
someone ran an installer.

Project agents take precedence over user-level ones of the same name.

### Source of truth

These files are **generated**, not hand-maintained. They come from the
`agentic-product-studio` runbook roster in
[agency-agents](https://github.com/Revan620198/agency-agents):

```
strategy/runbooks.json  ->  roster (37 slugs, 8 groups)
strategy/runbooks/scenario-agentic-product-studio.md  ->  how the team operates
```

### Regenerate

Edit the roster upstream, then re-run from an agency-agents checkout:

```bash
./scripts/deploy-team.sh agentic-product-studio \
  --tool claude-code --path /path/to/orca/.claude/agents
```

Don't edit the agent files here directly — the next regeneration overwrites them.

### Also installing on your own machine

To get the same team in every local project (not just this repo):

```bash
./scripts/deploy-team.sh agentic-product-studio --tool claude-code
```

That writes to `~/.claude/agents/`. Restart Claude Code afterwards if the
directory didn't already exist — a running session won't detect a newly created
`agents` directory.
