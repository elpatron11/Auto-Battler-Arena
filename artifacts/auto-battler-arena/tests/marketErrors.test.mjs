import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marketErrorText } from '../src/lib/marketErrors.ts';

test('HTML 500 responses never leak markup into the Market banner', () => {
  const message = marketErrorText({ message: 'HTTP 500 : <!DOCTYPE html><html><body>Internal Server Error</body></html>' });
  assert.doesNotMatch(message, /HTTP|<|script/);
  assert.match(message, /Check your Gold and inventory/);
  assert.doesNotMatch(message, /not charged|no Gold|refund/i);
});
test('structured and plain server errors have the same safe uncertain-outcome message', () => {
  assert.equal(marketErrorText({ status: 500, data: { error: 'database stack trace' } }),
    marketErrorText({ data: { message: '<html><body>Proxy failure</body></html>' } }));
});
test('expected trade validation errors remain actionable', () => {
  for (const message of ['Insufficient Gold.', 'Listing no longer exists.', 'You cannot buy your own listing.']) {
    assert.equal(marketErrorText({ status: 409, data: { error: message }, message: 'HTTP 409' }), message);
  }
});
test('unknown errors and malformed data fall back safely', () => {
  for (const error of [null, undefined, 'failure', {}, { message: 500, data: { error: {} } }]) {
    assert.equal(marketErrorText(error), 'The trade could not be completed. Try again.');
  }
});