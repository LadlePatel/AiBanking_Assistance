from langchain_community.document_loaders import Docx2txtLoader, UnstructuredHTMLLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone, ServerlessSpec
from typing import List
from langchain_core.documents import Document
import os
import re
from dotenv import load_dotenv
import fitz
from langdetect import detect 


# Load environment variables
load_dotenv()
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200, length_function=len)
embedding_function = OpenAIEmbeddings(model="text-embedding-3-small")

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Pinecone setup
pc = Pinecone(api_key=PINECONE_API_KEY)

index_name = os.getenv("PINECONE_INDEX_NAME", "personal-gpt-index")
dimension = int(os.getenv("EMBEDDING_DIMENSION", 1536))  # Update based on your embedding dimension

# Function to check if index exists
def index_exists(index_name):
    try:
        pc.describe_index(index_name)
        return True
    except Exception as e:
        if "NotFound" in str(e):
            return False
        raise e

# Create index if it doesn't exist
if not index_exists(index_name):
    pc.create_index(
        name=index_name,
        dimension=dimension,
        metric="cosine",
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1"
        )
    )

index = pc.Index(index_name)
from langchain_pinecone import PineconeVectorStore
vectorstore = PineconeVectorStore(index_name=index_name, embedding=embedding_function)


def extract_text_from_pdf(file_path: str) -> List[Document]:
    """Extracts text from a PDF file using PyMuPDF (fitz) with enhanced metadata."""
    doc = fitz.open(file_path)
    documents = []
    file_name = os.path.basename(file_path)  # Get the file name from the file path
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()  # type: ignore # Extracts text from the page
         
        # Detect sections or headings
        section = extract_sections(page)
        
        # Detect language
        language = detect(text[:200])  # Detect language using the first 200 characters
        
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
    text_blocks = page.get_text("dict")["blocks"]
    sections = []
    
    for block in text_blocks:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span["text"].strip()
                font_size = span["size"]
                # Generic Heuristic: Check if the text has a larger font size (likely a header)
                # You can adjust this threshold (e.g., > 12 or > 14) based on your documents
                if text and font_size > 12:  
                    sections.append(text)

    # Deduplicate and return the first few detected sections
    return list(dict.fromkeys(sections)) # type: ignore


def load_and_split_document(file_path: str) -> List[Document]:
    """Loads and splits a document based on its file type, adding metadata."""
    if file_path.endswith('.pdf'):
        # Use PyMuPDF to extract text from the PDF
        documents = extract_text_from_pdf(file_path)
    elif file_path.endswith('.docx'):
        loader = Docx2txtLoader(file_path)
        documents = loader.load()
    elif file_path.endswith('.html'):
        loader = UnstructuredHTMLLoader(file_path)
        documents = loader.load()
    else:
        raise ValueError(f"Unsupported file type: {file_path}")
    
    # Split the loaded documents into chunks, keeping page metadata and source intact
    # We split each page's content individually before applying the text splitter.
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

# Function to index document into Pinecone
def index_document_to_pinecone(file_path: str, file_id: int) -> bool:
    try:
        splits = load_and_split_document(file_path)
        
        # Add metadata to each split (already includes page number and source)
        for split in splits:
            split.metadata['file_id'] = file_id
        
        vectorstore.add_documents(splits)
        # vectorstore.persist()
        return True
    except Exception as e:
        print(f"Error indexing document: {e}")
        return False

# Function to delete document from Pinecone
def delete_doc_from_pinecone(file_id: int) -> bool:
    try:
        # Initialize Pinecone index
        index = pc.Index(index_name)

        # Variables for pagination
        vectors_to_delete = []
        next_token = None
        batch_size = 1000  # You can adjust this depending on how many vectors you have

        while True:
            # Query Pinecone to retrieve vectors (dummy query vector)
            query_results = index.query(
                # Dummy vector (doesn't matter for this case)
                vector=[0] * dimension,  # type: ignore
                top_k=batch_size,        # The number of vectors to retrieve per query
                include_metadata=True,   # Include metadata
                cursor=next_token        # Pass the next_token for pagination
            )

            # Check if query results are available
            if query_results and "matches" in query_results:
                # Iterate over the results and filter based on file_id in metadata
                for match in query_results["matches"]:
                    metadata = match.get("metadata", {})
                    if metadata.get("file_id") == file_id:
                        vectors_to_delete.append(match["id"])

                # If there are more results, update the next_token for pagination
                next_token = query_results.get("next_page_token", None)

                # If there's no next_token, we've fetched all the vectors
                if not next_token:
                    break
            else:
                return "No vectors found or metadata retrieval failed." # type: ignore

        # After gathering all vectors to delete, perform the deletion
        if vectors_to_delete:
            # Delete the vectors from Pinecone
            index.delete(ids=vectors_to_delete)
            return f"Successfully deleted {len(vectors_to_delete)} vectors with file_id {file_id}." # type: ignore
        else:
            return f"No vectors found with file_id {file_id}." # type: ignore
    except Exception as e:
        return f"Error deleting vectors for file_id {file_id}: {str(e)}" # type: ignore

# Function to show metadata of all vectors in the index
def show_metadata() -> List[dict]:
    try:
        # Retrieve the first few vectors in the index to inspect the metadata
        query_results = index.query(
            # You can use any vector for the query, or a random one # type: ignore
            vector=[0] * dimension,  # type: ignore
            top_k=5,  # Adjust the number of vectors to retrieve
            include_metadata=True
        )

        if query_results and "matches" in query_results:
            metadata = []
            for match in query_results["matches"]:
                vector_id = match["id"]
                metadata_dict = match.get("metadata", {})
                metadata.append(
                    {"vector_id": vector_id, "metadata": metadata_dict})
            return metadata
        else:
            return "No matches found or metadata retrieval failed." # type: ignore
    except Exception as e:
        return f"Error retrieving vector metadata: {str(e)}" # type: ignore
