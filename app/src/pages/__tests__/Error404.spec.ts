import { mount } from '@vue/test-utils'
import Error404 from '../Error404.vue'
import {QBtn, Quasar} from 'quasar'

describe('Error404.vue', () => {
  // Shallow Mount means that the child components are not mounted,
  // but placeholder components are used instead.
  const wrapper = mount(Error404, {
    global: {
      mocks: {
        $t: () => "Sorry, nothing here...",
      },
      plugins: [[Quasar, {
        components: {
          QBtn
        }
      }]]
    },
    shallow: true
  })

  test('Renders message', () => {
    expect(wrapper.text()).toContain('Sorry, nothing here...')
  })

})