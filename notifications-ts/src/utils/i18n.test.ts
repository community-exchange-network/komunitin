import assert from 'node:assert';
import { describe, it } from 'node:test';
import { config } from '../config';
import initI18n, { resetI18n } from './i18n';

describe('i18n flavor overrides', () => {
  it('CES flavor', async () => {
    config.FLAVOR = 'ces';
    
    resetI18n(); 
    const i18n = await initI18n();

    assert.equal(i18n.t('app_name'), 'Community Exchange System');
    assert.equal(i18n.t('emails.transfer_title'), 'Trade');
  })

  it('Komunitin flavor', async () => {
    config.FLAVOR = 'komunitin';

    resetI18n();
    const i18n = await initI18n();

    assert.equal(i18n.t('app_name'), 'Komunitin');
    assert.equal(i18n.t('emails.transfer_title'), 'Transfer');
  })

  it('Non-existent flavor', async () => {
    config.FLAVOR = 'nonexistentflavor';

    resetI18n();
    const i18n = await initI18n();

    assert.equal(i18n.t('app_name'), 'Komunitin');
    assert.equal(i18n.t('emails.transfer_title'), 'Transfer');
  })
});
