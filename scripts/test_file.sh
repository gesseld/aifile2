#!/bin/bash

# Manual code quality test script
# Runs the same checks as pre-commit hooks but can be executed anytime

echo "Running manual code quality checks..."

# Check if in virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
  echo "Warning: Not running in a virtual environment"
  echo "For system-wide tools, try:"
  echo "  sudo apt install python3-black python3-flake8 python3-pylint"
  echo "  npm install -g eslint prettier"
  echo "Or better, use a virtualenv:"
  echo "  python3 -m venv venv"
  echo "  source venv/bin/activate"
  echo "  pip install black flake8 pylint"
  echo "  npm install -g eslint prettier"
fi

# Check for required tools with helpful messages
check_tool() {
  if ! command -v $1 &> /dev/null; then
    echo "Error: $1 is not installed"
    if [[ $1 == "eslint" || $1 == "prettier" ]]; then
      echo "Install with: npm install -g $1"
    else
      echo "System packages may not be available. Recommended:"
      echo "1. Create virtualenv: python3 -m venv venv"
      echo "2. Activate: source venv/bin/activate"
      echo "3. Install: pip install $1"
      echo ""
      echo "If absolutely necessary, you can try:"
      echo "pip install --break-system-packages $1"
    fi
    exit 1
  fi
}

echo -e "\nChecking required tools..."
check_tool black
check_tool flake8
check_tool eslint
check_tool prettier
check_tool pylint

# Run checks
echo -e "\nRunning Black..."
black --check --exclude venv .

echo -e "\nRunning Flake8..."
flake8 --exclude venv .

echo -e "\nRunning ESLint..."
eslint --config ./eslint.config.js .

echo -e "\nRunning Prettier..."
prettier --check --write "**/*.{js,ts,json,md,yaml,yml}" --ignore-path .gitignore

echo -e "\nRunning Pylint..."
pylint --ignore=venv .

echo -e "\nAll checks completed!"