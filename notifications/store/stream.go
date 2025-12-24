package store

// Implements a queue or stream of objects using the readis STREAM data type.

import (
	"context"
	"fmt"
	"strings"

	"github.com/go-redis/redis/v8"
	"github.com/rs/xid"
)

type Stream struct {
	client     *redis.Client
	name       string
	groupId    string
	consumerId string
}

// Create a new stream. Note that the name of the stream is what actually identifies the stream,
// so if you create two streams with the same name, they will be the same stream.
func NewStream(ctx context.Context, name string, consumer string) (*Stream, error) {
	// Create Stream data and Redis client.
	stream := &Stream{
		name: name,
		client: redis.NewClient(&redis.Options{
			Addr:     "db-notifications:6379",
			Password: "", // no password set
			DB:       0,  // use default database
		}),
		consumerId: xid.New().String(),
		groupId:    consumer,
	}
	// Create read group if not exists.
	err := stream.client.XGroupCreateMkStream(ctx, stream.name, stream.groupId, "$").Err()
	if err != nil && strings.Contains(err.Error(), "BUSYGROUP") {
		// Ignore "Consumer Group name already exists" error.
		err = nil
	}
	return stream, err
}

// Add an item to the stream.
func (stream *Stream) Add(ctx context.Context, value map[string]interface{}) (string, error) {
	return stream.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream.name,
		Values: value,
	}).Result()
}

// Get the next item of a stream. This function blocks until there's new data in the stream.
// Returns (message id, value map, error).
func (stream *Stream) Get(ctx context.Context) (string, map[string]interface{}, error) {
	entries, err := stream.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    stream.groupId,
		Consumer: stream.consumerId,
		Streams:  []string{stream.name, ">"},
		Count:    1,
		Block:    0, // Block until new
		NoAck:    false,
	}).Result()
	if err != nil {
		return "", nil, err
	}
	if len(entries) != 1 {
		return "", nil, fmt.Errorf("expected 1 entry in stream read operation, got %d", len(entries))
	}
	if len(entries[0].Messages) != 1 {
		return "", nil, fmt.Errorf("expected 1 message in stream read operation, got %d", len(entries[0].Messages))
	}
	message := entries[0].Messages[0]
	return message.ID, message.Values, nil
}

// Acknowledge that a stream item has been processed.
func (stream *Stream) Ack(ctx context.Context, messageId string) error {
	return stream.client.XAck(ctx, stream.name, stream.groupId, messageId).Err()
}
