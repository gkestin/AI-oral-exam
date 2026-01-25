"""
Firebase Service
================
Firebase Admin SDK initialization and Firestore operations.
"""

import firebase_admin
from firebase_admin import credentials, firestore, auth
from google.cloud.firestore_v1 import AsyncClient
from typing import Optional, TypeVar, Type, Any
from datetime import datetime
import os

from ..config import get_settings
from ..models import FirestoreModel

T = TypeVar("T", bound=FirestoreModel)

# Global Firebase app instance
_firebase_app: Optional[firebase_admin.App] = None
_firestore_client: Optional[AsyncClient] = None


def init_firebase() -> firebase_admin.App:
    """Initialize Firebase Admin SDK."""
    global _firebase_app
    
    if _firebase_app is not None:
        return _firebase_app
    
    settings = get_settings()
    
    # Try to use credentials file if provided
    cred = None
    cred_path = settings.firebase_credentials_path
    
    # Check multiple possible locations
    possible_paths = [
        cred_path,
        "serviceAccountKey.json",
        "../serviceAccountKey.json",
        os.path.join(os.path.dirname(__file__), "../../../serviceAccountKey.json"),
    ]
    
    for path in possible_paths:
        if path and os.path.exists(path):
            cred = credentials.Certificate(path)
            print(f"✅ Using Firebase credentials from: {path}")
            break
    
    if cred is None:
        # Try Application Default Credentials (for GCP deployment)
        try:
            cred = credentials.ApplicationDefault()
            print("✅ Using Application Default Credentials")
        except Exception as e:
            print("=" * 60)
            print("⚠️  FIREBASE CREDENTIALS NOT FOUND")
            print("=" * 60)
            print("To fix this:")
            print("1. Go to Firebase Console → Project Settings → Service Accounts")
            print("2. Click 'Generate New Private Key'")
            print("3. Save the file as 'serviceAccountKey.json' in the backend folder")
            print("=" * 60)
            raise Exception(
                "Firebase credentials not found. Please download a service account key "
                "from Firebase Console and save it as 'serviceAccountKey.json'"
            ) from e
    
    _firebase_app = firebase_admin.initialize_app(cred, {
        "projectId": settings.firebase_project_id,
    })
    
    return _firebase_app


def get_firestore() -> firestore.client:
    """Get Firestore client (sync version for simple operations)."""
    init_firebase()
    return firestore.client()


def get_auth():
    """Get Firebase Auth instance."""
    init_firebase()
    return auth


