import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Proof that the bearer is the person who was just sent to a payment provider
 * for a particular payment.
 *
 * A customer coming back from the gateway very often has no usable session.
 * Guests check out without ever setting a password, a payment finished on a
 * phone lands in a browser that never held the cookie, and a provider that
 * returns by cross-site POST drops a SameSite=Lax cookie altogether. Answering
 * "did my money go through?" with a sign-in form is the worst response
 * available, so the return URL carries its own proof.
 *
 * Booking references are drawn from a sequence and are therefore guessable, so
 * they cannot authorise anything by themselves. This token can: it is derived
 * from the payment reference, which already carries four bytes of entropy, and
 * keyed with AUTH_SECRET, so it cannot be produced without the server's secret.
 *
 * Deriving rather than storing keeps it to a schema change of nothing at all,
 * needs no lookup to verify, and stays short enough that a return URL survives
 * PayFast's 255-character limit.
 *
 * What it unlocks is deliberately narrow: the outcome of the payment, and the
 * ability to try again. The booking's contact details, its venues and its
 * cancellation controls continue to require signing in, because a URL in a
 * shared browser's history should not surrender someone's personal details.
 */

/** Query parameter the proof travels in. */
export const OUTCOME_TOKEN_PARAM = "t";

/** 22 base64url characters, i.e. 132 bits of the HMAC. */
const TOKEN_LENGTH = 22;

/** The proof for a single payment. Stable, so a retry rebuilds the same URL. */
export function paymentOutcomeToken(paymentReference: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`payment-outcome:${paymentReference}`)
    .digest("base64url")
    .slice(0, TOKEN_LENGTH);
}

/**
 * Whether a presented token proves ownership of one of these payments.
 *
 * The caller passes the references it has already loaded, so verification
 * costs no query. Comparison is constant-time: the tokens are equal-length by
 * construction, and a length check alone leaks nothing.
 */
export function tokenMatchesAnyPayment(
  presented: string | undefined,
  paymentReferences: string[],
): boolean {
  if (!presented || presented.length !== TOKEN_LENGTH) return false;

  const candidate = Buffer.from(presented);
  let matched = false;
  for (const reference of paymentReferences) {
    const expected = Buffer.from(paymentOutcomeToken(reference));
    // Every reference is checked rather than breaking early, so the time taken
    // does not reveal which payment matched.
    if (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    ) {
      matched = true;
    }
  }
  return matched;
}
