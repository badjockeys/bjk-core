// A small typed client for the bjk-core API, written from the module controllers in bjk-modules. Each call takes the
// caller's access token explicitly (null for anonymous reads), so it's easy to test and never reads cookies itself.
// Only the web server uses it: the browser never sees access tokens.

import type {
  AppealDto,
  AreaStatsDto,
  BlockDto,
  CommentDto,
  CreatePostRequest,
  HandleAvailability,
  HeatmapDto,
  HeatmapQuery,
  IncidentCategory,
  MediaDto,
  PagedResult,
  PassengerTagStatus,
  PostDto,
  ProblemDetails,
  ProfileDto,
  PublicReportRequest,
  ReactionType,
  ReelPlayResult,
  ReelsPage,
  ReportReason,
  ReportReceipt,
  RoadUser,
  RequestUploadResult,
} from "./types";

export const AGE_VERIFICATION_REQUIRED = "age_verification_required";
export const DAILY_LIMIT = "daily_limit";

/** The header the API counts logged-out reel plays by (the value comes from the signed bjk_viewer cookie). */
export const VIEWER_ID_HEADER = "X-Viewer-Id";

/** The API answered with an error. `problem` is its RFC 7807 body when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | undefined,
    readonly path: string,
    /** The API's WWW-Authenticate header on a 401: says why a token was refused (expired, wrong issuer, etc.). */
    readonly authenticate?: string,
  ) {
    super(problem?.detail || problem?.title || `The API returned ${status} for ${path}.`);
    this.name = "ApiError";
  }

  get code(): string | undefined {
    return this.problem?.code;
  }

  get isAgeCheckNeeded(): boolean {
    return this.status === 403 && this.code === AGE_VERIFICATION_REQUIRED;
  }

  /** Today's reels are used up (403 daily_limit). */
  get isDailyLimit(): boolean {
    return this.status === 403 && this.code === DAILY_LIMIT;
  }

  /** Validation messages by field, camel-cased ("Title" becomes "title"). */
  get fieldErrors(): Record<string, string[]> {
    const errors = this.problem?.errors ?? {};
    return Object.fromEntries(
      Object.entries(errors).map(([key, messages]) => [
        key ? key[0]!.toLowerCase() + key.slice(1) : "",
        messages,
      ]),
    );
  }

  /** One sentence to show the person: the first validation message, or the problem's detail. */
  get userMessage(): string {
    const first = Object.values(this.problem?.errors ?? {})[0]?.[0];
    if (first) {
      return first;
    }
    if (this.problem?.detail) {
      return this.problem.detail;
    }
    if (this.status === 401) {
      return "Please sign in again.";
    }
    if (this.status === 404) {
      return "We couldn't find that. It may have been removed.";
    }
    if (this.status === 429) {
      return "You're doing that too often. Please wait a little and try again.";
    }
    return "Something went wrong. Please try again.";
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  token?: string | null;
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Cache anonymous reads for this many seconds (Next.js data cache). Ignored when there's a token. */
  revalidate?: number;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
      const url = new URL(base + path);
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }

      const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
      if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
      }
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const init: RequestInit & { next?: { revalidate: number } } = {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      };
      if (!options.token && options.revalidate && method === "GET") {
        init.next = { revalidate: options.revalidate };
      } else {
        init.cache = "no-store";
      }

      const response = await fetchImpl(url, init);
      if (!response.ok) {
        let problem: ProblemDetails | undefined;
        try {
          problem = (await response.json()) as ProblemDetails;
        } catch {
          problem = undefined;
        }
        throw new ApiError(
          response.status,
          problem,
          path,
          response.headers.get("www-authenticate") ?? undefined,
        );
      }
      if (response.status === 204) {
        return undefined as T;
      }
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    },
  };
}

const id = (value: string) => encodeURIComponent(value);

export interface FeedQuery {
  category?: IncidentCategory;
  author?: string;
  page?: number;
  pageSize?: number;
}

