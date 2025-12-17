/**
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Utility to load and validate the deployment configuration file.
 *
 * This module provides a strongly typed interface for reading the `deployment.json`
 * configuration, performing required validations, and returning a structured result.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { TestImageryConfig } from "../../lib/constructs/test/imagery";
import { TestConfig } from "../../lib/constructs/test/test";
import { NetworkConfig } from "../../lib/constructs/tile-server/network";
import { ConfigType } from "../../lib/constructs/types";

/**
 * Represents the structure of the deployment configuration file.
 */
export interface DeploymentConfig {
  /** Logical name of the project, used for the CDK stack ID. */
  projectName: string;

  /** AWS account configuration. */
  account: {
    /** AWS Account ID. */
    id: string;
    /** AWS region for deployment. */
    region: string;
    /** Whether the account is prod-like. */
    prodLike: boolean;
    /** Whether this is an ADC (Application Data Center) environment. */
    isAdc: boolean;
  };
  /** Networking configuration. If VPC_ID is provided, an existing VPC will be imported. Otherwise, a new VPC will be created. */
  networkConfig?: NetworkConfig;

  /** Optional Dataplane configuration. Can be a partial config object passed to DataplaneConfig constructor. */
  dataplaneConfig?: Partial<Record<string, unknown>>;

  /** Whether to deploy integration test infrastructure (tests and test imagery stacks). */
  deployIntegrationTests?: boolean;

  /** Optional config for deploying test images. */
  testImageryConfig?: TestImageryConfig;

  /** Optional integration test configuration. */
  testConfig?: TestConfig;
}

/**
 * Validation error class for deployment configuration issues.
 */
class DeploymentConfigError extends Error {
  /**
   * Creates a new DeploymentConfigError.
   *
   * @param message - The error message
   * @param field - Optional field name that caused the error
   */
  constructor(
    message: string,
    // eslint-disable-next-line no-unused-vars
    public field?: string,
  ) {
    super(message);
    this.name = "DeploymentConfigError";
  }
}

/**
 * Validates and trims a string field, checking for required value and whitespace.
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @param isRequired - Whether the field is required (default: true)
 * @returns The trimmed string value
 * @throws {DeploymentConfigError} If validation fails
 */
function validateStringField(
  value: unknown,
  fieldName: string,
  isRequired: boolean = true,
): string {
  if (value === undefined || value === null) {
    if (isRequired) {
      throw new DeploymentConfigError(
        `Missing required field: ${fieldName}`,
        fieldName,
      );
    }
    return "";
  }

  if (typeof value !== "string") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' must be a string, got ${typeof value}`,
      fieldName,
    );
  }

  const trimmed = value.trim();
  if (isRequired && trimmed === "") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' cannot be empty or contain only whitespace`,
      fieldName,
    );
  }

  return trimmed;
}

/**
 * Validates a boolean field, checking for correct type.
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @param isRequired - Whether the field is required (default: true)
 * @param defaultValue - Default value to return if field is not provided and not required
 * @returns The validated boolean value
 * @throws {DeploymentConfigError} If validation fails
 */
function validateBooleanField(
  value: unknown,
  fieldName: string,
  isRequired: boolean = true,
  defaultValue?: boolean,
): boolean {
  if (value === undefined || value === null) {
    if (isRequired) {
      throw new DeploymentConfigError(
        `Missing required field: ${fieldName}`,
        fieldName,
      );
    }
    return defaultValue ?? false;
  }

  if (typeof value !== "boolean") {
    throw new DeploymentConfigError(
      `Field '${fieldName}' must be a boolean, got ${typeof value}`,
      fieldName,
    );
  }

  return value;
}

/**
 * Validates AWS account ID format.
 *
 * @param accountId - The account ID to validate
 * @returns The validated account ID
 * @throws {DeploymentConfigError} If the account ID format is invalid
 */
function validateAccountId(accountId: string): string {
  if (!/^\d{12}$/.test(accountId)) {
    throw new DeploymentConfigError(
      `Invalid AWS account ID format: '${accountId}'. Must be exactly 12 digits.`,
      "account.id",
    );
  }
  return accountId;
}

