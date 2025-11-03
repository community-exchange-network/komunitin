package config

import "os"

// Thes environment variables are set in the docker-compose.yml file.
var (
	NotificationsClientId       = os.Getenv("NOTIFICATIONS_CLIENT_ID")
	NotificationsClientSecret   = os.Getenv("NOTIFICATIONS_CLIENT_SECRET")
	KomunitinAuthUrl            = os.Getenv("KOMUNITIN_AUTH_URL")
	KomunitinSocialUrl          = os.Getenv("KOMUNITIN_SOCIAL_URL")
	KomunitinAppUrl             = os.Getenv("KOMUNITIN_APP_URL")
	NotificationsEventsUsername = os.Getenv("NOTIFICATIONS_EVENTS_USERNAME")
	NotificationsEventsPassword = os.Getenv("NOTIFICATIONS_EVENTS_PASSWORD")
	MailersendApiKey            = os.Getenv("MAILERSEND_API_KEY")
	SendMails                   = os.Getenv("SEND_MAILS")
	AdminEmail                  = os.Getenv("ADMIN_EMAIL")
	AppEmail                    = os.Getenv("APP_EMAIL")
)
