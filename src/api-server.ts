import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  EvaluationFixtureValidationError,
  renderEvaluationAggregateSummaryCsv,
  evaluateFixtureContentsResult,
  renderEvaluationDomainSummaryCsv,
  renderEvaluationHtmlReport,
  renderEvaluationMarkdownReport,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
  type EvaluationBatchRunResult,
  type InMemoryEvaluationFixtureInput,
} from "./evaluation.js";
import type { BatchVerificationRunResult, SingleVerificationResult } from "./domain.js";
import { extractClaims } from "./claim-extractor.js";
import { CLAIM_VERDICTS, parseClaimVerdict } from "./report-policy.js";
import {
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderBatchTextReport,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
} from "./report-renderer.js";
import {
  type ReviewerDecisionImportResult,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportSummaryCsv,
} from "./reviewer-decision-import.js";
import { parseSourceTrustLevel } from "./source-loader.js";
import { renderAnswerPreview } from "./text.js";
import {
  ANSWER_EXTENSIONS,
  SOURCE_EXTENSIONS,
  importReviewerDecisionContentsResult,
  verifyAnswerBatchContentsResult,
  verifyAnswerContentsResult,
  type InMemoryAnswerInput,
  type InMemorySourceInput,
} from "./workflow.js";

const VERIFY_ARTIFACTS = ["text", "markdown", "html", "result_json", "review_csv", "summary_csv"] as const;
const VERIFY_BATCH_ARTIFACTS = ["text", "markdown", "html", "result_json", "review_csv", "summary_csv"] as const;
const IMPORT_REVIEW_ARTIFACTS = ["text", "markdown", "html", "result_json", "summary_csv"] as const;
const EVALUATE_ARTIFACTS = [
  "text",
  "markdown",
  "html",
  "result_json",
  "summary_csv",
  "domain_summary_csv",
  "aggregate_summary_csv",
] as const;

export type ApiVerifyArtifact = (typeof VERIFY_ARTIFACTS)[number];
export type ApiVerifyBatchArtifact = (typeof VERIFY_BATCH_ARTIFACTS)[number];
export type ApiImportReviewArtifact = (typeof IMPORT_REVIEW_ARTIFACTS)[number];
export type ApiEvaluateArtifact = (typeof EVALUATE_ARTIFACTS)[number];

export type ApiVerifyArtifacts = Partial<Record<ApiVerifyArtifact, string>>;
export type ApiVerifyBatchArtifacts = Partial<Record<ApiVerifyBatchArtifact, string>>;
export type ApiImportReviewArtifacts = Partial<Record<ApiImportReviewArtifact, string>>;
export type ApiEvaluateArtifacts = Partial<Record<ApiEvaluateArtifact, string>>;

export type ApiVerifyResponse = SingleVerificationResult & {
  requestId: string;
  artifacts?: ApiVerifyArtifacts;
};

export type ApiVerifyBatchResponse = BatchVerificationRunResult & {
  requestId: string;
  artifacts?: ApiVerifyBatchArtifacts;
};

export type ApiImportReviewResponse = ReviewerDecisionImportResult & {
  requestId: string;
  artifacts?: ApiImportReviewArtifacts;
};

export type ApiEvaluateResponse = EvaluationBatchRunResult & {
  requestId: string;
  artifacts?: ApiEvaluateArtifacts;
};

export interface ApiSourceInput {
  sourcePath: string;
  content: string;
  title?: string;
  updatedAt?: string;
  trustLevel?: string;
}

export interface VerifyApiRequest {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: ApiSourceInput[];
  defaultTrustLevel?: string;
  generatedAt?: string;
  failOn?: string[];
  includeArtifacts?: ApiVerifyArtifact[];
  failOnStatus?: boolean;
}

export interface VerifyBatchApiRequest {
  answers: Array<{
    answer: string;
    answerPath?: string;
    answerLabel?: string;
  }>;
  sources: ApiSourceInput[];
  defaultTrustLevel?: string;
  generatedAt?: string;
  failOn?: string[];
  includeArtifacts?: ApiVerifyBatchArtifact[];
  failOnStatus?: boolean;
}

export interface ImportReviewApiRequest {
  reviewCsvContent: string;
  generatedAt?: string;
  failOn?: string[];
  includeArtifacts?: ApiImportReviewArtifact[];
  failOnStatus?: boolean;
}

export interface EvaluateApiRequest {
  fixtures: Array<{
    fixturePath: string;
    content: string;
  }>;
  domains?: string[];
  generatedAt?: string;
  minScore?: number;
  includeArtifacts?: ApiEvaluateArtifact[];
  failOnStatus?: boolean;
}

export interface ExtractClaimsApiRequest {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
}

export interface ExtractClaimsApiResponse {
  requestId: string;
  answerPath?: string;
  answerLabel?: string;
  answerPreview: string;
  claims: ReturnType<typeof extractClaims>;
}

export interface ApiServerOptions {
  host?: string;
  port?: number;
  /** Restrict browser CORS responses to these exact origins. */
  corsAllowedOrigins?: readonly string[];
}

export type ApiCapabilityMap = typeof API_CAPABILITIES;

export interface ApiDiscoveryEndpoint {
  method: "GET" | "HEAD" | "POST" | "OPTIONS";
  path: string;
  description: string;
}

export interface ApiCapabilitiesResponse {
  requestId: string;
  service: string;
  version: string;
  openapiPath: string;
  capabilities: ApiCapabilityMap;
}

export interface ApiDiscoveryResponse extends ApiCapabilitiesResponse {
  endpoints: readonly ApiDiscoveryEndpoint[];
}

export interface ApiHealthResponse {
  ok: true;
  requestId: string;
  service: string;
  version: string;
}

export interface ApiVersionResponse {
  requestId: string;
  service: string;
  version: string;
}

export interface OpenApiDocumentOptions {
  serverUrl?: string;
}

export interface StartedApiServer {
  host: string;
  port: number;
  server: Server;
  url: string;
  close(): Promise<void>;
}

