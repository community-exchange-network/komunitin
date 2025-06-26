FROM golang:1.24 AS notifications-build

RUN mkdir /opt/notifications
WORKDIR /opt/notifications

# Download dependencies first so they're cached
COPY go.mod .
COPY go.sum .
RUN go mod download

# Build project
COPY . .
RUN go build -o main .

# Start golang debugger
FROM notifications-build AS notifications-dev

# Install file watcher
RUN apt-get update && apt-get install -y inotify-tools psmisc

# Install dlv debugger
RUN go install github.com/go-delve/delve/cmd/dlv@latest

ENV GOOGLE_APPLICATION_CREDENTIALS=/opt/notifications/komunitin-project-firebase-adminsdk.json

EXPOSE 40000
EXPOSE 2028

# Run watch & debug script.
CMD ./watch.sh

# Build minimal production image
FROM notifications-build AS notifications

RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates

ENV GOOGLE_APPLICATION_CREDENTIALS=/opt/notifications/komunitin-project-firebase-adminsdk.json

WORKDIR /opt/notifications

EXPOSE 2028

CMD ["/opt/notifications/main"]
