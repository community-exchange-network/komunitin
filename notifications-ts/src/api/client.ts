import { config } from '../config';
import { AuthProvider } from '../auth/AuthProvider';
import logger from '../utils/logger';

export class KomunitinClient {
  private auth: AuthProvider;

  constructor() {
    this.auth = AuthProvider.getInstance();
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    let token = await this.auth.getAccessToken();

    const makeRequest = async (t: string) => {
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${t}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.api+json',
        },
      });
    };

    let response = await makeRequest(token);

    // Handle 401: Refresh token and retry once
    if (response.status === 401) {
      logger.warn('Received 401 from API, refreshing token and retrying...');
      this.auth.forceRefresh();
      token = await this.auth.getAccessToken();
      response = await makeRequest(token);
    }

    return response;
  }

  private getUrl(service: 'social' | 'accounting', path: string): string {
    const base = service === 'social' ? config.KOMUNITIN_SOCIAL_URL : config.KOMUNITIN_ACCOUNTING_URL;
    return `${base}${path.startsWith('/') ? path : '/' + path}`;
  }

  // --- Public Methods ---

  // Generic JSON:API fetcher to handle types later or specific resources
  public async get(service: 'social' | 'accounting', path: string): Promise<any> {
    const url = this.getUrl(service, path);
    const res = await this.fetchWithAuth(url);

    if (!res.ok) {
      throw new Error(`API Error ${res.status}: ${res.statusText} at ${url}`);
    }

    return res.json();
  }

  // Helper for pagination
  private async paginate(service: 'social' | 'accounting', path: string, params: Record<string, string> = {}): Promise<any[]> {
    const query = new URLSearchParams(params).toString();
    // Ensure we start with a path
    let url = this.getUrl(service, `${path}${path.includes('?') ? '&' : '?'}${query}`);
    let allData: any[] = [];

    while (url) {
      const res = await this.fetchWithAuth(url);
      if (!res.ok) {
        throw new Error(`API Error ${res.status}: ${res.statusText} at ${url}`);
      }

      const body = await res.json() as any;
      if (body.data) {
        allData = allData.concat(body.data);
      }

      // Update URL for next page
      if (body.links && body.links.next) {
        // links.next is usually a full URL
        url = body.links.next;
      } else {
        url = '';
      }
    }

    return allData;
  }

  public async getGroups(params: Record<string, string> = {}): Promise<any[]> {
    return this.paginate('social', '/groups', params);
  }

  public async getGroupMembers(groupCode: string, params: Record<string, string> = {}): Promise<any[]> {
    return this.paginate('social', `/${groupCode}/members`, params);
  }

  public async getMemberUsers(memberId: string): Promise<any[]> {
    // According to API docs/usage: /users?filter[members]=memberId
    // Usually few users per member, but good to be consistent
    return this.paginate('social', `/users`, { 'filter[members]': memberId, include: 'settings' });
  }

  public async getOffers(groupCode: string, params: Record<string, string> = {}): Promise<any[]> {
    return this.paginate('social', `/${groupCode}/offers`, params);
  }

  public async getNeeds(groupCode: string, params: Record<string, string> = {}): Promise<any[]> {
    return this.paginate('social', `/${groupCode}/needs`, params);
  }

  public async getAccount(groupCode: string, accountId: string): Promise<any> {
    const res = await this.get('accounting', `/${groupCode}/accounts/${accountId}`);
    return res.data;
  }

  public async getTransfers(groupCode: string, params: Record<string, string> = {}): Promise<any[]> {
    return this.paginate('accounting', `/${groupCode}/transfers`, params);
  }
}
