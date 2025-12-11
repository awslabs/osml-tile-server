# Requirements Document

## Introduction

This feature adds CDK NAG compliance scanning to the OSML Tile Server CDK infrastructure project. CDK NAG is a tool that validates AWS CDK applications against AWS security best practices using the AwsSolutionsChecks rule pack. The goal is to integrate CDK NAG into the existing test framework, run compliance reports, and address each finding either by remediating the CDK code or by suppressing findings with documented justifications.

## Glossary

- **CDK NAG**: A CDK Aspects-based tool that validates CDK applications against AWS security best practices
- **AwsSolutionsChecks**: A rule pack in CDK NAG that checks against AWS Solutions best practices
- **NAG Suppression**: A documented exception to a CDK NAG rule with a justification for why the rule does not apply
- **Compliance Report**: A generated report showing all CDK NAG findings (errors, warnings, and suppressions)
- **Jest Global Teardown**: A Jest hook that runs after all tests complete, used to generate the final suppressions report

## Requirements

### Requirement 1

**User Story:** As a developer, I want CDK NAG integrated into the Jest test framework, so that compliance checks run automatically with unit tests.

#### Acceptance Criteria

1. WHEN Jest tests execute THEN the CDK NAG System SHALL apply AwsSolutionsChecks aspects to all CDK stacks under test
2. WHEN CDK NAG checks complete THEN the CDK NAG System SHALL report zero unsuppressed errors for each stack
3. WHEN CDK NAG checks complete THEN the CDK NAG System SHALL report zero unsuppressed warnings for each stack
4. WHEN all tests complete THEN the CDK NAG System SHALL generate a consolidated suppressions report file

### Requirement 2

**User Story:** As a developer, I want Jest configured with global teardown, so that the final suppressions report is generated after all tests complete.

#### Acceptance Criteria

1. WHEN Jest configuration is updated THEN the Jest Config SHALL specify test-utils.ts as the globalTeardown module
2. WHEN Jest global teardown executes THEN the CDK NAG System SHALL call generateFinalSuppressedViolationsReport function
3. WHEN the suppressions report is generated THEN the CDK NAG System SHALL write the report to cdk-nag-suppressions-report.txt

### Requirement 3

**User Story:** As a developer, I want CDK NAG compliance tests added to each construct test file, so that all infrastructure components are validated.

#### Acceptance Criteria

1. WHEN a construct test file exists THEN the Test File SHALL include a cdk-nag compliance test block
2. WHEN the compliance test block executes THEN the Test SHALL apply AwsSolutionsChecks with verbose logging enabled
3. WHEN the compliance test block executes THEN the Test SHALL call generateNagReport to output findings
4. WHEN the compliance test block executes THEN the Test SHALL assert zero unsuppressed warnings
5. WHEN the compliance test block executes THEN the Test SHALL assert zero unsuppressed errors

### Requirement 4

**User Story:** As a developer, I want all CDK NAG findings addressed, so that the infrastructure meets AWS security best practices.

#### Acceptance Criteria

1. WHEN a CDK NAG finding can be remediated THEN the Developer SHALL modify the CDK code to resolve the finding
2. WHEN a CDK NAG finding cannot be remediated THEN the Developer SHALL add a NagSuppression with a specific justification
3. WHEN a NagSuppression is added THEN the Suppression SHALL include the rule ID and a clear reason explaining why the rule does not apply
4. WHEN all findings are addressed THEN the CDK NAG System SHALL pass all compliance tests with zero unsuppressed errors and warnings

### Requirement 5

**User Story:** As a developer, I want the suppressions report to document all exceptions, so that security reviewers can audit the infrastructure decisions.

#### Acceptance Criteria

1. WHEN the suppressions report is generated THEN the Report SHALL include a summary of total suppressions by rule
2. WHEN the suppressions report is generated THEN the Report SHALL group suppressions by stack name
3. WHEN the suppressions report is generated THEN the Report SHALL include the resource ID, rule ID, and justification for each suppression
