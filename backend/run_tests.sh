#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python test_all_apis.py
