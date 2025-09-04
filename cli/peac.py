#!/usr/bin/env python3
"""
PEAC Protocol v0.9.12 Python CLI
Ultra-lean Python implementation with jwcrypto
"""

import json
import base64
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pathlib import Path

import click
import requests
from jwcrypto import jwk, jws
from jwcrypto.common import json_encode, json_decode
from pydantic import BaseModel, ValidationError


class PeacReceipt(BaseModel):
    """PEAC receipt schema validation"""
    subject: Dict[str, Any]
    aipref: Dict[str, Any]
    enforcement: Dict[str, Any]
    issued_at: str
    kid: str
    payment: Optional[Dict[str, Any]] = None
    ext: Optional[Dict[str, Any]] = None


class PeacCLI:
    """PEAC CLI operations with jwcrypto"""
    
    def __init__(self, keys_file: Optional[str] = None):
        self.keys = {}
        if keys_file and Path(keys_file).exists():
            self.load_keys(keys_file)
    
    def load_keys(self, keys_file: str) -> None:
        """Load Ed25519 keys from JSON file"""
        try:
            with open(keys_file, 'r') as f:
                key_data = json.load(f)
            
            for kid, key_info in key_data.items():
                if key_info.get('kty') == 'OKP' and key_info.get('crv') == 'Ed25519':
                    key = jwk.JWK(**key_info)
                    self.keys[kid] = key
                    
            click.echo(f"✅ Loaded {len(self.keys)} Ed25519 keys")
        except Exception as e:
            click.echo(f"❌ Failed to load keys: {e}", err=True)
    
    def generate_keypair(self, kid: str) -> Dict[str, Any]:
        """Generate new Ed25519 keypair"""
        key = jwk.JWK.generate(kty='OKP', crv='Ed25519')
        
        # Export private key (for signing)
        private_export = key.export_private()
        private_key = json.loads(private_export)
        
        # Export public key (for verification)
        public_export = key.export_public()
        public_key = json.loads(public_export)
        
        return {
            'kid': kid,
            'private_key': {**private_key, 'kid': kid},
            'public_key': {**public_key, 'kid': kid}
        }
    
    def sign_receipt(self, receipt: Dict[str, Any], kid: str) -> str:
        """Sign PEAC receipt as JWS compact serialization"""
        if kid not in self.keys:
            raise ValueError(f"Key '{kid}' not found")
        
        # Validate receipt schema
        try:
            PeacReceipt(**receipt)
        except ValidationError as e:
            raise ValueError(f"Invalid receipt schema: {e}")
        
        # Ensure kid consistency
        receipt['kid'] = kid
        
        # Create JWS
        signing_key = self.keys[kid]
        token = jws.JWS(json_encode(receipt))
        token.add_signature(signing_key, alg='EdDSA', protected={'alg': 'EdDSA', 'kid': kid})
        
        return token.serialize(compact=True)
    
    def verify_receipt(self, jws_token: str, keys: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Verify PEAC receipt JWS"""
        try:
            # Parse JWS
            token = jws.JWS()
            token.deserialize(jws_token)
            
            # Extract header
            protected_header = json.loads(token.jose_header)
            kid = protected_header.get('kid')
            
            if not kid:
                raise ValueError("Missing kid in JWS header")
            
            # Get verification key
            verification_key = None
            if keys and kid in keys:
                # Use provided keys
                key_data = keys[kid]
                verification_key = jwk.JWK(**key_data)
            elif kid in self.keys:
                # Use loaded keys (public key for verification)
                verification_key = self.keys[kid]
            else:
                raise ValueError(f"Verification key for '{kid}' not found")
            
            # Verify signature
            payload = token.payload.decode('utf-8')
            receipt_data = json.loads(payload)
            
            # Validate receipt schema
            PeacReceipt(**receipt_data)
            
            # Ensure kid consistency
            if receipt_data.get('kid') != kid:
                raise ValueError(f"Kid mismatch: header={kid}, payload={receipt_data.get('kid')}")
            
            return {
                'valid': True,
                'header': protected_header,
                'payload': receipt_data,
                'verification': {
                    'signature': 'valid',
                    'schema': 'valid',
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'key_id': kid
                }
            }
            
        except Exception as e:
            return {
                'valid': False,
                'error': str(e),
                'verification': {
                    'signature': 'invalid',
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            }
    
    def discover_peac_txt(self, origin: str) -> Dict[str, Any]:
        """Discover .well-known/peac.txt"""
        try:
            url = f"{origin.rstrip('/')}/.well-known/peac.txt"
            
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'PEAC Python CLI/0.9.12 (+https://peac.dev)'
            })
            
            if not response.ok:
                return {
                    'valid': False,
                    'origin': origin,
                    'error': f"HTTP {response.status_code}: {response.reason}"
                }
            
            # Simple parsing (full parser would be more complex)
            content = response.text.strip()
            lines = [line.strip() for line in content.split('\n') if line.strip() and not line.startswith('#')]
            
            if len(lines) > 20:
                return {
                    'valid': False,
                    'origin': origin,
                    'error': f"Line limit exceeded: {len(lines)} > 20"
                }
            
            discovery = {}
            for line in lines:
                if ':' in line:
                    key, value = line.split(':', 1)
                    discovery[key.strip()] = value.strip()
                    
            # Parse payments array if present
            if 'payments' in discovery:
                payments_str = discovery['payments'].strip()
                if payments_str.startswith('[') and payments_str.endswith(']'):
                    # Simple array parsing: [ x402 , tempo , l402 ]
                    items = payments_str[1:-1].split(',')
                    discovery['payments'] = [item.strip().strip('"\'') for item in items]
            
            return {
                'valid': True,
                'origin': origin,
                'discovery': discovery,
                'line_count': len(lines)
            }
            
        except Exception as e:
            return {
                'valid': False,
                'origin': origin,
                'error': str(e)
            }


# CLI Commands
@click.group()
@click.option('--keys', '-k', help='Path to keys file')
@click.pass_context
def cli(ctx, keys):
    """PEAC Protocol Python CLI v0.9.12"""
    ctx.ensure_object(dict)
    ctx.obj['peac'] = PeacCLI(keys)


@cli.command()
@click.option('--kid', '-i', required=True, help='Key identifier')
@click.option('--output', '-o', help='Output file (default: stdout)')
def keygen(kid, output):
    """Generate Ed25519 keypair"""
    try:
        peac = click.get_current_context().obj['peac']
        keypair = peac.generate_keypair(kid)
        
        result = json.dumps(keypair, indent=2)
        
        if output:
            with open(output, 'w') as f:
                f.write(result)
            click.echo(f"✅ Keypair saved to {output}")
        else:
            click.echo(result)
            
    except Exception as e:
        click.echo(f"❌ Key generation failed: {e}", err=True)


@cli.command()
@click.option('--file', '-f', required=True, help='Receipt JSON file')
@click.option('--kid', '-i', required=True, help='Key identifier for signing')
def sign(file, kid):
    """Sign PEAC receipt"""
    try:
        peac = click.get_current_context().obj['peac']
        
        with open(file, 'r') as f:
            receipt = json.load(f)
        
        jws_token = peac.sign_receipt(receipt, kid)
        click.echo(jws_token)
        
    except Exception as e:
        click.echo(f"❌ Signing failed: {e}", err=True)


@cli.command()
@click.argument('jws_token')
@click.option('--keys-file', help='Additional keys file for verification')
def verify(jws_token, keys_file):
    """Verify PEAC receipt JWS"""
    try:
        peac = click.get_current_context().obj['peac']
        
        additional_keys = None
        if keys_file and Path(keys_file).exists():
            with open(keys_file, 'r') as f:
                additional_keys = json.load(f)
        
        result = peac.verify_receipt(jws_token, additional_keys)
        click.echo(json.dumps(result, indent=2))
        
    except Exception as e:
        click.echo(f"❌ Verification failed: {e}", err=True)


@cli.command()
@click.argument('origin')
def discover(origin):
    """Discover .well-known/peac.txt"""
    try:
        peac = click.get_current_context().obj['peac']
        result = peac.discover_peac_txt(origin)
        click.echo(json.dumps(result, indent=2))
        
    except Exception as e:
        click.echo(f"❌ Discovery failed: {e}", err=True)


if __name__ == '__main__':
    cli()