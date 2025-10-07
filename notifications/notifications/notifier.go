package notifications

// Listens the events stream and send relevant push notifications to users.

import (
	"context"
	"fmt"
	"log"
	"maps"
	"reflect"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"

	"github.com/komunitin/komunitin/notifications/api"
	"github.com/komunitin/komunitin/notifications/events"
	"github.com/komunitin/komunitin/notifications/store"
)

// Event types (used for notification preferences)
const (
	MyAccount  = "myAccount"
	NewOffers  = "newOffers"
	NewNeeds   = "newNeeds"
	NewMembers = "newMembers"
)

type TransferEventDestination int

const (
	Payer TransferEventDestination = iota
	Payee
	Both
)

// Wait for data in events stream and perform notifications as needed.
func Notifier(ctx context.Context) error {
	// TODO: Better error handling. Need to be studied carefully, but:
	//  - error at reading could be reattempted after X seconds
	//  - erroneous events/notifications could be moved to a seaparate stream

	// TODO: For far greather throughtput we can decouple reading events from
	// sending notifications by reading events into a channel and then having
	// different goroutines consuming the channel and performing the notifications.

	stream, err := events.NewEventsStream(ctx, "notifier")
	if err != nil {
		return err
	}
	// Create a single connection to the DB.
	store, err := store.NewStore()
	if err != nil {
		return err
	}

	// Infinite loop
	for {
		// Blocking call to get next event in stream
		event, err := stream.Get(ctx)
		if err != nil {
			// Unexpected error, terminating.
			return err
		}
		err = handleEvent(ctx, event, store)
		if err != nil {
			// Error handling event. Just print and ignore event.
			log.Printf("Error handling event: %v\n", err)
		}
		// Acknowledge event handled
		stream.Ack(ctx, event.Id)
	}
}

func handleEvent(ctx context.Context, event *events.Event, store *store.Store) error {

	switch event.Name {
	case events.TransferCommitted:
		return handleTransferEvent(ctx, event, store, Both)
	case events.TransferPending:
		return handleTransferEvent(ctx, event, store, Payer)
	case events.TransferRejected:
		return handleTransferEvent(ctx, event, store, Payee)
	case events.NeedPublished:
		return handleGroupEvent(ctx, event, store, NewNeeds)
	case events.OfferPublished:
		return handleGroupEvent(ctx, event, store, NewOffers)
	case events.MemberJoined:
		return handleGroupEvent(ctx, event, store, NewMembers)
	case events.NeedExpired:
		return handleMemberEvent(ctx, event, store)
	case events.OfferExpired:
		return handleMemberEvent(ctx, event, store)
	default:
		log.Printf("No notification for event type %v\n", event.Name)
		return nil
	}
}

func handleMemberEvent(ctx context.Context, event *events.Event, store *store.Store) error {
	members := []string{event.Data["member"]}
	// Note that OfferExpired and NeedExpired are usually sent by the system cron,
	// so the user is always the system user and in particular the affected user
	// is not ignored and gets notified.
	return notifyMembers(ctx, store, members, event, MyAccount)
}

func handleTransferEvent(ctx context.Context, event *events.Event, store *store.Store, dest TransferEventDestination) error {
	accounts := make([]string, 0, 2)
	if dest == Both || dest == Payer {
		accounts = append(accounts, event.Data["payer"])
	}
	if dest == Both || dest == Payee {
		accounts = append(accounts, event.Data["payee"])
	}

	// Get members from account ids
	members, err := api.GetAccountMembers(ctx, event.Code, accounts)
	if err != nil {
		return err
	}
	memberIds := make([]string, len(members))
	for i, member := range members {
		memberIds[i] = member.Id
	}

	// Notify members
	return notifyMembers(ctx, store, memberIds, event, MyAccount)
}

