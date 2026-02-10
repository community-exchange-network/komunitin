# Notifications

The notifications service (`notifications-ts`) is a service written in TypeScript (Node.js) responsible for orchestrating and delivering messages to users across multiple channels (Web Push, Email, In-App) in response to system events.

It listens for events from other services (Accounting, Social), processes them, and dispatches notifications based on user preferences and system logic. It also generates "synthetic" events for reminders, expirations, and activity digests.

### Channels

#### Web Push
The service uses the **Standard Web Push** protocol to send notifications to browsers and PWAs, without relying on any third-party services. The flow is as follows:

- **Subscription**: The Client App subscribes using the browser's Push API and sends the subscription details (endpoint, keys) to the Notifications API.
- **Storage**: Subscriptions are stored in the PostgreSQL database.
- **Delivery**: When a push notification is triggered, it is queued to be processed asynchronously.
- **Telemetry**: The server listens for delivery receipts and user interactions (clicks, dismisses) to track engagement and delivery success, without relying on third-party analytics.

#### Email
Emails are sent for important events or digests and are sent through any configured SMTP service.

#### In-App
Notifications are also stored in the database for display within the application's notification center.

## Data Storage

- **PostgreSQL**: Stores persistent data such as User Subscriptions, In-App Notifications, and delivery logs. Access is managed via **Prisma ORM**.
- **Redis**: 
    - **Streams**: For ingesting events from other microservices.
    - **BullMQ**: For managing job queues (synthetic event scheduling, push delivery queues).
    - **Cache**: For caching API responses from other services.

