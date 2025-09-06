package api

// Komunitin API object models.

import (
	"time"

	"github.com/komunitin/jsonapi"
)

type User struct {
	Id       string        `jsonapi:"primary,users"`
	Email    string        `jsonapi:"attr,email"`
	Members  []*Member     `jsonapi:"relation,members"`
	Settings *UserSettings `jsonapi:"relation,settings"`
}

type Group struct {
	Id    string `jsonapi:"primary,groups"`
	Code  string `jsonapi:"attr,code"`
	Name  string `jsonapi:"attr,name"`
	Image string `jsonapi:"attr,image"`

	Admins []*User `jsonapi:"relation,admins"`
}

type Member struct {
	SelfLink string `jsonapi:"link,self"`
	Id       string `jsonapi:"primary,members"`
	Code     string `jsonapi:"attr,code"`
	Name     string `jsonapi:"attr,name"`
	Image    string `jsonapi:"attr,image"`
	// Ommitted other fields.
	Account *ExternalAccount `jsonapi:"relation,account"`
	// Ommitted other relations.
}

type UserSettings struct {
	Id            string                 `jsonapi:"primary,user-settings"`
	Language      string                 `jsonapi:"attr,language"`
	Komunitin     bool                   `jsonapi:"attr,komunitin"`
	Notifications map[string]interface{} `jsonapi:"attr,notifications"`
	Emails        map[string]interface{} `jsonapi:"attr,emails"`
}

type Transfer struct {
	Id       string         `jsonapi:"primary,transfers"`
	Amount   int            `jsonapi:"attr,amount"`
	Meta     map[string]any `jsonapi:"attr,meta"`
	State    string         `jsonapi:"attr,state"`
	Created  time.Time      `jsonapi:"attr,created,iso8601"`
	Updated  time.Time      `jsonapi:"attr,updated,iso8601"`
	Payer    *Account       `jsonapi:"relation,payer"`
	Payee    *Account       `jsonapi:"relation,payee"`
	Currency *Currency      `jsonapi:"relation,currency"`
}

type Account struct {
	Id          string    `jsonapi:"primary,accounts"`
	Code        string    `jsonapi:"attr,code"`
	Balance     int       `jsonapi:"attr,balance"`
	CreditLimit int       `jsonapi:"attr,creditLimit"`
	DebitLimit  int       `jsonapi:"attr,debitLimit"`
	Currency    *Currency `jsonapi:"relation,currency"`
}

type Currency struct {
	Id         string `jsonapi:"primary,currencies"`
	CodeType   string `jsonapi:"attr,codeType"`
	Code       string `jsonapi:"attr,code"`
	Name       string `jsonapi:"attr,name"`
	NamePlural string `jsonapi:"attr,namePlural"`
	Symbol     string `jsonapi:"attr,symbol"`
	Decimals   int    `jsonapi:"attr,decimals"`
	Scale      int    `jsonapi:"attr,scale"`
	Value      int    `jsonapi:"attr,value"`
}

// The jonapi library does not support embedded structs. There
// is a branch with this feature in the repo but it is inactive
// and not merged. So we need to repeat all the fields for each type.
// For some types we're just using the id and then we don't need to
// implement the meta part so far.

type ExternalMember struct {
	Id   string `jsonapi:"primary,members" json:"id"`
	Href string `jsonapi:"meta,href" json:"href"`
}

type ExternalAccount struct {
	Id   string `jsonapi:"primary,accounts" json:"id"`
	Href string `jsonapi:"meta,href" json:"href"`
}

// External User.
type ExternalUser struct {
	Id       string `jsonapi:"primary,users" json:"id"`
	Href     string `jsonapi:"meta,href" json:"href"`
	External bool   `jsonapi:"meta,external" json:"external"`
}

func (object ExternalUser) JSONAPIMeta() *jsonapi.Meta {
	return &jsonapi.Meta{
		"external": object.External,
		"href":     object.Href,
	}
}

// External Transfer object. Use the href URL to fetch the actual transfer object.
type ExternalTransfer struct {
	Id       string `jsonapi:"primary,transfers" json:"id"`
	Href     string `jsonapi:"meta,href" json:"href"`
	External bool   `jsonapi:"meta,external" json:"external"`
}

// Implement the Metable interface for ExternalTransfer.
// https://pkg.go.dev/github.com/google/jsonapi#readme-meta
func (object ExternalTransfer) JSONAPIMeta() *jsonapi.Meta {
	return &jsonapi.Meta{
		"external": object.External,
		"href":     object.Href,
	}
}
