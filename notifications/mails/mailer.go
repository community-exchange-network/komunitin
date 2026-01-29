package mails

// Listens the events stream and send relevant emails to users.

// This service relies on the Komunitin api in order to fetch
// the user, users settings, members and message data.

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strings"

	"github.com/komunitin/komunitin/notifications/api"
	"github.com/komunitin/komunitin/notifications/config"
	"github.com/komunitin/komunitin/notifications/events"
	"github.com/komunitin/komunitin/notifications/i18n"
)

// These are the possible email types for transfers that can be sent.
type TransferEmailType int

const (
	undefinedEmailType TransferEmailType = iota
	paymentSent
	paymentReceived
	paymentRejected
	paymentPending
)

type fetchWichUsers int

const (
	fetchBothUsers = iota
	fetchPayerUsers
	fetchPayeeUsers
)

var mailSender MailSender

func Mailer(ctx context.Context) error {
	// Open the events stream.
	stream, err := events.NewEventsStream(ctx, "mailer")
	if err != nil {
		return err
	}

	if config.SendMails == "true" {
		if config.MailersendApiKey != "" {
			mailSender = NewMailerSend(config.MailersendApiKey)
		} else {
			// Use SMTP when MailerSend API key is not set
			sender, err := NewSmtpSender(config.SmtpHost, config.SmtpPort, config.SmtpUser, config.SmtpPass)
			if err != nil {
				return fmt.Errorf("failed to initialize SMTP sender: %w", err)
			}
			mailSender = sender
		}
	} else {
		mailSender = NewMockMailSender()
	}

	// Infinite loop
	for {
		// Blocking call to get next event in stream
		event, err := stream.Get(ctx)
		if err != nil {
			// Unexpected error, terminating.
			return err
		}
		err = handleEvent(ctx, event)
		if err != nil {
			// Error handling event. Just print and ignore event.
			log.Printf("error handling event from mailer: %v\n", err)
		}
		// Acknowledge event handled
		stream.Ack(ctx, event.Id)
	}
}

func handleEvent(ctx context.Context, event *events.Event) error {

	// Create a new context with the baseUrl value from the Source field of the event.
	// api methids GetTransfer and GetAccount will take the accounting base URL from
	// this context.
	ctx, err := api.NewContext(ctx, event.Source)
	if err != nil {
		return err
	}

	// Handle event depending on its type
	switch event.Name {
	case events.TransferCommitted:
		return handleTransferCommitted(ctx, event)
	case events.TransferRejected:
		return handleTransferRejected(ctx, event)
	case events.TransferPending:
		return handleTransferPending(ctx, event)
	case events.MemberJoined:
		return handleMemberJoined(ctx, event)
	case events.MemberRequested:
		return handleMemberRequested(ctx, event)
	case events.GroupActivated:
		return handleGroupActivated(ctx, event)
	case events.GroupRequested:
		return handleGroupRequested(ctx, event)
	}
	return nil
}

// Send emails to all users involved in the transfer that have the
// myAccount email setting enabled. Even to the user originating the
// event.
func handleTransferCommitted(ctx context.Context, event *events.Event) error {
	payer, payerUsers, payee, payeeUsers, transfer, err := fetchTransferResources(ctx, event, fetchBothUsers)
	if err != nil {
		return err
	}

	// Send email to payer users
	for _, user := range payerUsers {
		if userWantAccountEmails(user) {
			if errMail := sendTransferEmail(ctx, user, payer, payee, transfer, paymentSent); errMail != nil {
				err = errMail
			}
		}
	}

	// Send email to payee users
	for _, user := range payeeUsers {
		if userWantAccountEmails(user) {
			if errMail := sendTransferEmail(ctx, user, payer, payee, transfer, paymentReceived); errMail != nil {
				err = errMail
			}
		}
	}

	return err
}

