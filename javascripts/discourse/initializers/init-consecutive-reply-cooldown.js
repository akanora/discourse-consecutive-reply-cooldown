import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import I18n from "discourse-i18n";

const REGULAR_POST_TYPES = [1, 2]; // regular, moderator_action
const MAX_POSTS_TO_INSPECT = 10;
const MINUTE_MS = 60 * 1000;

function cooldownMinutes() {
  const duration = settings.cooldown_duration;
  return settings.cooldown_unit === "hours" ? duration * 60 : duration;
}

// Accepts both {name} and %{name} placeholders
function interpolate(text, values) {
  return text.replace(/%?\{(\w+)\}/g, (placeholder, key) =>
    key in values ? values[key] : placeholder
  );
}

/**
 * Resolve a text from the `texts` setting, checking for a locale-specific
 * translation first. Falls back to the entry's default text, or to the key
 * itself if the entry was removed from the setting.
 */
function getLocalizedText(key, values = {}) {
  const entry = settings.texts?.find((t) => t.key === key);
  let text = entry?.text || key;

  const translations = entry?.translations;
  if (translations?.length) {
    const locale = I18n.currentLocale();

    // Try exact match first (e.g. "pt_BR"), then prefix match (e.g. "pt")
    const match =
      translations.find((t) => t.locale === locale) ||
      translations.find((t) => locale.startsWith(t.locale));

    text = match?.text || text;
  }

  return interpolate(text, values);
}

function pluralize(key, count) {
  return getLocalizedText(`${key}_${count === 1 ? "one" : "other"}`, {
    count,
  });
}

/**
 * Format a number of minutes as e.g. "1 hour 5 minutes" in the current
 * locale.
 */
function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return pluralize("minutes", minutes);
  }
  if (minutes === 0) {
    return pluralize("hours", hours);
  }
  return getLocalizedText("hours_and_minutes", {
    hours: pluralize("hours", hours),
    minutes: pluralize("minutes", minutes),
  });
}

function warningMessage(remainingMinutes) {
  return getLocalizedText("warning_message", {
    time_left: formatMinutes(remainingMinutes),
    duration: formatMinutes(cooldownMinutes()),
  });
}

async function loadPost(postStream, postId) {
  const loaded = postStream?.findLoadedPost(postId);
  if (loaded) {
    return loaded;
  }
  return await ajax(`/posts/${postId}.json`);
}

/**
 * Find the most recent visible, non-deleted, regular post in the topic.
 * Small actions ("closed this topic" etc.) and whispers are skipped.
 */
async function findLastPost(topic) {
  const postStream = topic.postStream;
  let stream = postStream?.stream;

  if (!stream || stream.length === 0) {
    const json = await ajax(`/t/${topic.id}.json`);
    stream = json.post_stream?.stream || [];
  }

  const candidates = stream
    .filter((id) => id > 0) // ignore staged (not yet saved) posts
    .slice(-MAX_POSTS_TO_INSPECT)
    .reverse();

  for (const postId of candidates) {
    const post = await loadPost(postStream, postId);
    if (
      post &&
      !post.deleted_at &&
      REGULAR_POST_TYPES.includes(post.post_type)
    ) {
      return post;
    }
  }

  return null;
}

/**
 * Returns the number of minutes the user still has to wait, or 0 when
 * replying is allowed.
 */
async function remainingCooldownMinutes(composer, currentUser) {
  const topic = composer.topic;
  if (!topic) {
    return 0;
  }

  const lastPost = await findLastPost(topic);
  if (!lastPost || lastPost.user_id !== currentUser.id) {
    return 0;
  }

  const elapsed = Date.now() - new Date(lastPost.created_at).getTime();
  const remaining = cooldownMinutes() * MINUTE_MS - elapsed;

  return remaining > 0 ? Math.ceil(remaining / MINUTE_MS) : 0;
}

function shouldCheck(composer, currentUser) {
  if (!settings.cooldown_enabled || !currentUser) {
    return false;
  }
  if (settings.exempt_staff && currentUser.staff) {
    return false;
  }
  if (composer.action !== "reply" || composer.editingPost) {
    return false;
  }
  if (composer.privateMessage && !settings.include_private_messages) {
    return false;
  }
  return true;
}

export default {
  name: "consecutive-reply-cooldown",

  initialize() {
    withPluginApi((api) => {
      const currentUser = api.getCurrentUser();
      const dialog = api.container.lookup("service:dialog");

      api.composerBeforeSave(async function () {
        // `this` is the composer model being saved
        if (!shouldCheck(this, currentUser)) {
          return;
        }

        let remaining;
        try {
          remaining = await remainingCooldownMinutes(this, currentUser);
        } catch {
          // Never block posting because of a failed lookup
          return;
        }

        if (remaining > 0) {
          dialog.alert({
            title: getLocalizedText("warning_title"),
            message: warningMessage(remaining),
          });
          // Rejecting without an error keeps the composer (and its draft)
          // open without Discourse showing a second, generic error.
          return Promise.reject();
        }
      });
    });
  },
};
