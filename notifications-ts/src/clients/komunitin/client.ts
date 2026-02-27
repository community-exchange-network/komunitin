import { config } from '../../config';
import { AuthProvider } from './AuthProvider';
import logger from '../../utils/logger';
import { Group, Member, User, Offer, Need, Account, Transfer, Currency, TransferStats, AccountStats, UserSettings, GroupSettings } from './types';

export class KomunitinClient {
  private auth: AuthProvider;

  constructor() {
    this.auth = AuthProvider.getInstance();
  }

  private async fetchRaw(url: string, options: RequestInit = {}): Promise<Response> {
    const maxRetries = 3;
    let attempt = 1;

    while (true) {
      try {
        return await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.api+json',
            ...options.headers,
          },
        });
      } catch (error: any) {
        const isNetworkError = error.message?.includes('fetch failed') || error.message?.includes('other side closed');

        if (!isNetworkError || attempt >= maxRetries) {
          throw error;
        }

        logger.warn({ err: error.message, attempt }, 'Network error, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        attempt++;
      }
    }
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    let token = await this.auth.getAccessToken();

    const makeRequest = async (t: string) => {
      return this.fetchRaw(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${t}`,
          ...options.headers,
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

    if (!response.ok) {
      logger.error({ status: response.status, url }, 'API request failed');
    }

    return response.json()
  }

  public async fetch(url: string, options: RequestInit = {}): Promise<any> {
    const response = await this.fetchRaw(url, options);
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText} at ${url}`);
    }
    return response.json();
  }

  private getUrl(service: 'social' | 'accounting', path: string): string {
    const base = service === 'social' ? config.KOMUNITIN_SOCIAL_URL : config.KOMUNITIN_ACCOUNTING_URL;
    return `${base}${path.startsWith('/') ? path : '/' + path}`;
  }

  // --- Public Methods ---

  // Generic JSON:API fetcher to handle types later or specific resources
  private async get(service: 'social' | 'accounting', path: string): Promise<any> {
    const url = this.getUrl(service, path);
    return await this.fetchWithAuth(url);
  }

  // Helper for pagination
  private async paginate<T>(service: 'social' | 'accounting', path: string, params: Record<string, string> = {}): Promise<T[]> {
    const query = new URLSearchParams(params).toString();
    // Ensure we start with a path
    let url = this.getUrl(service, `${path}${path.includes('?') ? '&' : '?'}${query}`);
    let allData: T[] = [];

    while (url) {
      const body = await this.fetchWithAuth(url) as any;
      if (body.data) {
        allData = allData.concat(body.data);
      }

      // Update URL for next page
      if (body.links && body.links.next) {
        // links.next is usually a full URL
        url = body.links.next;
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        url = '';
      }
    }

    return allData;
  }

  public async getGroups(params: Record<string, string> = {}): Promise<Group[]> {
    return this.paginate<Group>('social', '/groups', params);
  }

  public async getGroup(groupCode: string, include?: string[]): Promise<{ data: Group; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('social', `/${groupCode}${query}`);
  }

  public async getMembers(groupCode: string, params: Record<string, string> = {}): Promise<Member[]> {
    return this.paginate<Member>('social', `/${groupCode}/members`, params);
  }

  public async getMember(groupCode: string, memberId: string): Promise<Member> {
    const res = await this.get('social', `/${groupCode}/members/${memberId}`);
    return res.data;
  }

  public async getMemberUsers(memberId: string): Promise<Array<{ user: User; settings: UserSettings }>> {
    // Fetch users with settings included
    const query = new URLSearchParams({ 'filter[members]': memberId, include: 'settings' }).toString();
    const url = this.getUrl('social', `/users?${query}`);
    const body = await this.fetchWithAuth(url) as any;
    const users = body.data as User[];
    const included = body.included || [];
    
    return users.map(user => {
      const settingsId = user.relationships.settings.data.id;
      const settings = included.find((r: any) => r.type === 'user-settings' && r.id === settingsId) as UserSettings;
      return { user, settings };
    });
  }

  public async getOffers(groupCode: string, params: Record<string, string> = {}): Promise<Offer[]> {
    return this.paginate<Offer>('social', `/${groupCode}/offers`, params);
  }

  public async getOffer(groupCode: string, offerId: string, include?: string[]): Promise<{ data: Offer; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('social', `/${groupCode}/offers/${offerId}${query}`);
  }

  public async getNeeds(groupCode: string, params: Record<string, string> = {}): Promise<Need[]> {
    return this.paginate<Need>('social', `/${groupCode}/needs`, params);
  }

  public async getNeed(groupCode: string, needId: string, include?: string[]): Promise<{ data: Need; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('social', `/${groupCode}/needs/${needId}${query}`);
  }

  public async getAccount(groupCode: string, accountId: string): Promise<Account> {
    const res = await this.get('accounting', `/${groupCode}/accounts/${accountId}`);
    return res.data;
  }

  public async getTransfer(groupCode: string, transferId: string, include?: string[]): Promise<{ data: Transfer; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('accounting', `/${groupCode}/transfers/${transferId}${query}`);
  }

  public async getMembersByAccount(groupCode: string, accountIds: string[]): Promise<Member[]> {
    return this.paginate<Member>('social', `/${groupCode}/members`, { 'filter[account]': accountIds.join(',') });
  }

  public async getTransfers(groupCode: string, params: Record<string, string> = {}): Promise<Transfer[]> {
    return this.paginate<Transfer>('accounting', `/${groupCode}/transfers`, params);
  }

  public async getCurrency(groupCode: string): Promise<Currency> {
    const res = await this.get('accounting', `/${groupCode}/currency`);
    return res.data;
  }

  public async getTransferStats(groupCode: string, params: { from?: string; to?: string } = {}): Promise<TransferStats> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const path = `/${groupCode}/stats/transfers${query ? '?' + query : ''}`;
    const res = await this.get('accounting', path);
    return res.data;
  }

  public async getAccountStats(groupCode: string, params: { from?: string; to?: string, minTransactions?: number, maxTransactions?: number } = {}): Promise<AccountStats> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const path = `/${groupCode}/stats/accounts${query ? '?' + query : ''}`;
    const res = await this.get('accounting', path);
    return res.data;
  }

  public async getUser(userId: string): Promise<User> {
    const res = await this.get('social', `/users/${userId}`);
    return res.data;
  }

  public async getUserWithSettings(userId: string): Promise<{ user: User; settings: UserSettings }> {
    const res = await this.get('social', `/users/${userId}?include=settings`);
    const user = res.data as User;
    const included = res.included || [];
    const settingsId = user.relationships.settings.data.id;
    const settings = included.find((r: any) => r.type === 'user-settings' && r.id === settingsId) as UserSettings;
    return { user, settings };
  }

  public async getUserSettings(userId: string): Promise<UserSettings> {
    const res = await this.get('social', `/users/${userId}/settings`);
    return res.data;
  }

  public async getGroupSettings(groupCode: string): Promise<GroupSettings> {
    const res = await this.get('social', `/${groupCode}/settings`);
    return res.data;
  }
}
