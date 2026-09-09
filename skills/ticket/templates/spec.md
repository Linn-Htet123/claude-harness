---
type: Spec
title: {{ID}} spec
status: draft
resource: {{LINEAR_URL}}
---
# Spec — {{ID}} {{TITLE}}

## Purpose
{{One sentence: what is true when this is done.}}

## Out of scope
- {{the most useful list in this file}}

## User stories
1. As a {{who}}, I want {{what}}, so that {{why}}.

## ADDED Requirements

### Requirement: {{short name}}
The system SHALL {{behaviour in one sentence}}.

#### Scenario: S1 happy — {{name}}
- **GIVEN** {{starting state}}
- **WHEN** {{action}}
- **THEN** {{result the user can see}}

#### Scenario: S2 edge — {{bad input / offline / double click / expired session}}
- **GIVEN** {{state}}
- **WHEN** {{action}}
- **THEN** {{what the user sees when it fails safely}}

## How we prove it
- Every scenario id (S1, S2, ...) appears in a test title.
- Edge scenarios assert the failure behaviour (error text, disabled button, no navigation, 4xx).
