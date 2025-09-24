# SPDX-License-Identifier: Apache-2.0
"""PEAC Protocol Camel Adapter - Python decorator for HTTP requests"""

import json
import time
import requests
from typing import Optional, Dict, Any, Callable
from functools import wraps

class PEACPaymentRequired(Exception):
    def __init__(self, problem: Dict[str, Any]):
        self.problem = problem
        super().__init__(problem.get('detail', 'Payment required'))

class CircuitBreaker:
    def __init__(self, threshold: int = 5, timeout: int = 30):
        self.threshold = threshold
        self.timeout = timeout
        self.failures = 0
        self.last_fail_time = 0

    def is_open(self) -> bool:
        return (self.failures >= self.threshold and
                time.time() - self.last_fail_time < self.timeout)

    def call(self, func: Callable) -> Any:
        if self.is_open():
            raise Exception("Circuit breaker open")

        try:
            result = func()
            self.failures = 0  # Reset on success
            return result
        except Exception as e:
            self.failures += 1
            self.last_fail_time = time.time()
            raise e

_breaker = CircuitBreaker()

def peac_enforce(bridge_url: str = "http://127.0.0.1:31415", max_retries: int = 3):
    """Decorator to add PEAC enforcement to HTTP requests"""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(url: str, **kwargs) -> requests.Response:
            attempt = 0

            while attempt <= max_retries:
                try:
                    # Pre-enforce via bridge
                    enforce_response = _breaker.call(lambda: requests.post(
                        f"{bridge_url}/enforce",
                        json={"resource": url, "purpose": "ai-training"},
                        timeout=5
                    ))

                    if enforce_response.status_code == 402:
                        problem = enforce_response.json()
                        raise PEACPaymentRequired(problem)

                    if not enforce_response.ok:
                        problem = enforce_response.json()
                        raise Exception(problem.get('detail', 'Enforcement failed'))

                    # Make actual request
                    response = func(url, **kwargs)

                    # Verify receipt if present
                    receipt = response.headers.get('PEAC-Receipt')
                    if receipt:
                        try:
                            verify_response = requests.post(
                                f"{bridge_url}/verify",
                                json={"receipt": receipt},
                                timeout=2
                            )
                            if verify_response.ok:
                                verify_result = verify_response.json()
                                response._peac_verified = verify_result.get('valid', False)
                        except:
                            response._peac_verified = False

                    response._peac_receipt = receipt
                    return response

                except PEACPaymentRequired:
                    raise  # Don't retry payment errors

                except Exception as e:
                    if attempt >= max_retries:
                        raise e

                    # Exponential backoff
                    time.sleep(0.1 * (2 ** attempt))
                    attempt += 1

        return wrapper
    return decorator

# Usage example:
# @peac_enforce()
# def fetch_content(url: str, **kwargs) -> requests.Response:
#     return requests.get(url, **kwargs)