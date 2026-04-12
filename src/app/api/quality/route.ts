import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type PhaseEndpointResult = {
  endpoint: string;
  avg_ms: number;
  p95_ms: number;
  max_ms: number;
  status: "pass" | "warn";
  score: number;
};

type PhaseQualityReport = {
  timestamp_utc: string;
  profile?: string;
  samples: number;
  thresholds: {
    max_avg_ms: number;
    max_p95_ms: number;
    max_max_ms: number;
  };
  results: PhaseEndpointResult[];
  overall_score?: number;
  overall_status: "pass" | "warn";
};

type SelfCheckReport = {
  timestamp_utc: string;
  strict_mode: boolean;
  dry_run: boolean;
  checks: Record<string, string>;
  oanda: {
    http_code: string;
    latency_ms: string;
    warn_threshold_ms: string;
    fail_threshold_ms: string;
  };
};

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const startedAt = Date.now();
  const root = process.cwd();
  const qualityPath = path.join(root, "logs", "phase-quality.json");
  const selfCheckPath = path.join(root, "logs", "self-check-report.json");

  const [quality, selfCheck] = await Promise.all([
    readJsonIfExists<PhaseQualityReport>(qualityPath),
    readJsonIfExists<SelfCheckReport>(selfCheckPath),
  ]);

  if (!quality) {
    return NextResponse.json(
      {
        success: false,
        message: "Phase quality report not found. Run ./run.sh --phase-test first.",
        api_latency_ms: Date.now() - startedAt,
      },
      { status: 404 }
    );
  }

  const overallScore = quality.overall_score ?? 0;
  const readyForPromotion = quality.overall_status === "pass" && overallScore >= 85;
  const slowestEndpoint = quality.results.reduce<PhaseEndpointResult | null>(
    (slowest, item) => {
      if (!slowest) return item;
      return item.p95_ms > slowest.p95_ms ? item : slowest;
    },
    null
  );

  return NextResponse.json({
    success: true,
    quality: {
      profile: quality.profile ?? "prod",
      timestamp_utc: quality.timestamp_utc,
      samples: quality.samples,
      thresholds: quality.thresholds,
      overall_status: quality.overall_status,
      overall_score: overallScore,
      ready_for_promotion: readyForPromotion,
      slowest_endpoint: slowestEndpoint,
      endpoints: quality.results,
    },
    self_check: selfCheck,
    recommendations: [
      readyForPromotion
        ? "Quality gate passed: safe to continue with next phase."
        : "Quality gate warning: tune thresholds or optimize endpoints before promotion.",
    ],
    api_latency_ms: Date.now() - startedAt,
  });
}
