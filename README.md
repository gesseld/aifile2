# AI File Management System

This project includes comprehensive code quality tools and pre-commit hooks for Python and JavaScript/TypeScript development.

## 🛠️ Tools Configured

- **Black**: Python code formatter
- **Flake8**: Python linter
- **Pylint**: Python static analysis
- **ESLint**: JavaScript/TypeScript linter
- **Prettier**: Code formatter for JS/TS/JSON/YAML/MD

## 🚀 Quick Setup

### 1. Install Python Dependencies (Virtual Environment - Recommended)

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python tools
pip install black flake8 pylint

# Deactivate when done
deactivate
```

### 2. Install Node.js Dependencies

```bash
# Install from package.json
npm install

# Or install globally
npm install -g eslint prettier
```

### 3. Install Pre-commit Hooks

```bash
# Install pre-commit hooks
pre-commit install

# Test all hooks
pre-commit run --all-files
```

## 📋 Manual Testing Scripts

### Available Scripts

| Script                       | Description                      | Environment         |
| ---------------------------- | -------------------------------- | ------------------- |
| `./scripts/lint_manual.sh`   | Run all linting tools            | Any (detects venv)  |
| `./scripts/lint_venv.sh`     | Run tools in virtual environment | Virtual environment |
| `./scripts/lint_fix.sh`      | Auto-fix formatting issues       | Any                 |
| `./scripts/lint_fix_venv.sh` | Auto-fix in virtual environment  | Virtual environment |

### Usage Examples

```bash
# Check code quality (any environment)
./scripts/lint_manual.sh

# Check code quality (virtual environment)
./scripts/lint_venv.sh

# Auto-fix formatting issues
./scripts/lint_fix.sh

# Auto-fix in virtual environment
./scripts/lint_fix_venv.sh
```

## 🔧 Pre-commit Hooks

Pre-commit hooks automatically run before each commit to ensure code quality:

- **Black**: Formats Python code
- **Flake8**: Checks Python style and errors
- **Pylint**: Performs static analysis on Python code
- **ESLint**: Lints JavaScript/TypeScript files
- **Prettier**: Formats various file types

### Manual Pre-commit Testing

```bash
# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run black
pre-commit run eslint

# Skip hooks for a commit (not recommended)
git commit --no-verify
```

## 📁 Configuration Files

- `.pre-commit-config.yaml`: Pre-commit hook configuration
- `eslint.config.js`: ESLint configuration (modern flat config)
- `.prettierrc`: Prettier formatting rules
- `package.json`: Node.js dependencies and scripts
- `pytest.ini`: Pytest configuration

## 🎯 Tool-Specific Commands

### Python Tools

```bash
# Black (formatter)
black --check .                    # Check formatting
black .                            # Apply formatting

# Flake8 (linter)
flake8 .                           # Check style

# Pylint (static analysis)
pylint .                           # Analyze code
```

### JavaScript/TypeScript Tools

```bash
# ESLint
eslint .                           # Check for issues
eslint . --fix                     # Fix auto-fixable issues

# Prettier
prettier --check .                 # Check formatting
prettier --write .                 # Apply formatting
```

## 🔍 Troubleshooting

### Missing Tools Error

If you see "Missing tools" errors:

1. **For Python tools**: Use virtual environment or install globally

   ```bash
   # Virtual environment (recommended)
   source venv/bin/activate
   pip install black flake8 pylint

   # Global installation (not recommended)
   pip3 install --user black flake8 pylint
   ```

2. **For Node.js tools**: Install via npm
   ```bash
   npm install  # Uses package.json
   # or
   npm install -g eslint prettier
   ```

### Pre-commit Issues

```bash
# Reinstall hooks
pre-commit uninstall
pre-commit install

# Update hook repositories
pre-commit autoupdate

# Clear cache if needed
pre-commit clean
```

## 📊 Project Structure

```
aifile2/
├── .pre-commit-config.yaml    # Pre-commit configuration
├── eslint.config.js           # ESLint configuration
├── .prettierrc                # Prettier configuration
├── package.json               # Node.js dependencies
├── pytest.ini                # Pytest configuration
├── venv/                      # Python virtual environment
├── scripts/                   # Manual testing scripts
│   ├── lint_manual.sh         # General linting script
│   ├── lint_venv.sh          # Virtual environment linting
│   ├── lint_fix.sh           # Auto-fix script
│   └── lint_fix_venv.sh      # Virtual environment auto-fix
├── backend/                   # Python backend code
├── frontend/                  # Frontend code
└── README.md                  # This file
```

## 🎉 Success!

Your development environment is now configured with:

- ✅ Pre-commit hooks for automatic code quality checks
- ✅ Manual scripts for testing with and without virtual environment
- ✅ Comprehensive linting and formatting for Python and JavaScript
- ✅ Modern ESLint flat configuration
- ✅ Proper tool isolation and dependency management

Happy coding! 🚀