export const CAPABILITIES_PATH = "/capabilities";
export const HEALTH_PATH = "/health";
export const HEALTHZ_PATH = "/healthz";
export const READYZ_PATH = "/readyz";
export const VERSION_PATH = "/version";
export const OPENAPI_PATH = "/openapi.json";
export const LIVEZ_PATH = "/livez";
export const API_MAX_REQUEST_BYTES = 1024 * 1024;
const ALLOWED_METHODS = "GET, HEAD, POST, OPTIONS";
export const API_SERVICE_NAME = "quorum";
export const API_VERSION = "0.1.0";
export const API_DISCOVERY_HEADERS = {
  service: "X-Quorum-Service",
  version: "X-Quorum-Version",
  openapiPath: "X-Quorum-OpenAPI-Path",
  maxRequestBytes: "X-Quorum-Max-Request-Bytes",
} as const;
export const API_REQUEST_ID_HEADER = "X-Quorum-Request-Id";
export const API_CORS_ALLOWED_HEADERS = ["Content-Type", API_REQUEST_ID_HEADER].join(", ");
const EXPOSED_HEADERS = [...Object.values(API_DISCOVERY_HEADERS), API_REQUEST_ID_HEADER].join(", ");
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SOURCE_TRUST_LEVELS = ["low", "medium", "high"] as const;
export const API_CAPABILITIES = {
  httpMethods: ["GET", "HEAD", "POST", "OPTIONS"],
  requestContentTypes: ["application/json"],
  maxRequestBytes: API_MAX_REQUEST_BYTES,
  sourceExtensions: [...SOURCE_EXTENSIONS],
  answerExtensions: [...ANSWER_EXTENSIONS],
  verdicts: CLAIM_VERDICTS,
  trustLevels: [...SOURCE_TRUST_LEVELS],
  verifyArtifacts: [...VERIFY_ARTIFACTS],
  verifyBatchArtifacts: [...VERIFY_BATCH_ARTIFACTS],
  importReviewArtifacts: [...IMPORT_REVIEW_ARTIFACTS],
  evaluateArtifacts: [...EVALUATE_ARTIFACTS],
  extractClaims: true,
} as const;
export const API_ENDPOINTS: readonly ApiDiscoveryEndpoint[] = [
  { method: "GET", path: "/", description: "Return API discovery metadata for local callers." },
  { method: "HEAD", path: "/", description: "Return service discovery headers without a JSON body." },
  { method: "OPTIONS", path: "/", description: "Return CORS preflight headers for discovery clients." },
  {
    method: "GET",
    path: CAPABILITIES_PATH,
    description: "Return supported Quorum capabilities without endpoint listings.",
  },
  {
    method: "HEAD",
    path: CAPABILITIES_PATH,
    description: "Return capability discovery headers without a JSON body.",
  },
  {
    method: "OPTIONS",
    path: CAPABILITIES_PATH,
    description: "Return CORS preflight headers for capability discovery clients.",
  },
  { method: "GET", path: HEALTH_PATH, description: "Return a simple readiness response." },
  { method: "HEAD", path: HEALTH_PATH, description: "Return readiness headers without a JSON body." },
  {
    method: "OPTIONS",
    path: HEALTH_PATH,
    description: "Return CORS preflight headers for readiness probes that use browser-style requests.",
  },
  {
    method: "GET",
    path: HEALTHZ_PATH,
    description: "Return a simple readiness response using the conventional probe path.",
  },
  {
    method: "HEAD",
    path: HEALTHZ_PATH,
    description: "Return readiness headers on the conventional probe path without a JSON body.",
  },
  {
    method: "OPTIONS",
    path: HEALTHZ_PATH,
    description: "Return CORS preflight headers for the conventional readiness probe path.",
  },
  { method: "GET", path: READYZ_PATH, description: "Return a simple readiness response using the Kubernetes probe alias." },
  { method: "HEAD", path: READYZ_PATH, description: "Return readiness headers on the Kubernetes probe alias without a JSON body." },
  { method: "OPTIONS", path: READYZ_PATH, description: "Return CORS preflight headers for the Kubernetes readiness probe alias." },
  { method: "GET", path: LIVEZ_PATH, description: "Return a simple liveness response using the Kubernetes probe alias." },
  { method: "HEAD", path: LIVEZ_PATH, description: "Return liveness headers on the Kubernetes probe alias without a JSON body." },
  { method: "OPTIONS", path: LIVEZ_PATH, description: "Return CORS preflight headers for the Kubernetes liveness probe alias." },
  { method: "GET", path: VERSION_PATH, description: "Return the Quorum service and contract version." },
  { method: "HEAD", path: VERSION_PATH, description: "Return version headers without a JSON body." },
  { method: "OPTIONS", path: VERSION_PATH, description: "Return CORS preflight headers for version clients." },
  { method: "GET", path: OPENAPI_PATH, description: "Return the OpenAPI description for this server." },
  { method: "HEAD", path: OPENAPI_PATH, description: "Return OpenAPI headers without a JSON body." },
  {
    method: "OPTIONS",
    path: OPENAPI_PATH,
    description: "Return CORS preflight headers for OpenAPI schema clients.",
  },
  { method: "POST", path: "/verify", description: "Verify one answer from JSON request content." },
  { method: "OPTIONS", path: "/verify", description: "Return CORS preflight headers for verify requests." },
  {
    method: "POST",
    path: "/verify-batch",
    description: "Verify multiple answers from JSON request content.",
  },
  {
    method: "OPTIONS",
    path: "/verify-batch",
    description: "Return CORS preflight headers for batch verify requests.",
  },
  {
    method: "POST",
    path: "/import-review",
    description: "Import reviewer CSV content from JSON request content.",
  },
  {
    method: "OPTIONS",
    path: "/import-review",
    description: "Return CORS preflight headers for reviewer import requests.",
  },
  {
    method: "POST",
    path: "/evaluate",
    description: "Evaluate fixture JSON content from request payloads.",
  },
  {
    method: "OPTIONS",
    path: "/evaluate",
    description: "Return CORS preflight headers for evaluation requests.",
  },
  { method: "POST", path: "/extract-claims", description: "Extract normalized claims from answer content." },
  {
    method: "OPTIONS",
    path: "/extract-claims",
    description: "Return CORS preflight headers for claim extraction requests.",
  },
] as const;
const OPENAPI_DISCOVERY_RESPONSE_EXAMPLE = {
  requestId: "discovery-contract-test",
  service: API_SERVICE_NAME,
  version: API_VERSION,
  openapiPath: OPENAPI_PATH,
  capabilities: API_CAPABILITIES,
  endpoints: API_ENDPOINTS,
} as const;
const OPENAPI_CAPABILITIES_RESPONSE_EXAMPLE = {
  requestId: "capabilities-contract-test",
  service: API_SERVICE_NAME,
  version: API_VERSION,
  openapiPath: OPENAPI_PATH,
  capabilities: API_CAPABILITIES,
} as const;
const OPENAPI_HEALTH_RESPONSE_EXAMPLE = {
  ok: true,
  requestId: "health-contract-test",
  service: API_SERVICE_NAME,
  version: API_VERSION,
} as const;
const OPENAPI_VERSION_RESPONSE_EXAMPLE = {
  requestId: "version-contract-test",
  service: API_SERVICE_NAME,
  version: API_VERSION,
} as const;
const OPENAPI_DOCUMENT_RESPONSE_EXAMPLE = {
  openapi: "3.1.0",
  info: {
    title: "Quorum Local API",
    version: API_VERSION,
  },
  servers: [{ url: "http://127.0.0.1:3000" }],
  paths: {
    "/verify": {
      post: {
        summary: "Verify one answer",
      },
    },
  },
} as const;
const OPENAPI_VERIFY_EXAMPLE = {
  answer: "Employees receive 12 weeks of paid parental leave.",
  answerPath: "answers/hr.md",
  answerLabel: "HR policy answer",
  generatedAt: "2026-07-07T19:15:00.000Z",
  sources: [
    {
      sourcePath: "sources/hr-policy.md",
      title: "HR Policy",
      updatedAt: "2026-05-31",
      trustLevel: "high",
      content: `---
title: HR Policy
trustLevel: high
updatedAt: 2026-05-31
---
Employees receive 12 weeks of paid parental leave.
`,
    },
  ],
  defaultTrustLevel: "high",
  failOn: ["contradicted", "unsupported"],
  includeArtifacts: ["markdown", "review_csv"],
  failOnStatus: true,
} as const;
const OPENAPI_VERIFY_RESPONSE_EXAMPLE = {
  report: {
    generatedAt: "2026-07-07T19:15:00.000Z",
    answerPath: "answers/hr.md",
    answerLabel: "HR policy answer",
    answerPreview: "Employees receive 12 weeks of paid parental leave.",
    answer: "Employees receive 12 weeks of paid parental leave.",
    sources: [
      {
        id: "source-1",
        title: "HR Policy",
        updatedAt: "2026-05-31",
        trustLevel: "high",
      },
    ],
    assessments: [
      {
        claim: {
          id: "claim-1",
          text: "Employees receive 12 weeks of paid parental leave.",
        },
        verdict: "verified",
        evidence: [
          {
            documentId: "source-1",
            documentTitle: "HR Policy",
            documentTrustLevel: "high",
            documentUpdatedAt: "2026-05-31",
            quote: "Employees receive 12 weeks of paid parental leave.",
            score: 1,
          },
        ],
        reason: "An approved source directly supports this claim.",
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    },
  },
  shouldFail: false,
  failVerdicts: [],
  artifacts: {
    markdown: "# Quorum Verification Report\n\nSummary: 1 verified, 0 contradicted, 0 unsupported, 0 needs review\n",
    review_csv:
      "claim_id,claim_text,verdict,reason,evidence_titles,evidence_quotes\nclaim-1,Employees receive 12 weeks of paid parental leave.,verified,An approved source directly supports this claim.,HR Policy,Employees receive 12 weeks of paid parental leave.\n",
  },
} as const;
const OPENAPI_VERIFY_BATCH_EXAMPLE = {
  generatedAt: "2026-07-07T19:20:00.000Z",
  answers: [
    {
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerPath: "answers/hr.md",
      answerLabel: "HR policy answer",
    },
    {
      answer: "Refund requests are answered within one business day.",
      answerPath: "answers/support.md",
      answerLabel: "Support queue answer",
    },
  ],
  sources: [
    {
      sourcePath: "sources/hr-policy.md",
      title: "HR Policy",
      trustLevel: "high",
      content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
    },
    {
      sourcePath: "sources/support-playbook.md",
      title: "Support Playbook",
      trustLevel: "medium",
      content: `---
title: Support Playbook
trustLevel: medium
---
Refund requests receive an initial response within one business day.
`,
    },
  ],
  failOn: ["unsupported"],
  includeArtifacts: ["html", "summary_csv"],
  failOnStatus: true,
} as const;
const OPENAPI_VERIFY_BATCH_RESPONSE_EXAMPLE = {
  report: {
    generatedAt: "2026-07-07T19:20:00.000Z",
    sources: [
      {
        id: "source-1",
        title: "HR Policy",
        trustLevel: "high",
      },
      {
        id: "source-2",
        title: "Support Playbook",
        trustLevel: "medium",
      },
    ],
    sourceCount: 2,
    answerCount: 2,
    answers: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        report: {
          generatedAt: "2026-07-07T19:20:00.000Z",
          answerPath: "answers/hr.md",
          answerLabel: "HR policy answer",
          answerPreview: "Employees receive 12 weeks of paid parental leave.",
          answer: "Employees receive 12 weeks of paid parental leave.",
          sources: [
            {
              id: "source-1",
              title: "HR Policy",
              trustLevel: "high",
            },
            {
              id: "source-2",
              title: "Support Playbook",
              trustLevel: "medium",
            },
          ],
          assessments: [
            {
              claim: {
                id: "claim-1",
                text: "Employees receive 12 weeks of paid parental leave.",
              },
              verdict: "verified",
              evidence: [
                {
                  documentId: "source-1",
                  documentTitle: "HR Policy",
                  documentTrustLevel: "high",
                  quote: "Employees receive 12 weeks of paid parental leave.",
                  score: 1,
                },
              ],
              reason: "An approved source directly supports this claim.",
            },
          ],
          summary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
        },
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "Support queue answer",
        answerPath: "answers/support.md",
        report: {
          generatedAt: "2026-07-07T19:20:00.000Z",
          answerPath: "answers/support.md",
          answerLabel: "Support queue answer",
          answerPreview: "Refund requests are answered within one business day.",
          answer: "Refund requests are answered within one business day.",
          sources: [
            {
              id: "source-1",
              title: "HR Policy",
              trustLevel: "high",
            },
            {
              id: "source-2",
              title: "Support Playbook",
              trustLevel: "medium",
            },
          ],
          assessments: [
            {
              claim: {
                id: "claim-1",
                text: "Refund requests are answered within one business day.",
              },
              verdict: "verified",
              evidence: [
                {
                  documentId: "source-2",
                  documentTitle: "Support Playbook",
                  documentTrustLevel: "medium",
                  quote: "Refund requests receive an initial response within one business day.",
                  score: 0.889,
                },
              ],
              reason: "An approved source closely supports this claim.",
            },
          ],
          summary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
        },
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 2,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    },
  },
  shouldFail: false,
  failVerdicts: [],
  artifacts: {
    summary_csv:
      "answer_label,answer_path,verified,contradicted,unsupported,needs_review,should_fail,fail_verdicts\nHR policy answer,answers/hr.md,1,0,0,0,false,\nSupport queue answer,answers/support.md,1,0,0,0,false,\n",
  },
} as const;
const OPENAPI_IMPORT_REVIEW_EXAMPLE = {
  reviewCsvContent: [
    "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
    "HR policy answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved for publish",
  ].join("\n"),
  generatedAt: "2026-07-07T19:22:00.000Z",
  failOn: ["needs_review"],
  includeArtifacts: ["markdown", "summary_csv"],
  failOnStatus: true,
} as const;
const OPENAPI_IMPORT_REVIEW_RESPONSE_EXAMPLE = {
  report: {
    generatedAt: "2026-07-07T19:22:00.000Z",
    claims: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        claimId: "claim_1",
        claimText: "Employees receive 12 weeks of paid parental leave.",
        modelVerdict: "verified",
        modelReason: "Matched approved policy",
        evidenceTitles: ["HR Policy"],
        evidenceTrustLevels: [],
        evidenceUpdatedAt: [],
        evidenceScores: [],
        evidenceQuotes: ["Employees receive 12 weeks of paid parental leave."],
        reviewerVerdict: "verified",
        reviewerNotes: "Approved for publish",
        finalVerdict: "verified",
        overridden: false,
        originalAnswerFailVerdicts: [],
      },
    ],
    answerGroups: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        label: "HR policy answer",
        claims: [
          {
            answerLabel: "HR policy answer",
            answerPath: "answers/hr.md",
            claimId: "claim_1",
            claimText: "Employees receive 12 weeks of paid parental leave.",
            modelVerdict: "verified",
            modelReason: "Matched approved policy",
            evidenceTitles: ["HR Policy"],
            evidenceTrustLevels: [],
            evidenceUpdatedAt: [],
            evidenceScores: [],
            evidenceQuotes: ["Employees receive 12 weeks of paid parental leave."],
            reviewerVerdict: "verified",
            reviewerNotes: "Approved for publish",
            finalVerdict: "verified",
            overridden: false,
            originalAnswerFailVerdicts: [],
          },
        ],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
          totalClaims: 1,
          reviewedClaims: 1,
          pendingClaims: 0,
          overriddenClaims: 0,
        },
        originalAnswerFailVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      totalClaims: 1,
      reviewedClaims: 1,
      pendingClaims: 0,
      overriddenClaims: 0,
    },
  },
  shouldFail: false,
  failVerdicts: [],
  artifacts: {
    summary_csv:
      "answer_label,answer_path,total_claims,reviewed_claims,pending_claims,overridden_claims,verified,contradicted,unsupported,needs_review\nHR policy answer,answers/hr.md,1,1,0,0,1,0,0,0\n",
  },
} as const;
const OPENAPI_EVALUATE_EXAMPLE = {
  domains: ["hr"],
  generatedAt: "2026-07-07T19:25:00.000Z",
  fixtures: [
    {
      fixturePath: "evaluations/hr-policy.json",
      content: JSON.stringify(
        {
          name: "HR policy API fixture",
          answerPath: "answers/hr.md",
          answer: "Employees receive 12 weeks of paid parental leave.",
          sources: [
            {
              sourcePath: "sources/hr-policy.md",
              title: "HR Policy",
              trustLevel: "high",
              content: "Employees receive 12 weeks of paid parental leave.\n",
            },
          ],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        },
        null,
        2,
      ),
    },
  ],
  includeArtifacts: ["html", "summary_csv", "domain_summary_csv", "aggregate_summary_csv"],
  failOnStatus: true,
} as const;
const OPENAPI_EVALUATE_RESPONSE_EXAMPLE = {
  scorecards: [
    {
      fixtureName: "HR policy API fixture",
      fixturePath: "evaluations/hr-policy.json",
      domain: "hr",
      answerPath: "answers/hr.md",
      answerPreview: "Employees receive 12 weeks of paid parental leave.",
      sourceDirs: [],
      sourcePaths: ["sources/hr-policy.md"],
      report: {
        generatedAt: "2026-07-07T19:25:00.000Z",
        answerPath: "answers/hr.md",
        answerPreview: "Employees receive 12 weeks of paid parental leave.",
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            id: "source-1",
            title: "HR Policy",
            trustLevel: "high",
          },
        ],
        assessments: [
          {
            claim: {
              id: "claim-1",
              text: "Employees receive 12 weeks of paid parental leave.",
            },
            verdict: "verified",
            evidence: [
              {
                documentId: "source-1",
                documentTitle: "HR Policy",
                documentTrustLevel: "high",
                quote: "Employees receive 12 weeks of paid parental leave.",
                score: 1,
              },
            ],
            reason: "The approved source directly supports this claim.",
          },
        ],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [
        {
          index: 0,
          claimText: "Employees receive 12 weeks of paid parental leave.",
          actualVerdict: "verified",
          expectedVerdict: "verified",
          matches: true,
        },
      ],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
  ],
  mismatchCount: 0,
  failureReasons: [],
  summary: {
    fixtureCount: 1,
    matchedClaims: 1,
    totalExpectedClaims: 1,
    score: 1,
    scoreLabel: "100%",
    domains: [
      {
        domain: "hr",
        fixtureCount: 1,
        mismatchCount: 0,
        matchedClaims: 1,
        totalExpectedClaims: 1,
        score: 1,
        scoreLabel: "100%",
      },
    ],
  },
  shouldFail: false,
  artifacts: {
    summary_csv:
      "fixture_name,fixture_path,domain,answer_label,answer_path,matched_claims,total_expected_claims,score,score_label,summary_matches,claim_mismatch,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review,expected_claim_verdicts,actual_claim_verdicts,source_paths\nHR policy API fixture,evaluations/hr-policy.json,hr,,answers/hr.md,1,1,1,100%,true,false,1,0,0,0,1,0,0,0,verified,verified,sources/hr-policy.md\n",
    domain_summary_csv:
      "domain,fixture_count,mismatch_count,matched_claims,total_expected_claims,score,score_label\nhr,1,0,1,1,1,100%\n",
    aggregate_summary_csv:
      "fixture_count,mismatch_count,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_scores,domain_score_labels\n1,0,1,1,1.000,100%,hr,1,0,1.000,100%\n",
  },
} as const;
const OPENAPI_BAD_REQUEST_ERROR_EXAMPLE = {
  error: "sources must be a non-empty array.",
  requestId: "workflow-trace-2026-07-10",
} as const;
const OPENAPI_METHOD_NOT_ALLOWED_ERROR_EXAMPLE = {
  error: "Method not allowed. Use POST.",
  requestId: "workflow-trace-2026-07-10",
} as const;
const OPENAPI_UNSUPPORTED_MEDIA_TYPE_ERROR_EXAMPLE = {
  error: "Content-Type must be application/json.",
  requestId: "workflow-trace-2026-07-10",
} as const;
const OPENAPI_INTERNAL_SERVER_ERROR_EXAMPLE = {
  error: "Internal server error.",
  requestId: "workflow-trace-2026-07-10",
} as const;
const OPENAPI_VERIFY_CONFLICT_RESPONSE_EXAMPLE = {
  report: {
    generatedAt: "2026-07-07T19:16:00.000Z",
    answerPath: "answers/hr.md",
    answerLabel: "HR policy answer",
    answerPreview: "Employees receive 18 weeks of paid parental leave.",
    answer: "Employees receive 18 weeks of paid parental leave.",
    sources: [
      {
        id: "source-1",
        title: "HR Policy",
        updatedAt: "2026-05-31",
        trustLevel: "high",
      },
    ],
    assessments: [
      {
        claim: {
          id: "claim-1",
          text: "Employees receive 18 weeks of paid parental leave.",
        },
        verdict: "contradicted",
        evidence: [
          {
            documentId: "source-1",
            documentTitle: "HR Policy",
            documentTrustLevel: "high",
            documentUpdatedAt: "2026-05-31",
            quote: "Employees receive 12 weeks of paid parental leave.",
            score: 0.857,
          },
        ],
        reason: "A closely matching approved source uses different numeric terms.",
      },
    ],
    summary: {
      verified: 0,
      contradicted: 1,
      unsupported: 0,
      needs_review: 0,
    },
  },
  shouldFail: true,
  failVerdicts: ["contradicted"],
  artifacts: {
    markdown:
      "# Quorum Verification Report\n\nFail policy matched: contradicted\nSummary: 0 verified, 1 contradicted, 0 unsupported, 0 needs review\n",
  },
} as const;
const OPENAPI_VERIFY_BATCH_CONFLICT_RESPONSE_EXAMPLE = {
  report: {
    generatedAt: "2026-07-07T19:20:00.000Z",
    sources: [
      {
        id: "source-1",
        title: "HR Policy",
        trustLevel: "high",
      },
      {
        id: "source-2",
        title: "Support Playbook",
        trustLevel: "medium",
      },
    ],
    sourceCount: 2,
    answerCount: 2,
    answers: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        report: OPENAPI_VERIFY_BATCH_RESPONSE_EXAMPLE.report.answers[0].report,
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "Support queue answer",
        answerPath: "answers/support.md",
        report: {
          generatedAt: "2026-07-07T19:20:00.000Z",
          answerPath: "answers/support.md",
          answerLabel: "Support queue answer",
          answerPreview: "Refunds are always approved instantly.",
          answer: "Refunds are always approved instantly.",
          sources: [
            {
              id: "source-1",
              title: "HR Policy",
              trustLevel: "high",
            },
            {
              id: "source-2",
              title: "Support Playbook",
              trustLevel: "medium",
            },
          ],
          assessments: [
            {
              claim: {
                id: "claim-1",
                text: "Refunds are always approved instantly.",
              },
              verdict: "unsupported",
              evidence: [],
              reason: "No approved source supports this claim closely enough.",
            },
          ],
          summary: {
            verified: 0,
            contradicted: 0,
            unsupported: 1,
            needs_review: 0,
          },
        },
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  },
  shouldFail: true,
  failVerdicts: ["unsupported"],
} as const;
const OPENAPI_IMPORT_REVIEW_CONFLICT_RESPONSE_EXAMPLE = {
  report: {
    claims: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        claimId: "claim_1",
        claimText: "Employees receive 12 weeks of paid parental leave.",
        modelVerdict: "verified",
        modelReason: "Matched approved policy",
        evidenceTitles: ["HR Policy"],
        evidenceTrustLevels: [],
        evidenceUpdatedAt: [],
        evidenceScores: [],
        evidenceQuotes: ["Employees receive 12 weeks of paid parental leave."],
        reviewerVerdict: "",
        reviewerNotes: "",
        finalVerdict: "needs_review",
        overridden: false,
        originalAnswerFailVerdicts: [],
      },
    ],
    answerGroups: [
      {
        answerLabel: "HR policy answer",
        answerPath: "answers/hr.md",
        label: "HR policy answer",
        claims: [
          {
            answerLabel: "HR policy answer",
            answerPath: "answers/hr.md",
            claimId: "claim_1",
            claimText: "Employees receive 12 weeks of paid parental leave.",
            modelVerdict: "verified",
            modelReason: "Matched approved policy",
            evidenceTitles: ["HR Policy"],
            evidenceTrustLevels: [],
            evidenceUpdatedAt: [],
            evidenceScores: [],
            evidenceQuotes: ["Employees receive 12 weeks of paid parental leave."],
            reviewerVerdict: "",
            reviewerNotes: "",
            finalVerdict: "needs_review",
            overridden: false,
            originalAnswerFailVerdicts: [],
          },
        ],
        summary: {
          verified: 0,
          contradicted: 0,
          unsupported: 0,
          needs_review: 1,
          totalClaims: 1,
          reviewedClaims: 0,
          pendingClaims: 1,
          overriddenClaims: 0,
        },
        originalAnswerFailVerdicts: [],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 1,
      totalClaims: 1,
      reviewedClaims: 0,
      pendingClaims: 1,
      overriddenClaims: 0,
    },
  },
  shouldFail: true,
  failVerdicts: ["needs_review"],
} as const;
const OPENAPI_EVALUATE_CONFLICT_RESPONSE_EXAMPLE = {
  scorecards: [
    {
      fixtureName: "HR policy API fixture",
      fixturePath: "evaluations/hr-policy.json",
      domain: "hr",
      generatedAt: "2026-07-07T19:25:00.000Z",
      answerPath: "answers/hr.md",
      answerLabel: "HR reviewer packet",
      summary: {
        expected: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
        actual: {
          verified: 0,
          contradicted: 1,
          unsupported: 0,
          needs_review: 0,
        },
        matches: false,
      },
      claimVerdicts: [
        {
          claimIndex: 0,
          claimText: "Employees receive 18 weeks of paid parental leave.",
          expectedVerdict: "verified",
          actualVerdict: "contradicted",
          matches: false,
        },
      ],
      mismatches: [
        {
          type: "summary",
          field: "verified",
          expected: 1,
          actual: 0,
        },
      ],
      matches: false,
    },
  ],
  summary: {
    fixtureCount: 1,
    mismatchCount: 1,
    matchedFixtures: 0,
    domains: [
      {
        domain: "hr",
        fixtureCount: 1,
        mismatchCount: 1,
        matchedClaims: 0,
        totalExpectedClaims: 1,
        score: 0,
        scoreLabel: "0%",
      },
    ],
  },
  shouldFail: true,
  failureReasons: ["mismatch"],
} as const;

