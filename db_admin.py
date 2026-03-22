import os
import sys
import hashlib
from dotenv import load_dotenv

# Add current directory to path so it can import banking_mcp
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv()

from banking_mcp.database import SessionLocal, engine, Base
from banking_mcp.models import User, Account, Transaction

# Ensure tables exist
Base.metadata.create_all(bind=engine)

def hash_password(password: str) -> str:
    """Hashes a plaintext password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(username: str, password: str, session) -> User:
    """Verifies credentials and returns the User object if successful."""
    user = session.query(User).filter(User.username == username).first()
    if not user:
        print(f"❌ Error: User '{username}' not found.")
        return None
        
    pwd_hash = hash_password(password)
    if user.password_hash != pwd_hash:
        print(f"❌ Error: Incorrect password for user '{username}'.")
        return None
        
    return user

def list_all_info(session):
    print("\n=== SYSTEM OVERVIEW ===")
    users = session.query(User).all()
    if not users:
        print("No users in the system.")
        return
        
    for user in users:
        print(f"👤 User: {user.username} (ID: {user.id})")
        for acc in user.accounts:
            print(f"  └─ 🏦 Account: {acc.account_number} | Balance: ${acc.balance:.2f}")

def create_user_account(session):
    print("\n--- Create New User & Account ---")
    username = input("Enter new username: ")
    
    # Check if user exists
    if session.query(User).filter(User.username == username).first():
        print("❌ User already exists!")
        return
        
    password = input("Enter new password: ")
    account_number = input("Enter a unique account number (e.g., 9999): ")
    
    # Check if account exists
    if session.query(Account).filter(Account.account_number == account_number).first():
        print("❌ Account number already taken!")
        return
        
    try:
        initial_deposit = float(input("Enter initial deposit amount: $"))
    except ValueError:
        print("❌ Invalid amount.")
        return
        
    try:
        # Create User
        new_user = User(username=username, password_hash=hash_password(password))
        session.add(new_user)
        session.flush() # get user ID
        
        # Create Account
        new_account = Account(
            account_number=account_number,
            balance=initial_deposit,
            user_id=new_user.id
        )
        session.add(new_account)
        
        # Create Initial Deposit Transaction
        if initial_deposit > 0:
            tx = Transaction(
                to_account_id=new_account.id,
                amount=initial_deposit,
                Type="deposit",
                description="Initial Account Deposit"
            )
            session.add(tx)
            
        session.commit()
        print(f"✅ Successfully created user '{username}' with account '{account_number}' and balance ${initial_deposit:.2f}")
    except Exception as e:
        session.rollback()
        print(f"❌ Database error: {e}")

def check_balance(session):
    print("\n--- Check Account Balance ---")
    username = input("Username: ")
    password = input("Password: ")
    
    user = verify_password(username, password, session)
    if not user:
        return
        
    for acc in user.accounts:
        print(f"💰 Account {acc.account_number} Balance: ${acc.balance:.2f}")

def transfer_money(session):
    print("\n--- Transfer Money ---")
    username = input("Sender Username: ")
    password = input("Sender Password: ")
    
    user = verify_password(username, password, session)
    if not user:
        return
        
    from_account_num = input("From Account Number: ")
    from_account = session.query(Account).filter(Account.account_number == from_account_num, Account.user_id == user.id).first()
    
    if not from_account:
        print(f"❌ You do not own account '{from_account_num}'.")
        return
        
    to_account_num = input("To Account Number: ")
    to_account = session.query(Account).filter(Account.account_number == to_account_num).first()
    
    if not to_account:
        print(f"❌ Destination account '{to_account_num}' not found.")
        return
        
    try:
        amount = float(input("Amount to transfer: $"))
    except ValueError:
        print("❌ Invalid amount.")
        return
        
    if amount <= 0:
        print("❌ Transfer amount must be positive.")
        return
        
    if from_account.balance < amount:
        print(f"❌ Insufficient funds. Current balance: ${from_account.balance:.2f}")
        return
        
    description = input("Transaction description (optional): ")
    
    try:
        # Deduct & Add
        from_account.balance -= amount
        to_account.balance += amount
        
        # Record Transaction
        tx = Transaction(
            from_account_id=from_account.id,
            to_account_id=to_account.id,
            amount=amount,
            Type="transfer",
            description=description or "Manual terminal transfer"
        )
        session.add(tx)
        session.commit()
        
        print(f"✅ Successfully transferred ${amount:.2f} to {to_account_num}. New balance: ${from_account.balance:.2f}")
    except Exception as e:
        session.rollback()
        print(f"❌ Transaction failed: {e}")

def main():
    while True:
        print("\n" + "="*40)
        print("  AI BANKING POSTGRES ADMIN TERMINAL  ")
        print("="*40)
        print("1. List All Users & Accounts (Admin)")
        print("2. Create New User & Account")
        print("3. Check Balance (Requires Auth)")
        print("4. Transfer Money (Requires Auth)")
        print("5. Exit")
        print("="*40)
        
        choice = input("Enter choice (1-5): ")
        
        session = SessionLocal()
        try:
            if choice == '1':
                list_all_info(session)
            elif choice == '2':
                create_user_account(session)
            elif choice == '3':
                check_balance(session)
            elif choice == '4':
                transfer_money(session)
            elif choice == '5':
                print("Exiting...")
                break
            else:
                print("❌ Invalid choice. Please select 1-5.")
        finally:
            session.close()

if __name__ == "__main__":
    main()
