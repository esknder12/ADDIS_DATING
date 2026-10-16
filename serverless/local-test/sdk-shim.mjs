// Stand-in for `sdk`: recording Bot API, dead-end fetch (bridge is off in the
// smoke test), and the two error classes. Every `api.*` call is logged to
// `apiCalls` so smoke.mjs can assert on bot behavior.

import { db } from './sdk-db-shim.mjs';

export { db };

export const apiCalls = [];
export const fetchCalls = [];
let messageSeq = 1000;

export const api = new Proxy({}, {
  get(_target, method) {
    return async (params = {}) => {
      apiCalls.push({ method, params });
      if (method === 'getMe') return { id: 1, username: 'smoke_bot' };
      if (
        method === 'answerCallbackQuery'
        || method === 'pinChatMessage'
        || method === 'deleteMessage'
        || method === 'setChatMenuButton'
        || method === 'editMessageText'
      ) {
        return true;
      }
      return { message_id: messageSeq++, chat: { id: params.chat_id ?? 0 } };
    };
  },
});

export class BotApiError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.name = 'BotApiError';
    this.code = info.code;
    this.description = info.description || message;
    this.method = info.method;
    this.parameters = info.parameters;
  }
}

export class EndpointError extends Error {
  constructor(description, parameters = {}) {
    super(description);
    this.name = 'EndpointError';
    this.description = description;
    this.parameters = parameters;
  }
}

export async function fetch(url, options = {}) {
  fetchCalls.push({ url, options });
  return {
    ok: false,
    status: 0,
    statusText: 'smoke-shim: bridge disabled',
    url,
    headers: {
      get: () => null, has: () => false, keys: () => [], entries: () => [],
    },
    bodyUsed: false,
    json: async () => null,
    text: async () => '',
  };
}

export class InputFile {
  constructor(bytes, filename, options = {}) {
    this.bytes = bytes;
    this.filename = filename;
    this.type = options.type;
  }
}

export class FormData {
  constructor() {
    this.fields = [];
  }

  append(name, value) {
    this.fields.push([name, value]);
  }
}

export function __resetApi() {
  apiCalls.length = 0;
  fetchCalls.length = 0;
  messageSeq = 1000;
}
