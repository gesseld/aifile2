#!/bin/bash

# Virtual environment linting script
# Automatically activates venv and runs linting tools

set -e  # Exit on any error

echo "🐍 Virtual Environment Code Quality Checks"
echo "=========================================="

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

# Verify Python tools are installed
print_status "Checking Python tools in virtual environment..."

MISSING_PYTHON_TOOLS=()

if ! python -c "import black" 2>/dev/null; then
    MISSING_PYTHON_TOOLS+=("black")
fi

if ! python -c "import flake8" 2>/dev/null; then
    MISSING_PYTHON_TOOLS+=("flake8")
fi

if ! python -c "import pylint" 2>/dev/null; then
    MISSING_PYTHON_TOOLS+=("pylint")
fi

if [ ${#MISSING_PYTHON_TOOLS[@]} -gt 0 ]; then
    print_error "Missing Python tools in venv: ${MISSING_PYTHON_TOOLS[*]}"
    echo ""
    echo "Install them with:"
    echo "  pip install ${MISSING_PYTHON_TOOLS[*]}"
    deactivate
    exit 1
fi

# Check Node.js tools (global)
MISSING_NODE_TOOLS=()

if ! command -v eslint >/dev/null 2>&1; then
    MISSING_NODE_TOOLS+=("eslint")
fi

if ! command -v prettier >/dev/null 2>&1; then
    MISSING_NODE_TOOLS+=("prettier")
fi

if [ ${#MISSING_NODE_TOOLS[@]} -gt 0 ]; then
    print_error "Missing Node.js tools: ${MISSING_NODE_TOOLS[*]}"
    echo ""
    echo "Install them with:"
    echo "  npm install  # (if package.json exists)"
    echo "  # or globally:"
    echo "  npm install -g ${MISSING_NODE_TOOLS[*]}"
    deactivate
    exit 1
fi

print_success "All required tools are available"
echo ""

# Function to run a linting tool
run_linter() {
    local tool_name="$1"
    local command="$2"

    print_status "Running $tool_name..."

    if eval "$command"; then
        print_success "$tool_name passed"
        return 0
    else
        print_error "$tool_name failed"
        return 1
    fi
}

# Initialize counters
PASSED=0
FAILED=0

# Run Python tools (using venv)
if run_linter "Black" "black --check --diff --exclude '(venv|\.venv|node_modules)' ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

if run_linter "Flake8" "flake8 --exclude venv,node_modules,.venv --max-line-length=88 --extend-ignore=E203,W503 ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

if run_linter "Pylint" "pylint --ignore=venv,node_modules,.venv --max-line-length=88 --disable=C0114,C0115,C0116 ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Run Node.js tools (global)
if run_linter "ESLint" "eslint . --config ./eslint.config.js"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

if run_linter "Prettier" "prettier --check '**/*.{js,jsx,ts,tsx,json,md,yaml,yml,css,scss,html}' --ignore-path .gitignore"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Deactivate virtual environment
print_status "Deactivating virtual environment..."
deactivate

# Summary
echo "=========================================="
echo "📊 Summary:"
print_success "Passed: $PASSED"
if [ $FAILED -gt 0 ]; then
    print_error "Failed: $FAILED"
    echo ""
    echo "💡 To fix formatting issues automatically:"
    echo "  ./scripts/lint_fix_venv.sh"
    exit 1
else
    print_success "All checks passed! 🎉"
fi
