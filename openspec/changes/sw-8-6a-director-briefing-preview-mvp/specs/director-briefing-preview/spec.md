# Director Briefing Preview Specification

## Purpose

Provide a bounded Director briefing/prompt preview inside the existing mission composer, derived only from durable `mission_control` context plus the current participant selection.

## Requirements

### Requirement: Preview is deterministically derived from durable mission context and selection

The system MUST derive the briefing preview only from the normalized durable `mission_control` snapshot and the currently selected participant id set. For the same snapshot and same selection, the preview MUST remain identical across renders. The preview MAY reorganize existing mission facts for readability, but it MUST NOT inject non-durable queue, approval, live evidence, Browser/GTK, or future-slice behavior.

#### Scenario: Same mission context and selection produce the same preview

- GIVEN the Control Room has the same normalized `mission_control` snapshot and the same selected participant ids
- WHEN the composer preview renders again or re-renders
- THEN the preview text remains identical
- AND it reflects only the durable mission context and selected participants

#### Scenario: Selection change updates the derived preview

- GIVEN the durable `mission_control` snapshot is unchanged and multiple eligible participants exist
- WHEN Director changes the selected participant set
- THEN the preview updates to match the new selection
- AND no additional source of truth is introduced

### Requirement: Preview degrades safely for empty, missing, and ineligible states

The system MUST provide a safe bounded state when preview inputs are incomplete. If there is no durable `mission_control`, no selected participant, or the selected participant is not eligible for this preview, the composer MUST show a non-failing empty or unavailable preview state. The system MUST NOT fabricate mission context or fallback prompt truth to fill those states.

#### Scenario: Missing mission snapshot shows safe empty preview

- GIVEN the Control Room has no `mission_control` snapshot
- WHEN Director opens the composer seam
- THEN the preview shows an empty or unavailable state
- AND the room does not fail rendering

#### Scenario: No participant selected shows safe empty preview

- GIVEN durable `mission_control` exists and no participant is selected
- WHEN Director views the composer preview
- THEN the preview shows a bounded empty state
- AND no synthetic participant-specific briefing is generated

#### Scenario: Ineligible participant does not produce a synthetic briefing

- GIVEN durable `mission_control` exists and the current selection is ineligible for briefing preview
- WHEN Director views the composer preview
- THEN the preview shows an unavailable state for that selection
- AND mission or participant data is not mutated to make the selection appear eligible

### Requirement: Message submit contract remains unchanged

The system MUST keep the existing submit flow and persistence contract unchanged. Sending from the composer MUST continue using the current handler and payload contract for `{ recipient_agent_ids, body_summary }`. The preview SHALL remain advisory only and MUST NOT alter the request shape, POST target, persistence semantics, or durable message contents unless the same user-entered summary already would have done so.

#### Scenario: Sending with preview uses the existing contract

- GIVEN Director sees a derived preview and enters a body summary
- WHEN Director submits the message
- THEN the existing submit handler receives the same contract as before
- AND preview-only data is not sent as a new field or persisted as a second truth

### Requirement: Preview remains read-only derived state within the existing composer seam

The system MUST keep this slice as read-only derived UI state inside the existing composer seam. It MUST NOT create a new composer system, schema, queue authority, approvals flow, live evidence flow, SW-8.7A or SW-8.8A behavior, or Browser/GTK-specific behavior.

#### Scenario: Preview stays bounded to existing composer seam

- GIVEN Director uses the preview-enabled composer
- WHEN the preview is rendered, refreshed, or dismissed
- THEN only derived preview state inside the existing composer seam changes
- AND no new durable truth or out-of-scope control surface is introduced