// Send email to all users involved in the transfer that have the
// myAccount email setting enabled except the user originating the event.
func handleTransferRejected(ctx context.Context, event *events.Event) error {
	payer, _, payee, payeeUsers, transfer, err := fetchTransferResources(ctx, event, fetchPayeeUsers)
	if err != nil {
		return err
	}
	for _, user := range payeeUsers {
		if userWantAccountEmails(user) {
			if errMail := sendTransferEmail(ctx, user, payer, payee, transfer, paymentRejected); errMail != nil {
				err = errMail
			}
		}
	}
	return err
}

func handleTransferPending(ctx context.Context, event *events.Event) error {
	payer, payerUsers, payee, _, transfer, err := fetchTransferResources(ctx, event, fetchPayerUsers)
	if err != nil {
		return err
	}
	for _, user := range payerUsers {
		if userWantAccountEmails(user) {
			if errMail := sendTransferEmail(ctx, user, payer, payee, transfer, paymentPending); errMail != nil {
				err = errMail
			}
		}
	}
	return err
}

func userWantAccountEmails(user *api.User) bool {
	komunitin := user.Settings.Komunitin
	if !komunitin {
		return false
	}
	emails := user.Settings.Emails
	if emails == nil {
		return false
	}
	myAccount, ok := emails["myAccount"]
	if !ok {
		return false
	}
	return myAccount.(bool)
}

func fetchTransferResources(ctx context.Context, event *events.Event, which fetchWichUsers) (payer *api.Member, payerUsers []*api.User, payee *api.Member, payeeUsers []*api.User, transfer *api.Transfer, err error) {

	accountIds := []string{event.Data["payer"], event.Data["payee"]}
	transferId := event.Data["transfer"]

	// Fetch transfer details, payer and payee details and related user emails.
	transfer, err = api.GetTransfer(ctx, event.Code, transferId)
	if err != nil {
		return
	}

	members, err := api.GetAccountMembers(ctx, event.Code, accountIds)
	if err != nil {
		return
	}

	// Find the payer and payee members since the return order from the api is not guaranteed.
	for _, member := range members {
		switch member.Account.Id {
		case event.Data["payer"]:
			payer = member
		case event.Data["payee"]:
			payee = member
		}
	}

	if payer == nil {
		err = fmt.Errorf("payer member for account %s not found", event.Data["payer"])
		return
	} else if payee == nil {
		err = fmt.Errorf("payee member for account %s not found", event.Data["payee"])
		return
	}

	if which == fetchPayerUsers || which == fetchBothUsers {
		payerUsers, err = api.GetMemberUsers(ctx, payer.Id)
		if err != nil {
			return
		}
	}
	if which == fetchPayeeUsers || which == fetchBothUsers {
		payeeUsers, err = api.GetMemberUsers(ctx, payee.Id)
		if err != nil {
			return
		}
	}
	return
}

func handleMemberRequested(ctx context.Context, event *events.Event) error {
	// Fetch member
	member, err := api.GetMember(ctx, event.Code, event.Data["member"])
	if err != nil {
		return err
	}
	// Fetch group admins
	group, err := api.GetGroup(ctx, event.Code)
	if err != nil {
		return err
	}
	// Send email to admins
	for _, admin := range group.Admins {
		errMail := sendMemberRequestedEmail(ctx, admin, member, group)
		if errMail != nil {
			err = errMail
		}
	}

	return err
}

func handleMemberJoined(ctx context.Context, event *events.Event) error {
	member, err := api.GetMember(ctx, event.Code, event.Data["member"])
	if err != nil {
		return err
	}

	// Using GetResourceUrl instead of GetAccount so that it uses the correct
	// linked accounting service baseURL and we don't need to guess it here.
	account := new(api.Account)
	err = api.GetResourceUrl(ctx, member.Account.Href, account)
	if err != nil {
		return err
	}

	group, err := api.GetGroup(ctx, event.Code)
	if err != nil {
		return err
	}

	users, err := api.GetMemberUsers(ctx, member.Id)
	if err != nil {
		return err
	}

	for _, user := range users {
		if userWantAccountEmails(user) {
			if errMail := sendMemberJoinedEmail(ctx, user, member, account, group); errMail != nil {
				err = errMail
			}
		}
	}
	return err
}

