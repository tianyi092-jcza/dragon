// Mock transport and in-memory text only. No credentials, game saves, browser, or live API.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateJev,
  JEV_ENDPOINT,
  JevApiError,
  validateJevRequest,
} from "./jev/client.mjs";
import {
  buildAssessmentRequest,
  sanitizeArtifact,
  summarizeAssessment,
} from "./jev/profiles.mjs";
import { main, typesafeCredential } from "./jev_assess.mjs";

const QUESTIONS = {
  category: {
    type: "choice",
    instructions: "Classify the input",
    criteria: { code: null, test: null },
  },
  severity: {
    type: "score",
    instructions: "Rate impact",
    criteria: ["low", "high"],
  },
  unsafe: {
    type: "noul",
    instructions: "Is it unsafe?",
  },
};

const RESPONSE = {
  model: "jev-1.13.0",
  answers: {
    category: {
      type: "choice",
      choice: "test",
      probabilities: { code: 0.2, test: 0.8 },
      confidence: 0.6,
    },
    severity: {
      type: "score",
      score: 0.75,
      legend: { 0: "low", 1: "high" },
      probabilities: { 0: 0.25, 1: 0.75 },
      confidence: 0.5,
    },
    unsafe: { type: "noul", noul: 0.1 },
  },
  usage: { input_tokens: 100, output_tokens: 12 },
};

function parseRequestBody(input) {
  try {
    return JSON.parse(input);
  } catch (cause) {
    throw new Error("Client emitted invalid request JSON", { cause });
  }
}

function request() {
  return {
    model: "jev-1.13.0",
    state: { artifact: "one failed assertion" },
    questions: structuredClone(QUESTIONS),
  };
}

function deterministicAnswers(questions, noul = 0.25) {
  return Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type === "choice") {
        const keys = Object.keys(question.criteria);
        return [
          id,
          {
            type: "choice",
            choice: keys[0],
            confidence: 0.5,
            probabilities: Object.fromEntries(
              keys.map((key, index) => [key, index === 0 ? 1 : 0]),
            ),
          },
        ];
      }
      if (question.type === "score") {
        return [
          id,
          {
            type: "score",
            score: 0,
            confidence: 1,
            probabilities: Object.fromEntries(
              question.criteria.map((_, index) => [String(index), index === 0 ? 1 : 0]),
            ),
          },
        ];
      }
      return [id, { type: "noul", noul }];
    }),
  );
}

test("profiles build bounded, redacted, API-valid requests", () => {
  const input = [
    "Authorization: Bearer secret-value",
    "TYPESAFE_API_KEY=another-secret",
    '"password": "third-secret"',
    "AssertionError: expected 1, got 2",
  ].join("\n");
  const sanitized = sanitizeArtifact(input);
  assert.equal(sanitized.redactions, 3);
  assert.doesNotMatch(sanitized.artifact, /secret/i);
  assert.match(sanitized.artifact, /\[REDACTED\]/);

  for (const profile of ["change", "failure", "reverse-triage"]) {
    const assessment = buildAssessmentRequest(profile, input, {
      sourceLabel: "fixture",
    });
    assert.equal(assessment.metadata.advisoryOnly, true);
    assert.equal(assessment.metadata.redactions, 3);
    assert.equal(assessment.request.state.project_policy.authority.includes("advisory"), true);
    validateJevRequest(assessment.request);
  }
});

test("binary and oversized artifacts fail closed before any request", () => {
  assert.throws(() => sanitizeArtifact("text\0binary"), /Binary\/NUL/);
  assert.throws(() => sanitizeArtifact("x".repeat(48 * 1024 + 1)), /filter it below/);
});

test("CLI refuses private repository paths before reading them", async () => {
  const gitConfig = fileURLToPath(new URL("../.git/config", import.meta.url));
  await assert.rejects(
    main(["change", "--input", gitConfig], {}),
    /Refusing sensitive or private input path/,
  );
});

