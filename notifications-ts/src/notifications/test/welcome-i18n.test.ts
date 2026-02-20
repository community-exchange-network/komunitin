import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createMember, db, getUserIdForMember } from '../../mocks/db'
import { createEvent, setupNotificationsTest } from './utils'

const { put, appNotifications } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
})

describe('Welcome notification i18n', () => {
  it('renders the welcome message in each supported language', async () => {
    const groupCode = 'GRP1'
    const groupName = 'Group GRP1'
    const memberName = 'Ada Lovelace'

    const expectations = [
      {
        language: 'en',
        title: `Welcome to ${groupName}!`,
        body: `Hi ${memberName}, your account is now active! Start exploring offers and needs in your community. Happy exchange!`,
      },
      {
        language: 'ca',
        title: `Benvingut/da a ${groupName}!`,
        body: `Hola ${memberName}, el teu compte ja és actiu! Ja pots explorar ofertes i necessitats a la teva comunitat. Feliç intercanvi!`,
      },
      {
        language: 'es',
        title: `¡Bienvenido/a a ${groupName}!`,
        body: `Hola ${memberName}, tu cuenta ya está activa! Empieza a explorar ofertas y necesidades en tu comunidad. ¡Feliz intercambio!`,
      },
      {
        language: 'it',
        title: `Benvenuto/a a ${groupName}!`,
        body: `Ciao ${memberName}, il tuo account è ora attivo! Inizia a esplorare offerte e necessità nella tua comunità. Buono scambio!`,
      },
      {
        language: 'fr',
        title: `Bienvenue sur ${groupName} !`,
        body: `Bonjour ${memberName}, votre compte est maintenant actif ! Commencez à explorer les offres et besoins dans votre communauté. Bon échange !`,
      },
    ]

    for (const { language, title, body } of expectations) {
      const member = createMember({ groupCode, name: memberName })
      const userId = getUserIdForMember(member.id)

      const settings = db.userSettings.find(s => s.id === `${userId}-settings`)
      if (settings) {
        settings.attributes.language = language
      }

      const eventData = createEvent('MemberJoined', member.id, groupCode, userId, `test-welcome-${language}`, 'member')
      await put(eventData)

      assert.equal(appNotifications.length, 1)
      const notification = appNotifications[0]
      assert.equal(notification.title, title)
      assert.equal(notification.body, body)

      appNotifications.length = 0
    }
  })
})
