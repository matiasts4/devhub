# Combined Favorites Selector Specification

## Purpose

Define the behavior for combining favorite models from ALL configured LLM providers into a single deduplicated list for the model selector dropdown in AgentHub. This ensures users can quickly access their preferred models regardless of which provider they belong to.

## Requirements

### Requirement: Combine Favorites Across Providers

The system MUST aggregate favorite models from all providers in the `favoriteModels` configuration object into a single flat list, rather than showing only favorites for the currently active provider.

#### Scenario: Multiple providers with favorites

- GIVEN the config contains `favoriteModels` with entries for `openrouter` and `copilot`
- WHEN AgentHub loads the LLM configuration
- THEN the favorites list contains models from BOTH providers

#### Scenario: Single provider with favorites

- GIVEN the config contains `favoriteModels` with entries for only one provider
- WHEN AgentHub loads the LLM configuration
- THEN the favorites list contains only that provider's models

#### Scenario: No favorites configured

- GIVEN `favoriteModels` is empty or undefined in the config
- WHEN AgentHub loads the LLM configuration
- THEN the favorites list is empty
- AND no error is thrown

### Requirement: Deduplicate Combined Favorites

The system MUST remove duplicate entries from the combined favorites list using the model name as the deduplication key. A model appearing as a favorite in multiple providers MUST appear only once in the dropdown.

#### Scenario: Same model favorited in multiple providers

- GIVEN `openrouter` favorites include `["gpt-4o"]` and `copilot` favorites include `["gpt-4o", "claude-sonnet-4-20250514"]`
- WHEN favorites are combined
- THEN `gpt-4o` appears exactly once in the result
- AND `claude-sonnet-4-20250514` appears once

#### Scenario: All models are unique

- GIVEN each provider has completely different favorite models
- WHEN favorites are combined
- THEN all models appear in the result with no removals

### Requirement: Preserve Favorite Model Order

The system SHOULD preserve the order of favorites as they appear when iterating through providers, with each provider's favorites maintaining their original relative order.

#### Scenario: Order preservation across providers

- GIVEN `openrouter` favorites are `["a", "b"]` and `copilot` favorites are `["c", "d"]`
- WHEN favorites are combined
- THEN the result order is `["a", "b", "c", "d"]` (provider order respected)

### Requirement: Pass Combined List to ChatInput

The system MUST pass the combined, deduplicated favorites array to the `ChatInput` component via the `favoriteModels` prop, which expects an array of strings.

#### Scenario: ChatInput receives combined array

- GIVEN the combined favorites list is `["gpt-4o", "claude-sonnet", "llama-3.3-70b"]`
- WHEN the ChatInput component renders
- THEN it receives `favoriteModels={["gpt-4o", "claude-sonnet", "llama-3.3-70b"]}`

#### Scenario: Empty favorites passed to ChatInput

- GIVEN no favorites are configured for any provider
- WHEN the ChatInput component renders
- THEN it receives `favoriteModels={[]}` or `favoriteModels={undefined}`
