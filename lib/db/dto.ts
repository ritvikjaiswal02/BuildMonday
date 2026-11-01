/**
 * JSON shapes returned by API routes and passed to client components, plus
 * pure row mappers. Dates become ISO strings; secrets and embeddings are never
 * included. No database access here, so client code may `import type` from it.
 */
import type {
  AlertMode,
  ApiToken,
  ChurnRisk,
  Effort,
  Feedback,
  FeedbackSourceKind,
  FeedbackStatus,
  FeedbackTags,
  IngestChannel,
  Integration,
  IntegrationConfig,
  IntegrationKind,
  Issue as IssueRow,
  IssueSnapshot,
  IssueTrend,
  IssueWorkflowStatus,
  MemberRole,
  MonitorSourceKind,
  PrdStubJson,
  Product,
  RecommendedAction,
  Run,
  RunStats,
  RunStatus,
  RunTrigger,
  Severity,
  Source,
  SourceConfig,
  SourceRole,
  TrackerTarget,
  WidgetSettings,
} from "./schema";

export interface ProductDTO {
  id: string;
  name: string;
  websiteUrl: string | null;
  description: string | null;
  publicKey: string;
  monitoringEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  alertThreshold: number;
  autofileEnabled: boolean;
  autofileTarget: TrackerTarget | null;
  autofileThreshold: number;
  widgetSettings: WidgetSettings;
  allowedOrigins: string[];
  createdAt: string;
}

export interface SourceDTO {
  id: string;
  productId: string;
  kind: MonitorSourceKind;
  config: SourceConfig;
  label: string;
  role: SourceRole;
  competitorName: string | null;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastItemCount: number | null;
  createdAt: string;
}

export interface FeedbackDTO {
  id: string;
  productId: string;
  sourceId: string | null;
  channel: IngestChannel;
  sourceKind: FeedbackSourceKind;
  role: SourceRole;
  competitorName: string | null;
  text: string;
  title: string | null;
  author: string | null;
  authorEmail: string | null;
  rating: number | null;
  url: string | null;
  postedAt: string | null;
  ingestedAt: string;
  status: FeedbackStatus;
  issueId: string | null;
  issueTitle: string | null;
  tags: FeedbackTags | null;
  /** meta.site */
  site: string | null;
}

