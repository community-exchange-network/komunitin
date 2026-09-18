import type { VueWrapper } from '@vue/test-utils';
import App from 'src/App.vue';
import { config } from 'src/utils/config';
import { mountComponent, waitFor } from '../utils';

describe('Legal footer links', () => {
  let wrapper: VueWrapper;
  const originalConfig = { ...config };

  afterEach(() => {
    wrapper.unmount();
    Object.assign(config, originalConfig);
  });

  it.each([
    ['all links', 'https://example.org/privacy', 'https://example.org/terms', 'https://example.org/cookies'],
    ['only privacy', 'https://example.org/privacy', '', ''],
    ['no links', '', '', ''],
  ])('shows %s on the welcome and sign-in pages', async (_, privacy, terms, cookies) => {
    Object.assign(config, { PRIVACY_URL: privacy, TERMS_URL: terms, COOKIES_URL: cookies });
    wrapper = await mountComponent(App);

    for (const route of ['/', '/login-mail']) {
      await wrapper.vm.$router.push(route);
      await waitFor(() => wrapper.find('.q-footer').exists(), true);
      const links = wrapper.findAll('.legal-links a');
      expect(links.map(link => [link.text(), link.attributes('href')])).toEqual(
        [['Privacy', privacy], ['Terms', terms], ['Cookies', cookies]].filter(([, url]) => url)
      );
      expect(wrapper.find('.legal-links').exists()).toBe(Boolean(privacy || terms || cookies));
      expect(wrapper.get('.q-footer').text()).toContain('Documentation');
    }
  });
});
