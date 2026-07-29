import { config } from '../../config';
import { Group, Member, User, Offer, Need, Post, Account, Transfer, Currency, TransferStats, AccountStats, UserSettings, GroupSettings } from './types';
import { fetchWithAuth, fetchWithRetry } from './fetchWithAuth';

const jsonApiHeaders = {
  'Content-Type': 'application/json',
  'Accept': 'application/vnd.api+json',
};

type GroupCollectionParams = {
  'filter[status]'?: 'active';
  sort?: 'created' | '-created';
}

type MemberCollectionParams = {
  'filter[account]'?: string;
  'filter[status]'?: 'active';
  'filter[created][gt]'?: string;
  sort?: 'created' | '-created';
}

type PostCollectionParams = {
  'filter[member]'?: string;
  'filter[status]'?: 'published';
  'filter[expired]'?: 'true' | 'false';
  'filter[created][gt]'?: string;
  'filter[expires][lt]'?: string;
  sort?: 'created' | '-created' | 'updated' | '-updated' | 'expires';
}

type TransferCollectionParams = {
  'filter[account]'?: string;
  'filter[from]'?: string;
  'filter[to]'?: string;
  'filter[state]'?: 'committed';
}

export class KomunitinClient {
  private async request(url: string) {
    const response = await fetchWithAuth(url, { headers: jsonApiHeaders });
    return response.json();
  }

  public async fetch(url: string, options: RequestInit = {}): Promise<any> {
    const response = await fetchWithRetry(url, {
      ...options,
      headers: { ...jsonApiHeaders, ...options.headers },
    });
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
    return this.request(url);
  }

  // Helper for pagination
  private async paginate<T>(service: 'social' | 'accounting', path: string, params: Record<string, string> = {}): Promise<T[]> {
    const query = new URLSearchParams(params).toString();
    let url = this.getUrl(service, query ? `${path}?${query}` : path);
    let allData: T[] = [];

    while (url) {
      const body = await this.request(url) as any;
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

  public async getGroups(params: GroupCollectionParams = {}): Promise<Group[]> {
    return this.paginate<Group>('social', '/groups', params);
  }

  public async getGroup(groupCode: string, include?: string[]): Promise<{ data: Group; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('social', `/${groupCode}${query}`);
  }

  public async getMembers(groupCode: string, params: MemberCollectionParams = {}): Promise<Member[]> {
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
    const body = await this.request(url) as any;
    const users = body.data as User[];
    const included = body.included || [];
    
    return users.map(user => {
      const settingsId = user.relationships.settings.data.id;
      const settings = included.find((r: any) => r.type === 'user-settings' && r.id === settingsId) as UserSettings;
      return { user, settings };
    });
  }

  public async getGroupAdmins(groupCode: string): Promise<User[]> {
    return this.paginate<User>('social', `/${groupCode}/admins`);
  }

  public async getOffers(groupCode: string, params: PostCollectionParams = {}): Promise<Offer[]> {
    return this.paginate<Offer>('social', `/${groupCode}/posts`, {
      ...params,
      'filter[type]': 'offers',
    });
  }

  public async getPost(groupCode: string, postId: string, include?: string[]): Promise<{ data: Post; included?: any[] }> {
    const query = include ? `?include=${include.join(',')}` : '';
    return this.get('social', `/${groupCode}/posts/${postId}${query}`);
  }

  public async getNeeds(groupCode: string, params: PostCollectionParams = {}): Promise<Need[]> {
    return this.paginate<Need>('social', `/${groupCode}/posts`, {
      ...params,
      'filter[type]': 'needs',
    });
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

  public async getTransfers(groupCode: string, params: TransferCollectionParams = {}): Promise<Transfer[]> {
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
