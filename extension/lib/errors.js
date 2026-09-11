/**
 * lib/errors.js
 * Centralized error types, codes and user-facing messages.
 * Every module throws a QuizKeyError (or gets normalized into one) so the
 * UI layers can render a consistent, actionable message instead of raw
 * exceptions.
 */

export const ErrorCodes = Object.freeze({
  NO_ACTIVE_TAB: "NO_ACTIVE_TAB",
  CAPTURE_FAILED: "CAPTURE_FAILED",
  EXTRACT_FAILED: "EXTRACT_FAILED",
  API_KEY_MISSING: "API_KEY_MISSING",
  API_CONNECTION_FAILED: "API_CONNECTION_FAILED",
  API_REQUEST_FAILED: "API_REQUEST_FAILED",
  API_TIMEOUT: "API_TIMEOUT",
  API_BAD_RESPONSE: "API_BAD_RESPONSE",
  NO_QUESTION: "NO_QUESTION",
  NO_ANSWER: "NO_ANSWER",
  NO_RESULT: "NO_RESULT",
  NO_INPUT: "NO_INPUT",
  TYPING_FAILED: "TYPING_FAILED",
  MESSAGING_FAILED: "MESSAGING_FAILED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  RESTRICTED_PAGE: "RESTRICTED_PAGE",
  UNKNOWN: "UNKNOWN",
});

const USER_MESSAGES = {
  NO_ACTIVE_TAB: "No active tab was found. Click the page and try again.",
  CAPTURE_FAILED:
    "The screenshot could not be captured. This page may be restricted (chrome:// pages and the Web Store cannot be captured).",
  EXTRACT_FAILED:
    "The page HTML could not be read. Reload the tab and try again, or switch the quiz source to Image in the QuizKey popup.",
  API_KEY_MISSING:
    "No API key configured. Open the QuizKey settings page and add your AI provider key (local servers such as Ollama / LM Studio don't need one).",
  API_CONNECTION_FAILED:
    "Could not reach the AI endpoint. Check the base URL, your network, and grant the endpoint permission from the QuizKey settings page (\"Test connection\").",
  API_REQUEST_FAILED:
    "The AI provider rejected the request. Check the model name, API key and quota.",
  API_TIMEOUT: "The AI model took too long to respond. Try again in a moment.",
  API_BAD_RESPONSE:
    "The AI returned an unreadable response. Try again, or switch to a vision-capable model with reliable JSON output.",
  NO_QUESTION:
    "No quiz question was detected in the captured content. Make sure the question is on screen and try again (or switch the quiz source between Image and HTML).",
  NO_ANSWER:
    "A question was found, but the model could not determine a confident answer.",
  NO_RESULT:
    "Nothing to type yet — press the capture shortcut first to analyze the page.",
  NO_INPUT:
    "No visible, editable input field was found on this page. Click the field yourself, then re-trigger typing.",
  TYPING_FAILED: "The answer could not be typed into the page.",
  MESSAGING_FAILED:
    "The content script is not available on this page (it may be a restricted browser page).",
  PERMISSION_DENIED:
    "A required permission was denied. Review the extension permissions and try again.",
  RESTRICTED_PAGE:
    "This page can't be captured or scripted by extensions.",
  UNKNOWN: "Something unexpected went wrong.",
};

export class QuizKeyError extends Error {
  /**
   * @param {string} code — one of ErrorCodes
   * @param {string} [detail] — technical detail for logs
   * @param {unknown} [cause] — original error, if any
   * @param {string} [userMessageOverride] — replaces the table message
   *   (used by page-access diagnostics that know the exact remedy)
   */
  constructor(code, detail = "", cause = undefined, userMessageOverride = undefined) {
    super(detail || USER_MESSAGES[code] || USER_MESSAGES.UNKNOWN);
    this.name = "QuizKeyError";
    this.code = code in USER_MESSAGES ? code : ErrorCodes.UNKNOWN;
    this._userMessageOverride = userMessageOverride || null;
    if (cause !== undefined) this.cause = cause;
  }

  get userMessage() {
    return this._userMessageOverride || USER_MESSAGES[this.code] || USER_MESSAGES.UNKNOWN;
  }

  /** Safe, structured clone-able payload for chrome messaging. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
    };
  }
}

/**
 * Convert anything thrown anywhere into a QuizKeyError.
 * @param {unknown} err
 * @returns {QuizKeyError}
 */
export function normalizeError(err) {
  if (err instanceof QuizKeyError) return err;
  const message = err instanceof Error ? err.message : String(err);

  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return new QuizKeyError(ErrorCodes.MESSAGING_FAILED, message, err);
  }
  if (/permission|denied/i.test(message)) {
    return new QuizKeyError(ErrorCodes.PERMISSION_DENIED, message, err);
  }
  if (/capture|visible tab|activeTab/i.test(message)) {
    return new QuizKeyError(ErrorCodes.CAPTURE_FAILED, message, err);
  }
  return new QuizKeyError(ErrorCodes.UNKNOWN, message, err);
}

/** User-facing message for any thrown value. */
export function toUserMessage(err) {
  return normalizeError(err).userMessage;
}
