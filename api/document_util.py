import json
import os
from datetime import datetime
from typing import Optional, List, Dict
import logging

# Path to the JSON file that stores document metadata
DOCUMENTS_FILE = os.path.join(os.path.dirname(__file__), "documents.json")


def _load_documents() -> List[Dict]:
    """Load documents from JSON file."""
    if not os.path.exists(DOCUMENTS_FILE):
        return []
    
    try:
        with open(DOCUMENTS_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        logging.warning("Could not load documents file, starting fresh")
        return []


def _save_documents(documents: List[Dict]) -> None:
    """Save documents to JSON file."""
    try:
        with open(DOCUMENTS_FILE, 'w') as f:
            json.dump(documents, f, indent=2)
    except Exception as e:
        logging.error(f"Error saving documents: {e}")
        raise


def insert_document_record(filename: str) -> int:
    """
    Inserts a new document record.
    Returns the generated file_id.
    """
    documents = _load_documents()
    
    # Generate new ID (max existing ID + 1, or 1 if no documents)
    file_id = max([doc.get('id', 0) for doc in documents], default=0) + 1
    
    new_document = {
        'id': file_id,
        'filename': filename,
        'upload_timestamp': datetime.now().isoformat()
    }
    
    documents.append(new_document)
    _save_documents(documents)
    
    logging.info(f"Inserted document: {filename} with ID: {file_id}")
    return file_id


def delete_document_record(file_id: int) -> bool:
    """Deletes a document record by file_id."""
    documents = _load_documents()
    
    # Filter out the document with the given ID
    updated_documents = [doc for doc in documents if doc.get('id') != file_id]
    
    if len(updated_documents) == len(documents):
        logging.warning(f"Document with ID {file_id} not found")
        return False
    
    _save_documents(updated_documents)
    logging.info(f"Deleted document with ID: {file_id}")
    return True


def get_document_by_filename(filename: str) -> Optional[Dict]:
    """Retrieves a document by its filename."""
    documents = _load_documents()
    
    for doc in documents:
        if doc.get('filename') == filename:
            return doc
    
    return None


def get_all_documents() -> List[Dict]:
    """Retrieves all documents, sorted by upload timestamp (newest first)."""
    documents = _load_documents()
    
    # Sort by timestamp in descending order
    documents.sort(key=lambda x: x.get('upload_timestamp', ''), reverse=True)
    
    return documents


def create_document_store():
    """
    Initialize the document store (create the JSON file if it doesn't exist).
    This keeps compatibility with the old SQL version.
    """
    if not os.path.exists(DOCUMENTS_FILE):
        _save_documents([])
        logging.info("Created documents.json file")


# Initialize the document store
create_document_store()
