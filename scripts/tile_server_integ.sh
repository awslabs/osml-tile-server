#!/bin/bash
#
# Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
#

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Exit if any part of a pipeline fails

print_banner() {
    echo "=========================================="
    echo "  Running Tile Server Integration Tests   "
    echo "=========================================="
}

print_test_passed() {
    echo "=========================================="
    echo "       Integration Tests Completed        "
    echo "=========================================="
    echo "            All tests passed!             "
    echo "=========================================="
}

print_test_failed() {
    echo "=========================================="
    echo "        Integration Tests Failed          "
    echo "=========================================="
    echo "        Some tests did not pass!          "
    echo "=========================================="
}

# Function to handle errors
handle_error() {
    echo "ERROR: An error occurred during the script execution."
    exit 1
}

# Trap errors and call the handle_error function
trap 'handle_error' ERR

# Check AWS_REGION, aws configure, then AWS_DEFAULT_REGION to determine the region.
# If none are set, prompt the user for the AWS_REGION.
if [ -z "$AWS_REGION" ]; then
    {
        AWS_REGION=$(aws configure get region)
    } || {
        if [ -n "$AWS_DEFAULT_REGION" ]; then
            AWS_REGION=$AWS_DEFAULT_REGION
        else
            read -p "Could not find region. Enter the AWS region (ex. us-west-2): " user_region
            if [ -n "$user_region" ]; then
                AWS_REGION=$user_region
            else
                echo "ERROR: AWS region is required."
                exit 1
            fi
        fi
    }
fi

# Grab the account id for the loaded AWS credentials
ACCOUNT_ID=$(aws sts get-caller-identity --region "$AWS_REGION" --query Account --output text)

# Check if the account ID was successfully retrieved.
# If not, prompt the user for the account ID.
if [ -z "$ACCOUNT_ID" ]; then
    read -p "Please enter your AWS Account ID: " account_id
    if [ -z "$account_id" ]; then
        echo "ERROR: AWS Account ID is required."
        exit 1
    else
        ACCOUNT_ID=$account_id
    fi
fi

# Print the starting banner
print_banner

# Create the lambda test payload with full path
TEMP_PAYLOAD=$(mktemp)
echo "{\"image_uri\": \"s3://ts-test-imagery-$ACCOUNT_ID/small.tif\"}" > "$TEMP_PAYLOAD"

echo "Invoking the Lambda function 'TSTestRunner' with payload:"
echo "Payload: {\"image_uri\": \"s3://ts-test-imagery-$ACCOUNT_ID/small.tif\"}"
echo "Region: $AWS_REGION"
echo ""

# Check if Lambda function exists before invoking
if ! aws lambda get-function --function-name "TSTestRunner" --region "$AWS_REGION" &>/dev/null; then
    echo "ERROR: Lambda function 'TSTestRunner' not found in region $AWS_REGION"
    echo "Please ensure the infrastructure is deployed with 'deployIntegrationTests: true'"
    rm -f "$TEMP_PAYLOAD"
    exit 1
fi

# Invoke the Lambda function with the payload
# Set timeout to 12 minutes (Lambda timeout is 10 minutes + buffer)
# Use gtimeout (macOS with Homebrew coreutils) or timeout (Linux) if available
# If neither is available, rely on AWS CLI's --cli-read-timeout
TIMEOUT_CMD=""
if command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_CMD="gtimeout 720"
elif command -v timeout >/dev/null 2>&1; then
    TIMEOUT_CMD="timeout 720"
fi

echo "Waiting for Lambda execution (this may take several minutes for cold starts)..."
if [ -n "$TIMEOUT_CMD" ]; then
    # Use timeout command if available
    if ! log_result=$(${TIMEOUT_CMD} aws lambda invoke --region "$AWS_REGION" \
                                        --function-name "TSTestRunner" \
                                        --payload fileb://"$TEMP_PAYLOAD" \
                                        --log-type Tail /dev/null \
                                        --cli-read-timeout 720 \
                                        --query 'LogResult' \
                                        --output text 2>&1); then
        echo "ERROR: Failed to invoke Lambda function or timeout exceeded"
        echo "Last output: $log_result"
        echo ""
        echo "To check Lambda logs manually, run:"
        echo "  aws logs tail /aws/lambda/TSTestRunner --follow --region $AWS_REGION"
        rm -f "$TEMP_PAYLOAD"
        exit 1
    fi
else
    # Fallback: use AWS CLI timeout only (works on macOS without coreutils)
    if ! log_result=$(aws lambda invoke --region "$AWS_REGION" \
                                        --function-name "TSTestRunner" \
                                        --payload fileb://"$TEMP_PAYLOAD" \
                                        --log-type Tail /dev/null \
                                        --cli-read-timeout 720 \
                                        --query 'LogResult' \
                                        --output text 2>&1); then
        echo "ERROR: Failed to invoke Lambda function"
        echo "Last output: $log_result"
        echo ""
        echo "To check Lambda logs manually, run:"
        echo "  aws logs tail /aws/lambda/TSTestRunner --follow --region $AWS_REGION"
        rm -f "$TEMP_PAYLOAD"
        exit 1
    fi
fi

# Decode the log result
decoded_log=$(echo "$log_result" | base64 --decode)

# Extract and display only the test summary section using awk for more precise control
test_summary=$(echo "$decoded_log" | awk '/^Test Summary/{p=1; print; next} /^Tests: [0-9]+, Passed: [0-9]+, Failed: [0-9]+, Success: [0-9]+\.[0-9]+%$/{p=0; print; exit} p{print}')
echo "$test_summary"

# Clean up the temporary payload file
rm -f "$TEMP_PAYLOAD"

# Check for success in the decoded log
if echo "$decoded_log" | grep -q "Success: 100.00%"; then
    print_test_passed
    exit 0
else
    # If failed print logs
    print_test_failed
    echo "Full logs:"
    echo "$decoded_log"
    exit 1
fi
