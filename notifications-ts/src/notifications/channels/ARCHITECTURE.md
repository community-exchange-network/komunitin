# Notification Channels Architecture

## Overview

The notification system is designed with **decoupled channels** that share common message generation logic, enabling code reuse while maintaining clean separation of concerns.

## Architecture

### 1. Shared Message Generators (`src/notifications/messages/`)

Centralized message builders that generate localized notification content:

- **`transfer.ts`**: Transfer-related messages (sent, received, pending, rejected, still pending)
- **`post.ts`**: Post-related messages (published, expired, expiring soon, digests)
- **`member.ts`**: Member-related messages (expired posts, new members)
- **`types.ts`**: Shared types (`MessageContext`, `NotificationMessage`)

Each builder function:
- Takes an enriched event and i18n context
- Returns a `NotificationMessage` with title, body, image, and route
- Can return `null` to skip notification (e.g., when conditions aren't met)
- Handles all localization and text formatting logic

### 2. Notification Channels

Each channel implements its own delivery mechanism but uses shared message generators:

#### In-App Channel (`src/notifications/channels/app/`)
- Stores notifications in database (`AppNotification` model)
- Uses `handleNotificationForUsers` utility
- Users fetch notifications via API

**Structure:**
- `utils.ts`: Database notification creation
- `transfer.ts`, `post.ts`, `member.ts`: Event handlers that call shared message builders

#### Push Channel (`src/notifications/channels/push/`)
- Sends Web Push notifications to subscribed devices
- Queries `PushSubscription` model for user devices
- Handles subscription cleanup (expired/invalid tokens)

**Structure:**
- `utils.ts`: Push notification sending (`sendPushToUsers`)
- `transfer.ts`, `post.ts`, `member.ts`: Event handlers that call shared message builders
- **Note**: Web Push implementation is stubbed (needs `web-push` library integration)

### 3. Event Flow

```
Event Bus
    ↓
Channel Handler (e.g., handleTransferCommitted)
    ↓
Shared Message Builder (e.g., buildTransferSentMessage)
    ↓ (returns NotificationMessage)
Channel Utility (handleNotificationForUsers or sendPushToUsers)
    ↓
Delivery (Database or Web Push)
```

