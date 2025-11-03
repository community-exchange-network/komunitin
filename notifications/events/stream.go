package events

import (
	"context"
	"encoding/json"
	"time"

	"github.com/komunitin/komunitin/notifications/store"
)

// Event object as stored in the stream.
type Event struct {
	// The id assigned by the stream.
	Id string
	// The event type name, e.g. "TransferCommitted"
	Name string
	// The source URL of the event.
	Source string
	// The group code.
	Code string
	// The time the event was created.
	Time time.Time
	// Arbitrary key-value data. Available values depend on the event type.
	// For TransferCommitted, TransferPending, TransferRejected: "payer", "payee", "transfer".
	// For MemberJoined, MemberRequested: "member".
	// For OfferPublished: "offer".
	// For OfferExpired: "offer", "member".
	// For NeedPublished: "need".
	// For NeedExpired: "need", "member".
	Data map[string]string
	// The uuid of the user that triggered the event.
	User string
}

// Event names
const (
	TransferCommitted = "TransferCommitted"
	TransferPending   = "TransferPending"
	TransferRejected  = "TransferRejected"
	NeedPublished     = "NeedPublished"
	NeedExpired       = "NeedExpired"
	OfferPublished    = "OfferPublished"
	OfferExpired      = "OfferExpired"
	MemberJoined      = "MemberJoined"
	MemberRequested   = "MemberRequested"
	GroupRequested    = "GroupRequested"
	GroupActivated    = "GroupActivated"
)

// Abstracts the events stream.
type EventStream struct {
	stream *store.Stream
}

const (
	EventStreamName = "events"
)

// Create a new events stream.
func NewEventsStream(ctx context.Context, consumer string) (*EventStream, error) {
	stream, err := store.NewStream(ctx, EventStreamName, consumer)
	if err != nil {
		return nil, err
	}
	return &EventStream{stream: stream}, nil
}

// Get Event from stream. This function is blocking.
func (stream *EventStream) Get(ctx context.Context) (*Event, error) {
	id, value, err := stream.stream.Get(ctx)
	if err != nil {
		return nil, err
	}

	// parse time
	eventTime, err := time.Parse(time.RFC3339, value["time"].(string))
	if err != nil {
		return nil, err
	}

	// data is a json-encoded key-value map.
	data := make(map[string]string)
	err = json.Unmarshal([]byte(value["data"].(string)), &data)
	if err != nil {
		return nil, err
	}

	return &Event{
		Id:     id,
		Name:   value["name"].(string),
		Source: value["source"].(string),
		Code:   value["code"].(string),
		Time:   eventTime,
		Data:   data,
		User:   value["user"].(string),
	}, nil
}

// Acknowledge event.
func (stream *EventStream) Ack(ctx context.Context, id string) error {
	return stream.stream.Ack(ctx, id)
}

// Add event to stream.
func (stream *EventStream) Add(ctx context.Context, event *Event) (string, error) {
	// Converts time to string using RFC3339 format.
	time, err := event.Time.MarshalText()
	if err != nil {
		return "", err
	}

	data, err := json.Marshal(event.Data)
	if err != nil {
		return "", err
	}

	value := map[string]interface{}{
		"name":   event.Name,
		"source": event.Source,
		"user":   event.User,
		"time":   time,
		"code":   event.Code,
		"data":   data,
	}

	return stream.stream.Add(ctx, value)
}
