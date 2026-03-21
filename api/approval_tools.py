"""
Approval-aware tool wrapper for MCP tools.

Creates a callable tool that requests user approval before executing.
"""

import asyncio
from typing import Dict, Any, Callable
from approval_handler import approval_manager


class ApprovalRequiredException(Exception):
    """Raised when a tool requires approval and needs to pause execution"""
    def __init__(self, approval_request: Dict[str, Any]):
        self.approval_request = approval_request
        super().__init__(f"Tool approval required: {approval_request['approval_id']}")


async def create_approval_gated_tool(
    tool_func: Callable,
    tool_name: str,
    tool_description: str,
    server_name: str,
    requires_approval: bool = True
) -> Callable:
    """
    Wraps a tool function with an approval gate.
    
    If requires_approval=True, the tool will:
    1. Create an approval request
    2. Raise ApprovalRequiredException with the request details
    3. Wait for the user's decision
    4. Execute or skip based on decision
    """
    
    async def gated_tool(**kwargs):
        if not requires_approval:
            # Safe tool - execute immediately
            return await tool_func(**kwargs)
        
        # Create approval request
        approval = approval_manager.create_approval_request(
            tool_name=tool_name,
            tool_description=tool_description,
            server_name=server_name,
            arguments=kwargs,
            timeout_seconds=60
        )
        
        # This exception will be caught by the agent and sent to the frontend
        raise ApprovalRequiredException(approval.to_dict())
    
    return gated_tool


async def execute_with_approval(
    approval_id: str,
    tool_func: Callable,
    arguments: Dict[str, Any]
) -> Any:
    """
    Wait for approval and execute the tool if approved.
    
    Returns:
        Tool result if approved, or error message if denied/timeout
    """
    decision = await approval_manager.wait_for_approval(approval_id)
    
    if decision == "approved":
        # Execute the tool
        result = await tool_func(**arguments)
        return {
            "status": "success",
            "result": result
        }
    elif decision == "denied":
        return {
            "status": "denied",
            "message": "Tool execution was denied by user"
        }
    else:  # timeout
        return {
            "status": "timeout",
            "message": "Tool approval request timed out"
        }
