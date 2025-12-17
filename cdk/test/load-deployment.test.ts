/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for loadDeploymentConfig function.
 */

// Mock fs module before importing the function under test
jest.mock("fs", () => {
  const actualFs = jest.requireActual<typeof import("fs")>("fs");
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
  };
});

import { existsSync, readFileSync } from "fs";

import { loadDeploymentConfig } from "../bin/deployment/load-deployment";

describe("loadDeploymentConfig", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (existsSync as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads valid deployment configuration", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.projectName).toBe("test-project");
    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
    expect(result.account.prodLike).toBe(false);
    expect(result.account.isAdc).toBe(false);
  });

  test("throws error when deployment.json is missing", () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing deployment.json file/);
  });

  test("throws error when JSON is invalid", () => {
    (readFileSync as jest.Mock).mockReturnValue("{ invalid json }");

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid JSON format/);
  });

  test("validates required projectName field", () => {
    const config = {
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: projectName/);
  });

  test("validates projectName is not empty", () => {
    const config = {
      projectName: "",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/cannot be empty/);
  });

  test("validates required account.id field", () => {
    const config = {
      projectName: "test-project",
      account: {
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.id/);
  });

  test("validates account ID format (must be 12 digits)", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "12345",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS account ID format/);
  });

  test("validates required account.region field", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.region/);
  });

  test("validates region format", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "invalid_region_123",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS region format/);
  });

  test("validates required account.prodLike field", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.prodLike/);
  });

  test("loads prodLike and isAdc flags", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: true,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.prodLike).toBe(true);
    expect(result.account.isAdc).toBe(true);
  });

  test("defaults isAdc to false when not specified", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.isAdc).toBe(false);
  });

  test("validates VPC ID format when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "invalid-vpc-id",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid VPC ID format/);
  });

  test("requires TARGET_SUBNETS when VPC_ID is provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/TARGET_SUBNETS must also be specified/);
  });

  test("validates TARGET_SUBNETS is array when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: "not-an-array",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/must be an array/);
  });

  test("validates subnet ID format in TARGET_SUBNETS", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["invalid-subnet-id"],
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid Subnet ID format/);
  });

  test("validates SECURITY_GROUP_ID format when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345678"],
        SECURITY_GROUP_ID: "invalid-sg-id",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid security group ID format/);
  });

  test("loads networkConfig with valid VPC configuration", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345678", "subnet-87654321"],
        SECURITY_GROUP_ID: "sg-12345678",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig).toBeDefined();
    expect(result.networkConfig?.VPC_ID).toBe("vpc-12345678");
    expect(result.networkConfig?.TARGET_SUBNETS).toEqual([
      "subnet-12345678",
      "subnet-87654321",
    ]);
    expect(result.networkConfig?.SECURITY_GROUP_ID).toBe("sg-12345678");
  });

  test("loads networkConfig with optional VPC_NAME and SECURITY_GROUP_NAME", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_NAME: "custom-vpc",
        SECURITY_GROUP_NAME: "custom-sg",
        MAX_AZS: 2,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig).toBeDefined();
    expect(result.networkConfig?.VPC_NAME).toBe("custom-vpc");
    expect(result.networkConfig?.SECURITY_GROUP_NAME).toBe("custom-sg");
    expect(result.networkConfig?.MAX_AZS).toBe(2);
  });

  test("loads dataplaneConfig when provided", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      dataplaneConfig: {
        BUILD_FROM_SOURCE: true,
        ECS_TASK_CPU: 4096,
        ECS_TASK_MEMORY: 8192,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.dataplaneConfig).toEqual({
      BUILD_FROM_SOURCE: true,
      ECS_TASK_CPU: 4096,
      ECS_TASK_MEMORY: 8192,
    });
  });

  test("defaults deployIntegrationTests to true when not specified", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.deployIntegrationTests).toBe(true);
  });

  test("loads deployIntegrationTests when set to false", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      deployIntegrationTests: false,
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.deployIntegrationTests).toBe(false);
  });

  test("loads testImageryConfig when deployIntegrationTests is true", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      deployIntegrationTests: true,
      testImageryConfig: {
        S3_IMAGE_BUCKET_PREFIX: "custom-test-imagery",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.testImageryConfig).toBeDefined();
    expect(result.testImageryConfig?.S3_IMAGE_BUCKET_PREFIX).toBe(
      "custom-test-imagery",
    );
  });

  test("ignores testImageryConfig when deployIntegrationTests is false", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      deployIntegrationTests: false,
      testImageryConfig: {
        S3_IMAGE_BUCKET_PREFIX: "custom-test-imagery",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.testImageryConfig).toBeUndefined();
  });

  test("loads testConfig when deployIntegrationTests is true", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      deployIntegrationTests: true,
      testConfig: {
        BUILD_FROM_SOURCE: true,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.testConfig).toBeDefined();
    expect(result.testConfig?.BUILD_FROM_SOURCE).toBe(true);
  });

  test("ignores testConfig when deployIntegrationTests is false", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      deployIntegrationTests: false,
      testConfig: {
        BUILD_FROM_SOURCE: true,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.testConfig).toBeUndefined();
  });

  test("trims whitespace from string fields", () => {
    const config = {
      projectName: "  test-project  ",
      account: {
        id: "  123456789012  ",
        region: "  us-west-2  ",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.projectName).toBe("test-project");
    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
  });

  test("validates projectName is not whitespace only", () => {
    const config = {
      projectName: "   ",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/cannot be empty or contain only whitespace/);
  });

  test("validates account section exists", () => {
    const config = {
      projectName: "test-project",
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing or invalid account section/);
  });

  test("validates deployment.json is a valid object", () => {
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(null));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/must contain a valid JSON object/);
  });

  test("accepts valid 17-character VPC ID", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678901234567",
        TARGET_SUBNETS: ["subnet-12345678"],
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig?.VPC_ID).toBe("vpc-12345678901234567");
  });

  test("accepts valid 17-character security group ID", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345678"],
        SECURITY_GROUP_ID: "sg-12345678901234567",
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig?.SECURITY_GROUP_ID).toBe(
      "sg-12345678901234567",
    );
  });

  test("accepts valid 17-character subnet ID", () => {
    const config = {
      projectName: "test-project",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: false,
      },
      networkConfig: {
        VPC_ID: "vpc-12345678",
        TARGET_SUBNETS: ["subnet-12345678901234567"],
      },
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig?.TARGET_SUBNETS).toEqual([
      "subnet-12345678901234567",
    ]);
  });

  test("accepts various valid AWS region formats", () => {
    const regions = [
      "us-east-1",
      "us-west-2",
      "eu-west-1",
      "ap-southeast-2",
      "us-iso-east-1",
      "us-isob-east-1",
    ];

    for (const region of regions) {
      const config = {
        projectName: "test-project",
        account: {
          id: "123456789012",
          region: region,
          prodLike: false,
        },
      };

      (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

      const result = loadDeploymentConfig();

      expect(result.account.region).toBe(region);
    }
  });
});
