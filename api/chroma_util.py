import os
from typing import List
import chromadb
from chromadb.config import Settings
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_community.document_loaders import Docx2txtLoader, UnstructuredHTMLLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
import fitz
from langdetect import detect 

# Load environment variables
load_dotenv()

text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200, length_function=len)
embedding_function = OpenAIEmbeddings(model="text-embedding-3-small")

chroma_host = os.getenv("CHROMA_HOST", "localhost")
chroma_port = os.getenv("CHROMA_PORT", "8001")
collection_name = os.getenv("CHROMA_COLLECTION_NAME", "personal_gpt_collection")

# Initialize ChromaDB HTTP Client
chroma_client = chromadb.HttpClient(host=chroma_host, port=chroma_port)

# Create or get collection
collection = chroma_client.get_or_create_collection(
    name=collection_name,
    metadata={"hnsw:space": "cosine"}
)

# Initialize LangChain vectorstore wrapper
vectorstore = Chroma(
    client=chroma_client,
    collection_name=collection_name,
    embedding_function=embedding_function
)

def extract_text_from_pdf(file_path: str) -> List[Document]:
    """Extracts text from a PDF file using PyMuPDF (fitz) with enhanced metadata."""
    doc = fitz.open(file_path)
    documents = []
    file_name = os.path.basename(file_path)
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()
         
        # Detect sections or headings
        section = extract_sections(page)
        
        # Detect language
        language = detect(text[:200]) if len(text.strip()) > 50 else "unknown"
        
        # Wrap each page's text and metadata in a Document object
        documents.append(Document(
            page_content=text,
            metadata={
                "page": page_num + 1,
                "source": file_name,
                "section": section,
                "language": language
            }
        ))
    
    return documents

def extract_sections(page) -> str:  
    text_blocks = page.get_text("dict").get("blocks", [])
    sections = []
    
    for block in text_blocks:
        if "lines" not in block:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                font_size = span.get("size", 0)
                if text and font_size > 12:  
                    sections.append(text)

    # Deduplicate and return the first few detected sections
    deduplicated = list(dict.fromkeys(sections))
    return ", ".join(deduplicated) if deduplicated else ""

def load_and_split_document(file_path: str) -> List[Document]:
    """Loads and splits a document based on its file type, adding metadata."""
    if file_path.endswith('.pdf'):
        documents = extract_text_from_pdf(file_path)
    elif file_path.endswith('.docx'):
        loader = Docx2txtLoader(file_path)
        documents = loader.load()
    elif file_path.endswith('.html'):
        loader = UnstructuredHTMLLoader(file_path)
        documents = loader.load()
    else:
        raise ValueError(f"Unsupported file type: {file_path}")
    
    result_documents = []
    for document in documents:
        # Split each document and propagate metadata
        chunks = text_splitter.split_text(document.page_content)
        for chunk in chunks:
            result_documents.append(Document(
                page_content=chunk,
                metadata=document.metadata
            ))
    
    return result_documents

def index_document_to_chroma(file_path: str, file_id: int) -> bool:
    try:
        splits = load_and_split_document(file_path)
        
        # Add metadata to each split
        for split in splits:
            split.metadata['file_id'] = file_id
        
        vectorstore.add_documents(splits)
        return True
    except Exception as e:
        print(f"Error indexing document to Chroma: {e}")
        return False

def delete_doc_from_chroma(file_id: int) -> str:
    try:
        # Delete using ChromaDB client based on metadata
        # langchain_chroma currently assumes standard id-based delete or uses the collection directly.
        collection.delete(
            where={"file_id": file_id}
        )
        return f"Successfully deleted vectors with file_id {file_id}."
    except Exception as e:
        return f"Error deleting vectors for file_id {file_id}: {str(e)}"

def show_metadata() -> List[dict]:
    try:
        results = collection.get(limit=5)
        
        metadata_list = []
        if results and results.get("ids"):
            for i, doc_id in enumerate(results["ids"]):
                meta = results["metadatas"][i] if results.get("metadatas") else {}
                metadata_list.append({
                    "vector_id": doc_id,
                    "metadata": meta
                })
            return metadata_list
        else:
            return "No matches found or metadata retrieval failed."
    except Exception as e:
        return f"Error retrieving vector metadata: {str(e)}"
