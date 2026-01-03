package mails

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/wneessen/go-mail"
)

type SmtpSender struct {
	client *mail.Client
}

func NewSmtpSender(host, port, username, password string) (*SmtpSender, error) {
	portNum, err := strconv.Atoi(port)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP port: %w", err)
	}

	client, err := mail.NewClient(host,
		mail.WithPort(portNum),
		mail.WithSMTPAuth(mail.SMTPAuthPlain),
		mail.WithUsername(username),
		mail.WithPassword(password),
		mail.WithTLSPolicy(mail.TLSMandatory),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create SMTP client: %w", err)
	}

	log.Printf("SMTP client initialized: %s:%s\n", host, port)

	return &SmtpSender{
		client: client,
	}, nil
}

func (s *SmtpSender) SendMail(ctx context.Context, message Email) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	m := mail.NewMsg()

	// Set From address
	if err := m.FromFormat(message.From.Name, message.From.Email); err != nil {
		return fmt.Errorf("failed to set from address: %w", err)
	}

	// Set Recipients
	for _, to := range message.To {
		if err := m.AddToFormat(to.Name, to.Email); err != nil {
			return fmt.Errorf("failed to add to address: %w", err)
		}
	}

	// Set Subject
	m.Subject(message.Subject)

	// Set Body (HTML and Text)
	m.SetBodyString(mail.TypeTextPlain, message.BodyText)
	m.AddAlternativeString(mail.TypeTextHTML, message.BodyHtml)

	// Send the email
	if err := s.client.DialAndSendWithContext(ctx, m); err != nil {
		return fmt.Errorf("error sending email: %w", err)
	}

	for _, recipient := range message.To {
		log.Printf("Email sent to %s <%s>\n", recipient.Name, recipient.Email)
	}

	return nil
}
