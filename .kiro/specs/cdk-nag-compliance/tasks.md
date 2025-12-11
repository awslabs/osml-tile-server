# Implementation Plan

- [x] 1. Update Jest configuration for global teardown
  - [x] 1.1 Modify jest.config.js to add globalTeardown pointing to test-utils.ts
    - Add `globalTeardown: "<rootDir>/test/test-utils.ts"` to the Jest config
    - _Requirements: 2.1, 2.2_

- [x] 2. Add CDK NAG compliance blocks to construct test files
  - [x] 2.1 Add CDK NAG compliance block to database.test.ts
    - Add describe block for "cdk-nag Compliance Checks - Database"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Add CDK NAG compliance block to dataplane.test.ts
    - Add describe block for "cdk-nag Compliance Checks - Dataplane"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.3 Add CDK NAG compliance block to ecs-roles.test.ts
    - Add describe block for "cdk-nag Compliance Checks - EcsRoles"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.4 Add CDK NAG compliance block to ecs-service.test.ts
    - Add describe block for "cdk-nag Compliance Checks - EcsService"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.5 Add CDK NAG compliance block to messaging.test.ts
    - Add describe block for "cdk-nag Compliance Checks - Messaging"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.6 Add CDK NAG compliance block to network.test.ts
    - Add describe block for "cdk-nag Compliance Checks - Network"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.7 Add CDK NAG compliance block to storage.test.ts
    - Add describe block for "cdk-nag Compliance Checks - Storage"
    - Apply AwsSolutionsChecks with verbose logging in beforeAll
    - Call generateNagReport to output findings
    - Add assertions for zero unsuppressed warnings and errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Checkpoint - Run initial CDK NAG scan
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Address CDK NAG findings for each construct
  - [x] 4.1 Address findings in Database construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Address findings in Dataplane construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.3 Address findings in EcsRoles construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.4 Address findings in EcsService construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.5 Address findings in Messaging construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.6 Address findings in Network construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.7 Address findings in Storage construct
    - Run tests to identify NAG findings
    - Remediate findings by modifying CDK code where possible
    - Add NagSuppressions with specific justifications for findings that cannot be remediated
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Final Checkpoint - Verify all compliance tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Generate and review final suppressions report
  - [x] 6.1 Run full test suite to generate cdk-nag-suppressions-report.txt
    - Execute `npm run test` in cdk directory
    - Verify report is generated with summary by rule, grouped by stack, with resource IDs and justifications
    - _Requirements: 5.1, 5.2, 5.3, 4.4_
