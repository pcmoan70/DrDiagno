# Dr. Diagno: three feature ideas (design note, 2026-11-06)

Status: discussion only, nothing implemented. Raised by the user on 2026-11-06.

## 1. "Differential map": the pruned decision tree (Resident mode)

What the engine has: no explicit decision tree, but every disease is a set of HPO terms with
probabilities, every HPO term has ancestors up to 23 organ-system roots (nervous system, eye,
cardiovascular, ...), every test has `reveals` terms, and `fit()` already scores any disease
against the current findings (full-pool scan measured at ~140 ms).

Proposal: use the HPO hierarchy *as* the tree. Nodes are anonymised clusters of still-compatible
diseases, not disease names.
- Level 0: "Compatible diseases: 1,204 of 7,086" with a sparkline over the clock.
- Level 1: the organ-system roots as bars (count of compatible diseases that involve that system).
  Branches that drop to zero are drawn as cut (grey, struck through). Level 2 (one click deeper)
  only if level 1 proves too coarse in playtest.
- A disease is *cut* when a present finding is in its excluded list, or a pertinent negative hits a
  term it carries at p >= 0.9. Soft pruning (low fit) dims rather than cuts.
- After each test, a one-line "branch cut" toast: "Creatine kinase normal: 312 diseases ruled out."
  This is the feedback loop that makes ordering tests feel consequential.
- Hover/click on a branch lists the *tests* that discriminate it (from `reveals`), never the
  diseases. The map becomes a planning tool: "most of what's left is metabolic, order the metabolic
  screen".
Playability: shows progress without spoiling; makes pertinent negatives satisfying instead of
"Unremarkable." text. Leak risk is low (counts only). Keep it off in House tier where fog is the
point; optional in Attending.

## 2. Player-assigned probabilities in the differential

Risk to avoid: sliders that must sum to 100 and be edited after every action are a chore, and if
the engine's fit bars sit next to them the player just copies the bars.

Proposal: *confidence chips*. Ten chips; drag or click them onto candidates. Default placement
follows fit; the player's placement is remembered and shown as "your call" beside the chart's
fit. Empty candidates with zero chips are allowed (watch list).
Consequences, which is what makes it a game mechanic rather than decoration:
- Treat empirically acts on the candidate with most chips.
- Commit requires >= 5 chips on the chosen disease; committing with 10 chips scores more, being
  wrong with 10 chips ends the case, being wrong with 5 costs hours and stability but continues.
- Debrief gets a "confidence over time" chart: chips on the true answer per hour. The calibration
  bonus is the area under that curve (rewards early correct suspicion), capped so it never beats
  simply being fast.
In Attending/House hide the fit bars until a consult is paid for, so the chips carry real
information. In Resident show both.

## 3. Watch-along / free diagnosis mode

A screen with no patient, clock or score: the user types findings as they hear them ("fever",
"foot drop", "high calcium"), picks the matching HPO term, marks present/absent, and the engine
ranks all 7,086 diseases by fit, live, with the "why" line (which findings each explains, which it
cannot). Also useful as a study tool and as a public-facing demo.
Needed: HPO term search (we only search disease names today; term names and lay names are in
terms.json), reuse of `suggest()` over the full pool and of the differential renderer, a
"share this differential" URL encoding the term list. Must carry the not-medical-advice line
prominently. About a day of work; no data changes.

## Suggested order
3 first (smallest, immediately useful, reuses everything), then 1 (new feedback loop, needs the
cut rule and a bar chart), then 2 (touches scoring and commit rules, needs bot re-balancing and a
playtest).
