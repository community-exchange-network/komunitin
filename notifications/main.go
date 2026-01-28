package main

import (
	"context"
	"log"
	"net/http"

	"github.com/gorilla/handlers"
	"github.com/komunitin/komunitin/notifications/events"
	"github.com/komunitin/komunitin/notifications/mails"
)

func main() {
	log.Println("Starting notifications app...")

	events.InitService()
	// Subscriptions service is now implemented in the notifications-ts folder.
	//notifications.InitService()

	log.Println("Starting mailer service...")
	go mails.Mailer(context.Background())

	// Notifications worker is now implemented in the notifications-ts folder.
	//log.Println("Starting notifier service...")
	//go notifications.Notifier(context.Background())

	// Setup CORS middleware.
	allowedOrigins := handlers.AllowedOrigins([]string{
		"http://localhost:8080",
		"http://localhost:2030",
		"https://localhost:2030",
		"http://localhost:2031",
		"https://localhost:2031",
		"https://integralces.net",
		"https://www.integralces.net",
		"https://demo.integralces.net",
		"https://demo.komunitin.org",
		"https://test.komunitin.org",
		"https://preview.komunitin.org",
		"https://komunitin.org",
	})

	allowedHeaders := handlers.AllowedHeaders([]string{"Authorization", "Content-Type"})
	allowedMethods := handlers.AllowedMethods([]string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"})
	allowedCredentials := handlers.AllowCredentials()
	corsHandler := handlers.CORS(allowedOrigins, allowedHeaders, allowedMethods, allowedCredentials)(http.DefaultServeMux)

	// Setup LOG middleware.
	logHandler := handlers.CombinedLoggingHandler(log.Writer(), corsHandler)

	log.Println("Starting web service...")
	go http.ListenAndServe(":2028", logHandler)

	log.Println("Press CTRL + C to exit")

	// Block main thread forever using a blocking read operation
	// on a channel that gets never filled.
	forever := make(chan bool)
	<-forever
}
