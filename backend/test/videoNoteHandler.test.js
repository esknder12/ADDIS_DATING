import assert from 'node:assert/strict';
import { matchFilter } from 'grammy';
import { describe, it } from 'node:test';
import { registerVideoNoteHandler } from '../src/bot/handlers/verificationHandler.js';
import {
  VERIFICATION_DUPLICATE_MESSAGE,
  VERIFICATION_INSTRUCTIONS,
  VERIFICATION_PINNED_MESSAGE,
  VERIFICATION_RECEIVED_CONFIRMATION,
  rejectionMessage,
} from '../src/bot/messages/verificationMessages.js';
import { sendVerificationInstructions } from '../src/bot/handlers/verificationHandler.js';

/**
 * A minimal stand-in for the parts of a grammY Bot this code touches. Handlers are registered by
 * filter so the test can assert the exact filter string — the spec's `bot.on('video_note')`
 * throws at registration in grammY 1.46.
 */
function createFakeBot() {
  const handlers = new Map();
  return {
    handlers,
    on(filter, handler) {
      handlers.set(filter, handler);
    },
    handler(filter) {
      const handler = handlers.get(filter);
      if (!handler) throw new Error(`No handler registered for '${filter}'`);
      return handler;
    },
  };
}

function createVideoNoteContext({ telegramId = 555, chatId = telegramId, fileId = 'DQACAgUAAx', messageId = 77, duration = 6 } = {}) {
  const message = {
    message_id: messageId,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: telegramId },
    video_note: {
      file_id: fileId,
      file_unique_id: 'unique',
      length: 240,
      duration,
      thumbnail: { file_id: 't', file_unique_id: 'tu', width: 1, height: 1, file_size: 1 },
    },
  };
  return { message, msg: message, update: { update_id: 1, message }, from: message.from, chat: message.chat };
}

function createFakeRepository(outcome) {
  const calls = [];
  return {
    calls,
    async recordSubmission(telegramId, payload) {
      calls.push([telegramId, payload]);
      return typeof outcome === 'function' ? outcome(telegramId, payload) : outcome;
    },
  };
}

function createFakeNotifier() {
  const sent = [];
  return {
    sent,
    isAvailable: true,
    async sendMessage(chatId, text) {
      sent.push({ chatId, text });
      return { message_id: 1 };
    },
  };
}

describe('video note capture', () => {
  it("registers the filter grammY actually accepts, not 'video_note'", () => {
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: createFakeRepository(), notifier: createFakeNotifier() });

    assert.ok(bot.handlers.has('message:video_note'));
    assert.doesNotThrow(() => matchFilter('message:video_note'));
    // Guards the exact regression from the Phase 4 specification.
    assert.throws(() => matchFilter('video_note'), /Invalid L1 filter 'video_note'/);
  });

  it('reads the video note and message id from ctx.msg, not from the context root', async () => {
    const repository = createFakeRepository({ status: 'recorded' });
    const notifier = createFakeNotifier();
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier });

    await bot.handler('message:video_note')(createVideoNoteContext({ telegramId: 900, messageId: 88, duration: 9 }));

    assert.deepEqual(repository.calls, [
      [900, { fileId: 'DQACAgUAAx', messageId: 88, durationSeconds: 9 }],
    ]);
    assert.equal(notifier.sent[0].chatId, 900);
    assert.equal(notifier.sent[0].text, VERIFICATION_RECEIVED_CONFIRMATION);
  });

  it('ignores senders who never authenticated through the Mini App', async () => {
    const repository = createFakeRepository({ status: 'not-found' });
    const notifier = createFakeNotifier();
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier });

    await bot.handler('message:video_note')(createVideoNoteContext());
    assert.equal(notifier.sent.length, 0, 'an unknown sender must not be messaged');
  });

  it('ignores a video from an already verified user', async () => {
    const repository = createFakeRepository({ status: 'already-verified' });
    const notifier = createFakeNotifier();
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier });

    await bot.handler('message:video_note')(createVideoNoteContext());
    assert.equal(notifier.sent.length, 0);
  });

  it('answers a duplicate send with the duplicate copy, not a second confirmation', async () => {
    const repository = createFakeRepository({ status: 'duplicate' });
    const notifier = createFakeNotifier();
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier });

    await bot.handler('message:video_note')(createVideoNoteContext());
    assert.equal(notifier.sent.length, 1);
    assert.equal(notifier.sent[0].text, VERIFICATION_DUPLICATE_MESSAGE);
  });

  it('does nothing when the message carries no video note file id', async () => {
    const repository = createFakeRepository({ status: 'recorded' });
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier: createFakeNotifier() });

    const context = createVideoNoteContext();
    delete context.msg.video_note;
    await bot.handler('message:video_note')(context);
    assert.equal(repository.calls.length, 0);
  });

  it('survives a repository failure without throwing into the bot loop', async () => {
    const repository = {
      async recordSubmission() {
        throw new Error('database down');
      },
    };
    const notifier = createFakeNotifier();
    const bot = createFakeBot();
    registerVideoNoteHandler(bot, { verificationRepository: repository, notifier });

    await bot.handler('message:video_note')(createVideoNoteContext());
    assert.equal(notifier.sent.length, 0);
  });
});

