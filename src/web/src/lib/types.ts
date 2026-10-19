// The bjk-core API's JSON, written from the module controllers and DTOs in bjk-modules
// (BJK.Modules.Posts / Profiles / Media). Enums travel as names.

export type IncidentCategory =
  | "RoadRage"
  | "DangerousOvertaking"
  | "Tailgating"
  | "MobilePhoneUse"
  | "Speeding"
  | "RedLightRunning"
  | "CuttingUp"
  | "Undertaking"
  | "LaneHogging"
  | "ClosePass"
  | "BadParking"
  | "Other";

export type ReactionType = "Like" | "Angry" | "Shocked" | "Laugh";
export type PostStatus = "Published" | "Hidden" | "HeldForReview" | "Deleted";
export type PostMediaState = "Ready" | "Pending" | "Failed";
export type CommentStatus = "Visible" | "Hidden" | "Deleted" | "HeldForReview";
export type MediaType = "Video" | "Image";
export type MediaStatus = "Uploading" | "Processing" | "Ready" | "NeedsReview" | "Failed" | "Deleted";

export type ReportReason =
  | "DangerousOrIllegal"
  | "PersonalInformation"
  | "HarassmentOrHate"
  | "Spam"
  | "NotADrivingIncident"
  | "Other"
  | "IllegalContent"
  | "Threat"
  | "InThisClip"
  | "Copyright";

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface AuthorDto {
  id: string;
  /** Null when the author's profile no longer exists ("Former member"). */
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface LocationDto {
  latitude: number;
  longitude: number;
  placeName: string | null;
}

export interface PostMediaDto {
  mediaId: string;
  mediaType: MediaType;
  /** The full photo (2048 px) or the video. Null when the media is blurred for this viewer. */
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** A heavily blurred 480 px preview, for sensitive posts (null for a few seconds until it's made). */
  previewUrl?: string | null;
  /** Sensitive media this viewer may not see yet: only previewUrl is set. */
  isBlurred?: boolean;
  /** When the signed links to sensitive media stop working: fetch the post again before then. */
  linksExpireAt?: string | null;
  /** Photos: a 1080 px copy for feeds and lists (null for videos, blurred media and older photos). */
  feedUrl?: string | null;
}

export type ReactionCounts = Partial<Record<ReactionType, number>>;

export interface PostDto {
  id: string;
  author: AuthorDto;
  title: string;
  description: string | null;
  category: IncidentCategory;
  incidentAt: string;
  location: LocationDto;
  status: PostStatus;
  hiddenReason: string | null;
  media: PostMediaDto[];
  reactions: ReactionCounts;
  myReaction: ReactionType | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string | null;
  isSensitive?: boolean;
  /** True for logged-out viewers: comments aren't sent to them. */
  commentsRequireSignIn?: boolean;
  /** Fast posting (bjk-modules feature/fast-posting). Absent from older API versions, which means Ready. */
  mediaState?: PostMediaState;
  mediaFailureReason?: string | null;
  isProcessing?: boolean;
  /** Sensitive and this viewer hasn't passed the age check (or isn't signed in): the media come blurred. */
  requiresAgeVerification?: boolean;
  sensitiveSource?: "None" | "Author" | "Moderator" | "Automatic";
}

/** GET /api/reels. Null limits mean unlimited (Premium). */
export interface ReelsPage {
  items: PostDto[];
  nextCursor: string | null;
  playsRemainingToday: number | null;
  dailyPlayLimit: number | null;
  playsToday: number;
  resetsAt: string;
}

/** POST /api/reels/{id}/play. */
export interface ReelPlayResult {
  counted: boolean;
  playsRemainingToday: number | null;
  dailyPlayLimit: number | null;
  playsToday: number;
  resetsAt: string;
}

export type SubscriptionPlan = "Free" | "Premium" | "PremiumPlus";
export type HeatmapDays = "All" | "Weekdays" | "Weekends";

/** What the plan allowed for a heat map request, and what was applied. Dates are UK days (yyyy-mm-dd). */
export interface HeatmapAccess {
  plan: SubscriptionPlan;
  historyDays: number;
  filtersAllowed: boolean;
  exportAllowed: boolean;
  from: string;
  to: string;
  historyCapped: boolean;
  filtersIgnored: boolean;
}

export interface HeatmapCell {
  latitude: number;
  longitude: number;
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
  count: number;
}

/** GET /api/heatmap. */
export interface HeatmapDto {
  cells: HeatmapCell[];
  cellLatitudeSize: number;
  cellLongitudeSize: number;
  minCellCount: number;
  maxCount: number;
  truncated: boolean;
  access: HeatmapAccess;
}

/** GET /api/heatmap/area. Everything but the dates is empty when suppressed (fewer than 3 incidents). */
export interface AreaStatsDto {
  suppressed: boolean;
  total: number | null;
  changePercent: number | null;
  busiestHour: number | null;
  topCategories: { category: IncidentCategory; count: number; percent: number }[];
  topPlaces: { name: string; count: number }[];
  placeName: string | null;
  previousFrom: string;
  previousTo: string;
  access: HeatmapAccess;
}

/** The heat map's query: a box (minLon,minLat,maxLon,maxLat), the map zoom, and optional filters. */
export interface HeatmapQuery {
  bbox: string;
  zoom?: number;
  from?: string;
  to?: string;
  categories?: string;
  hours?: string;
  days?: HeatmapDays;
}

export interface CommentDto {
  id: string;
  postId: string;
  /** Null for a removed comment that's kept as a placeholder because it has replies. */
  author: AuthorDto | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  status?: CommentStatus;
  parentCommentId?: string | null;
  isRemoved?: boolean;
  reactions?: ReactionCounts | null;
  myReaction?: ReactionType | null;
  replyCount?: number;
  replies?: CommentDto[] | null;
}

export interface AppealDto {
  id: string;
  reference: string;
  status: "Open" | "Upheld" | "Overturned";
  dueAt: string;
}

export interface ReportReceipt {
  reference: string;
  priority: "Normal" | "Urgent";
  respondBy: string;
  acknowledgementSent: boolean;
}

export interface ProfileDto {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface HandleAvailability {
  handle: string;
  available: boolean;
  reason: string | null;
}

export interface BlockDto {
  userId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface SignedUpload {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface RequestUploadResult {
  mediaId: string;
  mediaType: MediaType;
  upload: SignedUpload;
}

export interface MediaDto {
  id: string;
  mediaType: MediaType;
  status: MediaStatus;
  originalFileName: string;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  failureReason: string | null;
  createdAt: string;
}

export interface CreatePostRequest {
  title: string;
  description: string | null;
  category: IncidentCategory;
  incidentAt: string;
  latitude: number;
  longitude: number;
  placeName: string | null;
  mediaIds: string[];
  isSensitive: boolean;
}

export interface PublicReportRequest {
  target: string;
  commentId: string | null;
  reason: ReportReason;
  details: string | null;
  reporterName: string;
  reporterEmail: string;
  consent: boolean;
}

/** RFC 7807 problem details, as the API's ModuleExceptionHandler writes them. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  /** daily_limit: when the allowance starts again. */
  resetsAt?: string;
  limit?: number;
}