export function createApiServer(options: ApiServerOptions = {}): Server {
  return createServer(async (request, response) => {
    try {
      await handleApiRequest(request, response, options);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        writeApiError(response, error.statusCode, error.message);
        return;
      }

      if (error instanceof EvaluationFixtureValidationError) {
        writeApiError(response, 400, error.message);
        return;
      }

      writeApiError(response, 500, "Internal server error.");
    }
  });
}

export async function startApiServer(options: ApiServerOptions = {}): Promise<StartedApiServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const server = createApiServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Could not determine API server address.");
  }

  return {
    host,
    port: address.port,
    server,
    url: formatServerOrigin(host, address.port),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

function formatServerOrigin(host: string, port: number): string {
  const formattedHost =
    host.includes(":") && !host.startsWith("[") && !host.endsWith("]") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<void> {
  applyRequestIdHeader(request, response);
  applyCorsHeaders(request, response, options.corsAllowedOrigins);
  applyApiDiscoveryHeaders(response);
  const url = new URL(request.url ?? "/", "http://quorum.local").pathname;
  const isHeadRequest = request.method === "HEAD";

  if (request.method === "OPTIONS") {
    writeNoContent(response);
    return;
  }

  if ((request.method === "GET" || isHeadRequest) && url === "/") {
    const discoveryResponse: ApiDiscoveryResponse = {
      requestId: requestId(response),
      service: API_SERVICE_NAME,
      version: API_VERSION,
      openapiPath: OPENAPI_PATH,
      capabilities: API_CAPABILITIES,
      endpoints: API_ENDPOINTS,
    };
    writeJson(response, 200, discoveryResponse, isHeadRequest);
    return;
  }

  if ((request.method === "GET" || isHeadRequest) && url === CAPABILITIES_PATH) {
    const capabilitiesResponse: ApiCapabilitiesResponse = {
      requestId: requestId(response),
      service: API_SERVICE_NAME,
      version: API_VERSION,
      openapiPath: OPENAPI_PATH,
      capabilities: API_CAPABILITIES,
    };
    writeJson(response, 200, capabilitiesResponse, isHeadRequest);
    return;
  }

  if ((request.method === "GET" || isHeadRequest) && (url === HEALTH_PATH || url === HEALTHZ_PATH || url === READYZ_PATH || url === LIVEZ_PATH)) {
    const healthResponse: ApiHealthResponse = {
      ok: true,
      requestId: requestId(response),
      service: API_SERVICE_NAME,
      version: API_VERSION,
    };
    response.setHeader("Cache-Control", "no-store");
    writeJson(response, 200, healthResponse, isHeadRequest);
    return;
  }

  if ((request.method === "GET" || isHeadRequest) && url === VERSION_PATH) {
    const versionResponse: ApiVersionResponse = {
      requestId: requestId(response),
      service: API_SERVICE_NAME,
      version: API_VERSION,
    };
    writeJson(response, 200, versionResponse, isHeadRequest);
    return;
  }

  if ((request.method === "GET" || isHeadRequest) && url === OPENAPI_PATH) {
    writeJson(
      response,
      200,
      createOpenApiDocument({
        serverUrl: request.headers.host ? `http://${request.headers.host}` : undefined,
      }),
      isHeadRequest,
    );
    return;
  }

  if (url === "/verify") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseVerifyRequest(await readJsonBody(request));
    const result = await verifyAnswerContentsResult({
      answer: body.answer,
      answerPath: body.answerPath,
      answerLabel: body.answerLabel,
      sources: body.sources,
      defaultTrustLevel: body.defaultTrustLevel,
      generatedAt: body.generatedAt,
      failOn: body.failOn,
    });
    writeOperationResult(
      response,
      result,
      withArtifacts(result, buildVerifyArtifacts(result, body.includeArtifacts)),
      body.failOnStatus,
    );
    return;
  }

  if (url === "/extract-claims") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseExtractClaimsRequest(await readJsonBody(request));
    const requestId = response.getHeader(API_REQUEST_ID_HEADER);
    const result: ExtractClaimsApiResponse = {
      requestId: typeof requestId === "string" ? requestId : "",
      answerPath: body.answerPath,
      answerLabel: body.answerLabel,
      answerPreview: renderAnswerPreview(body.answer),
      claims: extractClaims(body.answer),
    };
    writeJson(response, 200, result);
    return;
  }

  if (url === "/verify-batch") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseVerifyBatchRequest(await readJsonBody(request));
    const result = await verifyAnswerBatchContentsResult({
      answers: body.answers,
      sources: body.sources,
      defaultTrustLevel: body.defaultTrustLevel,
      generatedAt: body.generatedAt,
      failOn: body.failOn,
    });
    writeOperationResult(
      response,
      result,
      withArtifacts(result, buildVerifyBatchArtifacts(result, body.includeArtifacts)),
      body.failOnStatus,
    );
    return;
  }

  if (url === "/import-review") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseImportReviewRequest(await readJsonBody(request));
    const result = importReviewerDecisionContentsResult({
      reviewCsvContent: body.reviewCsvContent,
      generatedAt: body.generatedAt,
      failOn: body.failOn,
    });
    writeOperationResult(
      response,
      result,
      withArtifacts(result, buildImportReviewArtifacts(result, body.includeArtifacts)),
      body.failOnStatus,
    );
    return;
  }

  if (url === "/evaluate") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseEvaluateRequest(await readJsonBody(request));
    const result = await evaluateFixtureContentsResult({
      fixtures: body.fixtures,
      domains: body.domains,
      generatedAt: body.generatedAt,
      minScore: body.minScore,
    });
    writeOperationResult(
      response,
      result,
      withArtifacts(result, buildEvaluateArtifacts(result, body.includeArtifacts)),
      body.failOnStatus,
    );
    return;
  }

  writeApiError(response, 404, "Not found.");
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers["content-length"];
  if (typeof contentLength === "string") {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > API_MAX_REQUEST_BYTES) {
      request.resume();
      throw requestError(`Request body must not exceed ${API_MAX_REQUEST_BYTES} bytes.`, 413);
    }
  }

  const chunks: Buffer[] = [];
  let bytesRead = 0;

  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    bytesRead += buffer.byteLength;
    if (bytesRead > API_MAX_REQUEST_BYTES) {
      request.resume();
      throw requestError(`Request body must not exceed ${API_MAX_REQUEST_BYTES} bytes.`, 413);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (body.length === 0) {
    throw requestError("Request body must be valid JSON.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw requestError("Request body must be valid JSON.");
  }
}

function requireJsonRequest(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];

  if (typeof contentType !== "string" || !isJsonContentType(contentType)) {
    throw requestError("Content-Type must be application/json.", 415);
  }
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function parseVerifyRequest(value: unknown): {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: InMemorySourceInput[];
  defaultTrustLevel?: ReturnType<typeof parseSourceTrustLevel>;
  generatedAt?: string;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
  includeArtifacts?: ApiVerifyArtifact[];
  failOnStatus?: boolean;
} {
  const record = requireRecord(value, "Verify request body");

  return {
    answer: requireString(record.answer, "answer"),
    answerPath: optionalString(record.answerPath, "answerPath"),
    answerLabel: optionalString(record.answerLabel, "answerLabel"),
    sources: parseSources(record.sources),
    defaultTrustLevel: parseOptionalTrustLevel(record.defaultTrustLevel),
    generatedAt: optionalString(record.generatedAt, "generatedAt"),
    failOn: parseOptionalFailOn(record.failOn),
    includeArtifacts: parseOptionalArtifacts(record.includeArtifacts, VERIFY_ARTIFACTS, "includeArtifacts"),
    failOnStatus: optionalBoolean(record.failOnStatus, "failOnStatus"),
  };
}

function parseExtractClaimsRequest(value: unknown): ExtractClaimsApiRequest {
  const record = requireRecord(value, "Extract claims request body");

  return {
    answer: requireString(record.answer, "answer"),
    answerPath: optionalString(record.answerPath, "answerPath"),
    answerLabel: optionalString(record.answerLabel, "answerLabel"),
  };
}

function parseVerifyBatchRequest(value: unknown): {
  answers: InMemoryAnswerInput[];
  sources: InMemorySourceInput[];
  defaultTrustLevel?: ReturnType<typeof parseSourceTrustLevel>;
  generatedAt?: string;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
  includeArtifacts?: ApiVerifyBatchArtifact[];
  failOnStatus?: boolean;
} {
  const record = requireRecord(value, "Batch verify request body");
  const answersValue = record.answers;

  if (!Array.isArray(answersValue) || answersValue.length === 0) {
    throw requestError("answers must be a non-empty array.");
  }

  return {
    answers: answersValue.map((answer, index) => parseAnswerInput(answer, index)),
    sources: parseSources(record.sources),
    defaultTrustLevel: parseOptionalTrustLevel(record.defaultTrustLevel),
    generatedAt: optionalString(record.generatedAt, "generatedAt"),
    failOn: parseOptionalFailOn(record.failOn),
    includeArtifacts: parseOptionalArtifacts(record.includeArtifacts, VERIFY_BATCH_ARTIFACTS, "includeArtifacts"),
    failOnStatus: optionalBoolean(record.failOnStatus, "failOnStatus"),
  };
}

function parseImportReviewRequest(value: unknown): {
  reviewCsvContent: string;
  generatedAt?: string;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
  includeArtifacts?: ApiImportReviewArtifact[];
  failOnStatus?: boolean;
} {
  const record = requireRecord(value, "Import review request body");

  return {
    reviewCsvContent: requireString(record.reviewCsvContent, "reviewCsvContent"),
    generatedAt: optionalString(record.generatedAt, "generatedAt"),
    failOn: parseOptionalFailOn(record.failOn),
    includeArtifacts: parseOptionalArtifacts(record.includeArtifacts, IMPORT_REVIEW_ARTIFACTS, "includeArtifacts"),
    failOnStatus: optionalBoolean(record.failOnStatus, "failOnStatus"),
  };
}

function parseEvaluateRequest(value: unknown): {
  fixtures: InMemoryEvaluationFixtureInput[];
  domains?: string[];
  generatedAt?: string;
  minScore?: number;
  includeArtifacts?: ApiEvaluateArtifact[];
  failOnStatus?: boolean;
} {
  const record = requireRecord(value, "Evaluate request body");
  const fixturesValue = record.fixtures;

  if (!Array.isArray(fixturesValue) || fixturesValue.length === 0) {
    throw requestError("fixtures must be a non-empty array.");
  }

  return {
    fixtures: fixturesValue.map((fixture, index) => parseFixtureInput(fixture, index)),
    domains: parseOptionalStringArray(record.domains, "domains"),
    generatedAt: optionalString(record.generatedAt, "generatedAt"),
    minScore: parseOptionalScore(record.minScore),
    includeArtifacts: parseOptionalArtifacts(record.includeArtifacts, EVALUATE_ARTIFACTS, "includeArtifacts"),
    failOnStatus: optionalBoolean(record.failOnStatus, "failOnStatus"),
  };
}

function parseOptionalScore(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw requestError("minScore must be a number between 0 and 1.");
  }

  return value;
}