test("CLI reads the canonical TypeSafe credential variable", () => {
  assert.deepEqual(typesafeCredential({ TYPESAFE_API_KEY: "typesafe-test" }), {
    key: "typesafe-test",
    source: "TYPESAFE_API_KEY",
  });
  assert.equal(typesafeCredential({ TYPESAFE_API_KEY: "   " }), null);
  assert.equal(typesafeCredential({}), null);
});

test("client sends the key only in Authorization and validates typed answers", async () => {
  let calls = 0;
  const result = await evaluateJev(request(), {
    apiKey: "local-test-key",
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, JEV_ENDPOINT);
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Bearer local-test-key");
      assert.doesNotMatch(init.body, /local-test-key/);
      assert.deepEqual(parseRequestBody(init.body).questions, QUESTIONS);
      return Response.json(RESPONSE);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, RESPONSE);
});

test("client retries documented transient statuses and honors retry-after-ms", async () => {
  let calls = 0;
  const delays = [];
  const result = await evaluateJev(request(), {
    apiKey: "local-test-key",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("overloaded", {
          status: 529,
          headers: { "retry-after-ms": "7" },
        });
      }
      return Response.json(RESPONSE);
    },
    sleep: async (milliseconds) => delays.push(milliseconds),
  });
  assert.equal(result.model, "jev-1.13.0");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [7]);
});

test("missing millisecond header uses retry-after or bounded backoff, not zero", async () => {
  for (const [headers, expected] of [[{}, 500], [{ "retry-after": "2" }, 2000]]) {
    let calls = 0;
    const delays = [];
    await evaluateJev(request(), {
      apiKey: "local-test-key",
      fetchImpl: async () => ++calls === 1
        ? new Response("busy", { status: 503, headers })
        : Response.json(RESPONSE),
      sleep: async ms => delays.push(ms),
    });
    assert.deepEqual(delays, [expected]);
  }
});

test("non-retryable errors redact credential-shaped response text", async () => {
  await assert.rejects(
    evaluateJev(request(), {
      apiKey: "local-test-key",
      fetchImpl: async () =>
        new Response("TYPESAFE_API_KEY=server-echo", { status: 401 }),
      sleep: async () => assert.fail("401 must not retry"),
    }),
    (error) => {
      assert.equal(error instanceof JevApiError, true);
      assert.equal(error.status, 401);
      assert.match(error.message, /\[REDACTED\]/);
      assert.doesNotMatch(error.message, /server-echo/);
      return true;
    },
  );
});

test("project summaries remain explicitly advisory and preserve raw probabilities", () => {
  const assessment = buildAssessmentRequest("failure", "a failed test", {
    sourceLabel: "fixture",
  });
  const answers = deterministicAnswers(assessment.request.questions);
  const summary = summarizeAssessment(
    "failure",
    { model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 1 } },
    assessment.metadata,
  );
  assert.equal(summary.advisoryOnly, true);
  assert.equal(summary.signals.likelyProductDefect, 0.25);
  assert.equal(summary.failureClass.probabilities.assertion_or_rule, 1);
});

test("reverse triage selects only an evidence gap and next probe", () => {
  const assessment = buildAssessmentRequest(
    "reverse-triage",
    [
      "CONFIRMED: 0x1234 writes field +0x0E after one named caller.",
      "UNKNOWN: indirect callers and the immediate result consumer are not closed.",
      "CANDIDATES: continue static caller scan; trace the downstream consumer.",
    ].join("\n"),
    { sourceLabel: "bounded fixture" },
  );
  const answers = deterministicAnswers(assessment.request.questions, 0.75);
  const summary = summarizeAssessment(
    "reverse-triage",
    { model: "jev-1.13.0", answers, usage: { input_tokens: 2, output_tokens: 2 } },
    assessment.metadata,
  );

  assert.equal(summary.advisoryOnly, true);
  assert.equal(summary.mechanismVerdict, false);
  assert.equal(summary.primaryEvidenceGap.choice, "entry_or_caller_boundary");
  assert.equal(summary.nextProbe.choice, "static_xref_or_caller_scan");
  assert.equal(summary.signals.prematureConclusionRisk, 0.75);
  assert.deepEqual(summary.rawAnswers, answers);
});
