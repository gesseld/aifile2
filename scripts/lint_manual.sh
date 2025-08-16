#!/bin/bash

# Manual linting script - runs all linting tools
# Can be run with or without virtual environment

set -e  # Exit on any error

echo "🔍 Manual Code Quality Checks"
echo "=============================="

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

# Check if we're in a virtual environment
if [ -n "$VIRTUAL_ENV" ]; then
    print_status "Running in virtual environment: $VIRTUAL_ENV"
    PYTHON_CMD="python"
    PIP_CMD="pip"
else
    print_warning "Not running in a virtual environment"
    PYTHON_CMD="python3"
    PIP_CMD="pip3"
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

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

# Check for required tools
print_status "Checking for required tools..."

MISSING_TOOLS=()

if ! command_exists black; then
    MISSING_TOOLS+=("black")
fi

if ! command_exists flake8; then
    MISSING_TOOLS+=("flake8")
fi

if ! command_exists pylint; then
    MISSING_TOOLS+=("pylint")
fi

if ! command_exists eslint; then
    MISSING_TOOLS+=("eslint")
fi

if ! command_exists prettier; then
    MISSING_TOOLS+=("prettier")
fi

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    print_error "Missing tools: ${MISSING_TOOLS[*]}"
    echo ""
    echo "To install missing Python tools:"
    echo "  # In virtual environment (recommended):"
    echo "  source venv/bin/activate"
    echo "  pip install black flake8 pylint"
    echo ""
    echo "  # System-wide (not recommended):"
    echo "  pip3 install --user black flake8 pylint"
    echo ""
    echo "To install missing Node.js tools:"
    echo "  npm install  # (if package.json exists)"
    echo "  # or globally:"
    echo "  npm install -g eslint prettier"
    exit 1
fi

print_success "All required tools are available"
echo ""

# Initialize counters
PASSED=0
FAILED=0

# Run Black (Python formatter)
if run_linter "Black" "black --check --diff --exclude '(venv|\.venv|node_modules)' ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Run Flake8 (Python linter)
if run_linter "Flake8" "flake8 --exclude venv,node_modules,.venv --max-line-length=88 --extend-ignore=E203,W503 ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Run Pylint (Python linter)
if run_linter "Pylint" "pylint --ignore=venv,node_modules,.venv --max-line-length=88 --disable=C0114,C0115,C0116 ."; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Run ESLint (JavaScript linter)
if run_linter "ESLint" "eslint . --config ./eslint.config.js"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Run Prettier (Code formatter)
if run_linter "Prettier" "prettier --check '**/*.{js,jsx,ts,tsx,json,md,yaml,yml,css,scss,html}' --ignore-path .gitignore"; then
    ((PASSED++))
else
    ((FAILED++))
fi
echo ""

# Summary
echo "=============================="
echo "📊 Summary:"
print_success "Passed: $PASSED"
if [ $FAILED -gt 0 ]; then
    print_error "Failed: $FAILED"
    echo ""
    echo "💡 To fix formatting issues automatically:"
    echo "  ./scripts/lint_fix.sh"
    exit 1
else
    print_success "All checks passed! 🎉"
fi
