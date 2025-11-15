#  Copyright 2025 Amazon.com, Inc. or its affiliates.

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # This import is only for IDE type checking - makes expect() visible to IDEs
    from typing import Any

    def expect(description: str) -> "ExpectHelper": ...

    class ExpectHelper:
        def equals(self, actual: Any, expected: Any) -> "ExpectHelper": ...


def with_expect(func):
    """Decorator that provides detailed assertion error messages for integration tests."""

    class Expect:
        def __init__(self, description):
            self.description = description

        def equals(self, actual, expected):
            assert actual == expected, f"{self.description}: expected '{expected}', got '{actual}'"
            return self

    def wrapper(*args, **kwargs):
        # Inject expect function into the decorated function's namespace
        func.__globals__["expect"] = Expect
        try:
            return func(*args, **kwargs)
        except AssertionError as e:
            # Add context about where the assertion failed
            tb = e.__traceback__
            while tb.tb_next:
                tb = tb.tb_next
            msg = f"Failed in {func.__name__} (line {tb.tb_lineno}): {e}"
            raise AssertionError(msg) from e

    return wrapper
