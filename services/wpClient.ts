// Secret Configuration
const CONFIG = {
  BASE_URL: "https://corks.ro",
  USERNAME: "Adrian Olteanu",
  APP_PASSWORD: "p999 Rmq1 Irap F3TP BTD0 HO7I"
};

const PROXY_BASE = "https://corsproxy.io/?";

export type WPClientMode = 'server' | 'direct';

interface WPResponse<T = any> {
  data: T;
  headers: Record<string, string>;
  status: number;
  url: string;
}

interface WPPaginationResult<T = any> {
  items: T[];
  pagesFetched: number;
  totals?: {
    total?: number;
    totalPages?: number;
  };
}

export class WordPressClient {
  private mode: WPClientMode;

  constructor(mode: WPClientMode = 'server') {
    this.mode = mode;
  }

  /**
   * Generates the Basic Auth header value.
   * Safe to use in browser environment.
   */
  private makeAuthHeader(): string {
    const creds = `${CONFIG.USERNAME}:${CONFIG.APP_PASSWORD}`;
    return `Basic ${btoa(creds)}`;
  }

  private buildUrl(path: string, queryParams?: Record<string, string | number | boolean | undefined | null>): string {
    const baseUrl = CONFIG.BASE_URL.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${cleanPath}`);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  /**
   * Primary GET method.
   * Handles Mode (Proxy vs Direct) and Authentication.
   */
  async wpGet<T = any>(
    path: string,
    queryParams?: Record<string, string | number | boolean | undefined | null>,
    options?: { signal?: AbortSignal }
  ): Promise<WPResponse<T>> {
    const fullUrl = this.buildUrl(path, queryParams);
    
    // Determine actual fetch URL based on mode
    let fetchUrl = fullUrl;
    if (this.mode === 'server') {
      fetchUrl = `${PROXY_BASE}${encodeURIComponent(fullUrl)}`;
    }

    const headers: Record<string, string> = {
      'Authorization': this.makeAuthHeader(),
      'Accept': 'application/json'
    };

    try {
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: headers, // In 'server' mode (corsproxy), headers are forwarded
        signal: options?.signal
      });

      if (!response.ok) {
        // Attempt to parse error body safely
        let errorBody = 'Unknown error';
        try {
          errorBody = await response.text();
        } catch {}

        // Construct safe error message (Redact secrets)
        const safeUrl = fullUrl.replace(/p999.*HO7I/g, '[REDACTED_PWD]');
        throw new Error(`WP API Error: ${response.status} ${response.statusText} for ${safeUrl}. Details: ${errorBody.substring(0, 200)}`);
      }

      const data = await response.json();
      const parsedHeaders = this.parseHeaders(response.headers);

      return {
        data,
        headers: parsedHeaders,
        status: response.status,
        url: fullUrl
      };

    } catch (error: any) {
      // Final safety net to ensure no secrets leak in error messages
      if (error.message) {
        error.message = error.message.replace(CONFIG.APP_PASSWORD, '[REDACTED]');
        error.message = error.message.replace(/Basic\s+[a-zA-Z0-9+/=]+/g, '[Auth Header]');
      }
      throw error;
    }
  }

  /**
   * Pagination Helper.
   * Handles WP pagination standards (page, per_page) and Tribe API quirks.
   */
  async wpGetAllPages(
    path: string,
    baseQueryParams: Record<string, string | number | boolean | undefined | null> = {},
    options?: { signal?: AbortSignal }
  ): Promise<WPPaginationResult> {
    let page = 1;
    const perPage = 100; // Efficient chunk size
    const allItems: any[] = [];
    let totalPages = Infinity;
    let totalItems = 0;

    while (page <= totalPages) {
      const response = await this.wpGet(path, { ...baseQueryParams, page, per_page: perPage }, options);
      
      let itemsOnPage: any[] = [];
      let pageTotal = 0;
      let pageTotalPages = 0;

      // Handle Tribe API Polymorphism (Array vs Object)
      if (Array.isArray(response.data)) {
        itemsOnPage = response.data;
        // If it's an array, we often look at headers for X-WP-Total, or just infer loop end
        if (response.headers['x-wp-totalpages']) {
           totalPages = parseInt(response.headers['x-wp-totalpages'], 10);
        } else if (itemsOnPage.length < perPage) {
           // Heuristic end
           totalPages = page; 
        }
      } else if (response.data && typeof response.data === 'object') {
        // Object form: { attendees: [...], total: 10, total_pages: 1 }
        // Find the array property (attendees, events, etc)
        const keys = Object.keys(response.data);
        const arrayKey = keys.find(k => Array.isArray(response.data[k]));
        
        if (arrayKey) {
          itemsOnPage = response.data[arrayKey];
          pageTotal = response.data.total || 0;
          pageTotalPages = response.data.total_pages || 0;
          
          if (response.data.total_pages !== undefined) {
             totalPages = response.data.total_pages;
          }
          if (response.data.total !== undefined) {
             totalItems = response.data.total;
          }
        } else {
           // Fallback if structure is unknown, treat as empty
           itemsOnPage = [];
        }
      }

      if (itemsOnPage.length === 0) {
        break;
      }

      allItems.push(...itemsOnPage);
      page++;
    }

    return {
      items: allItems,
      pagesFetched: page - 1,
      totals: { total: totalItems, totalPages: totalPages === Infinity ? undefined : totalPages }
    };
  }
}

export const wpClient = new WordPressClient('server');