# Consecutive Reply Cooldown

A Discourse theme component that stops users from posting consecutive replies to a topic. If the last post in a topic is the user's own, they cannot reply again until a configurable cooldown has passed **or** someone else replies.

## Why this component exists

Discourse has no built-in way to limit consecutive replies by time. The closest core setting, `max_consecutive_replies`, only counts posts: once a user reaches the limit, they cannot post again until someone else replies, no matter how much time has passed. It cannot express rules like "you may post again after one hour".

This component adds that time-based rule. It can be used on its own (set `max_consecutive_replies` to `0`) or together with the core setting, which then acts as a hard cap on top of the cooldown.

## Settings (Admin → Customize → Themes → this component)

| Setting | Default | Description |
| --- | --- | --- |
| `cooldown_enabled` | `true` | Turns the rule on or off |
| `cooldown_duration` | `60` | How long to wait |
| `cooldown_unit` | `minutes` | `minutes` or `hours` |
| `exempt_staff` | `true` | Admins and moderators skip the rule |
| `include_private_messages` | `false` | Also apply the rule to personal messages |
| `texts` | English texts with Turkish translations | Every text shown to users, with per-language translations |

## Translations

Every user-facing text lives in the `texts` setting and is edited with the objects setting editor, the same way as in the Custom Top Navigation Links component. Each entry has a default `text` and a list of `translations` (language + text).

For each text, a translation for the user's language is used if one exists (exact match such as `pt_BR` first, then a prefix match such as `pt`). Otherwise the default text is shown.

| Key | Placeholders |
| --- | --- |
| `warning_title` | — |
| `warning_message` | `{time_left}` remaining wait, `{duration}` configured cooldown |
| `minutes_one` / `minutes_other` | `{count}` |
| `hours_one` / `hours_other` | `{count}` |
| `hours_and_minutes` | `{hours}`, `{minutes}` |

Placeholders can be written as `{name}` or `%{name}`.

`locales/*.yml` only holds the descriptions shown on the admin settings page.

## Notes

- The check runs in the browser when the composer is submitted. Replies sent through the API or by email are not checked.
- Small-action posts (for example "closed this topic"), whispers and deleted posts do not count as the last post.
- The component uses `api.composerBeforeSave`, which allows only one handler. Another theme or plugin that also uses it will conflict with this one.
