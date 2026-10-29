import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import MemberProfile from '@/pages/members/MemberProfile.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'

describe('Stored Markdown', () => {
  let wrapper: VueWrapper

  afterEach(() => wrapper?.unmount())

  it('renders formatting and safe links without active HTML or script URLs', async () => {
    seeds()
    const member = server.schema.db.members[0]
    server.schema.db.members.update(member.id, { description: [
      '**Formatted biography**',
      '[Website](https://example.org)',
      '<img src=x onerror="alert(document.domain)">',
      '[Unsafe link](javascript:alert%281%29)',
      '<svg onload="alert(1)"></svg>',
      '<script>alert(1)</script>',
    ].join('\n\n') })
    wrapper = await mountComponent(App, { login: true })

    await wrapper.vm.$router.push(`/groups/GRP0/members/${member.code}`)
    await waitFor(() => wrapper.findComponent(MemberProfile).exists(), true)
    const profile = wrapper.getComponent(MemberProfile)

    expect(profile.get('strong').text()).toBe('Formatted biography')
    expect(profile.get('a[href="https://example.org"]').text()).toBe('Website')
    expect(profile.find('[onerror], [onload], script').exists()).toBe(false)
    expect(profile.findAll('a').some(link => link.attributes('href')?.startsWith('javascript:'))).toBe(false)
    expect(profile.text()).toContain('Unsafe link')
  })
})