func handleGroupEvent(ctx context.Context, event *events.Event, store *store.Store, eventType string) error {

	// Get group members
	members, err := api.GetGroupMembers(ctx, event.Code)
	if err != nil {
		return err
	}

	memberIds := make([]string, len(members))
	for i, member := range members {
		memberIds[i] = member.Id
	}

	return notifyMembers(ctx, store, memberIds, event, eventType)
}

func notifyMembers(ctx context.Context, store *store.Store, memberIds []string, event *events.Event, eventType string) error {
	// The array of tokens to send the message to.
	tokens := []string{}
	// A map to reverse from tokens to subscriptions in order to easily handle responses.
	tokenMap := make(map[string]*Subscription)

	for _, member := range memberIds {
		subscriptions, err := getMemberSubscriptions(ctx, store, member, event.User)
		if err != nil {
			return err
		}
		for _, sub := range subscriptions {
			// Check if user wants to receive notifications of this type.
			if sub.Settings[eventType] == true {
				tokens = append(tokens, sub.Token)
				tokenMap[sub.Token] = &sub
			}
		}
	}

	if len(tokens) == 0 {
		return nil
	}

	// We send push messages with flat data.
	messageData := maps.Clone(event.Data)
	messageData["event"] = event.Name
	messageData["code"] = event.Code
	messageData["user"] = event.User

	// Break tokens in groups of 500 and send the message because of firebase limitations.
	for i := 0; i < len(tokens); i += 500 {
		end := i + 500
		if end > len(tokens) {
			end = len(tokens)
		}

		// Send notification
		message := &messaging.MulticastMessage{
			Tokens: tokens[i:end],
			Data:   messageData,
		}
		br, err := sendMessage(ctx, message)
		if err != nil {
			return err
		}
		// Handle responses
		log.Printf("Sent %d notifications with %d successes and %d failures.\n", (end - i), br.SuccessCount, br.FailureCount)
		handleResponses(ctx, store, br.Responses, tokens, tokenMap)
	}
	return nil
}

func handleResponses(ctx context.Context, store *store.Store, responses []*messaging.SendResponse, tokens []string, tokenMap map[string]*Subscription) {
	// Responses order is the same as tokens order, as per Firebase documentation.
	for i, r := range responses {
		token := tokens[i]
		sub := tokenMap[token]
		if r.Success {
			// Log success
			log.Printf("Notification sent to member %s.\n", sub.Member.Id)
		} else {
			// Log error
			log.Printf("Error sending notification to member %s: %v\n", sub.Member.Id, r.Error)
			if messaging.IsUnregistered(r.Error) {
				store.Delete(ctx, "subscriptions", sub.Id)
				log.Printf("Subscription deleted for member %s.\n", sub.Member.Id)
			}
		}
	}
}

// Return the subscriptions of given member, excluding the ones related to the given user id.
func getMemberSubscriptions(ctx context.Context, store *store.Store, memberId string, excludeUser string) ([]Subscription, error) {
	// Get subscriptions for this member.
	res, err := store.GetByIndex(ctx, "subscriptions", reflect.TypeOf((*Subscription)(nil)), "member", memberId)
	if err != nil {
		return nil, err
	}

	// Change types from []interface{} to []Subscription and remove subcriptions from the user that originated the event.
	subscriptions := []Subscription{}
	for _, sub := range res {
		// Convert to *Subscription and dereference.
		subscription := *(sub.(*Subscription))
		if subscription.User.Id != excludeUser {
			subscriptions = append(subscriptions, subscription)
		}
	}
	return subscriptions, nil
}

func sendMessage(ctx context.Context, message *messaging.MulticastMessage) (*messaging.BatchResponse, error) {
	// Credentials are implicitly loaded from a JSON file identifyed by the environment
	// variable GOOGLE_APPLICATION_CREDENTIALS.
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("error initializing firebase: %v", err)
	}
	client, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting firebase messaging client: %v", err)
	}

	// Send the message!
	return client.SendEachForMulticast(ctx, message)

}
