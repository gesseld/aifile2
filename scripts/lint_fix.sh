#!/bin/bash

# Auto-fix script - automatically fixes formatting issues
# Can be run with or without virtual environment

set -e  # Exit on any error

echo "🔧 Auto-fixing Code Quality Issues"
echo "=================================="

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
else
    print_warning "Not running in a virtual environment"
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

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

# Check for required tools
print_status "Checking for required tools..."

MISSING_TOOLS=()

if ! command_exists black; then
    MISSING_TOOLS+=("black")
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
    echo "  source venv/bin/activate && pip install black"
    echo ""
    echo "To install missing Node.js tools:"
    echo "  npm install  # (if package.json exists)"
    exit 1
fi

print_success "All required tools are available"
echo ""

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

# Summary
echo "=================================="
echo "📊 Summary:"
print_success "Fixed: $FIXED"
if [ $FAILED -gt 0 ]; then
    print_error "Failed: $FAILED"
    echo ""
    echo "💡 Some issues may require manual intervention."
    echo "   Run ./scripts/lint_manual.sh to see remaining issues."
    exit 1
else
    print_success "All auto-fixes completed! 🎉"
    echo ""
    echo "💡 Run ./scripts/lint_manual.sh to verify all checks pass."
fi