func handleGroupActivated(ctx context.Context, event *events.Event) error {
	group, err := api.GetGroup(ctx, event.Code)
	if err != nil {
		return err
	}
	for _, admin := range group.Admins {
		errMail := sendGroupActivatedEmail(ctx, admin, group)
		if errMail != nil {
			err = errMail
		}
	}
	return err
}

func handleGroupRequested(ctx context.Context, event *events.Event) error {
	group, err := api.GetGroup(ctx, event.Code)
	if err != nil {
		return err
	}
	t, err := i18n.NewTranslator("en")
	if err != nil {
		return err
	}
	templateData := buildGroupRequestedTemplateData(t, group)
	recipient := parseEmailAddress(config.AdminEmail)
	message, err := buildTextMessage(t, templateData)
	if err != nil {
		return err
	}

	return sendEmail(ctx, message, recipient.Name, recipient.Email)
}

func sendEmail(ctx context.Context, message *Email, name string, email string) error {
	message.From = parseEmailAddress(config.AppEmail)

	message.AddRecipient(name, email)
	return mailSender.SendMail(ctx, *message)
}

func sendTransferEmail(ctx context.Context, user *api.User, payer *api.Member, payee *api.Member, transfer *api.Transfer, emailType TransferEmailType) error {
	t, err := i18n.NewTranslator(user.Settings.Language)
	if err != nil {
		return err
	}
	templateData := buildTransferTemplateData(t, payer, payee, transfer, emailType)
	message, err := buildTransferMessage(t, templateData)
	if err != nil {
		return err
	}

	return sendEmail(ctx, message, templateData.Name, user.Email)
}

func sendMemberRequestedEmail(ctx context.Context, admin *api.User, member *api.Member, group *api.Group) error {
	t, err := i18n.NewTranslator(admin.Settings.Language)
	if err != nil {
		return err
	}
	templateData := buildMemberRequestedTemplateData(t, member, group)
	message, err := buildTextMessage(t, templateData)
	if err != nil {
		return err
	}

	return sendEmail(ctx, message, "", admin.Email)

}

func sendMemberJoinedEmail(ctx context.Context, user *api.User, member *api.Member, account *api.Account, group *api.Group) error {
	t, err := i18n.NewTranslator(user.Settings.Language)
	if err != nil {
		return err
	}
	templateData := buildMemberJoinedTemplateData(t, member, account, group)
	message, err := buildTextMessage(t, templateData)
	if err != nil {
		return err
	}

	return sendEmail(ctx, message, "", user.Email)
}

func sendGroupActivatedEmail(ctx context.Context, admin *api.User, group *api.Group) error {
	t, err := i18n.NewTranslator(admin.Settings.Language)
	if err != nil {
		return err
	}
	templateData := buildGroupActivatedTemplateData(t, group)
	message, err := buildTextMessage(t, templateData)
	if err != nil {
		return err
	}

	return sendEmail(ctx, message, "", admin.Email)
}

func parseEmailAddress(address string) Recipient {
	// Regular expression to match "Name <email@domain.com>" format
	re := regexp.MustCompile(`^(.+?)\s*<(.+?)>$`)
	matches := re.FindStringSubmatch(strings.TrimSpace(address))

	if len(matches) == 3 {
		// Format: "Name <email>"
		return Recipient{
			Name:  strings.TrimSpace(matches[1]),
			Email: strings.TrimSpace(matches[2]),
		}
	}

	// Format: just "email" without name
	return Recipient{
		Name:  "",
		Email: strings.TrimSpace(address),
	}
}
