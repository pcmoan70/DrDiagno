# Student mode (2026-11-06)

Goal: a tier for learners with extra help, plus two small UI asks from the same message.

Design
- Tier `student`: Resident disease pool, 96 h clock, same scoring (best score kept separately).
- Help: literature consults cost no time; a Coach panel in the Workup column suggests the three
  unordered studies that best split the diseases still fitting (balanced probe count); fit bars and
  "does not explain" always visible; differential map open; a wrong all-in diagnosis is treated as
  hedged (6 h, 20 stability, disease ruled out) instead of ending the case.
- Ticked studies: Order button turns amber and reads "Order batch".
- Watch-along "Open" button uses the accent colour.

Plan
- [x] Engine: horizon, pool mapping, free consult, no sudden death; `scoring.suggestTests()`
- [x] UI: tier card, route, coach panel, labels; CSS
- [x] Tests: student rules, suggestTests; docs (README, game/README, ARCHITECTURE, CHANGES)
- [ ] Verify in Chrome, commit, push, confirm deploy, republish artifact
