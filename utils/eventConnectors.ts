import type { SettingsState } from '../src/domains/settings/SettingsProvider';
import { loadPersistedSettings } from '../src/domains/settings/SettingsProvider';
import { ManufacturingEvent } from '../types';
import { getEnvVar } from './env';

export interface EventConnector {
  name: string;
  enabled: boolean;
  send: (event: ManufacturingEvent) => Promise<void>;
}

const noop = async () => {
  return Promise.resolve();
};

const resolveSettings = (): SettingsState | undefined => {
  try {
    return loadPersistedSettings();
  } catch (error) {
    console.error('[event-connectors] Failed to load settings, falling back to defaults', error);
    return undefined;
  }
};

const buildSlackConnector = (settings?: SettingsState): EventConnector => {
  const settingsWebhookUrl = settings?.slackWebhookUrl?.trim();
  const envWebhookUrl = getEnvVar('VITE_SLACK_WEBHOOK_URL')?.trim();
  const webhookUrl = settingsWebhookUrl || envWebhookUrl;
  const enabledFlag =
    typeof settings?.slackNotificationsEnabled === 'boolean'
      ? settings.slackNotificationsEnabled
      : Boolean(webhookUrl);

  if (!enabledFlag || !webhookUrl) {
    return {
      name: 'slack',
      enabled: false,
      send: noop,
    };
  }

  return {
    name: 'slack',
    enabled: true,
    send: async (event: ManufacturingEvent) => {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `*[${event.severity}] ${event.message}*\n상품: ${event.product.name} (품번 ${event.product.sku})\n발생 시각: ${event.occurredAt}\n유형: ${event.type}\n세부 정보: ${JSON.stringify(
            event.metrics ?? {},
          )}`,
        }),
      });
    },
  };
};

const buildWebhookConnector = (settings?: SettingsState): EventConnector => {
  const envWebhookUrl = getEnvVar('VITE_WEBHOOK_URL')?.trim();
  const webhookUrl = settings?.webhookUrl?.trim() || envWebhookUrl;
  const enabledFlag =
    typeof settings?.webhookNotificationsEnabled === 'boolean'
      ? settings.webhookNotificationsEnabled
      : Boolean(webhookUrl);

  if (!enabledFlag || !webhookUrl) {
    return {
      name: 'webhook',
      enabled: false,
      send: noop,
    };
  }

  return {
    name: 'webhook',
    enabled: true,
    send: async (event: ManufacturingEvent) => {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    },
  };
};

const buildFirebaseConnector = (): EventConnector => {
  const functionUrl = getEnvVar('VITE_FIREBASE_FUNCTION_URL');
  const apiKey = getEnvVar('VITE_FIREBASE_API_KEY');

  if (!functionUrl || !apiKey) {
    return {
      name: 'firebase',
      enabled: false,
      send: noop,
    };
  }

  return {
    name: 'firebase',
    enabled: true,
    send: async (event: ManufacturingEvent) => {
      await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ event }),
      });
    },
  };
};

const buildConsoleConnector = (): EventConnector => ({
  name: 'console',
  enabled: true,
  send: async (event: ManufacturingEvent) => {
    console.info('[event-bus]', event);
  },
});

export const getEventConnectors = (): EventConnector[] => {
  const settings = resolveSettings();
  return [
    buildSlackConnector(settings),
    buildWebhookConnector(settings),
    buildFirebaseConnector(),
    buildConsoleConnector(),
  ];
};

export const connectors: EventConnector[] = getEventConnectors();
