# Chat Retry Logic Specification

## Purpose

Define server-side retry behavior with exponential backoff for LLM API calls in the AgentHub chat endpoint. This ensures resilience against transient failures (rate limits, overloads, network errors) without requiring user intervention.

## Requirements

### Requirement: Exponential Backoff Retry

The system MUST automatically retry failed LLM API calls (`openai.chat.completions.create()`) using exponential backoff before propagating the error to the client.

- Maximum retries: 3 attempts total (1 initial + 2 retries)
- Base delay: 1000ms (1 second)
- Backoff formula: `Math.min(1000 * 2^attempt, 30000)` where attempt is 0-indexed
- Jitter: ±200ms random variance added to each delay
- Maximum cap: 30 seconds

#### Scenario: Successful retry after transient 429

- GIVEN the LLM provider returns HTTP 429 on the initial `create()` call
- WHEN the retry wrapper executes
- THEN the system waits the calculated backoff delay and retries
- AND the request succeeds on a subsequent attempt without user intervention

#### Scenario: Successful retry after server error 500

- GIVEN the LLM provider returns HTTP 500 on the initial `create()` call
- WHEN the retry wrapper executes
- THEN the system retries with exponential backoff
- AND the request succeeds before exhausting all 3 attempts

#### Scenario: All retries exhausted

- GIVEN the LLM provider returns HTTP 503 on every attempt
- WHEN all 3 attempts have been exhausted
- THEN the system propagates the last error to the outer catch block
- AND the endpoint returns the error response as it currently does

#### Scenario: Delay respects 30-second cap

- GIVEN the backoff calculation would exceed 30000ms
- WHEN computing the delay for a retry attempt
- THEN the delay is capped at 30000ms plus jitter

### Requirement: Retryable Error Detection

The system MUST identify which errors are retryable based on HTTP status codes and error message patterns.

**Retryable HTTP status codes**: 429, 500, 503

**Retryable error message patterns** (case-insensitive substring match):

- "Overloaded"
- "rate_limit"
- "too_many_requests"
- "rate limited"

**Retryable network error patterns**:

- "ECONNRESET"
- "ECONNREFUSED"
- "ETIMEDOUT"
- "socket hang up"

An error is retryable if it matches ANY of the above criteria.

#### Scenario: Status code 429 is retryable

- GIVEN an error with `status` property equal to 429
- WHEN the retry wrapper evaluates the error
- THEN the error is classified as retryable

#### Scenario: Status code 401 is NOT retryable

- GIVEN an error with `status` property equal to 401
- WHEN the retry wrapper evaluates the error
- THEN the error is classified as non-retryable
- AND the error is propagated immediately without any retry attempt

#### Scenario: Error message containing "Overloaded" is retryable

- GIVEN an error whose `message` contains the substring "Overloaded"
- WHEN the retry wrapper evaluates the error
- THEN the error is classified as retryable

#### Scenario: Network error ECONNRESET is retryable

- GIVEN an error whose `message` or `code` contains "ECONNRESET"
- WHEN the retry wrapper evaluates the error
- THEN the error is classified as retryable

#### Scenario: Unknown error is NOT retryable

- GIVEN an error that matches none of the retryable patterns
- WHEN the retry wrapper evaluates the error
- THEN the error is propagated immediately without retry

### Requirement: Retry-After Header Respect

The system MUST respect the `Retry-After` header when present in a retryable error response, using it as the delay instead of the calculated exponential backoff.

The `Retry-After` value MAY be:

- A number of milliseconds
- A number of seconds
- An HTTP-date string

#### Scenario: Retry-After with seconds value

- GIVEN a 429 response with `Retry-After: 5`
- WHEN the retry wrapper processes the error
- THEN the system waits 5 seconds before retrying
- AND the exponential backoff calculation is overridden

#### Scenario: Retry-After with HTTP-date

- GIVEN a 429 response with `Retry-After: Sat, 04 Apr 2026 12:00:00 GMT`
- WHEN the retry wrapper processes the error
- THEN the system waits until the specified time before retrying

#### Scenario: No Retry-After header

- GIVEN a retryable error without a `Retry-After` header
- WHEN the retry wrapper processes the error
- THEN the system uses the exponential backoff calculation with jitter

### Requirement: Retry Scope Limitation

The retry logic MUST ONLY apply to the initial `openai.chat.completions.create()` call. Errors that occur DURING stream consumption (inside the `for await` loop) MUST NOT trigger retries.

#### Scenario: Error before stream starts is retried

- GIVEN `openai.chat.completions.create()` throws a retryable error
- WHEN the retry wrapper is invoked
- THEN the call is retried according to the backoff policy

#### Scenario: Error during streaming is NOT retried

- GIVEN the `create()` call succeeds and returns a stream
- WHEN an error occurs inside the `for await (const chunk of response)` loop
- THEN the error is handled by the existing stream-level try/catch
- AND no retry is attempted

### Requirement: Jitter Application

The system MUST add random jitter of ±200ms to every retry delay (both exponential backoff and Retry-After) to prevent thundering herd behavior when multiple clients hit rate limits simultaneously.

#### Scenario: Jitter is applied to exponential backoff

- GIVEN a calculated backoff delay of 2000ms
- WHEN the delay is applied
- THEN the actual wait is between 1800ms and 2200ms

#### Scenario: Jitter is applied to Retry-After

- GIVEN a Retry-After value of 3000ms
- WHEN the delay is applied
- THEN the actual wait is between 2800ms and 3200ms
