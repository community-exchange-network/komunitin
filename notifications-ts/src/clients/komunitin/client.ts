import { config } from '../../config';
import { Group, Member, User, Offer, Need, Post, Account, Transfer, Currency, TransferStats, AccountStats, MemberUser, MemberUserWithResources, GroupSettings } from './types';
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
  'filter[member.status]'?: 'active';
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

type MemberUserCollectionParams = {
  member?: string | string[];
  memberStatus?: Member['attributes']['status'];
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

  // Helper for pagination. The mapper may combine primary and included resources from each page.
  private async paginate<T>(
    service: 'social' | 'accounting',
    path: string,
    params: Record<string, string> = {},
    mapPage: (body: any) => T[] = (body) => body.data ?? [],
  ): Promise<T[]> {
    const actualParams = {
      'page[size]': '200',
      ...params
    };
    const query = new URLSearchParams(actualParams).toString();
    let url = this.getUrl(service, query ? `${path}?${query}` : path);
    const allData: T[] = [];

    while (url) {
      const body = await this.request(url) as any;
      allData.push(...mapPage(body));

      url = body.links?.next ?? '';
      if (url) {
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
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

  public async getMemberUsers(
    groupCode: string,
    filters: MemberUserCollectionParams = {},
  ): Promise<MemberUserWithResources[]> {
    if (Array.isArray(filters.member) && filters.member.length === 0) {
      return [];
    }
    const params: Record<string, string> = {
      include: 'user,member'
    };
    if (filters.member) {
      params['filter[member]'] = Array.isArray(filters.member)
        ? filters.member.join(',')
        : filters.member;
    }
    if (filters.memberStatus) {
      params['filter[member.status]'] = filters.memberStatus;
    }

    return this.paginate<MemberUserWithResources>(
      'social',
      `/${groupCode}/member-users`,
      params,
      (body) => {
        const memberUsers = body.data as MemberUser[];
        const users = new Map<string, User>(
          (body.included ?? [])
            .filter((resource: { type: string }) => resource.type === 'users')
            .map((user: User) => [user.id, user]),
        );
        const members = new Map<string, Member>(
          (body.included ?? [])
            .filter((resource: { type: string }) => resource.type === 'members')
            .map((member: Member) => [member.id, member]),
        );

        return memberUsers.map((memberUser) => {
          const userId = memberUser.relationships.user.data.id;
          const memberId = memberUser.relationships.member.data.id;
          const user = users.get(userId);
          const member = members.get(memberId);
          if (!user) {
            throw new Error(`Missing included user ${userId} for member-user ${memberUser.id}`);
          }
          if (!member) {
            throw new Error(`Missing included member ${memberId} for member-user ${memberUser.id}`);
          }
          return { memberUser, user, member };
        });
      },
    );
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

  public async getGroupSettings(groupCode: string): Promise<GroupSettings> {
    const res = await this.get('social', `/${groupCode}/settings`);
    return res.data;
  }
}
