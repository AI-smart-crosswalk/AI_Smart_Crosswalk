# [LIEL] Makes `python -m unittest discover -s tests` work from backend/ai-service:
# the modules under test (config, tracker, risk_rules, ...) live one folder up.
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
