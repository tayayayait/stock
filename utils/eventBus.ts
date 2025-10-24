import { ManufacturingEvent } from '../types';
import { getEventConnectors } from './eventConnectors';

const queue: ManufacturingEvent[] = [];
let processing = false;

const getEnabledConnectors = () =>
  getEventConnectors().filter((connector) => connector.enabled);

const processQueue = async () => {
  if (processing) {
    return;
  }

  processing = true;

  while (queue.length > 0) {
    const event = queue.shift();
    if (!event) {
      continue;
    }

    const enabledConnectors = getEnabledConnectors();

    await Promise.all(
      enabledConnectors.map(async (connector) => {
        try {
          await connector.send(event);
        } catch (error) {
          console.error(`[event-bus:${connector.name}] Failed to send event`, error);
        }
      }),
    );
  }

  processing = false;
};

export const enqueueEvent = (event: ManufacturingEvent) => {
  queue.push(event);
  void processQueue();
};

export const enqueueEvents = (events: ManufacturingEvent[]) => {
  events.forEach((event) => queue.push(event));
  void processQueue();
};
