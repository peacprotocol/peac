#!/usr/bin/env python3
"""
PEAC Protocol LangChain Tool Adapter v0.9.12.1
Thin wrapper for PEAC receipt issuance and verification
"""

import json
import requests
from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, Field
from langchain.tools import BaseTool

class PeacReceiptTool(BaseTool):
    """LangChain tool for PEAC receipt operations"""
    
    name: str = "peac_receipt"
    description: str = """Issue and verify PEAC receipts for content access attestation.
    
    Operations:
    - issue: Create a cryptographically signed receipt for content access
    - verify: Verify the authenticity of a PEAC receipt  
    - bulk_verify: Verify multiple receipts efficiently
    - purge: Issue a purge receipt for content deletion
    """
    
    peac_endpoint: str = Field(default="http://localhost:3000")
    api_key: Optional[str] = Field(default=None)
    
    class IssueArgs(BaseModel):
        operation: str = Field(description="Operation type: 'issue'")
        subject: str = Field(description="URI of content being accessed")
        purpose: str = Field(description="Purpose: train-ai, train-genai, search, evaluation, other")
        crawler_type: Optional[str] = Field(default="agent", description="Crawler type")
        options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional options")
    
    class VerifyArgs(BaseModel):
        operation: str = Field(description="Operation type: 'verify'")
        jws: str = Field(description="JWS-encoded receipt to verify")
        keys: Optional[Dict[str, Any]] = Field(default=None, description="Public keys for verification")
    
    class BulkVerifyArgs(BaseModel):
        operation: str = Field(description="Operation type: 'bulk_verify'")
        receipts: List[str] = Field(description="Array of JWS-encoded receipts")
        keys: Optional[Dict[str, Any]] = Field(default=None, description="Public keys for verification")
    
    class PurgeArgs(BaseModel):
        operation: str = Field(description="Operation type: 'purge'")
        subject: str = Field(description="URI of content being purged")
        corpus: str = Field(description="Corpus identifier")
        erasure_basis: Optional[str] = Field(default=None, description="Legal basis: gdpr, ccpa, contractual, other")
    
    def _run(self, operation: str, **kwargs) -> str:
        """Execute PEAC operation"""
        try:
            if operation == "issue":
                return self._issue_receipt(**kwargs)
            elif operation == "verify":
                return self._verify_receipt(**kwargs)
            elif operation == "bulk_verify":
                return self._bulk_verify(**kwargs)
            elif operation == "purge":
                return self._issue_purge(**kwargs)
            else:
                return f"Error: Unknown operation '{operation}'. Supported: issue, verify, bulk_verify, purge"
        except Exception as e:
            return f"Error: {str(e)}"
    
    async def _arun(self, operation: str, **kwargs) -> str:
        """Async version of _run"""
        # For now, just call the sync version
        return self._run(operation, **kwargs)
    
    def _issue_receipt(self, subject: str, purpose: str, crawler_type: str = "agent", 
                      options: Optional[Dict[str, Any]] = None) -> str:
        """Issue a PEAC receipt"""
        
        payload = {
            "subject": subject,
            "purpose": purpose,
            "crawler_type": crawler_type,
            **(options or {})
        }
        
        response = self._make_request("POST", "/receipts/issue", payload)
        
        if response.get("receipt"):
            return json.dumps({
                "success": True,
                "receipt": response["receipt"],
                "jws": response.get("jws"),
                "message": f"Receipt issued for {subject}"
            }, indent=2)
        else:
            return json.dumps({
                "success": False,
                "error": response.get("error", "Unknown error")
            }, indent=2)
    
    def _verify_receipt(self, jws: str, keys: Optional[Dict[str, Any]] = None) -> str:
        """Verify a PEAC receipt"""
        
        payload = {"jws": jws}
        if keys:
            payload["keys"] = keys
        
        response = self._make_request("POST", "/receipts/verify", payload)
        
        return json.dumps({
            "valid": response.get("valid", False),
            "receipt": response.get("receipt"),
            "error": response.get("error"),
            "message": "Receipt verified successfully" if response.get("valid") else f"Verification failed: {response.get('error', 'Unknown error')}"
        }, indent=2)
    
    def _bulk_verify(self, receipts: List[str], keys: Optional[Dict[str, Any]] = None) -> str:
        """Bulk verify PEAC receipts"""
        
        # Convert to NDJSON format
        ndjson = "\n".join(receipts)
        
        payload = {"ndjson": ndjson}
        if keys:
            payload["keys"] = keys
        
        response = self._make_request("POST", "/receipts/bulk-verify", payload)
        
        return json.dumps({
            "total": response.get("total", 0),
            "valid": response.get("valid", 0),
            "invalid": response.get("invalid", 0),
            "results": response.get("results", []),
            "message": f"Bulk verification complete: {response.get('valid', 0)}/{response.get('total', 0)} valid"
        }, indent=2)
    
    def _issue_purge(self, subject: str, corpus: str, erasure_basis: Optional[str] = None) -> str:
        """Issue a purge receipt"""
        
        payload = {
            "subject": subject,
            "corpus": corpus
        }
        if erasure_basis:
            payload["erasure_basis"] = erasure_basis
        
        response = self._make_request("POST", "/purge/issue", payload)
        
        if response.get("purge_receipt"):
            return json.dumps({
                "success": True,
                "purge_receipt": response["purge_receipt"],
                "jws": response.get("jws"),
                "message": f"Purge receipt issued for {subject}"
            }, indent=2)
        else:
            return json.dumps({
                "success": False,
                "error": response.get("error", "Unknown error")
            }, indent=2)
    
    def _make_request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make HTTP request to PEAC endpoint"""
        
        url = f"{self.peac_endpoint}{path}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PEAC-LangChain-Tool/0.9.12.1"
        }
        
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        try:
            if method == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            return {"error": f"HTTP request failed: {str(e)}"}
        except json.JSONDecodeError:
            return {"error": "Invalid JSON response from server"}

class PeacReceiptSchema(BaseModel):
    """Input schema for PEAC receipt tool"""
    operation: str = Field(description="Operation: issue, verify, bulk_verify, or purge")
    subject: Optional[str] = Field(None, description="URI of content (required for issue/purge)")
    purpose: Optional[str] = Field(None, description="Access purpose (required for issue)")
    crawler_type: Optional[str] = Field("agent", description="Crawler type")
    jws: Optional[str] = Field(None, description="JWS receipt (required for verify)")
    receipts: Optional[List[str]] = Field(None, description="Receipt list (required for bulk_verify)")
    corpus: Optional[str] = Field(None, description="Corpus ID (required for purge)")
    erasure_basis: Optional[str] = Field(None, description="Erasure basis for purge")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional options")
    keys: Optional[Dict[str, Any]] = Field(None, description="Public keys for verification")

# Factory function for easy integration
def create_peac_tool(endpoint: str = "http://localhost:3000", api_key: Optional[str] = None) -> PeacReceiptTool:
    """Create a PEAC receipt tool instance"""
    return PeacReceiptTool(
        peac_endpoint=endpoint,
        api_key=api_key
    )

# Example usage
if __name__ == "__main__":
    tool = create_peac_tool()
    
    # Example: Issue a receipt
    result = tool._run(
        operation="issue",
        subject="https://example.com/article/123",
        purpose="train-ai",
        options={
            "aipref": {"status": "allowed"},
            "acquisition": {"method": "license", "source": "https://example.com/license"}
        }
    )
    print("Issue result:", result)
    
    # Example: Verify a receipt (would need actual JWS)
    # result = tool._run(
    #     operation="verify",
    #     jws="eyJhbGci..."
    # )
    # print("Verify result:", result)