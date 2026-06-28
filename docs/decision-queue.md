# Human Decision Queue

Quorum uses GitHub issues labeled `needs-human-decision` as its human sign-off
queue.

Automation should create a decision issue when it needs product judgment,
credentials, paid services, destructive actions, public history rewriting,
secrets, ambiguous product direction, or help with CI that remains unresolved
after one serious fix attempt.

## Agent Behavior

When a human decision is needed:

1. Create or update a GitHub issue labeled `needs-human-decision`.
2. Include the exact decision, context, options, recommendation, and what would
   unblock the work.
3. Link the issue from any related PR or summary.
4. Continue with another safe, unrelated task if one exists.
5. Stop only when all useful work is blocked by open human decisions.

## Human Review

Nazeer can review the queue here:

https://github.com/nash226/quorum/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-human-decision

To approve a decision, comment with the selected option or explicit instruction.
Close the issue when the decision has been handled.
