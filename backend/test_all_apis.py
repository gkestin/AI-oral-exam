#!/usr/bin/env python3
"""
Comprehensive API Tests
=======================
Tests all backend API endpoints.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

# Track results
results = []

def log(msg):
    print(msg)

def test(name, passed, details=""):
    status = "✓" if passed else "✗"
    results.append((name, passed))
    log(f"  {status} {name}" + (f" - {details}" if details else ""))

def get(endpoint, expected_status=200, auth=None):
    """Make GET request."""
    headers = {"Authorization": f"Bearer {auth}"} if auth else {}
    try:
        resp = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=5)
        return resp
    except Exception as e:
        return None

def post(endpoint, data=None, expected_status=200, auth=None):
    """Make POST request."""
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    try:
        resp = requests.post(f"{BASE_URL}{endpoint}", json=data, headers=headers, timeout=5)
        return resp
    except Exception as e:
        return None

# ==================== TESTS ====================

def test_health_endpoints():
    """Test basic health endpoints."""
    log("\n[Health Endpoints]")
    
    resp = get("/health")
    test("GET /health", resp is not None and resp.status_code == 200, 
         f"status={resp.status_code if resp is not None else 'error'}")
    
    resp = get("/")
    test("GET /", resp is not None and resp.status_code == 200)
    
    resp = get("/api")
    test("GET /api", resp is not None and resp.status_code == 200)

def test_auth_required():
    """Test that protected endpoints require auth."""
    log("\n[Auth Required]")
    
    # Courses - expect 401 Unauthorized for missing auth
    resp = get("/api/courses")
    test("GET /api/courses (no auth)", resp is not None and resp.status_code == 401,
         f"status={resp.status_code if resp is not None else 'error'}")
    
    resp = post("/api/courses", {"name": "Test"})
    test("POST /api/courses (no auth)", resp is not None and resp.status_code == 401)
    
    # Sessions (with fake course_id)
    resp = get("/api/courses/fake/sessions")
    test("GET /api/courses/{id}/sessions (no auth)", resp is not None and resp.status_code == 401)
    
    # Assignments
    resp = get("/api/courses/fake/assignments")
    test("GET /api/courses/{id}/assignments (no auth)", resp is not None and resp.status_code == 401)
    
    # Grading
    resp = get("/api/courses/fake/grading/sessions/fake/grades")
    test("GET grading (no auth)", resp is not None and resp.status_code == 401)

def test_validation():
    """Test input validation."""
    log("\n[Input Validation]")
    
    # Invalid JSON - returns 401 (no auth) or 422 (validation error)
    try:
        resp = requests.post(
            f"{BASE_URL}/api/courses",
            data="not json",
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        test("POST with invalid JSON", resp.status_code in [401, 422])
    except:
        test("POST with invalid JSON", False, "request failed")

def test_cors():
    """Test CORS headers."""
    log("\n[CORS]")
    
    try:
        resp = requests.options(
            f"{BASE_URL}/api/courses",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
            timeout=5
        )
        has_cors = "access-control-allow-origin" in resp.headers
        test("OPTIONS /api/courses (CORS preflight)", has_cors,
             f"headers={list(resp.headers.keys())[:3]}...")
    except Exception as e:
        test("OPTIONS /api/courses (CORS preflight)", False, str(e))

def test_404_handling():
    """Test 404 responses."""
    log("\n[404 Handling]")
    
    resp = get("/api/nonexistent")
    test("GET /api/nonexistent", resp is not None and resp.status_code == 404)

def test_model_imports():
    """Test that models import correctly."""
    log("\n[Model Imports]")
    
    try:
        sys.path.insert(0, '.')
        from app.models import UserRole, SessionStatus
        from app.models.base import CamelCaseModel
        test("Import UserRole", True)
        test("Import SessionStatus", True)
        test("Import CamelCaseModel", True)
        
        # Test enum values
        test("UserRole.STUDENT.value", UserRole.STUDENT.value == "student")
        test("SessionStatus.PENDING.value", SessionStatus.PENDING.value == "pending")
        
        # Test custom __eq__
        test("UserRole.STUDENT == 'student'", UserRole.STUDENT == "student")
        test("SessionStatus.GRADED == 'graded'", SessionStatus.GRADED == "graded")
        
    except Exception as e:
        test("Model imports", False, str(e))

def test_router_imports():
    """Test that routers import correctly."""
    log("\n[Router Imports]")
    
    try:
        sys.path.insert(0, '.')
        from app.routers.sessions import is_student, is_status
        
        # Test is_student
        test("is_student('student')", is_student("student") == True)
        test("is_student('instructor')", is_student("instructor") == False)
        
        # Test is_status
        test("is_status('pending', 'pending')", is_status("pending", "pending") == True)
        test("is_status('graded', 'pending')", is_status("graded", "pending") == False)
        
    except Exception as e:
        test("Router imports", False, str(e))

def test_service_imports():
    """Test that services import correctly."""
    log("\n[Service Imports]")
    
    try:
        sys.path.insert(0, '.')
        from app.services import get_firestore_service
        test("Import get_firestore_service", True)
        
        from app.services.llm import grade_with_council
        test("Import grade_with_council", True)
        
    except Exception as e:
        test("Service imports", False, str(e))

# ==================== MAIN ====================

def main():
    print("=" * 60)
    print("Comprehensive API Tests")
    print("=" * 60)
    
    # Run tests
    test_health_endpoints()
    test_auth_required()
    test_validation()
    test_cors()
    test_404_handling()
    test_model_imports()
    test_router_imports()
    test_service_imports()
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, p in results if p)
    total = len(results)
    failed = total - passed
    
    print(f"  Passed: {passed}/{total}")
    print(f"  Failed: {failed}/{total}")
    
    if failed > 0:
        print("\nFailed tests:")
        for name, p in results:
            if not p:
                print(f"  ✗ {name}")
    
    print("=" * 60)
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
