from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    
    accounts = relationship("Account", back_populates="owner")

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_number = Column(String, unique=True, index=True, nullable=False)
    balance = Column(Float, default=0.0)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="accounts")
    
    transactions_sent = relationship("Transaction", foreign_keys='Transaction.from_account_id', back_populates="from_account")
    transactions_received = relationship("Transaction", foreign_keys='Transaction.to_account_id', back_populates="to_account")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    from_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True) # None for deposits
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True) # None for withdrawals
    amount = Column(Float, nullable=False)
    Type = Column(String, nullable=False) # e.g., 'transfer', 'deposit', 'withdrawal'
    status = Column(String, default="completed")
    timestamp = Column(DateTime, default=datetime.utcnow)
    description = Column(String, nullable=True)

    from_account = relationship("Account", foreign_keys=[from_account_id], back_populates="transactions_sent")
    to_account = relationship("Account", foreign_keys=[to_account_id], back_populates="transactions_received")
