import {
  classifyReleaseAssets,
  type RawGitHubAsset,
} from '../shared/assetClassifier';
import type { RateLimitInfo, ReleaseInfo } from '../shared/types';

interface GitHubRepoApiResponse {
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id: string | null; name: string } | null;
  topics?: string[];
  default_branch: string;
  pushed_at: string | null;
}

interface GitHubReleaseApiResponse {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: RawGitHubAsset[];
}

interface GitHubStarredApiResponse {
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  owner: { login: string; avatar_url: string };
  name: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id: string | null; name: string } | null;
  topics?: string[];
  default_branch: string;
  pushed_at: string | null;
}

export class GitHubService {
  private rateLimit: RateLimitInfo = {
    remaining: null,
    limit: null,
    resetAt: null,
  };

  getRateLimit(): RateLimitInfo {
    return { ...this.rateLimit };
  }

  private captureRateLimit(headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');
    if (remaining !== null || limit !== null) {
      this.rateLimit = {
        remaining: remaining !== null ? Number(remaining) : this.rateLimit.remaining,
        limit: limit !== null ? Number(limit) : this.rateLimit.limit,
        resetAt:
          reset !== null ? new Date(Number(reset) * 1000).toISOString() : this.rateLimit.resetAt,
      };
    }
  }

  private buildHeaders(
    token?: string,
    etag?: string | null,
    accept = 'application/vnd.github+json'
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'ASTA-Hub/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token && token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    if (etag && etag.trim()) {
      headers['If-None-Match'] = etag.trim();
    }
    return headers;
  }

  private async requestJson<T>(
    url: string,
    token?: string,
    etag?: string | null
  ): Promise<{ notModified: boolean; data?: T; etag?: string | null }> {
    const res = await fetch(url, {
      headers: this.buildHeaders(token, etag),
    });
    this.captureRateLimit(res.headers);

    if (res.status === 304) {
      return { notModified: true, etag: res.headers.get('etag') ?? etag };
    }

    if (res.status === 404) {
      throw new Error(`GitHub repository or resource not found (404): ${url}`);
    }

    if (res.status === 403 || res.status === 429) {
      const rem = res.headers.get('x-ratelimit-remaining');
      if (rem === '0') {
        throw new Error(
          'GitHub API rate limit exceeded. Add a GitHub Personal Access Token in Settings to raise your limit to 5,000 requests/hour.'
        );
      }
      throw new Error(`GitHub API access denied (${res.status}).`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as T;
    return {
      notModified: false,
      data,
      etag: res.headers.get('etag'),
    };
  }

  async fetchFullRepoBundle(params: {
    owner: string;
    repo: string;
    token?: string;
    etag?: string | null;
    hostArch: 'x64' | 'arm64';
    preferredAssetPattern?: string | null;
    preferPortable?: boolean;
  }): Promise<{
    notModified: boolean;
    etag: string | null;
    metadata?: {
      owner: string;
      name: string;
      fullName: string;
      description: string;
      htmlUrl: string;
      homepage: string | null;
      avatarUrl: string | null;
      stars: number;
      forks: number;
      language: string | null;
      license: string | null;
      topics: string[];
      defaultBranch: string;
      pushedAt: string | null;
    };
    readmeMarkdown?: string | null;
    latestRelease?: ReleaseInfo | null;
  }> {
    const repoUrl = `https://api.github.com/repos/${params.owner}/${params.repo}`;
    const repoRes = await this.requestJson<GitHubRepoApiResponse>(
      repoUrl,
      params.token,
      params.etag
    );

    if (repoRes.notModified || !repoRes.data) {
      // Still check releases independently since release updates may happen without repo metadata ETag shifting
      const latestRelease = await this.fetchBestRelease(
        params.owner,
        params.repo,
        params.token,
        params.hostArch,
        params.preferredAssetPattern,
        params.preferPortable
      );
      return {
        notModified: true,
        etag: repoRes.etag ?? params.etag ?? null,
        latestRelease,
      };
    }

    const d = repoRes.data;
    const [readmeMarkdown, latestRelease] = await Promise.all([
      this.fetchReadme(d.owner.login, d.name, params.token),
      this.fetchBestRelease(
        d.owner.login,
        d.name,
        params.token,
        params.hostArch,
        params.preferredAssetPattern,
        params.preferPortable
      ),
    ]);

    return {
      notModified: false,
      etag: repoRes.etag ?? null,
      metadata: {
        owner: d.owner.login,
        name: d.name,
        fullName: d.full_name,
        description: d.description ?? '',
        htmlUrl: d.html_url,
        homepage: d.homepage || null,
        avatarUrl: d.owner.avatar_url || null,
        stars: d.stargazers_count,
        forks: d.forks_count,
        language: d.language || null,
        license: d.license?.spdx_id || d.license?.name || null,
        topics: d.topics ?? [],
        defaultBranch: d.default_branch,
        pushedAt: d.pushed_at,
      },
      readmeMarkdown,
      latestRelease,
    };
  }

  async fetchReadme(
    owner: string,
    repo: string,
    token?: string
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        {
          headers: this.buildHeaders(token, null, 'application/vnd.github.raw+json'),
        }
      );
      this.captureRateLimit(res.headers);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async fetchBestRelease(
    owner: string,
    repo: string,
    token: string | undefined,
    hostArch: 'x64' | 'arm64',
    preferredPattern?: string | null,
    preferPortable?: boolean
  ): Promise<ReleaseInfo | null> {
    const res = await this.requestJson<GitHubReleaseApiResponse[]>(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=8`,
      token
    );
    const list = (res.data ?? []).filter((r) => !r.draft);
    if (list.length === 0) return null;

    const chosen =
      list.find((r) => !r.prerelease && r.assets.length > 0) ??
      list.find((r) => !r.prerelease) ??
      list[0];

    const classified = classifyReleaseAssets(
      chosen.assets,
      hostArch,
      preferredPattern,
      { preferPortable }
    );

    return {
      tagName: chosen.tag_name,
      name: chosen.name || chosen.tag_name,
      body: chosen.body || '',
      publishedAt: chosen.published_at,
      htmlUrl: chosen.html_url,
      prerelease: chosen.prerelease,
      assets: classified.assets,
      recommendedAssetId: classified.recommendedAssetId,
    };
  }

  async fetchAuthenticatedUserStars(
    token: string,
    maxPages = 2
  ): Promise<
    {
      owner: string;
      name: string;
      fullName: string;
      description: string;
      htmlUrl: string;
      homepage: string | null;
      avatarUrl: string | null;
      stars: number;
      forks: number;
      language: string | null;
      license: string | null;
      topics: string[];
      defaultBranch: string;
      pushedAt: string | null;
    }[]
  > {
    if (!token.trim()) {
      throw new Error(
        'A GitHub Personal Access Token is required in Settings to import your starred repositories.'
      );
    }

    const collected: GitHubStarredApiResponse[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.requestJson<GitHubStarredApiResponse[]>(
        `https://api.github.com/user/starred?per_page=100&page=${page}`,
        token
      );
      const batch = res.data ?? [];
      collected.push(...batch);
      if (batch.length < 100) break;
    }

    return collected.map((d) => ({
      owner: d.owner.login,
      name: d.name,
      fullName: d.full_name,
      description: d.description ?? '',
      htmlUrl: d.html_url,
      homepage: d.homepage || null,
      avatarUrl: d.owner.avatar_url || null,
      stars: d.stargazers_count,
      forks: d.forks_count,
      language: d.language || null,
      license: d.license?.spdx_id || d.license?.name || null,
      topics: d.topics ?? [],
      defaultBranch: d.default_branch,
      pushedAt: d.pushed_at,
    }));
  }
}
