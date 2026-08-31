---
description: Check if this session's context is getting unhealthy, and what to do
---

Check the health of this session and tell me honestly whether to keep going
or start fresh.

Report:

1. **Size** - roughly how full is the context, from `/context` if available.
2. **Focus** - is this session still about one task, or have unrelated tasks
   piled up?
3. **Corrections** - how many times have I corrected you on the same thing?
4. **Dead ends** - how much of this context is failed approaches we abandoned?

Then give me one clear recommendation:

- **Keep going** - the session is focused and healthy.
- **`/compact`** - long but still one task. Suggest what to preserve.
- **`/clear` and restart** - and hand me a short prompt to paste into the
  fresh session that carries over what actually matters.

Use these rules from Anthropic's guidance:

> If you have corrected Claude more than twice on the same issue in one
> session, the context is cluttered with failed approaches. Run `/clear`
> and start fresh.

> Use `/clear` between unrelated tasks.

Be honest. Telling me to restart is often the right answer, and it costs me
less than a slow bad session.
