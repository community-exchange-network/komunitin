package mails

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/komunitin/komunitin/notifications/api"
)

var user1 = &api.User{
	Id:    "1",
	Email: "user@example.com",
	Settings: &api.UserSettings{
		Language: "en",
	},
}
var member1 = &api.Member{
	Id:    "1",
	Name:  "John Doe",
	Image: "https://example.com/member.jpg",
	Account: &api.ExternalAccount{
		Id: "1",
	},
}
var account1 = &api.Account{
	Id:   "1",
	Code: "GRPX0001",
}
var group1 = &api.Group{
	Id:   "1",
	Name: "Group X",
	Code: "GRPX",
}

func TestTransferMessage(t *testing.T) {
	mailSender = NewMockMailSender()
	user := &api.User{
		Id:    "1",
		Email: "user@example.com",
		Settings: &api.UserSettings{
			Language: "en",
		},
	}
	created, _ := time.Parse(time.RFC3339, "2024-04-16T23:05:00Z")
	transfer := &api.Transfer{
		Id:     "1",
		Amount: 100,
		State:  "committed",
		Meta: map[string]any{
			"description": "Test transaction",
		},
		Payer: &api.Account{
			Code: "001",
		},
		Payee: &api.Account{
			Code: "002",
		},
		Currency: &api.Currency{
			Code:     "TEST",
			Symbol:   "#",
			Decimals: 2,
			Scale:    2,
		},
		Created: created,
	}
	payer := &api.Member{
		Id:    "1",
		Name:  "Payer",
		Image: "https://example.com/payer.jpg",
	}
	payee := &api.Member{
		Id:    "2",
		Name:  "Payee",
		Image: "https://example.com/payee.jpg",
	}

	err := sendTransferEmail(context.Background(), user1, payer, payee, transfer, paymentSent)
	if err != nil {
		t.Error(err)
	}
	msg := (mailSender.(*MailSenderMock)).SentEmails[0]

	if msg.Subject != "Payment sent" {
		t.Errorf("Expected 'Payment sent', got '%s'", msg.Subject)
	}
	if !strings.Contains(msg.BodyHtml, "#1.00") {
		t.Errorf("Expected '#1.00', got '%s'", msg.BodyHtml)
	}
	if !strings.Contains(msg.BodyHtml, "Hello Payer,") {
		t.Errorf("Expected 'Hello Payer,', got '%s'", msg.BodyHtml)
	}
	if !strings.Contains(msg.BodyHtml, "View transaction") {
		t.Errorf("Expected 'View transaction', got '%s'", msg.BodyHtml)
	}
	if !strings.Contains(msg.BodyHtml, "Test transaction") {
		t.Errorf("Expected 'Test transaction', got '%s'", msg.BodyHtml)
	}
	if !strings.Contains(msg.BodyHtml, "You have paid #1.00 to Payee.") {
		t.Errorf("Expected 'You have paid #1.00 to Payee.', got '%s'", msg.BodyHtml)
	}

	if !strings.Contains(msg.BodyText, "#1.00") {
		t.Errorf("Expected '#1.00', got '%s'", msg.BodyText)
	}
	if !strings.Contains(msg.BodyText, "Hello Payer,") {
		t.Errorf("Expected 'Hello Payer,', got '%s'", msg.BodyText)
	}
	if !strings.Contains(msg.BodyText, "You have paid #1.00 to Payee.") {
		t.Errorf("Expected 'You have paid #1.00 to Payee.', got '%s'", msg.BodyText)
	}

	// Test other lang
	user.Settings.Language = "es"
	err = sendTransferEmail(context.Background(), user, payer, payee, transfer, paymentSent)
	if err != nil {
		t.Error(err)
	}
	msg = (mailSender.(*MailSenderMock)).SentEmails[1]

	if msg.Subject != "Pago enviado" {
		t.Errorf("Expected 'Pago enviado', got '%s'", msg.Subject)
	}
	if !strings.Contains(msg.BodyHtml, "Has pagado 1,00# a Payee.") {
		t.Errorf("Expected 'Has pagado 1,00# a Payee.', got '%s'", msg.BodyHtml)
	}
	if !strings.Contains(msg.BodyText, "Has pagado 1,00# a Payee.") {
		t.Errorf("Expected 'Has pagado 1,00# a Payee.', got '%s'", msg.BodyText)
	}
}

func TestMemberJoinedMessage(t *testing.T) {
	mailSender = NewMockMailSender()

	err := sendMemberJoinedEmail(context.Background(), user1, member1, account1, group1)
	if err != nil {
		t.Error(err)
	}
	msg := (mailSender.(*MailSenderMock)).SentEmails[0]

	expectedSubject := "Welcome to " + group1.Name
	if msg.Subject != expectedSubject {
		t.Errorf("Expected 'Welcome to "+group1.Name+"', got '%s'", msg.Subject)
	}
	expectedText := "Hello John Doe"
	if !strings.Contains(msg.BodyHtml, expectedText) {
		t.Errorf("Expected '%s', got '%s'", expectedText, msg.BodyHtml)
	}
	expectedText = "You have been accepted as a member of Group X. Your account number is GRPX0001."
	if !strings.Contains(msg.BodyHtml, expectedText) {
		t.Errorf("Expected '%s', got '%s'", expectedText, msg.BodyHtml)
	}
}