/**
 * Validates AWS region format using pattern matching.
 *
 * @param region - The region to validate
 * @returns The validated region
 * @throws {DeploymentConfigError} If the region format is invalid
 */
function validateRegion(region: string): string {
  // AWS region pattern: letters/numbers, hyphen, letters/numbers, optional hyphen and numbers
  if (!/^[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region)) {
    throw new DeploymentConfigError(
      `Invalid AWS region format: '${region}'. Must follow pattern like 'us-east-1', 'eu-west-2', etc.`,
      "account.region",
    );
  }
  return region;
}

/**
 * Validates VPC ID format.
 *
 * @param vpcId - The VPC ID to validate
 * @returns The validated VPC ID
 * @throws {DeploymentConfigError} If the VPC ID format is invalid
 */
function validateVpcId(vpcId: string): string {
  if (!/^vpc-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(vpcId)) {
    throw new DeploymentConfigError(
      `Invalid VPC ID format: '${vpcId}'. Must start with 'vpc-' followed by 8 or 17 hexadecimal characters.`,
      "config.targetVpcId",
    );
  }
  return vpcId;
}

/**
 * Validates security group ID format.
 *
 * @param securityGroupId - The security group ID to validate
 * @returns The validated security group ID
 * @throws {DeploymentConfigError} If the security group ID format is invalid
 */
function validateSecurityGroupId(securityGroupId: string): string {
  if (!/^sg-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(securityGroupId)) {
    throw new DeploymentConfigError(
      `Invalid security group ID format: '${securityGroupId}'. Must start with 'sg-' followed by 8 or 17 hexadecimal characters.`,
      "vpcConfig.securityGroupId",
    );
  }
  return securityGroupId;
}

/**
 * Validates subnet ID format.
 *
 * @param subnetId - The subnet ID to validate
 * @returns The validated subnet ID
 * @throws {DeploymentConfigError} If the subnet ID format is invalid
 */
function validateSubnetId(subnetId: string): string {
  if (!/^subnet-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(subnetId)) {
    throw new DeploymentConfigError(
      `Invalid Subnet ID format: '${subnetId}'. Must start with 'subnet-' followed by 8 or 17 hexadecimal characters.`,
      "networkConfig.targetSubnets",
    );
  }
  return subnetId;
}

/**
 * Loads and validates the deployment configuration from `deployment/deployment.json`.
 *
 * @returns A validated {@link DeploymentConfig} object
 * @throws {DeploymentConfigError} If the file is missing, malformed, or contains invalid values
 */