export interface IssueDTO {
  id: string;
  productId: string;
  scope: SourceRole;
  competitorName: string | null;
  title: string;
  rankingReason: string | null;
  category: string | null;
  severity: Severity;
  churnRisk: ChurnRisk;
  effort: Effort;
  affectedSegment: string;
  recommendedAction: RecommendedAction;
  priorityScore: number;
  frequency: number;
  rank: number | null;
  evidence: string[];
  sourceMix: Partial<Record<FeedbackSourceKind, number>>;
  status: IssueWorkflowStatus;
  trend: IssueTrend;
  prd: PrdStubJson | null;
  prdGeneratedAt: string | null;
  externalTarget: TrackerTarget | null;
  externalUrl: string | null;
  filedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface IssueSnapshotDTO {
  runId: string;
  createdAt: string;
  frequency: number;
  priorityScore: number;
  rank: number | null;
  trend: IssueTrend;
}

export interface RunDTO {
  id: string;
  productId: string;
  trigger: RunTrigger;
  status: RunStatus;
  stats: RunStats;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  durationMs: number | null;
}

export interface IntegrationDTO {
  kind: IntegrationKind;
  status: "connected" | "error";
  config: IntegrationConfig;
  secretHint: string;
  lastError: string | null;
  connectedAt: string;
}

export interface ApiTokenDTO {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface MemberDTO {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: MemberRole;
  notifyDigest: boolean;
  alertMode: AlertMode;
  joinedAt: string;
}

export interface InviteDTO {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Date (or ISO string from a raw query) to ISO string. */
export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Nullable variant of `iso`. */
export function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return iso(value);
}

export function toProductDTO(r: Product): ProductDTO {
  return {
    id: r.id,
    name: r.name,
    websiteUrl: r.websiteUrl,
    description: r.description,
    publicKey: r.publicKey,
    monitoringEnabled: r.monitoringEnabled,
    lastRunAt: isoOrNull(r.lastRunAt),
    nextRunAt: isoOrNull(r.nextRunAt),
    alertThreshold: r.alertThreshold,
    autofileEnabled: r.autofileEnabled,
    autofileTarget: r.autofileTarget ?? null,
    autofileThreshold: r.autofileThreshold,
    widgetSettings: r.widgetSettings,
    allowedOrigins: r.allowedOrigins ?? [],
    createdAt: iso(r.createdAt),
  };
}

export function toSourceDTO(r: Source): SourceDTO {
  return {
    id: r.id,
    productId: r.productId,
    kind: r.kind,
    config: r.config,
    label: r.label,
    role: r.role,
    competitorName: r.competitorName,
    enabled: r.enabled,
    lastFetchedAt: isoOrNull(r.lastFetchedAt),
    lastSuccessAt: isoOrNull(r.lastSuccessAt),
    lastError: r.lastError,
    lastItemCount: r.lastItemCount,
    createdAt: iso(r.createdAt),
  };
}

export function toFeedbackDTO(r: Feedback, issueTitle?: string | null): FeedbackDTO {
  const site = r.meta && typeof r.meta.site === "string" ? r.meta.site : null;
  return {
    id: r.id,
    productId: r.productId,
    sourceId: r.sourceId,
    channel: r.channel,
    sourceKind: r.sourceKind,
    role: r.role,
    competitorName: r.competitorName,
    text: r.text,
    title: r.title,
    author: r.author,
    authorEmail: r.authorEmail,
    rating: r.rating,
    url: r.url,
    postedAt: isoOrNull(r.postedAt),
    ingestedAt: iso(r.ingestedAt),
    status: r.status,
    issueId: r.issueId,
    issueTitle: issueTitle ?? null,
    tags: r.tags ?? null,
    site,
  };
}

export function toIssueDTO(r: IssueRow): IssueDTO {
  return {
    id: r.id,
    productId: r.productId,
    scope: r.scope,
    competitorName: r.competitorName,
    title: r.title,
    rankingReason: r.rankingReason,
    category: r.category,
    severity: r.severity,
    churnRisk: r.churnRisk,
    effort: r.effort,
    affectedSegment: r.affectedSegment,
    recommendedAction: r.recommendedAction,
    priorityScore: r.priorityScore,
    frequency: r.frequency,
    rank: r.rank,
    evidence: r.evidence ?? [],
    sourceMix: r.sourceMix ?? {},
    status: r.status,
    trend: r.trend,
    prd: r.prd ?? null,
    prdGeneratedAt: isoOrNull(r.prdGeneratedAt),
    externalTarget: r.externalTarget ?? null,
    externalUrl: r.externalUrl,
    filedAt: isoOrNull(r.filedAt),
    firstSeenAt: iso(r.firstSeenAt),
    lastSeenAt: iso(r.lastSeenAt),
    resolvedAt: isoOrNull(r.resolvedAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function toIssueSnapshotDTO(r: IssueSnapshot): IssueSnapshotDTO {
  return {
    runId: r.runId,
    createdAt: iso(r.createdAt),
    frequency: r.frequency,
    priorityScore: r.priorityScore,
    rank: r.rank,
    trend: r.trend,
  };
}

export function toRunDTO(r: Run): RunDTO {
  const durationMs =
    r.startedAt && r.finishedAt ? Math.max(0, new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) : null;
  return {
    id: r.id,
    productId: r.productId,
    trigger: r.trigger,
    status: r.status,
    stats: r.stats,
    error: r.error,
    startedAt: isoOrNull(r.startedAt),
    finishedAt: isoOrNull(r.finishedAt),
    createdAt: iso(r.createdAt),
    durationMs,
  };
}

export function toIntegrationDTO(r: Integration): IntegrationDTO {
  return {
    kind: r.kind,
    status: r.status,
    config: r.config,
    secretHint: r.secretHint,
    lastError: r.lastError,
    connectedAt: iso(r.updatedAt ?? r.createdAt),
  };
}

export function toApiTokenDTO(r: ApiToken): ApiTokenDTO {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: isoOrNull(r.lastUsedAt),
    createdAt: iso(r.createdAt),
    revokedAt: isoOrNull(r.revokedAt),
  };
}
