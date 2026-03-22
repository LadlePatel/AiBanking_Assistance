import asyncio
import os
import sys
from mcp.server.fastmcp import FastMCP
from typing import List, Optional
import hashlib

def hash_password(password: str) -> str:
    """Simple SHA256 hashing for demo purposes."""
    return hashlib.sha256(password.encode()).hexdigest()

# Add parent dir to path so we can import database models properly if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import init_db, SessionLocal
from models import User, Account, Transaction

# IMPORTANT: Run this once to create the tables
init_db()

mcp = FastMCP("Banking-API")

@mcp.tool()
def get_user_accounts(username: str, password: str) -> str:
    """Get all accounts and their balances for a specific user. Requires password authentication."""
    from sqlalchemy import func
    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            return f"Error: User '{username}' not found. Please check spelling."
            
        if user.password_hash != hash_password(password):
            return "Error: Authentication failed. Invalid password."
            
        if not user.accounts:
            return f"User '{username}' has no active accounts."
            
        accounts_info = [f"Account {acc.account_number}: ${acc.balance:.2f}" for acc in user.accounts]
        return "\\n".join(accounts_info)
    finally:
        db.close()

@mcp.tool()
def create_transaction(username: str, password: str, from_account_number: str, to_account_number: str, amount: float, description: str = "Transfer") -> str:
    """Create a transfer transaction between two accounts. Requires password authentication."""
    db = SessionLocal()
    try:
        if amount <= 0:
            return "Error: Transfer amount must be greater than zero."
            
        from sqlalchemy import func
        # Verify user and password
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            return f"Error: User '{username}' not found."
            
        if user.password_hash != hash_password(password):
            return "Error: Authentication failed. Invalid password."
            
        from_acc = db.query(Account).filter(Account.account_number == from_account_number).first()
        if not from_acc:
            return f"Error: Source account '{from_account_number}' not found."
            
        if from_acc.user_id != user.id:
            return f"Error: Account '{from_account_number}' does not belong to user '{username}'."
            
        # Verify sufficient funds
        if from_acc.balance < amount:
            return f"Error: Insufficient funds. Account balance is ${from_acc.balance:.2f}."
            
        # Get target account
        to_acc = db.query(Account).filter(Account.account_number == to_account_number).first()
        if not to_acc:
            return f"Error: Destination account '{to_account_number}' not found."
            
        # Execute transfer
        from_acc.balance -= amount
        to_acc.balance += amount
        
        # Record transaction
        tx = Transaction(
            from_account_id=from_acc.id,
            to_account_id=to_acc.id,
            amount=amount,
            Type="transfer",
            status="completed",
            description=description
        )
        db.add(tx)
        db.commit()
        
        return f"Successfully transferred ${amount:.2f} from {from_account_number} to {to_account_number}. New balance for {from_account_number} is ${from_acc.balance:.2f}."
    except Exception as e:
        db.rollback()
        return f"Error creating transaction: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def get_recent_transactions(username: str, password: str, account_number: str, limit: int = 5) -> str:
    """Get the most recent transactions for a specific account. Requires password authentication."""
    from sqlalchemy import func
    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.username) == username.lower()).first()
        if not user:
            return f"Error: User '{username}' not found."
            
        if user.password_hash != hash_password(password):
            return "Error: Authentication failed. Invalid password."
            
        acc = db.query(Account).filter(Account.account_number == account_number).first()
        if not acc:
            return f"Error: Account '{account_number}' not found."
            
        if acc.user_id != user.id:
            return f"Error: Account '{account_number}' does not belong to user '{username}'."
            
        # Get transactions where this account is either sender or receiver
        transactions = db.query(Transaction).filter(
            (Transaction.from_account_id == acc.id) | (Transaction.to_account_id == acc.id)
        ).order_by(Transaction.timestamp.desc()).limit(limit).all()
        
        if not transactions:
            return f"No recent transactions found for account {account_number}."
            
        result = []
        for tx in transactions:
            if tx.from_account_id == acc.id:
                # Withdrawing/Sending
                target_acc = db.query(Account).filter(Account.id == tx.to_account_id).first()
                target_number = target_acc.account_number if target_acc else "Unknown"
                result.append(f"[{tx.timestamp.strftime('%Y-%m-%d %H:%M')}] SENT ${tx.amount:.2f} to {target_number} (Status: {tx.status}) - {tx.description}")
            else:
                # Depositing/Receiving
                source_acc = db.query(Account).filter(Account.id == tx.from_account_id).first()
                source_number = source_acc.account_number if source_acc else "Unknown"
                result.append(f"[{tx.timestamp.strftime('%Y-%m-%d %H:%M')}] RECEIVED ${tx.amount:.2f} from {source_number} (Status: {tx.status}) - {tx.description}")
                
        return "\\n".join(result)
    finally:
        db.close()

@mcp.tool()
def setup_dummy_bank_data() -> str:
    """Sets up some dummy users and accounts for testing the banking assistant."""
    db = SessionLocal()
    try:
        # Check if dummy data exists
        if db.query(User).filter(User.username == "johndoe").first():
            return "Dummy data already exists."
            
        # Create users
        user1 = User(username="johndoe", password_hash=hash_password("password123"))
        user2 = User(username="janedoe", password_hash=hash_password("password456"))
        db.add_all([user1, user2])
        db.commit()
        
        # Create accounts
        acc1 = Account(user_id=user1.id, account_number="CHK-1001", balance=5000.0)
        acc2 = Account(user_id=user1.id, account_number="SAV-1002", balance=25000.0)
        acc3 = Account(user_id=user2.id, account_number="CHK-2001", balance=1200.0)
        db.add_all([acc1, acc2, acc3])
        db.commit()
        
        return "Successfully created dummy users (johndoe, janedoe) and accounts (CHK-1001, SAV-1002, CHK-2001)."
    except Exception as e:
        db.rollback()
        return f"Error setting up dummy data: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def create_user_account(username: str, password: str, account_number: str, initial_deposit: float = 0.0) -> str:
    """Create a new bank account for an existing or new user. Must provide a password if creating a new user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            # Create user if it doesn't exist
            user = User(username=username, password_hash=hash_password(password))
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Verify password for existing user
            if user.password_hash != hash_password(password):
                return "Error: Authentication failed for existing user. Invalid password."
            
        # Check if account number already exists
        existing_acc = db.query(Account).filter(Account.account_number == account_number).first()
        if existing_acc:
            return f"Error: Account number '{account_number}' is already in use."
            
        new_account = Account(user_id=user.id, account_number=account_number, balance=initial_deposit)
        db.add(new_account)
        db.commit()
        
        return f"Successfully created new account '{account_number}' for user '{username}' with initial balance ${initial_deposit:.2f}."
    except Exception as e:
        db.rollback()
        return f"Error creating account: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def reset_banking_database(admin_key: str) -> str:
    """Drops all tables and recreates the banking database. CAUTION: All data will be lost. Use for demo cleanup."""
    if admin_key != "reset123":
        return "Error: Invalid admin key."
        
    try:
        from database import Base, engine
        Base.metadata.drop_all(bind=engine)
        from database import init_db
        init_db()
        return "Successfully reset banking database. All tables have been dropped and recreated."
    except Exception as e:
        return f"Error resetting database: {str(e)}"

if __name__ == "__main__":
    mcp.run(transport='stdio')
