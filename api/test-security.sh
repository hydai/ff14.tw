#!/bin/bash
# Run local, isolated authorization and CORS regressions. No production API calls.
set -euo pipefail
cd "$(dirname "$0")"
npm test
