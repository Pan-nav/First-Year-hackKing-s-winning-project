// OWNER (O6): the Claude provider for deckGen.js, used when the player pastes an Anthropic key (sk-ant-...).
// Kept in its own module so the SDK is only downloaded when someone actually uses an Anthropic key.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

function explain(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it and try again.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'That API key is not allowed to use this model.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a few seconds and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the API. Check the Wi-Fi, or play a built-in deck.';
  if (err instanceof Anthropic.APIError) return `The API returned an error (${err.status ?? 'unknown'}). Try again.`;
  return err?.message || 'Something went wrong while generating the deck.';
}

/** @returns {Promise<object>} the raw deck JSON matching `schema` */
export async function generateWithClaude({ system, schema, userText, apiKey, client }) {
  // dangerouslyAllowBrowser: the key is the player's own and only ever goes from this page to the API.
  const anthropic = client ?? new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if a safety classifier declines, the API retries on a fallback model
      output_config: {
        effort: 'low', // a short extraction task: keep the wait short on stage
        format: { type: 'json_schema', schema },
      },
      system,
      messages: [{ role: 'user', content: userText }],
    });
  } catch (err) {
    throw new Error(explain(err), { cause: err });
  }
  if (response.stop_reason === 'refusal') throw new Error('The model declined this job description. Try another one.');
  if (response.stop_reason === 'max_tokens') throw new Error('The deck came back cut off. Try a shorter job description.');
  try {
    return JSON.parse(response.content.find((b) => b.type === 'text')?.text);
  } catch {
    throw new Error('The deck came back in an unexpected format. Try again.');
  }
}