function parseAnswerInput(value: unknown, index: number): InMemoryAnswerInput {
  const record = requireRecord(value, `answers[${index}]`);

  return {
    answer: requireString(record.answer, `answers[${index}].answer`),
    answerPath: optionalString(record.answerPath, `answers[${index}].answerPath`),
    answerLabel: optionalString(record.answerLabel, `answers[${index}].answerLabel`),
  };
}

function parseFixtureInput(value: unknown, index: number): InMemoryEvaluationFixtureInput {
  const record = requireRecord(value, `fixtures[${index}]`);

  return {
    fixturePath: requireString(record.fixturePath, `fixtures[${index}].fixturePath`),
    content: requireString(record.content, `fixtures[${index}].content`),
  };
}

function parseSources(value: unknown): InMemorySourceInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw requestError("sources must be a non-empty array.");
  }

  return value.map((source, index) => {
    const record = requireRecord(source, `sources[${index}]`);

    return {
      sourcePath: requireString(record.sourcePath, `sources[${index}].sourcePath`),
      content: requireString(record.content, `sources[${index}].content`),
      title: optionalString(record.title, `sources[${index}].title`),
      updatedAt: optionalString(record.updatedAt, `sources[${index}].updatedAt`),
      trustLevel: parseOptionalTrustLevel(record.trustLevel),
    };
  });
}

