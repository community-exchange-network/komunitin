package store

// Implements a key-value store with indexing.
// This is an interface for the REDIS database.

import (
	"context"
	"encoding/json"
	"reflect"
	"time"

	"github.com/go-redis/redis/v8"
)

type Store struct {
	client redis.Client
}

// Create a new store.
func NewStore() (*Store, error) {
	store := &Store{
		// Store and Stream are using the same Redis instance. That's fine but incidental.
		// They could perfectly use different instances if needed for scalability.
		client: *redis.NewClient(&redis.Options{
			Addr:     "db-notifications:6379",
			Password: "", // no password set
			DB:       0,  // use default database
		}),
	}
	return store, nil
}
func (store *Store) Set(ctx context.Context, class string, id string, value interface{}, indexes map[string]string, expire time.Duration) error {
	// Set value and indexes in a single transaction.
	_, err := store.client.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		// Set value
		encoded, err := json.Marshal(value)
		if err != nil {
			return err
		}
		err = pipe.Set(ctx, key(class, id), string(encoded), expire).Err()
		if err != nil {
			return err
		}
		// Add indexes
		for index, indexId := range indexes {
			err = pipe.SAdd(ctx, indexKey(class, index, indexId), id).Err()
			if err != nil {
				return err
			}
		}

		return nil
	})
	return err
}

// Get the given object from the store.
func (store *Store) Get(ctx context.Context, class string, id string, v interface{}) error {
	encoded, err := store.client.Get(ctx, key(class, id)).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(encoded), v)
}

// Delete the given object from the store.
func (store *Store) Delete(ctx context.Context, class string, id string) error {
	return store.client.Del(ctx, key(class, id)).Err()
}

// Return the values of given store class that match the given index. Values are unmarshaled using the provided struct pointer type
// with json annotations.
// t = reflect.TypeOf((*Model)(nil))
func (store *Store) GetByIndex(ctx context.Context, class string, t reflect.Type, index string, id string) ([]interface{}, error) {
	// Get data keys using the index.
	ids, err := store.client.SMembers(ctx, indexKey(class, index, id)).Result()
	if err != nil {
		return nil, err
	}
	// Quick return if there's no data.
	if len(ids) == 0 {
		return []interface{}{}, nil
	}

	// Build keys from index values.
	for index, id := range ids {
		ids[index] = key(class, id)
	}

	// Get objects.
	encoded, err := store.client.MGet(ctx, ids...).Result()
	if err != nil {
		return nil, err
	}

	// Decode json objects.
	values := []interface{}{}
	for _, v := range encoded {
		if v != nil {
			// t = *Model.Type, t.Elem() = Model.Type, new is *Model, item is interface{}
			item := reflect.New(t.Elem()).Interface()
			err := json.Unmarshal([]byte(v.(string)), item)
			if err != nil {
				return nil, err
			}
			values = append(values, item)
		}
	}
	return values, nil
}

func key(class string, id string) string {
	return "object" + ":" + class + ":" + id
}
func indexKey(class string, index string, id string) string {
	return "index" + ":" + class + ":" + index + ":" + id
}
