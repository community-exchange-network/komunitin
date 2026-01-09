import { internalError } from '../utils/error';

type BaseEvent = {name: string; id: string};
type AsyncListener<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void>;

// Async Event Bus
class NotificationEventBus {
  private static instance: NotificationEventBus;
  
  private listeners: Map<string, Function[]> = new Map();

  private constructor() {}

  static getInstance(): NotificationEventBus {
    if (!NotificationEventBus.instance) {
      NotificationEventBus.instance = new NotificationEventBus();
    }
    return NotificationEventBus.instance;
  }

  on<T extends BaseEvent>(eventName: string, listener: AsyncListener<T>): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)!.push(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventName);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  async emit(event: BaseEvent): Promise<void> {
    const listeners = this.listeners.get(event.name)
    
    if (!listeners || listeners.length === 0) {
      return;
    }

    const promises: Promise<void>[] = [];
    for (const listener of listeners) {
      promises.push(listener(event));
    }

    // Wait for all channels to finish processing
    const results = await Promise.allSettled(promises);

    // Handle errors
    const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason);
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw internalError('Multiple errors occurred in event bus listeners', { details: errors } );
    }
  }
}

export const eventBus = NotificationEventBus.getInstance();