function parseOptionalTrustLevel(
  value: unknown,
  fieldName = "defaultTrustLevel",
): ReturnType<typeof parseSourceTrustLevel> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseSourceTrustLevel(requireString(value, fieldName));
}

function parseOptionalFailOn(value: unknown): ReturnType<typeof parseFailOnVerdicts> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseFailOnVerdicts(value);
}

function parseOptionalArtifacts<T extends string>(
  value: unknown,
  supportedArtifacts: readonly T[],
  fieldName: string,
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw requestError(`${fieldName} must be an array.`);
  }

  const selected: T[] = [];
  const supportedArtifactSet = new Set<string>(supportedArtifacts);

  value.forEach((entry, index) => {
    const artifact = requireString(entry, `${fieldName}[${index}]`);

    if (!supportedArtifactSet.has(artifact)) {
      throw requestError(
        `${fieldName}[${index}] must be one of: ${supportedArtifacts.join(", ")}.`,
      );
    }

    if (!selected.includes(artifact as T)) {
      selected.push(artifact as T);
    }
  });

  return selected;
}

function parseOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw requestError(`${fieldName} must be a non-empty array.`);
  }

  const selected: string[] = [];

  value.forEach((entry, index) => {
    const parsed = requireString(entry, `${fieldName}[${index}]`);

    if (!selected.includes(parsed)) {
      selected.push(parsed);
    }
  });

  return selected;
}

function parseFailOnVerdicts(value: unknown) {
  if (!Array.isArray(value)) {
    throw requestError("failOn must be an array of verdict strings.");
  }

  return value.map((entry, index) => parseClaimVerdict(requireString(entry, `failOn[${index}]`)));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw requestError(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw requestError(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, fieldName);
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw requestError(`${fieldName} must be a boolean.`);
  }

  return value;
}