describe('instruction sequence', () => {
  const base = {
    chatId: 4242,
    telegramId: 4242,
    exampleVideoFileId: 'AgACExample',
    webappUrl: 'https://mini.example.com',
  };

  function createFullNotifier({ failOn = null } = {}) {
    const sent = [];
    return {
      sent,
      isAvailable: true,
      async sendMessage(chatId, text, other) {
        sent.push({ method: 'sendMessage', chatId, text, other });
        if (failOn === 'sendMessage') throw new Error('telegram down');
        return { message_id: 101 };
      },
      async pinChatMessage(chatId, messageId) {
        sent.push({ method: 'pinChatMessage', chatId, messageId });
        if (failOn === 'pin') throw new Error('cannot pin');
        return true;
      },
      async sendVideoNote(chatId, fileId) {
        sent.push({ method: 'sendVideoNote', chatId, fileId });
        if (failOn === 'videoNote') throw new Error('bad file_id');
        return { message_id: 102 };
      },
    };
  }

  it('reports unavailable rather than dereferencing a null bot', async () => {
    const outcome = await sendVerificationInstructions({ isAvailable: false }, base);
    assert.deepEqual(outcome, { sent: false, code: 'BOT_UNAVAILABLE' });
  });

  it('pins the message it just sent', async () => {
    const notifier = createFullNotifier();
    const outcome = await sendVerificationInstructions(notifier, base);

    assert.equal(outcome.sent, true);
    assert.deepEqual(outcome.failures, []);
    assert.equal(notifier.sent[0].text, VERIFICATION_PINNED_MESSAGE);
    assert.equal(notifier.sent[1].method, 'pinChatMessage');
    assert.equal(notifier.sent[1].messageId, 101);
    assert.equal(notifier.sent.at(-1).text, VERIFICATION_INSTRUCTIONS);
  });

  it('records a pin failure but still delivers the instructions', async () => {
    const notifier = createFullNotifier({ failOn: 'pin' });
    const outcome = await sendVerificationInstructions(notifier, base);

    assert.equal(outcome.sent, true);
    assert.equal(outcome.failures.length, 1);
    assert.match(outcome.failures[0], /^pin: /);
    assert.equal(notifier.sent.at(-1).text, VERIFICATION_INSTRUCTIONS);
  });

  it('records a bad example video file_id but still delivers the instructions', async () => {
    const notifier = createFullNotifier({ failOn: 'videoNote' });
    const outcome = await sendVerificationInstructions(notifier, base);

    assert.equal(outcome.sent, true);
    assert.match(outcome.failures[0], /^example video: /);
    assert.equal(notifier.sent.at(-1).text, VERIFICATION_INSTRUCTIONS);
  });

  it('skips the example video entirely when no file_id is configured', async () => {
    const notifier = createFullNotifier();
    await sendVerificationInstructions(notifier, { ...base, exampleVideoFileId: '' });
    assert.deepEqual(notifier.sent.map((entry) => entry.method), [
      'sendMessage',
      'pinChatMessage',
      'sendMessage',
    ]);
  });

  it('reports failure when the first message cannot be sent at all', async () => {
    const notifier = createFullNotifier({ failOn: 'sendMessage' });
    const outcome = await sendVerificationInstructions(notifier, base);
    assert.equal(outcome.sent, false);
    assert.equal(outcome.code, 'SEND_FAILED');
  });
});

describe('rejection copy', () => {
  it('renders a catalogue reason as a sentence, never a bare key or undefined', () => {
    const message = rejectionMessage('face_not_visible');
    assert.ok(message.includes('your face is not clearly visible'));
    assert.ok(!message.includes('{reason}'));
    assert.ok(!message.includes('undefined'));
  });

  it('falls back gracefully for an unknown reason key', () => {
    assert.ok(rejectionMessage('nonsense').includes('could not confirm your identity'));
  });
});