class FirestoreService:
    """Generic Firestore CRUD operations."""
    
    def __init__(self):
        self.db = get_firestore()
    
    # ==================== GENERIC CRUD ====================
    
    async def get_document(
        self, 
        collection: str, 
        doc_id: str, 
        model_class: Type[T]
    ) -> Optional[T]:
        """Get a single document by ID."""
        doc_ref = self.db.collection(collection).document(doc_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            return None
        
        return model_class.from_firestore(doc.id, doc.to_dict())
    
    async def list_documents(
        self,
        collection: str,
        model_class: Type[T],
        filters: Optional[list[tuple]] = None,
        order_by: Optional[str] = None,
        order_desc: bool = False,
        limit: Optional[int] = None,
    ) -> list[T]:
        """List documents with optional filtering."""
        query = self.db.collection(collection)
        
        if filters:
            for field, op, value in filters:
                query = query.where(field, op, value)
        
        if order_by:
            direction = firestore.Query.DESCENDING if order_desc else firestore.Query.ASCENDING
            query = query.order_by(order_by, direction=direction)
        
        if limit:
            query = query.limit(limit)
        
        docs = query.stream()
        return [model_class.from_firestore(doc.id, doc.to_dict()) for doc in docs]
    
    async def create_document(
        self,
        collection: str,
        data: FirestoreModel,
        doc_id: Optional[str] = None,
    ) -> str:
        """Create a new document. Returns document ID."""
        doc_data = data.to_firestore()
        doc_data["created_at"] = datetime.utcnow()
        
        if doc_id:
            doc_ref = self.db.collection(collection).document(doc_id)
            doc_ref.set(doc_data)
            return doc_id
        else:
            doc_ref = self.db.collection(collection).add(doc_data)
            return doc_ref[1].id
    
    async def update_document(
        self,
        collection: str,
        doc_id: str,
        data: dict,
    ) -> bool:
        """Update an existing document. Returns True if successful."""
        doc_ref = self.db.collection(collection).document(doc_id)
        
        # Check if document exists
        if not doc_ref.get().exists:
            return False
        
        data["updated_at"] = datetime.utcnow()
        doc_ref.update(data)
        return True
    
    async def delete_document(
        self,
        collection: str,
        doc_id: str,
    ) -> bool:
        """Delete a document. Returns True if successful."""
        doc_ref = self.db.collection(collection).document(doc_id)
        
        if not doc_ref.get().exists:
            return False
        
        doc_ref.delete()
        return True
    
    # ==================== NESTED COLLECTIONS ====================
    
    async def get_subcollection_document(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        doc_id: str,
        model_class: Type[T],
    ) -> Optional[T]:
        """Get a document from a subcollection."""
        doc_ref = (
            self.db.collection(parent_collection)
            .document(parent_id)
            .collection(subcollection)
            .document(doc_id)
        )
        doc = doc_ref.get()
        
        if not doc.exists:
            return None
        
        return model_class.from_firestore(doc.id, doc.to_dict())
    
    async def list_subcollection(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        model_class: Type[T],
        filters: Optional[list[tuple]] = None,
        order_by: Optional[str] = None,
        order_desc: bool = False,
        limit: Optional[int] = None,
    ) -> list[T]:
        """List documents in a subcollection."""
        query = (
            self.db.collection(parent_collection)
            .document(parent_id)
            .collection(subcollection)
        )
        
        if filters:
            for field, op, value in filters:
                query = query.where(field, op, value)
        
        if order_by:
            direction = firestore.Query.DESCENDING if order_desc else firestore.Query.ASCENDING
            query = query.order_by(order_by, direction=direction)
        
        if limit:
            query = query.limit(limit)
        
        docs = query.stream()
        return [model_class.from_firestore(doc.id, doc.to_dict()) for doc in docs]
    
    async def create_subcollection_document(
        self,
        parent_collection: str,
        parent_id: str,
        subcollection: str,
        data: FirestoreModel,
        doc_id: Optional[str] = None,
    ) -> str:
        """Create a document in a subcollection."""
        doc_data = data.to_firestore()
        doc_data["created_at"] = datetime.utcnow()
        
        subcol_ref = (
            self.db.collection(parent_collection)
            .document(parent_id)
            .collection(subcollection)
        )
        
        if doc_id:
            doc_ref = subcol_ref.document(doc_id)
            doc_ref.set(doc_data)
            return doc_id
        else:
            doc_ref = subcol_ref.add(doc_data)
            return doc_ref[1].id
    
    # ==================== BATCH OPERATIONS ====================
    
    async def batch_write(self, operations: list[dict]) -> bool:
        """Execute multiple write operations atomically.
        
        operations: list of dicts with keys:
            - action: "set" | "update" | "delete"
            - collection: collection path
            - doc_id: document ID
            - data: document data (for set/update)
        """
        batch = self.db.batch()
        
        for op in operations:
            doc_ref = self.db.collection(op["collection"]).document(op["doc_id"])
            
            if op["action"] == "set":
                batch.set(doc_ref, op["data"])
            elif op["action"] == "update":
                batch.update(doc_ref, op["data"])
            elif op["action"] == "delete":
                batch.delete(doc_ref)
        
        batch.commit()
        return True


# Singleton instance
_firestore_service: Optional[FirestoreService] = None


def get_firestore_service() -> FirestoreService:
    """Get singleton FirestoreService instance."""
    global _firestore_service
    if _firestore_service is None:
        _firestore_service = FirestoreService()
    return _firestore_service
