package mails

import (
	"embed"
	htmlTemplate "html/template"
	"math"
	"strings"
	textTemplate "text/template"

	"github.com/komunitin/komunitin/notifications/api"
	"github.com/komunitin/komunitin/notifications/config"
	"github.com/komunitin/komunitin/notifications/i18n"
	"golang.org/x/text/number"
)

//go:embed template/html/*
var html embed.FS

//go:embed template/text/*
var text embed.FS

const (
	Payment = "Payment"
	Income  = "Income"
)

// Data for the template
type TemplateMainData struct {
	Subject  string
	Name     string
	LogoUrl  string
	SiteName string
	Footer   string
	Greeting string
}

type TemplateTransferData struct {
	PayerAvatarUrl string
	PayerName      string
	PayerAccount   string
	PayeeAvatarUrl string
	PayeeName      string
	PayeeAccount   string
	Payment        bool
	Amount         string
	State          string
	Group          string
	Time           string
	Description    string
}

type TemplateActionData struct {
	ActionUrl  string
	ActionText string
}

type TemplateTextData struct {
	Text    string
	Subtext string
}

// All data required for emails with content template "text".
type EmailTextData struct {
	TemplateMainData
	TemplateActionData
	TemplateTextData
}

// All data required for emails with content template "transfer".
type EmailTransferData struct {
	TemplateMainData
	TemplateActionData
	TemplateTextData
	TemplateTransferData
}

func FormatCurrency(amount int, currency *api.Currency, t *i18n.Translator) string {
	scaled := float64(amount) / math.Pow10(currency.Scale)
	return t.C(scaled, currency.Symbol, number.Scale(currency.Decimals))
}

func buildMessage(t *i18n.Translator, subject string, templateContentName string, templateData any) (*Email, error) {
	// Functions available in the template
	funcMap := htmlTemplate.FuncMap{
		"t":         t.T,
		"uppercase": strings.ToUpper,
	}
	// Build HTML body
	htmlT, err := htmlTemplate.New("html").Funcs(funcMap).ParseFS(html, "template/html/*.html", "template/html/content/"+templateContentName+".html")
	if err != nil {
		return nil, err
	}
	w := new(strings.Builder)
	err = htmlT.ExecuteTemplate(w, "main", templateData)
	if err != nil {
		return nil, err
	}
	htmlBody := w.String()

	// Build text body
	textT, err := textTemplate.New("text").Funcs(funcMap).ParseFS(text, "template/text/*.txt", "template/text/content/"+templateContentName+".txt")
	if err != nil {
		return nil, err
	}
	w.Reset()
	err = textT.ExecuteTemplate(w, "main", templateData)
	if err != nil {
		return nil, err
	}
	textBody := w.String()

	return &Email{
		Subject:  subject,
		BodyHtml: htmlBody,
		BodyText: textBody,
	}, nil
}

func buildTransferMessage(t *i18n.Translator, templateData EmailTransferData) (*Email, error) {
	return buildMessage(t, templateData.Subject, "transfer", templateData)
}

func buildTextMessage(t *i18n.Translator, templateData EmailTextData) (*Email, error) {
	return buildMessage(t, templateData.Subject, "text", templateData)
}

func buildTemplateMainData(t *i18n.Translator) TemplateMainData {
	return TemplateMainData{
		LogoUrl:  config.KomunitinAppUrl + "/logos/logo-200.png",
		SiteName: "Komunitin",
		Footer:   t.T("footer"),
	}
}

// Creates the EmailTransferData object with the generic data required for the template,
// that is not specific to the payer, payee or exact type of event.
func buildCommonTransferTemplateData(t *i18n.Translator, payer *api.Member, payee *api.Member, transfer *api.Transfer) EmailTransferData {
	templateData := EmailTransferData{
		TemplateMainData: buildTemplateMainData(t),
		TemplateTransferData: TemplateTransferData{
			PayerAvatarUrl: payer.Image,
			PayerName:      payer.Name,
			PayerAccount:   transfer.Payer.Code,
			PayeeAvatarUrl: payee.Image,
			PayeeName:      payee.Name,
			PayeeAccount:   transfer.Payee.Code,
			Amount:         FormatCurrency(transfer.Amount, transfer.Currency, t),
			State:          t.T(transfer.State),
			Group:          transfer.Currency.Code,
			Time:           t.Dt(transfer.Created),
			Description:    transfer.Meta,
		},
		TemplateActionData: TemplateActionData{
			ActionUrl:  config.KomunitinAppUrl + "/groups/" + transfer.Currency.Code + "/transactions/" + transfer.Id,
			ActionText: t.T("viewTransaction"),
		},
	}
	return templateData
}