export function loadDeploymentConfig(): DeploymentConfig {
  const deploymentPath = join(__dirname, "deployment.json");

  if (!existsSync(deploymentPath)) {
    throw new DeploymentConfigError(
      `Missing deployment.json file at ${deploymentPath}. Please create it by copying deployment.json.example`,
    );
  }

  let parsed: unknown;
  try {
    const rawContent = readFileSync(deploymentPath, "utf-8");
    parsed = JSON.parse(rawContent);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DeploymentConfigError(
        `Invalid JSON format in deployment.json: ${error.message}`,
      );
    }
    throw new DeploymentConfigError(
      `Failed to read deployment.json: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Validate top-level structure
  if (!parsed || typeof parsed !== "object") {
    throw new DeploymentConfigError(
      "deployment.json must contain a valid JSON object",
    );
  }

  const config = parsed as Record<string, unknown>;

  // Validate project name
  const projectName = validateStringField(config.projectName, "projectName");
  if (projectName.length === 0) {
    throw new DeploymentConfigError("projectName cannot be empty");
  }

  // Validate account section
  if (!config.account || typeof config.account !== "object") {
    throw new DeploymentConfigError(
      "Missing or invalid account section in deployment.json",
      "account",
    );
  }

  const accountConfig = config.account as Record<string, unknown>;

  const accountId = validateAccountId(
    validateStringField(accountConfig.id, "account.id"),
  );
  const region = validateRegion(
    validateStringField(accountConfig.region, "account.region"),
  );
  const prodLike = validateBooleanField(
    accountConfig.prodLike,
    "account.prodLike",
  );
  const isAdc = validateBooleanField(
    accountConfig.isAdc,
    "account.isAdc",
    false,
    false,
  );

  // Parse optional Network configuration
  let networkConfig: DeploymentConfig["networkConfig"] = undefined;
  if (
    config.networkConfig &&
    typeof config.networkConfig === "object" &&
    config.networkConfig !== null
  ) {
    const networkConfigData = config.networkConfig as Record<string, unknown>;

    // Validate VPC_ID format if provided
    if (networkConfigData.VPC_ID !== undefined) {
      validateVpcId(
        validateStringField(networkConfigData.VPC_ID, "networkConfig.VPC_ID"),
      );
    }

    // Validate TARGET_SUBNETS is an array if provided
    if (networkConfigData.TARGET_SUBNETS !== undefined) {
      if (!Array.isArray(networkConfigData.TARGET_SUBNETS)) {
        throw new DeploymentConfigError(
          "Field 'networkConfig.TARGET_SUBNETS' must be an array",
          "networkConfig.TARGET_SUBNETS",
        );
      }
      // Validate each subnet ID format
      for (const subnetId of networkConfigData.TARGET_SUBNETS) {
        validateSubnetId(
          validateStringField(subnetId, "networkConfig.TARGET_SUBNETS[]"),
        );
      }
    }

    // Validate SECURITY_GROUP_ID format if provided
    if (networkConfigData.SECURITY_GROUP_ID !== undefined) {
      validateSecurityGroupId(
        validateStringField(
          networkConfigData.SECURITY_GROUP_ID,
          "networkConfig.SECURITY_GROUP_ID",
        ),
      );
    }

    // Validate that TARGET_SUBNETS is required when VPC_ID is provided
    if (
      networkConfigData.VPC_ID &&
      (!networkConfigData.TARGET_SUBNETS ||
        !Array.isArray(networkConfigData.TARGET_SUBNETS) ||
        networkConfigData.TARGET_SUBNETS.length === 0)
    ) {
      throw new DeploymentConfigError(
        "When VPC_ID is provided, TARGET_SUBNETS must also be specified with at least one subnet ID",
        "networkConfig.TARGET_SUBNETS",
      );
    }

    // Create NetworkConfig instance with all properties passed through
    networkConfig = new NetworkConfig(networkConfigData);
  }

  // Parse optional Dataplane configuration
  let dataplaneConfig: DeploymentConfig["dataplaneConfig"] = undefined;
  if (config.dataplaneConfig && typeof config.dataplaneConfig === "object") {
    dataplaneConfig = config.dataplaneConfig as Partial<
      Record<string, unknown>
    >;
  }

  // Parse optional deployIntegrationTests flag
  const deployIntegrationTests = validateBooleanField(
    config.deployIntegrationTests,
    "deployIntegrationTests",
    false,
    true,
  );

  // Parse optional test imagery configuration (only if deployIntegrationTests is true)
  let testImageryConfig: DeploymentConfig["testImageryConfig"] = undefined;
  if (deployIntegrationTests) {
    if (
      config.testImageryConfig &&
      typeof config.testImageryConfig === "object"
    ) {
      // Instantiate TestImageryConfig to ensure proper default merging and type safety
      testImageryConfig = new TestImageryConfig(
        config.testImageryConfig as ConfigType,
      );
    }
  }

  // Parse optional test configuration (only if deployIntegrationTests is true)
  let testConfig: DeploymentConfig["testConfig"] = undefined;
  if (deployIntegrationTests) {
    if (config.testConfig && typeof config.testConfig === "object") {
      // Instantiate TestConfig to ensure proper default merging and type safety
      testConfig = new TestConfig(config.testConfig as Partial<ConfigType>);
    }
  }

  const validatedConfig: DeploymentConfig = {
    projectName,
    account: {
      id: accountId,
      region: region,
      prodLike: prodLike,
      isAdc: isAdc,
    },
    networkConfig,
    dataplaneConfig: dataplaneConfig,
    deployIntegrationTests: deployIntegrationTests,
    testImageryConfig: testImageryConfig,
    testConfig: testConfig,
  };

  // Only log non-sensitive configuration details
  console.log(
    `Using environment from deployment.json: projectName=${validatedConfig.projectName}, region=${validatedConfig.account.region}`,
  );

  return validatedConfig;
}
