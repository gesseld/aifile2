#!/bin/bash

# Virtual environment auto-fix script
# Automatically activates venv and fixes formatting issues

set -e  # Exit on any error

echo "🐍 Virtual Environment Auto-fix"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    print_error "Virtual environment 'venv' not found!"
    echo ""
    echo "Create it with:"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install black flake8 pylint"
    exit 1
fi

print_status "Activating virtual environment..."
source venv/bin/activate

# Verify tools are available
MISSING_TOOLS=()

if ! python -c "import black" 2>/dev/null; then
    MISSING_TOOLS+=("black")
fi

if ! command -v eslint >/dev/null 2>&1; then
    MISSING_TOOLS+=("eslint")
fi

if ! command -v prettier >/dev/null 2>&1; then
    MISSING_TOOLS+=("prettier")
fi

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    print_error "Missing tools: ${MISSING_TOOLS[*]}"
    deactivate
    exit 1
fi

print_success "All required tools are available"
echo ""

# Function to run a fixer tool
run_fixer() {
    local tool_name="$1"
    local command="$2"
    
    print_status "Running $tool_name..."
    
    if eval "$command"; then
        print_success "$tool_name completed"
        return 0
    else
        print_error "$tool_name failed"
        return 1
    fi
}

# Initialize counters
FIXED=0
FAILED=0

# Run Black (Python formatter) - auto-fix
if run_fixer "Black (auto-format)" "black --exclude '(venv|\.venv|node_modules)' ."; then
    ((FIXED++))
else
    ((FAILED++))
fi
echo ""

# Run ESLint (JavaScript linter) - auto-fix
if run_fixer "ESLint (auto-fix)" "eslint . --config ./eslint.config.js --fix"; then
    ((FIXED++))
else
    ((FAILED++))
fi
echo ""

# Run Prettier (Code formatter) - auto-fix
if run_fixer "Prettier (auto-format)" "prettier --write '**/*.{js,jsx,ts,tsx,json,md,yaml,yml,css,scss,html}' --ignore-path .gitignore"; then
    ((FIXED++))
else
    ((FAILED++))
fi
echo ""

# Deactivate virtual environment
print_status "Deactivating virtual environment..."
deactivate

# Summary
echo "==============================="
echo "📊 Summary:"
print_success "Fixed: $FIXED"
if [ $FAILED -gt 0 ]; then
    print_error "Failed: $FAILED"
    echo ""
    echo "💡 Some issues may require manual intervention."
    echo "   Run ./scripts/lint_venv.sh to see remaining issues."
    exit 1
else
    print_success "All auto-fixes completed! 🎉"
    echo ""
    echo "💡 Run ./scripts/lint_venv.sh to verify all checks pass."
fi