export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS = new Set([408, 429, 529]);

export class JevApiError extends Error {
  constructor(message, { status = null, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "JevApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertProbabilityMap(probabilities, expectedKeys, label) {
  if (!isObject(probabilities)) throw new TypeError(`${label} must be an object`);
  const actualKeys = Object.keys(probabilities).sort();
  const wantedKeys = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(wantedKeys)) {
    throw new TypeError(`${label} keys do not match the question criteria`);
  }
  let total = 0;
  for (const key of wantedKeys) {
    const value = probabilities[key];
    if (!isProbability(value)) {
      throw new TypeError(`${label}.${key} must be between 0 and 1`);
    }
    total += value;
  }
  if (Math.abs(total - 1) > 0.02) {
    throw new TypeError(`${label} must sum to approximately 1`);
  }
}

function validateQuestion(question, id) {
  if (!isObject(question) || !["choice", "score", "noul"].includes(question.type)) {
    throw new TypeError(`questions.${id} has an unsupported type`);
  }
  if (question.instructions === undefined) {
    throw new TypeError(`questions.${id}.instructions is required`);
  }
  if (question.type === "choice") {
    if (!isObject(question.criteria) || Object.keys(question.criteria).length < 2) {
      throw new TypeError(`questions.${id}.criteria needs at least two choices`);
    }
  }
  if (question.type === "score") {
    if (
      !Array.isArray(question.criteria) ||
      question.criteria.length < 2 ||
      question.criteria.length > 10
    ) {
      throw new TypeError(`questions.${id}.criteria needs 2 to 10 levels`);
    }
  }
}

export function validateJevRequest(request) {
  if (!isObject(request)) throw new TypeError("Jev request must be an object");
  if (
    typeof request.state !== "string" &&
    !Array.isArray(request.state) &&
    !isObject(request.state)
  ) {
    throw new TypeError("Jev state must be a string, object, or array");
  }
  if (typeof request.model !== "string" || request.model.length === 0) {
    throw new TypeError("Jev model must be a non-empty string");
  }
  if (!isObject(request.questions) || Object.keys(request.questions).length === 0) {
    throw new TypeError("Jev questions must be a non-empty object");
  }
  for (const [id, question] of Object.entries(request.questions)) {
    validateQuestion(question, id);
  }
  return request;
}

function validateAnswer(answer, question, id) {
  if (!isObject(answer) || answer.type !== question.type) {
    throw new TypeError(`answers.${id}.type does not match its question`);
  }
  if (question.type === "noul") {
    if (!isProbability(answer.noul)) {
      throw new TypeError(`answers.${id}.noul must be between 0 and 1`);
    }
    return;
  }
  if (!isProbability(answer.confidence)) {
    throw new TypeError(`answers.${id}.confidence must be between 0 and 1`);
  }
  if (question.type === "choice") {
    const keys = Object.keys(question.criteria);
    if (!keys.includes(answer.choice)) {
      throw new TypeError(`answers.${id}.choice is not a declared option`);
    }
    assertProbabilityMap(answer.probabilities, keys, `answers.${id}.probabilities`);
    return;
  }
  if (
    !Number.isFinite(answer.score) ||
    answer.score < 0 ||
    answer.score > question.criteria.length - 1
  ) {
    throw new TypeError(`answers.${id}.score is outside the declared rubric`);
  }
  assertProbabilityMap(
    answer.probabilities,
    question.criteria.map((_, index) => String(index)),
    `answers.${id}.probabilities`,
  );
}

export function validateJevResponse(response, questions) {
  if (!isObject(response) || typeof response.model !== "string") {
    throw new TypeError("Jev response is missing its model id");
  }
  if (!isObject(response.answers)) {
    throw new TypeError("Jev response is missing answers");
  }
  const answerIds = Object.keys(response.answers).sort();
  const questionIds = Object.keys(questions).sort();
  if (JSON.stringify(answerIds) !== JSON.stringify(questionIds)) {
    throw new TypeError("Jev response answer ids do not match the request");
  }
  for (const id of questionIds) {
    validateAnswer(response.answers[id], questions[id], id);
  }
  if (response.usage !== undefined) {
    if (
      !isObject(response.usage) ||
      !Number.isInteger(response.usage.input_tokens) ||
      response.usage.input_tokens < 0 ||
      !Number.isInteger(response.usage.output_tokens) ||
      response.usage.output_tokens < 0
    ) {
      throw new TypeError("Jev response usage is malformed");
    }
  }
  return response;
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status) || (status >= 500 && status <= 599);
}

function retryDelay(response, attempt) {
  const retryAfterMsHeader = response.headers.get("retry-after-ms");
  const retryAfterMs = retryAfterMsHeader === null ? NaN : Number(retryAfterMsHeader);
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0 && retryAfterMs <= 60_000) {
    return retryAfterMs;
  }
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds * 1000 <= 60_000) {
      return seconds * 1000;
    }
    const at = Date.parse(retryAfter);
    const delay = at - Date.now();
    if (Number.isFinite(delay) && delay >= 0 && delay <= 60_000) return delay;
  }
  return Math.min(500 * 2 ** attempt, 5_000);
}

function redactErrorText(text) {
  return String(text)
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b([A-Z0-9_]{0,64}(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*)[^\s,"']+/gi, "$1[REDACTED]")
    .slice(0, 1_000);
}

async function responseError(response) {
  let detail = "";
  try {
    detail = redactErrorText(await response.text());
  } catch {
    // The status is still useful when the response body cannot be read.
  }
  const suffix = detail ? `: ${detail}` : "";
  return new JevApiError(`TypeSafe API returned HTTP ${response.status}${suffix}`, {
    status: response.status,
    retryable: isRetryableStatus(response.status),
  });
}

export async function evaluateJev(
  request,
  {
    apiKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = 2,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  validateJevRequest(request);
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("TYPESAFE_API_KEY is required for a live Jev request");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new TypeError("maxRetries must be a non-negative integer");
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (response.ok) {
        const result = await response.json();
        return validateJevResponse(result, request.questions);
      }
      lastError = await responseError(response);
    } catch (cause) {
      const timedOut = controller.signal.aborted;
      lastError = new JevApiError(
        timedOut ? "TypeSafe API request timed out" : "TypeSafe API connection failed",
        { retryable: true, cause },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!lastError.retryable || attempt === maxRetries) throw lastError;
    await sleep(response ? retryDelay(response, attempt) : Math.min(500 * 2 ** attempt, 5_000));
  }
  throw lastError;
}