/** The API's endpoints, by module. */
export function endpoints(api: ApiClient) {
  return {
    posts: {
      list: (token: string | null, q: FeedQuery = {}, revalidate?: number) =>
        api.request<PagedResult<PostDto>>("GET", "/api/posts", {
          token,
          revalidate,
          query: { category: q.category, author: q.author, page: q.page ?? 1, pageSize: q.pageSize ?? 20 },
        }),
      mine: (token: string, page = 1, pageSize = 20) =>
        api.request<PagedResult<PostDto>>("GET", "/api/posts/mine", { token, query: { page, pageSize } }),
      get: (token: string | null, postId: string) =>
        api.request<PostDto>("GET", `/api/posts/${id(postId)}`, { token }),
      create: (token: string, body: CreatePostRequest) =>
        api.request<PostDto>("POST", "/api/posts", { token, body }),
      remove: (token: string, postId: string) =>
        api.request<void>("DELETE", `/api/posts/${id(postId)}`, { token }),
      react: (token: string, postId: string, type: ReactionType) =>
        api.request<void>("PUT", `/api/posts/${id(postId)}/reaction`, { token, body: { type } }),
      unreact: (token: string, postId: string) =>
        api.request<void>("DELETE", `/api/posts/${id(postId)}/reaction`, { token }),
      report: (token: string, postId: string, reason: ReportReason, details: string | null) =>
        api.request<void>("POST", `/api/posts/${id(postId)}/reports`, { token, body: { reason, details } }),
      appeal: (token: string, postId: string, statement: string) =>
        api.request<AppealDto>("POST", `/api/posts/${id(postId)}/appeal`, { token, body: { statement } }),
      tagged: (token: string, status: PassengerTagStatus = "Pending", page = 1, pageSize = 20) =>
        api.request<PagedResult<PostDto>>("GET", "/api/posts/tagged", {
          token,
          query: { status, page, pageSize },
        }),
      respondToTag: (token: string, postId: string, accept: boolean) =>
        api.request<PostDto>("PUT", `/api/posts/${id(postId)}/passengers/me`, { token, body: { accept } }),
      removeMyTag: (token: string, postId: string) =>
        api.request<void>("DELETE", `/api/posts/${id(postId)}/passengers/me`, { token }),
    },
    comments: {
      list: (token: string, postId: string, page = 1, pageSize = 20) =>
        api.request<PagedResult<CommentDto>>("GET", `/api/posts/${id(postId)}/comments`, {
          token,
          query: { page, pageSize },
        }),
      replies: (token: string, postId: string, commentId: string, page = 1, pageSize = 50) =>
        api.request<PagedResult<CommentDto>>(
          "GET",
          `/api/posts/${id(postId)}/comments/${id(commentId)}/replies`,
          {
            token,
            query: { page, pageSize },
          },
        ),
      add: (token: string, postId: string, body: string) =>
        api.request<CommentDto>("POST", `/api/posts/${id(postId)}/comments`, { token, body: { body } }),
      reply: (token: string, postId: string, commentId: string, body: string) =>
        api.request<CommentDto>("POST", `/api/posts/${id(postId)}/comments/${id(commentId)}/replies`, {
          token,
          body: { body },
        }),
      remove: (token: string, postId: string, commentId: string) =>
        api.request<void>("DELETE", `/api/posts/${id(postId)}/comments/${id(commentId)}`, { token }),
      react: (token: string, postId: string, commentId: string, type: ReactionType) =>
        api.request<void>("PUT", `/api/posts/${id(postId)}/comments/${id(commentId)}/reaction`, {
          token,
          body: { type },
        }),
      unreact: (token: string, postId: string, commentId: string) =>
        api.request<void>("DELETE", `/api/posts/${id(postId)}/comments/${id(commentId)}/reaction`, { token }),
      report: (
        token: string,
        postId: string,
        commentId: string,
        reason: ReportReason,
        details: string | null,
      ) =>
        api.request<void>("POST", `/api/posts/${id(postId)}/comments/${id(commentId)}/reports`, {
          token,
          body: { reason, details },
        }),
      appeal: (token: string, postId: string, commentId: string, statement: string) =>
        api.request<AppealDto>("POST", `/api/posts/${id(postId)}/comments/${id(commentId)}/appeal`, {
          token,
          body: { statement },
        }),
    },
    reports: {
      /** The public form. `clientIp` is the visitor's address, passed on as Cloudflare would. */
      submitPublic: (body: PublicReportRequest, captchaToken: string, clientIp?: string | null) =>
        api.request<ReportReceipt>("POST", "/api/reports/public", {
          body,
          headers: {
            "X-Captcha-Token": captchaToken,
            ...(clientIp ? { "CF-Connecting-IP": clientIp } : {}),
          },
        }),
      profile: (token: string, handle: string, reason: ReportReason, details: string | null) =>
        api.request<void>("POST", `/api/profiles/${id(handle)}/reports`, {
          token,
          body: { reason, details },
        }),
    },
    profiles: {
      me: (token: string) => api.request<ProfileDto>("GET", "/api/profiles/me", { token }),
      get: (token: string | null, handle: string) =>
        api.request<ProfileDto>("GET", `/api/profiles/${id(handle)}`, { token }),
      create: (
        token: string,
        body: { handle: string; displayName: string; bio: string | null; location: string | null },
      ) => api.request<ProfileDto>("POST", "/api/profiles", { token, body }),
      update: (token: string, body: { displayName: string; bio: string | null; location: string | null }) =>
        api.request<ProfileDto>("PUT", "/api/profiles/me", { token, body }),
      changeHandle: (token: string, handle: string) =>
        api.request<ProfileDto>("PUT", "/api/profiles/me/handle", { token, body: { handle } }),
      setRoadUser: (token: string, roadUser: RoadUser | null, show: boolean) =>
        api.request<ProfileDto>("PUT", "/api/profiles/me/road-user", { token, body: { roadUser, show } }),
      setAvatar: (token: string, mediaId: string | null) =>
        api.request<ProfileDto>("PUT", "/api/profiles/me/avatar", { token, body: { mediaId } }),
      handleAvailability: (handle: string) =>
        api.request<HandleAvailability>("GET", `/api/profiles/handles/${id(handle)}/availability`),
      blocks: (token: string) => api.request<BlockDto[]>("GET", "/api/profiles/me/blocks", { token }),
      block: (token: string, user: string) =>
        api.request<BlockDto>("PUT", `/api/profiles/me/blocks/${id(user)}`, { token }),
      unblock: (token: string, user: string) =>
        api.request<void>("DELETE", `/api/profiles/me/blocks/${id(user)}`, { token }),
    },
    media: {
      requestUpload: (token: string, body: { fileName: string; contentType: string; sizeBytes: number }) =>
        api.request<RequestUploadResult>("POST", "/api/media/uploads", { token, body }),
      complete: (token: string, mediaId: string) =>
        api.request<MediaDto>("POST", `/api/media/${id(mediaId)}/complete`, { token }),
      get: (token: string, mediaId: string) =>
        api.request<MediaDto>("GET", `/api/media/${id(mediaId)}`, { token }),
      remove: (token: string, mediaId: string) =>
        api.request<void>("DELETE", `/api/media/${id(mediaId)}`, { token }),
    },
    reels: {
      /** A page of reels. Logged-out viewers are counted by their viewer id. */
      list: (
        token: string | null,
        viewerId: string | null,
        q: { cursor?: string | null; category?: IncidentCategory; pageSize?: number } = {},
      ) =>
        api.request<ReelsPage>("GET", "/api/reels", {
          token,
          headers: viewerId ? { [VIEWER_ID_HEADER]: viewerId } : undefined,
          query: { cursor: q.cursor, category: q.category, pageSize: q.pageSize },
        }),
      /** Report that a reel has been watched for 3 seconds. Idempotent per viewer, reel and day. */
      play: (token: string | null, viewerId: string | null, postId: string) =>
        api.request<ReelPlayResult>("POST", `/api/reels/${id(postId)}/play`, {
          token,
          headers: viewerId ? { [VIEWER_ID_HEADER]: viewerId } : undefined,
        }),
    },
    heatmap: {
      get: (token: string, q: HeatmapQuery) =>
        api.request<HeatmapDto>("GET", "/api/heatmap", { token, query: { ...q } }),
      area: (token: string, q: HeatmapQuery) =>
        api.request<AreaStatsDto>("GET", "/api/heatmap/area", { token, query: { ...q, zoom: undefined } }),
    },
    me: {
      /** Everything core holds about the user (profile, posts, comments, reactions, reports, media). */
      dataExport: (token: string) => api.request<unknown>("GET", "/api/me/data-export", { token }),
    },
  };
}

export type Endpoints = ReturnType<typeof endpoints>;
