# commit_graph_hacks

**Turning the GitHub commit chart into a blank canvas for art.**

---

We are taught to treat the contribution graph as a scoreboard. Green squares become a measure of worth; streaks become identity. The graph was never meant for that—it was meant to show *when* and *how* a project was built. We turned it into a treadmill.

Productivity chasing is irrational. It optimizes for the *appearance* of work, not the work itself. It rewards consistency over depth, volume over meaning. The graph cannot measure a good idea, a hard decision, or a moment of clarity. It can only count commits. And yet we stare at it, we game it, we feel bad when it’s empty. We have handed a tiny grid of colored squares an outsized power over how we feel about our days.

This project exists to take you out of that moment. Not by hiding the graph or quitting GitHub, but by reclaiming it. What if the chart wasn’t a productivity dashboard? What if it was a canvas?

Here you’ll find tools to treat the commit history as a medium. Backfill dates, shape patterns, generate contributions that appear on the days you choose—so that the graph can express something other than “how much did I ship.” It can become a drawing. A message. A joke. A small act of art in a corner of the internet that was built to count.

The purpose is simple: to pull someone out of productivity chasing and into a moment of art appreciation. Yours or someone else’s. The grid is blank. You get to decide what it says.

---

## What’s in this repo

Utilities and scripts for shaping GitHub contribution activity: backfilled history, date-controlled commits, and reproducible patterns so the graph can be designed, not just accumulated.

### Regenerating the canvas

From repo root (e.g. after `git checkout --orphan temp && git rm -rf .`):

```bash
node generate_commits.js [--dry-run] [--seed=N] [--repo=/path/to/repo]
```

- `--seed=N` — reproducible random (which days, how many commits).
- `--repo=...` — run from outside the repo so the script isn’t removed by `git rm -rf .`.
- Then: `git branch -D main && git branch -m main && git push -f origin main`.
