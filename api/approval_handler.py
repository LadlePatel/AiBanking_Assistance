"""
Tool Approval Handler

Manages pending tool approvals and user responses for the approval system.
This acts as the runtime control layer between agent tool intents and actual execution.
"""

import uuid
import asyncio
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field


class ApprovalRequest:
    """Represents a pending tool approval request"""
    
    def __init__(self, approval_id: str, tool_name: str, tool_description: str, 
                 server_name: str, arguments: Dict[str, Any], timeout_seconds: int = 60,
                 request_context: Dict[str, Any] = None, tool_func: Any = None):
        self.approval_id = approval_id
        self.tool_name = tool_name
        self.tool_description = tool_description
        self.server_name = server_name
        self.arguments = arguments
        self.timestamp = datetime.now()
        self.timeout_seconds = timeout_seconds
        self.decision: Optional[str] = None
        self.decision_event: asyncio.Event = asyncio.Event()
        self.request_context = request_context or {}  # Store original request for re-execution
        self.tool_func = tool_func  # Store the actual tool function for direct execution
    
    def is_expired(self) -> bool:
        """Check if approval request has timed out"""
        return datetime.now() > self.timestamp + timedelta(seconds=self.timeout_seconds)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response"""
        return {
            "type": "tool_approval_request",
            "approval_id": self.approval_id,
            "tool": {
                "name": self.tool_name,
                "description": self.tool_description,
                "server": self.server_name,
            },
            "arguments": self.arguments,
            "timestamp": self.timestamp.isoformat(),
            "timeout_seconds": self.timeout_seconds,
            "request_context": self.request_context
        }


class ApprovalManager:
    """Singleton manager for pending tool approvals"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._pending: Dict[str, ApprovalRequest] = {} # Corrected type hint
        self.pending_approvals = self._pending  # Alias for easier access
        # Removed: approved_tools set - each approval is unique and tied to single execution (Priority 3)
        self._initialized = True
    
    def create_approval_request(
        self,
        tool_name: str,
        tool_description: str,
        server_name: str,
        arguments: Dict[str, Any], # Kept original type hint
        timeout_seconds: int = 60,
        request_context: Dict[str, Any] = None, # Added parameter
        tool_func: Any = None  # Add tool function reference
    ) -> ApprovalRequest: # Corrected return type hint
        """Create a new approval request"""
        approval_id = str(uuid.uuid4())
        approval = ApprovalRequest(
            approval_id=approval_id,
            tool_name=tool_name,
            tool_description=tool_description,
            server_name=server_name,
            arguments=arguments,
            # timestamp=datetime.now(), # Removed as it's set in ApprovalRequest.__init__
            timeout_seconds=timeout_seconds,
            request_context=request_context, # Passed new parameter
            tool_func=tool_func  # Pass the tool function
        )
        self._pending[approval_id] = approval
        return approval
    
    async def wait_for_approval(self, approval_id: str) -> str:
        """
        Wait for user approval decision.
        Returns: "approved", "denied", or "timeout"

        NOTE: This method is NOT used by the current HTTP-based approve/deny flow.
        The flow is:  tool raises ApprovalRequiredException
                     →  /chat returns approval_request to frontend
                     →  frontend calls /tool/approve or /tool/deny directly.
        This method is kept for potential future use (e.g. WebSocket-based flow).
        """ 
        if approval_id not in self._pending:
            raise ValueError(f"Unknown approval_id: {approval_id}")
        
        approval = self._pending[approval_id]
        
        try:
            # Wait for decision with timeout
            await asyncio.wait_for(
                approval.decision_event.wait(),
                timeout=approval.timeout_seconds
            )
            decision = approval.decision or "denied"
        except asyncio.TimeoutError:
            decision = "timeout"
            approval.decision = "timeout"
        finally:
            # Cleanup
            del self._pending[approval_id]
        
        return decision
    
    def set_approval_decision(self, approval_id: str, decision: str) -> bool:
        """
        Set the user's approval decision.
        Returns True if successful, False if not found.
        """
        if approval_id not in self._pending:
            return False
        
        approval = self._pending[approval_id]
        approval.decision = decision
        approval.decision_event.set()
        
        # Removed: approved_tools bypass - each approval is unique (Priority 3)
        
        return True
    
    def get_pending_approval(self, approval_id: str) -> Optional[ApprovalRequest]:
        """Get a pending approval by ID"""
        return self._pending.get(approval_id)
    
    def cleanup_expired(self):
        """Remove expired approval requests"""
        expired_ids = [
            approval_id for approval_id, approval in self._pending.items()
            if approval.is_expired()
        ]
        for approval_id in expired_ids:
            approval = self._pending.pop(approval_id, None)
            if approval:
                approval.decision = "timeout"
                approval.decision_event.set()



# Global instance
approval_manager = ApprovalManager()