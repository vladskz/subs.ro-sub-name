const { getLimiter } = require("./rateLimiter");

class SubsRoClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // No trailing slash: paths below are constructed with a leading "/".
    // The main subs.ro domain mirrors the API and is less likely to be hit by
    // Cloudflare bot protection than the dedicated api.subs.ro subdomain.
    this.baseUrl = "https://subs.ro/api/v1.0";
  }

  async searchByImdb(imdbId) {
    try {
      const url = `${this.baseUrl}/search/imdbid/${imdbId}`;
      const limiter = getLimiter(this.apiKey);

      const data = await limiter.searchRequest(url, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });

      if (data && Array.isArray(data.items)) {
        return data.items;
      }
      return [];
    } catch (error) {
      // Errors are already logged explicitly by RateLimiter
      return [];
    }
  }

  async validate() {
    try {
      const url = `${this.baseUrl}/quota`;
      const limiter = getLimiter(this.apiKey);

      const data = await limiter.searchRequest(url, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });

      // A valid key returns `{ quota: { remaining_quota: number, ... } }`.
      if (data && data.quota && typeof data.quota.remaining_quota === "number") {
        return { valid: true, reason: "ok" };
      }
      return { valid: false, reason: "unexpected_response" };
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;

      // Cloudflare bot protection sometimes returns an HTML challenge page
      // with a 403 status instead of the JSON API response.
      const isHtmlChallenge =
        typeof body === "string" &&
        /<html|cf-chl|challenge|_cf_chl/i.test(body);

      if (isHtmlChallenge) {
        return { valid: false, reason: "cloudflare_challenge" };
      }
      if (status === 401 || status === 403) {
        return { valid: false, reason: "invalid_key" };
      }
      return { valid: false, reason: "network_error" };
    }
  }
}

module.exports = SubsRoClient;