func buildTransferTemplateData(t *i18n.Translator, payer *api.Member, payee *api.Member, transfer *api.Transfer, emailType TransferEmailType) EmailTransferData {
	templateData := buildCommonTransferTemplateData(t, payer, payee, transfer)
	switch emailType {
	case paymentSent:
		templateData.Payment = true
		templateData.Text = t.Td("paymentSentText", map[string]string{"Amount": templateData.Amount, "PayeeName": payee.Name})
		templateData.Subject = t.T("paymentSentSubject")
	case paymentReceived:
		templateData.Payment = false
		templateData.Text = t.Td("paymentReceivedText", map[string]string{"Amount": templateData.Amount, "PayerName": payer.Name})
		templateData.Subject = t.T("paymentReceivedSubject")
	case paymentRejected:
		templateData.Payment = false
		templateData.Text = t.Td("paymentRejectedText", map[string]string{"Amount": templateData.Amount, "PayerName": payer.Name})
		templateData.Subtext = t.T("paymentRejectedSubtext")
		templateData.Subject = t.T("paymentRejectedSubject")
	case paymentPending:
		templateData.Payment = true
		templateData.Text = t.Td("paymentPendingText", map[string]string{"Amount": templateData.Amount, "PayeeName": payee.Name})
		templateData.Subtext = t.T("paymentPendingSubtext")
		templateData.Subject = t.T("paymentPendingSubject")
	}

	if templateData.Payment {
		templateData.Name = payer.Name
	} else {
		templateData.Name = payee.Name
	}
	templateData.Greeting = t.Td("hello", map[string]string{"Name": templateData.Name})
	return templateData
}

func buildMemberRequestedTemplateData(t *i18n.Translator, member *api.Member, group *api.Group) EmailTextData {
	templateData := EmailTextData{
		TemplateMainData: buildTemplateMainData(t),
		TemplateTextData: TemplateTextData{
			Text:    t.Td("memberRequestedText", map[string]string{"MemberName": member.Name, "GroupName": group.Name}),
			Subtext: t.T("memberRequestedSubtext"),
		},
		TemplateActionData: TemplateActionData{
			ActionUrl:  config.KomunitinAppUrl + "/groups/" + group.Code + "/admin/accounts",
			ActionText: t.T("reviewRequests"),
		},
	}
	templateData.Subject = t.T("memberRequestedSubject")
	templateData.Greeting = t.T("helloAdmin")

	return templateData
}

func buildMemberJoinedTemplateData(t *i18n.Translator, member *api.Member, account *api.Account, group *api.Group) EmailTextData {
	templateData := EmailTextData{
		TemplateMainData: buildTemplateMainData(t),
		TemplateTextData: TemplateTextData{
			Text:    t.Td("memberJoinedText", map[string]string{"AccountCode": account.Code, "GroupName": group.Name}),
			Subtext: t.T("memberJoinedSubtext"),
		},
		TemplateActionData: TemplateActionData{
			ActionUrl:  config.KomunitinAppUrl + "/login-mail?redirect=/groups/" + group.Code,
			ActionText: t.T("signIn"),
		},
	}
	templateData.Name = member.Name
	templateData.Subject = t.Td("memberJoinedSubject", map[string]string{"GroupName": group.Name})
	templateData.Greeting = t.Td("hello", map[string]string{"Name": member.Name})

	return templateData
}

func buildGroupActivatedTemplateData(t *i18n.Translator, group *api.Group) EmailTextData {
	templateData := EmailTextData{
		TemplateMainData: buildTemplateMainData(t),
		TemplateTextData: TemplateTextData{
			Text:    t.Td("groupActivatedText", map[string]string{"GroupName": group.Name}),
			Subtext: t.T("groupActivatedSubtext"),
		},
		TemplateActionData: TemplateActionData{
			ActionUrl:  config.KomunitinAppUrl + "/login-mail?redirect=/groups/" + group.Code,
			ActionText: t.T("signIn"),
		},
	}
	templateData.Subject = t.Td("groupActivatedSubject", map[string]string{"GroupName": group.Name})
	templateData.Greeting = t.T("helloAdmin")

	return templateData
}
