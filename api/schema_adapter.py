"""
Schema Adapter Layer

This module handles LLM-friendly schema transformations and runtime reconstruction.
It is the ONLY place where schema semantics are modified.

Core Principle:
- LLM sees simplified schemas (easier to reason about)
- Server receives original format (maintains contracts)
- All transformations are config-driven, not hardcoded

Architecture:
    LLM Schema (simplified) ← apply_llm_patches() ← Original MCP Schema
    LLM Arguments → reconstruct_for_server() → Server Arguments
"""

import json
import os
from typing import Dict, Any, Optional, List
from copy import deepcopy

# Load schema configuration
SCHEMA_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "schema_config.json")


class SchemaAdapter:
    """
    Manages schema transformations between LLM-friendly and server-native formats.
    
    This is pure adapter logic — no semantic mapping, just format conversion.
    """
    
    def __init__(self, config_file: str = SCHEMA_CONFIG_FILE):
        self.config = self._load_config(config_file)
        self.patches = self.config.get("patches", {})
        self.global_rules = self.config.get("global_rules", {})
    
    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """Load schema configuration from JSON file"""
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[Schema Adapter] Error loading config: {e}")
                return {"patches": {}, "global_rules": {}}
        return {"patches": {}, "global_rules": {}}
    
    
    def apply_llm_patches(self, tool_name: str, input_schema: Dict[str, Any], server_name: str = None) -> Dict[str, Any]:
        """
        Apply LLM-friendly patches to an MCP tool schema.
        
        This modifies the schema to be more "LLM-ergonomic":
        - Simplifies nested objects to strings
        - Adds helpful descriptions
        - Provides examples
        
        Args:
            tool_name: Name of the tool (e.g., "get_current_weather")
            input_schema: Original MCP JSON Schema
            server_name: Name of the MCP server (for pattern matching)
        
        Returns:
            Modified schema that LLM will see
        """
        # Deep copy to avoid mutating original
        schema = deepcopy(input_schema)
        properties = schema.get("properties", {})
        
        # First, try server patterns (auto-apply to matching servers)
        if server_name:
            server_patterns = self.global_rules.get("server_patterns", {})
            for pattern_name, pattern_config in server_patterns.items():
                if pattern_name.lower() in server_name.lower():
                    # Server matches pattern, apply field rules
                    field_rules = pattern_config.get("field_rules", {})
                    for field_name, rule in field_rules.items():
                        if field_name not in properties:
                            continue
                        
                        # Check if field matches the "when" condition
                        field_schema = properties[field_name]
                        when_condition = rule.get("when", {})
                        
                        if self._matches_condition(field_schema, when_condition):
                            # Apply the simplification
                            if "x-llm-simplify" in rule:
                                self._apply_simplification(tool_name, field_name, field_schema, rule["x-llm-simplify"])
        
        # Then, apply tool-specific patches (overrides)
        if tool_name in self.patches:
            tool_patches = self.patches[tool_name]
            for field_name, field_patch in tool_patches.items():
                if field_name not in properties:
                    continue
                
                # Apply x-llm-simplify annotation
                if "x-llm-simplify" in field_patch:
                    self._apply_simplification(tool_name, field_name, properties[field_name], field_patch["x-llm-simplify"])
                
                # Apply x-llm-hint annotation
                if "x-llm-hint" in field_patch:
                    hint = field_patch["x-llm-hint"]
                    current_desc = properties[field_name].get("description", "")
                    properties[field_name]["description"] = f"{current_desc}. Hint: {hint}".strip()
                
                # Apply x-llm-examples annotation
                if "x-llm-examples" in field_patch:
                    properties[field_name]["examples"] = field_patch["x-llm-examples"]
        
        return schema
    
    def _matches_condition(self, field_schema: Dict[str, Any], condition: Dict[str, Any]) -> bool:
        """Check if a field schema matches a condition"""
        if not condition:
            return True
        
        # Check type
        if "type" in condition:
            if field_schema.get("type") != condition["type"]:
                return False
        
        # Check if field has specific properties  
        if "has_properties" in condition:
            field_props = field_schema.get("properties", {})
            required_props = condition["has_properties"]
            if not all(prop in field_props for prop in required_props):
                return False
        
        return True
    
    def _apply_simplification(self, tool_name: str, field_name: str, field_schema: Dict[str, Any], simplification: Dict[str, Any]) -> None:
        """Apply a simplification rule to a field"""
        original_type = field_schema.get("type")
        
        # Validate transformation
        if original_type == simplification.get("from"):
            print(f"[Schema Adapter] Simplifying {tool_name}.{field_name}: {original_type} → {simplification['to']}")
            
            # Transform the field
            field_schema["type"] = simplification["to"]
            
            # Override description if provided
            if "description" in simplification:
                field_schema["description"] = simplification["description"]
            
            # Add examples if provided
            if "examples" in simplification:
                field_schema["examples"] = simplification["examples"]
            
            # Store reconstruction info as metadata (not visible to LLM)
            field_schema["x-llm-reconstruct"] = simplification.get("reconstruct", {})
    
    def reconstruct_for_server(
        self, 
        tool_name: str, 
        llm_arguments: Dict[str, Any],
        original_schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Reconstruct server-native arguments from LLM-simplified arguments.

        Reconstruction rules come from self.patches (schema_config.json), NOT from
        original_schema.  The parameter is retained so existing call-sites don't break,
        but it is intentionally ignored.

        Args:
            tool_name: Name of the tool
            llm_arguments: Arguments produced by LLM
            original_schema: DEPRECATED / unused — reconstruction rules live in config.

        Returns:
            Arguments in server-native format
        """
        if tool_name not in self.patches:
            return llm_arguments  # No reconstruction needed
        
        
        reconstructed = deepcopy(llm_arguments)
        tool_patches = self.patches[tool_name]
        
        for field_name, field_patch in tool_patches.items():
            if field_name not in reconstructed:
                continue
            
            # Check if this field needs reconstruction
            if "x-llm-simplify" in field_patch:
                simplification = field_patch["x-llm-simplify"]
                reconstruct_rule = simplification.get("reconstruct", {})
                
                if reconstruct_rule and "template" in reconstruct_rule:
                    value = reconstructed[field_name]
                    template = reconstruct_rule["template"]
                    
                    # Apply template transformation
                    if isinstance(template, dict) and "{value}" in str(template):
                        # Replace {value} placeholder with actual value
                        reconstructed_value = self._apply_template(template, value)
                        print(f"[Schema Adapter] Reconstructing {tool_name}.{field_name}: '{value}' → {reconstructed_value}")
                        reconstructed[field_name] = reconstructed_value
        
        return reconstructed
    
    def _apply_template(self, template: Any, value: Any) -> Any:
        """
        Apply a reconstruction template.
        
        Example:
            template = {"city": "{value}"}
            value = "Tokyo"
            result = {"city": "Tokyo"}
        """
        if isinstance(template, dict):
            result = {}
            for k, v in template.items():
                if isinstance(v, str) and "{value}" in v:
                    result[k] = v.replace("{value}", str(value))
                else:
                    result[k] = v
            return result
        elif isinstance(template, str) and "{value}" in template:
            return template.replace("{value}", str(value))
        else:
            return template
    
    def should_strip_null(self) -> bool:
        """Check if null values should be stripped from arguments"""
        return self.global_rules.get("strip_null_values", True)
    
    def get_tool_patches(self, tool_name: str) -> Dict[str, Any]:
        """Get all patches for a specific tool"""
        return self.patches.get(tool_name, {})
    
    def has_patches(self, tool_name: str) -> bool:
        """Check if a tool has any schema patches"""
        return tool_name in self.patches


# Global instance
schema_adapter = SchemaAdapter()


# Convenience functions for backward compatibility
def apply_llm_patches(tool_name: str, input_schema: Dict[str, Any], server_name: str = None) -> Dict[str, Any]:
    """Apply LLM-friendly patches to schema"""
    return schema_adapter.apply_llm_patches(tool_name, input_schema, server_name)


def reconstruct_for_server(
    tool_name: str, 
    llm_arguments: Dict[str, Any],
    original_schema: Dict[str, Any] = None  # kept for compat; unused
) -> Dict[str, Any]:
    """Reconstruct server-native arguments from LLM arguments"""
    return schema_adapter.reconstruct_for_server(tool_name, llm_arguments, original_schema)