export function createOpenApiDocument(options: OpenApiDocumentOptions = {}) {
  const serverUrl = options.serverUrl?.trim();
  const normalizedServerUrl =
    serverUrl && serverUrl.length > 0 ? serverUrl.replace(/\/+$/, "") : undefined;
  const servers = normalizedServerUrl ? [{ url: normalizedServerUrl }] : [];
  const topLevelSummarySchema = {
    type: "object",
    properties: {
      verified: { type: "integer", minimum: 0 },
      contradicted: { type: "integer", minimum: 0 },
      unsupported: { type: "integer", minimum: 0 },
      needs_review: { type: "integer", minimum: 0 },
    },
    required: ["verified", "contradicted", "unsupported", "needs_review"],
  };
  const apiResponseHeaders = {
    [API_DISCOVERY_HEADERS.service]: {
      schema: { type: "string" },
      description: "Stable Quorum service identifier.",
    },
    [API_DISCOVERY_HEADERS.version]: {
      schema: { type: "string" },
      description: "Running Quorum version.",
    },
    [API_DISCOVERY_HEADERS.openapiPath]: {
      schema: { type: "string" },
      description: "Relative path to the local OpenAPI document.",
    },
    [API_DISCOVERY_HEADERS.maxRequestBytes]: {
      schema: { type: "integer", minimum: 1 },
      description: "Maximum JSON request body size in bytes.",
    },
    [API_REQUEST_ID_HEADER]: {
      schema: { type: "string", minLength: 1, maxLength: 128 },
      description: "Request correlation identifier echoed by the server.",
    },
  };
  const errorResponse = (
    description: string,
    examples?: Record<string, { summary: string; value: { error: string } }>,
  ) => ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiErrorResponse" },
        ...(examples ? { examples } : {}),
      },
    },
    headers: apiResponseHeaders,
  });
  const postErrorResponses = {
    "400": errorResponse("The JSON body was missing required fields or had invalid values.", {
      invalidRequest: {
        summary: "The request body missed a required field or used an invalid value",
        value: OPENAPI_BAD_REQUEST_ERROR_EXAMPLE,
      },
    }),
    "405": errorResponse("The route only accepts POST.", {
      wrongMethod: {
        summary: "A GET request hit a POST-only route",
        value: OPENAPI_METHOD_NOT_ALLOWED_ERROR_EXAMPLE,
      },
    }),
    "415": errorResponse("The request Content-Type was not application/json.", {
      invalidContentType: {
        summary: "The caller sent a non-JSON Content-Type header",
        value: OPENAPI_UNSUPPORTED_MEDIA_TYPE_ERROR_EXAMPLE,
      },
    }),
    "413": errorResponse(`The JSON request body exceeded the ${API_MAX_REQUEST_BYTES}-byte limit.`, {
      requestTooLarge: {
        summary: "The request body exceeded Quorum's JSON payload limit",
        value: { error: `Request body must not exceed ${API_MAX_REQUEST_BYTES} bytes.` },
      },
    }),
    "500": errorResponse("The server failed while handling the request.", {
      internalError: {
        summary: "The server hit an unexpected runtime failure",
        value: OPENAPI_INTERNAL_SERVER_ERROR_EXAMPLE,
      },
    }),
  };
  const corsPreflightResponse = {
    "204": {
      description: "CORS preflight succeeded for a local browser-style client.",
      headers: {
        "Access-Control-Allow-Origin": {
          schema: { type: "string" },
          description: "Origins allowed to call this endpoint.",
        },
        "Access-Control-Allow-Methods": {
          schema: { type: "string" },
          description: "HTTP methods allowed by this endpoint.",
        },
        "Access-Control-Allow-Headers": {
          schema: { type: "string" },
          description: "Request headers allowed on cross-origin calls.",
        },
        "Access-Control-Expose-Headers": {
          schema: { type: "string" },
          description: "Response headers exposed to browser callers.",
        },
        [API_DISCOVERY_HEADERS.service]: {
          schema: { type: "string" },
          description: "Stable Quorum service identifier.",
        },
        [API_DISCOVERY_HEADERS.version]: {
          schema: { type: "string" },
          description: "Running Quorum version.",
        },
        [API_DISCOVERY_HEADERS.openapiPath]: {
          schema: { type: "string" },
          description: "Relative path to the local OpenAPI document.",
        },
        [API_DISCOVERY_HEADERS.maxRequestBytes]: {
          schema: { type: "integer", minimum: 1 },
          description: "Maximum JSON request body size in bytes.",
        },
        [API_REQUEST_ID_HEADER]: {
          schema: { type: "string", minLength: 1, maxLength: 128 },
          description: "Request correlation identifier echoed by the server.",
        },
      },
    },
    "500": errorResponse("The server failed while handling the request."),
  };
  const corsPreflightOperation = (operationId: string, summary: string) => ({
    operationId,
    summary,
    responses: corsPreflightResponse,
  });

  const document = {
    openapi: "3.1.0",
    info: {
      title: "Quorum Local API",
      version: API_VERSION,
      description:
        "Local JSON API for Quorum answer verification, batch verification, reviewer decision imports, and evaluation workflows.",
    },
    servers,
    paths: {
      "/": {
        get: {
          operationId: "getApiDiscovery",
          summary: "Service discovery",
          responses: {
            "200": {
              description: "Available Quorum local API endpoints.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiIndexResponse" },
                  examples: {
                    discoveryIndex: {
                      summary: "Discover Quorum capabilities and local endpoints",
                      value: OPENAPI_DISCOVERY_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headApiDiscovery",
          summary: "Service discovery headers",
          responses: {
            "200": {
              description: "Header-only discovery response for probes and lightweight clients.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiIndexResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsApiDiscovery", "Service discovery preflight"),
      },
      [CAPABILITIES_PATH]: {
        get: {
          operationId: "getCapabilities",
          summary: "Capability discovery",
          responses: {
            "200": {
              description: "Supported Quorum capabilities without endpoint listings.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiCapabilitiesResponse" },
                  examples: {
                    capabilitiesOnly: {
                      summary: "Read the stable Quorum capability contract",
                      value: OPENAPI_CAPABILITIES_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headCapabilities",
          summary: "Capability discovery headers",
          responses: {
            "200": {
              description: "Header-only capability discovery response for lightweight clients.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiCapabilitiesResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsCapabilities", "Capability discovery preflight"),
      },
      [HEALTH_PATH]: {
        get: {
          operationId: "getHealth",
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Server is ready to accept requests.",
              headers: {
                ...apiResponseHeaders,
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                  examples: {
                    ready: {
                      summary: "A healthy Quorum instance",
                      value: OPENAPI_HEALTH_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headHealth",
          summary: "Readiness check headers",
          responses: {
            "200": {
              description: "Header-only readiness response for load balancers and probes.",
              headers: {
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsHealth", "Readiness preflight"),
      },
      [HEALTHZ_PATH]: {
        get: {
          operationId: "getHealthz",
          summary: "Readiness check alias",
          responses: {
            "200": {
              description: "Server is ready to accept requests through the conventional probe path.",
              headers: {
                ...apiResponseHeaders,
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                  examples: {
                    readinessAlias: {
                      summary: "The conventional readiness probe response",
                      value: OPENAPI_HEALTH_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headHealthz",
          summary: "Readiness check alias headers",
          responses: {
            "200": {
              description: "Header-only readiness response on the conventional probe path.",
              headers: {
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsHealthz", "Readiness alias preflight"),
      },
      [READYZ_PATH]: {
        get: {
          operationId: "getReadyz",
          summary: "Kubernetes readiness check alias",
          responses: {
            "200": {
              description: "Server is ready to accept requests through the Kubernetes probe alias.",
              headers: {
                ...apiResponseHeaders,
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                  examples: {
                    kubernetesReadinessAlias: {
                      summary: "A Kubernetes-compatible readiness probe response",
                      value: OPENAPI_HEALTH_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headReadyz",
          summary: "Kubernetes readiness check alias headers",
          responses: {
            "200": {
              description: "Header-only readiness response on the Kubernetes probe alias.",
              headers: {
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Readiness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsReadyz", "Kubernetes readiness alias preflight"),
      },
      [LIVEZ_PATH]: {
        get: {
          operationId: "getLivez",
          summary: "Kubernetes liveness check alias",
          responses: {
            "200": {
              description: "Server is alive and able to respond through the Kubernetes probe alias.",
              headers: {
                ...apiResponseHeaders,
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Liveness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                  examples: {
                    kubernetesLivenessAlias: {
                      summary: "A Kubernetes-compatible liveness probe response",
                      value: OPENAPI_HEALTH_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headLivez",
          summary: "Kubernetes liveness check alias headers",
          responses: {
            "200": {
              description: "Header-only liveness response on the Kubernetes probe alias.",
              headers: {
                "Cache-Control": {
                  schema: { type: "string", const: "no-store" },
                  description: "Liveness responses must not be cached by probes or intermediaries.",
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsLivez", "Kubernetes liveness alias preflight"),
      },
      [VERSION_PATH]: {
        get: {
          operationId: "getVersion",
          summary: "Service version",
          responses: {
            "200": {
              description: "Quorum service and HTTP contract version.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiVersionResponse" },
                  examples: {
                    version: {
                      summary: "Read the Quorum service version",
                      value: OPENAPI_VERSION_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headVersion",
          summary: "Service version headers",
          responses: {
            "200": {
              description: "Header-only version response for lightweight clients.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiVersionResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsVersion", "Version preflight"),
      },
      [OPENAPI_PATH]: {
        get: {
          operationId: "getOpenApi",
          summary: "OpenAPI description",
          responses: {
            "200": {
              description: "Machine-readable API description for this server.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      openapi: { type: "string" },
                    },
                    required: ["openapi"],
                  },
                  examples: {
                    openApiDocument: {
                      summary: "A partial Quorum OpenAPI document",
                      value: OPENAPI_DOCUMENT_RESPONSE_EXAMPLE,
                    },
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        head: {
          operationId: "headOpenApi",
          summary: "OpenAPI description headers",
          responses: {
            "200": {
              description: "Header-only OpenAPI response for schema probes.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      openapi: { type: "string" },
                    },
                    required: ["openapi"],
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
        options: corsPreflightOperation("optionsOpenApi", "OpenAPI description preflight"),
      },
      "/extract-claims": {
        options: corsPreflightOperation("optionsExtractClaims", "Claim extraction preflight"),
        post: {
          operationId: "postExtractClaims",
          summary: "Extract normalized claims",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answer: { type: "string" },
                    answerPath: {
                      type: "string",
                      description: "Optional source path to preserve for reviewer handoff.",
                    },
                    answerLabel: {
                      type: "string",
                      description: "Optional reviewer-facing label for the answer.",
                    },
                  },
                  required: ["answer"],
                },
                examples: {
                  answerClaims: {
                    summary: "Preview claims before verification",
                    value: {
                      answer: "Employees receive 12 weeks of paid parental leave.",
                      answerPath: "answers/hr-answer.md",
                      answerLabel: "HR reviewer packet",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Normalized atomic claims extracted from the answer.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ExtractClaimsApiResponse" },
                  examples: {
                    extractedClaims: {
                      summary: "One normalized claim",
                      value: {
                        requestId: "extract-claims-contract-test",
                        answerPath: "answers/hr-answer.md",
                        answerLabel: "HR reviewer packet",
                        answerPreview: "Employees receive 12 weeks of paid parental leave.",
                        claims: [{ id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." }],
                      },
                    },
                  },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/verify": {
        options: corsPreflightOperation("optionsVerify", "Verify preflight"),
        post: {
          operationId: "postVerify",
          summary: "Verify one answer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answer: { type: "string" },
                    answerPath: { type: "string" },
                    answerLabel: { type: "string" },
                    sources: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiSourceInput" },
                    },
                    defaultTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
                    generatedAt: { type: "string" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                    includeArtifacts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/VerifyArtifactName" },
                    },
                    failOnStatus: { type: "boolean" },
                  },
                  required: ["answer", "sources"],
                },
                examples: {
                  hrPolicyAnswer: {
                    summary: "Verify a single HR policy answer",
                    value: OPENAPI_VERIFY_EXAMPLE,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Single-answer verification result.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    verifiedAnswer: {
                      summary: "A verified answer with embedded reviewer export artifacts",
                      value: OPENAPI_VERIFY_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SingleVerificationResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiVerifyArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "409": {
              description: "Verification matched the requested fail policy while failOnStatus was enabled.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    failPolicyMatch: {
                      summary: "A contradicted claim triggered the requested fail policy",
                      value: OPENAPI_VERIFY_CONFLICT_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/SingleVerificationResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiVerifyArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/verify-batch": {
        options: corsPreflightOperation("optionsVerifyBatch", "Batch verify preflight"),
        post: {
          operationId: "postVerifyBatch",
          summary: "Verify multiple answers",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answers: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        properties: {
                          answer: { type: "string" },
                          answerPath: { type: "string" },
                          answerLabel: { type: "string" },
                        },
                        required: ["answer"],
                      },
                    },
                    sources: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiSourceInput" },
                    },
                    defaultTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
                    generatedAt: { type: "string" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                    includeArtifacts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/VerifyBatchArtifactName" },
                    },
                    failOnStatus: { type: "boolean" },
                  },
                  required: ["answers", "sources"],
                },
                examples: {
                  mixedBatchReviewQueue: {
                    summary: "Verify a small batch of reviewer-facing answers",
                    value: OPENAPI_VERIFY_BATCH_EXAMPLE,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch verification result.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    verifiedQueue: {
                      summary: "A batch verification result with summary CSV artifacts",
                      value: OPENAPI_VERIFY_BATCH_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/BatchVerificationRunResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiVerifyBatchArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "409": {
              description: "Batch verification matched the requested fail policy while failOnStatus was enabled.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    failPolicyMatch: {
                      summary: "One answer in the batch triggered the requested fail policy",
                      value: OPENAPI_VERIFY_BATCH_CONFLICT_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/BatchVerificationRunResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiVerifyBatchArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/import-review": {
        options: corsPreflightOperation("optionsImportReview", "Reviewer import preflight"),
        post: {
          operationId: "postImportReview",
          summary: "Import reviewer decisions",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reviewCsvContent: { type: "string" },
                    generatedAt: { type: "string" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                    includeArtifacts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ImportReviewArtifactName" },
                    },
                    failOnStatus: { type: "boolean" },
                  },
                  required: ["reviewCsvContent"],
                },
                examples: {
                  reviewedQueueExport: {
                    summary: "Import one reviewed CSV row from a handoff queue",
                    value: OPENAPI_IMPORT_REVIEW_EXAMPLE,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Reviewer decision import result.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    reviewedQueueSummary: {
                      summary: "A reviewed queue import with final verdict totals",
                      value: OPENAPI_IMPORT_REVIEW_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/ReviewerDecisionImportResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiImportReviewArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "409": {
              description: "Imported reviewer decisions matched the requested fail policy while failOnStatus was enabled.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    failPolicyMatch: {
                      summary: "A pending reviewer decision triggered the needs_review fail policy",
                      value: OPENAPI_IMPORT_REVIEW_CONFLICT_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/ReviewerDecisionImportResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiImportReviewArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/evaluate": {
        options: corsPreflightOperation("optionsEvaluate", "Evaluation preflight"),
        post: {
          operationId: "postEvaluate",
          summary: "Evaluate fixtures",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    generatedAt: { type: "string" },
                    domains: {
                      type: "array",
                      minItems: 1,
                      items: { type: "string" },
                    },
                    minScore: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                      description: "Fail the evaluation when the aggregate claim score is below this threshold.",
                    },
                    fixtures: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiEvaluationFixtureInput" },
                    },
                    includeArtifacts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/EvaluateArtifactName" },
                    },
                    failOnStatus: { type: "boolean" },
                  },
                  required: ["fixtures"],
                },
                examples: {
                  hrFixtureScorecard: {
                    summary: "Evaluate one HR fixture against expected verdicts",
                    value: OPENAPI_EVALUATE_EXAMPLE,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Evaluation scorecard batch result.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    matchedFixture: {
                      summary: "A passing HR fixture with summary CSV artifacts",
                      value: OPENAPI_EVALUATE_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/EvaluationBatchRunResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiEvaluationArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "409": {
              description: "Evaluation mismatches were detected while failOnStatus was enabled.",
              headers: apiResponseHeaders,
              content: {
                "application/json": {
                  examples: {
                    mismatchDetected: {
                      summary: "A fixture summary mismatch triggered failOnStatus",
                      value: OPENAPI_EVALUATE_CONFLICT_RESPONSE_EXAMPLE,
                    },
                  },
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/EvaluationBatchRunResult" },
                      {
                        type: "object",
                        properties: {
                          artifacts: { $ref: "#/components/schemas/ApiEvaluationArtifacts" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
    },
    components: {
      parameters: {
        RequestIdHeader: {
          name: API_REQUEST_ID_HEADER,
          in: "header",
          required: false,
          description:
            "Optional caller-supplied correlation identifier. Quorum echoes valid values in the response header and response body.",
          schema: { type: "string", pattern: REQUEST_ID_PATTERN.source, minLength: 1, maxLength: 128 },
        },
      },
      schemas: {
        ApiErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            requestId: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              description: "Request correlation identifier echoed by the server.",
            },
          },
          required: ["error", "requestId"],
        },
        ApiDiscoveryEndpoint: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: ["GET", "HEAD", "POST", "OPTIONS"],
            },
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["method", "path", "description"],
        },
        ApiIndexResponse: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
            openapiPath: { type: "string", const: OPENAPI_PATH },
            capabilities: { $ref: "#/components/schemas/ApiCapabilities" },
            endpoints: {
              type: "array",
              items: { $ref: "#/components/schemas/ApiDiscoveryEndpoint" },
            },
          },
          required: ["requestId", "service", "version", "openapiPath", "capabilities", "endpoints"],
        },
        ApiCapabilitiesResponse: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
            openapiPath: { type: "string", const: OPENAPI_PATH },
            capabilities: { $ref: "#/components/schemas/ApiCapabilities" },
          },
          required: ["requestId", "service", "version", "openapiPath", "capabilities"],
        },
        ApiVersionResponse: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
          },
          required: ["requestId", "service", "version"],
        },
        ApiCapabilities: {
          type: "object",
          properties: {
            httpMethods: {
              type: "array",
              items: {
                type: "string",
                enum: ["GET", "HEAD", "POST", "OPTIONS"],
              },
            },
            requestContentTypes: {
              type: "array",
              items: { type: "string" },
              description: "Content types accepted by JSON request endpoints.",
            },
            maxRequestBytes: {
              type: "integer",
              minimum: 1,
              description: "Maximum JSON request body size accepted by POST endpoints.",
            },
            sourceExtensions: {
              type: "array",
              items: { type: "string" },
            },
            answerExtensions: {
              type: "array",
              items: { type: "string" },
            },
            verdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
            trustLevels: {
              type: "array",
              items: { $ref: "#/components/schemas/SourceTrustLevel" },
            },
            verifyArtifacts: {
              type: "array",
              items: { $ref: "#/components/schemas/VerifyArtifactName" },
            },
            verifyBatchArtifacts: {
              type: "array",
              items: { $ref: "#/components/schemas/VerifyBatchArtifactName" },
            },
            importReviewArtifacts: {
              type: "array",
              items: { $ref: "#/components/schemas/ImportReviewArtifactName" },
            },
            evaluateArtifacts: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluateArtifactName" },
            },
            extractClaims: {
              type: "boolean",
              description: "Whether the API exposes normalized claim extraction.",
            },
          },
          required: [
            "httpMethods",
            "requestContentTypes",
            "maxRequestBytes",
            "sourceExtensions",
            "answerExtensions",
            "verdicts",
            "trustLevels",
            "verifyArtifacts",
            "verifyBatchArtifacts",
            "importReviewArtifacts",
            "evaluateArtifacts",
            "extractClaims",
          ],
        },
        ExtractClaimsApiResponse: {
          type: "object",
          properties: {
            requestId: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              description: "Request correlation identifier echoed by the server.",
            },
            answerPath: {
              type: "string",
              description: "Optional answer path preserved for reviewer handoff.",
            },
            answerLabel: {
              type: "string",
              description: "Optional reviewer-facing answer label.",
            },
            answerPreview: {
              type: "string",
              description: "Normalized, truncated answer text for queue and reviewer context.",
            },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/AtomicClaim" },
            },
          },
          required: ["requestId", "answerPreview", "claims"],
        },
        VerifyArtifactName: {
          type: "string",
          enum: VERIFY_ARTIFACTS,
        },
        VerifyBatchArtifactName: {
          type: "string",
          enum: VERIFY_BATCH_ARTIFACTS,
        },
        ImportReviewArtifactName: {
          type: "string",
          enum: IMPORT_REVIEW_ARTIFACTS,
        },
        EvaluateArtifactName: {
          type: "string",
          enum: EVALUATE_ARTIFACTS,
        },
        ApiVerifyArtifacts: {
          type: "object",
          properties: {
            text: { type: "string" },
            markdown: { type: "string" },
            html: { type: "string" },
            result_json: { type: "string" },
            review_csv: { type: "string" },
            summary_csv: { type: "string" },
          },
        },
        ApiVerifyBatchArtifacts: {
          type: "object",
          properties: {
            text: { type: "string" },
            markdown: { type: "string" },
            html: { type: "string" },
            result_json: { type: "string" },
            review_csv: { type: "string" },
            summary_csv: { type: "string" },
          },
        },
        ApiImportReviewArtifacts: {
          type: "object",
          properties: {
            text: { type: "string" },
            markdown: { type: "string" },
            html: { type: "string" },
            result_json: { type: "string" },
            summary_csv: { type: "string" },
          },
        },
        ApiEvaluationArtifacts: {
          type: "object",
          properties: {
            text: { type: "string" },
            markdown: { type: "string" },
            html: { type: "string" },
            result_json: { type: "string" },
            summary_csv: { type: "string" },
            domain_summary_csv: { type: "string" },
            aggregate_summary_csv: { type: "string" },
          },
        },
        ApiHealthResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: true },
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
          },
          required: ["ok", "requestId", "service", "version"],
        },
        ApiSourceInput: {
          type: "object",
          properties: {
            sourcePath: { type: "string" },
            content: { type: "string" },
            title: { type: "string" },
            updatedAt: { type: "string" },
            trustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
          },
          required: ["sourcePath", "content"],
        },
        ApiEvaluationFixtureInput: {
          type: "object",
          properties: {
            fixturePath: { type: "string" },
            content: {
              type: "string",
              description: "JSON-encoded evaluation fixture document.",
              contentMediaType: "application/json",
              contentSchema: { $ref: "#/components/schemas/EvaluationFixture" },
            },
          },
          required: ["fixturePath", "content"],
        },
        EvaluationFixture: {
          type: "object",
          properties: {
            name: { type: "string" },
            domain: { type: "string" },
            answerPath: { type: "string" },
            answer: { type: "string" },
            answerLabel: { type: "string" },
            sourcePaths: { type: "array", items: { type: "string" } },
            sourceDirs: { type: "array", items: { type: "string" } },
            sources: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/components/schemas/ApiSourceInput" },
            },
            defaultTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
            expectedSummary: { $ref: "#/components/schemas/VerificationSummary" },
            expectedClaimVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["name", "answerPath", "expectedSummary"],
        },
        SourceTrustLevel: {
          type: "string",
          enum: [...SOURCE_TRUST_LEVELS],
        },
        ClaimVerdict: {
          type: "string",
          enum: ["verified", "unsupported", "contradicted", "needs_review"],
        },
        SourceSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            updatedAt: { type: "string" },
            trustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
          },
          required: ["id", "title", "trustLevel"],
        },
        AtomicClaim: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
          },
          required: ["id", "text"],
        },
        EvidenceSnippet: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            documentTitle: { type: "string" },
            documentTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
            documentUpdatedAt: { type: "string" },
            quote: { type: "string" },
            score: { type: "number" },
          },
          required: ["documentId", "documentTitle", "documentTrustLevel", "quote", "score"],
        },
        ClaimAssessment: {
          type: "object",
          properties: {
            claim: { $ref: "#/components/schemas/AtomicClaim" },
            verdict: { $ref: "#/components/schemas/ClaimVerdict" },
            evidence: {
              type: "array",
              items: { $ref: "#/components/schemas/EvidenceSnippet" },
            },
            reason: { type: "string" },
          },
          required: ["claim", "verdict", "evidence", "reason"],
        },
        VerificationSummary: topLevelSummarySchema,
        VerificationReport: {
          type: "object",
          properties: {
            generatedAt: { type: "string" },
            answerPath: { type: "string" },
            answerLabel: { type: "string" },
            answerPreview: { type: "string" },
            answer: { type: "string" },
            sources: {
              type: "array",
              items: { $ref: "#/components/schemas/SourceSummary" },
            },
            assessments: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimAssessment" },
            },
            summary: { $ref: "#/components/schemas/VerificationSummary" },
          },
          required: [
            "generatedAt",
            "answerPreview",
            "answer",
            "sources",
            "assessments",
            "summary",
          ],
        },
        SingleVerificationResult: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            report: { $ref: "#/components/schemas/VerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["requestId", "report", "shouldFail", "failVerdicts"],
        },
        BatchVerificationResult: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            report: { $ref: "#/components/schemas/VerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["answerLabel", "answerPath", "report", "shouldFail", "failVerdicts"],
        },
        BatchVerificationSummary: {
          allOf: [
            topLevelSummarySchema,
            {
              type: "object",
              properties: {
                answersWithoutClaims: { type: "integer", minimum: 0 },
                answersWithFailures: { type: "integer", minimum: 0 },
              },
              required: ["answersWithoutClaims", "answersWithFailures"],
            },
          ],
        },
        BatchVerificationReport: {
          type: "object",
          properties: {
            generatedAt: { type: "string" },
            sources: {
              type: "array",
              items: { $ref: "#/components/schemas/SourceSummary" },
            },
            sourceCount: { type: "integer", minimum: 0 },
            answerCount: { type: "integer", minimum: 0 },
            answers: {
              type: "array",
              items: { $ref: "#/components/schemas/BatchVerificationResult" },
            },
            summary: { $ref: "#/components/schemas/BatchVerificationSummary" },
          },
          required: [
            "generatedAt",
            "sources",
            "sourceCount",
            "answerCount",
            "answers",
            "summary",
          ],
        },
        BatchVerificationRunResult: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            report: { $ref: "#/components/schemas/BatchVerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["requestId", "report", "shouldFail", "failVerdicts"],
        },
        ImportedReviewerDecision: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            answerPreview: { type: "string" },
            originalAnswerFailPolicy: {
              type: "string",
              enum: ["matched", "clear"],
            },
            originalAnswerFailVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
            claimId: { type: "string" },
            claimText: { type: "string" },
            modelVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            modelReason: { type: "string" },
            evidenceTitles: { type: "array", items: { type: "string" } },
            evidenceTrustLevels: { type: "array", items: { type: "string" } },
            evidenceUpdatedAt: { type: "array", items: { type: "string" } },
            evidenceScores: { type: "array", items: { type: "string" } },
            evidenceQuotes: { type: "array", items: { type: "string" } },
            reviewerVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            reviewerNotes: { type: "string" },
            finalVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            overridden: { type: "boolean" },
          },
          required: [
            "originalAnswerFailVerdicts",
            "claimId",
            "claimText",
            "modelVerdict",
            "modelReason",
            "evidenceTitles",
            "evidenceTrustLevels",
            "evidenceUpdatedAt",
            "evidenceScores",
            "evidenceQuotes",
            "finalVerdict",
            "overridden",
          ],
        },
        ReviewerDecisionImportSummary: {
          allOf: [
            topLevelSummarySchema,
            {
              type: "object",
              properties: {
                totalClaims: { type: "integer", minimum: 0 },
                reviewedClaims: { type: "integer", minimum: 0 },
                pendingClaims: { type: "integer", minimum: 0 },
                overriddenClaims: { type: "integer", minimum: 0 },
              },
              required: [
                "totalClaims",
                "reviewedClaims",
                "pendingClaims",
                "overriddenClaims",
              ],
            },
          ],
        },
        ReviewerDecisionGroup: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            answerPreview: { type: "string" },
            originalAnswerFailPolicy: {
              type: "string",
              enum: ["matched", "clear"],
            },
            originalAnswerFailVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
            label: { type: "string" },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/ImportedReviewerDecision" },
            },
            emptyStateReason: { type: "string" },
            summary: { $ref: "#/components/schemas/ReviewerDecisionImportSummary" },
          },
          required: ["originalAnswerFailVerdicts", "label", "claims", "summary"],
        },
        ReviewerDecisionImportReport: {
          type: "object",
          properties: {
            generatedAt: { type: "string" },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/ImportedReviewerDecision" },
            },
            answerGroups: {
              type: "array",
              items: { $ref: "#/components/schemas/ReviewerDecisionGroup" },
            },
            summary: { $ref: "#/components/schemas/ReviewerDecisionImportSummary" },
          },
          required: ["generatedAt", "claims", "answerGroups", "summary"],
        },
        ReviewerDecisionImportResult: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            report: { $ref: "#/components/schemas/ReviewerDecisionImportReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["requestId", "report", "shouldFail", "failVerdicts"],
        },
        EvaluationClaimScore: {
          type: "object",
          properties: {
            index: { type: "integer", minimum: 0 },
            claimText: { type: "string" },
            actualVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            expectedVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            matches: { type: "boolean" },
          },
          required: ["index", "claimText", "actualVerdict", "matches"],
        },
        EvaluationScorecard: {
          type: "object",
          properties: {
            fixtureName: { type: "string" },
            domain: { type: "string" },
            fixturePath: { type: "string" },
            answerPath: { type: "string" },
            answerLabel: { type: "string" },
            answerPreview: { type: "string" },
            sourceDirs: { type: "array", items: { type: "string" } },
            sourcePaths: { type: "array", items: { type: "string" } },
            report: { $ref: "#/components/schemas/VerificationReport" },
            expectedSummary: { $ref: "#/components/schemas/VerificationSummary" },
            actualSummary: { $ref: "#/components/schemas/VerificationSummary" },
            summaryMatches: { type: "boolean" },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluationClaimScore" },
            },
            matchedClaims: { type: "integer", minimum: 0 },
            totalExpectedClaims: { type: "integer", minimum: 0 },
            score: { type: "number" },
          },
          required: [
            "fixtureName",
            "answerPath",
            "answerPreview",
            "sourceDirs",
            "sourcePaths",
            "report",
            "expectedSummary",
            "actualSummary",
            "summaryMatches",
            "claims",
            "matchedClaims",
            "totalExpectedClaims",
            "score",
          ],
        },
        EvaluationAggregateSummary: {
          type: "object",
          properties: {
            fixtureCount: { type: "integer", minimum: 0 },
            matchedClaims: { type: "integer", minimum: 0 },
            totalExpectedClaims: { type: "integer", minimum: 0 },
            score: { type: ["number", "null"] },
            scoreLabel: { type: "string" },
            domains: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluationDomainAggregateSummary" },
            },
          },
          required: ["fixtureCount", "matchedClaims", "totalExpectedClaims", "score", "scoreLabel", "domains"],
        },
        EvaluationDomainAggregateSummary: {
          type: "object",
          properties: {
            domain: { type: "string" },
            fixtureCount: { type: "integer", minimum: 0 },
            mismatchCount: { type: "integer", minimum: 0 },
            matchedClaims: { type: "integer", minimum: 0 },
            totalExpectedClaims: { type: "integer", minimum: 0 },
            score: { type: ["number", "null"] },
            scoreLabel: { type: "string" },
          },
          required: [
            "domain",
            "fixtureCount",
            "mismatchCount",
            "matchedClaims",
            "totalExpectedClaims",
            "score",
            "scoreLabel",
          ],
        },
        EvaluationBatchRunResult: {
          type: "object",
          properties: {
            requestId: { type: "string", minLength: 1, maxLength: 128 },
            scorecards: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluationScorecard" },
            },
            shouldFail: { type: "boolean" },
            failureReasons: {
              type: "array",
              items: { type: "string", enum: ["mismatch", "min_score"] },
              description: "Evaluation gates that caused shouldFail to be true.",
            },
            mismatchCount: { type: "integer", minimum: 0 },
            minScore: { type: "number", minimum: 0, maximum: 1 },
            scoreThresholdPassed: { type: "boolean" },
            summary: { $ref: "#/components/schemas/EvaluationAggregateSummary" },
          },
          required: ["requestId", "scorecards", "shouldFail", "failureReasons", "mismatchCount", "summary"],
        },
      },
    },
  };

  const methods = ["get", "head", "post", "options"] as const;
  for (const pathItem of Object.values(document.paths)) {
    const pathItemRecord = pathItem as Record<string, unknown>;
    for (const method of methods) {
      const operation = pathItemRecord[method];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationRecord = operation as { parameters?: unknown[] };
      operationRecord.parameters = [
        { $ref: "#/components/parameters/RequestIdHeader" },
        ...(Array.isArray(operationRecord.parameters) ? operationRecord.parameters : []),
      ];
    }
  }

  return document;
}

function buildVerifyArtifacts(
  result: Awaited<ReturnType<typeof verifyAnswerContentsResult>>,
  includeArtifacts?: ApiVerifyArtifact[],
) {
  return buildArtifacts(includeArtifacts, {
    text: () => renderTextReport(result.report, result.failVerdicts),
    markdown: () => renderMarkdownReport(result.report, result.failVerdicts),
    html: () => renderHtmlReport(result.report, result.failVerdicts),
    result_json: () => JSON.stringify(result, null, 2),
    review_csv: () => renderReviewerDecisionCsv(result.report, result.failVerdicts),
    summary_csv: () => renderSummaryCsv(result.report, result.failVerdicts),
  });
}

function buildVerifyBatchArtifacts(
  result: Awaited<ReturnType<typeof verifyAnswerBatchContentsResult>>,
  includeArtifacts?: ApiVerifyBatchArtifact[],
) {
  return buildArtifacts(includeArtifacts, {
    text: () => renderBatchTextReport(result.report),
    markdown: () => renderBatchMarkdownReport(result.report),
    html: () => renderBatchHtmlReport(result.report),
    result_json: () => JSON.stringify(result, null, 2),
    review_csv: () => renderBatchReviewerDecisionCsv(result.report),
    summary_csv: () => renderBatchSummaryCsv(result.report),
  });
}

function buildImportReviewArtifacts(
  result: ReturnType<typeof importReviewerDecisionContentsResult>,
  includeArtifacts?: ApiImportReviewArtifact[],
) {
  return buildArtifacts(includeArtifacts, {
    text: () => renderReviewerDecisionImportReport(result.report, result.failVerdicts),
    markdown: () => renderReviewerDecisionImportMarkdownReport(result.report, result.failVerdicts),
    html: () => renderReviewerDecisionImportHtmlReport(result.report, result.failVerdicts),
    result_json: () => JSON.stringify(result, null, 2),
    summary_csv: () => renderReviewerDecisionImportSummaryCsv(result.report, result.failVerdicts),
  });
}

function buildEvaluateArtifacts(
  result: Awaited<ReturnType<typeof evaluateFixtureContentsResult>>,
  includeArtifacts?: ApiEvaluateArtifact[],
) {
  return buildArtifacts(includeArtifacts, {
    text: () => renderEvaluationTextReport(result.scorecards),
    markdown: () => renderEvaluationMarkdownReport(result.scorecards),
    html: () => renderEvaluationHtmlReport(result.scorecards),
    result_json: () => JSON.stringify(result, null, 2),
    summary_csv: () => renderEvaluationSummaryCsv(result.scorecards),
    domain_summary_csv: () => renderEvaluationDomainSummaryCsv(result.scorecards),
    aggregate_summary_csv: () => renderEvaluationAggregateSummaryCsv(result.scorecards),
  });
}

function buildArtifacts<T extends string>(
  includeArtifacts: readonly T[] | undefined,
  renderers: Record<T, () => string>,
): Partial<Record<T, string>> | undefined {
  if (!includeArtifacts || includeArtifacts.length === 0) {
    return undefined;
  }

  const artifacts: Partial<Record<T, string>> = {};

  includeArtifacts.forEach((artifact) => {
    artifacts[artifact] = renderers[artifact]();
  });

  return artifacts;
}

function withArtifacts<T extends object, A extends Record<string, string>>(
  result: T,
  artifacts: A | undefined,
): T | (T & { artifacts: A }) {
  if (!artifacts || Object.keys(artifacts).length === 0) {
    return result;
  }

  return {
    ...result,
    artifacts,
  };
}

function writeOperationResult<T extends { shouldFail: boolean }>(
  response: ServerResponse,
  result: T,
  payload: object,
  failOnStatus?: boolean,
): void {
  const requestId = response.getHeader(API_REQUEST_ID_HEADER);
  writeJson(response, failOnStatus && result.shouldFail ? 409 : 200, {
    ...payload,
    ...(typeof requestId === "string" ? { requestId } : {}),
  });
}

function writeMethodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader("Allow", allow);
  writeApiError(response, 405, `Method not allowed. Use ${allow}.`);
}

function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins?: readonly string[],
): void {
  if (allowedOrigins === undefined) {
    response.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const requestOrigin = request.headers.origin;

    if (typeof requestOrigin === "string" && allowedOrigins.includes(requestOrigin)) {
      response.setHeader("Access-Control-Allow-Origin", requestOrigin);
    }

    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.setHeader("Access-Control-Allow-Headers", API_CORS_ALLOWED_HEADERS);
  response.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
}

function applyApiDiscoveryHeaders(response: ServerResponse): void {
  response.setHeader(API_DISCOVERY_HEADERS.service, API_SERVICE_NAME);
  response.setHeader(API_DISCOVERY_HEADERS.version, API_VERSION);
  response.setHeader(API_DISCOVERY_HEADERS.openapiPath, OPENAPI_PATH);
  response.setHeader(API_DISCOVERY_HEADERS.maxRequestBytes, API_MAX_REQUEST_BYTES);
}

function applyRequestIdHeader(request: IncomingMessage, response: ServerResponse): void {
  const requestedId = request.headers[API_REQUEST_ID_HEADER.toLowerCase()];
  const requestId = typeof requestedId === "string" && REQUEST_ID_PATTERN.test(requestedId)
    ? requestedId
    : randomUUID();

  response.setHeader(API_REQUEST_ID_HEADER, requestId);
}

function requestId(response: ServerResponse): string {
  const value = response.getHeader(API_REQUEST_ID_HEADER);
  return typeof value === "string" ? value : "";
}

function writeNoContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.end();
}

function writeApiError(response: ServerResponse, statusCode: number, error: string): void {
  const requestId = response.getHeader(API_REQUEST_ID_HEADER);
  writeJson(response, statusCode, {
    error,
    ...(typeof requestId === "string" ? { requestId } : {}),
  });
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  omitBody = false,
): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body, "utf8"));

  if (omitBody) {
    response.end();
    return;
  }

  response.end(body);
}

class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

function requestError(message: string, statusCode?: number): ApiRequestError {
  return new ApiRequestError(message, statusCode);
}
